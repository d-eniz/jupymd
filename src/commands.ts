import { Editor } from "obsidian";
import JupyMDPlugin from "./main";

export function registerCommands(plugin: JupyMDPlugin) {
	const { fileSync, executor, notebookUI, kernelManager } = plugin;

	plugin.addCommand({
		id: "create-jupyter-notebook",
		name: "Create Jupyter notebook from note",
		callback: () => fileSync.createNotebook(),
	});

	plugin.addCommand({
		id: "open-jupyter-notebook-in-vscode",
		name: "Open Jupyter notebook in VS Code",
		callback: () => fileSync.openNotebookInEditor("vscode"),
	});

	plugin.addCommand({
		id: "open-jupyter-notebook-in-lab",
		name: "Open Jupyter notebook in Jupyter Lab",
		callback: () => fileSync.openNotebookInEditor("jupyter-lab"),
	});

	plugin.addCommand({
		id: "execute-code-block",
		name: "Execute code block",
		editorCallback: (editor: Editor) => executor.executeCodeBlock(editor),
	});

	plugin.addCommand({
		id: "execute-all-code-blocks",
		name: "Execute all code blocks in note",
		callback: () => executor.executeAllCodeBlocks(),
	});

	plugin.addCommand({
		id: "clear-current-cell-output",
		name: "Clear current cell output",
		editorCallback: (editor: Editor) => notebookUI.clearCommand(editor),
	});

	plugin.addCommand({
		id: "clear-all-outputs",
		name: "Clear all cell outputs",
		callback: () => notebookUI.clearAllOutputs(),
	});

	plugin.addCommand({
		id: "select-python-kernel",
		name: "Select Python kernel",
		callback: () => kernelManager.selectKernel(),
	});

	plugin.addCommand({
		id: "restart-python-kernel",
		name: "Restart Python kernel",
		callback: () => kernelManager.restartKernel(),
	});
}
