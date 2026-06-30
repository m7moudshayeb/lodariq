'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, ExternalLink, LoaderCircle, Play, WandSparkles } from 'lucide-react';
import { createAuthoringLaunchAction } from '../app/actions';
import { initialAuthoringLaunchActionState } from '../app/authoring-launch-action-state';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
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
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Creator mode</p>
          <CardTitle>Authoring launch</CardTitle>
          <CardDescription>
            Generate a short-lived staging snippet for one document.
          </CardDescription>
        </div>
        <Badge variant={state.status === 'success' ? 'success' : 'outline'}>
          {state.status === 'success' ? 'Ready' : (selectedEnvironment?.kind ?? 'staging')}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <form className="grid gap-3" action={formAction}>
          <input name="environmentId" type="hidden" value={environmentId} />
          <input name="documentId" type="hidden" value={documentId} />

          <div className="grid gap-2">
            <Label htmlFor="authoring-document-trigger">Document</Label>
            <Select
              value={documentId}
              onValueChange={(value) => {
                setCopied(false);
                setDocumentId(value);
              }}
              disabled={!documentRows.length}
            >
              <SelectTrigger id="authoring-document-trigger">
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

          <div className="grid gap-2">
            <Label htmlFor="authoring-environment-trigger">Authoring environment</Label>
            <Select
              value={environmentId}
              onValueChange={(value) => {
                setCopied(false);
                setEnvironmentId(value);
              }}
              disabled={!authoringEnvironmentOptions.length}
            >
              <SelectTrigger id="authoring-environment-trigger">
                <SelectValue placeholder="Choose environment" />
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

          <div className="grid gap-2">
            <Label htmlFor="authoring-launch-name">Launch name</Label>
            <Input
              id="authoring-launch-name"
              name="name"
              defaultValue="Creator launch"
              minLength={1}
              maxLength={120}
            />
          </div>

          <AuthoringSubmitButton disabled={!canCreate} />
        </form>

        {state.status === 'error' ? (
          <p className="text-sm font-medium text-destructive">{state.error}</p>
        ) : null}

        <div className="overflow-hidden rounded-lg border bg-code">
          <div className="flex min-h-12 items-center justify-between gap-3 border-b bg-surface-muted/60 px-3 py-2">
            <div className="min-w-0">
              <span className="block text-sm font-semibold">Creator SDK snippet</span>
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
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <pre className="min-h-24 whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-foreground">
            {snippet || 'Snippet appears after launch creation.'}
          </pre>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className={!launchUrl ? 'hidden' : ''}>
            <a href={launchUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden="true" />
              Open staging
            </a>
          </Button>
          {state.bootstrapHeaderName ? (
            <Badge variant="outline">{state.bootstrapHeaderName}</Badge>
          ) : null}
          {state.authoringSession?.correlationId ? (
            <Badge variant="outline">
              trace {shortTraceId(state.authoringSession.correlationId)}
            </Badge>
          ) : null}
          {selectedDocument?.latestContentHash ? <Badge variant="secondary">compiled</Badge> : null}
        </div>

        <Separator />

        <div className="grid gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <WandSparkles aria-hidden="true" className="size-4 text-primary" />
            <span className="truncate">{selectedDocument?.title ?? 'No document selected'}</span>
          </div>
          <div className="truncate">{selectedEnvironment?.originLabel ?? 'No staging origin'}</div>
        </div>
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
      Create launch snippet
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
