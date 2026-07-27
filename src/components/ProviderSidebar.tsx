import {
  ArchiveRestore,
  Boxes,
  Download,
  Plus,
  Search,
} from "lucide-react";
import type { ProviderProfile } from "../types";

interface Props {
  profiles: ProviderProfile[];
  selectedId: string;
  query: string;
  view: "providers" | "backups";
  onQueryChange: (value: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onImport: () => void;
  onViewChange: (view: "providers" | "backups") => void;
}

export function ProviderSidebar({
  profiles,
  selectedId,
  query,
  view,
  onQueryChange,
  onSelect,
  onNew,
  onImport,
  onViewChange,
}: Props) {
  const filtered = profiles.filter((profile) =>
    `${profile.name} ${profile.id}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand-mark">π</div>
        <div>
          <div className="brand-name">Pi Switch</div>
          <div className="brand-caption">Model catalog</div>
        </div>
      </div>

      <nav className="sidebar-tabs" aria-label="Main views">
        <button
          className={view === "providers" ? "nav-button active" : "nav-button"}
          onClick={() => onViewChange("providers")}
        >
          <Boxes size={16} />
          Providers
          <span>{profiles.length}</span>
        </button>
        <button
          className={view === "backups" ? "nav-button active" : "nav-button"}
          onClick={() => onViewChange("backups")}
        >
          <ArchiveRestore size={16} />
          Backups
        </button>
      </nav>

      {view === "providers" && (
        <>
          <div className="search-field">
            <Search size={15} />
            <input
              aria-label="Search providers"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search providers"
            />
          </div>

          <div className="provider-list">
            {filtered.map((profile) => (
              <button
                className={
                  profile.id === selectedId
                    ? "provider-item selected"
                    : "provider-item"
                }
                key={profile.id}
                onClick={() => onSelect(profile.id)}
              >
                <span className={profile.enabled ? "status-dot on" : "status-dot"} />
                <span className="provider-item-copy">
                  <strong>{profile.name}</strong>
                  <small>{profile.models.length} models · {profile.id}</small>
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="sidebar-empty">No providers</div>
            )}
          </div>

          <div className="sidebar-actions">
            <button className="secondary-button" onClick={onImport} title="Import Pi configuration">
              <Download size={16} />
              Import
            </button>
            <button className="primary-button" onClick={onNew}>
              <Plus size={16} />
              Add provider
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
