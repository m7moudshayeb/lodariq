#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import process, { stderr, stdout } from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const signOffPattern = /^--\s*lodariq-shared-env-destructive-migration-signoff:\s*\S.+$/im;

const destructiveStatementChecks = [
  {
    code: 'drop-statement',
    description: 'DROP statements can remove shared-environment data or policies',
    test: (statement) =>
      /^\s*drop\b/iu.test(statement) && !/^\s*drop\s+policy\s+if\s+exists\b/iu.test(statement),
  },
  {
    code: 'truncate-statement',
    description: 'TRUNCATE removes data from shared environments',
    test: (statement) => /^\s*truncate\b/iu.test(statement),
  },
  {
    code: 'delete-statement',
    description: 'DELETE mutates shared-environment data',
    test: (statement) => /^\s*delete\s+from\b/iu.test(statement),
  },
  {
    code: 'update-statement',
    description: 'UPDATE mutates shared-environment data',
    test: (statement) => /^\s*update\s+[\w".]+\s+set\b/iu.test(statement),
  },
  {
    code: 'alter-table-drop',
    description: 'ALTER TABLE ... DROP removes schema from shared environments',
    test: (statement) =>
      /^\s*alter\s+table\b[\s\S]*\bdrop\s+(?:column|constraint)\b/iu.test(statement),
  },
  {
    code: 'alter-table-type',
    description: 'ALTER TABLE column type changes need shared-environment sign-off',
    test: (statement) =>
      /^\s*alter\s+table\b[\s\S]*\balter\s+(?:column\s+)?[\w".]+\s+(?:set\s+data\s+)?type\b/iu.test(
        statement,
      ),
  },
  {
    code: 'alter-table-rename',
    description: 'ALTER TABLE renames can break shared-environment application code',
    test: (statement) => /^\s*alter\s+table\b[\s\S]*\brename\s+(?:column|to)\b/iu.test(statement),
  },
  {
    code: 'alter-type-rename',
    description: 'ALTER TYPE renames can break shared-environment application code',
    test: (statement) => /^\s*alter\s+type\b[\s\S]*\brename\b/iu.test(statement),
  },
];

const defaultMigrationsDir = fileURLToPath(new URL('../drizzle', import.meta.url));

if (isMainModule()) {
  const migrationsDir = resolve(process.argv[2] ?? defaultMigrationsDir);
  const findings = checkMigrationDirectory(migrationsDir);

  if (findings.length > 0) {
    logError('Destructive migration guard failed.');
    logError(
      'Add explicit human sign-off before applying destructive migrations to a shared environment:',
    );
    logError('-- lodariq-shared-env-destructive-migration-signoff: <approver/date/approval-link>');
    for (const finding of findings) {
      logError(`- ${finding.file}:${finding.line} [${finding.code}] ${finding.description}`);
    }
    process.exitCode = 1;
  } else {
    log(`Migration safety check passed for ${migrationsDir}`);
  }
}

export function checkMigrationDirectory(directory) {
  const findings = [];
  for (const file of listSqlFiles(directory)) {
    const source = readFileSync(file, 'utf8');
    if (signOffPattern.test(source)) continue;
    findings.push(...findDestructiveStatements(source, file));
  }
  return findings;
}

function listSqlFiles(directory) {
  return readdirSync(directory)
    .filter((entry) => entry.endsWith('.sql'))
    .map((entry) => join(directory, entry))
    .filter((file) => statSync(file).isFile())
    .sort((a, b) => basename(a).localeCompare(basename(b)));
}

function findDestructiveStatements(source, file) {
  const sanitized = stripCommentsAndStrings(source);
  const statements = splitStatements(sanitized);
  const findings = [];
  for (const statement of statements) {
    const policyDrop = parseConditionalPolicyDrop(statement.text);
    if (policyDrop && !hasPolicyReplacement(sanitized, policyDrop)) {
      findings.push({
        file,
        line: lineNumberAt(sanitized, statement.start),
        code: 'drop-policy-without-replacement',
        description: 'DROP POLICY is allowed only when the same migration recreates or alters it',
      });
    }
    for (const check of destructiveStatementChecks) {
      if (!check.test(statement.text)) continue;
      findings.push({
        file,
        line: lineNumberAt(sanitized, statement.start),
        code: check.code,
        description: check.description,
      });
    }
  }
  return findings;
}

function parseConditionalPolicyDrop(statement) {
  const match = statement.match(
    /^\s*drop\s+policy\s+if\s+exists\s+([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_]*)\s*;/iu,
  );
  return match ? { policy: match[1], table: match[2] } : null;
}

function hasPolicyReplacement(source, { policy, table }) {
  const escapedPolicy = escapeRegularExpression(policy);
  const escapedTable = escapeRegularExpression(table);
  return new RegExp(
    `\\b(?:create|alter)\\s+policy\\s+${escapedPolicy}\\s+on\\s+${escapedTable}\\b`,
    'iu',
  ).test(source);
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function splitStatements(source) {
  const statements = [];
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== ';') continue;
    const text = source.slice(start, index + 1).trim();
    if (text) statements.push({ start, text });
    start = index + 1;
  }
  const text = source.slice(start).trim();
  if (text) statements.push({ start, text });
  return statements;
}

function stripCommentsAndStrings(source) {
  return source
    .replace(/\$([A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/gu, ' ')
    .replace(/'(?:''|[^'])*'/gu, ' ')
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .replace(/--.*$/gmu, ' ');
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function log(message) {
  stdout.write(`${message}\n`);
}

function logError(message) {
  stderr.write(`${message}\n`);
}

function isMainModule() {
  return process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}
