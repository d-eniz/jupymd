import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { FileSystemAdapter, TFile } from "obsidian";

export async function createTempFile(contents: string, prefix: string) {
	const tempDir = os.tmpdir();
	const filePath = path.join(tempDir, `${prefix}_${Date.now()}`);
	await fs.writeFile(filePath, contents, "utf-8");
	return filePath;
}

export async function getAbsolutePath(file: TFile): Promise<string> {
	const adapter = this.app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		const vaultPath = adapter.getBasePath();
		return path.join(vaultPath, file.path);
	} else {
		throw new Error("Cannot get base path: unsupported adapter type.");
	}
}
