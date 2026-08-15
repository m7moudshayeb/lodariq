import { AuthShell } from '../../components/auth-shell';
import { RecoveryCodeForm } from '../../components/recovery-code-form';
import { RECOVERY_CODE_MESSAGES } from '../../i18n/messages';
import { getDashboardI18n } from '../../i18n/server';
import { safeReturnTo } from '../../lib/auth-contract';

interface RecoveryCodePageProps {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

export default async function RecoveryCodePage({
  searchParams,
}: RecoveryCodePageProps): Promise<React.ReactElement> {
  const { i18n } = await getDashboardI18n();
  const returnTo = safeReturnTo((await searchParams).returnTo);
  return (
    <AuthShell
      description={i18n._(RECOVERY_CODE_MESSAGES.description)}
      eyebrow={i18n._(RECOVERY_CODE_MESSAGES.eyebrow)}
      title={i18n._(RECOVERY_CODE_MESSAGES.title)}
    >
      <RecoveryCodeForm returnTo={returnTo} />
    </AuthShell>
  );
}
