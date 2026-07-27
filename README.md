# Pi Switch

Pi Switch is a Tauri desktop configuration manager for Pi Coding Agent. It manages a catalog of providers and models, then synchronizes all enabled entries to Pi's native configuration files.

## Current scope

- Multiple providers enabled at the same time
- Multiple models per provider
- Global default provider, model, and thinking level
- OpenAI Responses, OpenAI Chat Completions, Anthropic Messages, and Google Generative AI
- Provider connection testing through the installed `pi` executable
- Import from existing Pi configuration
- Atomic JSON writes and automatic backups
- SQLite single source of truth

## Files

Pi Switch data:

```text
~/.pi-switch/pi-switch.db
~/.pi-switch/backups/
```

Generated Pi configuration:

```text
~/.pi/agent/models.json
~/.pi/agent/auth.json
~/.pi/agent/settings.json
```

Pi Switch preserves fields and providers that it does not manage. API keys are never written to `models.json`; they are stored in the private SQLite database and synchronized to Pi's `auth.json` with user-only permissions.

## Development

```bash
npm install
npm run dev
npm run build
npm run tauri dev
```

Rust checks:

```bash
cd src-tauri
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
```

## CachyOS / Arch Linux package

Build the release binary and native package:

```bash
npm run tauri build -- --no-bundle
cd packaging/arch
makepkg --clean --force
```

Install the generated package with pacman:

```bash
sudo pacman -U ./pi-switch-0.1.0-1-x86_64.pkg.tar.zst
```

The package uses the system GTK and WebKit libraries, which is the preferred
distribution format for CachyOS. The Debian `.deb` bundle is not intended for
CachyOS or other Arch-based systems.
