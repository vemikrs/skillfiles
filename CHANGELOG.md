# Changelog

All notable changes to the "Skillfiles" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- **Repo Status View**: Monitor sync status across targets
- **History View**: View and restore snapshots

#### Commands

- Push/Collect/Rollback individual skills
- Bulk Push/Collect all skills
- Show Diff between registry and deployed
- Create new skills
- Open audit log

### Technical

- VS Code 1.108+ support
- 101 unit tests
- TypeScript with ESM modules
- Handlebars for template variables
