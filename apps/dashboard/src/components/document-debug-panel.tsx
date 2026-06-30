'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Braces, Check, LoaderCircle } from 'lucide-react';
import { loadDocumentDebugAction } from '../app/actions';
import { initialDocumentDebugActionState } from '../app/document-debug-action-state';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
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
  const [copied, setCopied] = useState<'canonical' | 'compiled' | null>(null);
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

  async function copyDebugJson(kind: 'canonical' | 'compiled'): Promise<void> {
    if (state.status !== 'success') return;
    const value = kind === 'canonical' ? state.canonicalJson : state.compiledJson;
    await navigator.clipboard.writeText(value);
    setCopied(kind);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Support</p>
          <CardTitle>Debug JSON</CardTitle>
          <CardDescription>Inspect canonical and delivery JSON for one document.</CardDescription>
        </div>
        <Badge variant={state.status === 'success' ? 'success' : 'outline'}>
          {state.status === 'success' ? state.latestVersionLabel : 'Internal'}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <form className="grid gap-3" action={formAction}>
          <input name="documentId" type="hidden" value={documentId} />
          <div className="grid gap-2">
            <Label htmlFor="debug-document-trigger">Debug document</Label>
            <Select
              value={documentId}
              onValueChange={(value) => {
                setCopied(null);
                setDocumentId(value);
              }}
              disabled={!documentRows.length}
            >
              <SelectTrigger id="debug-document-trigger">
                <SelectValue placeholder="Choose document" />
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

          <DebugSubmitButton disabled={!documentId} />
        </form>

        {state.status === 'error' ? (
          <p className="text-sm font-medium text-destructive">{state.error}</p>
        ) : null}

        {state.status === 'success' ? (
          <>
            <div className="grid gap-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">{loadedDocument?.title ?? state.documentId}</span>
                <Badge variant="secondary">{state.versionCount} versions</Badge>
              </div>
              <div className="truncate">{state.latestContentHash}</div>
              <div className="truncate">{state.compilerVersion}</div>
            </div>

            <Separator />

            <DebugCodeBlock
              title="Canonical"
              value={state.canonicalJson}
              copied={copied === 'canonical'}
              onCopy={() => void copyDebugJson('canonical')}
            />
            <DebugCodeBlock
              title="Delivery"
              value={state.compiledJson}
              copied={copied === 'compiled'}
              onCopy={() => void copyDebugJson('compiled')}
            />
          </>
        ) : (
          <p className="rounded-md border bg-surface-muted/50 p-3 text-sm text-muted-foreground">
            {selectedDocument
              ? `${selectedDocument.title} is ready for inspection.`
              : 'No document selected.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DebugSubmitButton({ disabled }: { disabled: boolean }): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={disabled || pending}>
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <Braces aria-hidden="true" />
      )}
      Load JSON
    </Button>
  );
}

function DebugCodeBlock({
  title,
  value,
  copied,
  onCopy,
}: {
  title: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}): React.ReactElement {
  return (
    <div className="overflow-hidden rounded-lg border bg-code">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b bg-surface-muted/60 px-3 py-2">
        <span className="text-sm font-semibold">{title}</span>
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          {copied ? <Check aria-hidden="true" /> : null}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-foreground">
        {value}
      </pre>
    </div>
  );
}
