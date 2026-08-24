import { defineConfig } from 'tsup';

// Bundles internal relative imports into self-contained, Node-runnable ESM while
// keeping deps (@sinclair/typebox) external. Source stays extensionless.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    version: 'src/version.ts',
    'delivery-compatibility': 'src/delivery-compatibility.ts',
    'compiler-version': 'src/compiler-version.ts',
    'compiled-runtime': 'src/compiled-runtime.ts',
    csp: 'src/csp.ts',
    dom: 'src/dom.ts',
    target: 'src/target.ts',
    'target-runtime': 'src/target-runtime.ts',
    'brand-runtime': 'src/brand-runtime.ts',
    'brand-registration-runtime': 'src/brand-registration-runtime.ts',
    'hosted-creator': 'src/hosted-creator.ts',
    'authoring-entry-runtime': 'src/authoring-entry-runtime.ts',
    'events-runtime': 'src/events-runtime.ts',
    'adaptive-runtime': 'src/adaptive-runtime.ts',
    'product-capabilities-runtime': 'src/product-capabilities-runtime.ts',
    'product-capability-inventory': 'src/product-capability-inventory.ts',
    /* Not in the barrel: it imports `validate`, which imports the registry,
       which imports every schema module — re-exporting it from index.ts
       hoisted the registry above `brand.ts` and left `Type.Ref` with an
       undefined schema at module evaluation. */
    'product-style-theme': 'src/product-style-theme.ts',
    'accessibility-governance': 'src/accessibility-governance.ts',
    'accessibility-governance-runtime': 'src/accessibility-governance-runtime.ts',
    'analytics-warehouse': 'src/analytics-warehouse.ts',
    'commercial-billing': 'src/commercial-billing.ts',
    'governance-change-history': 'src/governance-change-history.ts',
    'server-registry': 'src/server-registry.ts',
    'public-demo-runtime': 'src/public-demo-runtime.ts',
    url: 'src/url.ts',
    // Browser-safe and TypeBox-free on purpose: the SDK loader imports this
    // subpath so page matching stays one implementation without dragging the
    // whole schema barrel into a 5 KB bundle.
    'page-eligibility': 'src/page-eligibility.ts',
    // Same reason, one layer down: the resolver and authoring capture both need
    // the step-level page key and neither may pull in TypeBox to get it.
    'page-key': 'src/page-key.ts',
  },
  format: ['esm'],
  target: 'es2020',
  platform: 'neutral',
  dts: process.env.LODARIQ_BUILD_DECLARATIONS !== 'false',
  sourcemap: true,
  clean: true,
  treeshake: true,
});
