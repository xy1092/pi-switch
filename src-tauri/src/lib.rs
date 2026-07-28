mod agents;
mod approval;
mod models;
mod pi_config;
mod store;

use models::{
    AgentProfile, AgentStatus, AppStatus, ApprovalSettings, ApprovalStatus, BackupInfo,
    FetchedModel, ProviderProfile, SyncResult, TestResult, WorkspaceSettings,
};

#[tauri::command]
fn get_app_status() -> Result<AppStatus, String> {
    pi_config::app_status()
}

#[tauri::command]
fn list_profiles() -> Result<Vec<ProviderProfile>, String> {
    store::list_profiles()
}

#[tauri::command]
fn save_profile(profile: ProviderProfile) -> Result<ProviderProfile, String> {
    store::save_profile(profile)
}

#[tauri::command]
fn delete_profile(id: String) -> Result<(), String> {
    store::delete_profile(&id)
}

#[tauri::command]
fn get_workspace_settings() -> Result<WorkspaceSettings, String> {
    store::get_workspace_settings()
}

#[tauri::command]
fn sync_configuration(workspace: WorkspaceSettings) -> Result<SyncResult, String> {
    pi_config::sync_configuration(workspace)
}

#[tauri::command]
async fn test_profile(profile: ProviderProfile) -> Result<TestResult, String> {
    pi_config::test_profile(profile).await
}

#[tauri::command]
async fn fetch_provider_models(
    base_url: String,
    api_key: String,
) -> Result<Vec<FetchedModel>, String> {
    pi_config::fetch_provider_models(&base_url, &api_key).await
}

#[tauri::command]
fn import_live_config() -> Result<Vec<ProviderProfile>, String> {
    pi_config::import_live()
}

#[tauri::command]
fn list_backups() -> Result<Vec<BackupInfo>, String> {
    pi_config::list_backups()
}

#[tauri::command]
fn restore_backup(id: String) -> Result<(), String> {
    pi_config::restore_backup(&id)
}

#[tauri::command]
fn get_approval_settings() -> Result<ApprovalSettings, String> {
    store::get_approval_settings()
}

#[tauri::command]
fn get_approval_status() -> Result<ApprovalStatus, String> {
    approval::get_status()
}

#[tauri::command]
fn save_approval_settings(settings: ApprovalSettings) -> Result<ApprovalStatus, String> {
    approval::save_settings(settings)
}

#[tauri::command]
fn list_agents() -> Result<Vec<AgentProfile>, String> {
    agents::list()
}

#[tauri::command]
fn get_agent_status() -> Result<AgentStatus, String> {
    agents::get_status()
}

#[tauri::command]
fn save_agent(profile: AgentProfile) -> Result<AgentProfile, String> {
    agents::save(profile)
}

#[tauri::command]
fn delete_agent(name: String) -> Result<(), String> {
    agents::delete(&name)
}

#[tauri::command]
fn install_default_agents() -> Result<Vec<AgentProfile>, String> {
    agents::install_defaults()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_app_status,
            list_profiles,
            save_profile,
            delete_profile,
            get_workspace_settings,
            sync_configuration,
            test_profile,
            fetch_provider_models,
            import_live_config,
            list_backups,
            restore_backup,
            get_approval_settings,
            get_approval_status,
            save_approval_settings,
            list_agents,
            get_agent_status,
            save_agent,
            delete_agent,
            install_default_agents
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
