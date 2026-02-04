# Skillfiles

Local-first agent skill manager for VS Code.

## Development

```bash
# Install dependencies
pnpm install

# Compile TypeScript
pnpm run compile

# Watch mode
pnpm run watch

# Run tests
pnpm test

# Run with coverage
pnpm run test:coverage
```

## Project Structure

```
src/
├── core/           # Core business logic
│   ├── registry/   # RegistryStore, HistoryManager, AuditLogStore
│   ├── template/   # TemplateEngine
│   ├── diff/       # DiffEngine
│   ├── scanner/    # RepoScanner
│   └── services/   # PushService, CollectService, etc.
├── views/          # VS Code TreeView providers
├── commands/       # Command handlers
├── utils/          # Utility functions
├── test/
│   ├── unit/       # Unit tests
│   ├── integration/# Integration tests
│   ├── e2e/        # End-to-end tests
│   └── fixtures/   # Test fixtures
└── extension.ts    # Extension entry point
```

## License

MIT
