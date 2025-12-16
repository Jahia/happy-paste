import type { ModuleFederationRuntimePlugin } from "@module-federation/enhanced/runtime";

export default function FederationGlobalPlugin(): ModuleFederationRuntimePlugin {
  return {
    name: "federation-global-plugin",
    async loadEntry({ remoteInfo }) {
      if (remoteInfo.type !== "global") return;
      const { pathname } = new URL(remoteInfo.entry);
      let mod: any = globalThis;
      for (const segment of pathname.split(".")) mod = mod[segment];
      return mod;
    },
  };
}
