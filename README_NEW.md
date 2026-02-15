# Draw.io Desktop

![Version](https://img.shields.io/badge/version-29.3.6-blue.svg)
![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)
![Electron](https://img.shields.io/badge/electron-38.x-blue.svg)

Draw.io Desktop is a security-first, completely offline diagramming application built with Electron. It wraps the [core draw.io editor](https://github.com/jgraph/drawio) in a desktop application that never transmits your diagram data externally.

## Features

- **100% Offline** - No internet connection required after installation
- **Privacy First** - No data ever leaves your computer
- **Cross-Platform** - Windows, macOS, and Linux support
- **Professional Export** - PDF, PNG, SVG, and more
- **Auto-Save & Backup** - Automatic draft and backup creation
- **Plugin Support** - Extensible with custom plugins (opt-in)
- **Modern Architecture** - Modular, type-safe, well-tested codebase

## Quick Start

### Installation

Download the latest release for your platform:
- **Windows:** `draw.io-X.X.X-windows-installer.exe`
- **macOS:** `draw.io-X.X.X.dmg`
- **Linux:** `draw.io-X.X.X.AppImage`

### Development Setup

```bash
# Clone with submodules (required!)
git clone --recursive https://github.com/jgraph/drawio-desktop.git
cd drawio-desktop

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run sync
npm run release-win  # or release-linux, release-appx, etc.
```

## Architecture

This project has been refactored with a modern, modular architecture:

```
src/
├── main/
│   ├── electron.js          # Main entry point
│   └── electron-preload.js  # Secure preload script
├── services/
│   ├── WindowManager.js     # Window lifecycle management
│   ├── FileService.js       # File operations with security
│   ├── ExportService.js     # Export to PDF/PNG/SVG/XML
│   ├── PluginService.js     # Plugin management
│   └── ClipboardService.js  # Clipboard operations
├── ipc/
│   └── handlers.js          # IPC request handlers
├── utils/
│   ├── logger.js            # Structured logging
│   ├── security.js          # Security utilities
│   ├── error-handler.js     # Error handling
│   └── display.js           # Display utilities
└── types/
    └── index.ts             # TypeScript type definitions
```

### Key Improvements

1. **Modular Services** - Separated concerns into focused modules
2. **Type Safety** - TypeScript definitions for critical interfaces
3. **Structured Logging** - Comprehensive logging with security sanitization
4. **Enhanced Security** - Path validation, rate limiting, content scanning
5. **Error Handling** - Custom error classes with user-friendly messages
6. **Testing** - Unit tests with Vitest, E2E tests with Playwright
7. **Code Quality** - ESLint with security rules, type checking

## Security

Draw.io Desktop is designed to be completely isolated from the internet:

- **Content Security Policy** prevents remote script execution
- **Context Isolation** separates renderer from main process
- **Path Validation** prevents directory traversal attacks
- **File Size Limits** prevents resource exhaustion (100MB default)
- **Rate Limiting** prevents IPC abuse (100 requests/minute)
- **SHA Validation** for allowed script sources

See [SECURITY.md](./SECURITY.md) for details.

## Testing

```bash
# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix
```

## Documentation

- [IPC Contracts](./docs/IPC_CONTRACTS.md) - IPC interface documentation
- [Troubleshooting](./docs/TROUBLESHOOTING.md) - Common issues and solutions
- [Architecture Decisions](./docs/adr/INDEX.md) - Design decisions and rationale
- [Release Process](./doc/RELEASE_PROCESS.md) - How releases are made

## CLI Usage

```bash
# Open a file
draw.io filename.drawio

# Export to PDF
draw.io -x -f pdf -o output.pdf input.drawio

# Export all pages
draw.io -x -a -f pdf input.drawio

# See all options
draw.io --help
```

## Contributing

**Note:** This project is closed to external contributions. It's maintained by JGraph Ltd.

However, we welcome:
- Bug reports via [GitHub Issues](https://github.com/jgraph/drawio-desktop/issues)
- Feature requests (understand they may not be implemented)
- Security reports (see SECURITY.md)

## Support

- **Documentation:** https://www.drawio.com/doc/
- **Issues:** https://github.com/jgraph/drawio-desktop/issues
- **FAQ:** https://www.drawio.com/doc/faq

## License

Apache License 2.0 - See [LICENSE](./LICENSE) for details.

## Acknowledgments

- [Electron](https://electronjs.org/) - Cross-platform framework
- [draw.io](https://github.com/jgraph/drawio) - Core diagramming editor
- [pdf-lib](https://pdf-lib.js.org/) - PDF manipulation
- [electron-updater](https://github.com/electron-userland/electron-builder) - Auto-updater

---

**Note:** Purchasing draw.io for Confluence or Jira does not entitle you to commercial support for draw.io desktop. Support is provided on a best-effort basis via GitHub issues.
