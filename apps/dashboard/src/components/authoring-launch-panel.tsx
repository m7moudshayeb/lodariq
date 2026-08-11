'use client';

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
  const defaultAuthoringSite =
    authoringSiteOptions.find((site) => site.environmentId === defaultEnvironmentId) ??
    authoringSiteOptions[0];
  const [siteId, setSiteId] = useState(defaultAuthoringSite?.id ?? '');
  const selectedSite = useMemo(
    () => authoringSiteOptions.find((site) => site.id === siteId) ?? authoringSiteOptions[0],
    [authoringSiteOptions, siteId],
  );

  return (
    <Card className="overflow-hidden border-primary/15 bg-card shadow-sm shadow-primary/5">
      <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
        <div className="grid gap-1">
          <p className="text-xs font-semibold text-muted-foreground">In-product authoring</p>
          <CardTitle>Open your product</CardTitle>
          <CardDescription>
            Continue on a site mapped to an active one-time Lodariq installation.
          </CardDescription>
        </div>
        <Badge variant="outline">{selectedSite?.environment ?? 'not configured'}</Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor="authoring-environment-trigger">Authoring site</Label>
          <Select
            value={selectedSite?.id ?? ''}
            onValueChange={setSiteId}
            disabled={!authoringSiteOptions.length}
          >
            <SelectTrigger id="authoring-environment-trigger" className="h-11">
              <SelectValue placeholder="Choose an authoring site" />
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
              <p className="text-sm font-semibold">Stay in the product while you create</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Open the site to reveal Lodariq, then start a Tour, resume an experience on that
                page, or preview as a user.
              </p>
            </div>
          </div>

          {selectedSite ? (
            <Button asChild className="mt-1 h-11 w-full sm:w-auto sm:justify-self-start">
              <a href={selectedSite.launchUrl} target="_blank" rel="noreferrer">
                <MousePointer2 aria-hidden="true" />
                Open {selectedSite.environmentLabel}
              </a>
            </Button>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              Install Lodariq and map a development or staging origin before opening authoring.
            </p>
          )}
        </div>

        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          If you are signed out, the launcher opens Lodariq sign-in and returns you to the same
          product page automatically. No temporary editor handoff is required.
        </p>
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <Command className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          On an authoring-enabled site, {AUTHORING_LAUNCHER_SHORTCUT_LABEL} toggles the launcher
          without a dashboard visit.
        </p>
      </CardContent>
    </Card>
  );
}
