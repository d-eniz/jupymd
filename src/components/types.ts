export type JupyMDPluginSettings = {
	autoSync: boolean;
	pythonInterpreter: string;
	notebookEditorCommand: string;
	enableCodeBlocks: boolean;
}

export const DEFAULT_SETTINGS: JupyMDPluginSettings = {
	autoSync: true,
	pythonInterpreter: "",
	notebookEditorCommand: "jupyter-lab",
	enableCodeBlocks: true,
};

export type CodeBlock = {
	code: string;
	cellIndex: number;
}

export type PythonBlockProps = {
	code?: string;
	path?: string;
	index?: number;
	executor?: any;
	plugin?: any;
}
