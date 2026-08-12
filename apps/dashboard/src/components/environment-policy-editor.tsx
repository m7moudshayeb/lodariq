'use client';

import * as React from 'react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { useForm } from 'react-hook-form';
import {
  createDefaultEnvironmentReleasePolicy,
  type EnvironmentReleasePolicy,
} from '@lodariq/schema';
import { useEnvironmentPolicyMutation } from '../hooks/use-environment-mutations';
import type { WorkspaceEnvironmentDto } from '../lib/api';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const PIPELINE_POSITION = { development: 0, staging: 1, production: 2 } as const;
const PUBLISHER_ROLES = ['owner', 'admin', 'member'] as const;
const RECOVERY_ROLES = ['owner', 'admin'] as const;

const COPY = {
  unableToUpdate: msg({
    id: 'dashboard.environmentPolicy.unableToUpdate',
    message: 'Unable to update the environment policy.',
  }),
  title: msg({ id: 'dashboard.environmentPolicy.title', message: 'Environment policy' }),
  name: msg({ id: 'dashboard.environmentPolicy.name', message: 'Name' }),
  pipeline: msg({ id: 'dashboard.environmentPolicy.pipeline', message: 'Pipeline' }),
  exactOrigins: msg({
    id: 'dashboard.environmentPolicy.exactOrigins',
    message: 'Exact origins, one per line',
  }),
  environmentEnabled: msg({
    id: 'dashboard.environmentPolicy.environmentEnabled',
    message: 'Environment enabled',
  }),
  authoringEnabled: msg({
    id: 'dashboard.environmentPolicy.authoringEnabled',
    message: 'Authoring enabled',
  }),
  directPublish: msg({
    id: 'dashboard.environmentPolicy.directPublish',
    message: 'Direct publish',
  }),
  requireVerification: msg({
    id: 'dashboard.environmentPolicy.requireVerification',
    message: 'Require source verification',
  }),
  requireApproval: msg({
    id: 'dashboard.environmentPolicy.requireApproval',
    message: 'Require one approval',
  }),
  promotionSource: msg({
    id: 'dashboard.environmentPolicy.promotionSource',
    message: 'Promotion source',
  }),
  chooseEarlier: msg({
    id: 'dashboard.environmentPolicy.chooseEarlier',
    message: 'Choose an earlier environment',
  }),
  publisherRoles: msg({
    id: 'dashboard.environmentPolicy.publisherRoles',
    message: 'Publisher roles',
  }),
  rollbackRoles: msg({
    id: 'dashboard.environmentPolicy.rollbackRoles',
    message: 'Rollback roles',
  }),
  unpublishRoles: msg({
    id: 'dashboard.environmentPolicy.unpublishRoles',
    message: 'Unpublish roles',
  }),
  separateVerifier: msg({
    id: 'dashboard.environmentPolicy.separateVerifier',
    message: 'Separate verifier',
  }),
  separateApprover: msg({
    id: 'dashboard.environmentPolicy.separateApprover',
    message: 'Separate approver',
  }),
  noPublishSideEffect: msg({
    id: 'dashboard.environmentPolicy.noPublishSideEffect',
    message: 'Policy changes never publish or recompile an artifact.',
  }),
  saving: msg({ id: 'dashboard.environmentPolicy.saving', message: 'Saving…' }),
  save: msg({ id: 'dashboard.environmentPolicy.save', message: 'Save policy' }),
  invalid: msg({
    id: 'dashboard.environmentPolicy.invalid',
    message: 'Enter a name and no more than 100 exact origins.',
  }),
  tooManyOrigins: msg({
    id: 'dashboard.environmentPolicy.tooManyOrigins',
    message: 'No more than 100 origins are allowed.',
  }),
  invalidOrigin: msg({
    id: 'dashboard.environmentPolicy.invalidOrigin',
    message: 'Every origin must be an exact HTTP(S) origin.',
  }),
  development: msg({ id: 'dashboard.environmentPolicy.development', message: 'Development' }),
  staging: msg({ id: 'dashboard.environmentPolicy.staging', message: 'Staging' }),
  production: msg({ id: 'dashboard.environmentPolicy.production', message: 'Production' }),
  owner: msg({ id: 'dashboard.role.owner', message: 'Owner' }),
  admin: msg({ id: 'dashboard.role.admin', message: 'Admin' }),
  member: msg({ id: 'dashboard.role.member', message: 'Member' }),
} as const;

interface EnvironmentPolicyEditorProps {
  environment: WorkspaceEnvironmentDto & { originLabel: string };
  environments: Array<WorkspaceEnvironmentDto & { originLabel: string }>;
  canManage: boolean;
  workspaceId: string;
  onUpdated?: (environment: WorkspaceEnvironmentDto) => void;
}

interface EnvironmentPolicyFormValues {
  name: string;
  origins: string;
  enabled: boolean;
  authoringEnabled: boolean;
  promotionSourceEnvironmentId: string;
  releasePolicy: EnvironmentReleasePolicy;
}

export function EnvironmentPolicyEditor({
  environment,
  environments,
  canManage,
  workspaceId,
  onUpdated,
}: EnvironmentPolicyEditorProps): React.ReactElement {
  const { _ } = useLingui();
  const current = environment;
  const form = useForm<EnvironmentPolicyFormValues>({
    defaultValues: environmentPolicyFormValues(environment),
  });
  const values = form.watch();
  const releasePolicy = values.releasePolicy;
  const [feedback, setFeedback] = React.useState<{
    kind: 'error' | 'notice';
    message: string;
  } | null>(null);
  const mutation = useEnvironmentPolicyMutation(workspaceId);
  const pending = mutation.isPending;

  React.useEffect(() => {
    form.reset(environmentPolicyFormValues(environment));
  }, [environment, form]);

  const save = form.handleSubmit((submitted): void => {
    if (!canManage || pending) return;
    const originAllowlist = normalizeOriginLines(submitted.origins);
    setFeedback(null);
    mutation.mutate(
      {
        environmentId: current.id,
        name: submitted.name.trim(),
        originAllowlist,
        enabled: submitted.enabled,
        pipelinePosition: PIPELINE_POSITION[current.kind],
        authoringEnabled: current.kind === 'production' ? false : submitted.authoringEnabled,
        ...(current.kind === 'production' && submitted.promotionSourceEnvironmentId
          ? { promotionSourceEnvironmentId: submitted.promotionSourceEnvironmentId }
          : {}),
        releasePolicy: {
          ...submitted.releasePolicy,
          allowDirectPublish:
            current.kind === 'production' ? false : submitted.releasePolicy.allowDirectPublish,
          requireSourceVerification:
            current.kind === 'production'
              ? true
              : submitted.releasePolicy.requireSourceVerification,
        },
        expectedUpdatedAt: current.updatedAt,
      },
      {
        onSuccess: (result) => {
          if (result.status === 'error') {
            setFeedback({ kind: 'error', message: result.error });
            return;
          }
          onUpdated?.(result.environment);
          setFeedback({ kind: 'notice', message: result.message });
        },
        onError: () => {
          setFeedback({ kind: 'error', message: _(COPY.unableToUpdate) });
        },
      },
    );
  });

  const sourceOptions = environments.filter((candidate) => candidate.kind === 'staging');

  return (
    <details className="border-t border-border pt-3">
      <summary className="cursor-pointer text-sm font-semibold">{_(COPY.title)}</summary>
      <div className="mt-3 grid gap-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium">
            {_(COPY.name)}
            <Input
              disabled={!canManage || pending}
              {...form.register('name', { required: true, maxLength: 120 })}
            />
          </label>
          <div className="grid gap-1.5 text-xs font-medium">
            {_(COPY.pipeline)}
            <div className="flex h-9 items-center gap-2 rounded-md border border-input px-3">
              <Badge variant="outline">{PIPELINE_POSITION[current.kind]}</Badge>
              <span>{_(COPY[current.kind])}</span>
            </div>
          </div>
        </div>

        <label className="grid gap-1.5 text-xs font-medium">
          {_(COPY.exactOrigins)}
          <textarea
            className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
            disabled={!canManage || pending}
            {...form.register('origins', {
              validate: (value) => validateOriginLines(value, _),
            })}
          />
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          <PolicyCheckbox
            checked={values.enabled}
            disabled={!canManage || pending}
            label={_(COPY.environmentEnabled)}
            onChange={(checked) => form.setValue('enabled', checked, { shouldDirty: true })}
          />
          <PolicyCheckbox
            checked={current.kind === 'production' ? false : values.authoringEnabled}
            disabled={!canManage || pending || current.kind === 'production'}
            label={_(COPY.authoringEnabled)}
            onChange={(checked) =>
              form.setValue('authoringEnabled', checked, { shouldDirty: true })
            }
          />
          <PolicyCheckbox
            checked={current.kind === 'production' ? false : releasePolicy.allowDirectPublish}
            disabled={!canManage || pending || current.kind === 'production'}
            label={_(COPY.directPublish)}
            onChange={(checked) =>
              form.setValue(
                'releasePolicy',
                { ...releasePolicy, allowDirectPublish: checked },
                { shouldDirty: true },
              )
            }
          />
          <PolicyCheckbox
            checked={current.kind === 'production' ? true : releasePolicy.requireSourceVerification}
            disabled={!canManage || pending || current.kind === 'production'}
            label={_(COPY.requireVerification)}
            onChange={(checked) =>
              form.setValue(
                'releasePolicy',
                { ...releasePolicy, requireSourceVerification: checked },
                { shouldDirty: true },
              )
            }
          />
          <PolicyCheckbox
            checked={releasePolicy.requiredApprovalCount === 1}
            disabled={!canManage || pending}
            label={_(COPY.requireApproval)}
            onChange={(checked) =>
              form.setValue(
                'releasePolicy',
                { ...releasePolicy, requiredApprovalCount: checked ? 1 : 0 },
                { shouldDirty: true },
              )
            }
          />
        </div>

        {current.kind === 'production' ? (
          <label className="grid gap-1.5 text-xs font-medium">
            {_(COPY.promotionSource)}
            <Select
              disabled={!canManage || pending}
              onValueChange={(value) =>
                form.setValue('promotionSourceEnvironmentId', value === 'none' ? '' : value, {
                  shouldDirty: true,
                })
              }
              value={values.promotionSourceEnvironmentId || 'none'}
            >
              <SelectTrigger>
                <SelectValue placeholder={_(COPY.chooseEarlier)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{_(COPY.chooseEarlier)}</SelectItem>
                {sourceOptions.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name} · {candidate.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}

        <RolePolicy
          disabled={!canManage || pending}
          label={_(COPY.publisherRoles)}
          onChange={(publisherRoles) =>
            form.setValue(
              'releasePolicy',
              { ...releasePolicy, publisherRoles },
              { shouldDirty: true },
            )
          }
          roles={current.kind === 'production' ? RECOVERY_ROLES : PUBLISHER_ROLES}
          selected={releasePolicy.publisherRoles}
        />
        <RolePolicy
          disabled={!canManage || pending}
          label={_(COPY.rollbackRoles)}
          onChange={(rollbackRoles) =>
            form.setValue(
              'releasePolicy',
              { ...releasePolicy, rollbackRoles },
              { shouldDirty: true },
            )
          }
          roles={RECOVERY_ROLES}
          selected={releasePolicy.rollbackRoles}
        />
        <RolePolicy
          disabled={!canManage || pending}
          label={_(COPY.unpublishRoles)}
          onChange={(unpublishRoles) =>
            form.setValue(
              'releasePolicy',
              { ...releasePolicy, unpublishRoles },
              { shouldDirty: true },
            )
          }
          roles={RECOVERY_ROLES}
          selected={releasePolicy.unpublishRoles}
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <PolicyCheckbox
            checked={releasePolicy.separationOfDuties.requireSeparateVerifier}
            disabled={!canManage || pending}
            label={_(COPY.separateVerifier)}
            onChange={(requireSeparateVerifier) =>
              form.setValue(
                'releasePolicy',
                {
                  ...releasePolicy,
                  separationOfDuties: {
                    ...releasePolicy.separationOfDuties,
                    requireSeparateVerifier,
                  },
                },
                { shouldDirty: true },
              )
            }
          />
          <PolicyCheckbox
            checked={releasePolicy.separationOfDuties.requireSeparateApprover}
            disabled={!canManage || pending}
            label={_(COPY.separateApprover)}
            onChange={(requireSeparateApprover) =>
              form.setValue(
                'releasePolicy',
                {
                  ...releasePolicy,
                  separationOfDuties: {
                    ...releasePolicy.separationOfDuties,
                    requireSeparateApprover,
                  },
                },
                { shouldDirty: true },
              )
            }
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{_(COPY.noPublishSideEffect)}</p>
          <Button
            disabled={!canManage || pending}
            onClick={() => void save()}
            type="button"
            variant="outline"
          >
            {_(pending ? COPY.saving : COPY.save)}
          </Button>
        </div>
        {feedback ? (
          <p
            className={
              feedback.kind === 'error'
                ? 'text-xs text-destructive'
                : 'text-xs text-muted-foreground'
            }
            role={feedback.kind === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        ) : null}
        {form.formState.errors.name || form.formState.errors.origins ? (
          <p className="text-xs text-destructive" role="alert">
            {_(COPY.invalid)}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function PolicyCheckbox({
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
    <Label className="flex items-center gap-2 text-xs">
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </Label>
  );
}

function RolePolicy<TRole extends 'owner' | 'admin' | 'member'>({
  disabled,
  label,
  onChange,
  roles,
  selected,
}: {
  disabled: boolean;
  label: string;
  onChange: (roles: TRole[]) => void;
  roles: readonly TRole[];
  selected: readonly TRole[];
}): React.ReactElement {
  const { _ } = useLingui();
  const toggle = (role: TRole, checked: boolean): void => {
    const next = checked
      ? [...new Set([...selected, role])]
      : selected.filter((item) => item !== role);
    onChange(next as TRole[]);
  };
  return (
    <fieldset className="grid gap-2 rounded-md border border-border p-3">
      <legend className="px-1 text-xs font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-4">
        {roles.map((role) => (
          <PolicyCheckbox
            key={role}
            checked={selected.includes(role)}
            disabled={disabled}
            label={_(COPY[role])}
            onChange={(checked) => toggle(role, checked)}
          />
        ))}
      </div>
    </fieldset>
  );
}

function readReleasePolicy(environment: WorkspaceEnvironmentDto): EnvironmentReleasePolicy {
  const fallback = createDefaultEnvironmentReleasePolicy(environment.kind);
  return {
    ...(environment.releasePolicy ?? fallback),
    requiredApprovalCount:
      environment.requiredApprovalCount ??
      environment.releasePolicy?.requiredApprovalCount ??
      fallback.requiredApprovalCount,
  };
}

function environmentPolicyFormValues(
  environment: WorkspaceEnvironmentDto,
): EnvironmentPolicyFormValues {
  return {
    name: environment.name,
    origins: environment.originAllowlist.join('\n'),
    enabled: environment.enabled ?? true,
    authoringEnabled:
      environment.kind === 'production' ? false : (environment.authoringEnabled ?? true),
    promotionSourceEnvironmentId: environment.promotionSourceEnvironmentId ?? '',
    releasePolicy: readReleasePolicy(environment),
  };
}

function validateOriginLines(
  value: string,
  translate: ReturnType<typeof useLingui>['_'],
): true | string {
  const origins = normalizeOriginLines(value);
  if (origins.length > 100) return translate(COPY.tooManyOrigins);
  return origins.every(isExactHttpOrigin) || translate(COPY.invalidOrigin);
}

function isExactHttpOrigin(value: string): boolean {
  if (value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === '' || url.pathname === '/') &&
      url.origin === value.replace(/\/$/u, '')
    );
  } catch {
    return false;
  }
}

function normalizeOriginLines(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/u)
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  ];
}
