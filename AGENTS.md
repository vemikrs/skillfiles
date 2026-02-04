# Agent Instructions

## Project Overview

Skillfiles is a VS Code extension for managing agent behavior definitions (skill.md files).

## Key Principles

1. **Local-first**: All operations are performed locally, no external API calls
2. **Registry as source of truth**: The registry holds the authoritative skill definitions
3. **TDD approach**: Write tests before implementation

## Code Style

- Use TypeScript strict mode
- ESM modules with `.js` extensions in imports
- Naming: camelCase for functions, PascalCase for types/classes
- Prefix unused parameters with `_`

## Architecture

```
src/
├── core/     # Business logic and data types
├── utils/    # Pure utility functions
├── views/    # VS Code TreeView providers (TODO)
├── commands/ # Command handlers (TODO)
└── test/     # Test files mirror src structure
```

## Testing

```bash
pnpm run compile && pnpm run test:unit
```

## Common Tasks

- **Add new utility**: Create in `src/utils/`, add tests in `src/test/unit/`
- **Add new type**: Define in `src/core/types.ts`
- **Add new error**: Define in `src/core/errors.ts`
