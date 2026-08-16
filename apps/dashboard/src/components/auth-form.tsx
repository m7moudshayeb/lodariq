'use client';

import Link from 'next/link';
import { ArrowRight, Fingerprint, LoaderCircle } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';
import { useLingui } from '@lingui/react';
import { useAuthMutations } from '../hooks/use-auth-mutations';
import type { AuthSessionSnapshot, EmailVerificationRequiredResponse } from '../lib/auth-contract';
import {
  authenticateWithPasskey,
  beginEnterpriseOidcAuthentication,
  beginOidcAuthentication,
  ClientAuthError,
} from '../lib/client-auth-api';
import { authErrorMessageDescriptor } from '../i18n/error-messages';
import { AUTH_FORM_MESSAGES } from '../i18n/messages';
import {
  AUTH_FIELD_DEFINITIONS,
  focusFirstInvalidAuthField,
  hasAuthFieldErrors,
  validateAuthForm,
  withoutAuthFieldError,
  type AuthFieldErrors,
  type AuthFieldName,
} from '../lib/auth-form-validation';
import { EmailVerificationPanel } from './email-verification-panel';
import { AuthField, AuthFormFeedback } from './auth-form-controls';
import { Button } from './ui/button';

const SIGN_IN_FIELDS = ['identifier', 'password'] as const satisfies readonly AuthFieldName[];
const OIDC_PROVIDERS = ['google', 'microsoft'] as const;
const OIDC_PROVIDER_LABEL = {
  google: AUTH_FORM_MESSAGES.google,
  microsoft: AUTH_FORM_MESSAGES.microsoft,
} as const;
const SIGN_UP_FIELDS = [
  'name',
  'email',
  'workspaceName',
] as const satisfies readonly AuthFieldName[];

interface AuthFormProps {
  mode: 'sign-in' | 'sign-up';
  returnTo?: string;
  embedded?: boolean;
  showSignUpLink?: boolean;
  showPasswordRecoveryLink?: boolean;
  onAuthenticated?: (session: AuthSessionSnapshot) => void | Promise<void>;
}

export function AuthForm({
  mode,
  returnTo = '/',
  embedded = false,
  showSignUpLink = true,
  showPasswordRecoveryLink = true,
  onAuthenticated,
}: AuthFormProps): React.ReactElement {
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [pendingAction, setPendingAction] = useState<
    'form' | 'passkey' | 'oidc-google' | 'oidc-microsoft' | 'enterprise-oidc' | null
  >(null);
  const pending = pendingAction !== null;
  const [verification, setVerification] = useState<{
    email: string;
    response: EmailVerificationRequiredResponse;
  } | null>(null);
  const signUpMode = mode === 'sign-up';
  const auth = useAuthMutations();
  const { _ } = useLingui();

  async function completeAuthentication(session: AuthSessionSnapshot): Promise<void> {
    if (onAuthenticated) {
      await onAuthenticated(session);
      return;
    }
    window.location.replace(returnTo);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const fields = signUpMode ? SIGN_UP_FIELDS : SIGN_IN_FIELDS;
    const validation = validateAuthForm(event.currentTarget, fields);
    if (hasAuthFieldErrors(validation.errors)) {
      setError('');
      setFieldErrors(validation.errors);
      focusFirstInvalidAuthField(event.currentTarget, fields, validation.errors);
      return;
    }
    setError('');
    setFieldErrors({});
    setPendingAction('form');

    try {
      if (signUpMode) {
        const email = validation.values.email;
        const response = await auth.signUp.mutateAsync({
          email,
          name: validation.values.name,
          workspaceName: validation.values.workspaceName,
        });
        setVerification({ email, response });
        return;
      }

      const session = await auth.signIn.mutateAsync({
        identifier: validation.values.identifier,
        password: validation.values.password,
        rememberMe: isRememberMeSelected(event.currentTarget),
      });
      await completeAuthentication(session);
    } catch (caught) {
      setError(
        caught instanceof ClientAuthError
          ? _(authErrorMessageDescriptor(caught.code, caught.statusCode))
          : _(AUTH_FORM_MESSAGES.pleaseTryAgain),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function passkeySignIn(form: HTMLFormElement | null): Promise<void> {
    if (pending || !form) return;
    setError('');
    setFieldErrors({});
    setPendingAction('passkey');
    try {
      const session = await authenticateWithPasskey('sign_in', isRememberMeSelected(form));
      await completeAuthentication(session);
    } catch (caught) {
      setError(
        caught instanceof ClientAuthError
          ? _(authErrorMessageDescriptor(caught.code, caught.statusCode))
          : _(AUTH_FORM_MESSAGES.pleaseTryAgain),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function oidc(
    provider: 'google' | 'microsoft',
    form: HTMLFormElement | null,
  ): Promise<void> {
    if (pending || !form) return;
    const workspace = signUpMode ? validateAuthForm(form, ['workspaceName']) : null;
    if (workspace && hasAuthFieldErrors(workspace.errors)) {
      setError('');
      setFieldErrors(workspace.errors);
      focusFirstInvalidAuthField(form, ['workspaceName'], workspace.errors);
      return;
    }
    setError('');
    setFieldErrors({});
    setPendingAction(`oidc-${provider}`);
    try {
      const authorizationUrl = await beginOidcAuthentication({
        provider,
        action: signUpMode ? 'sign_up' : 'sign_in',
        returnTo,
        ...(workspace ? { workspaceName: workspace.values.workspaceName } : {}),
        rememberMe: isRememberMeSelected(form),
      });
      window.location.assign(authorizationUrl);
    } catch (caught) {
      setError(
        caught instanceof ClientAuthError
          ? _(authErrorMessageDescriptor(caught.code, caught.statusCode))
          : _(AUTH_FORM_MESSAGES.pleaseTryAgain),
      );
      setPendingAction(null);
    }
  }

  async function enterpriseOidc(form: HTMLFormElement | null): Promise<void> {
    if (pending || !form || signUpMode) return;
    const validation = validateAuthForm(form, ['identifier']);
    const identifier = validation.values.identifier;
    const emailPattern = AUTH_FIELD_DEFINITIONS.email.pattern ?? '';
    const looksLikeEmail = emailPattern !== '' && new RegExp(emailPattern, 'u').test(identifier);
    let errors: AuthFieldErrors = validation.errors;
    if (!hasAuthFieldErrors(errors) && !looksLikeEmail) {
      errors = { identifier: { code: 'invalid_format', field: 'email' } };
    }
    if (hasAuthFieldErrors(errors)) {
      setError('');
      setFieldErrors(errors);
      focusFirstInvalidAuthField(form, ['identifier'], errors);
      return;
    }
    setError('');
    setFieldErrors({});
    setPendingAction('enterprise-oidc');
    try {
      const authorizationUrl = await beginEnterpriseOidcAuthentication({
        email: identifier,
        returnTo,
      });
      window.location.assign(authorizationUrl);
    } catch (caught) {
      setError(
        caught instanceof ClientAuthError && caught.code === 'enterprise_sso_unavailable'
          ? _(AUTH_FORM_MESSAGES.enterpriseSsoUnavailable)
          : caught instanceof ClientAuthError
            ? _(authErrorMessageDescriptor(caught.code, caught.statusCode))
            : _(AUTH_FORM_MESSAGES.pleaseTryAgain),
      );
      setPendingAction(null);
    }
  }

  if (verification) {
    return (
      <EmailVerificationPanel
        challengeId={
          'challengeId' in verification.response ? verification.response.challengeId : undefined
        }
        developmentToken={
          'verificationToken' in verification.response
            ? verification.response.verificationToken
            : undefined
        }
        email={verification.email}
        expiresAt={
          'expiresAt' in verification.response ? verification.response.expiresAt : undefined
        }
        onRestart={() => setVerification(null)}
        onVerified={completeAuthentication}
      />
    );
  }

  return (
    <form
      className="grid gap-5"
      noValidate
      onInput={(event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
          setFieldErrors((current) => withoutAuthFieldError(current, target.name));
        }
      }}
      onSubmit={(event) => void submit(event)}
    >
      {signUpMode ? (
        <AuthField
          disabled={pending}
          error={fieldErrors.name}
          id={embedded ? 'activation-name' : 'name'}
          name="name"
          placeholder="Alex Morgan"
        />
      ) : null}

      {signUpMode ? (
        <AuthField
          disabled={pending}
          error={fieldErrors.email}
          id={embedded ? 'activation-email' : 'email'}
          name="email"
          placeholder="you@company.com"
        />
      ) : (
        <AuthField
          disabled={pending}
          error={fieldErrors.identifier}
          id={embedded ? 'activation-identifier' : 'identifier'}
          name="identifier"
          placeholder="you@company.com"
        />
      )}

      {!signUpMode ? (
        <AuthField
          disabled={pending}
          error={fieldErrors.password}
          id={embedded ? 'activation-password' : 'password'}
          labelAction={
            showPasswordRecoveryLink ? (
              <Link
                className="text-xs font-semibold text-primary hover:underline"
                href={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`}
              >
                {_(AUTH_FORM_MESSAGES.setOrResetPassword)}
              </Link>
            ) : null
          }
          name="password"
        />
      ) : null}

      {!signUpMode ? (
        <label className="flex items-start gap-3 text-sm text-foreground">
          <input
            className="mt-0.5 size-4 rounded border-border accent-primary"
            disabled={pending}
            name="rememberMe"
            type="checkbox"
          />
          <span>
            <span className="block font-semibold">{_(AUTH_FORM_MESSAGES.rememberMe)}</span>
            <span className="block text-xs leading-5 text-muted-foreground">
              {_(AUTH_FORM_MESSAGES.rememberMeHelp)}
            </span>
          </span>
        </label>
      ) : null}

      {!signUpMode && showPasswordRecoveryLink ? (
        <Link className="w-fit text-xs font-semibold text-primary hover:underline" href="/forgot-username">
          {_(AUTH_FORM_MESSAGES.forgotUsername)}
        </Link>
      ) : null}

      {signUpMode ? (
        <AuthField
          disabled={pending}
          error={fieldErrors.workspaceName}
          help={_(AUTH_FORM_MESSAGES.workspaceHelp)}
          id="workspaceName"
          name="workspaceName"
          placeholder="Acme Product"
        />
      ) : null}

      <AuthFormFeedback fieldErrors={fieldErrors} formError={error} />
      <span aria-live="polite" className="sr-only" role="status">
        {pendingAction?.startsWith('oidc-')
          ? _(AUTH_FORM_MESSAGES.providerWaiting)
          : pendingAction === 'passkey'
          ? _(AUTH_FORM_MESSAGES.passkeyWaiting)
          : pending
          ? _(signUpMode ? AUTH_FORM_MESSAGES.creatingAccount : AUTH_FORM_MESSAGES.signingIn)
          : ''}
      </span>

      <Button className="h-11 w-full" disabled={pending} type="submit">
        {pendingAction === 'form' ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
        )}
        {signUpMode ? _(AUTH_FORM_MESSAGES.createAccount) : _(AUTH_FORM_MESSAGES.continue)}
      </Button>

      <div className="grid grid-cols-2 gap-3">
        {OIDC_PROVIDERS.map((provider) => (
          <Button
            aria-label={_(OIDC_PROVIDER_LABEL[provider])}
            className="h-11 w-full [&_svg]:size-5"
            disabled={pending}
            key={provider}
            onClick={(event) => void oidc(provider, event.currentTarget.form)}
            type="button"
            variant="outline"
          >
            {pendingAction === `oidc-${provider}` ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <ProviderMark provider={provider} />
            )}
          </Button>
        ))}
      </div>

      {!signUpMode ? (
        <div className="grid grid-cols-2 gap-3">
          <Button
            className="h-11 w-full"
            disabled={pending}
            onClick={(event) => void enterpriseOidc(event.currentTarget.form)}
            type="button"
            variant="outline"
          >
            {pendingAction === 'enterprise-oidc' ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : null}
            {_(AUTH_FORM_MESSAGES.enterpriseSso)}
          </Button>
          <Button
            className="h-11 w-full"
            disabled={pending}
            onClick={(event) => void passkeySignIn(event.currentTarget.form)}
            type="button"
            variant="outline"
          >
            {pendingAction === 'passkey' ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Fingerprint aria-hidden="true" />
            )}
            {_(
              pendingAction === 'passkey'
                ? AUTH_FORM_MESSAGES.passkeyWaiting
                : AUTH_FORM_MESSAGES.passkey,
            )}
          </Button>
        </div>
      ) : null}

      {!signUpMode ? (
        <Link
          className="text-center text-xs font-semibold text-primary hover:underline"
          href={`/recovery-code?returnTo=${encodeURIComponent(returnTo)}`}
        >
          {_(AUTH_FORM_MESSAGES.recoveryCode)}
        </Link>
      ) : null}

      {!embedded && (signUpMode || showSignUpLink) ? (
        <p className="text-center text-sm text-muted-foreground">
          {signUpMode ? _(AUTH_FORM_MESSAGES.existingAccount) : _(AUTH_FORM_MESSAGES.newToLodariq)}{' '}
          <Link
            className="font-semibold text-primary hover:underline"
            href={`${signUpMode ? '/sign-in' : '/sign-up'}?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {signUpMode ? _(AUTH_FORM_MESSAGES.signIn) : _(AUTH_FORM_MESSAGES.createAnAccount)}
          </Link>
        </p>
      ) : null}
    </form>
  );
}

function isRememberMeSelected(form: HTMLFormElement): boolean {
  const control = form.elements.namedItem('rememberMe');
  return control instanceof HTMLInputElement && control.checked;
}

function ProviderMark({ provider }: { provider: (typeof OIDC_PROVIDERS)[number] }): ReactElement {
  if (provider === 'google') return <GoogleMark />;
  return <MicrosoftMark />;
}

function GoogleMark(): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function MicrosoftMark(): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M1 1h10v10H1z" fill="#F25022" />
      <path d="M13 1h10v10H13z" fill="#7FBA00" />
      <path d="M1 13h10v10H1z" fill="#00A4EF" />
      <path d="M13 13h10v10H13z" fill="#FFB900" />
    </svg>
  );
}
