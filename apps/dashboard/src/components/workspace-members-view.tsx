'use client';

import {
  WORKSPACE_INVITATION_ROLES,
  type ControlPlaneRole,
  type WorkspaceInvitationRole,
  type WorkspaceInvitationSummary,
  type WorkspaceMember,
} from '@lodariq/schema';
import { useLingui } from '@lingui/react';
import { LoaderCircle, ShieldAlert, UserPlus } from 'lucide-react';
import * as React from 'react';
import { WORKSPACE_INVITATION_MESSAGES, WORKSPACE_MEMBERS_MESSAGES } from '../i18n/messages';
import {
  createWorkspaceInvitation,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  scheduleWorkspaceDeletion,
  transferWorkspaceOwnership,
  updateWorkspaceMemberRole,
} from '../lib/client-tenant-api';
import { DashboardPageHeader } from './dashboard-view-components';
import { EnterpriseIdentitySettings } from './enterprise-identity-settings';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { statusToast } from './ui/toaster';

interface WorkspaceMembersViewProps {
  currentRole: ControlPlaneRole;
  currentUserId: string;
  workspaceId: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function WorkspaceMembersView({
  currentRole,
  currentUserId,
  workspaceId,
}: WorkspaceMembersViewProps): React.ReactElement {
  const { _, i18n } = useLingui();
  const [members, setMembers] = React.useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = React.useState<WorkspaceInvitationSummary[]>([]);
  const [email, setEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<WorkspaceInvitationRole>('member');
  const [deletionConfirmation, setDeletionConfirmation] = React.useState('');
  const [pendingAction, setPendingAction] = React.useState('');
  const [emailError, setEmailError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const canManage = currentRole === 'owner' || currentRole === 'admin';
  const canTransferOrDelete = currentRole === 'owner';

  const refresh = React.useCallback(async (): Promise<void> => {
    try {
      const [nextMembers, nextInvitations] = await Promise.all([
        listWorkspaceMembers(workspaceId),
        canManage ? listWorkspaceInvitations(workspaceId) : Promise.resolve([]),
      ]);
      setMembers(nextMembers);
      setInvitations(nextInvitations);
    } catch {
      statusToast('error', _(WORKSPACE_MEMBERS_MESSAGES.unavailable));
    } finally {
      setLoading(false);
    }
  }, [_, canManage, workspaceId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runAction(key: string, action: () => Promise<void>): Promise<void> {
    if (pendingAction) return;
    setPendingAction(key);
    try {
      await action();
      await refresh();
    } catch {
      statusToast('error', _(WORKSPACE_MEMBERS_MESSAGES.operationFailed));
    } finally {
      setPendingAction('');
    }
  }

  async function submitInvitation(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setEmailError(_(WORKSPACE_MEMBERS_MESSAGES.invalidEmail));
      const emailInput = event.currentTarget.elements.namedItem('invitation-email');
      if (emailInput instanceof HTMLElement) emailInput.focus();
      return;
    }
    setEmailError('');
    await runAction('invite', async () => {
      await createWorkspaceInvitation(workspaceId, normalizedEmail, inviteRole);
      setEmail('');
      statusToast('success', _(WORKSPACE_MEMBERS_MESSAGES.invitationQueued));
    });
  }

  return (
    <>
      <DashboardPageHeader view="members" />
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm shadow-black/[0.04]">
        <div className="grid items-start xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
          <Card className="rounded-none border-0 shadow-none">
            <CardHeader>
              <CardTitle>{_(WORKSPACE_MEMBERS_MESSAGES.members)}</CardTitle>
              <CardDescription>{_(WORKSPACE_MEMBERS_MESSAGES.membersDescription)}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {loading ? <LoadingMessage /> : null}
              {!loading
                ? members.map((member) => (
                    <MemberRow
                      actorRole={currentRole}
                      currentUserId={currentUserId}
                      key={member.userId}
                      member={member}
                      pending={Boolean(pendingAction)}
                      onRemove={() =>
                        runAction(`remove:${member.userId}`, () =>
                          removeWorkspaceMember(workspaceId, member.userId),
                        )
                      }
                      onRoleChange={(role) =>
                        runAction(`role:${member.userId}`, () =>
                          updateWorkspaceMemberRole(workspaceId, member.userId, role),
                        )
                      }
                      onTransfer={() =>
                        runAction(`transfer:${member.userId}`, () =>
                          transferWorkspaceOwnership(workspaceId, member.userId),
                        )
                      }
                    />
                  ))
                : null}
            </CardContent>
          </Card>

          <div className="grid divide-y divide-border border-t border-border xl:border-s xl:border-t-0">
            <Card className="rounded-none border-0 bg-[var(--surface-subtle)] shadow-none">
              <CardHeader>
                <CardTitle>{_(WORKSPACE_MEMBERS_MESSAGES.invite)}</CardTitle>
                <CardDescription>{_(WORKSPACE_MEMBERS_MESSAGES.inviteDescription)}</CardDescription>
              </CardHeader>
              <CardContent>
                {canManage ? (
                  <form
                    className="grid gap-4"
                    noValidate
                    onSubmit={(event) => void submitInvitation(event)}
                  >
                    <div className="grid gap-2">
                      <Label htmlFor="invitation-email">
                        {_(WORKSPACE_MEMBERS_MESSAGES.email)}
                      </Label>
                      <Input
                        aria-describedby={emailError ? 'invitation-email-error' : undefined}
                        aria-invalid={Boolean(emailError)}
                        autoComplete="email"
                        disabled={Boolean(pendingAction)}
                        id="invitation-email"
                        name="invitation-email"
                        onChange={(event) => {
                          setEmail(event.target.value);
                          setEmailError('');
                        }}
                        type="email"
                        value={email}
                      />
                      {emailError ? (
                        <p className="text-sm text-[var(--danger-fg)]" id="invitation-email-error">
                          {emailError}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-2">
                      <Label>{_(WORKSPACE_MEMBERS_MESSAGES.role)}</Label>
                      <Select
                        disabled={Boolean(pendingAction)}
                        onValueChange={(role) => setInviteRole(role as WorkspaceInvitationRole)}
                        value={inviteRole}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableInvitationRoles(currentRole).map((role) => (
                            <SelectItem key={role} value={role}>
                              {_(roleMessage(role))}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button disabled={Boolean(pendingAction)} type="submit">
                      {pendingAction === 'invite' ? (
                        <LoaderCircle aria-hidden="true" className="animate-spin" />
                      ) : (
                        <UserPlus aria-hidden="true" />
                      )}
                      {_(WORKSPACE_MEMBERS_MESSAGES.sendInvitation)}
                    </Button>
                  </form>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {_(WORKSPACE_MEMBERS_MESSAGES.noManagementAccess)}
                  </p>
                )}
              </CardContent>
            </Card>

            {canManage ? (
              <Card className="rounded-none border-0 bg-[var(--surface-subtle)] shadow-none">
                <CardHeader>
                  <CardTitle>{_(WORKSPACE_MEMBERS_MESSAGES.pendingInvitations)}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {invitations.length ? (
                    invitations.map((invitation) => (
                      <div
                        className="flex items-center justify-between gap-3 border-b border-border p-3 last:border-0"
                        key={invitation.id}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{invitation.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {_(roleMessage(invitation.role))} ·{' '}
                            {_({
                              ...WORKSPACE_MEMBERS_MESSAGES.expires,
                              values: { date: formatDate(invitation.expiresAt, i18n.locale) },
                            })}
                          </p>
                        </div>
                        <Button
                          disabled={Boolean(pendingAction)}
                          onClick={() =>
                            void runAction(`revoke:${invitation.id}`, () =>
                              revokeWorkspaceInvitation(workspaceId, invitation.id),
                            )
                          }
                          type="button"
                          variant="outline"
                        >
                          {_(WORKSPACE_MEMBERS_MESSAGES.revoke)}
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {_(WORKSPACE_MEMBERS_MESSAGES.noPendingInvitations)}
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : null}

            {canTransferOrDelete ? (
              <Card className="rounded-none border-0 border-t border-[var(--danger-border)] bg-[var(--danger-bg)]/45 shadow-none">
                <CardHeader>
                  <div className="flex items-center gap-2 text-[var(--danger-fg)]">
                    <ShieldAlert aria-hidden="true" />
                    <CardTitle>{_(WORKSPACE_MEMBERS_MESSAGES.dangerZone)}</CardTitle>
                  </div>
                  <CardDescription>
                    {_(WORKSPACE_MEMBERS_MESSAGES.deletionDescription)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Label htmlFor="workspace-deletion-confirmation">
                    {_({
                      ...WORKSPACE_MEMBERS_MESSAGES.deletionConfirmation,
                      values: { workspaceId },
                    })}
                  </Label>
                  <Input
                    autoComplete="off"
                    disabled={Boolean(pendingAction)}
                    id="workspace-deletion-confirmation"
                    onChange={(event) => setDeletionConfirmation(event.target.value)}
                    value={deletionConfirmation}
                  />
                  <Button
                    disabled={deletionConfirmation !== workspaceId || Boolean(pendingAction)}
                    onClick={() =>
                      void runAction('delete-workspace', () =>
                        scheduleWorkspaceDeletion(workspaceId),
                      )
                    }
                    type="button"
                    variant="destructive"
                  >
                    {_(WORKSPACE_MEMBERS_MESSAGES.scheduleDeletion)}
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </section>
      {canManage ? (
        <EnterpriseIdentitySettings currentRole={currentRole} workspaceId={workspaceId} />
      ) : null}
    </>
  );
}

function MemberRow({
  actorRole,
  currentUserId,
  member,
  pending,
  onRemove,
  onRoleChange,
  onTransfer,
}: {
  actorRole: ControlPlaneRole;
  currentUserId: string;
  member: WorkspaceMember;
  pending: boolean;
  onRemove: () => Promise<void>;
  onRoleChange: (role: WorkspaceInvitationRole) => Promise<void>;
  onTransfer: () => Promise<void>;
}): React.ReactElement {
  const { _, i18n } = useLingui();
  const isSelf = member.userId === currentUserId;
  const canManageTarget =
    !isSelf &&
    (actorRole === 'owner' ||
      (actorRole === 'admin' && member.role !== 'owner' && member.role !== 'admin'));
  return (
    <div className="grid gap-3 border-b border-border py-4 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center first:pt-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{member.name ?? member.email}</p>
          <Badge variant="outline">{_(roleMessage(member.role))}</Badge>
        </div>
        <p className="truncate text-sm text-muted-foreground">{member.email}</p>
        <p className="text-xs text-muted-foreground">
          {_({
            ...WORKSPACE_MEMBERS_MESSAGES.joined,
            values: { date: formatDate(member.joinedAt, i18n.locale) },
          })}
        </p>
      </div>
      {canManageTarget ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            disabled={pending || member.role === 'owner'}
            onValueChange={(role) => void onRoleChange(role as WorkspaceInvitationRole)}
            value={member.role === 'owner' ? 'admin' : member.role}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableInvitationRoles(actorRole).map((role) => (
                <SelectItem key={role} value={role}>
                  {_(roleMessage(role))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {actorRole === 'owner' && member.role !== 'owner' ? (
            <Button
              disabled={pending}
              onClick={() => void onTransfer()}
              type="button"
              variant="outline"
            >
              {_(WORKSPACE_MEMBERS_MESSAGES.transferOwnership)}
            </Button>
          ) : null}
          <Button
            disabled={pending}
            onClick={() => void onRemove()}
            type="button"
            variant="outline"
          >
            {_(WORKSPACE_MEMBERS_MESSAGES.remove)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function LoadingMessage(): React.ReactElement {
  const { _ } = useLingui();
  return (
    <p aria-live="polite" className="text-sm text-muted-foreground">
      <LoaderCircle aria-hidden="true" className="me-2 inline size-4 animate-spin" />
      {_(WORKSPACE_INVITATION_MESSAGES.reading)}
    </p>
  );
}

function availableInvitationRoles(role: ControlPlaneRole): readonly WorkspaceInvitationRole[] {
  return role === 'owner'
    ? WORKSPACE_INVITATION_ROLES
    : WORKSPACE_INVITATION_ROLES.filter((candidate) => candidate !== 'admin');
}

function roleMessage(role: ControlPlaneRole) {
  if (role === 'owner') return WORKSPACE_MEMBERS_MESSAGES.owner;
  if (role === 'admin') return WORKSPACE_MEMBERS_MESSAGES.admin;
  if (role === 'member') return WORKSPACE_MEMBERS_MESSAGES.member;
  return WORKSPACE_MEMBERS_MESSAGES.viewer;
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}
