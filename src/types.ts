export type ApiProtocol =
  | "openai-responses"
  | "openai-completions"
  | "anthropic-messages"
  | "google-generative-ai";

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface ModelProfile {
  id: string;
  name: string;
  reasoning: boolean;
  input: string[];
  contextWindow: number;
  maxTokens: number;
}

export interface ProviderProfile {
  id: string;
  name: string;
  baseUrl: string;
  api: ApiProtocol;
  apiKey: string;
  authHeader: boolean;
  models: ModelProfile[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceSettings {
  defaultProvider: string;
  defaultModel: string;
  defaultThinking: ThinkingLevel;
}

export type ApprovalMode = "manual" | "auto" | "locked";

export interface ApprovalSettings {
  enabled: boolean;
  mode: ApprovalMode;
  primaryProvider: string;
  primaryModel: string;
  escalationProvider: string;
  escalationModel: string;
  timeoutMs: number;
  allowProjectWrites: boolean;
  alwaysAskNetwork: boolean;
}

export interface ApprovalStatus {
  installed: boolean;
  extensionPath: string;
  configPath: string;
}

export interface AppStatus {
  piVersion: string | null;
  piAvailable: boolean;
  dataPath: string;
  modelsPath: string;
  authPath: string;
  settingsPath: string;
  liveConfigExists: boolean;
}

export interface SyncResult {
  providerCount: number;
  modelCount: number;
  modelReference: string;
  backupId: string;
  modelsPath: string;
}

export interface TestResult {
  ok: boolean;
  message: string;
  durationMs: number;
}

export interface FetchedModel {
  id: string;
  name: string;
  ownedBy: string | null;
}

export interface BackupInfo {
  id: string;
  path: string;
  createdAt: number;
}
