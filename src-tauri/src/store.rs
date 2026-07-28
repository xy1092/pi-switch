use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};

use crate::models::{ApprovalSettings, ProviderProfile, WorkspaceSettings};

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "HOME is not set".to_string())
}

pub fn data_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".pi-switch"))
}

pub fn db_path() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("pi-switch.db"))
}

fn open_connection() -> Result<Connection, String> {
    let dir = data_dir()?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    fs::set_permissions(&dir, fs::Permissions::from_mode(0o700))
        .map_err(|error| error.to_string())?;

    let path = db_path()?;
    let connection = Connection::open(&path).map_err(|error| error.to_string())?;
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
        .map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS provider_profiles (
               id TEXT PRIMARY KEY,
               name TEXT NOT NULL,
               profile_json TEXT NOT NULL,
               enabled INTEGER NOT NULL DEFAULT 1,
               created_at INTEGER NOT NULL,
               updated_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS app_settings (
               key TEXT PRIMARY KEY,
               value TEXT NOT NULL
             );",
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn decode_profile(
    json: String,
    enabled: bool,
    created_at: i64,
    updated_at: i64,
) -> Result<ProviderProfile, String> {
    let mut profile: ProviderProfile =
        serde_json::from_str(&json).map_err(|error| error.to_string())?;
    for model in &mut profile.models {
        // Pi uses these exact values when the optional fields are absent. Older
        // Pi Switch versions wrote them for every fetched model as if known.
        if model.context_window == Some(128_000) {
            model.context_window = None;
        }
        if model.max_tokens == Some(16_384) {
            model.max_tokens = None;
        }
    }
    profile.enabled = enabled;
    profile.created_at = created_at;
    profile.updated_at = updated_at;
    Ok(profile)
}

pub fn list_profiles() -> Result<Vec<ProviderProfile>, String> {
    let connection = open_connection()?;
    let mut statement = connection
        .prepare(
            "SELECT profile_json, enabled, created_at, updated_at
             FROM provider_profiles
             ORDER BY enabled DESC, updated_at DESC, name COLLATE NOCASE",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, bool>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .map_err(|error| error.to_string())?;

    rows.map(|row| {
        let (json, active, created_at, updated_at) = row.map_err(|error| error.to_string())?;
        decode_profile(json, active, created_at, updated_at)
    })
    .collect()
}

pub fn save_profile(mut profile: ProviderProfile) -> Result<ProviderProfile, String> {
    validate_profile(&profile)?;
    let connection = open_connection()?;
    let existing = connection
        .query_row(
            "SELECT created_at FROM provider_profiles WHERE id = ?1",
            params![profile.id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let now = now_ms();
    profile.created_at = existing.unwrap_or(now);
    profile.updated_at = now;
    let json = serde_json::to_string(&profile).map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO provider_profiles (id, name, profile_json, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               profile_json = excluded.profile_json,
               enabled = excluded.enabled,
               updated_at = excluded.updated_at",
            params![
                profile.id,
                profile.name,
                json,
                profile.enabled,
                profile.created_at,
                profile.updated_at
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(profile)
}

pub fn delete_profile(id: &str) -> Result<(), String> {
    let connection = open_connection()?;
    connection
        .execute("DELETE FROM provider_profiles WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn get_workspace_settings() -> Result<WorkspaceSettings, String> {
    let connection = open_connection()?;
    let value: Option<String> = connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'workspace'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    match value {
        Some(json) => serde_json::from_str(&json).map_err(|error| error.to_string()),
        None => Ok(WorkspaceSettings {
            default_provider: String::new(),
            default_model: String::new(),
            default_thinking: "off".to_string(),
        }),
    }
}

pub fn save_workspace_settings(settings: &WorkspaceSettings) -> Result<(), String> {
    let connection = open_connection()?;
    let value = serde_json::to_string(settings).map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO app_settings (key, value) VALUES ('workspace', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![value],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn get_approval_settings() -> Result<ApprovalSettings, String> {
    let connection = open_connection()?;
    let value: Option<String> = connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'approval'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    match value {
        Some(json) => serde_json::from_str(&json).map_err(|error| error.to_string()),
        None => Ok(ApprovalSettings {
            enabled: false,
            mode: "manual".to_string(),
            primary_provider: String::new(),
            primary_model: "deepseek-v4-flash".to_string(),
            escalation_provider: String::new(),
            escalation_model: "deepseek-v4-pro".to_string(),
            timeout_ms: 12_000,
            allow_project_writes: true,
            always_ask_network: true,
        }),
    }
}

pub fn save_approval_settings(settings: &ApprovalSettings) -> Result<(), String> {
    let connection = open_connection()?;
    let value = serde_json::to_string(settings).map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO app_settings (key, value) VALUES ('approval', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![value],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub(crate) fn validate_profile(profile: &ProviderProfile) -> Result<(), String> {
    if profile.id.is_empty()
        || !profile
            .id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".-_".contains(character))
    {
        return Err(
            "Provider ID may only contain letters, numbers, dots, dashes, and underscores."
                .to_string(),
        );
    }
    if profile.name.trim().is_empty() {
        return Err("Provider name is required.".to_string());
    }
    if !(profile.base_url.starts_with("http://") || profile.base_url.starts_with("https://")) {
        return Err("Endpoint must start with http:// or https://".to_string());
    }
    if ![
        "openai-responses",
        "openai-completions",
        "anthropic-messages",
        "google-generative-ai",
    ]
    .contains(&profile.api.as_str())
    {
        return Err("Unsupported API protocol.".to_string());
    }
    if profile.api_key.trim().is_empty() {
        return Err("API key is required.".to_string());
    }
    if profile.models.is_empty() {
        return Err("Add at least one model.".to_string());
    }
    for model in &profile.models {
        if model.id.trim().is_empty() {
            return Err("Model ID cannot be empty.".to_string());
        }
        if model.context_window == Some(0) || model.max_tokens == Some(0) {
            return Err(format!("Model {} has invalid token limits.", model.id));
        }
    }
    Ok(())
}
