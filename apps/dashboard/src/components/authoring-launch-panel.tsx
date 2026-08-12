'use client';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useMemo, useState } from 'react';
import { Command, ExternalLink, MousePointer2, Sparkles } from 'lucide-react';
import { AUTHORING_LAUNCHER_SHORTCUT_LABEL } from '@lodariq/schema/authoring-entry-runtime';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { DashboardViewModel } from '../lib/view-model';

interface AuthoringLaunchPanelProps {
  authoringSiteOptions: DashboardViewModel['authoringSiteOptions'];
  defaultEnvironmentId: string;
}

const COPY = {
  eyebrow: msg({ id: 'dashboard.authoringLaunch.eyebrow', message: 'In-product authoring' }),
  title: msg({ id: 'dashboard.authoringLaunch.title', message: 'Open your product' }),
  description: msg({
    id: 'dashboard.authoringLaunch.description',
    message: 'Continue on a site mapped to an active one-time Lodariq installation.',
  }),
  notConfigured: msg({
    id: 'dashboard.authoringLaunch.notConfigured',
    message: 'Not configured',
  }),
  development: msg({ id: 'dashboard.authoringLaunch.development', message: 'Development' }),
  staging: msg({ id: 'dashboard.authoringLaunch.staging', message: 'Staging' }),
  authoringSite: msg({ id: 'dashboard.authoringLaunch.authoringSite', message: 'Authoring site' }),
  chooseSite: msg({
    id: 'dashboard.authoringLaunch.chooseSite',
    message: 'Choose an authoring site',
  }),
  stayInProduct: msg({
    id: 'dashboard.authoringLaunch.stayInProduct',
    message: 'Stay in the product while you create',
  }),
  stayInProductDescription: msg({
    id: 'dashboard.authoringLaunch.stayInProductDescription',
    message:
      'Open the site to reveal Lodariq, then start a Tour, resume an experience on that page, or preview as a user.',
  }),
  openEnvironment: msg({
    id: 'dashboard.authoringLaunch.openEnvironment',
    message: 'Open {environment}',
  }),
  setupRequired: msg({
    id: 'dashboard.authoringLaunch.setupRequired',
    message: 'Install Lodariq and map a development or staging origin before opening authoring.',
  }),
  signInHandoff: msg({
    id: 'dashboard.authoringLaunch.signInHandoff',
    message:
      'If you are signed out, the launcher opens Lodariq sign-in and returns you to the same product page automatically. No temporary editor handoff is required.',
  }),
  shortcut: msg({
    id: 'dashboard.authoringLaunch.shortcut',
    message:
      'On an authoring-enabled site, {shortcut} toggles the launcher without a dashboard visit.',
  }),
} as const;

/**
 * Dashboard fallback for the permanent one-install SDK path. The dashboard no
 * longer creates a second environment token, authoring session, or copyable
 * creator snippet just to enter the product. Authentication happens from the
 * launcher on the configured customer origin and returns to that same page.
 */
export function AuthoringLaunchPanel({
  authoringSiteOptions,
  defaultEnvironmentId,
}: AuthoringLaunchPanelProps): React.ReactElement {
  const { _ } = useLingui();
  const defaultAuthoringSite =
    authoringSiteOptions.find((site) => site.environmentId === defaultEnvironmentId) ??
    authoringSiteOptions[0];
  const [siteId, setSiteId] = useState(defaultAuthoringSite?.id ?? '');
  const selectedSite = useMemo(
    () => authoringSiteOptions.find((site) => site.id === siteId) ?? authoringSiteOptions[0],
    [authoringSiteOptions, siteId],
  );
  let environmentBadge = _(COPY.notConfigured);
  if (selectedSite?.environment === 'staging') environmentBadge = _(COPY.staging);
  if (selectedSite?.environment === 'development') environmentBadge = _(COPY.development);

  return (
    <Card className="overflow-hidden border-primary/15 bg-card shadow-sm shadow-primary/5">
      <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
        <div className="grid gap-1">
          <p className="text-xs font-semibold text-muted-foreground">{_(COPY.eyebrow)}</p>
          <CardTitle>{_(COPY.title)}</CardTitle>
          <CardDescription>{_(COPY.description)}</CardDescription>
        </div>
        <Badge variant="outline">{environmentBadge}</Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor="authoring-environment-trigger">{_(COPY.authoringSite)}</Label>
          <Select
            value={selectedSite?.id ?? ''}
            onValueChange={setSiteId}
            disabled={!authoringSiteOptions.length}
          >
            <SelectTrigger id="authoring-environment-trigger" className="h-11">
              <SelectValue placeholder={_(COPY.chooseSite)} />
            </SelectTrigger>
            <SelectContent>
              {authoringSiteOptions.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2 rounded-xl border border-primary/15 bg-primary/[0.035] p-4">
          <div className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ExternalLink className="size-4" aria-hidden="true" />
            </span>
            <div className="grid gap-1">
              <p className="text-sm font-semibold">{_(COPY.stayInProduct)}</p>
              <p className="text-sm leading-6 text-muted-foreground">
                {_(COPY.stayInProductDescription)}
              </p>
            </div>
          </div>

          {selectedSite ? (
            <Button asChild className="mt-1 h-11 w-full sm:w-auto sm:justify-self-start">
              <a href={selectedSite.launchUrl} target="_blank" rel="noreferrer">
                <MousePointer2 aria-hidden="true" />
                {_({
                  ...COPY.openEnvironment,
                  values: { environment: selectedSite.environmentLabel },
                })}
              </a>
            </Button>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              {_(COPY.setupRequired)}
            </p>
          )}
        </div>

        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          {_(COPY.signInHandoff)}
        </p>
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <Command className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          {_({ ...COPY.shortcut, values: { shortcut: AUTHORING_LAUNCHER_SHORTCUT_LABEL } })}
        </p>
      </CardContent>
    </Card>
  );
}
