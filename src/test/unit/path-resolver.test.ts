import { expect } from 'chai';
import { PathResolver } from '../../core/path-resolver.js';
import type { Registry, AgentProfile } from '../../core/types.js';

describe('PathResolver', () => {
  const sampleRegistry: Registry = {
    agentProfiles: {
      copilot: {
        vendor: 'github',
        instructionPaths: ['.github/copilot-instructions.md', 'AGENTS.md'],
        skillFolderPath: '.github/skills',
        skillFileName: 'SKILL.md'
      },
      claude: {
        vendor: 'anthropic',
        instructionPaths: ['CLAUDE.md'],
        skillFolderPath: '.claude/skills',
        skillFileName: 'SKILL.md'
      }
    },
    skills: []
  };

  const scanRoots = [
    { key: 'work', path: '/Users/mi/work' },
    { key: 'oss', path: '/Users/mi/oss' }
  ];

  describe('resolveScanPath', () => {
    it('should resolve scanPath key to absolute path', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      const result = resolver.resolveScanPath('work');
      expect(result).to.equal('/Users/mi/work');
    });

    it('should throw when scanPath key not found', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      expect(() => resolver.resolveScanPath('unknown')).to.throw('ScanPath key not found: unknown');
    });
  });

  describe('resolveRepoPath', () => {
    it('should resolve repoPath relative to scanPath', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      const result = resolver.resolveRepoPath('work', 'myproject');
      expect(result).to.equal('/Users/mi/work/myproject');
    });

    it('should handle nested repo paths', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      const result = resolver.resolveRepoPath('work', 'org/myproject');
      expect(result).to.equal('/Users/mi/work/org/myproject');
    });
  });

  describe('resolveDeployFolderPath', () => {
    it('should resolve deployFolderPath using skill folder structure', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      const repoRoot = '/Users/mi/work/myproject';
      const result = resolver.resolveDeployFolderPath(repoRoot, 'copilot', 'my-skill', undefined);
      expect(result).to.equal('/Users/mi/work/myproject/.github/skills/my-skill');
    });

    it('should use agentProfile skillFolderPath when deployPath omitted', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      const repoRoot = '/Users/mi/work/myproject';
      const result = resolver.resolveDeployFolderPath(repoRoot, 'claude', 'my-skill', undefined);
      expect(result).to.equal('/Users/mi/work/myproject/.claude/skills/my-skill');
    });

    it('should use explicit deployPath when provided', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      const repoRoot = '/Users/mi/work/myproject';
      const result = resolver.resolveDeployFolderPath(repoRoot, 'copilot', 'my-skill', 'custom/skill');
      expect(result).to.equal('/Users/mi/work/myproject/custom/skill');
    });

    it('should throw when agent not found in registry', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      const repoRoot = '/Users/mi/work/myproject';
      expect(() => resolver.resolveDeployFolderPath(repoRoot, 'unknown', 'my-skill', undefined))
        .to.throw('Agent profile not found: unknown');
    });
  });

  describe('resolveSkillFolderPath', () => {
    it('should resolve skill folder path without filename', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      const repoRoot = '/Users/mi/work/myproject';
      const result = resolver.resolveSkillFolderPath(repoRoot, 'copilot', 'my-skill');
      expect(result).to.equal('/Users/mi/work/myproject/.github/skills/my-skill');
    });
  });

  describe('resolveScope', () => {
    it('should return registry root for repo scope', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles', '/Users/mi/.agents');
      const result = resolver.resolveScope('repo');
      expect(result).to.equal('/Users/mi/.skillfiles');
    });

    it('should return shared root for shared scope', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles', '/Users/mi/.agents');
      const result = resolver.resolveScope('shared');
      expect(result).to.equal('/Users/mi/.agents');
    });
  });

  describe('resolveSkillFolderPathInRegistry', () => {
    it('should resolve skill folder path within registry', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      const result = resolver.resolveSkillFolderPathInRegistry('my-skill', 'repo');
      expect(result).to.equal('/Users/mi/.skillfiles/skills/my-skill');
    });

    it('should resolve skill folder path within shared root', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles', '/Users/mi/.agents');
      const result = resolver.resolveSkillFolderPathInRegistry('shared-skill', 'shared');
      expect(result).to.equal('/Users/mi/.agents/skills/shared-skill');
    });
  });
});
