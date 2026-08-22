import {languageSupportRegistry} from "../languages/LanguageSupport";

export type MarkdownCodeFence = {
	language: string;
	lineStart: number;
	lineEnd: number;
	noEval: boolean;
};

export type EditorPosition = {
	line: number;
	ch: number;
};

const OPENING_FENCE = /^(\s*)(`{3,}|~{3,})\s*(.*)$/;

export function parseMarkdownCodeFences(markdown: string): MarkdownCodeFence[] {
	const lines = markdown.split(/\r?\n/);
	const fences: MarkdownCodeFence[] = [];

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const match = lines[lineIndex].match(OPENING_FENCE);
		if (!match) continue;
		const marker = match[2];
		const markerCharacter = marker[0];
		const closingPattern = new RegExp(`^\\s*${markerCharacter === "`" ? "`" : "~"}{${marker.length},}\\s*$`);
		const info = (match[3] || "").trim();
		const language = (info.match(/^\{?([^\s{},]+)/)?.[1] || "").trim().toLowerCase();
		const noEval = /(?:^|\s)\.noeval(?:\s|$)/i.test(info) || /active\s*=\s*["']md["']/i.test(info);
		let lineEnd = lineIndex;

		for (let candidate = lineIndex + 1; candidate < lines.length; candidate++) {
			if (closingPattern.test(lines[candidate])) {
				lineEnd = candidate;
				break;
			}
		}

		fences.push({language, lineStart: lineIndex, lineEnd, noEval});
		if (lineEnd > lineIndex) lineIndex = lineEnd;
	}

	return fences;
}

export function getExecutableCellIndex(
	markdown: string,
	lineStart: number,
	kernelLanguage: string
): number | null {
	const notebookFences = getJupytextCodeFences(markdown, kernelLanguage);
	const index = notebookFences.findIndex((fence) => fence.lineStart === lineStart);
	if (index === -1 || !languageSupportRegistry.matches(notebookFences[index].language, kernelLanguage)) return null;
	return index;
}

export function getExecutableCellIndices(markdown: string, kernelLanguage: string): number[] {
	return getJupytextCodeFences(markdown, kernelLanguage)
		.map((fence, index) => ({fence, index}))
		.filter(({fence}) => languageSupportRegistry.matches(fence.language, kernelLanguage))
		.map(({index}) => index);
}

export function getEditorPositionForCodeOffset(
	code: string,
	sourceLineStart: number,
	offset: number
): EditorPosition {
	const safeOffset = Math.max(0, Math.min(offset, code.length));
	const beforeCursor = code.slice(0, safeOffset);
	const lines = beforeCursor.split("\n");
	return {
		line: sourceLineStart + lines.length,
		ch: lines[lines.length - 1].length,
	};
}

function getJupytextCodeFences(markdown: string, kernelLanguage: string): MarkdownCodeFence[] {
	return parseMarkdownCodeFences(markdown).filter((fence) => {
		if (!fence.language || fence.noEval) return false;
		return Boolean(
			languageSupportRegistry.getModuleForFence(fence.language) ||
			languageSupportRegistry.matches(fence.language, kernelLanguage)
		);
	});
}
