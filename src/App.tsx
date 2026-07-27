import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArchiveRestore,
  Check,
  ChevronDown,
  Database,
  RefreshCw,
  Save,
  Server,
} from "lucide-react";
import "./App.css";
import { ProviderEditor } from "./components/ProviderEditor";
import { ProviderSidebar } from "./components/ProviderSidebar";
import {
  deleteProfile,
  getAppStatus,
  getWorkspaceSettings,
  importLiveConfig,
  listBackups,
  listProfiles,
  restoreBackup,
  saveProfile,
  syncConfiguration,
  testProfile,
} from "./lib/backend";
import type {
  AppStatus,
  BackupInfo,
  ProviderProfile,
  ThinkingLevel,
  WorkspaceSettings,
} from "./types";

const emptyStatus: AppStatus = {
  piVersion: null,
  piAvailable: false,
  dataPath: "",
  modelsPath: "",
  authPath: "",
  settingsPath: "",
  liveConfigExists: false,
};

function createProvider(existing: ProviderProfile[], source?: ProviderProfile): ProviderProfile {
  const base = source?.id ?? "my-provider";
  let id = source ? `${base}-copy` : base;
  let suffix = 2;
  while (existing.some((profile) => profile.id === id)) {
    id = `${base}-${suffix++}`;
  }
  return {
    id,
    name: source ? `${source.name} Copy` : "My Provider",
    baseUrl: source?.baseUrl ?? "https://api.example.com/v1",
    api: source?.api ?? "openai-responses",
    apiKey: source?.apiKey ?? "",
    authHeader: source?.authHeader ?? false,
    enabled: source?.enabled ?? true,
    models: source?.models.map((model) => ({ ...model, input: [...model.input] })) ?? [
      {
        id: "model-id",
        name: "Model",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 128000,
        maxTokens: 16384,
      },
    ],
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
  return {
    ...workspace,
    defaultProvider: selected.id,
    defaultModel: model.id,
  };
}

function App() {
  const [profiles, setProfiles] = useState<ProviderProfile[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceSettings>({
    defaultProvider: "",
    defaultModel: "",
    defaultThinking: "off",
  });
  const [draft, setDraft] = useState<ProviderProfile | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState<AppStatus>(emptyStatus);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [view, setView] = useState<"providers" | "backups">("providers");
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

  const refresh = async () => {
    const [loadedProfiles, loadedWorkspace, loadedStatus, loadedBackups] = await Promise.all([
      listProfiles(),
      getWorkspaceSettings(),
      getAppStatus(),
      listBackups(),
    ]);
    const normalized = normalizeWorkspace(loadedProfiles, loadedWorkspace);
    setProfiles(loadedProfiles);
    setWorkspace(normalized);
    setStatus(loadedStatus);
    setBackups(loadedBackups);
    if (loadedProfiles.length > 0) {
      const selected = loadedProfiles.find((profile) => profile.id === selectedId) ?? loadedProfiles[0];
      setSelectedId(selected.id);
      setDraft(structuredClone(selected));
    } else {
      const created = createProvider([]);
      setSelectedId(created.id);
      setDraft(created);
      setSaved(false);
    }
  };

  useEffect(() => {
    refresh().catch((error: unknown) =>
      setNotice({ kind: "error", text: String(error) }),
    );
  }, []);

  const selectProfile = (id: string) => {
    const profile = profiles.find((entry) => entry.id === id);
    if (!profile) return;
    setSelectedId(id);
    setDraft(structuredClone(profile));
    setSaved(true);
  };

  const changeDraft = (profile: ProviderProfile) => {
    setDraft(profile);
    setSaved(false);
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
      setNotice({ kind: "success", text: `Saved ${savedProfile.name}` });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!draft || !profiles.some((profile) => profile.id === selectedId)) return;
    if (!window.confirm(`Delete ${draft.name}?`)) return;
    setBusy(true);
    try {
      await deleteProfile(selectedId);
      await refresh();
      setNotice({ kind: "success", text: "Provider deleted" });
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
        text: `${result.message} · ${result.durationMs} ms`,
      });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
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
      const normalized = normalizeWorkspace(currentProfiles, workspace);
      const result = await syncConfiguration(normalized);
      setWorkspace(normalized);
      setBackups(await listBackups());
      setNotice({
        kind: "success",
        text: `${result.providerCount} providers · ${result.modelCount} models · ${result.modelReference}`,
      });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const imported = await importLiveConfig();
      setProfiles(imported);
      const importedWorkspace = normalizeWorkspace(imported, await getWorkspaceSettings());
      setWorkspace(importedWorkspace);
      if (imported.length > 0) {
        setSelectedId(imported[0].id);
        setDraft(structuredClone(imported[0]));
        setSaved(true);
      }
      setNotice({ kind: "success", text: `Imported ${imported.length} providers` });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (id: string) => {
    if (!window.confirm("Restore this Pi configuration backup?")) return;
    setBusy(true);
    try {
      await restoreBackup(id);
      setNotice({ kind: "success", text: "Backup restored" });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-shell">
      <ProviderSidebar
        profiles={profiles}
        selectedId={selectedId}
        query={query}
        view={view}
        onQueryChange={setQuery}
        onSelect={selectProfile}
        onNew={() => {
          const created = createProvider(profiles);
          setSelectedId(created.id);
          setDraft(created);
          setSaved(false);
          setView("providers");
        }}
        onImport={handleImport}
        onViewChange={setView}
      />

      <section className="workspace">
        <header className="workspace-toolbar">
          <div className="workspace-status">
            <span className={status.piAvailable ? "runtime-dot ready" : "runtime-dot"} />
            <div>
              <strong>Pi {status.piVersion ?? "not found"}</strong>
              <small>{enabledProfiles.length} enabled providers</small>
            </div>
          </div>

          <div className="default-controls">
            <label>
              Default provider
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
                  {enabledProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </span>
            </label>
            <label>
              Default model
              <span className="select-wrap">
                <select
                  value={workspace.defaultModel}
                  onChange={(event) => setWorkspace({ ...workspace, defaultModel: event.target.value })}
                >
                  {defaultProvider?.models.map((model) => (
                    <option key={model.id} value={model.id}>{model.name || model.id}</option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </span>
            </label>
            <label>
              Thinking
              <span className="select-wrap narrow">
                <select
                  value={workspace.defaultThinking}
                  onChange={(event) =>
                    setWorkspace({
                      ...workspace,
                      defaultThinking: event.target.value as ThinkingLevel,
                    })
                  }
                >
                  {(["off", "minimal", "low", "medium", "high", "xhigh", "max"] as ThinkingLevel[]).map(
                    (level) => <option key={level}>{level}</option>,
                  )}
                </select>
                <ChevronDown size={14} />
              </span>
            </label>
          </div>

          <button className="apply-button" onClick={handleSync} disabled={busy || enabledProfiles.length === 0}>
            {busy ? <RefreshCw className="spin" size={17} /> : <Save size={17} />}
            Apply to Pi
          </button>
        </header>

        {notice && (
          <button className={`notice ${notice.kind}`} onClick={() => setNotice(null)}>
            {notice.kind === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
            <span>{notice.text}</span>
            <span className="notice-close">×</span>
          </button>
        )}

        {view === "providers" && draft && (
          <ProviderEditor
            profile={draft}
            saved={saved}
            busy={busy}
            onChange={changeDraft}
            onSave={handleSave}
            onDelete={handleDelete}
            onDuplicate={() => {
              const copy = createProvider(profiles, draft);
              setSelectedId(copy.id);
              setDraft(copy);
              setSaved(false);
            }}
            onTest={handleTest}
          />
        )}

        {view === "backups" && (
          <div className="backups-pane">
            <header className="pane-heading">
              <div>
                <h1>Backups</h1>
                <p>{status.modelsPath}</p>
              </div>
              <ArchiveRestore size={22} />
            </header>
            <div className="backup-list">
              {backups.map((backup) => (
                <div className="backup-row" key={backup.id}>
                  <Database size={18} />
                  <div>
                    <strong>{new Date(backup.createdAt).toLocaleString()}</strong>
                    <code>{backup.path}</code>
                  </div>
                  <button className="secondary-button" onClick={() => handleRestore(backup.id)} disabled={busy}>
                    <ArchiveRestore size={15} />
                    Restore
                  </button>
                </div>
              ))}
              {backups.length === 0 && (
                <div className="empty-pane">
                  <Server size={28} />
                  <strong>No backups</strong>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
