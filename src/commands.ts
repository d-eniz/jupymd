import { Notice } from "obsidian";
import JupyMDPlugin from "./main";
import { bakeOutputsForFile, clearBakedOutputs } from "./components/bakeOutputs";

export function registerCommands(plugin: JupyMDPlugin) {
	const { fileSync } = plugin;
	const { executor } = plugin;

	plugin.addCommand({
		id: "create-jupyter-notebook",
		name: "Create Jupyter notebook from note",
		callback: () => fileSync.createNotebook(),
	});

	plugin.addCommand({
		id: "create-note-from-jupyter-notebook",
		name: "Create note from Jupyter notebook",
		callback: () => fileSync.convertNotebookToNote(),
	});

	plugin.addCommand({
		id: "open-jupyter-notebook-editor",
		name: "Open Jupyter notebook in editor",
		callback: () => fileSync.openNotebookInEditor(plugin.settings.notebookEditorCommand),
	});

	plugin.addCommand({
		id: "restart-python-kernel",
		name: "Restart Python kernel",
		callback: () => executor.restartKernel(),
	});

	plugin.addCommand({
		id: "force-sync",
		name: "Sync files",
		callback: () => fileSync.handleSync(undefined, true),
	});

	plugin.addCommand({
		id: "bake-outputs",
		name: "Bake outputs into markdown",
		callback: async () => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || file.extension !== "md") {
				new Notice("JupyMD: Please open a markdown file first.");
				return;
			}
			try {
				await bakeOutputsForFile(plugin.app, file);
				new Notice("JupyMD: Outputs baked into markdown.");
			} catch (e) {
				console.error("JupyMD bake error:", e);
				new Notice(`JupyMD: Failed to bake outputs. ${e instanceof Error ? e.message : ""}`);
			}
		},
	});

	plugin.addCommand({
		id: "clear-baked-outputs",
		name: "Clear baked outputs from markdown",
		callback: async () => {
			const file = plugin.app.workspace.getActiveFile();
			if (!file || file.extension !== "md") {
				new Notice("JupyMD: Please open a markdown file first.");
				return;
			}
			try {
				await clearBakedOutputs(plugin.app, file);
				new Notice("JupyMD: Baked outputs cleared.");
			} catch (e) {
				console.error("JupyMD clear error:", e);
				new Notice(`JupyMD: Failed to clear outputs. ${e instanceof Error ? e.message : ""}`);
			}
		},
	});
}
