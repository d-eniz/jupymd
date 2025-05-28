export type JupyMDPluginSettings = {
	defaultKernel: string;
	availableKernels: string[];
	usePersistentPython: boolean;
	notebookEditorCommand: string;
}

export const DEFAULT_SETTINGS: JupyMDPluginSettings = {
	defaultKernel: "python3",
	availableKernels: ["python3"],
	usePersistentPython: true,
	notebookEditorCommand: "jupyter-lab",
};

export type CodeBlock = {
	code: string;
	startPos: number;
	endPos: number;
};

export type PythonBlockProps = {
	code?: string;
	path?: string;
	index?: number;
	executor?: any;
	plugin?: any;
}
