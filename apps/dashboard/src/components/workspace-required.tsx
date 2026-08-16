'use client';

import { Building2, Check, LoaderCircle, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useLingui } from '@lingui/react';
import type { AuthSessionSnapshot, WorkspaceMembership } from '../lib/auth-contract';
import { useAuthMutations } from '../hooks/use-auth-mutations';
import { ClientAuthError } from '../lib/client-auth-api';
import { authErrorMessageDescriptor } from '../i18n/error-messages';
import { WORKSPACE_SELECTION_MESSAGES } from '../i18n/messages';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { StatusBanner } from './ui/status-banner';

export function WorkspaceRequired({
  session,
}: {
  session: AuthSessionSnapshot;
}): React.ReactElement {
  const router = useRouter();
  const [pendingId, setPendingId] = useState('');
  const [error, setError] = useState('');
  const auth = useAuthMutations();
  const { _ } = useLingui();

  async function choose(workspace: WorkspaceMembership): Promise<void> {
    if (pendingId) return;
    setError('');
    setPendingId(workspace.id);
    try {
      await auth.selectWorkspace.mutateAsync(workspace.id);
      router.replace('/');
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ClientAuthError
          ? _(authErrorMessageDescriptor(caught.code, caught.statusCode))
          : _(WORKSPACE_SELECTION_MESSAGES.openError),
      );
      setPendingId('');
    }
  }

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pendingId) return;
    const form = new FormData(event.currentTarget);
    const name = typeof form.get('name') === 'string' ? String(form.get('name')).trim() : '';
    if (!name) return;
    setError('');
    setPendingId('new');
    try {
      await auth.createWorkspace.mutateAsync(name);
      router.replace('/');
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ClientAuthError
          ? _(authErrorMessageDescriptor(caught.code, caught.statusCode))
          : _(WORKSPACE_SELECTION_MESSAGES.createError),
      );
      setPendingId('');
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <section className="grid w-full max-w-2xl gap-7 rounded-2xl border border-border bg-card p-6 shadow-[0_20px_60px_rgba(30,55,47,.10)] sm:p-9">
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
          <div className="grid size-11 place-items-center rounded-xl bg-[var(--nav-active)] text-primary">
            <Building2 aria-hidden="true" className="size-5" />
          </div>
          <div className="grid gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              {_(WORKSPACE_SELECTION_MESSAGES.eyebrow)}
            </p>
            <h1 className="[font-family:Georgia,serif] text-3xl tracking-[-0.025em]">
              {_(WORKSPACE_SELECTION_MESSAGES.title)}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {_(WORKSPACE_SELECTION_MESSAGES.description)}
            </p>
          </div>
        </div>

        {session.workspaces.length ? (
          <div className="grid gap-2">
            {session.workspaces.map((workspace) => (
              <button
                className="group flex min-h-14 items-center gap-3 rounded-xl border border-border bg-[var(--surface-subtle)] px-4 text-start outline-none transition hover:border-primary/40 hover:bg-[var(--nav-active)] focus-visible:ring-2 focus-visible:ring-ring"
                disabled={Boolean(pendingId)}
                key={workspace.id}
                onClick={() => void choose(workspace)}
                type="button"
              >
                <span className="grid size-8 place-items-center rounded-lg bg-card text-sm font-bold text-primary shadow-sm">
                  {workspace.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{workspace.name}</span>
                  <span className="block text-xs capitalize text-muted-foreground">
                    {_(roleMessage(workspace.role))}
                  </span>
                </span>
                {pendingId === workspace.id ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" />
                ) : (
                  <Check
                    aria-hidden="true"
                    className="size-4 text-transparent group-hover:text-primary"
                  />
                )}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="grid gap-3 border-t border-border pt-6"
          onSubmit={(event) => void create(event)}
        >
          <Label htmlFor="new-workspace-name">{_(WORKSPACE_SELECTION_MESSAGES.create)}</Label>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              disabled={Boolean(pendingId)}
              id="new-workspace-name"
              name="name"
              placeholder={_(WORKSPACE_SELECTION_MESSAGES.placeholder)}
              required
            />
            <Button disabled={Boolean(pendingId)} type="submit">
              {pendingId === 'new' ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Plus aria-hidden="true" />
              )}
              {_(WORKSPACE_SELECTION_MESSAGES.createAndOpen)}
            </Button>
          </div>
        </form>

        {error ? <StatusBanner kind="error" title={error} /> : null}
      </section>
    </main>
  );
}

function roleMessage(role: WorkspaceMembership['role']) {
  if (role === 'owner') return WORKSPACE_SELECTION_MESSAGES.roleOwner;
  if (role === 'admin') return WORKSPACE_SELECTION_MESSAGES.roleAdmin;
  if (role === 'member') return WORKSPACE_SELECTION_MESSAGES.roleMember;
  return WORKSPACE_SELECTION_MESSAGES.roleViewer;
}
