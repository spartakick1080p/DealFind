import { describe, it, expect } from 'vitest';
import { validateScrapeUrl } from '../validate-url';

describe('validateScrapeUrl', () => {
  it('rejects an empty string', () => {
    const result = validateScrapeUrl('');
    expect(result).toEqual({ valid: false, error: 'URL cannot be empty' });
  });

  it('rejects a whitespace-only string', () => {
    const result = validateScrapeUrl('   \t\n  ');
    expect(result).toEqual({ valid: false, error: 'URL cannot be empty' });
  });

  it('rejects a URL without http/https protocol', () => {
    const result = validateScrapeUrl('ftp://example.com');
    expect(result).toEqual({ valid: false, error: 'URL must start with http:// or https://' });
  });

  it('rejects a plain string without protocol', () => {
    const result = validateScrapeUrl('example.com');
    expect(result).toEqual({ valid: false, error: 'URL must start with http:// or https://' });
  });

  it('accepts a valid http URL', () => {
    const result = validateScrapeUrl('http://example.com');
    expect(result).toEqual({ valid: true, url: 'http://example.com' });
  });

  it('accepts a valid https URL', () => {
    const result = validateScrapeUrl('https://example.com/products');
    expect(result).toEqual({ valid: true, url: 'https://example.com/products' });
  });

  it('trims leading and trailing whitespace', () => {
    const result = validateScrapeUrl('  https://example.com  ');
    expect(result).toEqual({ valid: true, url: 'https://example.com' });
  });

  it('trims whitespace before rejecting invalid protocol', () => {
    const result = validateScrapeUrl('  ftp://example.com  ');
    expect(result).toEqual({ valid: false, error: 'URL must start with http:// or https://' });
  });
});
