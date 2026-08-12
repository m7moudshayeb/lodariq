# 0005. Versioned iframe postMessage bridge

- Status: Accepted
- PRD references: §9.4, §9.5, §11.1, §20
- Related: ADR 0015, ADR 0017

## Context

Authoring needs host-page access plus a security boundary, without a chatty
`postMessage` bottleneck and without standing up realtime infrastructure early.

## Decision

The authoring panel runs in a sandboxed iframe from a dedicated origin and
communicates over a versioned `postMessage` bridge. Keystrokes never cross the
bridge; Lexical updates are batched into semantic patches. Every established-
session message carries protocol version, session, document, and correlation
IDs and is runtime validated against `@lodariq/schema`. No standalone WebSocket
gateway in Pre-phase, Phase 0, or Phase 1.

Under ADR 0015's accepted target flow, the first-party popup and one-time-code
exchange happen before the editor bridge opens. A separate closed pre-session
message performs exactly one activation-grant handoff after validating the
iframe source, exact editor origin, protocol, request, and state. The iframe
consumes that grant to create the document session; it never returns the session
bearer to the host. All later semantic messages use the established session and
document envelope. Lodariq account/session credentials and one-time
authorization codes never cross the iframe bridge.

## Consequences

- Incoming messages validate the customer-app parent origin; outbound uses the
  exact target origin (never `*` outside local fixtures).
- Performance targets: typing < 50 ms p95, preview patch < 100 ms p95,
  payloads < 32 KB.
