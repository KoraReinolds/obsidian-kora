/**
 * Shared Container
 * Description: Common scrollable container component for chunk views.
 */

/**
 * Create a shared scrollable container with consistent styling
 */
export function createScrollableContainer(
	containerEl: HTMLElement
): HTMLElement {
	containerEl.empty();

	const wrapper = containerEl.createEl('div');
	wrapper.style.cssText = `
    padding: 12px 16px; 
    height: 100%; 
    box-sizing: border-box;
    overflow-y: auto;
    overflow-x: hidden;
  `;

	return wrapper;
}
