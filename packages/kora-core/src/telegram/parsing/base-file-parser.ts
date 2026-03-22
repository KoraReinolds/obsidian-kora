import { TELEGRAM_CONSTANTS } from '../core/constants.js';

export interface BaseFileData<TFile = unknown, TLink = unknown> {
	file: TFile;
	content: string;
	frontmatter: Record<string, any>;
	links: TLink[];
}

export interface FileValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
}

export interface FrontmatterFieldValidation {
	field: string;
	required?: boolean;
	expectedType?: string;
}

export interface FrontmatterFieldValidationResult {
	isValid: boolean;
	error?: string;
}

export function stripFrontmatter(content: string): string {
	return content.replace(TELEGRAM_CONSTANTS.REGEX.FRONTMATTER, '');
}

export function validateFrontmatterField(
	frontmatter: Record<string, any>,
	field: string,
	required = false,
	expectedType?: string
): FrontmatterFieldValidationResult {
	if (!(field in frontmatter)) {
		if (required) {
			return { isValid: false, error: `Missing required field: ${field}` };
		}

		return { isValid: true };
	}

	const value = frontmatter[field];
	if (expectedType) {
		const actualType = Array.isArray(value) ? 'array' : typeof value;
		if (actualType !== expectedType) {
			return {
				isValid: false,
				error: `Field ${field} should be ${expectedType}, got ${actualType}`,
			};
		}
	}

	return { isValid: true };
}

export function validateFrontmatterFields(
	frontmatter: Record<string, any>,
	fieldValidations: FrontmatterFieldValidation[]
): Pick<FileValidationResult, 'errors' | 'warnings'> {
	const errors: string[] = [];
	const warnings: string[] = [];

	for (const validation of fieldValidations) {
		const result = validateFrontmatterField(
			frontmatter,
			validation.field,
			validation.required,
			validation.expectedType
		);

		if (!result.isValid && result.error) {
			errors.push(result.error);
		}
	}

	return { errors, warnings };
}

export function extractFrontmatterValue<V>(
	frontmatter: Record<string, any>,
	key: string,
	defaultValue: V
): V {
	return frontmatter[key] !== undefined ? frontmatter[key] : defaultValue;
}
