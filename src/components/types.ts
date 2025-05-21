export type JupyMDPluginSettings = {
	defaultKernel: string;
	availableKernels: string[];
	usePersistentPython: boolean;
}

export const DEFAULT_SETTINGS: JupyMDPluginSettings = {
	defaultKernel: "python3",
	availableKernels: ["python3"],
	usePersistentPython: true,
};

export type CodeBlock = {
	code: string;
	startPos: number;
	endPos: number;
};
