export type JupyterKernelSpec = {
	argv: string[];
	display_name: string;
	language: string;
	env?: Record<string, string>;
	interrupt_mode?: "signal" | "message";
	metadata?: Record<string, unknown>;
	kernel_protocol_version?: string;
};

export type KernelConnection = {
	id: string;
	name: string;
	displayName: string;
	language: string;
	resourceDir: string;
	spec: JupyterKernelSpec;
	source: "jupyter" | "python-environment";
	interpreterPath?: string;
	isManaged?: boolean;
};

export type NotebookOutput =
	| {
		output_type: "stream";
		name: "stdout" | "stderr";
		text: string | string[];
	}
	| {
		output_type: "display_data";
		data: Record<string, unknown>;
		metadata: Record<string, unknown>;
	}
	| {
		output_type: "execute_result";
		data: Record<string, unknown>;
		metadata: Record<string, unknown>;
		execution_count: number | null;
	}
	| {
		output_type: "error";
		ename: string;
		evalue: string;
		traceback: string[];
	};

export type KernelExecutionResult = {
	outputs: NotebookOutput[];
	executionCount: number | null;
};
