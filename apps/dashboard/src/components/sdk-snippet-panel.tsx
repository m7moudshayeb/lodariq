'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Ban, Check, KeyRound, LoaderCircle } from 'lucide-react';
import { createEnvironmentTokenAction, revokeEnvironmentTokenAction } from '../app/actions';
import { initialTokenActionState } from '../app/token-action-state';
import { initialTokenRevokeActionState } from '../app/token-revoke-action-state';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { EnvironmentTokenDto } from '../lib/api';
import type { DashboardViewModel } from '../lib/view-model';

interface SdkSnippetPanelProps {
  environmentOptions: DashboardViewModel['environmentOptions'];
  tokenRows: DashboardViewModel['tokenRows'];
  defaultEnvironmentId: string;
}

export function SdkSnippetPanel({
  environmentOptions,
  tokenRows,
  defaultEnvironmentId,
}: SdkSnippetPanelProps): React.ReactElement {
  const [state, formAction] = useActionState(createEnvironmentTokenAction, initialTokenActionState);
  const [revokeState, revokeFormAction] = useActionState(
    revokeEnvironmentTokenAction,
    initialTokenRevokeActionState,
  );
  const [environmentId, setEnvironmentId] = useState(defaultEnvironmentId);
  const [copied, setCopied] = useState(false);
  const selectedEnvironment = useMemo(
    () => environmentOptions.find((environment) => environment.id === environmentId),
    [environmentId, environmentOptions],
  );
  const snippet = state.status === 'success' ? (state.sdkSnippet ?? '') : '';
  const tokens = useMemo<EnvironmentTokenDto[]>(
    () =>
      mergeTokenRows(
        tokenRows,
        state.token,
        revokeState.status === 'success' ? revokeState.token : null,
      ),
    [revokeState, state.token, tokenRows],
  );

  async function copySnippet(): Promise<void> {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
  }

  return (
    <Card className="overflow-hidden">
      <details open={state.status === 'success' || state.status === 'error'}>
        <summary className="flex cursor-pointer items-start justify-between gap-3 p-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Setup</p>
            <CardTitle className="text-base">Connect your site</CardTitle>
            <CardDescription>
              Prepare the staging handoff only when the edit button is missing.
            </CardDescription>
          </div>
          <Badge variant="info">{selectedEnvironment?.kind ?? 'staging'}</Badge>
        </summary>

        <CardContent className="space-y-4 border-t pt-4">
          <form className="grid gap-3" action={formAction}>
            <input name="environmentId" type="hidden" value={environmentId} />
            <div className="grid gap-2">
              <Label htmlFor="environment-trigger">Site</Label>
              <Select
                value={environmentId}
                onValueChange={(value) => {
                  setCopied(false);
                  setEnvironmentId(value);
                }}
                disabled={!environmentOptions.length}
              >
                <SelectTrigger id="environment-trigger">
                  <SelectValue placeholder="Choose staging site" />
                </SelectTrigger>
                <SelectContent>
                  {environmentOptions.map((environment) => (
                    <SelectItem key={environment.id} value={environment.id}>
                      {environment.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="token-name">Site label</Label>
              <Input
                id="token-name"
                name="name"
                defaultValue="Staging site"
                minLength={1}
                maxLength={120}
              />
            </div>
            <SubmitButton disabled={!environmentId} />
          </form>

          {state.status === 'error' ? (
            <p className="text-sm font-medium text-destructive">{state.error}</p>
          ) : null}
          {revokeState.status === 'error' ? (
            <p className="text-sm font-medium text-destructive">{revokeState.error}</p>
          ) : null}
          {!environmentOptions.length ? (
            <p className="rounded-md border bg-surface-muted/50 p-3 text-sm text-muted-foreground">
              No staging site is available for connection.
            </p>
          ) : null}

          {state.status === 'success' ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm leading-6">
              <p className="font-semibold">Site handoff is ready</p>
              <p className="text-muted-foreground">
                Send this to whoever manages the staging site. After that, creators can launch the
                editor without touching setup.
              </p>
              <Button
                className="mt-3"
                type="button"
                variant="outline"
                onClick={copySnippet}
                disabled={!snippet}
              >
                {copied ? <Check aria-hidden="true" /> : null}
                {copied ? 'Copied' : 'Copy site handoff'}
              </Button>
            </div>
          ) : null}

          <details className="overflow-hidden rounded-lg border bg-card">
            <summary className="flex cursor-pointer items-center justify-between gap-3 bg-surface-muted/40 px-3 py-2 text-sm font-semibold">
              <span>Site connection handoff</span>
              <span className="text-xs font-medium text-muted-foreground">
                Needed once per staging site
              </span>
            </summary>
            <div className="border-t bg-code">
              <div className="flex min-h-12 items-center justify-between gap-3 border-b bg-surface-muted/60 px-3 py-2">
                <span className="text-sm font-semibold">Connection handoff</span>
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
                  Connection handoff appears after the site handoff is prepared.
                </p>
              )}
            </div>
          </details>

          <div className="grid gap-2" aria-label="Site connections">
            {tokens.length ? (
              tokens.map((token) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-md border bg-surface-muted/50 p-3"
                  key={token.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{token.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{token.environment}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={token.revokedAt ? 'destructive' : 'success'}>
                      {token.revokedAt ? 'Revoked' : 'Active'}
                    </Badge>
                    {!token.revokedAt ? (
                      <form action={revokeFormAction}>
                        <input name="tokenId" type="hidden" value={token.id} />
                        <RevokeButton />
                      </form>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md border bg-surface-muted/50 p-3 text-center text-sm text-muted-foreground">
                No site connections yet.
              </p>
            )}
          </div>
        </CardContent>
      </details>
    </Card>
  );
}

function mergeTokenRows(
  baseTokens: EnvironmentTokenDto[],
  createdToken?: EnvironmentTokenDto,
  revokedToken?: EnvironmentTokenDto | null,
): EnvironmentTokenDto[] {
  const byId = new Map<string, EnvironmentTokenDto>();
  if (createdToken) byId.set(createdToken.id, createdToken);
  for (const token of baseTokens) byId.set(token.id, token);
  if (revokedToken) byId.set(revokedToken.id, revokedToken);
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function SubmitButton({ disabled }: { disabled: boolean }): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <KeyRound aria-hidden="true" />
      )}
      Prepare site handoff
    </Button>
  );
}

function RevokeButton(): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <Ban aria-hidden="true" />
      )}
      Disconnect
    </Button>
  );
}
