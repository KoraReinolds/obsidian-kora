/**
 * Template processor for UI plugins
 * Handles template application to notes with YAML frontmatter replacement
 */

import { App, TFile } from 'obsidian';
import { VaultOperations } from '../obsidian';

export class TemplateProcessor {
	private vaultOps: VaultOperations;
	private templateCache: Map<
		string,
		{ content: string; lastModified: number }
	> = new Map();

	constructor(private app: App) {
		this.vaultOps = new VaultOperations(app);
	}

	/**
	 * Apply template to a note file
	 * Replaces the second YAML section with template content
	 */
	async applyTemplateToFile(file: TFile, templatePath: string): Promise<void> {
		const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
		if (!(templateFile instanceof TFile)) {
			throw new Error(`Template file not found: ${templatePath}`);
		}

		// Check if template needs to be applied
		const needsUpdate = await this.shouldUpdateTemplate(file, templateFile);
		if (!needsUpdate) {
			return; // Template is already up to date
		}

		const [noteContent, templateContent] = await Promise.all([
			this.vaultOps.getFileContent(file),
			this.vaultOps.getFileContent(templateFile),
		]);

		const processedContent = this.processNoteWithTemplate(
			noteContent,
			templateContent
		);

		// Only modify if content actually changed
		if (processedContent !== noteContent) {
			await this.app.vault.modify(file, processedContent);

			// Update cache
			this.templateCache.set(file.path, {
				content: this.removeYamlFrontmatter(templateContent),
				lastModified: templateFile.stat.mtime,
			});
		}
	}

	/**
	 * Process note content by merging frontmatter and adding template section
	 */
	private processNoteWithTemplate(
		noteContent: string,
		templateContent: string
	): string {
		// Extract parts from template
		const templateYaml = this.extractYamlFrontmatter(templateContent);
		const templateWithoutYaml = this.removeYamlFrontmatter(templateContent);

		// Split note into sections: [frontmatter, template_section, main_content]
		const sections = this.splitNoteIntoSections(noteContent);

		// Merge frontmatter from template with existing frontmatter
		const mergedFrontmatter = this.mergeFrontmatter(
			sections[0] || '',
			templateYaml
		);

		if (sections.length === 1) {
			// Only frontmatter exists, add template content
			return mergedFrontmatter + '\n---\n' + templateWithoutYaml + '\n';
		}

		// We have frontmatter and main content, insert template between them
		return this.reconstructNote([
			mergedFrontmatter,
			templateWithoutYaml,
			sections[2] || '',
		]);
	}

	/**
	 * Remove YAML frontmatter from template content
	 */
	private removeYamlFrontmatter(content: string): string {
		const lines = content.split('\n');
		let inFrontmatter = false;
		let frontmatterEnd = -1;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();

			if (i === 0 && line === '---') {
				inFrontmatter = true;
				continue;
			}

			if (inFrontmatter && line === '---') {
				frontmatterEnd = i;
				break;
			}
		}

		if (frontmatterEnd > -1) {
			// Return content after frontmatter, skipping the closing ---
			return lines
				.slice(frontmatterEnd + 1)
				.join('\n')
				.trim();
		}

		// No frontmatter found, return original content
		return content.trim();
	}

	/**
	 * Split note into sections: [frontmatter, template_section, main_content]
	 */
	private splitNoteIntoSections(content: string): string[] {
		const lines = content.split('\n');

		// Find frontmatter boundaries
		let frontmatterStart = -1;
		let frontmatterEnd = -1;

		if (lines[0]?.trim() === '---') {
			frontmatterStart = 0;
			// Find closing ---
			for (let i = 1; i < lines.length; i++) {
				if (lines[i].trim() === '---') {
					frontmatterEnd = i;
					break;
				}
			}
		}

		if (frontmatterStart === -1 || frontmatterEnd === -1) {
			// No frontmatter found, treat entire content as main content
			return [content];
		}

		// Extract frontmatter (including the --- markers)
		const frontmatter = lines
			.slice(frontmatterStart, frontmatterEnd + 1)
			.join('\n');

		// Look for template section separator after frontmatter
		let templateSectionStart = -1;
		let templateSectionEnd = -1;

		for (let i = frontmatterEnd + 1; i < lines.length; i++) {
			if (lines[i].trim() === '---') {
				if (templateSectionStart === -1) {
					templateSectionStart = i;
				} else {
					templateSectionEnd = i;
					break;
				}
			}
		}

		if (templateSectionStart === -1) {
			// No template section found, everything after frontmatter is main content
			const mainContent = lines
				.slice(frontmatterEnd + 1)
				.join('\n')
				.trim();
			return [frontmatter, '', mainContent];
		}

		if (templateSectionEnd === -1) {
			// Template section started but not closed, everything after separator is template
			const templateContent = lines
				.slice(templateSectionStart + 1)
				.join('\n')
				.trim();
			return [frontmatter, templateContent, ''];
		}

		// Both template section boundaries found
		const templateContent = lines
			.slice(templateSectionStart + 1, templateSectionEnd)
			.join('\n')
			.trim();
		const mainContent = lines
			.slice(templateSectionEnd + 1)
			.join('\n')
			.trim();

		return [frontmatter, templateContent, mainContent];
	}

	/**
	 * Reconstruct note from sections: [frontmatter, template_section, main_content]
	 */
	private reconstructNote(sections: string[]): string {
		if (sections.length === 0) return '';
		if (sections.length === 1) return sections[0];

		const [frontmatter, templateSection, mainContent] = sections;

		let result = frontmatter;

		// Add template section if it exists
		if (templateSection && templateSection.trim()) {
			result += '\n---\n' + templateSection + '\n';
		}

		// Add main content if it exists
		if (mainContent && mainContent.trim()) {
			result += '\n---\n' + mainContent;
		}

		return result;
	}

	/**
	 * Check if file should have template applied based on folder patterns
	 */
	shouldApplyTemplate(file: TFile, folderPatterns: string[]): boolean {
		const filePath = file.path;

		return folderPatterns.some(pattern => {
			// Simple pattern matching - can be enhanced with glob patterns
			if (pattern.endsWith('/')) {
				return filePath.startsWith(pattern);
			}
			return filePath.includes(pattern);
		});
	}

	/**
	 * Get available template files from Templates folder
	 */
	async getAvailableTemplates(): Promise<TFile[]> {
		const templatesFolder =
			this.app.vault.getAbstractFileByPath('Plugins/Templates');
		if (!templatesFolder || !(templatesFolder instanceof TFile)) {
			// Try to get all .md files that could be templates
			const allFiles = this.app.vault.getMarkdownFiles();
			return allFiles.filter(
				file =>
					file.path.includes('Template') ||
					file.path.includes('template') ||
					file.parent?.name === 'Templates'
			);
		}

		return this.app.vault
			.getMarkdownFiles()
			.filter(file => file.path.startsWith('Plugins/Templates/'));
	}

	/**
	 * Check if template should be applied to file
	 */
	private async shouldUpdateTemplate(
		file: TFile,
		templateFile: TFile
	): Promise<boolean> {
		const cached = this.templateCache.get(file.path);

		// If no cache, need to apply
		if (!cached) {
			return true;
		}

		// If template file was modified, need to apply
		if (cached.lastModified < templateFile.stat.mtime) {
			return true;
		}

		// Check if current template section matches cached template content
		const noteContent = await this.vaultOps.getFileContent(file);
		const sections = this.splitNoteIntoSections(noteContent);

		// If no template section exists, need to apply
		if (sections.length < 2 || !sections[1]) {
			return true;
		}

		// Compare current template section with cached template
		const currentTemplateSection = sections[1].trim();
		return currentTemplateSection !== cached.content.trim();
	}

	/**
	 * Extract YAML frontmatter from content (including --- markers)
	 */
	private extractYamlFrontmatter(content: string): string {
		const lines = content.split('\n');
		let frontmatterEnd = -1;

		if (lines[0]?.trim() === '---') {
			// Find closing ---
			for (let i = 1; i < lines.length; i++) {
				if (lines[i].trim() === '---') {
					frontmatterEnd = i;
					break;
				}
			}
		}

		if (frontmatterEnd > -1) {
			// Return frontmatter including the --- markers
			return lines.slice(0, frontmatterEnd + 1).join('\n');
		}

		// No frontmatter found
		return '';
	}

	/**
	 * Merge frontmatter from template into existing frontmatter
	 */
	private mergeFrontmatter(
		existingFrontmatter: string,
		templateFrontmatter: string
	): string {
		if (!templateFrontmatter.trim()) {
			return existingFrontmatter;
		}

		if (!existingFrontmatter.trim()) {
			return templateFrontmatter;
		}

		// Parse existing frontmatter content (without --- markers)
		const existingLines = existingFrontmatter.split('\n');
		const existingContent: string[] = [];
		const existingFields = new Set<string>();

		let inFrontmatter = false;
		for (const line of existingLines) {
			if (line.trim() === '---') {
				if (!inFrontmatter) {
					inFrontmatter = true;
					existingContent.push(line);
				} else {
					// End of frontmatter, add new fields from template here
					break;
				}
			} else if (inFrontmatter) {
				existingContent.push(line);
				// Track field names to avoid duplicates
				const fieldMatch = line.match(/^([^:]+):/);
				if (fieldMatch) {
					existingFields.add(fieldMatch[1].trim());
				}
			}
		}

		// Parse template frontmatter and add missing fields
		const templateLines = templateFrontmatter.split('\n');
		let inTemplateFrontmatter = false;

		for (const line of templateLines) {
			if (line.trim() === '---') {
				if (!inTemplateFrontmatter) {
					inTemplateFrontmatter = true;
				} else {
					break;
				}
			} else if (inTemplateFrontmatter) {
				const fieldMatch = line.match(/^([^:]+):/);
				if (fieldMatch) {
					const fieldName = fieldMatch[1].trim();
					// Only add if field doesn't exist in existing frontmatter
					if (!existingFields.has(fieldName)) {
						existingContent.push(line);
					}
				} else if (line.trim() && !line.startsWith(' ')) {
					// Add non-field lines (like standalone text) if they don't exist
					const lineText = line.trim();
					const existingHasLine = existingContent.some(
						existingLine => existingLine.trim() === lineText
					);
					if (!existingHasLine) {
						existingContent.push(line);
					}
				}
			}
		}

		// Close frontmatter
		existingContent.push('---');

		return existingContent.join('\n');
	}
}
