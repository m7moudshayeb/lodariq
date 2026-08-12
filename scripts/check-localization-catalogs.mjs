import { promises as fs } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/gu;
const TEMPORARY_MARKER_PATTERN = /\[\[\[LQ(?:PH|SEP)/u;

const productLocales = await readProductLocales();
const checks = [
  {
    catalogPath: 'packages/sdk-authoring/src/i18n-catalogs',
    functionName: 'authoringText',
    label: 'authoring',
    roots: ['packages/sdk-authoring/src', 'apps/editor/src'],
    staticMessages: [
      ['packages/schema/src/release-recovery-constants.ts', 'RELEASE_RECOVERY_FAILURE_MESSAGES'],
      ['packages/schema/src/publish.ts', 'PUBLISH_READINESS_ISSUE_LABELS'],
      ['packages/schema/src/brand.ts', 'BASIC_VISUAL_PREFLIGHT_ISSUE_LABELS'],
    ],
  },
  {
    catalogPath: 'packages/sdk-runtime/src/i18n-catalogs.ts',
    functionName: 'runtimeText',
    label: 'runtime',
    roots: ['packages/sdk-runtime/src'],
    staticMessages: [],
  },
];

let translatedEntries = 0;
for (const check of checks) {
  const expected = new Set(
    await collectCallMessages(
      check.roots.map((root) => path.join(ROOT, root)),
      check.functionName,
    ),
  );
  for (const [file, variable] of check.staticMessages) {
    for (const message of await collectNamedObjectValues(path.join(ROOT, file), variable)) {
      expected.add(message);
    }
  }

  const catalogs = await readPlainCatalog(path.join(ROOT, check.catalogPath));
  for (const locale of productLocales) {
    if (locale === 'en') continue;
    const catalogName = `${locale.replace(/[^A-Za-z0-9]/gu, '_').toUpperCase()}_CATALOG`;
    const catalog = catalogs.get(catalogName);
    if (!catalog) fail(`${check.label}: ${locale} catalog is missing`);

    const missing = [...expected].filter((source) => !catalog.has(source));
    const stale = [...catalog.keys()].filter((source) => !expected.has(source));
    if (missing.length) fail(`${check.label}: ${locale} is missing ${summarize(missing)}`);
    if (stale.length) fail(`${check.label}: ${locale} has stale entries ${summarize(stale)}`);

    for (const [source, translation] of catalog) {
      if (!translation.trim())
        fail(`${check.label}: ${locale} has an empty translation for ${source}`);
      if (TEMPORARY_MARKER_PATTERN.test(translation)) {
        fail(`${check.label}: ${locale} contains a temporary translation marker for ${source}`);
      }
      if (placeholders(source) !== placeholders(translation)) {
        fail(`${check.label}: ${locale} changed placeholders for ${source}`);
      }
      translatedEntries += 1;
    }
  }
  console.log(`${check.label}: ${expected.size} source messages are complete in every locale.`);
}

console.log(
  `Validated ${translatedEntries} source-controlled authoring/runtime translations across ${productLocales.length - 1} non-English locales.`,
);

async function readProductLocales() {
  const file = path.join(ROOT, 'packages/i18n/src/index.ts');
  const sourceFile = createSourceFile(file, await fs.readFile(file, 'utf8'));
  const locales = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        !declaration.name.text.endsWith('_LOCALE') ||
        declaration.name.text.includes('PSEUDO') ||
        !declaration.initializer ||
        !ts.isAsExpression(declaration.initializer) ||
        !ts.isStringLiteralLike(declaration.initializer.expression)
      ) {
        continue;
      }
      locales.push(declaration.initializer.expression.text);
    }
  }
  if (!locales.includes('en') || locales.length < 2)
    fail('product locale contract could not be read');
  return locales;
}

async function collectCallMessages(roots, functionName) {
  const messages = new Set();
  for (const root of roots) {
    for (const file of await sourceFiles(root)) {
      const sourceFile = createSourceFile(file, await fs.readFile(file, 'utf8'));
      visit(sourceFile, (candidate) => {
        if (
          !ts.isCallExpression(candidate) ||
          !ts.isIdentifier(candidate.expression) ||
          candidate.expression.text !== functionName
        ) {
          return;
        }
        collectLiteralValues(candidate.arguments[0], messages);
      });
    }
  }
  return messages;
}

async function collectNamedObjectValues(file, variableName) {
  const messages = new Set();
  const sourceFile = createSourceFile(file, await fs.readFile(file, 'utf8'));
  visit(sourceFile, (candidate) => {
    if (
      !ts.isVariableDeclaration(candidate) ||
      !ts.isIdentifier(candidate.name) ||
      candidate.name.text !== variableName ||
      !candidate.initializer
    ) {
      return;
    }
    visit(candidate.initializer, (value) => {
      if (ts.isStringLiteralLike(value) && /[A-Za-z]/u.test(value.text)) messages.add(value.text);
    });
  });
  return messages;
}

async function readPlainCatalog(file) {
  const catalogs = new Map();
  const target = await fs.stat(file);
  const files = target.isDirectory()
    ? (await fs.readdir(file))
        .filter((entry) => entry.endsWith('.ts'))
        .map((entry) => path.join(file, entry))
    : [file];
  for (const catalogFile of files) {
    const sourceFile = createSourceFile(catalogFile, await fs.readFile(catalogFile, 'utf8'));
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (
          !ts.isIdentifier(declaration.name) ||
          !declaration.name.text.endsWith('_CATALOG') ||
          declaration.name.text === 'EMPTY_CATALOG' ||
          !declaration.initializer ||
          !ts.isObjectLiteralExpression(declaration.initializer)
        ) {
          continue;
        }
        const messages = new Map();
        for (const property of declaration.initializer.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isStringLiteralLike(property.initializer)) {
            fail(`${catalogFile}: catalog properties must be string literals`);
          }
          const source = propertyNameText(property.name);
          if (source === null) fail(`${catalogFile}: catalog keys must be literal strings`);
          messages.set(source, property.initializer.text);
        }
        catalogs.set(declaration.name.text, messages);
      }
    }
  }
  return catalogs;
}

function propertyNameText(name) {
  if (ts.isStringLiteralLike(name) || ts.isIdentifier(name)) return name.text;
  return null;
}

function collectLiteralValues(node, messages) {
  if (!node) return;
  if (ts.isStringLiteralLike(node)) {
    messages.add(node.text);
    return;
  }
  if (ts.isConditionalExpression(node)) {
    collectLiteralValues(node.whenTrue, messages);
    collectLiteralValues(node.whenFalse, messages);
  }
}

async function sourceFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(target)));
    else if (/\.tsx?$/u.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(target);
  }
  return files;
}

function createSourceFile(file, source) {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function visit(node, callback) {
  callback(node);
  node.forEachChild((child) => visit(child, callback));
}

function placeholders(value) {
  return [...value.matchAll(PLACEHOLDER_PATTERN)]
    .map((match) => match[1])
    .sort()
    .join(',');
}

function summarize(values) {
  const examples = values
    .slice(0, 3)
    .map((value) => JSON.stringify(value))
    .join(', ');
  return `${values.length} message(s): ${examples}`;
}

function fail(message) {
  throw new Error(message);
}
