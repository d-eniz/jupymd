import {App, FuzzySuggestModal, FuzzyMatch, Notice} from "obsidian";
import JupyMDPlugin from "../main";
import {discoverKernels, KernelInfo} from "../utils/kernelDiscovery";
import {validatePythonPath} from "../utils/pythonPathUtils";

const TYPE_BADGE: Record<KernelInfo["type"], string> = {
	venv: "venv",
	system: "system",
};

type CustomPathOption = {
	label: string;
	path: string;
	version: string;
	type: "system";
	isCustomPath: true;
};

type KernelOption = KernelInfo | CustomPathOption;

function isCustomPathOption(option: KernelOption): option is CustomPathOption {
	return "isCustomPath" in option;
}

export class KernelSelectorModal extends FuzzySuggestModal<KernelOption> {
	private plugin: JupyMDPlugin;
	private kernels: KernelInfo[] = [];
	private isLoading = true;

	constructor(app: App, plugin: JupyMDPlugin) {
		super(app);
		this.plugin = plugin;
		this.setPlaceholder("Select a Python interpreter or type a custom path…");
		this.setInstructions([
			{command: "↑↓", purpose: "navigate"},
			{command: "↵", purpose: "select"},
			{command: "esc", purpose: "dismiss"},
		]);
	}

	onOpen() {
		super.onOpen();
		this.addLoadingHint();
		this.emptyStateText = "Type a Python path to use it directly.";
		this.loadKernels();
	}

	private addLoadingHint() {
		const promptEl = this.containerEl.querySelector(".prompt-results");
		if (promptEl) {
			const hint = promptEl.createEl("div", {
				cls: "suggestion-empty",
				text: "Discovering Python environments…",
			});
			hint.dataset.loadingHint = "true";
		}
	}

	private removeLoadingHint() {
		const hint = this.containerEl.querySelector('[data-loading-hint="true"]');
		hint?.remove();
	}

	private async loadKernels() {
		try {
			this.kernels = await discoverKernels(this.app);
		} catch (e) {
			console.error("Kernel discovery failed:", e);
			this.kernels = [];
		} finally {
			this.isLoading = false;
			this.removeLoadingHint();
			// Trigger re-render of the suggestion list
			// @ts-ignore – internal Obsidian API
			this.updateSuggestions();
		}
	}

	getItems(): KernelOption[] {
		return this.kernels;
	}

	getSuggestions(query: string): FuzzyMatch<KernelOption>[] {
		const suggestions = super.getSuggestions(query);
		const typed = query.trim();
		if (!typed) return suggestions;

		const normalizedTyped = typed.toLowerCase();
		const hasExactPathMatch = this.kernels.some((kernel) => kernel.path.toLowerCase() === normalizedTyped);
		if (hasExactPathMatch) return suggestions;

		return [
			{
				item: {
					label: `Use custom path: ${typed}`,
					path: typed,
					version: "Validate on select",
					type: "system",
					isCustomPath: true,
				},
				match: {
					score: -1,
					matches: [],
				},
			},
			...suggestions,
		];
	}

	getItemText(item: KernelOption): string {
		// Used for fuzzy matching – include label, path and type so all are searchable
		return `${item.label} ${item.version} ${item.path} ${item.type}`;
	}

	renderSuggestion(match: FuzzyMatch<KernelOption>, el: HTMLElement) {
		const item = match.item;

		const wrapper = el.createDiv({cls: "kernel-suggestion"});

		const topRow = wrapper.createDiv({cls: "kernel-suggestion-top"});
		topRow.createSpan({cls: "kernel-suggestion-label", text: item.label});
		topRow.createSpan({
			cls: `kernel-suggestion-badge ${isCustomPathOption(item) ? "kernel-badge-custom" : `kernel-badge-${item.type}`}`,
			text: isCustomPathOption(item) ? "custom" : TYPE_BADGE[item.type],
		});

		const bottomRow = wrapper.createDiv({cls: "kernel-suggestion-bottom"});
		bottomRow.createSpan({cls: "kernel-suggestion-version", text: item.version});
		bottomRow.createSpan({cls: "kernel-suggestion-path", text: item.path});
	}

	async onChooseItem(item: KernelOption) {
		if (isCustomPathOption(item)) {
			const valid = await validatePythonPath(item.path);
			if (!valid) {
				new Notice(`Invalid Python path: ${item.path}`);
				return;
			}

			await this.plugin.updateInterpreter(item.path);
			new Notice(`Python kernel set to: ${item.path}`);
			return;
		}

		await this.plugin.updateInterpreter(item.path);
		new Notice(`Python kernel set to: ${item.label} (${item.version})`);
	}
}