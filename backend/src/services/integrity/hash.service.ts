import crypto from 'crypto';
import fs from 'fs';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, JsonValue>>((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }

  return value;
}

export function hashObject(data: object): string {
  const canonical = JSON.stringify(canonicalize(data as JsonValue));
  return `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`;
}

export function hashFile(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

export function verifyHash(data: object, expectedHash: string): boolean {
  return hashObject(data) === expectedHash;
}

export function sealReport<T extends object>(reportData: T): { report: T & { integrityHash: string }; integrityHash: string } {
  const integrityHash = hashObject(reportData);
  return {
    report: { ...reportData, integrityHash },
    integrityHash
  };
}
