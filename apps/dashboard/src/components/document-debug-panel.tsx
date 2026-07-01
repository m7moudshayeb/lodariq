'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, FileText, LoaderCircle } from 'lucide-react';
import { loadDocumentDebugAction } from '../app/actions';
import { initialDocumentDebugActionState } from '../app/document-debug-action-state';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { DashboardViewModel } from '../lib/view-model';

interface DocumentDebugPanelProps {
  documentRows: DashboardViewModel['documentRows'];
}

export function DocumentDebugPanel({
  documentRows,
}: DocumentDebugPanelProps): React.ReactElement {
  const [state, formAction] = useActionState(
    loadDocumentDebugAction,
    initialDocumentDebugActionState,
  );
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
            <p className="text-xs font-semibold uppercase text-muted-foreground">Support</p>
            <CardTitle>Help package</CardTitle>
            <CardDescription>
              Prepare an editable backup and customer version only when support or QA asks.
            </CardDescription>
          </div>
          <Badge variant={state.status === 'success' ? 'success' : 'outline'}>
            {state.status === 'success' ? state.latestVersionLabel : 'Optional'}
          </Badge>
        </summary>

        <CardContent className="space-y-4 border-t pt-4">
          <form className="grid gap-3" action={formAction}>
            <input name="documentId" type="hidden" value={documentId} />
            <div className="grid gap-2">
              <Label htmlFor="support-package-experience-trigger">Experience</Label>
              <Select
                value={documentId}
                onValueChange={(value) => {
                  setCopied(null);
                  setDocumentId(value);
                }}
                disabled={!documentRows.length}
              >
                <SelectTrigger id="support-package-experience-trigger">
                  <SelectValue placeholder="Choose experience" />
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

            <SupportPackageSubmitButton disabled={!documentId} />
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
                      {loadedDocument?.title ?? 'Selected experience'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {supportPackageDetail(state.versionCount)}
                    </p>
                  </div>
                  <Badge
                    variant={isDeliveryPrepared(state.latestContentHash) ? 'success' : 'outline'}
                  >
                    {isDeliveryPrepared(state.latestContentHash) ? 'Prepared' : 'Needs preview'}
                  </Badge>
                </div>
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>{state.latestVersionLabel}</span>
                  <span>{supportToolLabel(state.compilerVersion)}</span>
                </div>
              </div>

              <SupportRecordBlock
                title="Editable backup"
                description="The version support can use to restore editing."
                value={state.canonicalJson}
                copied={copied === 'draft'}
                onCopy={() => void copySupportRecord('draft')}
              />
              <SupportRecordBlock
                title="Customer version"
                description="The prepared version customers see on your site."
                value={state.compiledJson}
                copied={copied === 'delivery'}
                onCopy={() => void copySupportRecord('delivery')}
              />
            </>
          ) : (
            <p className="rounded-md border bg-surface-muted/50 p-3 text-sm text-muted-foreground">
              {selectedDocument
                ? `${selectedDocument.title} is ready for support review.`
                : 'No experience selected.'}
            </p>
          )}
        </CardContent>
      </details>
    </Card>
  );
}

function SupportPackageSubmitButton({ disabled }: { disabled: boolean }): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={disabled || pending}>
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <FileText aria-hidden="true" />
      )}
      Prepare help package
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
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b bg-surface-muted/60 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          {copied ? <Check aria-hidden="true" /> : null}
          {copied ? 'Copied' : 'Copy details'}
        </Button>
      </div>
      <details>
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-muted-foreground">
          View support details
        </summary>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t bg-code p-3 font-mono text-xs leading-relaxed text-foreground">
          {value}
        </pre>
      </details>
    </div>
  );
}

function supportPackageDetail(versionCount: number): string {
  if (versionCount === 1) return '1 saved draft version';
  return `${versionCount} saved draft versions`;
}

function isDeliveryPrepared(value: string): boolean {
  return value !== 'Not prepared';
}

function supportToolLabel(value: string): string {
  if (value === 'No delivery record') return 'No customer version yet';
  return 'Customer version available';
}
