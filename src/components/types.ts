import type JupyMDPlugin from "../main";
import type {CodeExecutor} from "./CodeExecutor";

export type JupyMDPluginSettings = {
	autoSync: boolean;
	bidirectionalSync: boolean;
	autoConvertToNotebookOnRun: boolean;
	toolingPython: string;
	pythonInterpreter?: string;
	notebookEditorCommand: string;
	enableCodeBlocks: boolean;
}

export const DEFAULT_SETTINGS: JupyMDPluginSettings = {
	autoSync: true,
	bidirectionalSync: false,
	autoConvertToNotebookOnRun: true,
	toolingPython: "",
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

export type NotebookCodeBlockProps = {
	code?: string;
	path?: string;
	index?: number;
	getCurrentIndex?: () => Promise<number | null>;
	sourceLineStart?: number;
	language?: string;
	executionEnabled?: boolean;
	executor?: CodeExecutor;
	plugin: JupyMDPlugin;
}

export type NotebookOutput = {
	output_type: string;
	text?: string | string[];
	data?: Record<string, unknown>;
	traceback?: string[];
	ename?: string;
	evalue?: string;
};

export type NotebookCell = {
	cell_type: string;
	source?: string | string[];
	outputs?: NotebookOutput[];
	execution_count?: number | null;
	metadata?: Record<string, unknown> & {
		jupyter?: {is_executing: boolean};
	};
};

export type NotebookData = {
	cells: NotebookCell[];
	metadata?: Record<string, unknown> & {
		kernelspec?: {
			display_name?: string;
			language?: string;
			name?: string;
		};
	};
};

export function parseNotebook(raw: string): NotebookData {
	const value: unknown = JSON.parse(raw);
	if (!value || typeof value !== "object" || !Array.isArray((value as {cells?: unknown}).cells)) {
		throw new Error("Invalid Jupyter notebook: missing cells array");
	}
	return value as NotebookData;
}

export function isCodeCell(cell: NotebookCell): boolean {
	return cell.cell_type === "code";
}
