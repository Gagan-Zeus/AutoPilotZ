import type { AiMappingBatchField, ProfilePathDescriptor } from '../../core/entities/AiMapping';

export interface AiMappingPromptInput {
  profilePaths: ProfilePathDescriptor[];
  fields: AiMappingBatchField[];
}

export class AiMappingPromptBuilder {
  build(input: AiMappingPromptInput): string {
    return `You are an expert form-field mapping system.

Goal:

Map website fields to profile data.

Rules:

1. Use only supplied profile data.
2. Never invent values.
3. Never transform data unless explicitly requested.
4. Return confidence score.
5. Return null if uncertain.

Profile:

${JSON.stringify(this.safeProfile(input.profilePaths), null, 2)}

Fields:

${JSON.stringify(input.fields, null, 2)}

Return JSON only:

{
 "mappings":[
   {
      "fieldId":"",
      "profileKey":"",
      "confidence":0,
      "reason":""
   }
 ]
}`;
  }

  private safeProfile(profilePaths: ProfilePathDescriptor[]): Record<string, unknown> {
    return {
      availableProfileKeys: profilePaths
        .filter((descriptor) => descriptor.populated)
        .map((descriptor) => ({
          key: descriptor.path,
          kind: descriptor.kind,
        })),
    };
  }
}
