import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { validateSkill, formatValidationResult } from '../../core/skill-validator.js';

describe('SkillValidator', () => {
  let testDir: string;
  const testRoot = path.join(process.cwd(), '.test-tmp');

  beforeEach(() => {
    fs.mkdirSync(testRoot, { recursive: true });
    testDir = fs.mkdtempSync(path.join(testRoot, 'validator-'));
  });

  afterEach(() => {
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('validateSkill', () => {
    it('should pass for valid skill with name and description', async () => {
      const skillDir = path.join(testDir, 'my-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: my-skill
description: A test skill for validation
---

# My Skill

This is a detailed test skill with enough content to pass validation.
It provides comprehensive instructions for the AI agent to follow.
`);

      const result = await validateSkill(skillDir);
      expect(result.valid).to.equal(true);
      expect(result.errors).to.have.length(0);
    });

    it('should fail for skill without SKILL.md', async () => {
      const skillDir = path.join(testDir, 'empty-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      const result = await validateSkill(skillDir);
      expect(result.valid).to.equal(false);
      expect(result.errors.some(e => e.code === 'MISSING_SKILL_MD')).to.equal(true);
    });

    it('should fail for skill without frontmatter', async () => {
      const skillDir = path.join(testDir, 'no-frontmatter');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# No Frontmatter

This skill has no YAML frontmatter.
`);

      const result = await validateSkill(skillDir);
      expect(result.valid).to.equal(false);
      expect(result.errors.some(e => e.code === 'MISSING_FRONTMATTER')).to.equal(true);
    });

    it('should use folder name when name field is missing', async () => {
      const skillDir = path.join(testDir, 'no-name');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
description: A skill without a name
---

# No Name Skill
`);

      // When name is not provided, parseSkillFile uses folder name as fallback
      // So this should still be valid
      const result = await validateSkill(skillDir);
      expect(result.valid).to.equal(true);
    });

    it('should warn for missing description', async () => {
      const skillDir = path.join(testDir, 'no-description');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: no-description
---

# No Description Skill

This skill has a name but no description field in frontmatter.
The content is long enough to avoid minimal content warning.
`);

      const result = await validateSkill(skillDir);
      expect(result.valid).to.equal(true);
      expect(result.warnings.some(w => w.code === 'MISSING_DESCRIPTION')).to.equal(true);
    });

    it('should warn when skill name does not match folder name', async () => {
      const skillDir = path.join(testDir, 'folder-name');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: different-name
description: Skill with mismatched name
---

# Different Name Skill

This skill has a name that doesn't match the folder name.
`);

      const result = await validateSkill(skillDir);
      expect(result.warnings.some(w => w.code === 'NAME_MISMATCH')).to.equal(true);
    });

    it('should warn for minimal content', async () => {
      const skillDir = path.join(testDir, 'minimal');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: minimal
---

# Minimal
`);

      const result = await validateSkill(skillDir);
      expect(result.warnings.some(w => w.code === 'MINIMAL_CONTENT')).to.equal(true);
    });
  });

  describe('formatValidationResult', () => {
    it('should format valid result correctly', () => {
      const result = {
        valid: true,
        errors: [],
        warnings: []
      };

      const formatted = formatValidationResult(result, 'test-skill');
      expect(formatted).to.include('✅');
      expect(formatted).to.include('test-skill');
      expect(formatted).to.include('Valid');
    });

    it('should format invalid result with errors', () => {
      const result = {
        valid: false,
        errors: [{ code: 'TEST_ERROR', message: 'Test error message' }],
        warnings: []
      };

      const formatted = formatValidationResult(result, 'test-skill');
      expect(formatted).to.include('❌');
      expect(formatted).to.include('TEST_ERROR');
      expect(formatted).to.include('Test error message');
    });

    it('should format warnings with suggestions', () => {
      const result = {
        valid: true,
        errors: [],
        warnings: [{ 
          code: 'TEST_WARNING', 
          message: 'Test warning message',
          suggestion: 'Try doing this instead'
        }]
      };

      const formatted = formatValidationResult(result, 'test-skill');
      expect(formatted).to.include('⚠️');
      expect(formatted).to.include('TEST_WARNING');
      expect(formatted).to.include('Try doing this instead');
    });
  });
});
