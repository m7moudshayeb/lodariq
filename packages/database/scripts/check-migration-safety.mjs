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
  // `start` skips the leading blank, so a finding names the statement's own
  // line rather than wherever the previous one happened to end.
  const record = (from, raw) => {
    const text = raw.trim();
    if (text) statements.push({ start: from + (raw.length - raw.trimStart().length), text });
  };
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== ';') continue;
    record(start, source.slice(start, index + 1));
    start = index + 1;
  }
  record(start, source.slice(start));
  return statements;
}

/*
 * One left-to-right pass, because independent passes cannot agree on what a
 * quote means. Stripping strings before comments read an apostrophe in prose as
 * a string opening and blanked every statement up to the next one, so two
 * apostrophes in comments hid an unapproved DROP from this guard completely.
 * Reversing the order only moves the hole: a `--` inside a string literal would
 * then eat the rest of that line.
 *
 * Blanked regions keep their newlines, so reported line numbers stay true.
 */
function stripCommentsAndStrings(source) {
  const blank = (text) => text.replace(/[^\n]/gu, ' ');
  let result = '';
  let index = 0;
  const skipTo = (end) => {
    result += blank(source.slice(index, end));
    index = end;
  };
  while (index < source.length) {
    const dollarTag = /^\$[A-Za-z0-9_]*\$/u.exec(source.slice(index));
    if (dollarTag) {
      const tag = dollarTag[0];
      const close = source.indexOf(tag, index + tag.length);
      skipTo(close === -1 ? source.length : close + tag.length);
      continue;
    }
    if (source.startsWith('/*', index)) {
      skipTo(blockCommentEnd(source, index));
      continue;
    }
    if (source.startsWith('--', index)) {
      const newline = source.indexOf('\n', index);
      skipTo(newline === -1 ? source.length : newline);
      continue;
    }
    if (source[index] === "'" || source[index] === '"') {
      skipTo(quotedEnd(source, index));
      continue;
    }
    result += source[index];
    index += 1;
  }
  return result;
}

/** Postgres block comments nest, so depth decides the end, not the first `*` `/`. */
function blockCommentEnd(source, start) {
  let depth = 0;
  let cursor = start;
  while (cursor < source.length) {
    if (source.startsWith('/*', cursor)) {
      depth += 1;
      cursor += 2;
      continue;
    }
    if (source.startsWith('*/', cursor)) {
      depth -= 1;
      cursor += 2;
      if (depth === 0) return cursor;
      continue;
    }
    cursor += 1;
  }
  return source.length;
}

/** `''` escapes a quote inside a literal, and `E'...'` also honours backslashes. */
function quotedEnd(source, start) {
  const quote = source[start];
  const backslashEscapes = quote === "'" && /[eE]$/u.test(source.slice(Math.max(0, start - 1), start));
  let cursor = start + 1;
  while (cursor < source.length) {
    if (backslashEscapes && source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (source[cursor] === quote) {
      if (source[cursor + 1] === quote) {
        cursor += 2;
        continue;
      }
      return cursor + 1;
    }
    cursor += 1;
  }
  return source.length;
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
