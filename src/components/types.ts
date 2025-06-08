export type JupyMDPluginSettings = {
	notebookEditorCommand: string;
	enableCodeBlocks: boolean;
}

export const DEFAULT_SETTINGS: JupyMDPluginSettings = {
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
