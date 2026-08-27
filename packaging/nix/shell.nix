# Development shell for working on Pi Switch on NixOS.
#
# `nix develop` then use the usual workflow:
#   npm install        # first time only
#   npx tauri dev      # run the desktop app
#   cargo fmt && cargo clippy && npm run build   # what CI checks
{
  pkgs,
}:

pkgs.mkShell {
  packages = with pkgs; [
    # Rust toolchain + frontend tooling
    rustc
    cargo
    clippy
    rustfmt
    nodejs

    pkg-config
    dbus
    glib
    gtk3
    libsoup_3
    openssl
    webkitgtk_4_1
  ];

  shellHook = ''
    export GIO_MODULE_DIR="${pkgs.glib}/lib/gio/modules/"
    echo "Pi Switch dev shell: cargo $(${pkgs.cargo}/bin/cargo --version | cut -d' ' -f2), node $(node --version)"
  '';
}
