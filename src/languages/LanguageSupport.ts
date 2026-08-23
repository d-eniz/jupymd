export type RuntimeVersionProbe = {
	executable: string;
	args: string[];
	pattern: RegExp;
	prefix?: string;
};

export type LanguageSupportModule = {
	id: string;
	displayName: string;
	fenceAliases: string[];
	kernelLanguages: string[];
	highlighterLanguage?: string;
	jupytextLanguage?: string;
	offersPythonEnvironments?: boolean;
	runtimeVersionProbes?: RuntimeVersionProbe[];
};

const MODULES: LanguageSupportModule[] = [
	{
		id: "python",
		displayName: "Python",
		fenceAliases: ["python", "py"],
		kernelLanguages: ["python"],
		highlighterLanguage: "python",
		jupytextLanguage: "python",
		offersPythonEnvironments: true,
	},
	{
		id: "julia",
		displayName: "Julia",
		fenceAliases: ["julia", "jl"],
		kernelLanguages: ["julia"],
		highlighterLanguage: "julia",
		jupytextLanguage: "julia",
		runtimeVersionProbes: [
			{executable: "kernel", args: ["--version"], pattern: /julia version\s+(\S+)/i},
		],
	},
	{
		id: "r",
		displayName: "R",
		fenceAliases: ["r"],
		kernelLanguages: ["r"],
		highlighterLanguage: "r",
		jupytextLanguage: "r",
		runtimeVersionProbes: [
			{executable: "kernel", args: ["--version"], pattern: /R version\s+(\S+)/i},
		],
	},
	{
		id: "bash",
		displayName: "Bash",
		fenceAliases: ["bash", "sh", "shell"],
		kernelLanguages: ["bash", "sh", "shell"],
		highlighterLanguage: "bash",
		jupytextLanguage: "bash",
		runtimeVersionProbes: [
			{executable: "bash", args: ["--version"], pattern: /version\s+(\d+(?:\.\d+)+)/i},
		],
	},
	{
		id: "javascript",
		displayName: "JavaScript",
		fenceAliases: ["javascript", "js", "node", "nodejs"],
		kernelLanguages: ["javascript", "js", "nodejs"],
		highlighterLanguage: "javascript",
		jupytextLanguage: "javascript",
		runtimeVersionProbes: [
			{executable: "kernel", args: ["--version"], pattern: /^deno\s+(\S+)/im, prefix: "Deno "},
			{executable: "node", args: ["--version"], pattern: /^v?(\S+)/i, prefix: "Node "},
		],
	},
	{
		id: "typescript",
		displayName: "TypeScript",
		fenceAliases: ["typescript", "ts"],
		kernelLanguages: ["typescript", "ts"],
		highlighterLanguage: "typescript",
		jupytextLanguage: "typescript",
		runtimeVersionProbes: [
			{executable: "kernel", args: ["--version"], pattern: /^typescript\s+(\S+)/im},
			{executable: "tsc", args: ["--version"], pattern: /Version\s+(\S+)/i},
		],
	},
	{
		id: "rust",
		displayName: "Rust",
		fenceAliases: ["rust"],
		kernelLanguages: ["rust"],
		highlighterLanguage: "rust",
		jupytextLanguage: "rust",
		runtimeVersionProbes: [
			{executable: "rustc", args: ["--version"], pattern: /rustc\s+(\S+)/i},
		],
	},
];

function normalize(value: string): string {
	return value.trim().toLowerCase();
}

export class LanguageSupportRegistry {
	constructor(private readonly modules: LanguageSupportModule[]) {}

	get builtInFenceLanguages(): string[] {
		return Array.from(new Set(this.modules.flatMap((module) => module.fenceAliases.map(normalize))));
	}

	getModuleForFence(fenceLanguage: string): LanguageSupportModule | null {
		const normalized = normalize(fenceLanguage);
		return this.modules.find((module) => module.fenceAliases.map(normalize).includes(normalized)) || null;
	}

	getModuleForKernelLanguage(kernelLanguage: string): LanguageSupportModule | null {
		const normalized = normalize(kernelLanguage);
		return this.modules.find((module) => module.kernelLanguages.map(normalize).includes(normalized)) || null;
	}

	matches(fenceLanguage: string, kernelLanguage: string): boolean {
		const fenceModule = this.getModuleForFence(fenceLanguage);
		const kernelModule = this.getModuleForKernelLanguage(kernelLanguage);
		if (fenceModule || kernelModule) return Boolean(fenceModule && kernelModule && fenceModule.id === kernelModule.id);
		return normalize(fenceLanguage) === normalize(kernelLanguage);
	}

	getHighlighterLanguage(fenceLanguage: string): string {
		return this.getModuleForFence(fenceLanguage)?.highlighterLanguage || normalize(fenceLanguage);
	}

	getDisplayName(fenceLanguage: string): string {
		const normalized = normalize(fenceLanguage);
		return this.getModuleForFence(normalized)?.displayName
			|| (normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "Code");
	}

	getPrimaryFenceForKernel(kernelLanguage: string): string {
		return this.getModuleForKernelLanguage(kernelLanguage)?.fenceAliases[0] || normalize(kernelLanguage);
	}
}

export const languageSupportRegistry = new LanguageSupportRegistry(MODULES);
