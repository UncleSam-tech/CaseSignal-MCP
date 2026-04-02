import { describe, it, expect } from 'vitest';
import { normalizeName } from '../../src/services/entityResolution/normalizeName.js';

describe('normalizeName', () => {
  describe('company normalization', () => {
    it('strips Inc suffix (corp is also a suffix, gets stripped too)', () => {
      // 'Acme Corp, Inc.' → tokens ['acme', 'corp', 'inc'] → corp and inc stripped → 'acme'
      expect(normalizeName('Acme Corp, Inc.', 'company').canonical).toBe('acme');
    });

    it('strips LLC suffix', () => {
      expect(normalizeName('Widgets LLC', 'company').canonical).toBe('widgets');
    });

    it('strips multiple trailing suffixes', () => {
      // co, corp, inc are all suffixes — all stripped, leaving 'big'
      expect(normalizeName('Big Co Corp Inc', 'company').canonical).toBe('big');
    });

    it('handles punctuation in abbreviations (I.B.M.)', () => {
      expect(normalizeName('I.B.M. Corporation', 'company').canonical).toBe('ibm');
    });

    it('normalizes whitespace (corp is a suffix so gets stripped)', () => {
      // 'Acme Corp' → corp is a suffix → stripped → 'acme'
      expect(normalizeName('  Acme   Corp  ', 'company').canonical).toBe('acme');
    });

    it('lowercases', () => {
      expect(normalizeName('APPLE INC', 'company').canonical).toBe('apple');
    });

    it('handles Ltd suffix (hyphen becomes space during punct normalization)', () => {
      // 'Rolls-Royce Ltd' → hyphen→space → 'rolls royce ltd' → ltd stripped → 'rolls royce'
      expect(normalizeName('Rolls-Royce Ltd', 'company').canonical).toBe('rolls royce');
    });

    it('handles PLC suffix', () => {
      expect(normalizeName('BP PLC', 'company').canonical).toBe('bp');
    });

    it('strips LLP (& becomes space, then collapsed to single space)', () => {
      // '& ' → space → 'smith jones llp' → llp stripped → 'smith jones'
      expect(normalizeName('Smith & Jones LLP', 'company').canonical).toBe('smith jones');
    });

    it('records stripped suffixes', () => {
      const result = normalizeName('Acme Inc', 'company');
      expect(result.suffixesStripped).toContain('inc');
    });

    it('produces correct tokens', () => {
      const result = normalizeName('Meta Platforms Inc', 'company');
      expect(result.tokens).toEqual(['meta', 'platforms']);
    });

    it('handles entity with no suffix', () => {
      expect(normalizeName('Google', 'company').canonical).toBe('google');
    });

    it('handles unicode normalization', () => {
      // Fullwidth characters should normalize
      expect(normalizeName('Ａｃｍｅ Inc', 'company').canonical).toBe('ａｃｍｅ'.normalize('NFKC').toLowerCase());
    });
  });

  describe('person normalization', () => {
    it('converts "First Last" to "last, first"', () => {
      expect(normalizeName('John Smith', 'person').canonical).toBe('smith, john');
    });

    it('handles three-part name', () => {
      expect(normalizeName('John Michael Smith', 'person').canonical).toBe('smith, john michael');
    });

    it('strips Jr suffix from person', () => {
      const result = normalizeName('Robert Jones Jr', 'person');
      expect(result.canonical).toBe('jones, robert');
      expect(result.suffixesStripped).toContain('jr');
    });

    it('strips Sr suffix', () => {
      expect(normalizeName('James Brown Sr', 'person').canonical).toBe('brown, james');
    });

    it('strips Esq suffix', () => {
      expect(normalizeName('Carol White Esq', 'person').canonical).toBe('white, carol');
    });
  });

  describe('auto detection', () => {
    it('detects company from Inc suffix', () => {
      const result = normalizeName('Acme Inc', 'auto');
      expect(result.detectedType).toBe('company');
    });

    it('detects person from two tokens with no company suffix', () => {
      const result = normalizeName('John Smith', 'auto');
      expect(result.detectedType).toBe('person');
    });
  });
});
