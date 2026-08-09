'use client';

import * as React from 'react';
import {
  BookOpenCheck,
  ChevronDown,
  ClipboardList,
  FileText,
  Megaphone,
  MousePointer2,
  PanelTop,
  Rocket,
  Sparkles,
} from 'lucide-react';
import type { DashboardViewModel } from '../lib/view-model';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ReleaseProgress } from './release-progress';

type DocumentRow = DashboardViewModel['documentRows'][number];

interface LaunchQueueProps {
  rows: DocumentRow[];
  onReviewRelease: (documentId: string) => void;
}

const experienceTypeIcons = {
  tour: Rocket,
  announcement: Megaphone,
  checklist: ClipboardList,
  survey: BookOpenCheck,
  hotspot: MousePointer2,
  knowledge: PanelTop,
} as const;

export function LaunchQueue({ rows, onReviewRelease }: LaunchQueueProps): React.ReactElement {
  const [expandedDocumentId, setExpandedDocumentId] = React.useState(rows[0]?.id ?? '');

  if (!rows.length) {
    return (
      <div className="grid min-h-64 place-items-center border-y border-dashed border-border py-12 text-center">
        <div className="grid max-w-md justify-items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles aria-hidden="true" className="size-5" />
          </span>
          <div className="grid gap-1">
            <p className="font-semibold">No experiences in the queue</p>
            <p className="text-sm leading-6 text-muted-foreground">
              Start a tour from the Lodariq launcher on a configured development or staging site.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="launch-queue-heading" className="min-w-0">
      <h2 id="launch-queue-heading" className="mb-3 text-base font-semibold">
        Experiences
      </h2>
      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(0,1.45fr)_minmax(0,.95fr)_minmax(0,.8fr)_minmax(0,.9fr)_auto] gap-2 border-y border-border px-3 py-3 text-[11px] font-semibold text-muted-foreground md:grid lg:gap-4 lg:px-4 lg:text-xs"
      >
        <span>Experience</span>
        <span>Last editor</span>
        <span>Page scope</span>
        <span>Last activity</span>
        <span>Status</span>
      </div>

      <ul className="divide-y divide-border border-b border-border">
        {rows.map((row) => {
          const isExpanded = expandedDocumentId === row.id;
          const ExperienceIcon = experienceTypeIcon(row.type);
          const panelId = `launch-queue-panel-${safeDomId(row.id)}`;
          return (
            <li key={row.id} className="bg-card/30">
              <button
                aria-controls={panelId}
                aria-expanded={isExpanded}
                className="grid min-h-16 w-full gap-3 px-3 py-3 text-left outline-none transition-colors hover:bg-[var(--nav-active)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[minmax(0,1.45fr)_minmax(0,.95fr)_minmax(0,.8fr)_minmax(0,.9fr)_auto] md:items-center md:gap-2 lg:gap-4 lg:px-4"
                onClick={() => setExpandedDocumentId(isExpanded ? '' : row.id)}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-2 lg:gap-3">
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                  />
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary lg:size-8">
                    <ExperienceIcon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold leading-4 text-foreground lg:truncate lg:text-sm">
                      {row.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground md:hidden">
                      {row.typeLabel}
                    </span>
                  </span>
                </span>

                <QueueField label="Last editor">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--avatar-bg)] text-[11px] font-bold text-primary"
                    >
                      {editorInitial(row.editorLabel)}
                    </span>
                    <span className="text-[11px] leading-4 text-foreground lg:truncate lg:text-sm">
                      {row.editorLabel}
                    </span>
                  </span>
                </QueueField>

                <QueueField label="Page scope">
                  <span className="text-[11px] leading-4 text-muted-foreground lg:truncate lg:text-sm">
                    {row.pageScopeLabel}
                  </span>
                </QueueField>

                <QueueField label="Last activity">
                  <time
                    dateTime={row.updatedAt}
                    className="text-[11px] leading-4 text-muted-foreground lg:text-sm"
                  >
                    {row.lastActivityLabel}
                  </time>
                </QueueField>

                <QueueField label="Status">
                  <Badge className="w-fit" variant={row.queueStatusVariant}>
                    {row.queueStatusLabel}
                  </Badge>
                </QueueField>
              </button>

              {isExpanded ? (
                <div
                  className="border-t border-border bg-[var(--queue-expanded)] px-4 py-5 md:px-5"
                  id={panelId}
                >
                  <div className="rounded-xl border border-border bg-card px-4 py-5 shadow-[0_1px_0_rgba(12,33,28,.03)] md:px-5">
                    <ReleaseProgress stages={row.releaseStages} />
                    <dl className="mt-5 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
                      {row.releaseEvidence.slice(0, 3).map((evidence) => (
                        <div
                          className="rounded-lg border border-border/80 bg-[var(--surface-subtle)] px-3 py-2.5"
                          key={evidence.id}
                        >
                          <dt className="text-[11px] font-semibold text-muted-foreground">
                            {evidence.label}
                          </dt>
                          <dd className="mt-0.5 text-sm font-semibold text-foreground">
                            {evidence.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="grid max-w-2xl gap-1">
                        <p className="text-sm font-semibold text-foreground">
                          Current release state
                        </p>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {row.releaseSummary}
                        </p>
                      </div>
                      <Button
                        className="h-11 shrink-0 px-5"
                        onClick={() => onReviewRelease(row.id)}
                        type="button"
                      >
                        {row.releaseActionLabel}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function QueueField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <span className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 pl-7 md:block md:pl-0">
      <span className="text-xs font-semibold text-muted-foreground md:sr-only">{label}</span>
      {children}
    </span>
  );
}

function experienceTypeIcon(type: string): typeof FileText {
  return experienceTypeIcons[type as keyof typeof experienceTypeIcons] ?? FileText;
}

function safeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function editorInitial(label: string): string {
  return label.trim().charAt(0).toUpperCase() || 'L';
}
