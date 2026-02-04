import { expect } from 'chai';
import { expandHome, normalizePath } from '../../utils/path';
import * as os from 'os';
import * as path from 'path';

describe('PathUtils', () => {
  describe('expandHome', () => {
    it('should expand ~ to home directory', () => {
      const result = expandHome('~/projects');
      const expected = path.join(os.homedir(), 'projects');
      
      expect(result).to.equal(expected);
    });

    it('should expand lone ~ to home directory', () => {
      const result = expandHome('~');
      
      expect(result).to.equal(os.homedir());
    });

    it('should not modify paths without ~', () => {
      const input = '/absolute/path';
      const result = expandHome(input);
      
      expect(result).to.equal(input);
    });

    it('should not expand ~ in middle of path', () => {
      const input = '/some/~/path';
      const result = expandHome(input);
      
      expect(result).to.equal(input);
    });
  });

  describe('normalizePath', () => {
    it('should convert backslashes to forward slashes', () => {
      const input = 'C:\\Users\\mi\\projects';
      const result = normalizePath(input);
      
      expect(result).to.equal('C:/Users/mi/projects');
    });

    it('should not modify paths with forward slashes', () => {
      const input = '/Users/mi/projects';
      const result = normalizePath(input);
      
      expect(result).to.equal(input);
    });
  });
});
