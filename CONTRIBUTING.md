# Contributing to Skillfiles

## Development Setup

```bash
# Clone the repository
git clone https://github.com/mi/skillfiles.git
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
├── core/           # Core types and error definitions
├── utils/          # Utility functions
├── test/           # Test files
└── extension.ts    # Extension entry point
```

## Testing

```bash
# Unit tests
pnpm run test:unit

# All tests
pnpm test

# With coverage
pnpm run test:coverage
```

## Code Style

- TypeScript strict mode
- ESM modules with `.js` extensions in imports
- ESLint for linting

## Pull Requests

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request
