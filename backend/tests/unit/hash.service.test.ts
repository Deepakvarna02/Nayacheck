import { hashObject, verifyHash, sealReport } from '../../src/services/integrity/hash.service';

describe('hash.service', () => {
  it('creates stable hashes independent of key order', () => {
    const a = { b: 1, a: { y: 2, x: 3 } };
    const b = { a: { x: 3, y: 2 }, b: 1 };
    expect(hashObject(a)).toBe(hashObject(b));
  });

  it('verifies hashes correctly', () => {
    const value = { hello: 'world' };
    const hash = hashObject(value);
    expect(verifyHash(value, hash)).toBe(true);
  });

  it('seals reports with an integrity hash', () => {
    const result = sealReport({ audit_id: 'NYK-1' });
    expect(result.report.integrityHash).toBe(result.integrityHash);
  });
});
