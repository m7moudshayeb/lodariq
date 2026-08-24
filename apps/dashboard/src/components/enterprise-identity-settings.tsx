'use client';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import type {
  AuthAssuranceLevel,
  ControlPlaneRole,
  EnterpriseIdentityProvider,
  EnterpriseManagedRole,
  EnterpriseProvisioningMode,
  EnterpriseSsoConnection,
  EnterpriseWorkspaceConfiguration,
} from '@lodariq/schema';
import { Building2, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import {
  approveEnterpriseBreakGlassRequest,
  createEnterpriseBreakGlassRequest,
  createEnterpriseDomain,
  createEnterpriseScimToken,
  createEnterpriseSsoConnection,
  disableEnterpriseScimToken,
  disableEnterpriseSsoConnection,
  getEnterpriseConfiguration,
  updateEnterpriseAuthPolicy,
  upsertEnterpriseGroupRoleMapping,
  verifyEnterpriseDomain,
} from '../lib/client-tenant-api';
import { ClientAuthError } from '../lib/client-auth-api';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { StatusBanner } from './ui/status-banner';
import { statusToast } from './ui/toaster';

const COPY = {
  title: msg({ id: 'enterpriseIdentity.title', message: 'Enterprise identity' }),
  description: msg({
    id: 'enterpriseIdentity.description',
    message:
      'Configure company SSO, verified domains, managed roles, and SCIM without linking accounts by email.',
  }),
  loading: msg({ id: 'enterpriseIdentity.loading', message: 'Loading enterprise identity…' }),
  unavailable: msg({
    id: 'enterpriseIdentity.unavailable',
    message: 'Enterprise identity settings could not be loaded.',
  }),
  saved: msg({ id: 'enterpriseIdentity.saved', message: 'Enterprise identity setting saved.' }),
  mutationFailed: msg({
    id: 'enterpriseIdentity.mutationFailed',
    message: 'The enterprise identity change could not be completed.',
  }),
  reauthenticate: msg({
    id: 'enterpriseIdentity.reauthenticate',
    message:
      'Sign in again with a passkey or equivalent strong method before changing this setting.',
  }),
  ownerOnly: msg({
    id: 'enterpriseIdentity.ownerOnly',
    message: 'Only a workspace owner can change enterprise identity settings.',
  }),
  connections: msg({ id: 'enterpriseIdentity.connections', message: 'SSO connections' }),
  connectionsHelp: msg({
    id: 'enterpriseIdentity.connectionsHelp',
    message:
      'New connections remain unavailable until Lodariq records a successful real-tenant validation.',
  }),
  noConnections: msg({
    id: 'enterpriseIdentity.noConnections',
    message: 'No enterprise SSO connection has been configured.',
  }),
  provider: msg({ id: 'enterpriseIdentity.provider', message: 'Identity provider' }),
  okta: msg({ id: 'enterpriseIdentity.provider.okta', message: 'Okta' }),
  entra: msg({ id: 'enterpriseIdentity.provider.entra', message: 'Microsoft Entra ID' }),
  issuer: msg({ id: 'enterpriseIdentity.issuer', message: 'Issuer URL' }),
  clientId: msg({ id: 'enterpriseIdentity.clientId', message: 'OIDC client ID' }),
  provisioning: msg({ id: 'enterpriseIdentity.provisioning', message: 'Provisioning mode' }),
  invitationOnly: msg({
    id: 'enterpriseIdentity.provisioning.invitationOnly',
    message: 'Invitation only',
  }),
  jit: msg({ id: 'enterpriseIdentity.provisioning.jit', message: 'Verified-domain JIT' }),
  addConnection: msg({ id: 'enterpriseIdentity.addConnection', message: 'Add OIDC connection' }),
  disableConnection: msg({
    id: 'enterpriseIdentity.disableConnection',
    message: 'Disable connection',
  }),
  disableConnectionConfirm: msg({
    id: 'enterpriseIdentity.disableConnectionConfirm',
    message:
      'Disable this SSO connection and revoke its sessions, authoring grants, domains, and SCIM tokens?',
  }),
  statusDraft: msg({ id: 'enterpriseIdentity.status.draft', message: 'Draft' }),
  statusValidation: msg({
    id: 'enterpriseIdentity.status.validationRequired',
    message: 'Validation required',
  }),
  statusActive: msg({ id: 'enterpriseIdentity.status.active', message: 'Active' }),
  statusDisabled: msg({ id: 'enterpriseIdentity.status.disabled', message: 'Disabled' }),
  statusPending: msg({ id: 'enterpriseIdentity.status.pending', message: 'Pending' }),
  statusVerified: msg({ id: 'enterpriseIdentity.status.verified', message: 'Verified' }),
  policy: msg({ id: 'enterpriseIdentity.policy', message: 'Workspace authentication policy' }),
  policyHelp: msg({
    id: 'enterpriseIdentity.policyHelp',
    message:
      'Policy is checked at workspace selection and on every control-plane and authoring authorization decision.',
  }),
  requireSso: msg({ id: 'enterpriseIdentity.requireSso', message: 'Require enterprise SSO' }),
  allowPassword: msg({
    id: 'enterpriseIdentity.allowPassword',
    message: 'Allow password sessions',
  }),
  minimumAssurance: msg({
    id: 'enterpriseIdentity.minimumAssurance',
    message: 'Minimum assurance',
  }),
  assuranceAal1: msg({ id: 'enterpriseIdentity.assurance.aal1', message: 'AAL1 · standard' }),
  assuranceAal2: msg({ id: 'enterpriseIdentity.assurance.aal2', message: 'AAL2 · multi-factor' }),
  breakGlassId: msg({
    id: 'enterpriseIdentity.breakGlassId',
    message: 'Approved break-glass request ID (only when required)',
  }),
  savePolicy: msg({ id: 'enterpriseIdentity.savePolicy', message: 'Save authentication policy' }),
  invalidPolicy: msg({
    id: 'enterpriseIdentity.invalidPolicy',
    message: 'Password cannot be disabled unless enterprise SSO is required.',
  }),
  domains: msg({ id: 'enterpriseIdentity.domains', message: 'Verified company domains' }),
  domainsHelp: msg({
    id: 'enterpriseIdentity.domainsHelp',
    message:
      'Discovery uses verified DNS ownership only. A matching email never links an existing Lodariq account.',
  }),
  connection: msg({ id: 'enterpriseIdentity.connection', message: 'SSO connection' }),
  domain: msg({ id: 'enterpriseIdentity.domain', message: 'Company domain' }),
  startVerification: msg({
    id: 'enterpriseIdentity.startVerification',
    message: 'Create DNS challenge',
  }),
  dnsChallenge: msg({
    id: 'enterpriseIdentity.dnsChallenge',
    message: 'Add this TXT record now. Its value is shown only in this browser session.',
  }),
  recordName: msg({ id: 'enterpriseIdentity.recordName', message: 'TXT record name' }),
  recordValue: msg({ id: 'enterpriseIdentity.recordValue', message: 'TXT record value' }),
  verifyDomain: msg({ id: 'enterpriseIdentity.verifyDomain', message: 'Verify DNS record' }),
  noDomains: msg({
    id: 'enterpriseIdentity.noDomains',
    message: 'No company domain is configured.',
  }),
  mappings: msg({ id: 'enterpriseIdentity.mappings', message: 'IdP group role mapping' }),
  mappingsHelp: msg({
    id: 'enterpriseIdentity.mappingsHelp',
    message: 'Groups can grant viewer, member, or admin. Identity providers can never grant owner.',
  }),
  groupId: msg({ id: 'enterpriseIdentity.groupId', message: 'Provider group ID' }),
  managedRole: msg({ id: 'enterpriseIdentity.managedRole', message: 'Managed role' }),
  roleViewer: msg({ id: 'enterpriseIdentity.role.viewer', message: 'Viewer' }),
  roleMember: msg({ id: 'enterpriseIdentity.role.member', message: 'Member' }),
  roleAdmin: msg({ id: 'enterpriseIdentity.role.admin', message: 'Admin' }),
  saveMapping: msg({ id: 'enterpriseIdentity.saveMapping', message: 'Save group mapping' }),
  scim: msg({ id: 'enterpriseIdentity.scim', message: 'SCIM provisioning' }),
  scimHelp: msg({
    id: 'enterpriseIdentity.scimHelp',
    message:
      'Tokens are shown once. Deprovisioning removes membership and immediately revokes sessions and authoring grants.',
  }),
  createScimToken: msg({ id: 'enterpriseIdentity.createScimToken', message: 'Create SCIM token' }),
  disableScimToken: msg({
    id: 'enterpriseIdentity.disableScimToken',
    message: 'Disable token',
  }),
  disableScimTokenConfirm: msg({
    id: 'enterpriseIdentity.disableScimTokenConfirm',
    message: 'Disable this SCIM token? Provisioning requests using it will stop immediately.',
  }),
  scimToken: msg({
    id: 'enterpriseIdentity.scimToken',
    message: 'Copy this token now. Lodariq will not display it again.',
  }),
  noScimTokens: msg({
    id: 'enterpriseIdentity.noScimTokens',
    message: 'No SCIM token has been issued.',
  }),
  breakGlass: msg({ id: 'enterpriseIdentity.breakGlass', message: 'Break-glass recovery' }),
  breakGlassHelp: msg({
    id: 'enterpriseIdentity.breakGlassHelp',
    message:
      'A strong non-password session, a second workspace owner, and a short-lived single-use request are required.',
  }),
  reason: msg({ id: 'enterpriseIdentity.reason', message: 'Operational incident reason' }),
  requestBreakGlass: msg({
    id: 'enterpriseIdentity.requestBreakGlass',
    message: 'Request break-glass approval',
  }),
  requestCreated: msg({
    id: 'enterpriseIdentity.requestCreated',
    message:
      'Request {requestId} expires at {expiresAt}. Give the ID to a different workspace owner.',
  }),
  approvalRequestId: msg({
    id: 'enterpriseIdentity.approvalRequestId',
    message: 'Request ID from another owner',
  }),
  approveBreakGlass: msg({
    id: 'enterpriseIdentity.approveBreakGlass',
    message: 'Approve break-glass request',
  }),
  requestApproved: msg({
    id: 'enterpriseIdentity.requestApproved',
    message: 'Break-glass request approved. It remains short-lived and single-use.',
  }),
  requiredFields: msg({
    id: 'enterpriseIdentity.requiredFields',
    message: 'Complete every required field with a valid value.',
  }),
  active: msg({ id: 'enterpriseIdentity.active', message: 'Active' }),
} as const;

type EnterpriseIdentityTab =
  'connections' | 'policy' | 'domains' | 'mappings' | 'scim' | 'break-glass';

const ENTERPRISE_IDENTITY_TABS: ReadonlyArray<{
  id: EnterpriseIdentityTab;
  label: (typeof COPY)[keyof typeof COPY];
}> = [
  { id: 'connections', label: COPY.connections },
  { id: 'policy', label: COPY.policy },
  { id: 'domains', label: COPY.domains },
  { id: 'mappings', label: COPY.mappings },
  { id: 'scim', label: COPY.scim },
  { id: 'break-glass', label: COPY.breakGlass },
];

const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;

interface EnterpriseIdentitySettingsProps {
  currentRole: ControlPlaneRole;
  workspaceId: string;
}

interface DomainChallenge {
  id: string;
  recordName: string;
  recordValue: string;
}

export function EnterpriseIdentitySettings({
  currentRole,
  workspaceId,
}: EnterpriseIdentitySettingsProps): React.ReactElement {
  const { _, i18n } = useLingui();
  const [configuration, setConfiguration] = React.useState<EnterpriseWorkspaceConfiguration | null>(
    null,
  );
  const [busy, setBusy] = React.useState('load');
  const [error, setError] = React.useState('');
  const [provider, setProvider] = React.useState<EnterpriseIdentityProvider>('okta');
  const [issuer, setIssuer] = React.useState('');
  const [clientId, setClientId] = React.useState('');
  const [provisioningMode, setProvisioningMode] =
    React.useState<EnterpriseProvisioningMode>('invitation_only');
  const [selectedConnectionId, setSelectedConnectionId] = React.useState('');
  const [domain, setDomain] = React.useState('');
  const [domainChallenge, setDomainChallenge] = React.useState<DomainChallenge | null>(null);
  const [groupId, setGroupId] = React.useState('');
  const [managedRole, setManagedRole] = React.useState<EnterpriseManagedRole>('viewer');
  const [scimToken, setScimToken] = React.useState('');
  const [ssoRequired, setSsoRequired] = React.useState(false);
  const [passwordAllowed, setPasswordAllowed] = React.useState(true);
  const [minimumAssurance, setMinimumAssurance] = React.useState<AuthAssuranceLevel>('aal1');
  const [breakGlassId, setBreakGlassId] = React.useState('');
  const [breakGlassReason, setBreakGlassReason] = React.useState('');
  const [approvalRequestId, setApprovalRequestId] = React.useState('');
  const [createdBreakGlass, setCreatedBreakGlass] = React.useState<{
    id: string;
    expiresAt: string;
  } | null>(null);
  const [activeTab, setActiveTab] = React.useState<EnterpriseIdentityTab>('connections');
  const tabRefs = React.useRef<Partial<Record<EnterpriseIdentityTab, HTMLButtonElement | null>>>(
    {},
  );
  const canEdit = currentRole === 'owner';

  const refresh = React.useCallback(async (): Promise<void> => {
    try {
      const next = await getEnterpriseConfiguration(workspaceId);
      setConfiguration(next);
      setSsoRequired(next.policy.ssoRequired);
      setPasswordAllowed(next.policy.passwordAllowed);
      setMinimumAssurance(next.policy.minimumAssurance);
      setSelectedConnectionId((current) => current || next.connections[0]?.id || '');
      setError('');
    } catch {
      setError(_(COPY.unavailable));
    } finally {
      setBusy('');
    }
  }, [_, workspaceId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runMutation(key: string, mutation: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(key);
    try {
      await mutation();
      await refresh();
      statusToast('success', _(COPY.saved));
    } catch (caught) {
      if (
        caught instanceof ClientAuthError &&
        (caught.code === 'recent_authentication_required' ||
          caught.code === 'minimum_assurance_required')
      ) {
        statusToast('warning', _(COPY.reauthenticate));
      } else {
        statusToast('error', _(COPY.mutationFailed));
      }
    } finally {
      setBusy('');
    }
  }

  async function submitConnection(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!validHttpsUrl(issuer) || !clientId.trim()) {
      statusToast('error', _(COPY.requiredFields));
      return;
    }
    await runMutation('connection', async () => {
      const created = await createEnterpriseSsoConnection(workspaceId, {
        provider,
        protocol: 'oidc',
        issuer: issuer.trim(),
        clientId: clientId.trim(),
        provisioningMode,
      });
      setIssuer('');
      setClientId('');
      setSelectedConnectionId(created.id);
    });
  }

  async function submitDomain(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalized = domain.trim().toLowerCase();
    if (!selectedConnectionId || !DOMAIN_PATTERN.test(normalized)) {
      statusToast('error', _(COPY.requiredFields));
      return;
    }
    await runMutation('domain', async () => {
      const created = await createEnterpriseDomain(workspaceId, selectedConnectionId, normalized);
      if (!created.verificationRecordValue) throw new Error('Missing one-time DNS proof');
      setDomainChallenge({
        id: created.id,
        recordName: created.verificationRecordName,
        recordValue: created.verificationRecordValue,
      });
      setDomain('');
    });
  }

  async function submitMapping(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedConnectionId || !groupId.trim()) {
      statusToast('error', _(COPY.requiredFields));
      return;
    }
    await runMutation('mapping', async () => {
      await upsertEnterpriseGroupRoleMapping(
        workspaceId,
        selectedConnectionId,
        groupId.trim(),
        managedRole,
      );
      setGroupId('');
    });
  }

  if (busy === 'load' && !configuration) {
    return (
      <p aria-live="polite" className="mt-5 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="me-2 inline size-4 animate-spin" />
        {_(COPY.loading)}
      </p>
    );
  }

  if (!configuration) {
    return <Feedback kind="error" message={error || _(COPY.unavailable)} />;
  }

  const disabled = Boolean(busy) || !canEdit;

  function selectTab(tab: EnterpriseIdentityTab, focus = false): void {
    setActiveTab(tab);
    if (focus) {
      window.requestAnimationFrame(() => tabRefs.current[tab]?.focus());
    }
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number): void {
    const lastIndex = ENTERPRISE_IDENTITY_TABS.length - 1;
    let nextIndex = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      nextIndex = index === lastIndex ? 0 : index + 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      nextIndex = index === 0 ? lastIndex : index - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = lastIndex;
    if (nextIndex === index) return;
    event.preventDefault();
    const nextTab = ENTERPRISE_IDENTITY_TABS[nextIndex];
    if (!nextTab) return;
    selectTab(nextTab.id, true);
  }

  return (
    <section aria-labelledby="enterprise-identity-title" className="mt-5 grid gap-5">
      <div>
        <div className="flex items-center gap-2">
          <Building2 aria-hidden="true" className="size-5" />
          <h2 className="text-lg font-semibold" id="enterprise-identity-title">
            {_(COPY.title)}
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{_(COPY.description)}</p>
      </div>
      {!canEdit ? <Feedback kind="neutral" message={_(COPY.ownerOnly)} /> : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm shadow-black/[0.04]">
        <div className="overflow-x-auto border-b border-border bg-[var(--surface-subtle)] px-2 sm:px-3">
          <div aria-label={_(COPY.title)} className="flex min-w-max gap-1" role="tablist">
            {ENTERPRISE_IDENTITY_TABS.map((tab, index) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  aria-controls={`enterprise-identity-panel-${tab.id}`}
                  aria-selected={selected}
                  className={cn(
                    'relative min-h-10 whitespace-nowrap px-2.5 text-[13px] font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 sm:px-3',
                    'after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent sm:after:inset-x-3',
                    selected && 'text-primary after:bg-primary',
                  )}
                  id={`enterprise-identity-tab-${tab.id}`}
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  ref={(element) => {
                    tabRefs.current[tab.id] = element;
                  }}
                  role="tab"
                  tabIndex={selected ? 0 : -1}
                  type="button"
                >
                  {_(tab.label)}
                </button>
              );
            })}
          </div>
        </div>

        <div
          aria-labelledby={`enterprise-identity-tab-${activeTab}`}
          className="p-3 sm:p-5"
          id={`enterprise-identity-panel-${activeTab}`}
          role="tabpanel"
          tabIndex={0}
        >
          {activeTab === 'connections' ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>{_(COPY.connections)}</CardTitle>
                <CardDescription>{_(COPY.connectionsHelp)}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <ConnectionList
                  connections={configuration.connections}
                  disabled={disabled}
                  onDisable={(connectionId) => {
                    if (!globalThis.confirm(_(COPY.disableConnectionConfirm))) return;
                    void runMutation('disable-connection', () =>
                      disableEnterpriseSsoConnection(workspaceId, connectionId),
                    );
                  }}
                />
                <form
                  className="grid gap-3"
                  noValidate
                  onSubmit={(event) => void submitConnection(event)}
                >
                  <FieldLabel label={_(COPY.provider)}>
                    <Select
                      disabled={disabled}
                      onValueChange={(value) => setProvider(value as EnterpriseIdentityProvider)}
                      value={provider}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="okta">{_(COPY.okta)}</SelectItem>
                        <SelectItem value="entra">{_(COPY.entra)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldLabel>
                  <FieldInput
                    disabled={disabled}
                    id="enterprise-issuer"
                    label={_(COPY.issuer)}
                    onChange={setIssuer}
                    type="url"
                    value={issuer}
                  />
                  <FieldInput
                    disabled={disabled}
                    id="enterprise-client-id"
                    label={_(COPY.clientId)}
                    onChange={setClientId}
                    value={clientId}
                  />
                  <FieldLabel label={_(COPY.provisioning)}>
                    <Select
                      disabled={disabled}
                      onValueChange={(value) =>
                        setProvisioningMode(value as EnterpriseProvisioningMode)
                      }
                      value={provisioningMode}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invitation_only">{_(COPY.invitationOnly)}</SelectItem>
                        <SelectItem value="jit">{_(COPY.jit)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldLabel>
                  <ActionButton
                    busy={busy === 'connection'}
                    disabled={disabled}
                    label={_(COPY.addConnection)}
                  />
                </form>
              </CardContent>
            </Card>
          ) : null}

          {activeTab === 'policy' ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>{_(COPY.policy)}</CardTitle>
                <CardDescription>{_(COPY.policyHelp)}</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-4"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!passwordAllowed && !ssoRequired) {
                      statusToast('error', _(COPY.invalidPolicy));
                      return;
                    }
                    void runMutation('policy', () =>
                      updateEnterpriseAuthPolicy(
                        workspaceId,
                        { ssoRequired, minimumAssurance, passwordAllowed },
                        breakGlassId.trim() || undefined,
                      ),
                    );
                  }}
                >
                  <BooleanControl
                    checked={ssoRequired}
                    disabled={disabled}
                    label={_(COPY.requireSso)}
                    onChange={setSsoRequired}
                  />
                  <BooleanControl
                    checked={passwordAllowed}
                    disabled={disabled}
                    label={_(COPY.allowPassword)}
                    onChange={setPasswordAllowed}
                  />
                  <FieldLabel label={_(COPY.minimumAssurance)}>
                    <Select
                      disabled={disabled}
                      onValueChange={(value) => setMinimumAssurance(value as AuthAssuranceLevel)}
                      value={minimumAssurance}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aal1">{_(COPY.assuranceAal1)}</SelectItem>
                        <SelectItem value="aal2">{_(COPY.assuranceAal2)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldLabel>
                  <FieldInput
                    disabled={disabled}
                    id="enterprise-break-glass-id"
                    label={_(COPY.breakGlassId)}
                    onChange={setBreakGlassId}
                    value={breakGlassId}
                  />
                  <ActionButton
                    busy={busy === 'policy'}
                    disabled={disabled}
                    label={_(COPY.savePolicy)}
                  />
                </form>
              </CardContent>
            </Card>
          ) : null}

          {activeTab === 'domains' ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>{_(COPY.domains)}</CardTitle>
                <CardDescription>{_(COPY.domainsHelp)}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {configuration.domains.length ? (
                  configuration.domains.map((entry) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                      key={entry.id}
                    >
                      <span className="truncate text-sm font-medium">{entry.domain}</span>
                      <Badge variant="outline">{statusLabel(_, entry.status)}</Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{_(COPY.noDomains)}</p>
                )}
                <form
                  className="grid gap-3"
                  noValidate
                  onSubmit={(event) => void submitDomain(event)}
                >
                  <ConnectionSelect
                    connections={configuration.connections}
                    disabled={disabled}
                    label={_(COPY.connection)}
                    onChange={setSelectedConnectionId}
                    value={selectedConnectionId}
                  />
                  <FieldInput
                    disabled={disabled}
                    id="enterprise-domain"
                    label={_(COPY.domain)}
                    onChange={setDomain}
                    value={domain}
                  />
                  <ActionButton
                    busy={busy === 'domain'}
                    disabled={disabled}
                    label={_(COPY.startVerification)}
                  />
                </form>
                {domainChallenge ? (
                  <div className="grid gap-3 rounded-lg border border-border bg-muted/35 p-4">
                    <p className="text-sm font-semibold">{_(COPY.dnsChallenge)}</p>
                    <ReadonlyValue label={_(COPY.recordName)} value={domainChallenge.recordName} />
                    <ReadonlyValue
                      label={_(COPY.recordValue)}
                      value={domainChallenge.recordValue}
                    />
                    <Button
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void runMutation('verify-domain', async () => {
                          const rawProof = domainChallenge.recordValue.replace(
                            /^lodariq-domain-verification=/u,
                            '',
                          );
                          await verifyEnterpriseDomain(workspaceId, domainChallenge.id, rawProof);
                          setDomainChallenge(null);
                        })
                      }
                      className="w-fit"
                      type="button"
                      variant="outline"
                    >
                      {busy === 'verify-domain' ? (
                        <LoaderCircle aria-hidden="true" className="animate-spin" />
                      ) : (
                        <ShieldCheck aria-hidden="true" />
                      )}
                      {_(COPY.verifyDomain)}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {activeTab === 'mappings' ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>{_(COPY.mappings)}</CardTitle>
                <CardDescription>{_(COPY.mappingsHelp)}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {configuration.groupRoleMappings.map((mapping) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                    key={mapping.id}
                  >
                    <span className="truncate text-sm font-medium">{mapping.groupId}</span>
                    <Badge variant="outline">{mapping.role}</Badge>
                  </div>
                ))}
                <form
                  className="grid gap-3"
                  noValidate
                  onSubmit={(event) => void submitMapping(event)}
                >
                  <ConnectionSelect
                    connections={configuration.connections}
                    disabled={disabled}
                    label={_(COPY.connection)}
                    onChange={setSelectedConnectionId}
                    value={selectedConnectionId}
                  />
                  <FieldInput
                    disabled={disabled}
                    id="enterprise-group-id"
                    label={_(COPY.groupId)}
                    onChange={setGroupId}
                    value={groupId}
                  />
                  <FieldLabel label={_(COPY.managedRole)}>
                    <Select
                      disabled={disabled}
                      onValueChange={(value) => setManagedRole(value as EnterpriseManagedRole)}
                      value={managedRole}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">{_(COPY.roleViewer)}</SelectItem>
                        <SelectItem value="member">{_(COPY.roleMember)}</SelectItem>
                        <SelectItem value="admin">{_(COPY.roleAdmin)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldLabel>
                  <ActionButton
                    busy={busy === 'mapping'}
                    disabled={disabled}
                    label={_(COPY.saveMapping)}
                  />
                </form>
              </CardContent>
            </Card>
          ) : null}

          {activeTab === 'scim' ? (
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>{_(COPY.scim)}</CardTitle>
                <CardDescription>{_(COPY.scimHelp)}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {configuration.scimConnections.length ? (
                  configuration.scimConnections.map((connection) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                      key={connection.id}
                    >
                      <code className="truncate text-xs">{connection.tokenPrefix}…</code>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {connection.status === 'active' ? _(COPY.active) : _(COPY.statusDisabled)}
                        </Badge>
                        {connection.status === 'active' ? (
                          <Button
                            disabled={disabled}
                            onClick={() => {
                              if (!globalThis.confirm(_(COPY.disableScimTokenConfirm))) return;
                              void runMutation('disable-scim', () =>
                                disableEnterpriseScimToken(workspaceId, connection.id),
                              );
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {_(COPY.disableScimToken)}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{_(COPY.noScimTokens)}</p>
                )}
                <ConnectionSelect
                  connections={configuration.connections}
                  disabled={disabled}
                  label={_(COPY.connection)}
                  onChange={setSelectedConnectionId}
                  value={selectedConnectionId}
                />
                <Button
                  className="w-fit"
                  disabled={disabled || !selectedConnectionId}
                  onClick={() =>
                    void runMutation('scim', async () => {
                      const created = await createEnterpriseScimToken(
                        workspaceId,
                        selectedConnectionId,
                      );
                      setScimToken(created.token);
                    })
                  }
                  type="button"
                >
                  {busy === 'scim' ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <KeyRound aria-hidden="true" />
                  )}
                  {_(COPY.createScimToken)}
                </Button>
                {scimToken ? <ReadonlyValue label={_(COPY.scimToken)} value={scimToken} /> : null}
              </CardContent>
            </Card>
          ) : null}

          {activeTab === 'break-glass' ? (
            <Card className="border-[var(--danger-border)] shadow-none">
              <CardHeader>
                <CardTitle>{_(COPY.breakGlass)}</CardTitle>
                <CardDescription>{_(COPY.breakGlassHelp)}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <form
                  className="grid gap-3"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (breakGlassReason.trim().length < 20) {
                      statusToast('error', _(COPY.requiredFields));
                      return;
                    }
                    void runMutation('break-glass-request', async () => {
                      const created = await createEnterpriseBreakGlassRequest(
                        workspaceId,
                        breakGlassReason.trim(),
                      );
                      setBreakGlassReason('');
                      setCreatedBreakGlass({ id: created.id, expiresAt: created.expiresAt });
                    });
                  }}
                >
                  <FieldInput
                    disabled={disabled}
                    id="enterprise-break-glass-reason"
                    label={_(COPY.reason)}
                    onChange={setBreakGlassReason}
                    value={breakGlassReason}
                  />
                  <ActionButton
                    busy={busy === 'break-glass-request'}
                    disabled={disabled}
                    label={_(COPY.requestBreakGlass)}
                  />
                </form>
                {createdBreakGlass ? (
                  <Feedback
                    kind="success"
                    message={_({
                      ...COPY.requestCreated,
                      values: {
                        requestId: createdBreakGlass.id,
                        expiresAt: new Intl.DateTimeFormat(i18n.locale, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(createdBreakGlass.expiresAt)),
                      },
                    })}
                  />
                ) : null}
                <form
                  className="grid gap-3"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!approvalRequestId.trim()) {
                      statusToast('error', _(COPY.requiredFields));
                      return;
                    }
                    void runMutation('break-glass-approve', async () => {
                      await approveEnterpriseBreakGlassRequest(
                        workspaceId,
                        approvalRequestId.trim(),
                      );
                      setApprovalRequestId('');
                    });
                  }}
                >
                  <FieldInput
                    disabled={disabled}
                    id="enterprise-break-glass-approval"
                    label={_(COPY.approvalRequestId)}
                    onChange={setApprovalRequestId}
                    value={approvalRequestId}
                  />
                  <ActionButton
                    busy={busy === 'break-glass-approve'}
                    disabled={disabled}
                    label={_(COPY.approveBreakGlass)}
                    variant="outline"
                  />
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ConnectionList({
  connections,
  disabled,
  onDisable,
}: {
  connections: EnterpriseSsoConnection[];
  disabled: boolean;
  onDisable: (connectionId: string) => void;
}): React.ReactElement {
  const { _ } = useLingui();
  if (!connections.length)
    return <p className="text-sm text-muted-foreground">{_(COPY.noConnections)}</p>;
  return (
    <div className="grid gap-2">
      {connections.map((connection) => (
        <div className="grid gap-1 rounded-lg border border-border p-3" key={connection.id}>
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-sm font-semibold">
              {providerLabel(_, connection.provider)}
            </span>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{statusLabel(_, connection.status)}</Badge>
              {connection.status !== 'disabled' ? (
                <Button
                  disabled={disabled}
                  onClick={() => onDisable(connection.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {_(COPY.disableConnection)}
                </Button>
              ) : null}
            </div>
          </div>
          <span className="truncate text-xs text-muted-foreground">{connection.issuer}</span>
        </div>
      ))}
    </div>
  );
}

function ConnectionSelect({
  connections,
  disabled,
  label,
  onChange,
  value,
}: {
  connections: EnterpriseSsoConnection[];
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}): React.ReactElement {
  return (
    <FieldLabel label={label}>
      <Select disabled={disabled || !connections.length} onValueChange={onChange} value={value}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {connections.map((connection) => (
            <SelectItem key={connection.id} value={connection.id}>
              {connection.provider} · {connection.issuer}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldLabel>
  );
}

function FieldInput({
  disabled,
  id,
  label,
  onChange,
  type = 'text',
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  type?: React.HTMLInputTypeAttribute;
  value: string;
}): React.ReactElement {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        autoComplete="off"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </div>
  );
}

function FieldLabel({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}): React.ReactElement {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function BooleanControl({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}): React.ReactElement {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm font-medium">
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function ActionButton({
  busy,
  disabled,
  label,
  variant,
}: {
  busy: boolean;
  disabled: boolean;
  label: string;
  variant?: 'outline';
}): React.ReactElement {
  return (
    <Button className="w-fit" disabled={disabled} type="submit" variant={variant}>
      {busy ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
      {label}
    </Button>
  );
}

function ReadonlyValue({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <code className="overflow-x-auto rounded-md bg-background p-2 text-xs" dir="ltr">
        {value}
      </code>
    </div>
  );
}

function Feedback({
  kind,
  message,
}: {
  kind: 'error' | 'neutral' | 'success';
  message: string;
}): React.ReactElement {
  if (kind === 'neutral') {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {message}
      </p>
    );
  }
  return <StatusBanner kind={kind} title={message} />;
}

function providerLabel(
  translate: ReturnType<typeof useLingui>['_'],
  provider: EnterpriseIdentityProvider,
): string {
  if (provider === 'okta') return translate(COPY.okta);
  if (provider === 'entra') return translate(COPY.entra);
  return provider;
}

function statusLabel(translate: ReturnType<typeof useLingui>['_'], status: string): string {
  if (status === 'draft') return translate(COPY.statusDraft);
  if (status === 'validation_required') return translate(COPY.statusValidation);
  if (status === 'active') return translate(COPY.statusActive);
  if (status === 'verified') return translate(COPY.statusVerified);
  if (status === 'pending') return translate(COPY.statusPending);
  return translate(COPY.statusDisabled);
}

function validHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}
