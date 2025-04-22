import { FileSystemAdapter} from "obsidian";

export function getVaultPath(adapter: FileSystemAdapter): string {
  return adapter.getBasePath();
}