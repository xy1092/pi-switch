import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArchiveRestore,
  Bot,
  Boxes,
  Check,
  ChevronDown,
  Database,
  Download,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import "./App.css";
import { ProviderEditor } from "./components/ProviderEditor";
import { ProviderList } from "./components/ProviderList";
import { ApprovalSettings as ApprovalSettingsView } from "./components/ApprovalSettings";
import { AgentSettings } from "./components/AgentSettings";
import {
  deleteAgent,
  deleteProfile,
  fetchProviderModels,
  getAppStatus,
  getAgentStatus,
  getApprovalSettings,
  getApprovalStatus,
  getWorkspaceSettings,
  importLiveConfig,
  installDefaultAgents,
  listBackups,
  listAgents,
  listProfiles,
  restoreBackup,
  saveProfile,
  saveApprovalSettings,
  saveAgent,
  syncConfiguration,
  testProfile,
} from "./lib/backend";
import type {
  AgentProfile,
  AgentStatus,
  AppStatus,
  ApprovalSettings,
  ApprovalStatus,
  BackupInfo,
  ProviderProfile,
  ThinkingLevel,
  WorkspaceSettings,
} from "./types";

type View = "providers" | "agents" | "permissions" | "backups";

const thinkingLabels: Record<ThinkingLevel, string> = {
  off: "关闭",
  minimal: "极简",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "很高",
  max: "最高",
};

const emptyStatus: AppStatus = {
  piVersion: null,
  piAvailable: false,
  dataPath: "",
  modelsPath: "",
  authPath: "",
  settingsPath: "",
  liveConfigExists: false,
};

const emptyApproval: ApprovalSettings = {
  enabled: false,
  mode: "manual",
  primaryProvider: "",
  primaryModel: "deepseek-v4-flash",
  escalationProvider: "",
  escalationModel: "deepseek-v4-pro",
  timeoutMs: 12000,
  allowProjectWrites: true,
  alwaysAskNetwork: true,
};

const emptyApprovalStatus: ApprovalStatus = {
  installed: false,
  extensionPath: "~/.pi/agent/extensions/pi-approval/index.ts",
  configPath: "~/.pi/agent/extensions/pi-approval/config.json",
};

const emptyAgentStatus: AgentStatus = {
  extensionInstalled: false,
  agentsPath: "~/.pi/agent/agents",
  extensionPath: "~/.pi/agent/extensions/subagent/index.ts",
};

function normalizeApproval(
  profiles: ProviderProfile[],
  settings: ApprovalSettings,
): ApprovalSettings {
  const findProvider = (modelId: string, current: string) => {
    const active = profiles.find(
      (profile) => profile.enabled && profile.id === current && profile.models.some((model) => model.id === modelId),
    );
    return active?.id ?? profiles.find(
      (profile) => profile.enabled && profile.models.some((model) => model.id === modelId),
    )?.id ?? current;
  };
  return {
    ...settings,
    primaryProvider: findProvider("deepseek-v4-flash", settings.primaryProvider),
    primaryModel: "deepseek-v4-flash",
    escalationProvider: findProvider("deepseek-v4-pro", settings.escalationProvider),
    escalationModel: "deepseek-v4-pro",
  };
}

function createProvider(existing: ProviderProfile[], source?: ProviderProfile): ProviderProfile {
  const base = source?.id ?? "my-provider";
  let id = source ? `${base}-copy` : base;
  let suffix = 2;
  while (existing.some((profile) => profile.id === id)) {
    id = `${base}-${suffix++}`;
  }
  return {
    id,
    name: source ? `${source.name} 副本` : "新供应商",
    baseUrl: source?.baseUrl ?? "https://api.example.com/v1",
    api: source?.api ?? "openai-responses",
    apiKey: source?.apiKey ?? "",
    authHeader: source?.authHeader ?? false,
    enabled: source?.enabled ?? true,
    models: source?.models.map((model) => ({ ...model, input: [...model.input] })) ?? [],
    createdAt: 0,
    updatedAt: 0,
  };
}

function normalizeWorkspace(
  profiles: ProviderProfile[],
  workspace: WorkspaceSettings,
): WorkspaceSettings {
  const enabled = profiles.filter((profile) => profile.enabled && profile.models.length > 0);
  const selected = enabled.find((profile) => profile.id === workspace.defaultProvider) ?? enabled[0];
  if (!selected) return workspace;
  const model =
    selected.models.find((entry) => entry.id === workspace.defaultModel) ?? selected.models[0];
  return { ...workspace, defaultProvider: selected.id, defaultModel: model.id };
}

function App() {
  const [profiles, setProfiles] = useState<ProviderProfile[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceSettings>({
    defaultProvider: "",
    defaultModel: "",
    defaultThinking: "off",
  });
  const [draft, setDraft] = useState<ProviderProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState<AppStatus>(emptyStatus);
  const [approval, setApproval] = useState<ApprovalSettings>(emptyApproval);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>(emptyApprovalStatus);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(emptyAgentStatus);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [view, setView] = useState<View>("providers");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const enabledProfiles = useMemo(
    () => profiles.filter((profile) => profile.enabled && profile.models.length > 0),
    [profiles],
  );
  const defaultProvider = enabledProfiles.find(
    (profile) => profile.id === workspace.defaultProvider,
  );
  const isNewDraft = Boolean(draft && !profiles.some((profile) => profile.id === draft.id));

  const refresh = async () => {
    const [loadedProfiles, loadedWorkspace, loadedStatus, loadedBackups, loadedApproval, loadedApprovalStatus, loadedAgents, loadedAgentStatus] = await Promise.all([
      listProfiles(),
      getWorkspaceSettings(),
      getAppStatus(),
      listBackups(),
      getApprovalSettings(),
      getApprovalStatus(),
      listAgents(),
      getAgentStatus(),
    ]);
    setProfiles(loadedProfiles);
    setWorkspace(normalizeWorkspace(loadedProfiles, loadedWorkspace));
    setStatus(loadedStatus);
    setBackups(loadedBackups);
    setApproval(normalizeApproval(loadedProfiles, loadedApproval));
    setApprovalStatus(loadedApprovalStatus);
    setAgents(loadedAgents);
    setAgentStatus(loadedAgentStatus);
  };

  useEffect(() => {
    refresh().catch((error: unknown) => setNotice({ kind: "error", text: String(error) }));
  }, []);

  const openEditor = (id: string) => {
    const profile = profiles.find((entry) => entry.id === id);
    if (!profile) return;
    setSelectedId(id);
    setDraft(structuredClone(profile));
    setSaved(true);
    setEditing(true);
  };

  const openNew = (source?: ProviderProfile) => {
    const created = createProvider(profiles, source);
    setSelectedId(created.id);
    setDraft(created);
    setSaved(false);
    setEditing(true);
    setView("providers");
  };

  const closeEditor = () => {
    if (!saved && !window.confirm("有未保存的修改，确定要离开吗？")) return;
    setEditing(false);
    setDraft(null);
    setSaved(true);
  };

  const handleSave = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const savedProfile = await saveProfile(draft);
      const loaded = await listProfiles();
      setProfiles(loaded);
      setSelectedId(savedProfile.id);
      setDraft(structuredClone(savedProfile));
      setWorkspace((current) => normalizeWorkspace(loaded, current));
      setSaved(true);
      setNotice({ kind: "success", text: `已保存「${savedProfile.name}」` });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    const target = profiles.find((profile) => profile.id === id);
    if (!target) return;
    if (!window.confirm(`确定要删除「${target.name}」吗？`)) return;
    setBusy(true);
    try {
      await deleteProfile(id);
      await refresh();
      if (selectedId === id) {
        setEditing(false);
        setDraft(null);
        setSaved(true);
      }
      setNotice({ kind: "success", text: "供应商已删除" });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const result = await testProfile(draft);
      setNotice({
        kind: result.ok ? "success" : "error",
        text: `${result.ok ? "连接成功" : "连接失败"}：${result.message} · 耗时 ${result.durationMs} ms`,
      });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleFetchModels = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const fetched = await fetchProviderModels(draft.baseUrl, draft.apiKey);
      const existing = new Map(draft.models.map((model) => [model.id, model]));
      const models = fetched.map((model) => {
        const current = existing.get(model.id);
        if (current) {
          return {
            ...current,
            input: [...current.input],
            contextWindow:
              model.contextWindow ?? (current.contextWindow === 128000 ? null : current.contextWindow),
            maxTokens: model.maxTokens ?? (current.maxTokens === 16384 ? null : current.maxTokens),
          };
        }
        return {
          id: model.id,
          name: model.name || model.id,
          reasoning: /^(claude|codex|gpt-5|gemini|o[134](?:-|$))/i.test(model.id),
          input: ["text"],
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
        };
      });
      setDraft({ ...draft, models });
      setSaved(false);
      setNotice({
        kind: "success",
        text: `已从「${draft.name}」拉取并导入 ${models.length} 个模型`,
      });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async (override?: WorkspaceSettings) => {
    setBusy(true);
    try {
      if (draft && !saved) {
        const savedProfile = await saveProfile(draft);
        setSelectedId(savedProfile.id);
        setDraft(structuredClone(savedProfile));
        setSaved(true);
      }
      const currentProfiles = await listProfiles();
      setProfiles(currentProfiles);
      const normalized = normalizeWorkspace(currentProfiles, override ?? workspace);
      const result = await syncConfiguration(normalized);
      setWorkspace(normalized);
      setBackups(await listBackups());
      setNotice({
        kind: "success",
        text: `已写入 Pi：${result.providerCount} 个供应商 · ${result.modelCount} 个模型 · 默认 ${result.modelReference}`,
      });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleUse = async (id: string) => {
    const provider = enabledProfiles.find((profile) => profile.id === id);
    if (!provider) return;
    const next: WorkspaceSettings = {
      ...workspace,
      defaultProvider: id,
      defaultModel: provider.models[0]?.id ?? "",
    };
    setWorkspace(next);
    await handleSync(next);
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const imported = await importLiveConfig();
      setProfiles(imported);
      setWorkspace(normalizeWorkspace(imported, await getWorkspaceSettings()));
      setNotice({ kind: "success", text: `已导入 ${imported.length} 个供应商` });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (id: string) => {
    if (!window.confirm("确定要恢复这个 Pi 配置备份吗？当前配置将被覆盖。")) return;
    setBusy(true);
    try {
      await restoreBackup(id);
      await refresh();
      setNotice({ kind: "success", text: "备份已恢复" });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveApproval = async () => {
    setBusy(true);
    try {
      const result = await saveApprovalSettings(approval);
      setApprovalStatus(result);
      setNotice({
        kind: "success",
        text: approval.enabled
          ? "权限审批扩展已安装，重新加载 Pi 会话后生效"
          : "权限审批扩展已停用",
      });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAgent = async (profile: AgentProfile) => {
    setBusy(true);
    try {
      const savedAgent = await saveAgent(profile);
      setAgents(await listAgents());
      setAgentStatus(await getAgentStatus());
      setNotice({ kind: "success", text: `Agent「${savedAgent.name}」已保存` });
      return savedAgent;
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAgent = async (name: string) => {
    setBusy(true);
    try {
      await deleteAgent(name);
      setAgents(await listAgents());
      setAgentStatus(await getAgentStatus());
      setNotice({ kind: "success", text: `Agent「${name}」已删除` });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const handleInstallDefaultAgents = async () => {
    setBusy(true);
    try {
      setAgents(await installDefaultAgents());
      setAgentStatus(await getAgentStatus());
      setNotice({ kind: "success", text: "五个推荐 Agent 已安装，重新加载 Pi 后生效" });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const noticeBanner = notice && (
    <button className={`notice ${notice.kind}`} onClick={() => setNotice(null)}>
      {notice.kind === "success" ? <Check size={17} /> : <AlertCircle size={17} />}
      <span>{notice.text}</span>
      <span aria-hidden="true">×</span>
    </button>
  );

  if (editing && draft) {
    return (
      <main className="app-shell">
        <ProviderEditor
          profile={draft}
          isNew={isNewDraft}
          saved={saved}
          busy={busy}
          onChange={(profile) => {
            setDraft(profile);
            setSaved(false);
          }}
          onSave={handleSave}
          onDelete={() => handleDelete(draft.id)}
          onDuplicate={() => openNew(draft)}
          onTest={handleTest}
          onFetchModels={handleFetchModels}
          onBack={closeEditor}
        />
        {noticeBanner && <div className="page">{noticeBanner}</div>}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark">π</div>
          <span className="brand-name">Pi Switch</span>
        </div>

        <nav className="segmented" aria-label="主导航">
          <button
            className={view === "providers" ? "active" : ""}
            onClick={() => setView("providers")}
          >
            <Boxes size={17} />
            供应商
            <span className="seg-count">{profiles.length}</span>
          </button>
          <button
            className={view === "agents" ? "active" : ""}
            onClick={() => setView("agents")}
          >
            <Bot size={17} />
            Agents
            <span className="seg-count">{agents.length}</span>
          </button>
          <button
            className={view === "permissions" ? "active" : ""}
            onClick={() => setView("permissions")}
          >
            <ShieldCheck size={17} />
            权限
            <span className="seg-count">{approval.enabled ? "开" : "关"}</span>
          </button>
          <button
            className={view === "backups" ? "active" : ""}
            onClick={() => setView("backups")}
          >
            <ArchiveRestore size={17} />
            备份
            <span className="seg-count">{backups.length}</span>
          </button>
        </nav>

        <div className="topbar-tools">
          <button
            className="tool-button"
            onClick={handleImport}
            disabled={busy}
            title="从 Pi 现有配置导入"
            aria-label="从 Pi 现有配置导入"
          >
            <Download size={18} />
          </button>
          <button
            className="tool-button"
            onClick={() => refresh().catch((error: unknown) => setNotice({ kind: "error", text: String(error) }))}
            disabled={busy}
            title="刷新"
            aria-label="刷新"
          >
            <RefreshCw size={18} className={busy ? "spin" : undefined} />
          </button>
        </div>

        {view === "providers" && (
          <button className="add-fab" onClick={() => openNew()} title="新建供应商" aria-label="新建供应商">
            <Plus size={22} />
          </button>
        )}
      </header>

      <div className="active-bar">
        <div className="runtime-badge">
          <span className={status.piAvailable ? "runtime-dot ready" : "runtime-dot"} />
          <div>
            <strong>Pi {status.piVersion ?? "未检测到"}</strong>
            <small>{enabledProfiles.length} 个已启用</small>
          </div>
        </div>

        <div className="default-controls">
          <label className="field-label">
            默认供应商
            <span className="select-wrap">
              <select
                value={workspace.defaultProvider}
                onChange={(event) => {
                  const provider = enabledProfiles.find((item) => item.id === event.target.value);
                  setWorkspace({
                    ...workspace,
                    defaultProvider: event.target.value,
                    defaultModel: provider?.models[0]?.id ?? "",
                  });
                }}
              >
                {enabledProfiles.length === 0 && <option value="">暂无可用供应商</option>}
                {enabledProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </span>
          </label>
          <label className="field-label">
            默认模型
            <span className="select-wrap">
              <select
                value={workspace.defaultModel}
                onChange={(event) => setWorkspace({ ...workspace, defaultModel: event.target.value })}
              >
                {!defaultProvider && <option value="">暂无可用模型</option>}
                {defaultProvider?.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name || model.id}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </span>
          </label>
          <label className="field-label">
            思考强度
            <span className="select-wrap">
              <select
                value={workspace.defaultThinking}
                onChange={(event) =>
                  setWorkspace({
                    ...workspace,
                    defaultThinking: event.target.value as ThinkingLevel,
                  })
                }
              >
                {(Object.keys(thinkingLabels) as ThinkingLevel[]).map((level) => (
                  <option key={level} value={level}>
                    {thinkingLabels[level]}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </span>
          </label>
        </div>

        <button
          className="primary-button"
          onClick={() => handleSync()}
          disabled={busy || enabledProfiles.length === 0}
        >
          {busy ? <RefreshCw className="spin" size={17} /> : <Save size={17} />}
          应用到 Pi
        </button>
      </div>

      <div className="page">
        {noticeBanner}

        {view === "providers" && (
          <ProviderList
            profiles={profiles}
            query={query}
            currentProviderId={workspace.defaultProvider}
            busy={busy}
            onQueryChange={setQuery}
            onEdit={openEditor}
            onDuplicate={(id) => {
              const source = profiles.find((profile) => profile.id === id);
              if (source) openNew(source);
            }}
            onDelete={handleDelete}
            onUse={handleUse}
            onNew={() => openNew()}
          />
        )}

        {view === "permissions" && (
          <ApprovalSettingsView
            settings={approval}
            status={approvalStatus}
            profiles={profiles}
            busy={busy}
            onChange={setApproval}
            onSave={handleSaveApproval}
          />
        )}

        {view === "agents" && (
          <AgentSettings
            agents={agents}
            status={agentStatus}
            profiles={profiles}
            busy={busy}
            onSave={handleSaveAgent}
            onDelete={handleDeleteAgent}
            onInstallDefaults={handleInstallDefaultAgents}
          />
        )}

        {view === "backups" && (
          <>
            <div className="page-heading">
              <div>
                <h1>备份</h1>
                <p>{status.modelsPath || "未检测到 Pi 配置路径"}</p>
              </div>
            </div>
            {backups.length === 0 ? (
              <div className="empty-state">
                <ArchiveRestore size={30} />
                <strong>还没有备份</strong>
                <span>每次「应用到 Pi」都会自动备份原有配置</span>
              </div>
            ) : (
              <div className="card-list">
                {backups.map((backup) => (
                  <div className="backup-card" key={backup.id}>
                    <div className="backup-icon">
                      <Database size={19} />
                    </div>
                    <div>
                      <strong>{new Date(backup.createdAt).toLocaleString("zh-CN")}</strong>
                      <code>{backup.path}</code>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => handleRestore(backup.id)}
                      disabled={busy}
                    >
                      <ArchiveRestore size={16} />
                      恢复
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default App;
