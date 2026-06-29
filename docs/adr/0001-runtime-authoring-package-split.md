# 0001. Physical runtime/authoring package split

- Status: Accepted
- PRD references: §9.1, §16.0, §20

## Context

The single most important SDK boundary is that the production runtime bundle
must never include React or Lexical. A lint rule alone can be violated by an
agent or a refactor.

## Decision

Ship two physically separate packages: `@lodariq/sdk-runtime` (framework-free
loader/runtime/resolver/renderers) and `@lodariq/sdk-authoring` (React + Lexical,
authenticated-creator only). The runtime package does not depend on the
authoring package, so the module system itself prevents React/Lexical from
entering the runtime bundle.

## Consequences

- Floating UI DOM is the only allowed default third-party dep in the runtime.
- Enforced three ways: package separation, dependency-cruiser, and ESLint
  `no-restricted-imports`.
- Do not collapse the two packages or let runtime import authoring (§20).
