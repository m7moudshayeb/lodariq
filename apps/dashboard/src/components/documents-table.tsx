'use client';

import * as React from 'react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type Column,
  type ColumnDef,
  type FilterFn,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, CircleDot, Search, X } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import type { DashboardViewModel } from '../lib/view-model';

type DocumentRow = DashboardViewModel['documentRows'][number];

interface DocumentsTableProps {
  rows: DocumentRow[];
}

const documentGlobalFilter: FilterFn<DocumentRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? '')
    .trim()
    .toLowerCase();
  if (!query) return true;

  const document = row.original;
  return [
    document.title,
    document.id,
    document.typeLabel,
    document.statusLabel,
    document.editorLabel,
    document.readinessDetail,
    document.readinessIssueSummary,
    document.updatedAtLabel,
    document.publicationLabel,
    document.publicationDetail,
    document.contentHashLabel,
    document.contentHashDetail,
    document.latestContentHash ?? '',
  ].some((value) => value.toLowerCase().includes(query));
};

const COPY = {
  experience: msg({ id: 'dashboard.documents.experience', message: 'Experience' }),
  publishing: msg({ id: 'dashboard.documents.publishing', message: 'Publishing' }),
  lastEdited: msg({ id: 'dashboard.documents.lastEdited', message: 'Last edited' }),
  draft: msg({ id: 'dashboard.documents.draft', message: 'Draft' }),
  publishBlockers: msg({
    id: 'dashboard.documents.publishBlockers',
    message: '{count} publish {count, plural, one {blocker} other {blockers}}',
  }),
  search: msg({ id: 'dashboard.documents.search', message: 'Search experiences' }),
  clearSearch: msg({
    id: 'dashboard.documents.clearSearch',
    message: 'Clear experience search',
  }),
  count: msg({
    id: 'dashboard.documents.count',
    message: '{visible} of {total} experiences',
  }),
  emptyTitle: msg({ id: 'dashboard.documents.emptyTitle', message: 'No experiences yet' }),
  emptyDescription: msg({
    id: 'dashboard.documents.emptyDescription',
    message: 'Start a tour in the creator, then it will appear here for review and publishing.',
  }),
  noMatches: msg({
    id: 'dashboard.documents.noMatches',
    message: 'No matching experiences.',
  }),
  emptyShort: msg({ id: 'dashboard.documents.emptyShort', message: 'No experiences yet.' }),
} as const;

type Translate = ReturnType<typeof useLingui>['_'];

function documentColumns(translate: Translate): Array<ColumnDef<DocumentRow>> {
  return [
    {
      accessorKey: 'title',
      header: ({ column }) => <SortableHeader column={column} label={translate(COPY.experience)} />,
      cell: ({ row }) => (
        <div className="grid min-w-72 max-w-96 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words font-semibold">{row.original.title}</p>
            <Badge variant="info">{row.original.typeLabel}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={row.original.lifecycleVariant}>{row.original.statusLabel}</Badge>
            <span className="text-xs text-muted-foreground">{row.original.readinessDetail}</span>
          </div>
          {row.original.readinessIssueCount ? (
            <p className="line-clamp-2 text-xs text-destructive">
              {row.original.readinessIssueSummary}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'publicationLabel',
      header: ({ column }) => <SortableHeader column={column} label={translate(COPY.publishing)} />,
      cell: ({ row }) => (
        <div className="grid min-w-48 gap-1.5">
          <Badge variant={row.original.publicationVariant}>{row.original.publicationLabel}</Badge>
          <span className="text-xs text-muted-foreground">{row.original.publicationDetail}</span>
          {row.original.readinessIssueCount ? (
            <span className="text-xs font-medium text-destructive">
              {translate({
                ...COPY.publishBlockers,
                values: { count: row.original.readinessIssueCount },
              })}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'updatedAt',
      header: ({ column }) => <SortableHeader column={column} label={translate(COPY.lastEdited)} />,
      cell: ({ row }) => (
        <div className="grid min-w-36 gap-1">
          <span className="whitespace-nowrap text-sm font-medium">
            {row.original.updatedAtLabel}
          </span>
          <span className="text-xs text-muted-foreground">{row.original.editorLabel}</span>
        </div>
      ),
    },
    {
      accessorKey: 'contentHashLabel',
      header: ({ column }) => <SortableHeader column={column} label={translate(COPY.draft)} />,
      cell: ({ row }) => (
        <div className="grid min-w-44 gap-1.5 text-sm">
          <span className="inline-flex items-center gap-2 font-medium">
            <CircleDot aria-hidden="true" className="size-3.5 text-primary" />
            {row.original.contentHashLabel}
          </span>
          <span className="text-xs text-muted-foreground">{row.original.contentHashDetail}</span>
        </div>
      ),
    },
  ];
}

export function DocumentsTable({ rows }: DocumentsTableProps): React.ReactElement {
  const { _ } = useLingui();
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'updatedAt', desc: true }]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const columns = React.useMemo(() => documentColumns(_), [_]);
  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: documentGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const visibleRows = table.getRowModel().rows;

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-xl md:min-w-96">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={_(COPY.search)}
            className="pe-9 ps-9"
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder={_(COPY.search)}
          />
          {globalFilter ? (
            <Button
              aria-label={_(COPY.clearSearch)}
              className="absolute end-1 top-1/2 size-7 -translate-y-1/2"
              onClick={() => setGlobalFilter('')}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">
          {_({ ...COPY.count, values: { visible: visibleRows.length, total: rows.length } })}
        </p>
      </div>

      {!rows.length ? (
        <div className="grid min-h-48 place-items-center rounded-md border border-dashed bg-surface p-8 text-center">
          <div className="grid max-w-sm gap-2">
            <p className="text-sm font-semibold">{_(COPY.emptyTitle)}</p>
            <p className="text-sm leading-6 text-muted-foreground">{_(COPY.emptyDescription)}</p>
          </div>
        </div>
      ) : (
        <Table className="min-w-[760px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} aria-sort={ariaSort(header.column.getIsSorted())}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {visibleRows.length ? (
              visibleRows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {_(rows.length ? COPY.noMatches : COPY.emptyShort)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function SortableHeader({
  column,
  label,
}: {
  column: Column<DocumentRow, unknown>;
  label: string;
}): React.ReactElement {
  const direction = column.getIsSorted();
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;

  return (
    <Button
      className="-ms-3 h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
      onClick={() => column.toggleSorting(direction === 'asc')}
      type="button"
      variant="ghost"
    >
      {label}
      <Icon aria-hidden="true" />
    </Button>
  );
}

function ariaSort(direction: false | 'asc' | 'desc'): 'ascending' | 'descending' | 'none' {
  if (direction === 'asc') return 'ascending';
  if (direction === 'desc') return 'descending';
  return 'none';
}
