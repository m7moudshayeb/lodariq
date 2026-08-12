'use client';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMemo, useState } from 'react';
import { Check, FileText, LoaderCircle } from 'lucide-react';
import { initialDocumentDebugActionState } from '../app/document-debug-action-state';
import { dashboardPublishIssueCopy } from '../i18n/server-feedback';
import { useDocumentDebug } from '../hooks/use-document-debug';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { DashboardViewModel } from '../lib/view-model';

interface DocumentDebugPanelProps {
  documentRows: DashboardViewModel['documentRows'];
  workspaceId: string;
}

type Translate = ReturnType<typeof useLingui>['_'];

const COPY = {
  support: msg({ id: 'dashboard.support.eyebrow', message: 'Support' }),
  title: msg({ id: 'dashboard.support.title', message: 'Help package' }),
  description: msg({
    id: 'dashboard.support.description',
    message: 'Prepare an editable backup and customer version only when support or QA asks.',
  }),
  optional: msg({ id: 'dashboard.support.optional', message: 'Optional' }),
  experience: msg({ id: 'dashboard.support.experience', message: 'Experience' }),
  chooseExperience: msg({
    id: 'dashboard.support.chooseExperience',
    message: 'Choose experience',
  }),
  selectedExperience: msg({
    id: 'dashboard.support.selectedExperience',
    message: 'Selected experience',
  }),
  prepared: msg({ id: 'dashboard.support.prepared', message: 'Prepared' }),
  needsPreview: msg({ id: 'dashboard.support.needsPreview', message: 'Needs preview' }),
  editableBackup: msg({ id: 'dashboard.support.editableBackup', message: 'Editable backup' }),
  editableBackupDescription: msg({
    id: 'dashboard.support.editableBackupDescription',
    message: 'The version support can use to restore editing.',
  }),
  customerVersion: msg({ id: 'dashboard.support.customerVersion', message: 'Customer version' }),
  customerVersionDescription: msg({
    id: 'dashboard.support.customerVersionDescription',
    message: 'The prepared version customers see on your site.',
  }),
  readyForReview: msg({
    id: 'dashboard.support.readyForReview',
    message: '{experience} is ready for support review.',
  }),
  noExperience: msg({ id: 'dashboard.support.noExperience', message: 'No experience selected.' }),
  readyToPublish: msg({ id: 'dashboard.support.readyToPublish', message: 'Ready to publish' }),
  publishBlockers: msg({ id: 'dashboard.support.publishBlockers', message: 'Publish blockers' }),
  blockerCount: msg({
    id: 'dashboard.support.blockerCount',
    message: '{count, plural, one {# item} other {# items}}',
  }),
  prepare: msg({ id: 'dashboard.support.prepare', message: 'Prepare help package' }),
  copied: msg({ id: 'dashboard.support.copied', message: 'Copied' }),
  copyDetails: msg({ id: 'dashboard.support.copyDetails', message: 'Copy details' }),
  viewDetails: msg({ id: 'dashboard.support.viewDetails', message: 'View support details' }),
  savedDrafts: msg({
    id: 'dashboard.support.savedDrafts',
    message: '{count, plural, one {# saved draft version} other {# saved draft versions}}',
  }),
  noCustomerVersion: msg({
    id: 'dashboard.support.noCustomerVersion',
    message: 'No customer version yet',
  }),
  customerVersionAvailable: msg({
    id: 'dashboard.support.customerVersionAvailable',
    message: 'Customer version available',
  }),
} as const;

export function DocumentDebugPanel({
  documentRows,
  workspaceId,
}: DocumentDebugPanelProps): React.ReactElement {
  const { _ } = useLingui();
  const debug = useDocumentDebug(workspaceId);
  const state = debug.data ?? initialDocumentDebugActionState;
  const [documentId, setDocumentId] = useState(documentRows[0]?.id ?? '');
  const [copied, setCopied] = useState<'draft' | 'delivery' | null>(null);
  const selectedDocument = useMemo(
    () => documentRows.find((document) => document.id === documentId),
    [documentId, documentRows],
  );
  const loadedDocument = useMemo(
    () =>
      state.status === 'success'
        ? documentRows.find((document) => document.id === state.documentId)
        : null,
    [documentRows, state],
  );

  async function copySupportRecord(kind: 'draft' | 'delivery'): Promise<void> {
    if (state.status !== 'success') return;
    const value = kind === 'draft' ? state.canonicalJson : state.compiledJson;
    await navigator.clipboard.writeText(value);
    setCopied(kind);
  }

  return (
    <Card className="overflow-hidden">
      <details>
        <summary className="flex cursor-pointer items-start justify-between gap-3 p-6">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              {_(COPY.support)}
            </p>
            <CardTitle>{_(COPY.title)}</CardTitle>
            <CardDescription>{_(COPY.description)}</CardDescription>
          </div>
          <Badge variant={state.status === 'success' ? 'success' : 'outline'}>
            {state.status === 'success' ? state.latestVersionLabel : _(COPY.optional)}
          </Badge>
        </summary>

        <CardContent className="space-y-4 border-t pt-4">
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (documentId) debug.mutate(documentId);
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="support-package-experience-trigger">{_(COPY.experience)}</Label>
              <Select
                value={documentId}
                onValueChange={(value) => {
                  setCopied(null);
                  setDocumentId(value);
                }}
                disabled={!documentRows.length}
              >
                <SelectTrigger id="support-package-experience-trigger">
                  <SelectValue placeholder={_(COPY.chooseExperience)} />
                </SelectTrigger>
                <SelectContent>
                  {documentRows.map((document) => (
                    <SelectItem key={document.id} value={document.id}>
                      {document.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SupportPackageSubmitButton disabled={!documentId} pending={debug.isPending} />
          </form>

          {state.status === 'error' ? (
            <p className="text-sm font-medium text-destructive">{state.error}</p>
          ) : null}

          {state.status === 'success' ? (
            <>
              <div className="grid gap-3 rounded-lg border bg-surface-muted/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {loadedDocument?.title ?? _(COPY.selectedExperience)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {supportPackageDetail(state.versionCount, _)}
                    </p>
                  </div>
                  <Badge
                    variant={isDeliveryPrepared(state.latestContentHash) ? 'success' : 'outline'}
                  >
                    {isDeliveryPrepared(state.latestContentHash)
                      ? _(COPY.prepared)
                      : _(COPY.needsPreview)}
                  </Badge>
                </div>
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>{state.latestVersionLabel}</span>
                  <span>{supportToolLabel(state.compilerVersion, _)}</span>
                </div>
              </div>

              <ReadinessIssueList issues={state.publishReadinessIssues} />

              <SupportRecordBlock
                title={_(COPY.editableBackup)}
                description={_(COPY.editableBackupDescription)}
                value={state.canonicalJson}
                copied={copied === 'draft'}
                onCopy={() => void copySupportRecord('draft')}
              />
              <SupportRecordBlock
                title={_(COPY.customerVersion)}
                description={_(COPY.customerVersionDescription)}
                value={state.compiledJson}
                copied={copied === 'delivery'}
                onCopy={() => void copySupportRecord('delivery')}
              />
            </>
          ) : (
            <div className="grid gap-3 rounded-md border bg-surface-muted/50 p-3">
              <p className="text-sm text-muted-foreground">
                {selectedDocument
                  ? _({
                      ...COPY.readyForReview,
                      values: { experience: selectedDocument.title },
                    })
                  : _(COPY.noExperience)}
              </p>
              {selectedDocument ? (
                <ReadinessIssueList issues={selectedDocument.publishReadinessIssues} />
              ) : null}
            </div>
          )}
        </CardContent>
      </details>
    </Card>
  );
}

function ReadinessIssueList({
  issues,
}: {
  issues: Array<{
    code: string;
    label: string;
    message: string;
    blockId?: string;
    targetId?: string;
  }>;
}): React.ReactElement {
  const { _ } = useLingui();
  if (!issues.length) {
    return (
      <div className="rounded-md border border-(--success-border) bg-(--success-bg) p-3">
        <p className="text-sm font-semibold text-(--success-fg)">{_(COPY.readyToPublish)}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-destructive">{_(COPY.publishBlockers)}</p>
        <Badge variant="destructive">
          {_({ ...COPY.blockerCount, values: { count: issues.length } })}
        </Badge>
      </div>
      <ul className="grid gap-2">
        {issues.slice(0, 5).map((issue) => {
          const copy = dashboardPublishIssueCopy(issue.code);
          return (
            <li key={readinessIssueKey(issue)} className="grid gap-0.5 text-sm">
              <span className="font-medium text-foreground">{_(copy.label)}</span>
              <span className="text-muted-foreground">{_(copy.message)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function readinessIssueKey(issue: {
  code: string;
  label: string;
  message: string;
  blockId?: string;
  targetId?: string;
}): string {
  return [issue.code, issue.blockId, issue.targetId, issue.message].filter(Boolean).join(':');
}

function SupportPackageSubmitButton({
  disabled,
  pending,
}: {
  disabled: boolean;
  pending: boolean;
}): React.ReactElement {
  const { _ } = useLingui();
  return (
    <Button type="submit" variant="outline" disabled={disabled || pending}>
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <FileText aria-hidden="true" />
      )}
      {_(COPY.prepare)}
    </Button>
  );
}

function SupportRecordBlock({
  title,
  description,
  value,
  copied,
  onCopy,
}: {
  title: string;
  description: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}): React.ReactElement {
  const { _ } = useLingui();
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b bg-surface-muted/60 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          {copied ? <Check aria-hidden="true" /> : null}
          {copied ? _(COPY.copied) : _(COPY.copyDetails)}
        </Button>
      </div>
      <details>
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-muted-foreground">
          {_(COPY.viewDetails)}
        </summary>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t bg-code p-3 font-mono text-xs leading-relaxed text-foreground">
          {value}
        </pre>
      </details>
    </div>
  );
}

function supportPackageDetail(versionCount: number, translate: Translate): string {
  return translate({ ...COPY.savedDrafts, values: { count: versionCount } });
}

function isDeliveryPrepared(value: string): boolean {
  return value !== 'Not prepared';
}

function supportToolLabel(value: string, translate: Translate): string {
  if (value === 'No delivery record') return translate(COPY.noCustomerVersion);
  return translate(COPY.customerVersionAvailable);
}
