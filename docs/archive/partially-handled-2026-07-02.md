# Archived: Partial / Not Fully PRD-Complete

Status: superseded by `../PROGRESS.md`. Retained only as a historical snapshot;
do not use it to determine current implementation status.

- The Lexical editor boundary exists, but the main current authoring UI is still the React local-frame/controller over canonical JSON. It is not
  yet the full production-grade Lexical Floating Document Builder described in the PRD.

- Block transactions exist as operations/preview patches, but most structural edits send replaceDocument; the eventual fine-grained transaction
  model is only partly realized.

- Publications are immutable DB rows/artifacts, but not yet the full content-addressed object/manifest pipeline.
- Content safety is narrow and decent for current structured blocks, but full DOMPurify/rehype pipelines are not present because raw HTML/
  Markdown import/source mode is not implemented.

- URL policy is looser than the PRD: openPage currently allows http:/https: plus relative/hash URLs; PRD calls for https:, mailto:, and approved
  app schemes.

- Observability is basic: runtime/API event ingestion and sanitized SDK error events exist, but Sentry/OpenTelemetry tracing is not wired code-
  wise.

- Data catalog exists only as schema, not as ingestion-derived storage, API, dashboard picker, or rule builder.

Not Started / Later Phases

- Multi-document delivery beyond tours: announcements, checklists, surveys, hotspots, knowledge widget.
- Hosted public demos.
- Media export pipeline.
- Theme editor.
- Segment/rule builder and customer data catalog UI.
- Analytics dashboard.
- Review inbox, workflow governance, audit log, rollback UI.
- Billing, enterprise controls, deletion workflow.
- Workers/queues/background jobs.
