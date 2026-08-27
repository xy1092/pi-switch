import { invoke } from "@tauri-apps/api/core";
import type {
  AppStatus,
  AgentProfile,
  AgentStatus,
  ApprovalSettings,
  ApprovalStatus,
  BackupInfo,
  FetchedModel,
  ProviderProfile,
  SyncResult,
  TestResult,
  WorkspaceSettings,
} from "../types";

const PROFILE_KEY = "pi-switch-preview-profiles";
const WORKSPACE_KEY = "pi-switch-preview-workspace";
const APPROVAL_KEY = "pi-switch-preview-approval";
const isTauri = "__TAURI_INTERNALS__" in window;

function loadPreviewProfiles(): ProviderProfile[] {
  const stored = localStorage.getItem(PROFILE_KEY);
  if (stored) return JSON.parse(stored) as ProviderProfile[];
  const preview: ProviderProfile[] = [
    {
      id: "personal-gpt",
      name: "Personal GPT Gateway",
      baseUrl: "http://127.0.0.1:8317/v1",
      api: "openai-responses",
      apiKey: "preview-key",
      authHeader: false,
      defaultContextWindow: null,
      enabled: true,
      models: [
        {
          id: "gpt-5.6-sol",
          name: "GPT 5.6 Sol",
          reasoning: true,
          input: ["text", "image"],
          contextWindow: 355000,
          maxTokens: 32768,
        },
        {
          id: "gpt-5.6-terra",
          name: "GPT 5.6 Terra",
          reasoning: true,
          input: ["text", "image"],
          contextWindow: 355000,
          maxTokens: 32768,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "personal-deepseek",
      name: "Personal DeepSeek",
      baseUrl: "https://api.deepseek.com/v1",
      api: "openai-completions",
      apiKey: "preview-key",
      authHeader: false,
      defaultContextWindow: null,
      enabled: true,
      models: [
        {
          id: "deepseek-v4-flash",
          name: "DeepSeek V4 Flash",
          reasoning: false,
          input: ["text"],
          contextWindow: 355000,
          maxTokens: 32768,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
  storePreviewProfiles(preview);
  return preview;
}

function storePreviewProfiles(profiles: ProviderProfile[]) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
}

export async function getAppStatus(): Promise<AppStatus> {
  if (isTauri) return invoke("get_app_status");
  return {
    piVersion: "0.82.1",
    piAvailable: true,
    dataPath: "~/.pi-switch/pi-switch.db",
    modelsPath: "~/.pi/agent/models.json",
    authPath: "~/.pi/agent/auth.json",
    settingsPath: "~/.pi/agent/settings.json",
    liveConfigExists: false,
  };
}

export async function listProfiles(): Promise<ProviderProfile[]> {
  if (isTauri) return invoke("list_profiles");
  return loadPreviewProfiles();
}

export async function saveProfile(
  profile: ProviderProfile,
): Promise<ProviderProfile> {
  if (isTauri) return invoke("save_profile", { profile });
  const now = Date.now();
  const saved = {
    ...profile,
    createdAt: profile.createdAt || now,
    updatedAt: now,
  };
  const profiles = loadPreviewProfiles();
  const index = profiles.findIndex((entry) => entry.id === profile.id);
  if (index >= 0) profiles[index] = saved;
  else profiles.push(saved);
  storePreviewProfiles(profiles);
  return saved;
}

export async function deleteProfile(id: string): Promise<void> {
  if (isTauri) return invoke("delete_profile", { id });
  storePreviewProfiles(loadPreviewProfiles().filter((profile) => profile.id !== id));
}

export async function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  if (isTauri) return invoke("get_workspace_settings");
  return JSON.parse(
    localStorage.getItem(WORKSPACE_KEY) ??
      '{"defaultProvider":"personal-gpt","defaultModel":"gpt-5.6-sol","defaultThinking":"high"}',
  ) as WorkspaceSettings;
}

export async function syncConfiguration(
  workspace: WorkspaceSettings,
): Promise<SyncResult> {
  if (isTauri) return invoke("sync_configuration", { workspace });
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
  const enabled = loadPreviewProfiles().filter((profile) => profile.enabled);
  return {
    providerCount: enabled.length,
    modelCount: enabled.reduce((total, profile) => total + profile.models.length, 0),
    modelReference: `${workspace.defaultProvider}/${workspace.defaultModel}`,
    backupId: Date.now().toString(),
    modelsPath: "~/.pi/agent/models.json",
  };
}

export async function testProfile(
  profile: ProviderProfile,
): Promise<TestResult> {
  if (isTauri) return invoke("test_profile", { profile });
  await new Promise((resolve) => window.setTimeout(resolve, 700));
  return { ok: true, message: "OK", durationMs: 684 };
}

export async function fetchProviderModels(
  baseUrl: string,
  apiKey: string,
): Promise<FetchedModel[]> {
  if (isTauri) return invoke("fetch_provider_models", { baseUrl, apiKey });
  const base = baseUrl.trim().replace(/\/$/, "");
  const url = /\/v\d+$/.test(base) ? `${base}/models` : `${base}/v1/models`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
  });
  if (!response.ok) throw new Error(`模型接口返回 HTTP ${response.status}`);
  const body = (await response.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      owned_by?: string;
      context_window?: number;
      contextWindow?: number;
      max_tokens?: number;
      maxTokens?: number;
      max_output_tokens?: number;
    }>;
  };
  return (body.data ?? []).map((model) => ({
    id: model.id,
    name: model.name || model.id,
    ownedBy: model.owned_by ?? null,
    contextWindow: model.context_window ?? model.contextWindow ?? null,
    maxTokens: model.max_output_tokens ?? model.max_tokens ?? model.maxTokens ?? null,
  }));
}

export async function importLiveConfig(): Promise<ProviderProfile[]> {
  if (isTauri) return invoke("import_live_config");
  return loadPreviewProfiles();
}

export async function listBackups(): Promise<BackupInfo[]> {
  if (isTauri) return invoke("list_backups");
  return [];
}

export async function restoreBackup(id: string): Promise<void> {
  if (isTauri) return invoke("restore_backup", { id });
}

export async function getApprovalSettings(): Promise<ApprovalSettings> {
  if (isTauri) return invoke("get_approval_settings");
  return JSON.parse(
    localStorage.getItem(APPROVAL_KEY) ??
      '{"enabled":false,"mode":"manual","primaryProvider":"","primaryModel":"","escalationProvider":"","escalationModel":"","timeoutMs":12000,"allowProjectWrites":true,"alwaysAskNetwork":true}',
  ) as ApprovalSettings;
}

export async function saveApprovalSettings(
  settings: ApprovalSettings,
): Promise<ApprovalStatus> {
  if (isTauri) return invoke("save_approval_settings", { settings });
  localStorage.setItem(APPROVAL_KEY, JSON.stringify(settings));
  return {
    installed: settings.enabled,
    extensionPath: "~/.pi/agent/extensions/pi-approval/index.ts",
    configPath: "~/.pi/agent/extensions/pi-approval/config.json",
  };
}

export async function getApprovalStatus(): Promise<ApprovalStatus> {
  if (isTauri) return invoke("get_approval_status");
  const settings = await getApprovalSettings();
  return {
    installed: settings.enabled,
    extensionPath: "~/.pi/agent/extensions/pi-approval/index.ts",
    configPath: "~/.pi/agent/extensions/pi-approval/config.json",
  };
}

const AGENTS_KEY = "pi-switch-preview-agents";

export async function listAgents(): Promise<AgentProfile[]> {
  if (isTauri) return invoke("list_agents");
  return JSON.parse(localStorage.getItem(AGENTS_KEY) ?? "[]") as AgentProfile[];
}

export async function getAgentStatus(): Promise<AgentStatus> {
  if (isTauri) return invoke("get_agent_status");
  return {
    extensionInstalled: (await listAgents()).some((agent) => agent.enabled),
    agentsPath: "~/.pi/agent/agents",
    extensionPath: "~/.pi/agent/extensions/subagent/index.ts",
  };
}

export async function saveAgent(profile: AgentProfile): Promise<AgentProfile> {
  if (isTauri) return invoke("save_agent", { profile });
  const agents = await listAgents();
  const now = Date.now();
  const saved = { ...profile, createdAt: profile.createdAt || now, updatedAt: now };
  const index = agents.findIndex((agent) => agent.name === profile.name);
  if (index >= 0) agents[index] = saved;
  else agents.push(saved);
  localStorage.setItem(AGENTS_KEY, JSON.stringify(agents));
  return saved;
}

export async function deleteAgent(name: string): Promise<void> {
  if (isTauri) return invoke("delete_agent", { name });
  localStorage.setItem(
    AGENTS_KEY,
    JSON.stringify((await listAgents()).filter((agent) => agent.name !== name)),
  );
}

export async function installDefaultAgents(): Promise<AgentProfile[]> {
  if (isTauri) return invoke("install_default_agents");
  return listAgents();
}
