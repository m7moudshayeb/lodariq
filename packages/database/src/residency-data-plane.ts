import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { LodariqDatabase } from './neon';
import { tenantScopedTableNames } from './schema/tenant-scoping';

const COPY_BATCH_ROWS = 500;

/**
 * Regional copy primitives for the residency adapter.
 *
 * They live here because this package owns every drizzle call; the provider in
 * `apps/api` orchestrates them and owns the route credentials.
 */

/**
 * Copies one table's rows for one workspace, ordered by its primary key so a
 * restart resumes deterministically. `on conflict do nothing` makes a repeat
 * pass idempotent, which is what lets a leased migration be retried.
 */
export async function copyWorkspaceTable(
  source: LodariqDatabase,
  target: LodariqDatabase,
  table: string,
  workspaceId: string,
): Promise<number> {
  const identifier = sql.identifier(assertIdentifier(table));
  const keyColumns = await primaryKeyColumns(source, table);
  if (keyColumns.length === 0) return 0;
  const order = sql.join(
    keyColumns.map((column) => sql.identifier(column)),
    sql`, `,
  );

  let copied = 0;
  let offset = 0;
  for (;;) {
    const page = await source.execute(
      sql`select * from ${identifier} where workspace_id = ${workspaceId}
          order by ${order} limit ${COPY_BATCH_ROWS} offset ${offset}`,
    );
    const rows = resultRows(page);
    if (rows.length === 0) break;
    await insertRows(target, identifier, keyColumns, rows);
    copied += rows.length;
    offset += rows.length;
    if (rows.length < COPY_BATCH_ROWS) break;
  }
  return copied;
}

async function insertRows(
  target: LodariqDatabase,
  identifier: ReturnType<typeof sql.identifier>,
  keyColumns: readonly string[],
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  const columns = Object.keys(rows[0] ?? {});
  if (columns.length === 0) return;
  const columnList = sql.join(
    columns.map((column) => sql.identifier(column)),
    sql`, `,
  );
  const conflictTarget = sql.join(
    keyColumns.map((column) => sql.identifier(column)),
    sql`, `,
  );
  /*
   * Every value travels as a bind parameter. The driver keeps jsonb, arrays and
   * timestamps in their own types, which hand-built literals get wrong.
   */
  const tuples = sql.join(
    rows.map(
      (row) =>
        sql`(${sql.join(
          columns.map((column) => sql`${row[column] ?? null}`),
          sql`, `,
        )})`,
    ),
    sql`, `,
  );
  await target.execute(
    sql`insert into ${identifier} (${columnList}) values ${tuples}
        on conflict (${conflictTarget}) do nothing`,
  );
}

/**
 * A value-free digest over a workspace's rows.
 *
 * Each table is hashed server-side and the per-table digests are folded
 * together, so nothing but a hex digest crosses back into the process.
 */
export async function workspaceDataDigest(
  database: LodariqDatabase,
  workspaceId: string,
): Promise<string> {
  const fold = createHash('sha256');
  for (const table of tenantScopedTableNames) {
    const identifier = sql.identifier(assertIdentifier(table));
    const result = await database.execute(
      sql`select coalesce(md5(string_agg(row_digest, '' order by row_digest)), '') as digest
          from (select md5(t::text) as row_digest from ${identifier} t
                where t.workspace_id = ${workspaceId}) rows`,
    );
    const [row] = resultRows(result);
    fold.update(`${table}:${String(row?.digest ?? '')}\n`);
  }
  return `sha256-${fold.digest('hex')}`;
}

export async function workspaceDataRowCount(
  database: LodariqDatabase,
  workspaceId: string,
): Promise<number> {
  let total = 0;
  for (const table of tenantScopedTableNames) {
    const identifier = sql.identifier(assertIdentifier(table));
    const result = await database.execute(
      sql`select count(*)::bigint as count from ${identifier} where workspace_id = ${workspaceId}`,
    );
    const [row] = resultRows(result);
    total += Number(row?.count ?? 0);
  }
  return total;
}

async function primaryKeyColumns(database: LodariqDatabase, table: string): Promise<string[]> {
  const result = await database.execute(
    sql`select a.attname as column_name from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid = ${assertIdentifier(table)}::regclass and i.indisprimary
        order by a.attnum`,
  );
  return resultRows(result)
    .map((row) => row.column_name)
    .filter((name): name is string => typeof name === 'string');
}

function resultRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/** Table names come from the compiled manifest, so this is a tripwire, not a filter. */
function assertIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/u.test(value)) throw new Error('residency_invalid_identifier');
  return value;
}
