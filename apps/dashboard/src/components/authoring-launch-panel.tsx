'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, ExternalLink, LoaderCircle, Play, WandSparkles } from 'lucide-react';
import { createAuthoringLaunchAction } from '../app/actions';
import { initialAuthoringLaunchActionState } from '../app/authoring-launch-action-state';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { DashboardViewModel } from '../lib/view-model';

interface AuthoringLaunchPanelProps {
  documentRows: DashboardViewModel['documentRows'];
  environmentOptions: DashboardViewModel['environmentOptions'];
  defaultEnvironmentId: string;
}

export function AuthoringLaunchPanel({
  documentRows,
  environmentOptions,
  defaultEnvironmentId,
}: AuthoringLaunchPanelProps): React.ReactElement {
  const [state, formAction] = useActionState(
    createAuthoringLaunchAction,
    initialAuthoringLaunchActionState,
  );
  const authoringEnvironmentOptions = useMemo(
    () => environmentOptions.filter((environment) => environment.kind !== 'production'),
    [environmentOptions],
  );
  const defaultAuthoringEnvironment =
    authoringEnvironmentOptions.find((environment) => environment.id === defaultEnvironmentId) ??
    authoringEnvironmentOptions[0];
  const [environmentId, setEnvironmentId] = useState(defaultAuthoringEnvironment?.id ?? '');
  const [documentId, setDocumentId] = useState(documentRows[0]?.id ?? '');
  const [copied, setCopied] = useState(false);
  const selectedEnvironment = useMemo(
    () => authoringEnvironmentOptions.find((environment) => environment.id === environmentId),
    [authoringEnvironmentOptions, environmentId],
  );
  const selectedDocument = useMemo(
    () => documentRows.find((document) => document.id === documentId),
    [documentId, documentRows],
  );
  const launchUrl = firstHttpOrigin(selectedEnvironment?.originAllowlist ?? []);
  const snippet = state.status === 'success' ? (state.sdkSnippet ?? '') : '';
  const canCreate = Boolean(environmentId && documentId);

  async function copySnippet(): Promise<void> {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
  }

  return (
    <Card className="overflow-hidden border-primary/15 bg-card shadow-sm shadow-primary/5">
      <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
        <div className="grid gap-1">
          <p className="text-xs font-semibold text-muted-foreground">Editor</p>
          <CardTitle>Open the editor</CardTitle>
          <CardDescription>
            Continue a draft directly on a trusted staging site.
          </CardDescription>
        </div>
        <Badge variant={state.status === 'success' ? 'success' : 'outline'}>
          {state.status === 'success' ? 'Editor ready' : (selectedEnvironment?.kind ?? 'staging')}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        <form className="grid gap-3" action={formAction}>
          <input name="environmentId" type="hidden" value={environmentId} />
          <input name="documentId" type="hidden" value={documentId} />
          <input name="name" type="hidden" value="In-context editing" />

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="sr-only" htmlFor="authoring-document-trigger">
                Experience
              </Label>
              <Select
                value={documentId}
                onValueChange={(value) => {
                  setCopied(false);
                  setDocumentId(value);
                }}
                disabled={!documentRows.length}
              >
                <SelectTrigger id="authoring-document-trigger" className="h-10">
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

            <div className="grid gap-1.5">
              <Label className="sr-only" htmlFor="authoring-environment-trigger">
                Site
              </Label>
              <Select
                value={environmentId}
                onValueChange={(value) => {
                  setCopied(false);
                  setEnvironmentId(value);
                }}
                disabled={!authoringEnvironmentOptions.length}
              >
                <SelectTrigger id="authoring-environment-trigger" className="h-10">
                  <SelectValue placeholder="Choose site" />
                </SelectTrigger>
                <SelectContent>
                  {authoringEnvironmentOptions.map((environment) => (
                    <SelectItem key={environment.id} value={environment.id}>
                      {environment.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <AuthoringSubmitButton disabled={!canCreate} />
        </form>

        {state.status === 'error' ? (
          <p className="text-sm font-medium text-destructive">{state.error}</p>
        ) : null}

        {state.status === 'success' ? (
          <div className="grid gap-3 rounded-lg border border-primary/20 bg-card p-3">
            <div className="grid gap-1">
              <p className="text-sm font-semibold">Editor is ready</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Open the staging site, click the Lodariq edit button, and continue authoring in
                context.
              </p>
              {state.authoringSession ? (
                <p className="text-xs text-muted-foreground">
                  This editing window expires {formatExpiry(state.authoringSession.expiresAt)}.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild className={!launchUrl ? 'hidden' : ''}>
                <a href={launchUrl} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" />
                  Open staging site
                </a>
              </Button>
              <Button type="button" variant="outline" onClick={copySnippet} disabled={!snippet}>
                {copied ? <Check aria-hidden="true" /> : null}
                {copied ? 'Copied' : 'Copy editor handoff'}
              </Button>
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-dashed bg-surface-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Pick a draft and site, then continue where the experience appears.
          </p>
        )}

        {state.status === 'success' ? (
          <>
            <details className="overflow-hidden rounded-lg border bg-card">
              <summary className="flex cursor-pointer items-center justify-between gap-3 bg-surface-muted/40 px-3 py-2 text-sm font-semibold">
                <span>Edit button handoff</span>
                <span className="text-xs font-medium text-muted-foreground">
                  Share if the edit button is missing
                </span>
              </summary>
              <div className="border-t bg-code">
                <div className="flex min-h-12 items-center justify-between gap-3 border-b bg-surface-muted/60 px-3 py-2">
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold">Edit button handoff</span>
                    {state.authoringSession ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        Expires {formatExpiry(state.authoringSession.expiresAt)}
                      </span>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copySnippet}
                    disabled={!snippet}
                  >
                    {copied ? <Check aria-hidden="true" /> : null}
                    {copied ? 'Copied' : 'Copy handoff'}
                  </Button>
                </div>
                {snippet ? (
                  <pre className="min-h-24 whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-foreground">
                    {snippet}
                  </pre>
                ) : (
                  <p className="p-3 text-sm text-muted-foreground">
                    Edit button handoff appears after editing starts.
                  </p>
                )}
              </div>
            </details>

            <details className="overflow-hidden rounded-lg border bg-card">
              <summary className="flex cursor-pointer items-center justify-between gap-3 bg-surface-muted/40 px-3 py-2 text-sm font-semibold">
                <span>Session details</span>
                <span className="text-xs font-medium text-muted-foreground">
                  For support if launch fails
                </span>
              </summary>
              <div className="grid gap-3 border-t p-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <WandSparkles aria-hidden="true" className="size-4 text-primary" />
                  <span className="truncate">
                    {selectedDocument?.title ?? 'No experience selected'}
                  </span>
                </div>
                <div className="truncate">
                  {selectedEnvironment?.originLabel ?? 'No staging origin'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {state.bootstrapHeaderName ? (
                    <Badge variant="outline">{state.bootstrapHeaderName}</Badge>
                  ) : null}
                  {state.authoringSession?.correlationId ? (
                    <Badge variant="outline">
                      session {shortTraceId(state.authoringSession.correlationId)}
                    </Badge>
                  ) : null}
                  {selectedDocument?.latestContentHash ? (
                    <Badge variant="secondary">Prepared</Badge>
                  ) : null}
                </div>
              </div>
            </details>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AuthoringSubmitButton({ disabled }: { disabled: boolean }): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <Play aria-hidden="true" />
      )}
      Start editing
    </Button>
  );
}

function shortTraceId(correlationId: string): string {
  return correlationId.slice(-8);
}

function firstHttpOrigin(origins: string[]): string {
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
    } catch {
      continue;
    }
  }
  return '';
}

function formatExpiry(expiresAt: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(expiresAt));
}
