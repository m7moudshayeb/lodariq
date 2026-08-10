// Lodariq package-boundary enforcement (PRD §9.1, §16.0, §20).
//
// The single load-bearing boundary in the SDK: the production runtime bundle
// must never include React or Lexical. Physical package separation makes that a
// module-system guarantee; dependency-cruiser verifies it in CI as well.

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'runtime-no-react',
      comment: '@lodariq/sdk-runtime must not depend on React (PRD §9.1).',
      severity: 'error',
      from: { path: '^packages/sdk-runtime/src' },
      to: { path: 'node_modules/(react|react-dom)(/|$)' },
    },
    {
      name: 'runtime-no-lexical',
      comment: '@lodariq/sdk-runtime must not depend on Lexical (PRD §9.1, §20).',
      severity: 'error',
      from: { path: '^packages/sdk-runtime/src' },
      to: { path: 'node_modules/(lexical|@lexical)(/|$)' },
    },
    {
      name: 'runtime-no-authoring',
      comment: 'Production runtime must not import authoring code (PRD §9.1, §20).',
      severity: 'error',
      from: { path: '^packages/sdk-runtime/src' },
      to: { path: '^packages/sdk-authoring' },
    },
    {
      name: 'lexical-only-in-editor',
      comment: 'Lexical may be imported only inside sdk-authoring/src/editor (PRD §7.2, §20).',
      severity: 'error',
      from: {
        path: '^packages/sdk-authoring/src',
        pathNot: '^packages/sdk-authoring/src/editor',
      },
      to: { path: 'node_modules/(lexical|@lexical)(/|$)' },
    },
    {
      name: 'schema-zero-runtime-deps',
      comment: '@lodariq/schema must have zero runtime deps beyond TypeBox (PRD §12.1).',
      severity: 'error',
      from: { path: '^packages/schema/src' },
      to: {
        path: 'node_modules',
        pathNot: 'node_modules/(@sinclair/typebox|tslib)(/|$)',
      },
    },
    {
      name: 'compiler-is-isomorphic',
      comment: 'The compiler must be pure/isomorphic: no DOM- or Node-only deps (PRD §9.1, §16.0).',
      severity: 'error',
      from: { path: '^packages/compiler/src' },
      to: { path: 'node_modules/(react|react-dom|lexical|@lexical|playwright|sharp)(/|$)' },
    },
    {
      name: 'no-unresolvable',
      comment:
        'Imports must resolve. An undeclared cross-package import (e.g. runtime -> react) fails here.',
      severity: 'error',
      from: { path: '^(packages|apps)/.+/src' },
      to: { couldNotResolve: true },
    },
    {
      name: 'no-circular',
      comment: 'No circular dependencies between modules.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Flag orphaned modules (excluding config and type-only entry points).',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: ['\\.d\\.ts$', '(^|/)(index|types)\\.ts$', '\\.(config|test|spec)\\.[tj]s$'],
      },
      to: {},
    },
  ],
  options: {
    // Keep node_modules edges visible (so the React/Lexical rules can fire) but
    // do not traverse into them.
    doNotFollow: { path: 'node_modules' },
    // Next supports custom distDir values (for example `.next-e2e`). Exclude
    // every generated `.next*` directory so local QA artifacts do not become
    // dependency-cruiser inputs or exhaust the CI heap.
    exclude: { path: '(^|/)(dist|build|coverage|\\.turbo|\\.next[^/]*)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
