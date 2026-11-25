import type { PluginClientContext } from "@getpaseo/plugin/client";
import { mountNativeTableTools } from "./client/web";

export default function contribute(client: PluginClientContext) {
  return mountNativeTableTools(client.i18n);
}
