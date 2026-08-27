# Pi Switch

Pi Switch 是给 [Pi Coding Agent](https://github.com/badlogic/pi-mono) 用的桌面配置管理器，基于 Tauri 2 + React 19。它维护一份供应商与模型清单，再把所有启用项同步写入 Pi 的原生配置文件。

界面参照 [cc-switch](https://github.com/farion1231/cc-switch) 设计：顶栏分段切换 + 白色圆角卡片列表，全中文，支持浅色/深色主题自动跟随系统。

## 功能

- 多个供应商同时启用，每个供应商可配置多个模型
- 全局默认供应商、默认模型、默认思考强度
- 卡片上一键「设为默认」，立即写入 Pi 配置
- 支持 OpenAI Responses、OpenAI Chat Completions、Anthropic Messages、Google Generative AI 四种接口协议
- 通过 OpenAI 兼容的 `/v1/models` 接口拉取并批量导入模型，支持 CPA/CLIProxyAPI
- 通过本机已安装的 `pi` 可执行文件做连通性测试
- 从现有 Pi 配置导入
- 原子写入 JSON，每次应用前自动备份，可一键恢复
- SQLite 作为唯一数据源
- Pi 执行前权限审批，支持手动、DeepSeek 自动审批和锁定模式
- 审批模型自由选择：从已启用供应商的任意模型中指定主审与复核（默认推荐快速模型主审、强力模型复核）
- Pi 内使用 `/permission` 选择每次询问、Approve for me、锁定或本会话完全访问
- 上下文窗口三级取值：模型显式值 → 供应商默认 → 内置基准（GPT-5.6 同款 1,050,000）；输出上限仅在接口返回时导入，未知则省略不猜
- 启动即自动安装三个能力扩展包：`/sweep` 多视角并行调研汇总、`/remember`+`.pi/MEMORY.md` 项目记忆注入、edit/write 前影子快照 + `/undo` 回滚
- 全局子 Agent 的新建、编辑、复制、启停和删除
- 一键安装 explorer、analyst、planner、implementer、reviewer 五个推荐模板
- 自动安装 Pi 官方 `subagent` 调度器，支持单次、并行和链式委派

## 界面

顶栏：品牌名、供应商/Agents/权限/备份分段切换、导入与刷新工具按钮、右上新建按钮。

状态条：Pi 版本与启用数量、默认供应商/默认模型/思考强度三个下拉、「应用到 Pi」主按钮。

供应商卡片：首字母头像、名称与「当前使用」标签、请求地址、模型数与 ID，右侧「设为默认」及编辑/复制/删除操作。点击卡片进入全屏编辑页，分「基本信息」和「模型列表」两个面板。

## 文件位置

Pi Switch 自身数据：

```text
~/.pi-switch/pi-switch.db
~/.pi-switch/backups/
```

生成的 Pi 配置：

```text
~/.pi/agent/models.json
~/.pi/agent/auth.json
~/.pi/agent/settings.json
~/.pi/agent/extensions/pi-approval/index.ts
~/.pi/agent/extensions/pi-approval/config.json
~/.pi/agent/extensions/pi-approval/audit/
~/.pi/agent/agents/*.md
~/.pi/agent/extensions/subagent/index.ts
```

Pi Switch 会保留它不管理的字段和供应商。API Key 不会写入 `models.json`，而是存在私有 SQLite 数据库里，并以仅用户可读的权限同步到 Pi 的 `auth.json`。

## 开发

```bash
npm install
npm run dev          # 仅前端，浏览器预览（使用内置示例数据）
npm run build        # tsc 类型检查 + vite 构建
npm run tauri dev    # 完整桌面应用
```

Rust 检查：

```bash
cd src-tauri
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
```

## NixOS

仓库自带 flake，提供 `packages.default`（打包好的桌面应用）与 `devShells.default`（开发环境）：

```bash
# 直接运行
nix run github:xy1092/pi-switch

# 安装进当前系统配置
nix build github:xy1092/pi-switch   # 或本地： nix build .
```

在 `/etc/nixos/flake.nix` 里作为 input 使用：

```nix
inputs.pi-switch.url = "github:xy1092/pi-switch";

# modules 里：
environment.systemPackages = [
  pi-switch.packages.${pkgs.system}.default
];
```

flake 锁定的 nixpkgs 为 `nixos-26.05`，与本机频道一致时 webkitGTK 等大依赖直接复用系统缓存。

参与开发：

```bash
nix develop          # 提供完整的 Rust + Node + GTK/webkit 工具链
npm install
npm run tauri dev
```

注意：构建遵循全局 nix 配置的并行度限制，首次全量编译较慢属于正常现象；之后依赖全部命中缓存。版本号自动读取 `src-tauri/tauri.conf.json`，改动依赖后需要按提示更新 `packaging/nix/package.nix` 中的两个 hash。

## CachyOS / Arch Linux 打包

构建 release 二进制并打包：

```bash
npm run tauri build -- --no-bundle
cd packaging/arch
makepkg --clean --force
```

安装：

```bash
sudo pacman -U ./pi-switch-0.4.0-1-x86_64.pkg.tar.zst
```

### 更新已安装的版本

改完代码后重复上面三步即可，pacman 会按版本号识别为升级并覆盖旧文件，`~/.pi-switch/pi-switch.db` 里的配置数据不受影响。若版本号未变化，需要用 `sudo pacman -U --overwrite '*' <包文件>` 强制覆盖。

该包使用系统自带的 GTK 与 WebKit 库，是 CachyOS 上推荐的分发格式。Debian `.deb` 包不适用于 Arch 系发行版。

## 许可

MIT
