import { spawnSync } from "node:child_process";
import { defineConfig } from "vite";
import jahiaFederationPlugin from "@jahia/vite-federation-plugin";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  build: {
    outDir: "javascript/apps",
  },

  plugins: [
    jahiaFederationPlugin({
      exposes: {
        "./init": "./src/index.ts",
      },
      dts: false,
    }),
    {
      name: "watch-mode",
      closeBundle(error) {
        if (!this.meta.watchMode || error) return;
        spawnSync("node scripts/make-jar.mjs", { stdio: "inherit", shell: true });
        const jarFile = `dist/${pkg.name}-${pkg.version}.jar`;
        spawnSync(
          `curl -X POST -u root:root1234 http://localhost:8080/modules/api/provisioning \
          -F 'script=[{"installOrUpgradeBundle":"${pkg.name}-${pkg.version}.jar","ignoreChecks":true}]' -F 'file=@./${jarFile}'`,
          { stdio: "inherit", shell: true },
        );
      },
    },
  ],
});
