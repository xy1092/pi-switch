mod models;
mod pi_config;
mod store;

use models::{AppStatus, BackupInfo, ProviderProfile, SyncResult, TestResult, WorkspaceSettings};

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
            import_live_config,
            list_backups,
            restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
