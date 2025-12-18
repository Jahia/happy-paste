import { spawnSync } from "node:child_process";
import { defineConfig } from "vite";
import jahiaFederationPlugin from "@jahia/vite-federation-plugin";

export default defineConfig({
  build: {
    outDir: "javascript/apps",
  },

  plugins: [
    jahiaFederationPlugin({
      exposes: {
        "./init": "./src/index.tsx",
      },
    }),
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
