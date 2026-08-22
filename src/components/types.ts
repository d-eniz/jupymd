export type JupyMDPluginSettings = {
	autoSync: boolean;
	bidirectionalSync: boolean;
	autoConvertToNotebookOnRun: boolean;
	toolingPython: string;
	pythonInterpreter: string;
	notebookEditorCommand: string;
	enableCodeBlocks: boolean;
}

export const DEFAULT_SETTINGS: JupyMDPluginSettings = {
	autoSync: true,
	bidirectionalSync: false,
	autoConvertToNotebookOnRun: true,
	toolingPython: "",
	pythonInterpreter: "",
	notebookEditorCommand: "jupyter-lab",
	enableCodeBlocks: true,
};

export type CodeBlock = {
	code: string;
	cellIndex: number;
	language?: string;
}

export type CodeExecutionMode = "cell" | "above" | "cell-and-below";

export const OUTPUTS_UPDATED_EVENT = "jupymd:outputs-updated";

export type PythonBlockProps = {
	code?: string;
	path?: string;
	index?: number;
	executor?: any;
	plugin?: any;
}
