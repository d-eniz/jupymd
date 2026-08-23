const ESCAPE = String.fromCharCode(27);
const CONTROL_SEQUENCE_INTRODUCER = String.fromCharCode(155);
const ANSI_ESCAPE_PATTERN = new RegExp(
	`${ESCAPE}(?:\\[[0-?]*[ -/]*[@-~]|[@-_])|${CONTROL_SEQUENCE_INTRODUCER}[0-?]*[ -/]*[@-~]`,
	"g"
);

export function stripAnsiSequences(value: string): string {
	return value.replace(ANSI_ESCAPE_PATTERN, "");
}
