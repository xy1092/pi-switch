import { useState } from "react";
import {
  ArrowLeft,
  Copy,
  Download,
  Eye,
  EyeOff,
  FlaskConical,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import type { ApiProtocol, ModelProfile, ProviderProfile } from "../types";

interface Props {
  profile: ProviderProfile;
  isNew: boolean;
  saved: boolean;
  busy: boolean;
  onChange: (profile: ProviderProfile) => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTest: () => void;
  onFetchModels: () => void;
  onBack: () => void;
}

const protocols: Array<{ value: ApiProtocol; label: string }> = [
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "openai-completions", label: "OpenAI Chat Completions" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "google-generative-ai", label: "Google Generative AI" },
];

function newModel(): ModelProfile {
  return {
    id: "",
    name: "",
    reasoning: false,
    input: ["text"],
    contextWindow: null,
    maxTokens: null,
  };
}

export function ProviderEditor({
  profile,
  isNew,
  saved,
  busy,
  onChange,
  onSave,
  onDelete,
  onDuplicate,
  onTest,
  onFetchModels,
  onBack,
}: Props) {
  const [showKey, setShowKey] = useState(false);

  const updateModel = (index: number, patch: Partial<ModelProfile>) => {
    const models = profile.models.map((model, modelIndex) =>
      modelIndex === index ? { ...model, ...patch } : model,
    );
    onChange({ ...profile, models });
  };

  const removeModel = (index: number) => {
    onChange({
      ...profile,
      models: profile.models.filter((_, modelIndex) => modelIndex !== index),
    });
  };

  return (
    <>
      <header className="editor-topbar">
        <button className="back-button" onClick={onBack} aria-label="返回列表" title="返回列表">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1>{isNew ? "新建供应商" : `编辑 ${profile.name}`}</h1>
          <div className="provider-id-line">
            <span>{profile.enabled ? "已启用" : "已停用"}</span>
            <code>{profile.id}</code>
          </div>
        </div>
      </header>

      <div className="page">
        <div className="editor-body">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>基本信息</h2>
              </div>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={profile.enabled}
                  onChange={(event) => onChange({ ...profile, enabled: event.target.checked })}
                />
                <span className="switch-track">
                  <span />
                </span>
                写入 Pi 配置
              </label>
            </div>

            <div className="form-grid two-columns">
              <label>
                供应商名称
                <input
                  value={profile.name}
                  onChange={(event) => onChange({ ...profile, name: event.target.value })}
                  placeholder="例如：我的中转站"
                />
              </label>
              <label>
                供应商 ID
                <input
                  value={profile.id}
                  disabled={profile.createdAt > 0}
                  onChange={(event) => onChange({ ...profile, id: event.target.value })}
                  spellCheck={false}
                  placeholder="my-provider"
                />
              </label>
              <label>
                接口协议
                <select
                  value={profile.api}
                  onChange={(event) =>
                    onChange({ ...profile, api: event.target.value as ApiProtocol })
                  }
                >
                  {protocols.map((protocol) => (
                    <option key={protocol.value} value={protocol.value}>
                      {protocol.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                请求地址
                <input
                  value={profile.baseUrl}
                  onChange={(event) => onChange({ ...profile, baseUrl: event.target.value })}
                  placeholder="https://api.example.com/v1"
                  spellCheck={false}
                />
              </label>
              <label className="span-two">
                API Key
                <span className="secret-field">
                  <input
                    type={showKey ? "text" : "password"}
                    value={profile.apiKey}
                    onChange={(event) => onChange({ ...profile, apiKey: event.target.value })}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="sk-..."
                  />
                  <button
                    type="button"
                    className="field-icon-button"
                    onClick={() => setShowKey((visible) => !visible)}
                    title={showKey ? "隐藏密钥" : "显示密钥"}
                    aria-label={showKey ? "隐藏密钥" : "显示密钥"}
                  >
                    {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>
            </div>

            <div style={{ marginTop: 16 }}>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={profile.authHeader}
                  onChange={(event) => onChange({ ...profile, authHeader: event.target.checked })}
                />
                <span className="switch-track">
                  <span />
                </span>
                强制使用 Authorization Bearer 请求头
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>模型列表</h2>
                <span className="section-count">{profile.models.length}</span>
              </div>
              <div className="panel-actions">
                <button
                  className="secondary-button"
                  onClick={onFetchModels}
                  disabled={busy || !profile.baseUrl.trim() || !profile.apiKey.trim()}
                  title="通过供应商的 OpenAI 兼容模型接口拉取并导入"
                >
                  {busy ? <RefreshCw className="spin" size={16} /> : <Download size={16} />}
                  拉取模型
                </button>
                <button
                  className="secondary-button"
                  onClick={() =>
                    onChange({
                      ...profile,
                      models: [...profile.models, newModel()],
                    })
                  }
                >
                  <Plus size={16} />
                  添加模型
                </button>
              </div>
            </div>

            {profile.models.length === 0 ? (
              <div className="empty-hint">还没有模型，添加至少一个才能写入 Pi 配置</div>
            ) : (
              <div className="model-list">
                {profile.models.map((model, index) => (
                  <div className="model-card" key={`${index}-${model.id}`}>
                    <div className="model-card-head">
                      <span className="model-index">模型 {index + 1}</span>
                      <button
                        className="icon-button compact danger"
                        onClick={() => removeModel(index)}
                        title="移除模型"
                        aria-label={`移除模型 ${model.name || model.id}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="model-grid">
                      <label className="field-label">
                        模型 ID
                        <input
                          value={model.id}
                          onChange={(event) => updateModel(index, { id: event.target.value })}
                          spellCheck={false}
                        />
                      </label>
                      <label className="field-label">
                        显示名称
                        <input
                          value={model.name}
                          onChange={(event) => updateModel(index, { name: event.target.value })}
                        />
                      </label>
                      <label className="field-label">
                        上下文窗口
                        <input
                          type="number"
                          min={1}
                          value={model.contextWindow ?? ""}
                          placeholder="自动"
                          onChange={(event) =>
                            updateModel(index, {
                              contextWindow: event.target.value ? Number(event.target.value) : null,
                            })
                          }
                        />
                      </label>
                      <label className="field-label">
                        最大输出
                        <input
                          type="number"
                          min={1}
                          value={model.maxTokens ?? ""}
                          placeholder="自动"
                          onChange={(event) =>
                            updateModel(index, {
                              maxTokens: event.target.value ? Number(event.target.value) : null,
                            })
                          }
                        />
                      </label>
                    </div>

                    <div className="capability-controls">
                      <label>
                        <input
                          type="checkbox"
                          checked={model.reasoning}
                          onChange={(event) =>
                            updateModel(index, { reasoning: event.target.checked })
                          }
                        />
                        支持推理
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={model.input.includes("image")}
                          onChange={(event) =>
                            updateModel(index, {
                              input: event.target.checked ? ["text", "image"] : ["text"],
                            })
                          }
                        />
                        支持图片输入
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <footer className="editor-footer">
            <span className={saved ? "save-state saved" : "save-state"}>
              {saved ? "已保存" : "有未保存的修改"}
            </span>
            <div className="footer-actions">
              {!isNew && (
                <>
                  <button className="ghost-button" onClick={onDuplicate}>
                    <Copy size={16} />
                    复制
                  </button>
                  <button className="ghost-button" onClick={onDelete} disabled={busy}>
                    <Trash2 size={16} />
                    删除
                  </button>
                </>
              )}
              <button className="secondary-button" onClick={onTest} disabled={busy}>
                {busy ? <RefreshCw className="spin" size={16} /> : <FlaskConical size={16} />}
                连通性测试
              </button>
              <button className="primary-button" onClick={onSave} disabled={busy}>
                <Save size={16} />
                保存
              </button>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
