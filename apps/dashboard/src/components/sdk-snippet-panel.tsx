'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Ban, Check, KeyRound, LoaderCircle } from 'lucide-react';
import { createEnvironmentTokenAction, revokeEnvironmentTokenAction } from '../app/actions';
import { initialTokenActionState } from '../app/token-action-state';
import { initialTokenRevokeActionState } from '../app/token-revoke-action-state';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
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
    <Card className="border-primary/30 bg-primary/5 dark:border-primary/35 dark:bg-primary/10">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Staging SDK</p>
          <CardTitle>Installation snippet</CardTitle>
          <CardDescription>
            Create a staging token, then install the generated script.
          </CardDescription>
        </div>
        <Badge variant="success">{selectedEnvironment?.kind ?? 'staging'}</Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <form className="grid gap-3" action={formAction}>
          <input name="environmentId" type="hidden" value={environmentId} />
          <div className="grid gap-2">
            <Label htmlFor="environment-trigger">Environment</Label>
            <Select
              value={environmentId}
              onValueChange={(value) => {
                setCopied(false);
                setEnvironmentId(value);
              }}
              disabled={!environmentOptions.length}
            >
              <SelectTrigger id="environment-trigger">
                <SelectValue placeholder="Choose staging environment" />
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
            <Label htmlFor="token-name">Token name</Label>
            <Input
              id="token-name"
              name="name"
              defaultValue="Staging install"
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
            No staging environment is available for SDK installation.
          </p>
        ) : null}

        <div className="overflow-hidden rounded-lg border bg-code">
          <div className="flex min-h-12 items-center justify-between gap-3 border-b bg-surface-muted/60 px-3 py-2">
            <span className="text-sm font-semibold">SDK snippet</span>
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
            {snippet || 'Snippet appears after token creation.'}
          </pre>
        </div>

        <Separator />

        <div className="grid gap-2" aria-label="Environment tokens">
          {tokens.length ? (
            tokens.map((token) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border bg-surface-muted/50 p-3"
                key={token.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{token.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {token.tokenPrefix}...
                  </p>
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
              No tokens.
            </p>
          )}
        </div>
      </CardContent>
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
      Create token
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
      Revoke
    </Button>
  );
}
