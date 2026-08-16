'use client';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import {
  CheckCircle2,
  Download,
  KeyRound,
  LoaderCircle,
  LogOut,
  Mail,
  MonitorSmartphone,
  ShieldCheck,
  Trash2,
  UserRound,
  Fingerprint,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { AuthSessionSnapshot } from '../lib/auth-contract';
import {
  changePassword,
  deleteAccount,
  exportAccount,
  getEmailChange,
  listAccountSessions,
  listAuthIdentities,
  revokeAccountSession,
  setUsername,
  signOutEverywhere,
  startEmailChange,
  unlinkAuthIdentity,
  authenticateWithPasskey,
  beginOidcAuthentication,
  confirmRecoveryCodes,
  generateRecoveryCodes,
  getRecoveryCodeStatus,
  listPasskeys,
  registerPasskey,
  revokeRecoveryCodes,
  type PasskeySummary,
  type RecoveryCodeStatus,
  ClientAuthError,
  userFacingClientError,
} from '../lib/client-auth-api';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { StatusBanner } from './ui/status-banner';
import { Input } from './ui/input';
import { Label } from './ui/label';

const COPY = {
  title: msg({ id: 'account.title', message: 'Account & security' }),
  description: msg({
    id: 'account.description',
    message: 'Manage how you sign in, where your account is active, and your account data.',
  }),
  profile: msg({ id: 'account.profile.title', message: 'Sign-in identifier' }),
  profileHelp: msg({
    id: 'account.profile.help',
    message:
      'Your verified email always works. A username gives you another private way to sign in.',
  }),
  username: msg({ id: 'account.username', message: 'Username' }),
  usernamePlaceholder: msg({ id: 'account.username.placeholder', message: 'your-username' }),
  currentPassword: msg({ id: 'account.currentPassword', message: 'Current password' }),
  newPassword: msg({ id: 'account.newPassword', message: 'New password' }),
  confirmPassword: msg({ id: 'account.confirmPassword', message: 'Confirm new password' }),
  saveUsername: msg({ id: 'account.username.save', message: 'Save username' }),
  password: msg({ id: 'account.password.title', message: 'Password' }),
  passwordHelp: msg({
    id: 'account.password.help',
    message: 'Changing your password revokes every other session and outstanding recovery link.',
  }),
  changePassword: msg({ id: 'account.password.change', message: 'Change password' }),
  email: msg({ id: 'account.email.title', message: 'Email address' }),
  emailHelp: msg({
    id: 'account.email.help',
    message: 'Both your current address and the new address must approve the change.',
  }),
  newEmail: msg({ id: 'account.email.new', message: 'New email address' }),
  beginEmailChange: msg({ id: 'account.email.begin', message: 'Send verification links' }),
  pendingEmail: msg({ id: 'account.email.pending', message: 'Pending address: {email}' }),
  oldVerified: msg({ id: 'account.email.oldVerified', message: 'Current email confirmed' }),
  oldWaiting: msg({ id: 'account.email.oldWaiting', message: 'Waiting for current email' }),
  newVerified: msg({ id: 'account.email.newVerified', message: 'New email confirmed' }),
  newWaiting: msg({ id: 'account.email.newWaiting', message: 'Waiting for new email' }),
  sessions: msg({ id: 'account.sessions.title', message: 'Active sessions' }),
  sessionsHelp: msg({
    id: 'account.sessions.help',
    message: 'Device labels are coarse and privacy-reviewed; IP addresses are not stored here.',
  }),
  current: msg({ id: 'account.sessions.current', message: 'Current session' }),
  revoke: msg({ id: 'account.sessions.revoke', message: 'Revoke' }),
  signOutEverywhere: msg({
    id: 'account.sessions.signOutEverywhere',
    message: 'Sign out everywhere',
  }),
  methods: msg({ id: 'account.methods.title', message: 'Sign-in methods' }),
  methodsHelp: msg({
    id: 'account.methods.help',
    message: 'Lodariq will never let you remove your final usable sign-in method.',
  }),
  remove: msg({ id: 'account.methods.remove', message: 'Remove' }),
  data: msg({ id: 'account.data.title', message: 'Account data' }),
  dataHelp: msg({
    id: 'account.data.help',
    message:
      'Download the profile, verified addresses, sign-in methods, and workspace memberships tied to your account.',
  }),
  export: msg({ id: 'account.data.export', message: 'Download account export' }),
  danger: msg({ id: 'account.danger.title', message: 'Delete account' }),
  dangerHelp: msg({
    id: 'account.danger.help',
    message:
      'Deletion signs you out immediately and starts a 30-day retention period. Transfer any workspace you solely own first.',
  }),
  deleteConfirmation: msg({ id: 'account.delete.confirmation', message: 'Type DELETE' }),
  delete: msg({ id: 'account.delete.action', message: 'Delete my account' }),
  loading: msg({ id: 'account.loading', message: 'Loading account security…' }),
  saved: msg({ id: 'account.saved', message: 'Security setting saved.' }),
  emailQueued: msg({
    id: 'account.email.queued',
    message: 'Two private verification links were queued. Open both before they expire.',
  }),
  validationRequired: msg({ id: 'account.validation.required', message: 'Complete every field.' }),
  validationPassword: msg({
    id: 'account.validation.password',
    message: 'Use 12–128 characters and make both new-password fields match.',
  }),
  validationEmail: msg({
    id: 'account.validation.email',
    message: 'Enter a complete email address.',
  }),
  validationDelete: msg({
    id: 'account.validation.delete',
    message: 'Enter your password and type DELETE exactly.',
  }),
  reauthenticate: msg({
    id: 'account.reauthenticate',
    message: 'This sensitive action requires a fresh sign-in. Sign in again, then return here.',
  }),
  signInAgain: msg({ id: 'account.signInAgain', message: 'Sign in again' }),
  unavailable: msg({ id: 'account.unavailable', message: 'Account security is unavailable.' }),
  passwordMethod: msg({ id: 'account.methods.password', message: 'Password' }),
  passkeyMethod: msg({ id: 'account.methods.passkey', message: 'Passkey' }),
  oidcMethod: msg({ id: 'account.methods.oidc', message: 'OpenID Connect' }),
  samlMethod: msg({ id: 'account.methods.saml', message: 'Enterprise SSO' }),
  passkeys: msg({ id: 'account.passkeys.title', message: 'Passkeys' }),
  passkeysHelp: msg({
    id: 'account.passkeys.help',
    message: 'Passkeys use this device or a security key and provide phishing-resistant sign-in.',
  }),
  passkeyName: msg({ id: 'account.passkeys.name', message: 'Passkey name' }),
  passkeyNamePlaceholder: msg({ id: 'account.passkeys.namePlaceholder', message: 'Work laptop' }),
  addPasskey: msg({ id: 'account.passkeys.add', message: 'Add passkey' }),
  stepUp: msg({ id: 'account.passkeys.stepUp', message: 'Verify with passkey' }),
  recoveryCodes: msg({ id: 'account.recoveryCodes.title', message: 'Recovery codes' }),
  recoveryCodesHelp: msg({
    id: 'account.recoveryCodes.help',
    message: 'Save all ten single-use codes offline. Generating a new set revokes the previous set.',
  }),
  recoveryGenerate: msg({ id: 'account.recoveryCodes.generate', message: 'Generate new codes' }),
  recoveryConfirm: msg({ id: 'account.recoveryCodes.confirm', message: 'Confirm saved codes' }),
  recoveryConfirmHelp: msg({
    id: 'account.recoveryCodes.confirmHelp',
    message: 'Enter any one displayed code to confirm that you saved the set. It remains usable.',
  }),
  recoveryRevoke: msg({ id: 'account.recoveryCodes.revoke', message: 'Revoke recovery codes' }),
  recoveryRemaining: msg({
    id: 'account.recoveryCodes.remaining',
    message: '{count} unused codes remain.',
  }),
  recoveryUnconfirmed: msg({
    id: 'account.recoveryCodes.unconfirmed',
    message: 'This set is not active until you confirm one saved code.',
  }),
  recoveryShownOnce: msg({
    id: 'account.recoveryCodes.shownOnce',
    message: 'Copy these codes now. They will not be shown again.',
  }),
  passkeySynced: msg({ id: 'account.passkeys.synced', message: 'Synced passkey' }),
  passkeyDeviceBound: msg({ id: 'account.passkeys.deviceBound', message: 'Device-bound passkey' }),
  passkeySingleDevice: msg({ id: 'account.passkeys.singleDevice', message: 'Single device' }),
  passkeyMultiDevice: msg({ id: 'account.passkeys.multiDevice', message: 'Multiple devices' }),
  linkGoogle: msg({ id: 'account.methods.linkGoogle', message: 'Link Google' }),
  linkMicrosoft: msg({ id: 'account.methods.linkMicrosoft', message: 'Link Microsoft' }),
} as const;

type Sessions = Awaited<ReturnType<typeof listAccountSessions>>['sessions'];
type Identities = Awaited<ReturnType<typeof listAuthIdentities>>['identities'];
type EmailChange = Awaited<ReturnType<typeof getEmailChange>>;

interface AccountSecuritySettingsProps {
  session: AuthSessionSnapshot;
}

export function AccountSecuritySettings({
  session,
}: AccountSecuritySettingsProps): React.ReactElement {
  const { _, i18n } = useLingui();
  const router = useRouter();
  const [sessions, setSessions] = useState<Sessions>([]);
  const [identities, setIdentities] = useState<Identities>([]);
  const [emailChange, setEmailChange] = useState<EmailChange>(null);
  const [busy, setBusy] = useState('load');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reauthenticate, setReauthenticate] = useState(false);
  const [identityPassword, setIdentityPassword] = useState('');
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryCodeStatus | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<{ setId: string; codes: string[] } | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    void Promise.all([
      listAccountSessions(),
      listAuthIdentities(),
      getEmailChange(),
      listPasskeys(),
      getRecoveryCodeStatus(),
    ])
      .then(([nextSessions, nextIdentities, nextEmailChange, nextPasskeys, nextRecoveryStatus]) => {
        if (!active) return;
        setSessions(nextSessions.sessions);
        setIdentities(nextIdentities.identities);
        setEmailChange(nextEmailChange);
        setPasskeys(nextPasskeys);
        setRecoveryStatus(nextRecoveryStatus);
        setBusy('');
      })
      .catch((caught) => {
        if (!active) return;
        setError(userFacingClientError(caught, _(COPY.unavailable)));
        setBusy('');
      });
    return () => {
      active = false;
    };
  }, [_]);

  function begin(action: string): boolean {
    if (busy) return false;
    setBusy(action);
    setError('');
    setNotice('');
    setReauthenticate(false);
    return true;
  }

  function fail(caught: unknown): void {
    if (caught instanceof ClientAuthError && caught.code === 'recent_authentication_required') {
      setReauthenticate(true);
      setError(_(COPY.reauthenticate));
    } else {
      setError(userFacingClientError(caught, _(COPY.unavailable)));
    }
    setBusy('');
  }

  async function updateUsername(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!begin('username')) return;
    const values = formValues(form, ['username', 'currentPassword']);
    if (!values) return validationFailure(_(COPY.validationRequired), setError, setBusy);
    try {
      await setUsername(values.username, values.currentPassword);
      setNotice(_(COPY.saved));
      setBusy('');
      form.reset();
      router.refresh();
    } catch (caught) {
      fail(caught);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!begin('password')) return;
    const values = formValues(form, [
      'currentPassword',
      'newPassword',
      'confirmPassword',
    ]);
    if (
      !values ||
      Array.from(values.newPassword).length < 12 ||
      Array.from(values.newPassword).length > 128 ||
      values.newPassword !== values.confirmPassword
    ) {
      return validationFailure(_(COPY.validationPassword), setError, setBusy);
    }
    try {
      await changePassword(values.currentPassword, values.newPassword);
      setNotice(_(COPY.saved));
      setBusy('');
      form.reset();
    } catch (caught) {
      fail(caught);
    }
  }

  async function updateEmail(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!begin('email')) return;
    const values = formValues(form, ['newEmail', 'currentPassword']);
    if (!values || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(values.newEmail)) {
      return validationFailure(_(COPY.validationEmail), setError, setBusy);
    }
    try {
      setEmailChange(await startEmailChange(values.newEmail, values.currentPassword));
      setNotice(_(COPY.emailQueued));
      setBusy('');
      form.reset();
    } catch (caught) {
      fail(caught);
    }
  }

  async function revokeSession(sessionId: string, current: boolean): Promise<void> {
    if (!begin(`session:${sessionId}`)) return;
    try {
      await revokeAccountSession(sessionId);
      if (current) return leaveForSignIn(router);
      setSessions((items) => items.filter((item) => item.id !== sessionId));
      setNotice(_(COPY.saved));
      setBusy('');
    } catch (caught) {
      fail(caught);
    }
  }

  async function revokeEverySession(): Promise<void> {
    if (!begin('sessions:all')) return;
    try {
      await signOutEverywhere();
      leaveForSignIn(router);
    } catch (caught) {
      fail(caught);
    }
  }

  async function removeIdentity(identityId: string, kind: string): Promise<void> {
    if (!begin(`identity:${identityId}`)) return;
    const password = kind === 'password' ? identityPassword : undefined;
    if (kind === 'password' && !password) {
      return validationFailure(_(COPY.validationRequired), setError, setBusy);
    }
    try {
      await unlinkAuthIdentity(identityId, password);
      setIdentityPassword('');
      leaveForSignIn(router);
    } catch (caught) {
      fail(caught);
    }
  }

  async function linkOidc(provider: 'google' | 'microsoft'): Promise<void> {
    if (!begin(`oidc:${provider}`)) return;
    try {
      const authorizationUrl = await beginOidcAuthentication({
        provider,
        action: 'link',
        returnTo: '/account',
      });
      window.location.assign(authorizationUrl);
    } catch (caught) {
      fail(caught);
    }
  }

  async function downloadExport(): Promise<void> {
    if (!begin('export')) return;
    try {
      const exported = await exportAccount();
      const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `lodariq-account-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setBusy('');
    } catch (caught) {
      fail(caught);
    }
  }

  async function scheduleDeletion(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!begin('delete')) return;
    const values = formValues(event.currentTarget, ['currentPassword', 'confirmation']);
    if (!values || values.confirmation !== 'DELETE') {
      return validationFailure(_(COPY.validationDelete), setError, setBusy);
    }
    try {
      await deleteAccount(values.currentPassword);
      leaveForSignIn(router);
    } catch (caught) {
      fail(caught);
    }
  }

  async function addPasskey(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!begin('passkey:add')) return;
    const values = formValues(form, ['name']);
    if (!values) return validationFailure(_(COPY.validationRequired), setError, setBusy);
    try {
      await registerPasskey(values.name);
      setPasskeys(await listPasskeys());
      setIdentities((await listAuthIdentities()).identities);
      setNotice(_(COPY.saved));
      setBusy('');
      form.reset();
    } catch (caught) {
      fail(caught);
    }
  }

  async function stepUpWithPasskey(): Promise<void> {
    if (!begin('passkey:step-up')) return;
    try {
      await authenticateWithPasskey('step_up');
      setNotice(_(COPY.saved));
      setBusy('');
      router.refresh();
    } catch (caught) {
      fail(caught);
    }
  }

  async function createRecoverySet(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!begin('recovery:generate')) return;
    const password = new FormData(form).get('currentPassword');
    try {
      const generated = await generateRecoveryCodes(
        typeof password === 'string' && password ? password : undefined,
      );
      setRecoveryCodes(generated);
      setRecoveryStatus({
        setId: generated.setId,
        confirmed: false,
        remaining: generated.codes.length,
        createdAt: new Date().toISOString(),
      });
      setBusy('');
      form.reset();
    } catch (caught) {
      fail(caught);
    }
  }

  async function confirmRecoverySet(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (!recoveryCodes || !begin('recovery:confirm')) return;
    const values = formValues(form, ['code']);
    if (!values) return validationFailure(_(COPY.validationRequired), setError, setBusy);
    try {
      await confirmRecoveryCodes(recoveryCodes.setId, values.code);
      setRecoveryStatus(await getRecoveryCodeStatus());
      setRecoveryCodes(null);
      setNotice(_(COPY.saved));
      setBusy('');
      form.reset();
    } catch (caught) {
      fail(caught);
    }
  }

  async function removeRecoverySet(): Promise<void> {
    if (!begin('recovery:revoke')) return;
    try {
      await revokeRecoveryCodes();
      setRecoveryStatus(null);
      setRecoveryCodes(null);
      setNotice(_(COPY.saved));
      setBusy('');
    } catch (caught) {
      fail(caught);
    }
  }

  if (busy === 'load') {
    return (
      <p aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        {_(COPY.loading)}
      </p>
    );
  }

  return (
    <div className="grid gap-5">
      <header className="grid gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Lodariq</p>
        <h1 className="[font-family:Georgia,serif] text-4xl tracking-[-0.03em]">{_(COPY.title)}</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{_(COPY.description)}</p>
      </header>

      {error || notice ? (
        <StatusBanner kind={accountBannerKind(error, reauthenticate)} title={error || notice}>
          {reauthenticate ? (
            <a className="font-semibold underline" href="/sign-in?returnTo=%2Faccount">
              {_(COPY.signInAgain)}
            </a>
          ) : null}
        </StatusBanner>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <SecurityCard icon={UserRound} title={_(COPY.profile)} description={_(COPY.profileHelp)}>
          <p className="mb-4 text-sm text-muted-foreground">{session.user.email}</p>
          <form className="grid gap-3" noValidate onSubmit={(event) => void updateUsername(event)}>
            <AccountField
              id="account-username"
              label={_(COPY.username)}
              name="username"
              placeholder={_(COPY.usernamePlaceholder)}
            />
            <AccountField
              autoComplete="current-password"
              id="account-username-password"
              label={_(COPY.currentPassword)}
              name="currentPassword"
              type="password"
            />
            <Button disabled={Boolean(busy)} type="submit">
              {buttonContent(busy === 'username', _(COPY.saveUsername))}
            </Button>
          </form>
        </SecurityCard>

        <SecurityCard icon={KeyRound} title={_(COPY.password)} description={_(COPY.passwordHelp)}>
          <form className="grid gap-3" noValidate onSubmit={(event) => void updatePassword(event)}>
            <AccountField
              autoComplete="current-password"
              id="account-password-current"
              label={_(COPY.currentPassword)}
              name="currentPassword"
              type="password"
            />
            <AccountField
              autoComplete="new-password"
              id="account-password-new"
              label={_(COPY.newPassword)}
              name="newPassword"
              type="password"
            />
            <AccountField
              autoComplete="new-password"
              id="account-password-confirm"
              label={_(COPY.confirmPassword)}
              name="confirmPassword"
              type="password"
            />
            <Button disabled={Boolean(busy)} type="submit">
              {buttonContent(busy === 'password', _(COPY.changePassword))}
            </Button>
          </form>
        </SecurityCard>

        <SecurityCard icon={Mail} title={_(COPY.email)} description={_(COPY.emailHelp)}>
          {emailChange ? (
            <div className="mb-4 grid gap-2 rounded-lg border border-border bg-[var(--surface-subtle)] p-3 text-sm">
              <p className="font-semibold">
                {_({ ...COPY.pendingEmail, values: { email: emailChange.newEmail } })}
              </p>
              <ProofState
                complete={emailChange.currentEmailVerified}
                completeText={_(COPY.oldVerified)}
                waitingText={_(COPY.oldWaiting)}
              />
              <ProofState
                complete={emailChange.newEmailVerified}
                completeText={_(COPY.newVerified)}
                waitingText={_(COPY.newWaiting)}
              />
            </div>
          ) : null}
          <form className="grid gap-3" noValidate onSubmit={(event) => void updateEmail(event)}>
            <AccountField
              autoComplete="email"
              id="account-email-new"
              label={_(COPY.newEmail)}
              name="newEmail"
              type="email"
            />
            <AccountField
              autoComplete="current-password"
              id="account-email-password"
              label={_(COPY.currentPassword)}
              name="currentPassword"
              type="password"
            />
            <Button disabled={Boolean(busy)} type="submit">
              {buttonContent(busy === 'email', _(COPY.beginEmailChange))}
            </Button>
          </form>
        </SecurityCard>

        <SecurityCard icon={ShieldCheck} title={_(COPY.methods)} description={_(COPY.methodsHelp)}>
          <div className="mb-3 flex flex-wrap gap-2">
            {(['google', 'microsoft'] as const).map((provider) => (
              <Button
                disabled={Boolean(busy)}
                key={provider}
                onClick={() => void linkOidc(provider)}
                type="button"
                variant="outline"
              >
                {buttonContent(
                  busy === `oidc:${provider}`,
                  _(provider === 'google' ? COPY.linkGoogle : COPY.linkMicrosoft),
                )}
              </Button>
            ))}
          </div>
          {identities.some((identity) => identity.kind === 'password') ? (
            <div className="mb-3 grid gap-2">
              <Label htmlFor="account-method-password">{_(COPY.currentPassword)}</Label>
              <Input
                autoComplete="current-password"
                id="account-method-password"
                onChange={(event) => setIdentityPassword(event.currentTarget.value)}
                type="password"
                value={identityPassword}
              />
            </div>
          ) : null}
          <ul className="grid gap-2">
            {identities.map((identity) => (
              <li
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                key={identity.id}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {_(methodLabel(identity.kind))}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {identity.issuer}
                  </span>
                </span>
                <Button
                  disabled={Boolean(busy)}
                  onClick={() => void removeIdentity(identity.id, identity.kind)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {buttonContent(busy === `identity:${identity.id}`, _(COPY.remove))}
                </Button>
              </li>
            ))}
          </ul>
        </SecurityCard>

        <SecurityCard
          icon={Fingerprint}
          title={_(COPY.passkeys)}
          description={_(COPY.passkeysHelp)}
        >
          <ul className="mb-4 grid gap-2">
            {passkeys.map((passkey) => (
              <li className="rounded-lg border border-border p-3" key={passkey.id}>
                <span className="block text-sm font-semibold">{passkey.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {_(
                    passkey.deviceType === 'multiDevice'
                      ? COPY.passkeyMultiDevice
                      : COPY.passkeySingleDevice,
                  )}{' '}
                  · {_(passkey.backedUp ? COPY.passkeySynced : COPY.passkeyDeviceBound)}
                </span>
              </li>
            ))}
          </ul>
          <form className="grid gap-3" noValidate onSubmit={(event) => void addPasskey(event)}>
            <AccountField
              autoComplete="off"
              id="account-passkey-name"
              label={_(COPY.passkeyName)}
              name="name"
              placeholder={_(COPY.passkeyNamePlaceholder)}
            />
            <Button disabled={Boolean(busy)} type="submit">
              {buttonContent(busy === 'passkey:add', _(COPY.addPasskey))}
            </Button>
          </form>
          {passkeys.length ? (
            <Button
              className="mt-3"
              disabled={Boolean(busy)}
              onClick={() => void stepUpWithPasskey()}
              type="button"
              variant="outline"
            >
              <Fingerprint aria-hidden="true" />
              {buttonContent(busy === 'passkey:step-up', _(COPY.stepUp))}
            </Button>
          ) : null}
        </SecurityCard>

        <SecurityCard
          icon={KeyRound}
          title={_(COPY.recoveryCodes)}
          description={_(COPY.recoveryCodesHelp)}
        >
          {recoveryStatus ? (
            <div className="mb-4 rounded-lg border border-border p-3 text-sm">
              <p>
                {_({ ...COPY.recoveryRemaining, values: { count: recoveryStatus.remaining } })}
              </p>
              {!recoveryStatus.confirmed ? (
                <p className="mt-1 text-[var(--danger-fg)]">{_(COPY.recoveryUnconfirmed)}</p>
              ) : null}
            </div>
          ) : null}
          {recoveryCodes ? (
            <div className="mb-4 grid gap-3">
              <p className="text-sm font-semibold" role="status">
                {_(COPY.recoveryShownOnce)}
              </p>
              <ol className="grid gap-1 rounded-lg border border-border bg-[var(--surface-subtle)] p-4 font-mono text-sm sm:grid-cols-2">
                {recoveryCodes.codes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ol>
              <form
                className="grid gap-3"
                noValidate
                onSubmit={(event) => void confirmRecoverySet(event)}
              >
                <AccountField
                  autoComplete="one-time-code"
                  id="account-recovery-confirm"
                  label={_(COPY.recoveryConfirmHelp)}
                  name="code"
                />
                <Button disabled={Boolean(busy)} type="submit">
                  {buttonContent(busy === 'recovery:confirm', _(COPY.recoveryConfirm))}
                </Button>
              </form>
            </div>
          ) : (
            <form
              className="grid gap-3"
              noValidate
              onSubmit={(event) => void createRecoverySet(event)}
            >
              <AccountField
                autoComplete="current-password"
                id="account-recovery-password"
                label={_(COPY.currentPassword)}
                name="currentPassword"
                type="password"
              />
              <Button disabled={Boolean(busy)} type="submit">
                {buttonContent(busy === 'recovery:generate', _(COPY.recoveryGenerate))}
              </Button>
            </form>
          )}
          {recoveryStatus ? (
            <Button
              className="mt-3"
              disabled={Boolean(busy)}
              onClick={() => void removeRecoverySet()}
              type="button"
              variant="outline"
            >
              {buttonContent(busy === 'recovery:revoke', _(COPY.recoveryRevoke))}
            </Button>
          ) : null}
        </SecurityCard>
      </div>

      <SecurityCard
        icon={MonitorSmartphone}
        title={_(COPY.sessions)}
        description={_(COPY.sessionsHelp)}
      >
        <ul className="grid gap-2">
          {sessions.map((item) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              key={item.id}
            >
              <span>
                <span className="block text-sm font-semibold">{item.deviceLabel}</span>
                <span className="block text-xs text-muted-foreground">
                  {item.current ? `${_(COPY.current)} · ` : ''}
                  {item.durationPolicy} ·{' '}
                  {new Intl.DateTimeFormat(i18n.locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(item.lastSeenAt))}
                </span>
              </span>
              <Button
                disabled={Boolean(busy)}
                onClick={() => void revokeSession(item.id, item.current)}
                size="sm"
                type="button"
                variant="outline"
              >
                {buttonContent(busy === `session:${item.id}`, _(COPY.revoke))}
              </Button>
            </li>
          ))}
        </ul>
        <Button
          className="mt-4"
          disabled={Boolean(busy)}
          onClick={() => void revokeEverySession()}
          type="button"
          variant="outline"
        >
          <LogOut aria-hidden="true" />
          {buttonContent(busy === 'sessions:all', _(COPY.signOutEverywhere))}
        </Button>
      </SecurityCard>

      <SecurityCard icon={Download} title={_(COPY.data)} description={_(COPY.dataHelp)}>
        <Button
          disabled={Boolean(busy)}
          onClick={() => void downloadExport()}
          type="button"
          variant="outline"
        >
          <Download aria-hidden="true" />
          {buttonContent(busy === 'export', _(COPY.export))}
        </Button>
      </SecurityCard>

      <Card className="border-[var(--danger-border)]">
        <CardHeader>
          <div className="flex items-center gap-2 text-[var(--danger-fg)]">
            <Trash2 aria-hidden="true" className="size-5" />
            <CardTitle>{_(COPY.danger)}</CardTitle>
          </div>
          <CardDescription>{_(COPY.dangerHelp)}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:max-w-md"
            noValidate
            onSubmit={(event) => void scheduleDeletion(event)}
          >
            <AccountField
              autoComplete="current-password"
              id="account-delete-password"
              label={_(COPY.currentPassword)}
              name="currentPassword"
              type="password"
            />
            <AccountField
              autoComplete="off"
              id="account-delete-confirmation"
              label={_(COPY.deleteConfirmation)}
              name="confirmation"
            />
            <Button disabled={Boolean(busy)} type="submit" variant="destructive">
              {buttonContent(busy === 'delete', _(COPY.delete))}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-5 text-primary" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function AccountField({
  id,
  label,
  name,
  type = 'text',
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  placeholder?: string;
}): React.ReactElement {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        autoComplete={autoComplete}
        id={id}
        name={name}
        placeholder={placeholder}
        type={type}
      />
    </div>
  );
}

function ProofState({
  complete,
  completeText,
  waitingText,
}: {
  complete: boolean;
  completeText: string;
  waitingText: string;
}): React.ReactElement {
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <CheckCircle2
        aria-hidden="true"
        className={complete ? 'size-4 text-[var(--success-fg)]' : 'size-4'}
      />
      {complete ? completeText : waitingText}
    </p>
  );
}

function formValues<const T extends readonly string[]>(
  form: HTMLFormElement,
  fields: T,
): { [K in T[number]]: string } | null {
  const data = new FormData(form);
  const entries = fields.map(
    (field) =>
      [field, typeof data.get(field) === 'string' ? String(data.get(field)).trim() : ''] as const,
  );
  if (entries.some(([, value]) => !value)) return null;
  return Object.fromEntries(entries) as { [K in T[number]]: string };
}

function accountBannerKind(error: string, reauthenticate: boolean): 'error' | 'warning' | 'success' {
  if (reauthenticate) return 'warning';
  if (error) return 'error';
  return 'success';
}

function validationFailure(
  message: string,
  setError: (value: string) => void,
  setBusy: (value: string) => void,
): void {
  setError(message);
  setBusy('');
}

function buttonContent(loading: boolean, label: string): React.ReactNode {
  return loading ? (
    <>
      <LoaderCircle aria-hidden="true" className="animate-spin" />
      {label}
    </>
  ) : (
    label
  );
}

function leaveForSignIn(router: ReturnType<typeof useRouter>): void {
  router.replace('/sign-in');
  router.refresh();
}

function methodLabel(kind: 'password' | 'passkey' | 'oidc' | 'saml') {
  if (kind === 'password') return COPY.passwordMethod;
  if (kind === 'passkey') return COPY.passkeyMethod;
  if (kind === 'oidc') return COPY.oidcMethod;
  return COPY.samlMethod;
}
