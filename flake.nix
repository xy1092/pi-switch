{
  description = "Pi Switch — desktop provider & model configuration manager for Pi Coding Agent";

  inputs = {
    # Match the system channel so big native deps (webkitGTK, GTK…) resolve to
    # the same store paths already on the machine — no duplicate closure.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    systems.url = "github:nix-systems/default-linux";
  };

  outputs =
    {
      self,
      nixpkgs,
      systems,
    }:
    let
      inherit (nixpkgs) lib;
      eachSystem =
        f:
        lib.genAttrs (import systems) (
          system:
          let
            pkgs = nixpkgs.legacyPackages.${system};
          in
          if pkgs.stdenv.isLinux then f { inherit system pkgs; } else null
        );
    in
    {
      packages = eachSystem (
        { pkgs, ... }:
        let
          pi-switch = pkgs.callPackage ./packaging/nix/package.nix { };
        in
        {
          inherit pi-switch;
          default = pi-switch;
        }
      );

      devShells = eachSystem ({ pkgs, ... }: import ./packaging/nix/shell.nix { inherit pkgs; });
    };
}
