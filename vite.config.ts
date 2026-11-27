import { defineConfig } from "vite";
import jahiaFederationPlugin from "@jahia/vite-federation-plugin";

export default defineConfig({
  build: {
    outDir: "javascript/apps",
  },

  plugins: [
    jahiaFederationPlugin({
      exposes: {
        "./init": "./src/index.ts",
      },
    }),
  ],
});
