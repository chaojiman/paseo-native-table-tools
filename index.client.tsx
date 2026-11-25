import type { PluginClientContext } from "@getpaseo/plugin/client";
import { mountNativeTableTools } from "./client/web";

export default function contribute(_client: PluginClientContext) {
  return mountNativeTableTools();
}
