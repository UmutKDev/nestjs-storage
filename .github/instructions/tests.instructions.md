---
applyTo: '**/*.spec.ts,**/*.e2e-spec.ts'
---

# Test Conventions

## Test Types

- Unit tests: `*.spec.ts` — run with `yarn test:unit`
- Integration/E2E tests: `*.e2e-spec.ts` — run with `yarn test:integration`
- Full CI suite: `yarn test:ci` (coverage enabled, no watch)

## Configuration

- Framework: Jest with `ts-jest`
- Timeout: 30s (unit), 60s (e2e)
- `clearMocks: true` and `restoreMocks: true` are set globally — no need to add manual cleanup.
- Path aliases are mapped in `jest.config.js` via `moduleNameMapper`.
- Shared test helpers: `test/test-utils.ts`
