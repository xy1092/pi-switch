use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};

use serde_json::{json, Map, Value};
use tempfile::TempDir;
use tokio::process::Command;

use crate::models::{
    AppStatus, BackupInfo, FetchedModel, ModelProfile, ProviderProfile, SyncResult, TestResult,
    WorkspaceSettings,
};
use crate::store::{
    data_dir, home_dir, list_profiles, now_ms, save_profile, save_workspace_settings,
};

const CONFIG_FILES: [&str; 3] = ["models.json", "auth.json", "settings.json"];
const MODEL_FETCH_TIMEOUT: Duration = Duration::from_secs(15);
const ERROR_BODY_LIMIT: usize = 512;

fn agent_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".pi").join("agent"))
}

fn read_json(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(json!({}));
    }
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| format!("{}: {error}", path.display()))
}

fn ensure_private_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| error.to_string())?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|error| error.to_string())
}

fn atomic_write_json(path: &Path, value: &Value) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Invalid output path: {}", path.display()))?;
    ensure_private_dir(parent)?;
    let temp_path = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("config"),
        std::process::id()
    ));
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true).mode(0o600);
    let mut file = options
        .open(&temp_path)
        .map_err(|error| error.to_string())?;
    let content = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|error| error.to_string())?;
    file.write_all(b"\n").map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    fs::rename(&temp_path, path).map_err(|error| error.to_string())?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|error| error.to_string())
}

fn model_json(model: &ModelProfile) -> Value {
    json!({
        "id": model.id,
        "name": if model.name.trim().is_empty() { &model.id } else { &model.name },
        "reasoning": model.reasoning,
        "input": model.input,
        "contextWindow": model.context_window,
        "maxTokens": model.max_tokens,
        "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
        }
    })
}

fn provider_json(profile: &ProviderProfile) -> Value {
    let mut provider = json!({
        "name": profile.name,
        "baseUrl": profile.base_url.trim_end_matches('/'),
        "api": profile.api,
        "models": profile.models.iter().map(model_json).collect::<Vec<_>>()
    });
    if profile.auth_header {
        provider["authHeader"] = Value::Bool(true);
    }
    provider
}

fn build_live_values(
    profiles: &[ProviderProfile],
    workspace: &WorkspaceSettings,
    target_dir: &Path,
) -> Result<(Value, Value, Value), String> {
    let mut models = read_json(&target_dir.join("models.json"))?;
    if !models.is_object() {
        models = json!({});
    }
    let root = models.as_object_mut().expect("models root checked");
    let providers = root
        .entry("providers")
        .or_insert_with(|| Value::Object(Map::new()));
    if !providers.is_object() {
        *providers = Value::Object(Map::new());
    }
    let providers = providers.as_object_mut().expect("providers checked");
    for profile in profiles {
        providers.remove(&profile.id);
    }
    for profile in profiles.iter().filter(|profile| profile.enabled) {
        providers.insert(profile.id.clone(), provider_json(profile));
    }

    let mut auth = read_json(&target_dir.join("auth.json"))?;
    if !auth.is_object() {
        auth = json!({});
    }
    let auth_map = auth.as_object_mut().expect("auth checked");
    for profile in profiles {
        auth_map.remove(&profile.id);
    }
    for profile in profiles.iter().filter(|profile| profile.enabled) {
        auth_map.insert(
            profile.id.clone(),
            json!({ "type": "api_key", "key": profile.api_key }),
        );
    }

    let mut settings = read_json(&target_dir.join("settings.json"))?;
    if !settings.is_object() {
        settings = json!({});
    }
    let settings_map = settings.as_object_mut().expect("settings checked");
    settings_map.insert(
        "defaultProvider".to_string(),
        json!(workspace.default_provider),
    );
    settings_map.insert("defaultModel".to_string(), json!(workspace.default_model));
    settings_map.insert(
        "defaultThinkingLevel".to_string(),
        json!(workspace.default_thinking),
    );
    settings_map.insert(
        "enabledModels".to_string(),
        Value::Array(
            profiles
                .iter()
                .filter(|profile| profile.enabled)
                .flat_map(|profile| {
                    profile
                        .models
                        .iter()
                        .map(|model| Value::String(format!("{}/{}", profile.id, model.id)))
                })
                .collect(),
        ),
    );
    settings_map
        .entry("enableInstallTelemetry")
        .or_insert(Value::Bool(false));

    Ok((models, auth, settings))
}

pub fn create_backup() -> Result<BackupInfo, String> {
    let id = now_ms().to_string();
    let backup_dir = data_dir()?.join("backups").join(&id);
    ensure_private_dir(&backup_dir)?;
    let live_dir = agent_dir()?;
    let mut manifest = Map::new();
    for name in CONFIG_FILES {
        let source = live_dir.join(name);
        let exists = source.exists();
        manifest.insert(name.to_string(), Value::Bool(exists));
        if exists {
            fs::copy(&source, backup_dir.join(name)).map_err(|error| error.to_string())?;
        }
    }
    atomic_write_json(&backup_dir.join("manifest.json"), &Value::Object(manifest))?;
    Ok(BackupInfo {
        id,
        path: backup_dir.display().to_string(),
        created_at: now_ms(),
    })
}

pub fn list_backups() -> Result<Vec<BackupInfo>, String> {
    let root = data_dir()?.join("backups");
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut backups = fs::read_dir(&root)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .map(|entry| {
            let id = entry.file_name().to_string_lossy().to_string();
            BackupInfo {
                created_at: id.parse().unwrap_or_default(),
                path: entry.path().display().to_string(),
                id,
            }
        })
        .collect::<Vec<_>>();
    backups.sort_by_key(|backup| std::cmp::Reverse(backup.created_at));
    Ok(backups)
}

pub fn restore_backup(id: &str) -> Result<(), String> {
    if !id.chars().all(|character| character.is_ascii_digit()) {
        return Err("Invalid backup ID.".to_string());
    }
    let backup_dir = data_dir()?.join("backups").join(id);
    if !backup_dir.is_dir() {
        return Err(format!("Backup not found: {id}"));
    }
    create_backup()?;
    let manifest = read_json(&backup_dir.join("manifest.json"))?;
    let live_dir = agent_dir()?;
    ensure_private_dir(&live_dir)?;
    for name in CONFIG_FILES {
        let existed = manifest.get(name).and_then(Value::as_bool).unwrap_or(false);
        let target = live_dir.join(name);
        if existed {
            let value = read_json(&backup_dir.join(name))?;
            atomic_write_json(&target, &value)?;
        } else if target.exists() {
            fs::remove_file(target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn validate_workspace(
    profiles: &[ProviderProfile],
    workspace: &WorkspaceSettings,
) -> Result<(), String> {
    let enabled = profiles
        .iter()
        .filter(|profile| profile.enabled)
        .collect::<Vec<_>>();
    if enabled.is_empty() {
        return Err("Enable at least one provider.".to_string());
    }
    let Some(provider) = enabled
        .iter()
        .find(|profile| profile.id == workspace.default_provider)
    else {
        return Err("Default provider must be enabled.".to_string());
    };
    if !provider
        .models
        .iter()
        .any(|model| model.id == workspace.default_model)
    {
        return Err("Default model is not available on the default provider.".to_string());
    }
    if !["off", "minimal", "low", "medium", "high", "xhigh", "max"]
        .contains(&workspace.default_thinking.as_str())
    {
        return Err("Invalid default thinking level.".to_string());
    }
    Ok(())
}

pub fn sync_configuration(workspace: WorkspaceSettings) -> Result<SyncResult, String> {
    let profiles = list_profiles()?;
    validate_workspace(&profiles, &workspace)?;
    let backup = create_backup()?;
    let live_dir = agent_dir()?;
    ensure_private_dir(&live_dir)?;
    let (models, auth, settings) = build_live_values(&profiles, &workspace, &live_dir)?;
    atomic_write_json(&live_dir.join("models.json"), &models)?;
    atomic_write_json(&live_dir.join("auth.json"), &auth)?;
    atomic_write_json(&live_dir.join("settings.json"), &settings)?;
    save_workspace_settings(&workspace)?;
    Ok(SyncResult {
        provider_count: profiles.iter().filter(|profile| profile.enabled).count(),
        model_count: profiles
            .iter()
            .filter(|profile| profile.enabled)
            .map(|profile| profile.models.len())
            .sum(),
        model_reference: format!("{}/{}", workspace.default_provider, workspace.default_model),
        backup_id: backup.id,
        models_path: live_dir.join("models.json").display().to_string(),
    })
}

fn pi_binary() -> Result<PathBuf, String> {
    if let Some(configured) = std::env::var_os("PI_SWITCH_PI_BIN") {
        return Ok(PathBuf::from(configured));
    }
    if let Ok(found) = which::which("pi") {
        return Ok(found);
    }
    let home = home_dir()?;
    for candidate in [
        home.join(".npm-global").join("bin").join("pi"),
        home.join(".local").join("bin").join("pi"),
    ] {
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("Pi executable was not found in PATH.".to_string())
}

pub fn app_status() -> Result<AppStatus, String> {
    let pi = pi_binary();
    let pi_version = pi.as_ref().ok().and_then(|binary| {
        std::process::Command::new(binary)
            .arg("--version")
            .output()
            .ok()
            .filter(|output| output.status.success())
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
    });
    let live_dir = agent_dir()?;
    Ok(AppStatus {
        pi_available: pi.is_ok(),
        pi_version,
        data_path: data_dir()?.display().to_string(),
        models_path: live_dir.join("models.json").display().to_string(),
        auth_path: live_dir.join("auth.json").display().to_string(),
        settings_path: live_dir.join("settings.json").display().to_string(),
        live_config_exists: CONFIG_FILES.iter().any(|name| live_dir.join(name).exists()),
    })
}

pub fn import_live() -> Result<Vec<ProviderProfile>, String> {
    let live_dir = agent_dir()?;
    let models = read_json(&live_dir.join("models.json"))?;
    let auth = read_json(&live_dir.join("auth.json"))?;
    let settings = read_json(&live_dir.join("settings.json"))?;
    let default_provider = settings
        .get("defaultProvider")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let default_model = settings
        .get("defaultModel")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let thinking = settings
        .get("defaultThinkingLevel")
        .and_then(Value::as_str)
        .unwrap_or("off");
    let Some(providers) = models.get("providers").and_then(Value::as_object) else {
        return Ok(Vec::new());
    };

    let mut imported = Vec::new();
    for (id, value) in providers {
        let Some(provider) = value.as_object() else {
            continue;
        };
        let model_values = provider
            .get("models")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if model_values.is_empty() {
            continue;
        }
        let mut imported_models = Vec::new();
        for model in model_values {
            let Some(model_id) = model.get("id").and_then(Value::as_str) else {
                continue;
            };
            imported_models.push(ModelProfile {
                id: model_id.to_string(),
                name: model
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or(model_id)
                    .to_string(),
                reasoning: model
                    .get("reasoning")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                input: model
                    .get("input")
                    .and_then(Value::as_array)
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(Value::as_str)
                            .map(str::to_string)
                            .collect()
                    })
                    .unwrap_or_else(|| vec!["text".to_string()]),
                context_window: model
                    .get("contextWindow")
                    .and_then(Value::as_u64)
                    .unwrap_or(128_000),
                max_tokens: model
                    .get("maxTokens")
                    .and_then(Value::as_u64)
                    .unwrap_or(16_384),
            });
        }
        if imported_models.is_empty() {
            continue;
        }
        let key = auth
            .get(id)
            .and_then(|entry| entry.get("key"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if key.is_empty() {
            continue;
        }
        let profile = ProviderProfile {
            id: id.clone(),
            name: provider
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(id)
                .to_string(),
            base_url: provider
                .get("baseUrl")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            api: provider
                .get("api")
                .and_then(Value::as_str)
                .unwrap_or("openai-completions")
                .to_string(),
            api_key: key,
            auth_header: provider
                .get("authHeader")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            models: imported_models,
            enabled: true,
            created_at: 0,
            updated_at: 0,
        };
        imported.push(save_profile(profile)?);
    }
    if imported
        .iter()
        .any(|profile| profile.id == default_provider)
    {
        save_workspace_settings(&WorkspaceSettings {
            default_provider: default_provider.to_string(),
            default_model: default_model.to_string(),
            default_thinking: thinking.to_string(),
        })?;
    }
    list_profiles()
}

fn ends_with_version_segment(url: &str) -> bool {
    let last = url.rsplit('/').next().unwrap_or_default();
    last.strip_prefix('v').is_some_and(|digits| {
        !digits.is_empty() && digits.bytes().all(|byte| byte.is_ascii_digit())
    })
}

fn model_url_candidates(base_url: &str) -> Result<Vec<String>, String> {
    let base = base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("请先填写请求地址。".to_string());
    }
    if !(base.starts_with("http://") || base.starts_with("https://")) {
        return Err("请求地址必须以 http:// 或 https:// 开头。".to_string());
    }

    let mut candidates = Vec::new();
    if ends_with_version_segment(base) {
        candidates.push(format!("{base}/models"));
        if !base.ends_with("/v1") {
            candidates.push(format!("{base}/v1/models"));
        }
    } else if let Some(index) = base.find("/v1/") {
        candidates.push(format!("{}/v1/models", &base[..index]));
    } else if base.ends_with("/models") {
        candidates.push(base.to_string());
    } else {
        candidates.push(format!("{base}/v1/models"));
        candidates.push(format!("{base}/models"));
    }
    candidates.dedup();
    Ok(candidates)
}

fn truncate_error_body(body: &str) -> String {
    let mut chars = body.chars();
    let truncated: String = chars.by_ref().take(ERROR_BODY_LIMIT).collect();
    if chars.next().is_some() {
        format!("{truncated}...")
    } else {
        truncated
    }
}

fn parse_fetched_models(value: Value) -> Result<Vec<FetchedModel>, String> {
    let entries = value
        .get("data")
        .and_then(Value::as_array)
        .or_else(|| value.get("models").and_then(Value::as_array))
        .or_else(|| value.as_array())
        .ok_or_else(|| "模型接口返回格式不受支持，缺少 data/models 数组。".to_string())?;

    let mut models = entries
        .iter()
        .filter_map(|entry| {
            let id = entry
                .get("id")
                .or_else(|| entry.get("name"))
                .and_then(Value::as_str)?
                .trim();
            if id.is_empty() {
                return None;
            }
            let name = entry
                .get("display_name")
                .or_else(|| entry.get("displayName"))
                .or_else(|| entry.get("name"))
                .and_then(Value::as_str)
                .filter(|name| !name.trim().is_empty())
                .unwrap_or(id);
            let owned_by = entry
                .get("owned_by")
                .or_else(|| entry.get("ownedBy"))
                .and_then(Value::as_str)
                .map(str::to_string);
            Some(FetchedModel {
                id: id.to_string(),
                name: name.to_string(),
                owned_by,
            })
        })
        .collect::<Vec<_>>();
    models.sort_by(|left, right| left.id.cmp(&right.id));
    models.dedup_by(|left, right| left.id == right.id);
    if models.is_empty() {
        return Err("模型接口返回成功，但没有可导入的模型。".to_string());
    }
    Ok(models)
}

pub async fn fetch_provider_models(
    base_url: &str,
    api_key: &str,
) -> Result<Vec<FetchedModel>, String> {
    if api_key.trim().is_empty() {
        return Err("请先填写 API Key。".to_string());
    }
    let candidates = model_url_candidates(base_url)?;
    let client = reqwest::Client::builder()
        .timeout(MODEL_FETCH_TIMEOUT)
        .user_agent(concat!("pi-switch/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| format!("无法创建网络客户端：{error}"))?;
    let mut last_not_found = None;

    for url in candidates {
        let response = client
            .get(&url)
            .bearer_auth(api_key.trim())
            .send()
            .await
            .map_err(|error| format!("请求模型列表失败：{error}"))?;
        let status = response.status();
        if status.is_success() {
            let value = response
                .json::<Value>()
                .await
                .map_err(|error| format!("模型列表解析失败：{error}"))?;
            return parse_fetched_models(value);
        }
        let body = response.text().await.unwrap_or_default();
        if status.as_u16() == 404 || status.as_u16() == 405 {
            last_not_found = Some(format!("{url} 返回 HTTP {status}"));
            continue;
        }
        return Err(format!(
            "模型接口返回 HTTP {status}：{}",
            truncate_error_body(&body)
        ));
    }

    Err(format!(
        "没有找到模型列表接口。{}",
        last_not_found
            .map(|error| format!("最后一次尝试：{error}"))
            .unwrap_or_default()
    ))
}

fn is_placeholder_model_id(id: &str) -> bool {
    let id = id.trim().to_ascii_lowercase();
    id == "model-id"
        || id == "model"
        || id.strip_prefix("model-").is_some_and(|suffix| {
            !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit())
        })
}

fn is_text_test_model(id: &str) -> bool {
    let id = id.to_ascii_lowercase();
    !["image", "audio", "realtime", "embedding", "tts", "transcri"]
        .iter()
        .any(|marker| id.contains(marker))
}

async fn run_pi(
    profile: &ProviderProfile,
    model_id: &str,
    config_dir: &Path,
) -> Result<TestResult, String> {
    let binary = pi_binary()?;
    let started = Instant::now();
    let mut child = Command::new(binary);
    child
        .arg("--no-session")
        .arg("--no-tools")
        .arg("--model")
        .arg(format!("{}/{}", profile.id, model_id))
        .arg("--thinking")
        .arg("off")
        .arg("-p")
        .arg("Reply with exactly: OK")
        .env("PI_CODING_AGENT_DIR", config_dir)
        .env("PI_SKIP_VERSION_CHECK", "1")
        .env("PI_TELEMETRY", "0")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let process = child.spawn().map_err(|error| error.to_string())?;
    let output = tokio::time::timeout(Duration::from_secs(45), process.wait_with_output())
        .await
        .map_err(|_| "Connection test timed out after 45 seconds.".to_string())?
        .map_err(|error| error.to_string())?;
    let duration_ms = started.elapsed().as_millis();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if output.status.success() {
        Ok(TestResult {
            ok: true,
            message: if stdout.is_empty() {
                "Connected".to_string()
            } else {
                stdout
            },
            duration_ms,
        })
    } else {
        Ok(TestResult {
            ok: false,
            message: if stderr.is_empty() {
                stdout
            } else {
                stderr.lines().take(8).collect::<Vec<_>>().join("\n")
            },
            duration_ms,
        })
    }
}

pub async fn test_profile(profile: ProviderProfile) -> Result<TestResult, String> {
    crate::store::validate_profile(&profile)?;
    let temp = TempDir::new().map_err(|error| error.to_string())?;
    let test_model = profile
        .models
        .iter()
        .find(|model| !is_placeholder_model_id(&model.id) && is_text_test_model(&model.id))
        .ok_or_else(|| "没有可用于测试的真实文本模型，请先点击“拉取模型”。".to_string())?;
    let workspace = WorkspaceSettings {
        default_provider: profile.id.clone(),
        default_model: test_model.id.clone(),
        default_thinking: "off".to_string(),
    };
    let (models, auth, settings) =
        build_live_values(std::slice::from_ref(&profile), &workspace, temp.path())?;
    atomic_write_json(&temp.path().join("models.json"), &models)?;
    atomic_write_json(&temp.path().join("auth.json"), &auth)?;
    atomic_write_json(&temp.path().join("settings.json"), &settings)?;
    run_pi(&profile, &test_model.id, temp.path()).await
}

#[allow(dead_code)]
fn touch_private(path: &Path) -> Result<(), String> {
    let file = File::create(path).map_err(|error| error.to_string())?;
    file.set_permissions(fs::Permissions::from_mode(0o600))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn example_profile() -> ProviderProfile {
        ProviderProfile {
            id: "test-provider".to_string(),
            name: "Test Provider".to_string(),
            base_url: "https://example.com/v1/".to_string(),
            api: "openai-responses".to_string(),
            api_key: "secret".to_string(),
            auth_header: false,
            models: vec![ModelProfile {
                id: "test-model".to_string(),
                name: "Test Model".to_string(),
                reasoning: true,
                input: vec!["text".to_string(), "image".to_string()],
                context_window: 128_000,
                max_tokens: 16_384,
            }],
            enabled: true,
            created_at: 0,
            updated_at: 0,
        }
    }

    fn second_profile() -> ProviderProfile {
        ProviderProfile {
            id: "second-provider".to_string(),
            name: "Second Provider".to_string(),
            base_url: "https://second.example.com/v1".to_string(),
            api: "openai-completions".to_string(),
            api_key: "second-secret".to_string(),
            auth_header: false,
            models: vec![ModelProfile {
                id: "second-model".to_string(),
                name: "Second Model".to_string(),
                reasoning: false,
                input: vec!["text".to_string()],
                context_window: 64_000,
                max_tokens: 8_192,
            }],
            enabled: true,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn provider_json_uses_pi_native_shape() {
        let value = provider_json(&example_profile());
        assert_eq!(value["baseUrl"], "https://example.com/v1");
        assert_eq!(value["models"][0]["contextWindow"], 128_000);
        assert_eq!(value["models"][0]["reasoning"], true);
        assert!(value.get("apiKey").is_none());
    }

    #[test]
    fn live_config_contains_all_enabled_providers_and_preserves_unmanaged_entries() {
        let temp = TempDir::new().unwrap();
        atomic_write_json(
            &temp.path().join("models.json"),
            &json!({"providers": {"unmanaged": {"baseUrl": "https://keep.example.com"}}}),
        )
        .unwrap();
        let profiles = vec![example_profile(), second_profile()];
        let workspace = WorkspaceSettings {
            default_provider: "test-provider".to_string(),
            default_model: "test-model".to_string(),
            default_thinking: "high".to_string(),
        };
        let (models, auth, settings) =
            build_live_values(&profiles, &workspace, temp.path()).unwrap();

        assert!(models["providers"]["unmanaged"].is_object());
        assert!(models["providers"]["test-provider"].is_object());
        assert!(models["providers"]["second-provider"].is_object());
        assert_eq!(auth["test-provider"]["key"], "secret");
        assert_eq!(auth["second-provider"]["key"], "second-secret");
        assert_eq!(settings["defaultProvider"], "test-provider");
        assert_eq!(settings["enabledModels"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn model_url_candidates_match_openai_compatible_endpoints() {
        assert_eq!(
            model_url_candidates("http://127.0.0.1:8317/v1").unwrap(),
            vec!["http://127.0.0.1:8317/v1/models"]
        );
        assert_eq!(
            model_url_candidates("https://api.example.com").unwrap(),
            vec![
                "https://api.example.com/v1/models",
                "https://api.example.com/models"
            ]
        );
        assert_eq!(
            model_url_candidates("https://api.example.com/v1/responses").unwrap(),
            vec!["https://api.example.com/v1/models"]
        );
    }

    #[test]
    fn parses_and_sorts_cpa_model_response() {
        let models = parse_fetched_models(json!({
            "object": "list",
            "data": [
                {"id": "gpt-z", "owned_by": "openai"},
                {"id": "claude-a", "owned_by": "anthropic"}
            ]
        }))
        .unwrap();
        assert_eq!(models[0].id, "claude-a");
        assert_eq!(models[0].name, "claude-a");
        assert_eq!(models[1].owned_by.as_deref(), Some("openai"));
    }

    #[test]
    fn rejects_placeholder_models_for_connection_tests() {
        assert!(is_placeholder_model_id("model-id"));
        assert!(is_placeholder_model_id("model-12"));
        assert!(!is_placeholder_model_id("gpt-5.6-sol"));
        assert!(!is_text_test_model("gpt-image-2"));
    }
}
