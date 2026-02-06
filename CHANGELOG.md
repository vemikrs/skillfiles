# Changelog

All notable changes to the "Skillfiles" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-02-06

### Added

- **Skills View redesign**: Skills now show two sections when expanded:
  - **Targets**: Deployment targets with sync status indicators
  - **Contents**: Skill folder contents (SKILL.md, scripts, etc.)
- **Home directory scanning**: Shared skills now detect deployments in `~/.gemini/skills/`, `~/.agent/skills/`, etc.

### Fixed

- Add Target now correctly updates both `skill.targets` and `registry.targets`

## [0.1.1] - 2026-02-05

### Added

- **Import Shared Skills**: Scan and import skills from user home directories
- **Shared skill support**: Deploy skills to user-wide agent directories
- **Folder-level management**: Skills are now managed as complete folders, not just SKILL.md files

### Fixed

- Expand `~` to home directory in scan paths

## [0.1.0] - 2026-02-04

### Added

#### Core

- **Registry Store**: YAML-based registry for managing skills and targets
- **History Manager**: Automatic snapshots before every change
- **Audit Log Store**: Track all operations with timestamps
- **Template Engine**: Handlebars-based variable expansion
- **Diff Engine**: Smart content comparison with normalization

#### Services

- **Push Service**: Deploy skills from registry to repositories
- **Collect Service**: Import skills from repositories to registry
- **Rollback Service**: Restore previous versions from history

#### Views

- **Skills View**: Browse all registered skills
- **Deploy Status View**: Monitor sync status across targets
- **History View**: View and restore snapshots
- **Variables View**: Manage template variables

#### Commands

- Push/Collect/Rollback individual skills
- Bulk Push/Collect all skills
- Show Diff between registry and deployed
- Create new skills
- Open audit log

### Technical

- VS Code 1.107+ support
- 104 unit tests
- TypeScript with ESM modules
- Handlebars for template variables
