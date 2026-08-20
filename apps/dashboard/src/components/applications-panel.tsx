'use client';

import * as React from 'react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import {
  useSaveWorkspaceApplication,
  useWorkspaceApplications,
} from '../hooks/use-experience-measurement';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { StatusBanner } from './ui/status-banner';

const COPY = {
  registry: msg({ id: 'dashboard.applications.registry', message: 'Registered applications' }),
  explain: msg({
    id: 'dashboard.applications.explain',
    message:
      'One application is one brand theme plus one content library — not a hostname and not an environment. Several origins may serve the same one.',
  }),
  loading: msg({ id: 'dashboard.applications.loading', message: 'Loading applications…' }),
  unavailable: msg({
    id: 'dashboard.applications.unavailable',
    message: 'Applications could not be loaded right now.',
  }),
  empty: msg({
    id: 'dashboard.applications.empty',
    message: 'No application is registered yet. A journey cannot hand off until one is.',
  }),
  name: msg({ id: 'dashboard.applications.name', message: 'Name' }),
  identifier: msg({ id: 'dashboard.applications.identifier', message: 'Identifier' }),
  origins: msg({ id: 'dashboard.applications.origins', message: 'Origins' }),
  originsHelp: msg({
    id: 'dashboard.applications.originsHelp',
    message:
      'One per line. A wildcard pattern matches hosts but cannot receive a handoff, so include at least one exact host.',
  }),
  primary: msg({ id: 'dashboard.applications.primary', message: 'Primary' }),
  makePrimary: msg({ id: 'dashboard.applications.makePrimary', message: 'Make this the primary' }),
  add: msg({ id: 'dashboard.applications.add', message: 'Register application' }),
  saving: msg({ id: 'dashboard.applications.saving', message: 'Saving…' }),
  saveFailed: msg({
    id: 'dashboard.applications.saveFailed',
    message: 'The application could not be saved.',
  }),
  wildcardOnly: msg({
    id: 'dashboard.applications.wildcardOnly',
    message: 'Every pattern is a wildcard, so nothing can be handed off to this application.',
  }),
};

/** The registry a cross-application handoff resolves its destination against. */
export function ApplicationsPanel({ workspaceId }: { workspaceId: string }): React.ReactElement {
  const { _ } = useLingui();
  const query = useWorkspaceApplications(workspaceId, Boolean(workspaceId));
  const save = useSaveWorkspaceApplication(workspaceId);

  const [id, setId] = React.useState('');
  const [name, setName] = React.useState('');
  const [origins, setOrigins] = React.useState('');
  const [isPrimary, setIsPrimary] = React.useState(false);

  const parsedOrigins = origins
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>{_(COPY.registry)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{_(COPY.explain)}</p>
          {query.isPending ? (
            <p className="text-sm text-muted-foreground">{_(COPY.loading)}</p>
          ) : null}
          {query.isError ? <StatusBanner kind="error" title={_(COPY.unavailable)} /> : null}
          {query.data?.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th scope="col">{_(COPY.name)}</th>
                  <th scope="col">{_(COPY.identifier)}</th>
                  <th scope="col">{_(COPY.origins)}</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {query.data.map((application) => {
                  const routable = application.originPatterns.some(
                    (pattern) => !pattern.includes('*'),
                  );
                  return (
                    <tr className="border-t" key={application.id}>
                      <th className="py-2 text-left font-medium" scope="row">
                        {application.name}
                        {application.isPrimary ? (
                          <Badge className="ml-2" variant="outline">
                            {_(COPY.primary)}
                          </Badge>
                        ) : null}
                      </th>
                      <td className="font-mono text-xs">{application.id}</td>
                      <td>
                        {application.originPatterns.join(', ')}
                        {routable ? null : (
                          <p className="text-xs text-muted-foreground">{_(COPY.wildcardOnly)}</p>
                        )}
                      </td>
                      <td className="text-right">
                        {application.isPrimary ? null : (
                          <Button
                            disabled={save.isPending}
                            onClick={() =>
                              save.mutate({
                                id: application.id,
                                name: application.name,
                                originPatterns: [...application.originPatterns],
                                ...(application.themeId ? { themeId: application.themeId } : {}),
                                isPrimary: true,
                              })
                            }
                            size="sm"
                            variant="outline"
                          >
                            {_(COPY.makePrimary)}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : query.isSuccess ? (
            <StatusBanner kind="warning" title={_(COPY.empty)} />
          ) : null}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>{_(COPY.add)}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!id.trim() || !name.trim() || !parsedOrigins.length) return;
              save.mutate(
                {
                  id: id.trim(),
                  name: name.trim(),
                  originPatterns: parsedOrigins,
                  isPrimary,
                },
                {
                  onSuccess: () => {
                    setId('');
                    setName('');
                    setOrigins('');
                    setIsPrimary(false);
                  },
                },
              );
            }}
          >
            <div>
              <Label htmlFor="application-name">{_(COPY.name)}</Label>
              <Input
                id="application-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>
            <div>
              <Label htmlFor="application-id">{_(COPY.identifier)}</Label>
              <Input
                id="application-id"
                onChange={(event) => setId(event.target.value)}
                pattern="[A-Za-z0-9][A-Za-z0-9._:-]*"
                value={id}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="application-origins">{_(COPY.origins)}</Label>
              <textarea
                className="min-h-24 w-full rounded-md border bg-transparent p-2 text-sm"
                id="application-origins"
                onChange={(event) => setOrigins(event.target.value)}
                value={origins}
              />
              <p className="mt-1 text-xs text-muted-foreground">{_(COPY.originsHelp)}</p>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                checked={isPrimary}
                onChange={(event) => setIsPrimary(event.target.checked)}
                type="checkbox"
              />
              {_(COPY.makePrimary)}
            </label>
            <div className="sm:col-span-2">
              <Button
                disabled={save.isPending || !id.trim() || !name.trim() || !parsedOrigins.length}
                type="submit"
              >
                {save.isPending ? _(COPY.saving) : _(COPY.add)}
              </Button>
              {save.isError ? (
                <StatusBanner className="mt-3" kind="error" title={_(COPY.saveFailed)} />
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
