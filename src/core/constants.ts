/**
 * Shared constants for Skillfiles extension
 */

/**
 * Default locations to scan for shared skills in user home directory.
 */
export const USER_HOME_SKILL_DIRS = [
  { agent: 'agent', path: '.agent/skills' },
  { agent: 'gemini', path: '.gemini/skills' },
  { agent: 'claude', path: '.claude/skills' },
  { agent: 'copilot', path: '.github/skills' },
  { agent: 'codex', path: '.codex/skills' }
] as const;

export type UserHomeSkillDir = typeof USER_HOME_SKILL_DIRS[number];
