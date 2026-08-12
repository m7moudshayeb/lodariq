'use client';

import {
  Building2,
  Check,
  ChevronsUpDown,
  LoaderCircle,
  LogOut,
  Plus,
  UserRound,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { AuthSessionSnapshot } from '../lib/auth-contract';
import { useAuthMutations } from '../hooks/use-auth-mutations';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface DashboardAuthControlsProps {
  session: AuthSessionSnapshot;
  compact?: boolean;
}

export function DashboardAuthControls({
  session,
  compact = false,
}: DashboardAuthControlsProps): React.ReactElement {
  const router = useRouter();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [currentSession, setCurrentSession] = useState(session);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const auth = useAuthMutations();
  const activeWorkspace = currentSession.workspaces.find(
    (workspace) => workspace.id === currentSession.activeWorkspaceId,
  );

  useEffect(() => setCurrentSession(session), [session]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  async function chooseWorkspace(workspaceId: string): Promise<void> {
    if (pending || workspaceId === currentSession.activeWorkspaceId) return;
    setError('');
    setPending(workspaceId);
    try {
      setCurrentSession(await auth.selectWorkspace.mutateAsync(workspaceId));
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not switch workspaces.');
    } finally {
      setPending('');
    }
  }

  async function addWorkspace(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const name = typeof form.get('name') === 'string' ? String(form.get('name')).trim() : '';
    if (!name) return;
    setError('');
    setPending('new');
    try {
      setCurrentSession(await auth.createWorkspace.mutateAsync(name));
      (event.currentTarget as HTMLFormElement).reset();
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the workspace.');
    } finally {
      setPending('');
    }
  }

  async function endSession(): Promise<void> {
    if (pending) return;
    setError('');
    setPending('sign-out');
    try {
      await auth.signOut.mutateAsync();
      router.replace('/sign-in');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign out.');
      setPending('');
    }
  }

  const identityLabel = currentSession.user.name?.trim() || currentSession.user.email;

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={compact ? 'Open account and workspace menu' : undefined}
        className={
          compact
            ? 'mx-auto grid size-10 place-items-center rounded-xl border border-border bg-card text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring'
            : 'flex min-h-12 w-full min-w-0 items-center gap-2 rounded-xl border border-border bg-[var(--surface-subtle)] p-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring'
        }
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--avatar-bg)] text-xs font-bold uppercase text-primary">
          {initials(identityLabel)}
        </span>
        {!compact ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">
                {activeWorkspace?.name ?? 'Workspace'}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {identityLabel}
              </span>
            </span>
            <ChevronsUpDown
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          </>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute bottom-[calc(100%+8px)] left-0 z-[70] grid w-[min(288px,calc(100vw-32px))] gap-2 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-[0_18px_50px_rgba(30,55,47,.18)]"
          id={menuId}
          role="menu"
        >
          <div className="flex items-center gap-3 px-2 py-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--avatar-bg)] text-primary">
              <UserRound aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{identityLabel}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {currentSession.user.email}
              </span>
            </span>
          </div>

          <div className="border-t border-border pt-2">
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Workspaces
            </p>
            {currentSession.workspaces.map((workspace) => {
              const active = workspace.id === currentSession.activeWorkspaceId;
              return (
                <button
                  className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-accent disabled:opacity-60"
                  disabled={Boolean(pending)}
                  key={workspace.id}
                  onClick={() => void chooseWorkspace(workspace.id)}
                  role="menuitem"
                  type="button"
                >
                  {pending === workspace.id ? (
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <Building2 aria-hidden="true" className="size-4 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                  <span className="text-[10px] capitalize text-muted-foreground">
                    {workspace.role}
                  </span>
                  {active ? <Check aria-hidden="true" className="size-4 text-primary" /> : null}
                </button>
              );
            })}
          </div>

          <form
            className="grid grid-cols-[1fr_auto] gap-1 border-t border-border pt-2"
            onSubmit={(event) => void addWorkspace(event)}
          >
            <Input
              aria-label="New workspace name"
              className="h-8"
              disabled={Boolean(pending)}
              name="name"
              placeholder="New workspace"
              required
            />
            <Button
              aria-label="Create workspace"
              disabled={Boolean(pending)}
              size="icon"
              type="submit"
              variant="ghost"
            >
              {pending === 'new' ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Plus aria-hidden="true" />
              )}
            </Button>
          </form>

          {error ? (
            <p className="px-2 text-xs leading-5 text-[var(--danger-fg)]" role="alert">
              {error}
            </p>
          ) : null}

          <button
            className="flex min-h-10 w-full items-center gap-2 rounded-lg border-t border-border px-2 pt-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
            disabled={Boolean(pending)}
            onClick={() => void endSession()}
            role="menuitem"
            type="button"
          >
            {pending === 'sign-out' ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <LogOut aria-hidden="true" className="size-4" />
            )}
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function initials(value: string): string {
  const parts = value.split(/\s+/u).filter(Boolean);
  if (parts.length > 1) {
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`;
  }
  return value.slice(0, 2);
}
