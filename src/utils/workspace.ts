import type {WorkspaceLeaf} from "obsidian";

/**
 * Refresh a core Obsidian leaf after its backing notebook relationship changes.
 * `rebuildView` is an internal method, so keep the compatibility cast isolated.
 */
export function rebuildWorkspaceLeaf(leaf: WorkspaceLeaf | undefined): void {
	const rebuildable = leaf as unknown as {rebuildView?: () => void};
	rebuildable?.rebuildView?.();
}
