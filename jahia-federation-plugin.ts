import { federation } from "@module-federation/vite";
import type { ModuleFederationOptions } from "@module-federation/vite/lib/utils/normalizeModuleFederationOptions";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import moduleFederationVitePkg from "@module-federation/vite/package.json" with { type: "json" };

/**
 * Vite Plugin for Jahia's Module Federation setup.
 *
 * For now, this plugin assumes that the output directory is "javascript/apps" live.
 */
export function jahiaFederationPlugin(
  options: {
    /** Name of the module in `appShell.remotes` and for the rest of the federation. Defaults to package.json name. */
    name?: string;

    exposes: {
      /** Entrypoint used to load the UI extension. */
      "./init": string;
      /** Entrypoint used to expose exports to federated modules. */
      "."?: string;
    } & Record<string, string>;

    /**
     * By default all package.json dependencies are shared as singletons.
     *
     * Additional dependencies can be specified here.
     */
    shared?: Record<
      string,
      {
        /** @see https://module-federation.io/configure/shared.html#singleton */
        singleton?: boolean;
        /** @see https://module-federation.io/configure/shared.html#requiredVersion */
        requiredVersion?: string;
        strictVersion?: boolean;
      }
    >;
  } & Omit<ModuleFederationOptions, "name" | "filename" | "exposes" | "shared">,
): Plugin[] {
  if (!process.env.npm_package_json) {
    throw new Error("npm_package_json is not defined in the env vars.");
  }

  const pkg = JSON.parse(readFileSync(process.env.npm_package_json, "utf-8"));
  const name: string = options.name ?? pkg.name;

  if (!name) {
    throw new Error("Federation module name is not defined in options and package.json.");
  }

  /** Direct production dependencies from package.json */
  const dependencies = Object.keys((pkg.dependencies as Record<string, string>) ?? {});

  return [
    {
      name: "jahia-federation-plugin",
      config(config) {
        return {
          esbuild: { jsx: "automatic" },
          base: "", // Ensure all assets are emitted with relative paths
          define: {
            "process.env.NODE_ENV": JSON.stringify(
              config.build?.watch ? "development" : "production",
            ),
          },
          build: {
            sourcemap: true,
            minify: !config.build?.watch,
            rollupOptions: { input: Object.values(options.exposes) },
          },
        };
      },
      buildEnd() {
        // We assume these files are exposed under the "javascript/apps" path live,
        // regardless of the actual output directory configured in Vite.
        this.emitFile({
          type: "asset",
          fileName: "remoteEntry.js",
          source: `appShell.remotes[${JSON.stringify(name)}]={builder:"name@version ${moduleFederationVitePkg.name}@${moduleFederationVitePkg.version}",async init(...a){const m=await import("./index.js");await m.init(...a);Object.assign(this,m)}};`,
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
    ...federation({
      ...options,
      name,
      filename: "index.js",
      shared: {
        ...Object.fromEntries(dependencies.map((dep) => [dep, { singleton: true }])),
        ...options.shared,
      },
      remotes: {
        // Common remotes provided by official Jahia modules
        "@jahia/jcontent": "window:appShell.remotes.jcontent",
        "@jahia/jahia-ui-root": "window:appShell.remotes.jahiaUi",
        ckeditor5: "window:appShell.remotes.ckeditor5",
        ...options.remotes,
      },
      runtimePlugins: [
        import.meta.resolve("./federation-window-plugin.ts"),
        ...(options.runtimePlugins ?? []),
      ],
    }),
  ];
}
