import { expect } from 'chai';
import { PathResolver } from '../../core/path-resolver.js';
import type { Registry, AgentProfile } from '../../core/types.js';

describe('PathResolver', () => {
  const sampleRegistry: Registry = {
    agentProfiles: {
      copilot: {
        vendor: 'github',
        defaultDeployPath: '.github/copilot-instructions.md'
      },
      claude: {
        vendor: 'anthropic', 
        defaultDeployPath: '.claude/skill.md'
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

  describe('resolveDeployPath', () => {
    it('should resolve deployPath relative to repo root', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      const repoRoot = '/Users/mi/work/myproject';
      const result = resolver.resolveDeployPath(repoRoot, 'copilot', undefined);
      expect(result).to.equal('/Users/mi/work/myproject/.github/copilot-instructions.md');
    });

    it('should use agentProfile defaultDeployPath when deployPath omitted', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      const repoRoot = '/Users/mi/work/myproject';
      const result = resolver.resolveDeployPath(repoRoot, 'claude', undefined);
      expect(result).to.equal('/Users/mi/work/myproject/.claude/skill.md');
    });

    it('should use explicit deployPath when provided', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      const repoRoot = '/Users/mi/work/myproject';
      const result = resolver.resolveDeployPath(repoRoot, 'copilot', 'custom/skill.md');
      expect(result).to.equal('/Users/mi/work/myproject/custom/skill.md');
    });

    it('should throw when agent not found in registry', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      const repoRoot = '/Users/mi/work/myproject';
      expect(() => resolver.resolveDeployPath(repoRoot, 'unknown', undefined))
        .to.throw('Agent profile not found: unknown');
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

  describe('resolveSkillPath', () => {
    it('should resolve skill path within registry', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles');
      const result = resolver.resolveSkillPath('my-skill', 'repo');
      expect(result).to.equal('/Users/mi/.skillfiles/skills/my-skill/skill.md');
    });

    it('should resolve skill path within shared root', () => {
      const resolver = new PathResolver(sampleRegistry, scanRoots, '/Users/mi/.skillfiles', '/Users/mi/.agents');
      const result = resolver.resolveSkillPath('shared-skill', 'shared');
      expect(result).to.equal('/Users/mi/.agents/skills/shared-skill/skill.md');
    });
  });
});
