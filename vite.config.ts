import { defineConfig } from "vite";
import { federation } from "@module-federation/vite";
import pkg from "./package.json";
import { spawnSync } from "node:child_process";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  build: {
    rollupOptions: {
      input: "./src/index.tsx",
    },
    outDir: "javascript/apps",
    assetsDir: "",
    minify: false,
  },

  base: "",
  plugins: [
    federation({
      name: pkg.name,
      shared: Object.fromEntries(
        Object.keys(pkg.dependencies).map((dep) => [dep, { singleton: true }]),
      ),
      filename: "index.js",
      remotes: {
        ckeditor5: {
          type: "global",
          name: "ckeditor5",
          entry: "global:appShell.remotes.ckeditor5",
        },
      },
      exposes: {
        "./init": "./src/index.tsx",
      },
      runtimePlugins: ["./federation-global-plugin.ts"],
    }),
    {
      name: "iife-entrypoint",
      buildEnd() {
        this.emitFile({
          type: "asset",
          fileName: "remoteEntry.js",
          source: `appShell.remotes[${JSON.stringify(pkg.name)}]={async init(...a){const m=await import("./index.js");await m.init(...a);Object.assign(this,m)}}`,
        });
        this.emitFile({
          type: "asset",
          fileName: "package.json",
          source: JSON.stringify({
            jahia: { remotes: { jahia: "javascript/apps/remoteEntry.js" } },
          }),
        });
      },
    },
    {
      name: "watch-mode",
      closeBundle(error) {
        if (!this.meta.watchMode || error) return;
        spawnSync("yarn pack --out dist/package.tgz", { stdio: "inherit", shell: true });
        spawnSync(
          `curl -X POST -u root:root1234 http://localhost:8080/modules/api/provisioning \
          -F 'script=[{"installOrUpgradeBundle":"package.tgz","ignoreChecks":true}]' -F 'file=@./dist/package.tgz'`,
          { stdio: "inherit", shell: true },
        );
      },
    },
  ],
});
