import { AuthShell } from '../../components/auth-shell';
import { WorkspaceInvitationAcceptance } from '../../components/workspace-invitation-acceptance';
import { WORKSPACE_INVITATION_MESSAGES } from '../../i18n/messages';
import { getDashboardI18n } from '../../i18n/server';
import { parseWorkspaceInvitationId } from '../../lib/auth-contract';

interface AcceptInvitationPageProps {
  searchParams: Promise<{
    invitation?: string | string[];
    token?: string | string[];
  }>;
}

export default async function AcceptInvitationPage({
  searchParams,
}: AcceptInvitationPageProps): Promise<React.ReactElement> {
  const query = await searchParams;
  const invitationId = parseWorkspaceInvitationId(query.invitation);
  const { i18n } = await getDashboardI18n();

  return (
    <AuthShell
      description={i18n._(WORKSPACE_INVITATION_MESSAGES.description)}
      eyebrow={i18n._(WORKSPACE_INVITATION_MESSAGES.eyebrow)}
      title={i18n._(WORKSPACE_INVITATION_MESSAGES.title)}
    >
      {invitationId && query.token === undefined ? (
        <WorkspaceInvitationAcceptance invitationId={invitationId} />
      ) : (
        <p className="text-sm leading-6 text-muted-foreground" role="alert">
          {i18n._(WORKSPACE_INVITATION_MESSAGES.incomplete)}
        </p>
      )}
    </AuthShell>
  );
}
