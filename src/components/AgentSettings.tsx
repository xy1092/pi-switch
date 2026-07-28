import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Copy,
  Plus,
  Save,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { AgentProfile, AgentStatus, ProviderProfile, ThinkingLevel } from "../types";

interface Props {
  agents: AgentProfile[];
  status: AgentStatus;
  profiles: ProviderProfile[];
  busy: boolean;
  onSave: (profile: AgentProfile) => Promise<AgentProfile>;
  onDelete: (name: string) => Promise<void>;
  onInstallDefaults: () => Promise<void>;
}

const toolOptions = [
  ["read", "读取"],
  ["grep", "搜索内容"],
  ["find", "查找文件"],
  ["ls", "列出目录"],
  ["bash", "Shell"],
  ["edit", "编辑"],
  ["write", "写入"],
] as const;

const thinkingLabels: Record<ThinkingLevel, string> = {
  off: "关闭",
  minimal: "极简",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "很高",
  max: "最高",
};

function emptyAgent(profiles: ProviderProfile[]): AgentProfile {
  const provider = profiles.find((entry) => entry.enabled && entry.models.length > 0);
  return {
    name: "new-agent",
    description: "",
    provider: provider?.id ?? "",
    model: provider?.models[0]?.id ?? "",
    thinking: "off",
    tools: ["read", "grep", "find", "ls"],
    systemPrompt: "",
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

function uniqueAgent(profiles: ProviderProfile[], agents: AgentProfile[]) {
  const draft = emptyAgent(profiles);
  let suffix = 1;
  while (agents.some((agent) => agent.name === draft.name)) {
    draft.name = `new-agent-${++suffix}`;
  }
  return draft;
}

export function AgentSettings({ agents, status, profiles, busy, onSave, onDelete, onInstallDefaults }: Props) {
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<AgentProfile | null>(null);
  const [dirty, setDirty] = useState(false);

  const modelOptions = useMemo(
    () => profiles
      .filter((profile) => profile.enabled)
      .flatMap((profile) => profile.models.map((model) => ({
        value: `${profile.id}/${model.id}`,
        label: `${profile.name} / ${model.name || model.id}`,
      }))),
    [profiles],
  );

  useEffect(() => {
    if (draft && (draft.createdAt === 0 || agents.some((agent) => agent.name === draft.name))) return;
    const target = agents.find((agent) => agent.name === selected) ?? agents[0];
    setSelected(target?.name ?? "");
    setDraft(target ? structuredClone(target) : null);
    setDirty(false);
  }, [agents, selected, draft]);

  const choose = (agent: AgentProfile) => {
    if (dirty && !window.confirm("当前 Agent 有未保存修改，确定要切换吗？")) return;
    setSelected(agent.name);
    setDraft(structuredClone(agent));
    setDirty(false);
  };

  const update = (patch: Partial<AgentProfile>) => {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };

  const create = (source?: AgentProfile) => {
    if (dirty && !window.confirm("当前 Agent 有未保存修改，确定要新建吗？")) return;
    const next = source ? structuredClone(source) : uniqueAgent(profiles, agents);
    if (source) {
      let name = `${source.name}-copy`;
      let suffix = 2;
      while (agents.some((agent) => agent.name === name)) name = `${source.name}-copy-${suffix++}`;
      next.name = name;
      next.createdAt = 0;
      next.updatedAt = 0;
    }
    setSelected("");
    setDraft(next);
    setDirty(true);
  };

  const save = async () => {
    if (!draft) return;
    const saved = await onSave(draft);
    setSelected(saved.name);
    setDraft(structuredClone(saved));
    setDirty(false);
  };

  const remove = async () => {
    if (!draft || draft.createdAt === 0) {
      setDraft(agents[0] ? structuredClone(agents[0]) : null);
      setSelected(agents[0]?.name ?? "");
      setDirty(false);
      return;
    }
    if (!window.confirm(`确定删除 Agent「${draft.name}」吗？`)) return;
    await onDelete(draft.name);
    setDraft(null);
    setSelected("");
    setDirty(false);
  };

  return (
    <section className="agents-page">
      <div className="page-heading">
        <div>
          <h1>Agents</h1>
          <p>{status.agentsPath}</p>
        </div>
        <span className={`install-state ${status.extensionInstalled ? "ready" : ""}`}>
          {status.extensionInstalled ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
          {status.extensionInstalled ? "调度器已安装" : "尚未安装调度器"}
        </span>
      </div>

      <div className="agents-workspace">
        <aside className="agent-sidebar">
          <div className="agent-sidebar-actions">
            <button className="secondary-button" onClick={() => create()} disabled={busy || modelOptions.length === 0}>
              <Plus size={16} />新建
            </button>
            <button className="icon-button" onClick={() => {
              if (agents.length === 0 || window.confirm("安装推荐模板会覆盖同名 Agent，确定继续吗？")) onInstallDefaults();
            }} disabled={busy} title="安装五个推荐模板" aria-label="安装五个推荐模板">
              <Sparkles size={16} />
            </button>
          </div>
          <div className="agent-nav-list">
            {agents.map((agent) => (
              <button key={agent.name} className={selected === agent.name ? "active" : ""} onClick={() => choose(agent)}>
                <Bot size={17} />
                <span><strong>{agent.name}</strong><small>{agent.description}</small></span>
                <i className={agent.enabled ? "enabled" : ""} />
              </button>
            ))}
            {agents.length === 0 && <div className="agent-empty">新建 Agent，或使用右上角模板按钮安装推荐配置</div>}
          </div>
        </aside>

        <div className="agent-editor">
          {!draft ? (
            <div className="agent-editor-empty"><Bot size={28} /><span>选择或新建一个 Agent</span></div>
          ) : (
            <>
              <div className="agent-editor-head">
                <div><h2>{draft.createdAt ? draft.name : "新建 Agent"}</h2><span>全局 Profile</span></div>
                <label className="switch-row">
                  <input type="checkbox" checked={draft.enabled} onChange={(event) => update({ enabled: event.target.checked })} />
                  <span className="switch-track"><span /></span>
                  启用
                </label>
              </div>

              <div className="agent-form-grid">
                <label>名称<input value={draft.name} disabled={draft.createdAt > 0} onChange={(event) => update({ name: event.target.value })} spellCheck={false} /></label>
                <label>模型<span className="select-wrap"><select value={`${draft.provider}/${draft.model}`} onChange={(event) => {
                  const slash = event.target.value.indexOf("/");
                  update({ provider: event.target.value.slice(0, slash), model: event.target.value.slice(slash + 1) });
                }}>{modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={15} /></span></label>
                <label className="span-two">职责描述<input value={draft.description} onChange={(event) => update({ description: event.target.value })} placeholder="告诉主 Agent 何时应该调用它" /></label>
                <label>思考强度<span className="select-wrap"><select value={draft.thinking} onChange={(event) => update({ thinking: event.target.value as ThinkingLevel })}>{(Object.keys(thinkingLabels) as ThinkingLevel[]).map((level) => <option key={level} value={level}>{thinkingLabels[level]}</option>)}</select><ChevronDown size={15} /></span></label>
              </div>

              <div className="agent-tools">
                <span>允许的工具</span>
                <div>{toolOptions.map(([tool, label]) => <label key={tool}><input type="checkbox" checked={draft.tools.includes(tool)} onChange={(event) => update({ tools: event.target.checked ? [...draft.tools, tool] : draft.tools.filter((entry) => entry !== tool) })} />{label}</label>)}</div>
              </div>

              <label className="agent-prompt">系统提示词<textarea value={draft.systemPrompt} onChange={(event) => update({ systemPrompt: event.target.value })} spellCheck={false} /></label>

              <div className="agent-editor-footer">
                <div>
                  <button className="ghost-button" onClick={() => create(draft)} disabled={busy}><Copy size={15} />复制</button>
                  <button className="ghost-button danger-text" onClick={remove} disabled={busy}><Trash2 size={15} />删除</button>
                </div>
                <button className="primary-button" onClick={save} disabled={busy || !dirty}><Save size={16} />保存 Agent</button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
