import {Editor} from "obsidian";
import JupyMDPlugin from "./main";

export function registerCommands(plugin: JupyMDPlugin) {
	const {fileSync, kernelManager} = plugin;

	plugin.addCommand({
		id: "create-jupyter-notebook",
		name: "Create Jupyter notebook from note",
		callback: () => fileSync.createNotebook(),
	});

	plugin.addCommand({
		id: "open-jupyter-notebook-editor",
		name: "Open Jupyter notebook in editor",
		callback: () => fileSync.openNotebookInEditor(plugin.settings.notebookEditorCommand),
	});

	plugin.addCommand({
		id: "restart-python-kernel",
		name: "Restart Python kernel",
		callback: () => kernelManager.restartKernel(),
	});
}
