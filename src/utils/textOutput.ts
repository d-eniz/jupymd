const ANSI_ESCAPE_PATTERN = /\u001B(?:\[[0-?]*[ -/]*[@-~]|[@-_])|\u009B[0-?]*[ -/]*[@-~]/g;

export function stripAnsiSequences(value: string): string {
	return value.replace(ANSI_ESCAPE_PATTERN, "");
}
