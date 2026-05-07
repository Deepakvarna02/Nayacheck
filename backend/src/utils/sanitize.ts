const REDACT_PATTERNS = [
  /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g,
  /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z\d\b/g,
  /\b\d{12}\b/g
];

export function sanitizeForLog(value: string): string {
  return REDACT_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, '[REDACTED]'), value);
}
