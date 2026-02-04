import { expect } from 'chai';
import { computeHash } from '../../utils/hash.js';

describe('HashCalculator', () => {
  describe('computeHash', () => {
    it('should return sha256 prefixed hash', () => {
      const content = 'Hello, World!';
      const hash = computeHash(content);
      
      expect(hash).to.match(/^sha256:[a-f0-9]{64}$/);
    });

    it('should normalize line endings before hashing', () => {
      const contentUnix = 'line1\nline2\n';
      const contentWindows = 'line1\r\nline2\r\n';
      
      const hashUnix = computeHash(contentUnix);
      const hashWindows = computeHash(contentWindows);
      
      expect(hashUnix).to.equal(hashWindows);
    });

    it('should return different hashes for different content', () => {
      const hash1 = computeHash('content1');
      const hash2 = computeHash('content2');
      
      expect(hash1).to.not.equal(hash2);
    });

    it('should return same hash for same content', () => {
      const content = 'same content';
      const hash1 = computeHash(content);
      const hash2 = computeHash(content);
      
      expect(hash1).to.equal(hash2);
    });
  });
});
