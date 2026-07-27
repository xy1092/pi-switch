import { useState } from "react";
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  FlaskConical,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import type { ApiProtocol, ModelProfile, ProviderProfile } from "../types";

interface Props {
  profile: ProviderProfile;
  saved: boolean;
  busy: boolean;
  onChange: (profile: ProviderProfile) => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTest: () => void;
}

const protocols: Array<{ value: ApiProtocol; label: string }> = [
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "openai-completions", label: "OpenAI Chat Completions" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "google-generative-ai", label: "Google Generative AI" },
];

function newModel(index: number): ModelProfile {
  return {
    id: `model-${index}`,
    name: `Model ${index}`,
    reasoning: false,
    input: ["text"],
    contextWindow: 128000,
    maxTokens: 16384,
  };
}

export function ProviderEditor({
  profile,
  saved,
  busy,
  onChange,
  onSave,
  onDelete,
  onDuplicate,
  onTest,
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
    <div className="editor-pane">
      <header className="editor-header">
        <div className="title-input-group">
          <input
            className="provider-title-input"
            aria-label="Provider name"
            value={profile.name}
            onChange={(event) => onChange({ ...profile, name: event.target.value })}
          />
          <div className="provider-id-line">
            <span className={profile.enabled ? "enabled-label" : "disabled-label"}>
              {profile.enabled ? <CheckCircle2 size={14} /> : <X size={14} />}
              {profile.enabled ? "Enabled" : "Disabled"}
            </span>
            <code>{profile.id}</code>
          </div>
        </div>
        <div className="icon-actions">
          <button className="icon-button" onClick={onDuplicate} title="Duplicate provider">
            <Copy size={17} />
          </button>
          <button className="icon-button danger" onClick={onDelete} title="Delete provider">
            <Trash2 size={17} />
          </button>
        </div>
      </header>

      <div className="editor-scroll">
        <section className="form-section">
          <div className="section-heading">
            <h2>Connection</h2>
            <label className="switch-row compact">
              <input
                type="checkbox"
                checked={profile.enabled}
                onChange={(event) =>
                  onChange({ ...profile, enabled: event.target.checked })
                }
              />
              <span className="switch-track"><span /></span>
              Include in Pi
            </label>
          </div>
          <div className="form-grid two-columns">
            <label>
              Provider ID
              <input
                value={profile.id}
                disabled={profile.createdAt > 0}
                onChange={(event) => onChange({ ...profile, id: event.target.value })}
                spellCheck={false}
              />
            </label>
            <label>
              API protocol
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
            <label className="span-two">
              API endpoint
              <input
                value={profile.baseUrl}
                onChange={(event) => onChange({ ...profile, baseUrl: event.target.value })}
                placeholder="https://api.example.com/v1"
                spellCheck={false}
              />
            </label>
            <label className="span-two">
              API key
              <span className="secret-field">
                <input
                  type={showKey ? "text" : "password"}
                  value={profile.apiKey}
                  onChange={(event) => onChange({ ...profile, apiKey: event.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="field-icon-button"
                  onClick={() => setShowKey((visible) => !visible)}
                  title={showKey ? "Hide API key" : "Show API key"}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </label>
          </div>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={profile.authHeader}
              onChange={(event) =>
                onChange({ ...profile, authHeader: event.target.checked })
              }
            />
            <span className="switch-track"><span /></span>
            Force Authorization bearer header
          </label>
        </section>

        <section className="form-section models-section">
          <div className="section-heading">
            <div>
              <h2>Models</h2>
              <span className="section-count">{profile.models.length}</span>
            </div>
            <button
              className="secondary-button"
              onClick={() =>
                onChange({
                  ...profile,
                  models: [...profile.models, newModel(profile.models.length + 1)],
                })
              }
            >
              <Plus size={16} />
              Add model
            </button>
          </div>

          <div className="model-table" role="table" aria-label="Provider models">
            <div className="model-row model-header" role="row">
              <span>Model ID</span>
              <span>Name</span>
              <span>Context</span>
              <span>Output</span>
              <span>Capabilities</span>
              <span />
            </div>
            {profile.models.map((model, index) => (
              <div className="model-row" role="row" key={`${index}-${model.id}`}>
                <input
                  aria-label="Model ID"
                  value={model.id}
                  onChange={(event) => updateModel(index, { id: event.target.value })}
                  spellCheck={false}
                />
                <input
                  aria-label="Model name"
                  value={model.name}
                  onChange={(event) => updateModel(index, { name: event.target.value })}
                />
                <input
                  aria-label="Context window"
                  type="number"
                  min={1}
                  value={model.contextWindow}
                  onChange={(event) =>
                    updateModel(index, { contextWindow: Number(event.target.value) })
                  }
                />
                <input
                  aria-label="Maximum output tokens"
                  type="number"
                  min={1}
                  value={model.maxTokens}
                  onChange={(event) =>
                    updateModel(index, { maxTokens: Number(event.target.value) })
                  }
                />
                <div className="capability-controls">
                  <label title="Reasoning">
                    <input
                      type="checkbox"
                      checked={model.reasoning}
                      onChange={(event) =>
                        updateModel(index, { reasoning: event.target.checked })
                      }
                    />
                    R
                  </label>
                  <label title="Image input">
                    <input
                      type="checkbox"
                      checked={model.input.includes("image")}
                      onChange={(event) =>
                        updateModel(index, {
                          input: event.target.checked ? ["text", "image"] : ["text"],
                        })
                      }
                    />
                    V
                  </label>
                </div>
                <button
                  className="icon-button compact danger"
                  onClick={() => removeModel(index)}
                  title="Remove model"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="editor-footer">
        <span className={saved ? "save-state saved" : "save-state"}>
          {saved ? "Saved" : "Unsaved changes"}
        </span>
        <div className="footer-actions">
          <button className="secondary-button" onClick={onTest} disabled={busy}>
            <FlaskConical size={16} />
            Test
          </button>
          <button className="primary-button" onClick={onSave} disabled={busy}>
            <Save size={16} />
            Save provider
          </button>
        </div>
      </footer>
    </div>
  );
}
