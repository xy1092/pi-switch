import { Check, Copy, Pencil, Search, Server, Trash2 } from "lucide-react";
import type { ProviderProfile } from "../types";

interface Props {
  profiles: ProviderProfile[];
  query: string;
  currentProviderId: string;
  busy: boolean;
  onQueryChange: (value: string) => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onUse: (id: string) => void;
  onNew: () => void;
}

function displayHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl;
  }
}

export function ProviderList({
  profiles,
  query,
  currentProviderId,
  busy,
  onQueryChange,
  onEdit,
  onDuplicate,
  onDelete,
  onUse,
  onNew,
}: Props) {
  const keyword = query.trim().toLowerCase();
  const filtered = profiles.filter((profile) =>
    `${profile.name} ${profile.id} ${profile.baseUrl}`.toLowerCase().includes(keyword),
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>供应商</h1>
          <p>共 {profiles.length} 个配置，点击卡片即可编辑</p>
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="搜索供应商"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索名称或地址"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Server size={30} />
          <strong>{profiles.length === 0 ? "还没有供应商" : "没有匹配的供应商"}</strong>
          <span>{profiles.length === 0 ? "点击右上角的加号新建一个配置" : "换个关键词试试"}</span>
          {profiles.length === 0 && (
            <button className="primary-button" onClick={onNew}>
              新建供应商
            </button>
          )}
        </div>
      ) : (
        <div className="card-list">
          {filtered.map((profile) => {
            const isCurrent = profile.id === currentProviderId;
            return (
              <div
                className={`provider-card${isCurrent ? " current" : ""}${
                  profile.enabled ? "" : " muted"
                }`}
                key={profile.id}
                role="button"
                tabIndex={0}
                onClick={() => onEdit(profile.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onEdit(profile.id);
                  }
                }}
              >
                <div className="provider-avatar" aria-hidden="true">
                  {profile.name.trim().charAt(0) || "?"}
                </div>

                <div className="provider-main">
                  <div className="provider-title-row">
                    <h2>{profile.name}</h2>
                    {isCurrent && <span className="tag current">当前使用</span>}
                    {!profile.enabled && <span className="tag off">已停用</span>}
                  </div>
                  <div className="provider-url">{displayHost(profile.baseUrl)}</div>
                  <div className="provider-meta">
                    <span>{profile.models.length} 个模型</span>
                    <span>{profile.id}</span>
                  </div>
                </div>

                <div className="card-actions" onClick={(event) => event.stopPropagation()}>
                  {!isCurrent && profile.enabled && profile.models.length > 0 && (
                    <button
                      className="secondary-button"
                      onClick={() => onUse(profile.id)}
                      disabled={busy}
                    >
                      <Check size={15} />
                      设为默认
                    </button>
                  )}
                  <button
                    className="icon-button"
                    onClick={() => onEdit(profile.id)}
                    title="编辑"
                    aria-label={`编辑 ${profile.name}`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => onDuplicate(profile.id)}
                    title="复制"
                    aria-label={`复制 ${profile.name}`}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="icon-button danger"
                    onClick={() => onDelete(profile.id)}
                    title="删除"
                    aria-label={`删除 ${profile.name}`}
                    disabled={busy}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
