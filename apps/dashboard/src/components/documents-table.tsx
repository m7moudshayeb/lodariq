'use client';

import * as React from 'react';
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
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from 'lucide-react';
import { Badge, type BadgeProps } from './ui/badge';
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
    document.ownerLabel,
    document.updatedAtLabel,
    document.publicationLabel,
    document.publicationDetail,
    document.contentHashLabel,
  ].some((value) => value.toLowerCase().includes(query));
};

const columns: Array<ColumnDef<DocumentRow>> = [
  {
    accessorKey: 'title',
    header: ({ column }) => <SortableHeader column={column} label="Title" />,
    cell: ({ row }) => (
      <div className="max-w-80">
        <p className="break-words font-semibold">{row.original.title}</p>
        <p className="break-all text-xs text-muted-foreground">{row.original.id}</p>
      </div>
    ),
  },
  {
    accessorKey: 'typeLabel',
    header: ({ column }) => <SortableHeader column={column} label="Type" />,
    cell: ({ row }) => row.original.typeLabel,
  },
  {
    accessorKey: 'statusLabel',
    header: ({ column }) => <SortableHeader column={column} label="Status" />,
    cell: ({ row }) => (
      <Badge variant={statusVariant(row.original.status)}>{row.original.statusLabel}</Badge>
    ),
  },
  {
    accessorKey: 'ownerLabel',
    header: ({ column }) => <SortableHeader column={column} label="Owner" />,
    cell: ({ row }) => (
      <span className="block max-w-44 break-words text-sm text-muted-foreground">
        {row.original.ownerLabel}
      </span>
    ),
  },
  {
    accessorKey: 'updatedAt',
    header: ({ column }) => <SortableHeader column={column} label="Last edit" />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {row.original.updatedAtLabel}
      </span>
    ),
  },
  {
    accessorKey: 'publicationLabel',
    header: ({ column }) => <SortableHeader column={column} label="Publication" />,
    cell: ({ row }) => (
      <div className="grid gap-1">
        <Badge variant={row.original.publicationVariant}>{row.original.publicationLabel}</Badge>
        <span className="text-xs text-muted-foreground">{row.original.publicationDetail}</span>
      </div>
    ),
  },
  {
    accessorKey: 'contentHashLabel',
    header: ({ column }) => <SortableHeader column={column} label="Artifact" />,
    cell: ({ row }) => (
      <span className="block max-w-72 break-all font-mono text-xs text-muted-foreground">
        {row.original.contentHashLabel}
      </span>
    ),
  },
];

export function DocumentsTable({ rows }: DocumentsTableProps): React.ReactElement {
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'updatedAt', desc: true }]);
  const [globalFilter, setGlobalFilter] = React.useState('');
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
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search documents"
            className="pl-9 pr-9"
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            placeholder="Search documents"
          />
          {globalFilter ? (
            <Button
              aria-label="Clear document search"
              className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
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
          {visibleRows.length} of {rows.length} documents
        </p>
      </div>

      <Table className="min-w-[900px]">
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
                {rows.length ? 'No matching documents.' : 'No documents.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
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
      className="-ml-3 h-8 px-2 text-xs uppercase text-muted-foreground hover:text-foreground"
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

function statusVariant(status: string): BadgeProps['variant'] {
  if (status === 'ready') return 'success';
  if (status === 'invalid') return 'destructive';
  return 'warning';
}
