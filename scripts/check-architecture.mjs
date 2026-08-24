import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();

const BARREL_RULES = [
  {
    file: 'packages/sdk-authoring/src/authoring/index.ts',
    delegates: ['./panel'],
  },
  {
    file: 'packages/database/src/schema.ts',
    delegates: [
      './schema/shared',
      './schema/identity',
      './schema/environments',
      './schema/brand',
      './schema/documents',
      './schema/sdk-authoring',
      './schema/releases',
      './schema/authoring-sessions',
      './schema/analytics',
      './schema/relations',
      './schema/tenant-scoping',
    ],
  },
];

const COORDINATOR_RULES = [
  {
    file: 'packages/sdk-authoring/src/authoring/panel.ts',
    delegates: [
      './panel-config',
      './panel-geometry',
      './panel-styles',
      './page-context',
      './preview-document',
      './overlay/shell',
    ],
    forbidden: [],
  },
  {
    file: 'packages/sdk-authoring/src/authoring/local-frame-ui/controller.ts',
    delegates: ['./controller-snapshot'],
    forbidden: ['constructor(', 'handleMessage(', 'applyPatch('],
  },
  {
    file: 'packages/database/src/repository.ts',
    delegates: ['./domains/', './in-memory/'],
    forbidden: [],
  },
  {
    file: 'packages/database/src/drizzle-repository.ts',
    // The tail of the inheritance chain moves as domains are added; what must
    // stay true is that this file delegates rather than queries.
    delegates: ['./drizzle/'],
    forbidden: ['select(', 'insert(', 'update(', 'delete('],
  },
  {
    file: 'apps/api/src/routes/control-plane.ts',
    delegates: ['./control-plane/'],
    forbidden: ['fastify.get(', 'fastify.post(', 'fastify.patch(', 'fastify.delete('],
  },
  {
    file: 'packages/sdk-authoring/src/authoring/local-frame-ui/components/panel-body-mode-impl.tsx',
    delegates: ['./panel-body-appearance-modes', './panel-mode-shell'],
    forbidden: [],
  },
  {
    file: 'apps/dashboard/src/lib/view-model.ts',
    delegates: ['./authoring-site-options', './brand-source-view-model', './dashboard-flow-health'],
    forbidden: [],
  },
  {
    file: 'apps/editor/src/authoring-frame-app.ts',
    delegates: ['./authoring-initial-workspace'],
    forbidden: [],
  },
  {
    file: 'packages/sdk-runtime/src/activation/authoring-activation.ts',
    delegates: ['./dashboard-authoring-entry'],
    forbidden: [],
  },
];

const BACK_REFERENCE_RULES = [
  {
    files: [
      'packages/sdk-authoring/src/authoring/panel-config.ts',
      'packages/sdk-authoring/src/authoring/panel-geometry.ts',
      'packages/sdk-authoring/src/authoring/panel-styles.ts',
      'packages/sdk-authoring/src/authoring/page-context.ts',
      'packages/sdk-authoring/src/authoring/preview-document.ts',
      'packages/sdk-authoring/src/authoring/overlay/shell.ts',
      'packages/sdk-authoring/src/authoring/overlay/filmstrip.ts',
      'packages/sdk-authoring/src/authoring/overlay/pulses.ts',
      'packages/sdk-authoring/src/authoring/overlay/compass.ts',
      'packages/sdk-authoring/src/authoring/overlay/geometry.ts',
      'packages/sdk-authoring/src/authoring/overlay/click-outside.ts',
      'packages/sdk-authoring/src/authoring/overlay/types.ts',
      'packages/sdk-authoring/src/authoring/overlay/constants.ts',
      'packages/sdk-authoring/src/authoring/overlay/html.ts',
      'packages/sdk-authoring/src/authoring/overlay/layer-manager.ts',
      'packages/sdk-authoring/src/authoring/overlay/mode-pill.ts',
      'packages/sdk-authoring/src/authoring/overlay/mode-pill-copy.ts',
      'packages/sdk-authoring/src/authoring/overlay/mode-pill.types.ts',
      'packages/sdk-authoring/src/authoring/overlay/solver.ts',
      'packages/sdk-authoring/src/authoring/overlay/solver.types.ts',
      'packages/sdk-authoring/src/authoring/overlay/inspector-copy.ts',
      'packages/sdk-authoring/src/authoring/overlay/inspector-sections.ts',
      'packages/sdk-authoring/src/authoring/overlay/inspector-sections.types.ts',
      'packages/sdk-authoring/src/authoring/mutations/queue.ts',
      'packages/sdk-authoring/src/authoring/mutations/types.ts',
    ],
    forbiddenSpecifiers: ['./panel', './index'],
  },
  {
    files: [
      'packages/database/src/schema/shared.ts',
      'packages/database/src/schema/identity.ts',
      'packages/database/src/schema/environments.ts',
      'packages/database/src/schema/brand.ts',
      'packages/database/src/schema/documents.ts',
      'packages/database/src/schema/sdk-authoring.ts',
      'packages/database/src/schema/releases.ts',
      'packages/database/src/schema/authoring-sessions.ts',
      'packages/database/src/schema/analytics.ts',
      'packages/database/src/schema/relations.ts',
      'packages/database/src/schema/tenant-scoping.ts',
    ],
    forbiddenSpecifiers: ['../schema', './index'],
  },
];

const failures = [];

async function sourceOf(relativePath) {
  return readFile(path.join(ROOT, relativePath), 'utf8');
}

function delegatedSpecifiers(source) {
  return [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/gu)].map((match) => match[1]);
}

function isDeclarativeBarrel(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
  const withoutReExports = withoutComments.replace(
    /export\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+['"][^'"]+['"]\s*;/gu,
    '',
  );
  return withoutReExports.trim() === '';
}

for (const rule of BARREL_RULES) {
  const source = await sourceOf(rule.file);
  const specifiers = delegatedSpecifiers(source);
  if (!isDeclarativeBarrel(source)) {
    failures.push(`${rule.file} must remain a declarative public barrel`);
  }
  for (const delegate of rule.delegates) {
    if (!specifiers.includes(delegate)) {
      failures.push(`${rule.file} must delegate to ${delegate}`);
    }
  }
}

for (const rule of COORDINATOR_RULES) {
  const source = await sourceOf(rule.file);
  const specifiers = delegatedSpecifiers(source);
  for (const delegate of rule.delegates) {
    if (!specifiers.some((specifier) => specifier.startsWith(delegate))) {
      failures.push(`${rule.file} must delegate to ${delegate}`);
    }
  }
  for (const forbidden of rule.forbidden) {
    if (source.includes(forbidden)) {
      failures.push(`${rule.file} owns forbidden implementation detail: ${forbidden}`);
    }
  }
}

for (const rule of BACK_REFERENCE_RULES) {
  for (const file of rule.files) {
    const source = await sourceOf(file);
    const specifiers = delegatedSpecifiers(source);
    for (const forbidden of rule.forbiddenSpecifiers) {
      if (specifiers.includes(forbidden)) {
        failures.push(`${file} must not depend back on facade ${forbidden}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Architecture responsibility check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Architecture responsibility boundaries passed (${BARREL_RULES.length} barrels, ${COORDINATOR_RULES.length} coordinators).`,
  );
}
