import JupyMDPlugin from "./main";

export function registerCommands(plugin: JupyMDPlugin) {
	const { fileSync } = plugin;
	const { executor } = plugin;

	plugin.addCommand({
		id: "select-python-kernel",
		name: "Select Python kernel",
		callback: () => plugin.openKernelSelector(),
	});

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
		id: "force-sync",
		name: "Sync files",
		callback: () => fileSync.handleSync(undefined, true),
	});

	plugin.addCommand({
		id: "run-all-code-blocks",
		name: "Run all code blocks in current note",
		callback: async () => executor.executeAllCodeBlocksInCurrentFile(),
	});

	plugin.addCommand({
		id: "clear-all-code-block-outputs",
		name: "Clear all code block outputs in current note",
		callback: async () => executor.clearAllOutputsInCurrentFile(),
	});
}
