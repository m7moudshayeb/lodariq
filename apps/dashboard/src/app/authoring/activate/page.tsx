import { AuthoringActivationPopup } from '../../../components/authoring-activation-popup';
import { isPasswordRecoveryEnabled } from '../../../lib/password-recovery-config';

export const dynamic = 'force-dynamic';

export default function AuthoringActivatePage(): React.ReactElement {
  return <AuthoringActivationPopup passwordRecoveryEnabled={isPasswordRecoveryEnabled()} />;
}
