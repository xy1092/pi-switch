import { CheckCircle2, ChevronDown, Save, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ApprovalMode, ApprovalSettings as Settings, ApprovalStatus, ProviderProfile } from "../types";

interface Props {
  settings: Settings;
  status: ApprovalStatus;
  profiles: ProviderProfile[];
  busy: boolean;
  onChange: (settings: Settings) => void;
  onSave: () => void;
}

const modes: Array<{ value: ApprovalMode; label: string; detail: string }> = [
  { value: "manual", label: "手动", detail: "敏感操作始终由你确认" },
  { value: "auto", label: "自动审批", detail: "模型审批，无法判断时询问" },
  { value: "locked", label: "锁定", detail: "所有需审批操作直接拒绝" },
];

// 审批模型不再限定 DeepSeek：列出全部已启用供应商的所有模型供选择，
// 仅对经典搭配给出推荐标记。
const RECOMMENDED: Record<string, string> = {
  "deepseek-v4-flash": "（推荐主审）",
  "deepseek-v4-pro": "（推荐复核）",
};

function allModelOptions(profiles: ProviderProfile[]) {
  return profiles
    .filter((profile) => profile.enabled)
    .flatMap((profile) =>
      profile.models.map((model) => ({
        value: `${profile.id}/${model.id}`,
        label: `${profile.name} / ${model.name || model.id}${
          RECOMMENDED[model.id] ?? ""
        }`,
      })),
    );
}

function splitReference(reference: string) {
  const slash = reference.indexOf("/");
  return slash < 0 ? ["", reference] : [reference.slice(0, slash), reference.slice(slash + 1)];
}

export function ApprovalSettings({ settings, status, profiles, busy, onChange, onSave }: Props) {
  const options = allModelOptions(profiles);
  const primaryRef = `${settings.primaryProvider}/${settings.primaryModel}`;
  const escalationRef = `${settings.escalationProvider}/${settings.escalationModel}`;

  const setModel = (kind: "primary" | "escalation", reference: string) => {
    const [provider, model] = splitReference(reference);
    onChange(
      kind === "primary"
        ? { ...settings, primaryProvider: provider, primaryModel: model }
        : { ...settings, escalationProvider: provider, escalationModel: model },
    );
  };

  return (
    <section className="approval-page">
      <div className="page-heading">
        <div>
          <h1>权限审批</h1>
          <p>{status.extensionPath}</p>
        </div>
        <span className={`install-state ${status.installed ? "ready" : ""}`}>
          {status.installed ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
          {status.installed ? "扩展已安装" : "扩展未启用"}
        </span>
      </div>

      <div className="approval-panel">
        <div className="approval-title">
          <ShieldCheck size={22} />
          <div>
            <strong>执行前审批</strong>
            <span>在 Pi 调用工具后、实际执行前进行拦截</span>
          </div>
          <label className="switch-control">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => onChange({ ...settings, enabled: event.target.checked })}
            />
            <span />
          </label>
        </div>

        <div className="mode-grid" role="radiogroup" aria-label="审批模式">
          {modes.map((mode) => (
            <button
              key={mode.value}
              className={settings.mode === mode.value ? "active" : ""}
              onClick={() => onChange({ ...settings, enabled: true, mode: mode.value })}
              role="radio"
              aria-checked={settings.mode === mode.value}
            >
              <strong>{mode.label}</strong>
              <span>{mode.detail}</span>
            </button>
          ))}
        </div>

        <div className="approval-form">
          <label>
            快速审批模型
            <span className="select-wrap">
              <select value={primaryRef} onChange={(event) => setModel("primary", event.target.value)}>
                {options.length === 0 && <option value={primaryRef}>暂无已启用的模型</option>}
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <ChevronDown size={15} />
            </span>
          </label>
          <label>
            复杂情况复核模型
            <span className="select-wrap">
              <select value={escalationRef} onChange={(event) => setModel("escalation", event.target.value)}>
                {options.length === 0 && <option value={escalationRef}>暂无已启用的模型</option>}
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <ChevronDown size={15} />
            </span>
          </label>
          <label>
            审批超时
            <span className="number-field">
              <input
                type="number"
                min={3000}
                max={60000}
                step={1000}
                value={settings.timeoutMs}
                onChange={(event) => onChange({ ...settings, timeoutMs: Number(event.target.value) })}
              />
              <span>ms</span>
            </span>
          </label>
        </div>

        <div className="policy-list">
          <label>
            <input type="checkbox" checked={settings.allowProjectWrites} onChange={(event) => onChange({ ...settings, allowProjectWrites: event.target.checked })} />
            <span><strong>允许审批项目内写入</strong><small>自动模式下由模型判断当前工作目录内的写入和编辑</small></span>
          </label>
          <label>
            <input type="checkbox" checked={settings.alwaysAskNetwork} onChange={(event) => onChange({ ...settings, alwaysAskNetwork: event.target.checked })} />
            <span><strong>联网与发布始终询问</strong><small>上传、推送、发布和对外消息不会由模型直接放行</small></span>
          </label>
        </div>

        <div className="approval-footer">
          <span>模型异常、超时或输出无效时自动回退人工确认；无界面模式下直接阻止。</span>
          <button className="primary-button" disabled={busy} onClick={onSave}>
            <Save size={17} />
            保存并安装
          </button>
        </div>
      </div>
    </section>
  );
}
