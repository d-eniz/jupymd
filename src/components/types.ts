export type JupyMDPluginSettings = {
	autoSync: boolean;
	bidirectionalSync: boolean;
	pythonInterpreter: string;
	notebookEditorCommand: string;
	enableCodeBlocks: boolean;
	embedOutputs: boolean;
}

export const DEFAULT_SETTINGS: JupyMDPluginSettings = {
	autoSync: true,
	bidirectionalSync: false,
	pythonInterpreter: "",
	notebookEditorCommand: "jupyter-lab",
	enableCodeBlocks: true,
	embedOutputs: false,
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
