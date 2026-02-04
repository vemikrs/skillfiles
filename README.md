# Skillfiles

Local-first agent skill manager for VS Code.

## Features

- **Registry Management**: Centralized skill definitions with version history
- **Multi-Agent Support**: Deploy skills to Copilot, Claude, and other agents
- **Template Variables**: Handlebars-based variable substitution
- **Sync Operations**: Push to repositories, collect changes back
- **Conflict Detection**: Diff and merge capabilities

## Development

```bash
# Install dependencies
pnpm install

# Compile TypeScript
pnpm run compile

# Run tests
pnpm test

# Lint code
pnpm run lint
```

## Project Structure

```
src/
├── core/           # Core types and error definitions
│   ├── types.ts    # Type definitions
│   ├── errors.ts   # Custom error classes
│   └── index.ts    # Module exports
├── utils/          # Utility functions
│   ├── hash.ts     # SHA256 hash computation
│   ├── path.ts     # Path manipulation utilities
│   └── index.ts    # Module exports
├── test/
│   ├── unit/       # Unit tests
│   └── fixtures/   # Test data files
└── extension.ts    # Extension entry point
```

## Configuration

| Setting                      | Default         | Description              |
| ---------------------------- | --------------- | ------------------------ |
| `skillfiles.registryPath`    | `~/.skillfiles` | Path to skill registry   |
| `skillfiles.sharedSkillRoot` | `~/.agents`     | Path to shared skills    |
| `skillfiles.scanRoots`       | `[]`            | Scan root directories    |
| `skillfiles.scanLimit`       | `200`           | Max repositories to scan |

## License

[MIT](LICENSE)
