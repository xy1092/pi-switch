use serde::{Deserialize, Serialize};

fn default_input() -> Vec<String> {
    vec!["text".to_string()]
}

fn default_thinking() -> String {
    "off".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfile {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub reasoning: bool,
    #[serde(default = "default_input")]
    pub input: Vec<String>,
    #[serde(default)]
    pub context_window: Option<u64>,
    #[serde(default)]
    pub max_tokens: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub auth_header: bool,
    /// Fallback context window for models that don't declare their own.
    #[serde(default)]
    pub default_context_window: Option<u64>,
    #[serde(default)]
    pub models: Vec<ModelProfile>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSettings {
    #[serde(default)]
    pub default_provider: String,
    #[serde(default)]
    pub default_model: String,
    #[serde(default = "default_thinking")]
    pub default_thinking: String,
}

fn default_approval_mode() -> String {
    "manual".to_string()
}

fn default_approval_timeout() -> u64 {
    12_000
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_approval_mode")]
    pub mode: String,
    #[serde(default)]
    pub primary_provider: String,
    #[serde(default = "default_flash_model")]
    pub primary_model: String,
    #[serde(default)]
    pub escalation_provider: String,
    #[serde(default = "default_pro_model")]
    pub escalation_model: String,
    #[serde(default = "default_approval_timeout")]
    pub timeout_ms: u64,
    #[serde(default = "default_true")]
    pub allow_project_writes: bool,
    #[serde(default = "default_true")]
    pub always_ask_network: bool,
}

fn default_flash_model() -> String {
    "deepseek-v4-flash".to_string()
}

fn default_pro_model() -> String {
    "deepseek-v4-pro".to_string()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalStatus {
    pub installed: bool,
    pub extension_path: String,
    pub config_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfile {
    pub name: String,
    pub description: String,
    pub provider: String,
    pub model: String,
    #[serde(default = "default_thinking")]
    pub thinking: String,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    pub extension_installed: bool,
    pub agents_path: String,
    pub extension_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub pi_version: Option<String>,
    pub pi_available: bool,
    pub data_path: String,
    pub models_path: String,
    pub auth_path: String,
    pub settings_path: String,
    pub live_config_exists: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub provider_count: usize,
    pub model_count: usize,
    pub model_reference: String,
    pub backup_id: String,
    pub models_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    pub ok: bool,
    pub message: String,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FetchedModel {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub owned_by: Option<String>,
    #[serde(default)]
    pub context_window: Option<u64>,
    #[serde(default)]
    pub max_tokens: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub id: String,
    pub path: String,
    pub created_at: i64,
}
