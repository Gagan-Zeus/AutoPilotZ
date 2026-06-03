import type {
  AiFieldMappingResult,
  AiMappingBatchField,
  AiMappingBatchRequest,
  AiMappingModelResult,
  AiMappingRequest,
  ProfilePathDescriptor,
} from '../../core/entities/AiMapping';
import type { NormalizedFormField } from '../../core/entities/FormExtraction';
import type { ProfileData, VaultProfile } from '../../core/entities/Profile';
import type { AiMappingCache } from '../../core/ports/AiMappingCache';
import type { AiMappingClient } from '../../core/ports/AiMappingClient';
import { sanitizeUntrustedText } from '../../core/security/UntrustedText';
import { AiMappingPromptBuilder } from './AiMappingPromptBuilder';
import { InMemoryAiMappingCache } from './InMemoryAiMappingCache';

export interface AiMappingEngineOptions {
  batchSize: number;
  maxRetries: number;
  minConfidence: number;
  retryBaseDelayMs: number;
}

const defaultOptions: AiMappingEngineOptions = {
  batchSize: 8,
  maxRetries: 2,
  minConfidence: 0.9,
  retryBaseDelayMs: 100,
};

export class AiMappingEngine {
  private readonly cache: AiMappingCache;

  constructor(
    private readonly client: AiMappingClient,
    cache?: AiMappingCache,
    private readonly options: Partial<AiMappingEngineOptions> = {},
    private readonly promptBuilder = new AiMappingPromptBuilder(),
  ) {
    this.cache = cache ?? new InMemoryAiMappingCache();
  }

  async map(request: AiMappingRequest): Promise<AiFieldMappingResult[]> {
    const options = { ...defaultOptions, ...this.options };
    const minConfidence = request.minConfidence ?? options.minConfidence;
    const profileData = this.profileData(request.profile);
    const profilePaths = this.extractProfilePaths(profileData);
    const profilePathSet = new Set(profilePaths.map((descriptor) => descriptor.path));
    const batches = this.chunk(request.fields, options.batchSize);
    const results: AiFieldMappingResult[] = [];

    for (const batch of batches) {
      const cacheKey = this.cacheKey(batch, profilePaths, minConfidence);
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        results.push(...cached);
        continue;
      }

      const batchRequest: AiMappingBatchRequest = {
        fields: batch.map((field) => this.toBatchField(field)),
        profilePaths,
        prompt: '',
      };
      batchRequest.prompt = this.promptBuilder.build(batchRequest);
      const modelResults = await this.withRetry(
        () => this.client.mapFields(batchRequest),
        options.maxRetries,
        options.retryBaseDelayMs,
      );
      const validated = this.validateBatchResults(
        batch,
        modelResults,
        profilePathSet,
        minConfidence,
      );
      await this.cache.set(cacheKey, validated);
      results.push(...validated);
    }

    return results;
  }

  private validateBatchResults(
    fields: NormalizedFormField[],
    modelResults: AiMappingModelResult[],
    profilePathSet: Set<string>,
    minConfidence: number,
  ): AiFieldMappingResult[] {
    const byFieldId = new Map(modelResults.map((result) => [result.fieldId, result]));

    return fields.map((field) => {
      const result = byFieldId.get(field.fieldId);
      if (!result || !result.profilePath) {
        return null;
      }

      if (!profilePathSet.has(result.profilePath)) {
        return null;
      }

      if (!Number.isFinite(result.confidence) || result.confidence < minConfidence) {
        return null;
      }

      return {
        fieldId: field.fieldId,
        profilePath: result.profilePath,
        confidence: Math.min(1, Math.max(0, Number(result.confidence.toFixed(2)))),
        reasoning:
          sanitizeUntrustedText(result.reasoning, {
            maxLength: 240,
            neutralizeInstructions: true,
          }) || 'AI mapped the field to a validated profile path.',
      };
    });
  }

  private toBatchField(field: NormalizedFormField): AiMappingBatchField {
    return {
      fieldId: field.fieldId,
      type: field.type ?? field.kind,
      label: field.label,
      context: field.context,
      required: field.required,
      validationRules: field.validationRules,
      options: field.options,
    };
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    retryBaseDelayMs: number,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) {
          break;
        }
        await this.delay(retryBaseDelayMs * 2 ** attempt);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('AI mapping failed.');
  }

  private extractProfilePaths(profile: ProfileData): ProfilePathDescriptor[] {
    return this.flattenProfile(profile).filter(
      (descriptor) => descriptor.kind !== 'object' || descriptor.populated,
    );
  }

  private flattenProfile(value: unknown, path = ''): ProfilePathDescriptor[] {
    if (Array.isArray(value)) {
      const descriptors: ProfilePathDescriptor[] = [
        { path, kind: 'array', populated: value.length > 0 },
      ];
      value.forEach((entry, index) => {
        descriptors.push(...this.flattenProfile(entry, `${path}[${index}]`));
      });
      return descriptors.filter((descriptor) => descriptor.path);
    }

    if (value && typeof value === 'object') {
      const entries = Object.entries(value);
      const descriptors: ProfilePathDescriptor[] = path
        ? [{ path, kind: 'object', populated: entries.length > 0 }]
        : [];
      for (const [key, child] of entries) {
        const childPath = path ? `${path}.${key}` : key;
        descriptors.push(...this.flattenProfile(child, childPath));
      }
      return descriptors;
    }

    if (typeof value === 'string') {
      return [
        {
          path,
          kind: 'string',
          populated: value.trim().length > 0,
        },
      ];
    }

    if (typeof value === 'number') {
      return [
        {
          path,
          kind: 'number',
          populated: Number.isFinite(value),
        },
      ];
    }

    if (typeof value === 'boolean') {
      return [
        {
          path,
          kind: 'boolean',
          populated: String(value).trim().length > 0,
        },
      ];
    }

    return [{ path, kind: 'string', populated: false }];
  }

  private profileData(profile: ProfileData | VaultProfile): ProfileData {
    return 'data' in profile ? profile.data : profile;
  }

  private chunk<T>(values: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
      chunks.push(values.slice(index, index + size));
    }
    return chunks;
  }

  private cacheKey(
    fields: NormalizedFormField[],
    profilePaths: ProfilePathDescriptor[],
    minConfidence: number,
  ): string {
    return this.hash(
      JSON.stringify({
        minConfidence,
        fields: fields.map((field) => ({
          fieldId: field.fieldId,
          type: field.type ?? field.kind,
          label: field.label,
          context: field.context,
          validationRules: field.validationRules,
          options: field.options,
        })),
        profilePaths,
      }),
    );
  }

  private hash(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
