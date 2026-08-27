# Derivation for building Pi Switch as a plain Nix store package.
#
# Uses nixpkgs' cargo-tauri hook so the frontend (vite) and the Rust binary
# are built in one derivation, without any bundling step — the wrapped
# `pi-switch` binary plus desktop file/icon are what we install.
#
# The version is read from src-tauri/tauri.conf.json to avoid drift between
# Cargo.toml, package.json and this file.
{
  lib,
  rustPlatform,
  cargo-tauri,
  fetchNpmDeps,
  nodejs,
  npmHooks,
  pkg-config,
  wrapGAppsHook3,

  dbus,
  glib,
  gtk3,
  libsoup_3,
  openssl,
  webkitgtk_4_1,
}:

let
  tauriConf = builtins.fromJSON (builtins.readFile (src + "/src-tauri/tauri.conf.json"));

  pname = lib.toLower (lib.replaceStrings [ " " ] [ "-" ] tauriConf.productName);

  src = lib.cleanSourceWith {
    src = ../..;
    filter =
      path: type:
      !(type == "directory" && builtins.elem (baseNameOf path) [ "target" "node_modules" "dist" "result" ]);
  };
in
rustPlatform.buildRustPackage {
  inherit pname src;
  version = tauriConf.version;

  # Hashes are pinned for reproducible builds; nix prints the expected
  # values on mismatch ("got: sha256-…"), so updating is mechanical.
  cargoHash = "sha256-y5b4zV7iHBCpZ6shr/uKFzS3Efc2t5ApKpPC19jMHqg=";

  npmDeps = fetchNpmDeps {
    inherit pname src;
    name = "${pname}-npm-deps";
    hash = "sha256-0Gq8+vFLkqVkeR2ayHhSN56KI4Nh4h4/Gfi1Fxjx6Ew=";
  };

  # The Rust crate lives in a subdirectory, the frontend is driven by the
  # tauri CLI (`beforeBuildCommand` runs `npm run build`).
  cargoRoot = "src-tauri";
  buildAndTestSubdir = "src-tauri";

  # Skip double-compiling the whole dependency tree for `cargo test`;
  # tests stay available via `nix develop -c cargo test`.
  doCheck = false;

  nativeBuildInputs = [
    cargo-tauri.hook
    nodejs
    npmHooks.npmConfigHook
    pkg-config
    wrapGAppsHook3
  ];

  buildInputs = [
    dbus
    glib
    gtk3
    libsoup_3
    openssl
    webkitgtk_4_1
  ];

  # tauriInstallHook already drops a "<ProductName>.desktop" and icons into
  # the output; replace them with one canonical lowercase entry so there is
  # no duplicate desktop item.
  postInstall = ''
    rm -f "$out/share/applications/${tauriConf.productName}.desktop"
    rm -rf "$out/share/icons/hicolor/256x256@2"
    # tauri installs the @2x icon into a non-standard "256x256@2" dir;
    # provide the standard 256x256 path ourselves.
    install -Dm644 "$NIX_BUILD_TOP/source/src-tauri/icons/128x128@2x.png" \
      "$out/share/icons/hicolor/256x256/apps/${pname}.png"

    cat > ${pname}.desktop <<EOF
[Desktop Entry]
Type=Application
Name=${tauriConf.productName}
Comment=Desktop provider & model configuration manager for Pi Coding Agent
Exec=${pname} %U
Icon=${pname}
Terminal=false
Categories=Development;Utility;
Keywords=pi;llm;provider;model;agent;
StartupWMClass=${pname}
EOF
    install -Dm644 ${pname}.desktop "$out/share/applications/${pname}.desktop"
  '';

  meta = {
    description = "Desktop provider and model configuration manager for Pi Coding Agent";
    homepage = "https://github.com/xy1092/pi-switch";
    license = lib.licenses.mit;
    mainProgram = pname;
    platforms = lib.platforms.linux;
  };
}
