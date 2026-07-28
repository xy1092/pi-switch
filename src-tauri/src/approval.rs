use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

use crate::models::{ApprovalSettings, ApprovalStatus};
use crate::store::{home_dir, list_profiles, save_approval_settings as persist_settings};

const EXTENSION_SOURCE: &str = include_str!("../resources/pi-approval.ts");

fn extension_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?
        .join(".pi")
        .join("agent")
        .join("extensions")
        .join("pi-approval"))
}

fn status_for(dir: &std::path::Path) -> ApprovalStatus {
    ApprovalStatus {
        installed: dir.join("index.ts").is_file() && dir.join("config.json").is_file(),
        extension_path: dir.join("index.ts").display().to_string(),
        config_path: dir.join("config.json").display().to_string(),
    }
}

pub fn get_status() -> Result<ApprovalStatus, String> {
    let dir = extension_dir()?;
    Ok(status_for(&dir))
}

fn validate(settings: &ApprovalSettings) -> Result<(), String> {
    if !["manual", "auto", "locked"].contains(&settings.mode.as_str()) {
        return Err("Invalid approval mode.".to_string());
    }
    if !(3_000..=60_000).contains(&settings.timeout_ms) {
        return Err("Approval timeout must be between 3000 and 60000 ms.".to_string());
    }
    if !settings.enabled {
        return Ok(());
    }
    if settings.primary_model != "deepseek-v4-flash"
        || settings.escalation_model != "deepseek-v4-pro"
    {
        return Err("Approval models must be deepseek-v4-flash and deepseek-v4-pro.".to_string());
    }
    let profiles = list_profiles()?;
    for (provider, model, label) in [
        (
            &settings.primary_provider,
            &settings.primary_model,
            "primary",
        ),
        (
            &settings.escalation_provider,
            &settings.escalation_model,
            "escalation",
        ),
    ] {
        let exists = profiles.iter().any(|profile| {
            profile.enabled
                && &profile.id == provider
                && profile.models.iter().any(|entry| &entry.id == model)
        });
        if !exists {
            return Err(format!(
                "The {label} approval model {provider}/{model} is not enabled."
            ));
        }
    }
    Ok(())
}

pub fn save_settings(settings: ApprovalSettings) -> Result<ApprovalStatus, String> {
    validate(&settings)?;
    persist_settings(&settings)?;
    let dir = extension_dir()?;
    if !settings.enabled {
        for name in ["index.ts", "config.json"] {
            let path = dir.join(name);
            if path.exists() {
                fs::remove_file(path).map_err(|error| error.to_string())?;
            }
        }
        return Ok(status_for(&dir));
    }

    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    fs::set_permissions(&dir, fs::Permissions::from_mode(0o700))
        .map_err(|error| error.to_string())?;
    fs::write(dir.join("index.ts"), EXTENSION_SOURCE).map_err(|error| error.to_string())?;
    fs::write(
        dir.join("config.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?
        ),
    )
    .map_err(|error| error.to_string())?;
    for name in ["index.ts", "config.json"] {
        fs::set_permissions(dir.join(name), fs::Permissions::from_mode(0o600))
            .map_err(|error| error.to_string())?;
    }
    Ok(status_for(&dir))
}
