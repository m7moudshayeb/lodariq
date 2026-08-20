'use client';

import * as React from 'react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { TriangleAlert } from 'lucide-react';
import {
  SUCCESS_EVENT_WINDOW_DAYS,
  type ExperienceSession,
  type ExperimentArm,
} from '@lodariq/schema';
import {
  useDeclareSuccessEvent,
  useExperienceMeasurement,
  useExperimentChange,
} from '../hooks/use-experience-measurement';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { StatusBanner } from './ui/status-banner';

const COPY = {
  heading: msg({
    id: 'dashboard.experience.heading',
    message: 'Did this experience change anything?',
  }),
  chooseExperience: msg({
    id: 'dashboard.experience.chooseExperience',
    message: 'Choose an experience to see how it performed.',
  }),
  experience: msg({ id: 'dashboard.experience.experience', message: 'Experience' }),
  loading: msg({ id: 'dashboard.experience.loading', message: 'Loading this experience…' }),
  unavailable: msg({
    id: 'dashboard.experience.unavailable',
    message: 'This experience could not be measured right now.',
  }),
  shown: msg({ id: 'dashboard.experience.shown', message: 'Shown' }),
  completed: msg({ id: 'dashboard.experience.completed', message: 'Completed' }),
  dismissed: msg({ id: 'dashboard.experience.dismissed', message: 'Dismissed' }),
  funnel: msg({ id: 'dashboard.experience.funnel', message: 'Where people stop' }),
  step: msg({ id: 'dashboard.experience.step', message: 'Step' }),
  reached: msg({ id: 'dashboard.experience.reached', message: 'Reached' }),
  noDelivery: msg({
    id: 'dashboard.experience.noDelivery',
    message: 'Nothing has been delivered in this environment yet.',
  }),
  adoption: msg({ id: 'dashboard.experience.adoption', message: 'Adoption impact' }),
  adoptionHelp: msg({
    id: 'dashboard.experience.adoptionHelp',
    message:
      'Did the behaviour this experience teaches actually happen afterwards? Measured against people who were never shown it.',
  }),
  successEvent: msg({ id: 'dashboard.experience.successEvent', message: 'Success event' }),
  successEventHelp: msg({
    id: 'dashboard.experience.successEventHelp',
    message: 'A lowercase event your product already sends, such as invited_teammate.',
  }),
  windowDays: msg({ id: 'dashboard.experience.windowDays', message: 'Window (days)' }),
  declare: msg({ id: 'dashboard.experience.declare', message: 'Declare' }),
  clear: msg({ id: 'dashboard.experience.clear', message: 'Clear' }),
  notDeclared: msg({
    id: 'dashboard.experience.notDeclared',
    message: 'No success event is declared, so impact cannot be measured.',
  }),
  belowFloor: msg({
    id: 'dashboard.experience.belowFloor',
    message: 'Too few people so far to say anything with confidence.',
  }),
  treated: msg({ id: 'dashboard.experience.treated', message: 'Did it after seeing this' }),
  baseline: msg({ id: 'dashboard.experience.baseline', message: 'Did it without seeing this' }),
  experiment: msg({ id: 'dashboard.experience.experiment', message: 'A/B test' }),
  noExperiment: msg({
    id: 'dashboard.experience.noExperiment',
    message: 'No test is running. Start one from the authoring experience.',
  }),
  exposures: msg({ id: 'dashboard.experience.exposures', message: 'Shown' }),
  conversions: msg({ id: 'dashboard.experience.conversions', message: 'Converted' }),
  rate: msg({ id: 'dashboard.experience.rate', message: 'Rate' }),
  leading: msg({ id: 'dashboard.experience.leading', message: 'Leading' }),
  inconclusive: msg({
    id: 'dashboard.experience.inconclusive',
    message: 'No arm is ahead by more than the sampling error yet.',
  }),
  stop: msg({ id: 'dashboard.experience.stop', message: 'Stop the test' }),
  promote: msg({ id: 'dashboard.experience.promote', message: 'Promote the leading arm' }),
  formResponses: msg({ id: 'dashboard.experience.formResponses', message: 'Answers' }),
  question: msg({ id: 'dashboard.experience.question', message: 'Question' }),
  answers: msg({ id: 'dashboard.experience.answers', message: 'Answers' }),
  topAnswer: msg({ id: 'dashboard.experience.topAnswer', message: 'Most common' }),
  noAnswers: msg({
    id: 'dashboard.experience.noAnswers',
    message: 'No form field has been answered yet.',
  }),
  sessions: msg({ id: 'dashboard.experience.sessions', message: 'Recent runs' }),
  sessionsHelp: msg({
    id: 'dashboard.experience.sessionsHelp',
    message:
      'What the experience did on each run, not what the person did on the page. Nothing about the visitor is recorded beyond the id that ties one run together.',
  }),
  noSessions: msg({
    id: 'dashboard.experience.noSessions',
    message: 'No run has been recorded in this environment yet.',
  }),
  outcomeCompleted: msg({ id: 'dashboard.experience.outcomeCompleted', message: 'Finished' }),
  outcomeDismissed: msg({ id: 'dashboard.experience.outcomeDismissed', message: 'Closed it' }),
  outcomeSkipped: msg({ id: 'dashboard.experience.outcomeSkipped', message: 'Skipped it' }),
  outcomeAbandoned: msg({ id: 'dashboard.experience.outcomeAbandoned', message: 'Walked away' }),
  sessionSteps: msg({ id: 'dashboard.experience.sessionSteps', message: 'Steps reached' }),
  sessionLength: msg({ id: 'dashboard.experience.sessionLength', message: 'Length' }),
  sessionStalled: msg({
    id: 'dashboard.experience.sessionStalled',
    message: 'Could not find what step {stepIds} points at.',
  }),
  replay: msg({ id: 'dashboard.experience.replay', message: 'Show the timeline' }),
  hideReplay: msg({ id: 'dashboard.experience.hideReplay', message: 'Hide the timeline' }),
};

const OUTCOME_COPY = {
  completed: COPY.outcomeCompleted,
  dismissed: COPY.outcomeDismissed,
  skipped: COPY.outcomeSkipped,
  abandoned: COPY.outcomeAbandoned,
} as const;

export interface ExperienceOption {
  id: string;
  name: string;
}

/**
 * The per-experience view. Kept apart from the workspace analytics panel above
 * it because that answers "is the SDK healthy" and this answers "did this
 * experience work" — merging them would make neither readable.
 */
export function ExperienceMeasurementPanel({
  environmentId,
  experiences,
  workspaceId,
}: {
  environmentId: string;
  experiences: readonly ExperienceOption[];
  workspaceId: string;
}): React.ReactElement {
  const { _ } = useLingui();
  const [documentId, setDocumentId] = React.useState(experiences[0]?.id ?? '');
  const [eventName, setEventName] = React.useState('');
  const [windowDays, setWindowDays] = React.useState<number>(30);

  const query = useExperienceMeasurement(
    workspaceId,
    documentId,
    environmentId,
    Boolean(documentId) && Boolean(environmentId),
  );
  const declare = useDeclareSuccessEvent(workspaceId, documentId, environmentId);
  const change = useExperimentChange(workspaceId, documentId, environmentId);

  const snapshot = query.data;
  const analytics = snapshot?.analytics;
  const experiment = snapshot?.experiment.experiment ?? null;
  const results = snapshot?.experiment.results ?? null;
  const declared = snapshot?.measurement.successEvent;

  if (!experiences.length) {
    return <StatusBanner kind="warning" title={_(COPY.chooseExperience)} />;
  }

  return (
    <section aria-label={_(COPY.heading)} className="mt-6 space-y-4">
      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>{_(COPY.heading)}</CardTitle>
          <div className="flex items-center gap-2">
            <Label className="sr-only" htmlFor="experience-picker">
              {_(COPY.experience)}
            </Label>
            <select
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              id="experience-picker"
              onChange={(event) => setDocumentId(event.target.value)}
              value={documentId}
            >
              {experiences.map((experience) => (
                <option key={experience.id} value={experience.id}>
                  {experience.name}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {query.isPending ? <p className="text-sm text-muted-foreground">{_(COPY.loading)}</p> : null}
          {query.isError ? <StatusBanner kind="error" title={_(COPY.unavailable)} /> : null}

          {analytics ? (
            <>
              <dl className="grid gap-4 sm:grid-cols-3">
                <Headline label={_(COPY.shown)} value={analytics.shown.toLocaleString()} />
                <Headline
                  label={_(COPY.completed)}
                  value={share(analytics.completed, analytics.shown)}
                />
                <Headline
                  label={_(COPY.dismissed)}
                  value={share(analytics.dismissed, analytics.shown)}
                />
              </dl>

              <section aria-label={_(COPY.funnel)}>
                <h3 className="mb-2 text-sm font-semibold">{_(COPY.funnel)}</h3>
                {analytics.funnel.length ? (
                  <ol className="space-y-1">
                    {analytics.funnel.map((entry, index) => (
                      <li className="flex items-center gap-3 text-sm" key={entry.stepId}>
                        <span className="w-24 shrink-0 text-muted-foreground">
                          {_(COPY.step)} {index + 1}
                        </span>
                        <span
                          aria-hidden="true"
                          className="h-3 rounded bg-primary/70"
                          style={{ width: barWidth(entry.reached, analytics.shown) }}
                        />
                        <span className="tabular-nums">
                          {entry.reached.toLocaleString()} · {share(entry.reached, analytics.shown)}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">{_(COPY.noDelivery)}</p>
                )}
              </section>

              <section aria-label={_(COPY.adoption)}>
                <h3 className="mb-1 text-sm font-semibold">{_(COPY.adoption)}</h3>
                <p className="mb-3 text-sm text-muted-foreground">{_(COPY.adoptionHelp)}</p>
                <form
                  className="mb-3 flex flex-wrap items-end gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!eventName.trim()) return;
                    declare.mutate({
                      eventName: eventName.trim(),
                      windowDays: windowDays as (typeof SUCCESS_EVENT_WINDOW_DAYS)[number],
                    });
                  }}
                >
                  <div>
                    <Label htmlFor="success-event">{_(COPY.successEvent)}</Label>
                    <Input
                      id="success-event"
                      onChange={(event) => setEventName(event.target.value)}
                      pattern="[a-z][a-z0-9_]*"
                      placeholder={declared?.eventName ?? 'invited_teammate'}
                      value={eventName}
                    />
                  </div>
                  <div>
                    <Label htmlFor="success-window">{_(COPY.windowDays)}</Label>
                    <select
                      className="h-9 rounded-md border bg-transparent px-2 text-sm"
                      id="success-window"
                      onChange={(event) => setWindowDays(Number(event.target.value))}
                      value={windowDays}
                    >
                      {SUCCESS_EVENT_WINDOW_DAYS.map((days) => (
                        <option key={days} value={days}>
                          {days}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button disabled={!eventName.trim() || declare.isPending} type="submit">
                    {_(COPY.declare)}
                  </Button>
                  {declared ? (
                    <Button
                      disabled={declare.isPending}
                      onClick={() => declare.mutate(null)}
                      type="button"
                      variant="outline"
                    >
                      {_(COPY.clear)}
                    </Button>
                  ) : null}
                  <p className="w-full text-xs text-muted-foreground">{_(COPY.successEventHelp)}</p>
                </form>
                {analytics.adoption.length ? (
                  analytics.adoption.map((impact) => (
                    <dl className="grid gap-4 sm:grid-cols-3" key={impact.eventName}>
                      <Headline
                        label={_(COPY.treated)}
                        value={impact.treatedCount.toLocaleString()}
                      />
                      <Headline
                        label={_(COPY.baseline)}
                        value={impact.baselineCount.toLocaleString()}
                      />
                      <Headline
                        label={_(COPY.windowDays)}
                        value={String(impact.windowDays)}
                        note={impact.confidencePercent === null ? _(COPY.belowFloor) : undefined}
                      />
                    </dl>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{_(COPY.notDeclared)}</p>
                )}
              </section>

              <section aria-label={_(COPY.experiment)}>
                <h3 className="mb-2 text-sm font-semibold">{_(COPY.experiment)}</h3>
                {experiment ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{experiment.status}</Badge>
                      <Badge variant="outline">{experiment.varies}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {experiment.successEventName}
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-muted-foreground">
                          <th scope="col">{_(COPY.experiment)}</th>
                          <th scope="col">{_(COPY.exposures)}</th>
                          <th scope="col">{_(COPY.conversions)}</th>
                          <th scope="col">{_(COPY.rate)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {experiment.arms.map((arm: ExperimentArm) => {
                          const armResult = results?.arms.find((entry) => entry.armId === arm.id);
                          return (
                            <tr key={arm.id}>
                              <th className="py-1 text-left font-medium" scope="row">
                                {arm.label} · {arm.trafficPercent}%
                                {results?.leadingArmId === arm.id ? (
                                  <Badge className="ml-2" variant="outline">
                                    {_(COPY.leading)}
                                  </Badge>
                                ) : null}
                              </th>
                              <td className="tabular-nums">
                                {(armResult?.exposures ?? 0).toLocaleString()}
                              </td>
                              <td className="tabular-nums">
                                {(armResult?.conversions ?? 0).toLocaleString()}
                              </td>
                              <td className="tabular-nums">
                                {((armResult?.conversionRate ?? 0) * 100).toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {results?.leadingArmId ? null : (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <TriangleAlert aria-hidden="true" className="size-4" />
                        {_(COPY.inconclusive)}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        disabled={change.isPending || experiment.status !== 'running'}
                        onClick={() =>
                          change.mutate({
                            experimentId: experiment.id,
                            change: { status: 'stopped' },
                          })
                        }
                        variant="outline"
                      >
                        {_(COPY.stop)}
                      </Button>
                      <Button
                        disabled={change.isPending || !results?.leadingArmId}
                        onClick={() =>
                          change.mutate({
                            experimentId: experiment.id,
                            change: { promotedArmId: results!.leadingArmId! },
                          })
                        }
                      >
                        {_(COPY.promote)}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{_(COPY.noExperiment)}</p>
                )}
              </section>

              <section aria-label={_(COPY.sessions)}>
                <h3 className="mb-1 text-sm font-semibold">{_(COPY.sessions)}</h3>
                <p className="mb-3 text-sm text-muted-foreground">{_(COPY.sessionsHelp)}</p>
                {snapshot?.sessions.length ? (
                  <ul className="space-y-2">
                    {snapshot.sessions.map((session) => (
                      <SessionRow key={session.correlationId} session={session} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{_(COPY.noSessions)}</p>
                )}
              </section>

              <section aria-label={_(COPY.formResponses)}>
                <h3 className="mb-2 text-sm font-semibold">{_(COPY.formResponses)}</h3>
                {analytics.formResponses.length ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground">
                        <th scope="col">{_(COPY.question)}</th>
                        <th scope="col">{_(COPY.answers)}</th>
                        <th scope="col">{_(COPY.topAnswer)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.formResponses.map((response) => (
                        <tr key={response.blockId}>
                          <th className="py-1 text-left font-medium" scope="row">
                            {response.label}
                          </th>
                          <td className="tabular-nums">{response.answerCount}</td>
                          <td>{response.topAnswer ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-muted-foreground">{_(COPY.noAnswers)}</p>
                )}
              </section>
            </>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * One run, collapsed to its outcome until someone asks for the beats. A list of
 * open timelines is unreadable, and the outcome is what a creator scans for.
 */
function SessionRow({ session }: { session: ExperienceSession }): React.ReactElement {
  const { _ } = useLingui();
  const [open, setOpen] = React.useState(false);
  return (
    <li className="rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant="outline">{_(OUTCOME_COPY[session.outcome])}</Badge>
        <span className="text-muted-foreground">
          {_(COPY.sessionSteps)}: <span className="tabular-nums">{session.stepsReached}</span>
        </span>
        <span className="text-muted-foreground">
          {_(COPY.sessionLength)}:{' '}
          <span className="tabular-nums">{formatDuration(session.durationMs)}</span>
        </span>
        <Button
          className="ml-auto"
          onClick={() => setOpen((current) => !current)}
          size="sm"
          variant="ghost"
        >
          {open ? _(COPY.hideReplay) : _(COPY.replay)}
        </Button>
      </div>
      {session.unresolvedStepIds.length ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <TriangleAlert aria-hidden="true" className="size-4" />
          {_({
            ...COPY.sessionStalled,
            values: { stepIds: session.unresolvedStepIds.join(', ') },
          })}
        </p>
      ) : null}
      {open ? (
        <ol className="mt-3 space-y-1 border-l pl-4 text-sm">
          {session.beats.map((beat, index) => (
            <li className="flex gap-3" key={`${beat.name}-${index}`}>
              <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
                {formatDuration(beat.offsetMs)}
              </span>
              <span>
                {beat.name}
                {beat.stepId ? ` · ${beat.stepId}` : ''}
                {beat.resolved === false ? ` · ${beat.reasonCode ?? ''}` : ''}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

function Headline({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}): React.ReactElement {
  return (
    <div className="rounded-md border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function share(part: number, whole: number): string {
  if (!whole) return '—';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function barWidth(part: number, whole: number): string {
  if (!whole) return '0%';
  return `${Math.max(1, Math.round((part / whole) * 100))}%`;
}
