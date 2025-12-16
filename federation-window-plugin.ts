import type { ModuleFederationRuntimePlugin } from "@module-federation/enhanced/runtime";

export default function FederationWindowPlugin(): ModuleFederationRuntimePlugin {
  return {
    name: "federation-window-plugin",
    async loadEntry({ remoteInfo }) {
      if (remoteInfo.type !== "var") return;
      const { protocol, pathname } = new URL(remoteInfo.entry);
      if (protocol !== "window:") return;
      let mod: any = window;
      for (const segment of pathname.split(".")) mod = mod[segment];
      return mod;
    },
  };
}
