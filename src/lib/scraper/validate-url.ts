export type ValidationSuccess = { valid: true; url: string };
export type ValidationFailure = { valid: false; error: string };
export type ValidationResult = ValidationSuccess | ValidationFailure;

export function validateScrapeUrl(url: string): ValidationResult {
  const trimmed = url.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return { valid: false, error: 'URL must start with http:// or https://' };
  }

  return { valid: true, url: trimmed };
}
