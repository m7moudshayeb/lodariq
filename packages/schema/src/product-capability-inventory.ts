import type {
  ProductCapabilityClaim,
  ProductCapabilityId,
  ProductCapabilityLayer,
} from './product-capabilities';

type CapabilitySeed = Omit<ProductCapabilityClaim, 'id'>;

/** Audited product truth. Commercial entitlements remain a separate layer. */
export const PRODUCT_CAPABILITY_INVENTORY = {
  'authoring.spotlight-motion': implemented(
    'authoring',
    'Spotlight holes travel between resolved semantic targets, with cancellation and reduced-motion behavior covered by runtime tests.',
    'code:packages/sdk-runtime/src/renderers/tour-emphasis.ts',
  ),
  'authoring.target-styling': implemented(
    'authoring',
    'Target outline styling is editable, persisted in the canonical document, and rendered in authoring preview.',
    'test:packages/tests/sdk-authoring/src/authoring/appearance-target-outline.test.ts',
  ),
  'runtime.target-focus': implemented(
    'runtime',
    'Runtime target focus zooms the product surface, follows reflow, restores cleanly, and honors reduced motion.',
    'code:packages/sdk-runtime/src/renderers/tour-positioning.ts',
  ),
  'runtime.motion-presets': implemented(
    'runtime',
    'Entry and exit motion presets are mapped into bounded runtime choreography with cancellation and reduced-motion fallbacks.',
    'test:packages/tests/sdk-runtime/src/renderers/tour-capability-primitives.test.ts',
  ),
  'authoring.narrated-autoplay': implemented(
    'authoring',
    'Narrated steps support gesture-gated playback, captions, scrubbing, offsets, auto-advance, and cancellation.',
    'test:packages/tests/sdk-runtime/src/renderers/tour-narration.test.ts',
  ),
  'authoring.shareable-demo-links': implemented(
    'authoring',
    'Versioned, server-reviewed targetless projections pin one immutable staging publication, serve from the dedicated demo origin through a runtime-only CSP shell, and collect bounded anonymous scoped events without customer-page capture or replay.',
    'test:packages/tests/api/src/sdk-authoring-operations.test.ts',
    'test:packages/tests/sdk-runtime/src/demo-player.test.ts',
  ),
  'authoring.voice-driven': implemented(
    'authoring',
    'Explicit microphone capture creates a bounded review-required proposal whose copy, separate narration script, locale, and selected semantic target persist only after approval.',
    'test:packages/tests/sdk-authoring/src/authoring/proposal-application.test.ts',
  ),
  'authoring.record-to-author': implemented(
    'authoring',
    'Explicit sessions retain only bounded semantic target and lifecycle evidence, segment it into review-required steps, and preserve available target bindings and approaches on apply.',
    'test:packages/tests/sdk-authoring/src/authoring/proposal-application.test.ts',
  ),
  'authoring.transient-state-targets': implemented(
    'authoring',
    'Canonical target approaches compile and execute bounded route, panel, tab, network, scroll, and open-shadow lifecycle actions before resolution.',
    'test:packages/tests/sdk-authoring/src/authoring/data-relative-targets.test.ts',
  ),
  'authoring.data-relative-targets': implemented(
    'authoring',
    'Creators can author semantic collection policies such as first and newest item, and runtime resolution applies those policies.',
    'test:packages/tests/sdk-authoring/src/authoring/data-relative-targets.test.ts',
  ),
  'authoring.multi-app-journeys': implemented(
    'authoring',
    'Compiled journey handoffs preserve document and publication scope across registered application destinations; token-signing hardening remains tracked separately.',
    'test:packages/tests/sdk-runtime/src/loader/journey-handoff.test.ts',
  ),
  'authoring.storyboard': implemented(
    'authoring',
    'The storyboard edits supported card fields and provides keyboard and pointer reordering through coordinated document mutations.',
    'test:packages/tests/sdk-authoring/src/authoring/operations-sections.test.ts',
  ),
  'authoring.templates': implemented(
    'authoring',
    'Versioned templates create idempotent standalone drafts with fresh document and block identities through the authenticated operations boundary; semantic target proposals stay explicit and unbound for creator review.',
    'test:packages/tests/api/src/sdk-authoring-operations.test.ts',
  ),
  'authoring.side-by-side': implemented(
    'authoring',
    'Supported rich-content groups can be authored and previewed side by side without introducing raw layout markup.',
    'test:packages/tests/sdk-authoring/src/authoring/rich-content-canvas.test.ts',
  ),
  'authoring.version-diff': implemented(
    'authoring',
    'The authoring workflow loads scoped persisted version history and compares any two canonical snapshots plus their exact stored immutable artifacts by semantic category without recompiling history.',
    'test:packages/tests/api/src/sdk-authoring-operations.test.ts',
  ),
  'authoring.change-aware-copy': implemented(
    'authoring',
    'Reviewable before-and-after patches are derived from scoped persisted document versions, stored as bounded text evidence, and apply or dismiss decisions are recorded in a separate append-only tenant-scoped history.',
    'test:packages/tests/api/src/sdk-authoring-operations.test.ts',
  ),
  'authoring.simulated-user': absent(
    'authoring',
    'Intentionally deferred: no simulated-user execution or generated interaction model is shipped.',
  ),
  'delivery.adaptive': implemented(
    'delivery',
    'Runtime adaptation stays within compiled limits and records bounded decisions without mutating immutable artifacts.',
    'test:packages/tests/sdk-runtime/src/renderers/adaptive-tour.test.ts',
  ),
  'authoring.locale-media': implemented(
    'authoring',
    'Approved locale variants are authorable, publication-validated, pinned into immutable locale branches, selected by runtime locale, and fail safely to explicit fallback or base media.',
    'test:packages/tests/compiler/src/locale-media.test.ts',
  ),
  'delivery.ab-testing': implemented(
    'delivery',
    'Stable assignment, eligibility, exposure, and immutable variant delivery are implemented across orchestration and runtime.',
    'test:packages/tests/sdk-runtime/src/activation/experiment-runtime.test.ts',
  ),
  'analytics.scoped-replay': implemented(
    'analytics',
    'Experience-scoped semantic sessions can be replayed without capturing full-page DOM, keystrokes, or arbitrary customer activity.',
    'test:packages/tests/database/experience-sessions.test.ts',
  ),
  'runtime.block-conditions': implemented(
    'runtime',
    'Compiled block conditions use the bounded runtime context and hidden blocks are excluded from rendering and accessibility output.',
    'test:packages/tests/sdk-runtime/src/renderers/tour.test.ts',
  ),
  'collaboration.live-cursors': absent(
    'collaboration',
    'Intentionally deferred: presence does not transmit pointer positions or live selections.',
  ),
  'collaboration.comment-threads': implemented(
    'collaboration',
    'Document-scoped comment threads support authorized creation, replies, resolution, and persistence.',
    'test:packages/tests/api/src/sdk-authoring-operations.test.ts',
  ),
  'authoring.figma-token-import': absent(
    'authoring',
    'Intentionally deferred: Lodariq does not import or persist Figma semantic tokens.',
  ),
  'commercial.entitlements': implemented(
    'commercial',
    'Versioned plan snapshots, enforcement, provider-verified subscription and invoice synchronization, replay protection, checkout and portal sessions, and a tenant-scoped dashboard billing surface are wired end to end through a provider-neutral adapter.',
    'test:packages/tests/api/src/commercial-billing.test.ts',
    'test:packages/tests/database/src/commercial-billing.test.ts',
  ),
  'commercial.metering': implemented(
    'commercial',
    'Tenant-scoped usage and AI ledgers close into immutable versioned batches, then use leased retry-safe provider submission and quantity readback reconciliation with dashboard-visible history.',
    'test:packages/tests/api/src/commercial-billing.test.ts',
    'migration:packages/database/drizzle/0030_commercial_billing_lifecycle.sql',
  ),
  'delivery.scheduling': implemented(
    'delivery',
    'Scheduled delivery windows are persisted and activated by the delivery orchestration worker.',
    'code:packages/database/src/drizzle/delivery-orchestration.ts',
  ),
  'delivery.audience-rules': implemented(
    'delivery',
    'Bounded audience predicates are compiled and evaluated by the runtime delivery orchestrator.',
    'code:packages/sdk-runtime/src/activation/delivery-orchestrator.ts',
  ),
  'delivery.event-triggers': implemented(
    'delivery',
    'Declared semantic product events can trigger eligible compiled experiences.',
    'code:packages/sdk-runtime/src/activation/delivery-orchestrator.ts',
  ),
  'delivery.lifecycle-triggers': implemented(
    'delivery',
    'Declared route and lifecycle signals can trigger eligible compiled experiences without coordinate-based activation.',
    'code:packages/sdk-runtime/src/activation/delivery-orchestrator.ts',
  ),
  'runtime.experience-parity': implemented(
    'runtime',
    'Announcement, hotspot, survey, checklist, and tour surfaces compile and render through the shared experience runtime contract.',
    'test:packages/tests/sdk-runtime/src/renderers/experience-surface-contract.test.ts',
  ),
  'analytics.completion': implemented(
    'analytics',
    'Completion metrics are calculated from authoritative release-scoped experience events.',
    'test:packages/tests/database/experience-measurement.test.ts',
  ),
  'analytics.forms': implemented(
    'analytics',
    'Form responses are validated, tenant-scoped, and stored through the public SDK response path.',
    'test:packages/tests/api/src/sdk-form-responses.test.ts',
  ),
  'analytics.funnels': implemented(
    'analytics',
    'Ordered experience-event funnels are computed from authoritative scoped measurements.',
    'test:packages/tests/database/experience-measurement.test.ts',
  ),
  'analytics.adoption': implemented(
    'analytics',
    'Feature-adoption reporting is available from authoritative experience measurements.',
    'test:packages/tests/database/experience-measurement.test.ts',
  ),
  'analytics.retention': implemented(
    'analytics',
    'Retention reporting applies explicit cutoffs and keeps staging and production measurements separated.',
    'test:packages/tests/database/experience-measurement.test.ts',
  ),
  'analytics.segmentation': implemented(
    'analytics',
    'Reports support bounded locale and audience segmentation over tenant-scoped measurements.',
    'test:packages/tests/database/src/analytics-segmentation.test.ts',
  ),
  'analytics.cohorts': implemented(
    'analytics',
    'Weekly return cohorts are derived from authoritative experience sessions.',
    'test:packages/tests/database/experience-measurement.test.ts',
  ),
  'analytics.csv-export': implemented(
    'analytics',
    'Authorized analytics report exports are available as bounded CSV downloads.',
    'test:packages/tests/api/src/sdk-authoring-operations.test.ts',
  ),
  'analytics.warehouse-sync': implemented(
    'analytics',
    'Versioned environment-scoped destinations use credential references, leased checkpoint delivery, provider count/hash readback reconciliation, retries, and append-only synchronization history without exporting internal visitor hashes.',
    'test:packages/tests/api/src/analytics-warehouse.test.ts',
    'migration:packages/database/drizzle/0032_analytics_warehouse_sync.sql',
  ),
  'analytics.raw-export': implemented(
    'analytics',
    'Asynchronous tenant-scoped raw export jobs persist progress and downloadable results.',
    'test:packages/tests/database/src/analytics-exports.test.ts',
  ),
  'analytics.release-history': implemented(
    'analytics',
    'Measurement reports retain release, publication, locale, and definition-version context.',
    'test:packages/tests/database/experience-measurement.test.ts',
  ),
  'authoring.ask-lodariq': implemented(
    'authoring',
    'The authoring assistant produces bounded reviewable proposals through an authorized server route.',
    'test:packages/tests/api/src/sdk-authoring-operations.test.ts',
  ),
  'authoring.translation': implemented(
    'authoring',
    'Authorized translation creates reviewable locale projections without limiting source authoring languages.',
    'test:packages/tests/api/src/authoring-translation.test.ts',
  ),
  'authoring.add-locale': implemented(
    'authoring',
    'Creators can add arbitrary valid content locales and persist locale state in canonical documents.',
    'test:packages/tests/sdk-authoring/src/authoring/operations-sections.test.ts',
  ),
  'authoring.locale-layout-qa': implemented(
    'authoring',
    'Predictive checks are supplemented by an explicit revision-bound sweep that renders every locale and step through the real host-page preview, returns only bounded overflow, clipping, and availability codes, and invalidates evidence when the draft changes.',
    'test:packages/tests/sdk-authoring/src/bridge/locale-layout-verifier.test.ts',
    'test:packages/tests/sdk-authoring/src/authoring/operations-sections.test.ts',
  ),
  'authoring.narration-audio': implemented(
    'authoring',
    'Authorized narration generation produces immutable media referenced by compiled steps and rendered with accessible controls.',
    'test:packages/tests/api/src/sdk-authoring-operations.test.ts',
  ),
  'authoring.voice-cloning': disabled(
    'authoring',
    'Intentionally excluded as a product non-goal: Lodariq supports standard provider narration voices without enrolling, cloning, or reproducing a customer voice.',
    'contract:docs/adr/0014-environment-document-release-pointers.md',
  ),
  'brand.theme-variants': implemented(
    'authoring',
    'Versioned semantic theme variants are reviewable and compile into immutable renderer snapshots.',
    'test:packages/tests/sdk-authoring/src/authoring/brand-variants.test.ts',
  ),
  'brand.drift-notifications': implemented(
    'authoring',
    'Authenticated drift detection can emit bounded notifications without mutating approved themes or live artifacts.',
    'test:packages/tests/api/src/platform-governance.test.ts',
  ),
  'governance.audit-browsing': implemented(
    'governance',
    'Authorized tenant governance events can be browsed with bounded filters and pagination.',
    'test:packages/tests/api/src/sdk-authoring-operations.test.ts',
  ),
  'governance.change-export': implemented(
    'governance',
    'Authorized, entitled exports unify document versions, review and approval records, release operations, publications, deployment pointers, and governance events into tenant-scoped JSON or spreadsheet-safe CSV history.',
    'test:packages/tests/api/src/governance-change-history.test.ts',
  ),
  'collaboration.presence': implemented(
    'collaboration',
    'Authorized document-scoped presence heartbeats persist bounded creator identity and editing state.',
    'test:packages/tests/api/src/authoring-collaboration.test.ts',
  ),
  'collaboration.locks': implemented(
    'collaboration',
    'Document step locks support acquisition, renewal, expiry, conflict handling, and authorized release.',
    'test:packages/tests/api/src/sdk-authoring-operations.test.ts',
  ),
  'governance.base-roles': implemented(
    'governance',
    'Fixed viewer, member, admin, and owner role ceilings are enforced for authoring sessions.',
    'test:packages/tests/database/src/authoring-session-capabilities.test.ts',
  ),
  'governance.custom-roles': implemented(
    'governance',
    'Workspace and environment capability profiles can narrow fixed base-role permissions without exceeding role ceilings.',
    'test:packages/tests/api/src/platform-governance.test.ts',
  ),
  'platform.api': implemented(
    'platform',
    'The tenant-scoped control-plane API validates contracts, authorization, idempotency, and environment boundaries.',
    'test:packages/tests/api/src/control-plane.test.ts',
  ),
  'platform.webhooks': implemented(
    'platform',
    'Signed outbound webhooks use persisted delivery attempts, retries, dead-letter state, and an application worker.',
    'test:packages/tests/database/src/governance-platform.test.ts',
  ),
  'platform.data-residency': implemented(
    'platform',
    'Tenant-scoped placement changes run through a leased provider-neutral copy, digest verification, fail-closed cutover, append-only value-free evidence, retry controls, and generation-aware route resolution.',
    'test:packages/tests/api/src/data-residency-worker.test.ts',
    'migration:packages/database/drizzle/0031_data_residency_execution.sql',
  ),
  'governance.scim': implemented(
    'governance',
    'Tenant-scoped SCIM user and group provisioning routes enforce enterprise identity contracts.',
    'test:packages/tests/database/src/enterprise-identity.test.ts',
  ),
  'governance.production-approval': implemented(
    'governance',
    'Production release promotion requires explicit approval capabilities and review state.',
    'test:packages/tests/sdk-authoring/src/authoring/production-approval-controller.test.ts',
  ),
  'delivery.immutable-publication': implemented(
    'delivery',
    'Publication artifacts are content-addressed, immutable, compatibility checked, and reused for promotion and rollback.',
    'test:packages/tests/database/src/release-artifact-compatibility.test.ts',
  ),
  'delivery.direct-production-publish': disabled(
    'delivery',
    'Intentionally disabled: production changes must pass review, approval, and compare-and-swap promotion without publish side effects.',
    'contract:packages/schema/src/environment-policy.ts',
  ),
  'authoring.demo-capture': disabled(
    'authoring',
    'Intentionally disabled: demos reuse approved immutable structured artifacts and never capture or replay customer application surfaces by default.',
    'contract:docs/adr/0028-shareable-demo-links.md',
  ),
  'governance.accessibility-sweep': implemented(
    'governance',
    'Version-first governance APIs sweep every current immutable document locale, persist bounded findings with an append-only resolution trail, and block release of the exact document version while blockers remain open.',
    'test:packages/tests/api/src/accessibility-governance.test.ts',
  ),
} as const satisfies Record<ProductCapabilityId, CapabilitySeed>;

export function productCapabilityClaim(id: ProductCapabilityId): ProductCapabilityClaim {
  return { id, ...PRODUCT_CAPABILITY_INVENTORY[id] };
}

function implemented(
  layer: ProductCapabilityLayer,
  note: string,
  ...evidence: readonly string[]
): CapabilitySeed {
  return { layer, state: 'implemented', note, evidence: [...evidence] };
}

function disabled(
  layer: ProductCapabilityLayer,
  note: string,
  ...evidence: readonly string[]
): CapabilitySeed {
  return { layer, state: 'disabled', note, evidence: [...evidence] };
}

function absent(layer: ProductCapabilityLayer, note: string): CapabilitySeed {
  return { layer, state: 'absent', note, evidence: [] };
}
