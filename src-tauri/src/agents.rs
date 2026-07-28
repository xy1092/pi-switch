use std::fs::{self, OpenOptions};
use std::io::Write;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};

use crate::models::{AgentProfile, AgentStatus};
use crate::store::{
    delete_agent_profile, home_dir, list_agent_profiles, list_profiles, save_agent_profile,
};

const SUBAGENT_INDEX: &str = include_str!("../resources/subagent/index.ts");
const SUBAGENT_AGENTS: &str = include_str!("../resources/subagent/agents.ts");
const ALLOWED_TOOLS: [&str; 7] = ["read", "grep", "find", "ls", "bash", "edit", "write"];

fn agent_root() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".pi").join("agent"))
}

fn agents_dir() -> Result<PathBuf, String> {
    Ok(agent_root()?.join("agents"))
}

fn extension_dir() -> Result<PathBuf, String> {
    Ok(agent_root()?.join("extensions").join("subagent"))
}

fn ensure_private_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| error.to_string())?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|error| error.to_string())
}

fn write_private(path: &Path, content: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid agent path.".to_string())?;
    ensure_private_dir(parent)?;
    let temp = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("agent"),
        std::process::id()
    ));
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&temp)
        .map_err(|error| error.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    fs::rename(&temp, path).map_err(|error| error.to_string())?;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|error| error.to_string())
}

fn install_extension() -> Result<(), String> {
    let dir = extension_dir()?;
    ensure_private_dir(&dir)?;
    for (name, source) in [("index.ts", SUBAGENT_INDEX), ("agents.ts", SUBAGENT_AGENTS)] {
        let path = dir.join(name);
        if fs::read_to_string(&path).ok().as_deref() != Some(source) {
            write_private(&path, source)?;
        }
    }
    Ok(())
}

fn status() -> Result<AgentStatus, String> {
    let agents = agents_dir()?;
    let extension = extension_dir()?;
    Ok(AgentStatus {
        extension_installed: extension.join("index.ts").is_file()
            && extension.join("agents.ts").is_file(),
        agents_path: agents.display().to_string(),
        extension_path: extension.join("index.ts").display().to_string(),
    })
}

fn validate(profile: &AgentProfile) -> Result<(), String> {
    if profile.name.is_empty()
        || !profile
            .name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".-_".contains(character))
    {
        return Err(
            "Agent name may only contain letters, numbers, dots, dashes, and underscores."
                .to_string(),
        );
    }
    if profile.description.trim().is_empty() {
        return Err("Agent description is required.".to_string());
    }
    if profile.system_prompt.trim().is_empty() {
        return Err("Agent system prompt is required.".to_string());
    }
    if !["off", "minimal", "low", "medium", "high", "xhigh", "max"]
        .contains(&profile.thinking.as_str())
    {
        return Err("Invalid thinking level.".to_string());
    }
    if profile
        .tools
        .iter()
        .any(|tool| !ALLOWED_TOOLS.contains(&tool.as_str()))
    {
        return Err("Agent contains an unsupported tool.".to_string());
    }
    if profile.tools.is_empty() {
        return Err("Select at least one Agent tool.".to_string());
    }
    let model_exists = list_profiles()?.iter().any(|provider| {
        provider.enabled
            && provider.id == profile.provider
            && provider
                .models
                .iter()
                .any(|model| model.id == profile.model)
    });
    if !model_exists {
        return Err(format!(
            "Agent model {}/{} is not enabled.",
            profile.provider, profile.model
        ));
    }
    Ok(())
}

fn profile_markdown(profile: &AgentProfile) -> String {
    let model = if profile.thinking == "off" {
        format!("{}/{}:off", profile.provider, profile.model)
    } else {
        format!(
            "{}/{}:{}",
            profile.provider, profile.model, profile.thinking
        )
    };
    let description = serde_json::to_string(&profile.description.replace(['\n', '\r'], " "))
        .unwrap_or_else(|_| "\"Agent\"".to_string());
    format!(
        "---\nname: {}\ndescription: {}\ntools: {}\nmodel: {}\n---\n\n{}\n",
        profile.name,
        description,
        profile.tools.join(", "),
        model,
        profile.system_prompt.trim()
    )
}

fn sync_profile_file(profile: &AgentProfile) -> Result<(), String> {
    let path = agents_dir()?.join(format!("{}.md", profile.name));
    if profile.enabled {
        write_private(&path, &profile_markdown(profile))
    } else if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())
    } else {
        Ok(())
    }
}

fn parse_existing(path: &Path) -> Option<AgentProfile> {
    let content = fs::read_to_string(path).ok()?;
    let mut sections = content.splitn(3, "---");
    sections.next()?;
    let frontmatter = sections.next()?;
    let body = sections.next()?.trim().to_string();
    let mut name = String::new();
    let mut description = String::new();
    let mut tools = Vec::new();
    let mut model_reference = String::new();
    for line in frontmatter.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        match key.trim() {
            "name" => name = value.trim().to_string(),
            "description" => {
                let raw = value.trim();
                description = serde_json::from_str(raw).unwrap_or_else(|_| raw.to_string())
            }
            "tools" => {
                tools = value
                    .split(',')
                    .map(str::trim)
                    .filter(|tool| ALLOWED_TOOLS.contains(tool))
                    .map(str::to_string)
                    .collect()
            }
            "model" => model_reference = value.trim().to_string(),
            _ => {}
        }
    }
    let (provider, model_with_thinking) = model_reference.split_once('/')?;
    let (model, thinking) = model_with_thinking
        .rsplit_once(':')
        .filter(|(_, level)| {
            ["off", "minimal", "low", "medium", "high", "xhigh", "max"].contains(level)
        })
        .unwrap_or((model_with_thinking, "off"));
    Some(AgentProfile {
        name,
        description,
        provider: provider.to_string(),
        model: model.to_string(),
        thinking: thinking.to_string(),
        tools,
        system_prompt: body,
        enabled: true,
        created_at: 0,
        updated_at: 0,
    })
}

fn import_existing_if_empty() -> Result<(), String> {
    if !list_agent_profiles()?.is_empty() {
        return Ok(());
    }
    let dir = agents_dir()?;
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }
        if let Some(profile) = parse_existing(&path) {
            if !profile.name.is_empty()
                && profile
                    .name
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || ".-_".contains(character))
            {
                save_agent_profile(profile)?;
            }
        }
    }
    Ok(())
}

pub fn list() -> Result<Vec<AgentProfile>, String> {
    import_existing_if_empty()?;
    let profiles = list_agent_profiles()?;
    if profiles.iter().any(|profile| profile.enabled) {
        install_extension()?;
    }
    Ok(profiles)
}

pub fn get_status() -> Result<AgentStatus, String> {
    if list_agent_profiles()?.iter().any(|profile| profile.enabled) {
        install_extension()?;
    }
    status()
}

pub fn save(profile: AgentProfile) -> Result<AgentProfile, String> {
    validate(&profile)?;
    let saved = save_agent_profile(profile)?;
    sync_profile_file(&saved)?;
    if saved.enabled {
        install_extension()?;
    }
    Ok(saved)
}

pub fn delete(name: &str) -> Result<(), String> {
    if name.is_empty()
        || !name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".-_".contains(character))
    {
        return Err("Invalid agent name.".to_string());
    }
    let path = agents_dir()?.join(format!("{name}.md"));
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    delete_agent_profile(name)
}

fn find_model(model_id: &str) -> Result<(String, String), String> {
    list_profiles()?
        .into_iter()
        .filter(|profile| profile.enabled)
        .find_map(|profile| {
            profile
                .models
                .iter()
                .find(|model| model.id == model_id)
                .map(|model| (profile.id.clone(), model.id.clone()))
        })
        .ok_or_else(|| format!("Required model is not enabled: {model_id}"))
}

fn template(
    name: &str,
    description: &str,
    model_id: &str,
    thinking: &str,
    tools: &[&str],
    prompt: &str,
) -> Result<AgentProfile, String> {
    let (provider, model) = find_model(model_id)?;
    Ok(AgentProfile {
        name: name.to_string(),
        description: description.to_string(),
        provider,
        model,
        thinking: thinking.to_string(),
        tools: tools.iter().map(|tool| (*tool).to_string()).collect(),
        system_prompt: prompt.to_string(),
        enabled: true,
        created_at: 0,
        updated_at: 0,
    })
}

pub fn install_defaults() -> Result<Vec<AgentProfile>, String> {
    let definitions = vec![
        template(
            "explorer-fast",
            "快速定位文件、符号、依赖和调用链",
            "deepseek-v4-flash",
            "off",
            &["read", "grep", "find", "ls"],
            "You are a fast read-only code explorer. Locate relevant files, symbols, dependencies, and call chains. Return concise findings with exact file paths and line references. Do not propose edits unless asked; never claim to have changed files.",
        )?,
        template(
            "analyst-deep",
            "分析大型日志、文档和复杂上下文",
            "deepseek-v4-pro",
            "high",
            &["read", "grep", "find", "ls"],
            "You are a read-only evidence analyst. Analyze large repositories, logs, documentation, and history. Separate verified facts from hypotheses and cite the exact evidence used. Return unresolved questions explicitly.",
        )?,
        template(
            "planner",
            "为复杂或高风险任务制定可验证的实施计划",
            "gpt-5.6-sol",
            "xhigh",
            &["read", "grep", "find", "ls"],
            "You are a read-only implementation planner. Inspect the existing system before designing changes. Produce a concrete plan with ownership boundaries, risks, verification steps, and rollback considerations. Do not edit files.",
        )?,
        template(
            "implementer",
            "在当前项目内实现、调试并验证改动",
            "gpt-5.6-terra",
            "high",
            &["read", "grep", "find", "ls", "edit", "write", "bash"],
            "You are an implementation agent working inside the requested project. Follow existing patterns, keep changes scoped, run proportionate tests, and report every changed file plus verification evidence. Do not publish, push, or modify external paths without explicit authorization.",
        )?,
        template(
            "reviewer",
            "独立审查缺陷、回归风险和测试缺口",
            "gpt-5.6-sol",
            "xhigh",
            &["read", "grep", "find", "ls", "bash"],
            "You are an independent code reviewer. Prioritize concrete bugs, security issues, behavioral regressions, and missing tests. Report findings first, ordered by severity, with exact file and line references. Do not modify files or silently fix findings.",
        )?,
    ];
    for profile in definitions {
        save(profile)?;
    }
    list_agent_profiles()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn example() -> AgentProfile {
        AgentProfile {
            name: "explorer-fast".to_string(),
            description: "Search code: files and symbols".to_string(),
            provider: "deepseek".to_string(),
            model: "deepseek-v4-flash".to_string(),
            thinking: "off".to_string(),
            tools: vec!["read".to_string(), "grep".to_string()],
            system_prompt: "Read only.\nReturn evidence.".to_string(),
            enabled: true,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn markdown_round_trip_preserves_profile_fields() {
        let temp = tempfile::NamedTempFile::new().unwrap();
        fs::write(temp.path(), profile_markdown(&example())).unwrap();
        let parsed = parse_existing(temp.path()).unwrap();
        assert_eq!(parsed.name, "explorer-fast");
        assert_eq!(parsed.description, "Search code: files and symbols");
        assert_eq!(parsed.provider, "deepseek");
        assert_eq!(parsed.model, "deepseek-v4-flash");
        assert_eq!(parsed.thinking, "off");
        assert_eq!(parsed.tools, vec!["read", "grep"]);
        assert_eq!(parsed.system_prompt, "Read only.\nReturn evidence.");
    }
}
