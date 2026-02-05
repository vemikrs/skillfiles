import * as fs from 'fs/promises';
import * as path from 'path';
import { parseSkillFile } from './skill-parser.js';

/**
 * Validation result for a skill
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  path?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  suggestion?: string;
}

/**
 * Validate a skill folder against agentskills.io standard.
 */
export async function validateSkill(folderPath: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 1. Check SKILL.md exists
  const skillMdPath = path.join(folderPath, 'SKILL.md');
  let skillMdExists = false;
  
  try {
    await fs.access(skillMdPath);
    skillMdExists = true;
  } catch {
    errors.push({
      code: 'MISSING_SKILL_MD',
      message: 'SKILL.md file is required',
      path: skillMdPath
    });
  }

  // 2. Parse and validate frontmatter
  if (skillMdExists) {
    const { metadata, raw } = await parseSkillFile(skillMdPath);
    
    if (!metadata) {
      errors.push({
        code: 'MISSING_FRONTMATTER',
        message: 'YAML frontmatter is required (--- delimited block at start)',
        path: skillMdPath
      });
    } else {
      // Check required fields
      if (!metadata.name || metadata.name.trim() === '') {
        errors.push({
          code: 'MISSING_NAME',
          message: 'name field is required in frontmatter',
          path: skillMdPath
        });
      }

      if (!metadata.description || metadata.description.trim() === '') {
        warnings.push({
          code: 'MISSING_DESCRIPTION',
          message: 'description field is recommended for AI discovery',
          suggestion: 'Add a description explaining when to use this skill'
        });
      }

      // Check name matches folder
      const folderName = path.basename(folderPath);
      if (metadata.name && metadata.name !== folderName) {
        warnings.push({
          code: 'NAME_MISMATCH',
          message: `Skill name "${metadata.name}" doesn't match folder name "${folderName}"`,
          suggestion: 'Consider matching the skill name to the folder name'
        });
      }
    }

    // 3. Check for empty content
    if (raw.trim().length < 50) {
      warnings.push({
        code: 'MINIMAL_CONTENT',
        message: 'Skill content is very short',
        suggestion: 'Add detailed instructions for the AI agent'
      });
    }
  }

  // 4. Check standard folders are valid
  const standardFolders = ['scripts', 'references', 'assets'];
  for (const folder of standardFolders) {
    const folderFullPath = path.join(folderPath, folder);
    try {
      const stat = await fs.stat(folderFullPath);
      if (!stat.isDirectory()) {
        warnings.push({
          code: 'INVALID_FOLDER_TYPE',
          message: `${folder}/ should be a directory, not a file`,
          suggestion: `Rename ${folder} file and create ${folder}/ directory`
        });
      }
    } catch {
      // Folder doesn't exist, that's OK
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Format validation result for display.
 */
export function formatValidationResult(result: ValidationResult, skillName: string): string {
  const lines: string[] = [];
  
  if (result.valid) {
    lines.push(`✅ ${skillName}: Valid`);
  } else {
    lines.push(`❌ ${skillName}: Invalid`);
  }

  for (const error of result.errors) {
    lines.push(`  ❌ [${error.code}] ${error.message}`);
  }

  for (const warning of result.warnings) {
    lines.push(`  ⚠️ [${warning.code}] ${warning.message}`);
    if (warning.suggestion) {
      lines.push(`     → ${warning.suggestion}`);
    }
  }

  return lines.join('\n');
}
