export interface ExtensionSettings {
  aiMappingEnabled: boolean;
  minConfidence: number;
  allowedOrigins: string[];
}

export const defaultSettings: ExtensionSettings = {
  aiMappingEnabled: true,
  minConfidence: 0.66,
  allowedOrigins: [],
};
