# Architecture Decision Records

This document records architectural decisions made during the development of draw.io Desktop.

## ADR-001: Modular Architecture for Main Process

**Status:** Accepted

**Context:**
The original `electron.js` file had grown to over 2,700 lines, handling window management, IPC, exports, file operations, and CLI parsing. This monolithic structure made the code difficult to maintain, test, and reason about.

**Decision:**
Split the main process into modular services:
- `WindowManager` - Window lifecycle and state management
- `FileService` - All file operations with security
- `ExportService` - Export to various formats
- `PluginService` - Plugin management
- `ClipboardService` - Clipboard operations
- `IPCHandlers` - Centralized IPC communication

**Consequences:**
- **Positive:** Better separation of concerns, easier testing, improved maintainability
- **Positive:** Clear boundaries make security auditing easier
- **Negative:** More files to manage
- **Negative:** Potential for circular dependencies (mitigated by clear service boundaries)

---

## ADR-002: TypeScript Type Definitions

**Status:** Accepted

**Context:**
The codebase was entirely JavaScript with no type checking. This made it difficult to catch bugs, especially in IPC communication where interfaces between main and renderer processes must match.

**Decision:**
Introduce TypeScript for type definitions without full migration:
- Add `tsconfig.json` for type checking
- Create type definitions in `src/types/index.ts`
- Use JSDoc comments for type hints in JavaScript files
- Enable `checkJs: true` in TypeScript config

**Consequences:**
- **Positive:** Type safety for critical interfaces
- **Positive:** Better IDE support with autocomplete
- **Positive:** Catch type mismatches at build time
- **Negative:** Additional build step (type checking)
- **Negative:** Learning curve for developers unfamiliar with TypeScript

---

## ADR-003: Structured Logging

**Status:** Accepted

**Context:**
The original code used `console.log` inconsistently, with many errors silently swallowed. This made debugging difficult, especially in production environments.

**Decision:**
Implement a structured logging system:
- Use `electron-log` for log file management
- Create custom Logger class with levels (error, warn, info, debug, verbose)
- Include context, trace IDs, and sanitized data in log entries
- Separate child loggers for different modules

**Consequences:**
- **Positive:** Consistent logging across the application
- **Positive:** Security through data sanitization (passwords/tokens redacted)
- **Positive:** Better debugging with trace IDs for request tracking
- **Positive:** Performance timing built-in
- **Negative:** Slightly more verbose code

---

## ADR-004: Enhanced Security Validation

**Status:** Accepted

**Context:**
Security is a primary concern for draw.io Desktop. The original code had basic path validation but lacked comprehensive security measures.

**Decision:**
Implement comprehensive security validation:
- Path traversal detection and prevention
- File size limits (100MB default)
- Content validation for suspicious patterns
- Rate limiting for IPC calls (100/minute)
- Secure filename sanitization
- Strict URL validation for external links

**Consequences:**
- **Positive:** Protection against directory traversal attacks
- **Positive:** Prevention of resource exhaustion
- **Positive:** Rate limiting prevents abuse
- **Negative:** May reject legitimate but unusual files
- **Negative:** Performance overhead for validation (minimal)

---

## ADR-005: ESM Preload Script

**Status:** Accepted

**Context:**
The original preload script used CommonJS (`require()`) while the rest of the application used ES modules. This inconsistency was confusing.

**Decision:**
Update preload script to use ES modules where possible, maintaining compatibility with Electron's contextBridge:
- Convert to `.js` with ES module syntax
- Use TypeScript-style type annotations (for documentation)
- Maintain compatibility with existing renderer code

**Consequences:**
- **Positive:** Consistent module system across codebase
- **Positive:** Better tree-shaking potential
- **Negative:** Requires careful handling of Electron's module system
- **Negative:** Some Electron APIs still require CommonJS

---

## ADR-006: Vitest for Testing

**Status:** Accepted

**Context:**
The project had no automated tests, making it difficult to verify changes and prevent regressions.

**Decision:**
Adopt Vitest for unit testing:
- Fast, modern test runner compatible with ES modules
- Built-in coverage reporting
- Easy mocking capabilities
- TypeScript support

**Consequences:**
- **Positive:** Can test modules in isolation
- **Positive:** Fast test execution
- **Positive:** Native ES module support
- **Negative:** Need to write comprehensive tests (ongoing effort)

---

## ADR-007: Playwright for E2E Testing

**Status:** Proposed

**Context:**
Unit tests don't catch integration issues between main and renderer processes or UI interactions.

**Decision:**
Use Playwright for end-to-end testing:
- Test real Electron application
- Automated UI interactions
- Cross-platform testing
- Screenshot comparison for visual regression

**Consequences:**
- **Positive:** Tests actual user workflows
- **Positive:** Catches integration issues
- **Negative:** Slower than unit tests
- **Negative:** More complex test setup
- **Negative:** Tests may be flaky due to timing

---

## ADR-008: ESLint with Security Rules

**Status:** Accepted

**Context:**
The project had no linting, leading to inconsistent code style and potential security issues.

**Decision:**
Add ESLint with security-focused rules:
- Standard ESLint recommended rules
- `eslint-plugin-security` for security patterns
- `eslint-plugin-import` for module validation
- Consistent with existing code style (tabs, Allman braces)

**Consequences:**
- **Positive:** Catches common security issues
- **Positive:** Consistent code style
- **Positive:** Prevents import cycles
- **Negative:** Initial cleanup required
- **Negative:** May need to disable some rules for specific cases

---

## ADR-009: GitHub Actions CI/CD

**Status:** Accepted

**Context:**
The build process was manual and error-prone, with no automated testing before releases.

**Decision:**
Enhance GitHub Actions workflows:
- Run security audits on every PR
- Execute unit tests before builds
- Type checking with TypeScript
- ESLint validation
- Upload build artifacts for testing

**Consequences:**
- **Positive:** Automated quality gates
- **Positive:** Faster feedback on issues
- **Positive:** Consistent build environment
- **Negative:** Longer CI pipeline
- **Negative:** Requires maintenance of workflow files

---

## ADR-010: CSP with SHA Hashes

**Status:** Accepted

**Context:**
The Content Security Policy uses hardcoded SHA hashes for script sources, which breaks when the drawio submodule is updated.

**Decision:**
Maintain CSP with SHA hashes but document the update process:
- Document how to calculate new hashes
- Add pre-build check for hash validation
- Consider nonce-based CSP in future (requires drawio changes)

**Consequences:**
- **Positive:** Strong security against XSS
- **Negative:** Manual step required when updating submodule
- **Negative:** Risk of breaking app if hashes aren't updated

---

## ADR-011: Zod for Runtime Validation (Proposed)

**Status:** Proposed

**Context:**
IPC messages are not validated at runtime, potentially leading to type mismatches and crashes.

**Decision:**
Consider adding Zod for runtime schema validation:
- Validate IPC message shapes
- Better error messages for malformed messages
- Type inference from schemas

**Consequences:**
- **Positive:** Runtime type safety
- **Positive:** Better error messages
- **Negative:** Additional dependency
- **Negative:** Performance overhead for validation
- **Negative:** Requires defining schemas for all messages

---

## Decisions Pending Review

### ADR-P001: Migration to TypeScript
Full migration from JavaScript to TypeScript.

**Considerations:**
- Significant effort required
- Better long-term maintainability
- Would enable stricter type checking
- All new code could be TypeScript

### ADR-P002: ASAR Integrity Validation
Enable `EnableEmbeddedAsarIntegrityValidation` fuse.

**Considerations:**
- Stronger tamper protection
- May cause issues on some platforms
- Requires thorough testing before enabling

### ADR-P003: Plugin Sandboxing
Sandbox plugins to prevent them from accessing Node.js APIs.

**Considerations:**
- Better security isolation
- May break existing plugins
- Requires new plugin API design

---

## References

- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
