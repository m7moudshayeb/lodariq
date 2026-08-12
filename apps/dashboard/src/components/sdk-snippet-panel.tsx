'use client';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useEffect, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Ban, Check, Code2, Copy, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import type { SdkInstallationActionState } from '../app/sdk-installation-action-state';
import { useSdkInstallationActions } from '../hooks/use-sdk-installation-actions';
import type { PublicSdkInstallationDto } from '../lib/api';
import type { DashboardViewModel } from '../lib/view-model';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface SdkSnippetPanelProps {
  canManageSdkInstallations: boolean;
  installationRows: DashboardViewModel['installationRows'];
  workspaceId: string;
}

type Translate = ReturnType<typeof useLingui>['_'];

const COPY = {
  applicationName: msg({
    id: 'dashboard.installation.applicationName',
    message: 'Application name',
  }),
  defaultApplicationName: msg({
    id: 'dashboard.installation.defaultApplicationName',
    message: 'Product application',
  }),
  automaticOrigins: msg({
    id: 'dashboard.installation.automaticOrigins',
    message:
      'Lodariq automatically maps the trusted origins already configured for development, staging, and production.',
  }),
  eyebrow: msg({ id: 'dashboard.installation.eyebrow', message: 'One-time setup' }),
  title: msg({ id: 'dashboard.installation.title', message: 'Install Lodariq once' }),
  description: msg({
    id: 'dashboard.installation.description',
    message:
      'One public installation serves every authenticated environment. Authoring remains disabled on production origins.',
  }),
  application: msg({ id: 'dashboard.installation.application', message: 'Application' }),
  oneLine: msg({ id: 'dashboard.installation.oneLine', message: 'One line, one time' }),
  oneLineDescription: msg({
    id: 'dashboard.installation.oneLineDescription',
    message:
      'Add this installation to the shared application shell. Environment and authoring access are resolved from the exact page origin.',
  }),
  copied: msg({ id: 'dashboard.installation.copied', message: 'Copied' }),
  copy: msg({ id: 'dashboard.installation.copy', message: 'Copy installation' }),
  copyFailed: msg({
    id: 'dashboard.installation.copyFailed',
    message: 'Copy failed. Select the installation line and copy it manually.',
  }),
  trustedOrigins: msg({ id: 'dashboard.installation.trustedOrigins', message: 'Trusted origins' }),
  authoringOn: msg({ id: 'dashboard.installation.authoringOn', message: 'Authoring on' }),
  runtimeOnly: msg({ id: 'dashboard.installation.runtimeOnly', message: 'Runtime only' }),
  noOrigins: msg({
    id: 'dashboard.installation.noOrigins',
    message: 'No trusted origins are mapped yet. Add origins to Environments, then sync.',
  }),
  advanced: msg({ id: 'dashboard.installation.advanced', message: 'Advanced' }),
  revokeWarning: msg({
    id: 'dashboard.installation.revokeWarning',
    message:
      'Revoking stops runtime delivery and authoring on every mapped origin. Install a new ID to reconnect this application.',
  }),
  publicIdSafety: msg({
    id: 'dashboard.installation.publicIdSafety',
    message:
      'The public installation ID is revocable and contains no workspace secret, environment token, authoring session, or account credential.',
  }),
  readonlyExisting: msg({
    id: 'dashboard.installation.readonlyExisting',
    message:
      'You can inspect and copy this installation. A workspace admin or owner manages trusted origins and revocation.',
  }),
  readonlyEmpty: msg({
    id: 'dashboard.installation.readonlyEmpty',
    message: 'No installation is configured yet. A workspace admin or owner can create one.',
  }),
  viewOnly: msg({ id: 'dashboard.installation.viewOnly', message: 'View only' }),
  connected: msg({ id: 'dashboard.installation.connected', message: 'Connected' }),
  notInstalled: msg({ id: 'dashboard.installation.notInstalled', message: 'Not installed' }),
  preparing: msg({ id: 'dashboard.installation.preparing', message: 'Preparing…' }),
  create: msg({
    id: 'dashboard.installation.create',
    message: 'Create one-time installation',
  }),
  syncing: msg({ id: 'dashboard.installation.syncing', message: 'Syncing…' }),
  sync: msg({ id: 'dashboard.installation.sync', message: 'Sync trusted origins' }),
  revoking: msg({ id: 'dashboard.installation.revoking', message: 'Revoking…' }),
  revoke: msg({ id: 'dashboard.installation.revoke', message: 'Revoke installation' }),
} as const;

/** One permanent public installation replaces per-environment runtime tokens. */
export function SdkSnippetPanel({
  canManageSdkInstallations,
  installationRows,
  workspaceId,
}: SdkSnippetPanelProps): React.ReactElement {
  const { _ } = useLingui();
  const { createState, createAction, syncState, syncAction, revokeState, revokeAction } =
    useSdkInstallationActions(workspaceId);
  const installations = useMemo(
    () => mergeInstallations(installationRows, createState, syncState, revokeState),
    [createState, installationRows, revokeState, syncState],
  );
  const activeInstallations = installations.filter((installation) => !installation.revokedAt);
  const newestCreatedId =
    createState.status === 'success' ? createState.installation.installationId : '';
  const [installationId, setInstallationId] = useState(
    activeInstallations[0]?.installationId ?? '',
  );
  const selectedInstallation =
    activeInstallations.find((installation) => installation.installationId === installationId) ??
    activeInstallations[0];
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [isSetupOpen, setIsSetupOpen] = useState(!selectedInstallation);

  useEffect(() => {
    if (newestCreatedId) setInstallationId(newestCreatedId);
  }, [newestCreatedId]);

  useEffect(() => setCopyState('idle'), [selectedInstallation?.installationId]);

  useEffect(() => {
    if (!selectedInstallation) setIsSetupOpen(true);
  }, [selectedInstallation]);

  async function copySnippet(): Promise<void> {
    if (!selectedInstallation?.sdkSnippet) return;
    try {
      await navigator.clipboard.writeText(selectedInstallation.sdkSnippet);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  }

  const actionError = firstActionError(createState, syncState, revokeState);
  const actionWarning = firstActionWarning(createState, syncState);
  function renderEmptyInstallationState(): React.ReactElement {
    if (!canManageSdkInstallations) {
      return <ReadOnlyInstallationNotice hasInstallation={false} />;
    }
    return (
      <form className="grid gap-3" action={createAction}>
        <div className="grid gap-2">
          <Label htmlFor="sdk-application-name">{_(COPY.applicationName)}</Label>
          <Input
            id="sdk-application-name"
            name="name"
            defaultValue={_(COPY.defaultApplicationName)}
            minLength={1}
            maxLength={120}
            required
          />
        </div>
        <CreateInstallationButton />
        <p className="text-xs leading-5 text-muted-foreground">{_(COPY.automaticOrigins)}</p>
      </form>
    );
  }

  return (
    <Card className="overflow-hidden">
      <details open={isSetupOpen} onToggle={(event) => setIsSetupOpen(event.currentTarget.open)}>
        <summary className="flex cursor-pointer items-start justify-between gap-3 p-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">{_(COPY.eyebrow)}</p>
            <CardTitle className="text-base">{_(COPY.title)}</CardTitle>
            <CardDescription>{_(COPY.description)}</CardDescription>
          </div>
          <Badge variant={selectedInstallation ? 'success' : 'info'}>
            {installationBadgeLabel(canManageSdkInstallations, Boolean(selectedInstallation), _)}
          </Badge>
        </summary>

        <CardContent className="space-y-4 border-t pt-4">
          {actionError ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {actionError}
            </p>
          ) : null}
          {actionWarning ? (
            <p className="rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950">
              {actionWarning}
            </p>
          ) : null}

          {!selectedInstallation ? (
            renderEmptyInstallationState()
          ) : (
            <div className="grid gap-4">
              {activeInstallations.length > 1 ? (
                <div className="grid gap-2">
                  <Label htmlFor="sdk-installation-trigger">{_(COPY.application)}</Label>
                  <Select
                    value={selectedInstallation.installationId}
                    onValueChange={(value) => {
                      setCopyState('idle');
                      setInstallationId(value);
                    }}
                  >
                    <SelectTrigger id="sdk-installation-trigger" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activeInstallations.map((installation) => (
                        <SelectItem
                          key={installation.installationId}
                          value={installation.installationId}
                        >
                          {installation.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="rounded-xl border border-primary/15 bg-primary/[0.035] p-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <Code2 className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{_(COPY.oneLine)}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {_(COPY.oneLineDescription)}
                    </p>
                  </div>
                </div>
                <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-code p-3 font-mono text-xs leading-relaxed text-foreground">
                  {selectedInstallation.sdkSnippet}
                </pre>
                <Button className="mt-3" type="button" variant="outline" onClick={copySnippet}>
                  {copyState === 'copied' ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Copy aria-hidden="true" />
                  )}
                  {copyState === 'copied' ? _(COPY.copied) : _(COPY.copy)}
                </Button>
                {copyState === 'error' ? (
                  <p className="mt-2 text-xs font-medium text-destructive" role="alert">
                    {_(COPY.copyFailed)}
                  </p>
                ) : null}
              </div>

              <section className="grid gap-2" aria-labelledby="trusted-installation-origins">
                <p className="text-sm font-semibold" id="trusted-installation-origins">
                  {_(COPY.trustedOrigins)}
                </p>
                {selectedInstallation.origins.length ? (
                  selectedInstallation.origins.map((origin) => (
                    <div
                      className="flex min-h-11 items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2"
                      key={`${origin.environmentId}:${origin.exactOrigin}`}
                    >
                      <span className="min-w-0 truncate text-sm font-medium">
                        {origin.exactOrigin}
                      </span>
                      <Badge variant={origin.authoringEnabled ? 'success' : 'outline'}>
                        {origin.authoringEnabled ? _(COPY.authoringOn) : _(COPY.runtimeOnly)}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    {_(COPY.noOrigins)}
                  </p>
                )}
              </section>

              {canManageSdkInstallations ? (
                <div className="flex flex-wrap gap-2">
                  <form action={syncAction}>
                    <input
                      name="installationId"
                      type="hidden"
                      value={selectedInstallation.installationId}
                    />
                    <SyncOriginsButton />
                  </form>
                  <details className="group">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                      {_(COPY.advanced)}
                    </summary>
                    <form className="mt-2 grid max-w-sm gap-2" action={revokeAction}>
                      <input
                        name="installationId"
                        type="hidden"
                        value={selectedInstallation.installationId}
                      />
                      <p className="text-xs leading-5 text-destructive">{_(COPY.revokeWarning)}</p>
                      <RevokeInstallationButton />
                    </form>
                  </details>
                </div>
              ) : (
                <ReadOnlyInstallationNotice hasInstallation />
              )}
            </div>
          )}

          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            {_(COPY.publicIdSafety)}
          </p>
        </CardContent>
      </details>
    </Card>
  );
}

function ReadOnlyInstallationNotice({
  hasInstallation,
}: {
  hasInstallation: boolean;
}): React.ReactElement {
  const { _ } = useLingui();
  return (
    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
      {hasInstallation ? _(COPY.readonlyExisting) : _(COPY.readonlyEmpty)}
    </p>
  );
}

function installationBadgeLabel(
  canManage: boolean,
  hasInstallation: boolean,
  translate: Translate,
): string {
  if (!canManage) return translate(COPY.viewOnly);
  return hasInstallation ? translate(COPY.connected) : translate(COPY.notInstalled);
}

type InstallationActionState = SdkInstallationActionState;

function mergeInstallations(
  base: readonly PublicSdkInstallationDto[],
  ...states: readonly InstallationActionState[]
): PublicSdkInstallationDto[] {
  const byId = new Map(base.map((installation) => [installation.installationId, installation]));
  for (const state of states) {
    if (state.status === 'success') {
      byId.set(state.installation.installationId, state.installation);
    }
  }
  return [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function firstActionError(...states: readonly InstallationActionState[]): string {
  return states.find((state) => state.status === 'error')?.error ?? '';
}

function firstActionWarning(...states: readonly InstallationActionState[]): string {
  const state = states.find(
    (candidate): candidate is Extract<InstallationActionState, { status: 'success' }> =>
      candidate.status === 'success' && Boolean(candidate.warning),
  );
  return state?.warning ?? '';
}

function CreateInstallationButton(): React.ReactElement {
  const { _ } = useLingui();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
      {pending ? _(COPY.preparing) : _(COPY.create)}
    </Button>
  );
}

function SyncOriginsButton(): React.ReactElement {
  const { _ } = useLingui();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw aria-hidden="true" />
      )}
      {pending ? _(COPY.syncing) : _(COPY.sync)}
    </Button>
  );
}

function RevokeInstallationButton(): React.ReactElement {
  const { _ } = useLingui();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden="true" />
      ) : (
        <Ban aria-hidden="true" />
      )}
      {pending ? _(COPY.revoking) : _(COPY.revoke)}
    </Button>
  );
}
