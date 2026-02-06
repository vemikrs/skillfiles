# Contributing to Skillfiles

## Development Setup

```bash
# Clone the repository
git clone https://github.com/vemikrs/skillfiles.git
cd skillfiles

# Install dependencies
pnpm install

# Compile TypeScript
pnpm run compile

# Run tests
pnpm test

# Start watch mode
pnpm run watch
```

## Project Structure

```
src/
├── core/           # Business logic, types, and engines
│   ├── types.ts        # Core type definitions
│   ├── errors.ts       # Custom error classes
│   ├── registry-store.ts
│   ├── diff-engine.ts
│   ├── template-engine.ts
│   └── repo-scanner.ts
├── services/       # Push, Collect, Rollback services
├── views/          # VS Code TreeView providers
│   ├── skills-view-provider.ts
│   ├── repo-status-view-provider.ts
│   ├── history-view-provider.ts
│   └── variables-view-provider.ts
├── commands/       # Command handlers
├── utils/          # Utility functions
└── extension.ts    # Extension entry point
```

## Testing

```bash
# Unit tests
pnpm run test:unit

# All tests
pnpm test

# Type checking
pnpm run typecheck
```

## Code Style

- TypeScript strict mode
- ESM modules with `.js` extensions in imports
- ESLint for linting
- Naming: camelCase for functions, PascalCase for types/classes

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests and linting (`pnpm test && pnpm run lint`)
5. Commit with conventional commits (`feat:`, `fix:`, `docs:`, etc.)
6. Submit a pull request
