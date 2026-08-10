'use client';

import * as React from 'react';
import {
  createDefaultEnvironmentReleasePolicy,
  type EnvironmentReleasePolicy,
} from '@lodariq/schema';
import { updateWorkspaceEnvironmentPolicyAction } from '../app/actions';
import type { WorkspaceEnvironmentDto } from '../lib/api';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

const PIPELINE_POSITION = { development: 0, staging: 1, production: 2 } as const;
const PUBLISHER_ROLES = ['owner', 'admin', 'member'] as const;
const RECOVERY_ROLES = ['owner', 'admin'] as const;

interface EnvironmentPolicyEditorProps {
  environment: WorkspaceEnvironmentDto & { originLabel: string };
  environments: Array<WorkspaceEnvironmentDto & { originLabel: string }>;
  canManage: boolean;
  onUpdated?: (environment: WorkspaceEnvironmentDto) => void;
}

export function EnvironmentPolicyEditor({
  environment,
  environments,
  canManage,
  onUpdated,
}: EnvironmentPolicyEditorProps): React.ReactElement {
  const [current, setCurrent] = React.useState(environment);
  const [name, setName] = React.useState(environment.name);
  const [origins, setOrigins] = React.useState(environment.originAllowlist.join('\n'));
  const [enabled, setEnabled] = React.useState(environment.enabled ?? true);
  const [authoringEnabled, setAuthoringEnabled] = React.useState(
    environment.kind === 'production' ? false : (environment.authoringEnabled ?? true),
  );
  const [promotionSourceEnvironmentId, setPromotionSourceEnvironmentId] = React.useState(
    environment.promotionSourceEnvironmentId ?? '',
  );
  const [releasePolicy, setReleasePolicy] = React.useState<EnvironmentReleasePolicy>(() =>
    readReleasePolicy(environment),
  );
  const [feedback, setFeedback] = React.useState<{
    kind: 'error' | 'notice';
    message: string;
  } | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setCurrent(environment);
    setName(environment.name);
    setOrigins(environment.originAllowlist.join('\n'));
    setEnabled(environment.enabled ?? true);
    setAuthoringEnabled(
      environment.kind === 'production' ? false : (environment.authoringEnabled ?? true),
    );
    setPromotionSourceEnvironmentId(environment.promotionSourceEnvironmentId ?? '');
    setReleasePolicy(readReleasePolicy(environment));
  }, [environment]);

  const save = (): void => {
    if (!canManage || pending) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await updateWorkspaceEnvironmentPolicyAction({
        environmentId: current.id,
        name,
        originAllowlist: normalizeOriginLines(origins),
        enabled,
        pipelinePosition: PIPELINE_POSITION[current.kind],
        authoringEnabled: current.kind === 'production' ? false : authoringEnabled,
        ...(current.kind === 'production' && promotionSourceEnvironmentId
          ? { promotionSourceEnvironmentId }
          : {}),
        releasePolicy: {
          ...releasePolicy,
          allowDirectPublish:
            current.kind === 'production' ? false : releasePolicy.allowDirectPublish,
          requireSourceVerification:
            current.kind === 'production' ? true : releasePolicy.requireSourceVerification,
        },
        expectedUpdatedAt: current.updatedAt,
      });
      if (result.status === 'error') {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      const next = { ...result.environment, originLabel: normalizeOriginLines(origins).join(', ') };
      setCurrent(next);
      onUpdated?.(result.environment);
      setFeedback({ kind: 'notice', message: result.message });
    });
  };

  const sourceOptions = environments.filter((candidate) => candidate.kind === 'staging');

  return (
    <details className="border-t border-border pt-3">
      <summary className="cursor-pointer text-sm font-semibold">Environment policy</summary>
      <div className="mt-3 grid gap-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium">
            Name
            <Input
              disabled={!canManage || pending}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>
          <div className="grid gap-1.5 text-xs font-medium">
            Pipeline
            <div className="flex h-9 items-center gap-2 rounded-md border border-input px-3">
              <Badge variant="outline">{PIPELINE_POSITION[current.kind]}</Badge>
              <span className="capitalize">{current.kind}</span>
            </div>
          </div>
        </div>

        <label className="grid gap-1.5 text-xs font-medium">
          Exact origins, one per line
          <textarea
            className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
            disabled={!canManage || pending}
            onChange={(event) => setOrigins(event.target.value)}
            value={origins}
          />
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          <PolicyCheckbox
            checked={enabled}
            disabled={!canManage || pending}
            label="Environment enabled"
            onChange={setEnabled}
          />
          <PolicyCheckbox
            checked={current.kind === 'production' ? false : authoringEnabled}
            disabled={!canManage || pending || current.kind === 'production'}
            label="Authoring enabled"
            onChange={setAuthoringEnabled}
          />
          <PolicyCheckbox
            checked={current.kind === 'production' ? false : releasePolicy.allowDirectPublish}
            disabled={!canManage || pending || current.kind === 'production'}
            label="Direct publish"
            onChange={(checked) =>
              setReleasePolicy({ ...releasePolicy, allowDirectPublish: checked })
            }
          />
          <PolicyCheckbox
            checked={current.kind === 'production' ? true : releasePolicy.requireSourceVerification}
            disabled={!canManage || pending || current.kind === 'production'}
            label="Require source verification"
            onChange={(checked) =>
              setReleasePolicy({ ...releasePolicy, requireSourceVerification: checked })
            }
          />
          <PolicyCheckbox
            checked={releasePolicy.requiredApprovalCount === 1}
            disabled={!canManage || pending}
            label="Require one approval"
            onChange={(checked) =>
              setReleasePolicy({ ...releasePolicy, requiredApprovalCount: checked ? 1 : 0 })
            }
          />
        </div>

        {current.kind === 'production' ? (
          <label className="grid gap-1.5 text-xs font-medium">
            Promotion source
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              disabled={!canManage || pending}
              onChange={(event) => setPromotionSourceEnvironmentId(event.target.value)}
              value={promotionSourceEnvironmentId}
            >
              <option value="">Choose an earlier environment</option>
              {sourceOptions.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} · {candidate.id}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <RolePolicy
          disabled={!canManage || pending}
          label="Publisher roles"
          onChange={(publisherRoles) => setReleasePolicy({ ...releasePolicy, publisherRoles })}
          roles={current.kind === 'production' ? RECOVERY_ROLES : PUBLISHER_ROLES}
          selected={releasePolicy.publisherRoles}
        />
        <RolePolicy
          disabled={!canManage || pending}
          label="Rollback roles"
          onChange={(rollbackRoles) => setReleasePolicy({ ...releasePolicy, rollbackRoles })}
          roles={RECOVERY_ROLES}
          selected={releasePolicy.rollbackRoles}
        />
        <RolePolicy
          disabled={!canManage || pending}
          label="Unpublish roles"
          onChange={(unpublishRoles) => setReleasePolicy({ ...releasePolicy, unpublishRoles })}
          roles={RECOVERY_ROLES}
          selected={releasePolicy.unpublishRoles}
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <PolicyCheckbox
            checked={releasePolicy.separationOfDuties.requireSeparateVerifier}
            disabled={!canManage || pending}
            label="Separate verifier"
            onChange={(requireSeparateVerifier) =>
              setReleasePolicy({
                ...releasePolicy,
                separationOfDuties: {
                  ...releasePolicy.separationOfDuties,
                  requireSeparateVerifier,
                },
              })
            }
          />
          <PolicyCheckbox
            checked={releasePolicy.separationOfDuties.requireSeparateApprover}
            disabled={!canManage || pending}
            label="Separate approver"
            onChange={(requireSeparateApprover) =>
              setReleasePolicy({
                ...releasePolicy,
                separationOfDuties: {
                  ...releasePolicy.separationOfDuties,
                  requireSeparateApprover,
                },
              })
            }
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Policy changes never publish or recompile an artifact.
          </p>
          <Button disabled={!canManage || pending} onClick={save} type="button" variant="outline">
            {pending ? 'Saving…' : 'Save policy'}
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
            label={role}
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
