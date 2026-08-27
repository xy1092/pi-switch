//! Capability packs — extra Pi extensions shipped with Pi Switch.
//!
//! Mirrors the approval extension install pattern: each pack is a single
//! TypeScript file embedded at build time and written into
//! `~/.pi/agent/extensions/<dir>/index.ts` (mode 0600) at app startup,
//! same convention as the auto-installed official subagent scheduler.
//! To disable one, delete its directory (management UI planned).

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

use crate::store::home_dir;

struct Pack {
    dir: &'static str,
    title: &'static str,
    source: &'static str,
}

const PACKS: [Pack; 3] = [
    Pack {
        dir: "pi-sweep",
        title: "聚合调研 sweep",
        source: include_str!("../resources/pi-sweep.ts"),
    },
    Pack {
        dir: "pi-memory",
        title: "项目记忆 remember",
        source: include_str!("../resources/pi-memory.ts"),
    },
    Pack {
        dir: "pi-safety",
        title: "改动安全网 undo",
        source: include_str!("../resources/pi-safety.ts"),
    },
];

fn pack_dir(dir: &str) -> Result<PathBuf, String> {
    Ok(home_dir()?
        .join(".pi")
        .join("agent")
        .join("extensions")
        .join(dir))
}

/// Install every pack whose embedded source differs from disk (idempotent).
/// Returns titles actually written this run.
pub fn install_all() -> Vec<&'static str> {
    let mut updated = Vec::new();
    for pack in &PACKS {
        let Ok(dir) = pack_dir(pack.dir) else {
            continue;
        };
        let target = dir.join("index.ts");
        if fs::read_to_string(&target).ok().as_deref() == Some(pack.source) {
            continue;
        }
        if fs::create_dir_all(&dir).is_err() {
            continue;
        }
        let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
        if fs::write(&target, pack.source).is_ok() {
            let _ = fs::set_permissions(&target, fs::Permissions::from_mode(0o600));
            updated.push(pack.title);
        }
    }
    updated
}
