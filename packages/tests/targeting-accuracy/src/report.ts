import { HOST_PAGES, POLICY_PROBE_PAGES } from './host-pages';
import { compoundCoverage } from './compound-mutations';
import { POLICY_CASES } from './selection-policies';
import { isHardWrong, summarize, type Summary, type Trial } from './scorer';
import { nearMissSeverity, RANKING_PROBE_AVAILABLE, type NearMiss } from './near-miss';
import type { BoundaryProbeResult } from './boundary-probe';
import { ALL_MUTATIONS, type Corpus } from './corpus';

/**
 * Formats the corpus as markdown.
 *
 * Report before gate: this is what a human reads to pick accuracy thresholds
 * later, so every `wrong` is spelled out as a bug report and every recoverable
 * abstention is listed as backlog rather than folded into a percentage.
 *
 * Three rules the layout enforces, all of them learned the hard way:
 *
 *  1. **The arms are never added together.** They answer different questions.
 *  2. **Near-miss and tie-fragility are reported orthogonally to the
 *     expected-outcome contract, never netted against it.** Arm A now scores an
 *     abstention on a look-alike page as correct — which is right — but two of
 *     those abstentions are trials where the wrong element had already won the
 *     ranking and one veto stopped it. A contract that absorbed those would
 *     re-hide exactly what Step 2 exposed.
 *  3. **Near-miss reports `unmeasured`, never `0`,** when the ranking cannot be
 *     read.
 */

interface Tally {
  correct: number;
  abstained: number;
  wrong: number;
  met: number;
  total: number;
}

function emptyTally(): Tally {
  return { correct: 0, abstained: 0, wrong: 0, met: 0, total: 0 };
}

function tallyBy(trials: readonly Trial[], key: (trial: Trial) => string): Map<string, Tally> {
  const tallies = new Map<string, Tally>();
  for (const trial of trials) {
    const id = key(trial);
    const tally = tallies.get(id) ?? emptyTally();
    tally[trial.outcome] += 1;
    if (trial.met) tally.met += 1;
    tally.total += 1;
    tallies.set(id, tally);
  }
  return tallies;
}

function percent(part: number, whole: number): string {
  if (whole === 0) return '—';
  return `${((part / whole) * 100).toFixed(0)}%`;
}

function tableRow(label: string, tally: Tally): string {
  return (
    `| ${label} | ${tally.correct} | ${tally.abstained} | ${tally.wrong} | ` +
    `${tally.met}/${tally.total} | ${percent(tally.met, tally.total)} |`
  );
}

function describeNearMiss(trial: Trial, nearMiss: NearMiss): string[] {
  const rank =
    nearMiss.trueTargetRank === null
      ? 'never scored as a candidate'
      : `ranked #${nearMiss.trueTargetRank}`;
  const gate = nearMiss.marginCleared
    ? `**cleared the tie gate** (margin ${nearMiss.margin.toFixed(2)} >= ${nearMiss.requiredMargin.toFixed(2)})`
    : `held by the tie gate (margin ${nearMiss.margin.toFixed(2)} < ${nearMiss.requiredMargin.toFixed(2)})`;
  const policy = trial.policyId ? ` [policy \`${trial.policyId}\`]` : '';
  return [
    `- **${trial.arm} / ${trial.pageId} / ${trial.mutationId}**${policy} — outcome \`${trial.outcome}\`` +
      (trial.met ? ' (contract met)' : ''),
    `  - ranked 1st: ${nearMiss.leaderDescription ?? '(unknown)'} at durableScore ${nearMiss.leaderDurableScore.toFixed(2)}`,
    `  - author picked: ${trial.expectedDescription ?? '(unknown)'}, ${rank}` +
      (nearMiss.trueTargetDurableScore === null
        ? ''
        : ` at durableScore ${nearMiss.trueTargetDurableScore.toFixed(2)}`),
    `  - gap ${nearMiss.scoreGap.toFixed(2)}, ${gate}`,
    `  - stopped by: \`${nearMiss.veto}\` (reason code \`${trial.reasonCode}\`)`,
  ];
}

/**
 * Near-misses, reported per arm because they mean different things per arm.
 *
 * Arm A is the safety number: the author never answered the disambiguation
 * question, so the evidence ranking *is* the decision, and a wrong leader is one
 * veto away from a wrong click. Arm B's author declared a policy precisely
 * because the ranking should not decide — "always the last one" is an
 * instruction to ignore it — so a wrong leader there is the normal state and
 * says nothing about safety. Merging the two produces a number no one can read.
 */
function formatNearMisses(trials: readonly Trial[], summary: Summary): string[] {
  const lines: string[] = [];
  lines.push('## Near-misses (orthogonal to both contracts)');
  lines.push('');

  if (!RANKING_PROBE_AVAILABLE || summary.nearMissUnmeasured === summary.total) {
    lines.push(
      `**Unmeasured on ${summary.nearMissUnmeasured} of ${summary.total} trials — not zero.** ` +
        'The resolver publishes no candidate ranking and every abstention nulls ' +
        '`element`, so the public result cannot say whether the wrong element won. ' +
        'See `NEAR-MISS-PROBE.md` for the pending one-export proposal and the ' +
        'numbers recorded under it.',
    );
    lines.push('');
    return lines;
  }

  const withNearMiss = (arm: Trial['arm']) =>
    trials
      .filter((trial) => trial.arm === arm)
      .map((trial) => ({ trial, nearMiss: trial.nearMiss }))
      .filter(
        (entry): entry is { trial: Trial; nearMiss: NearMiss } =>
          entry.nearMiss !== null && entry.nearMiss !== 'unmeasured',
      )
      .sort((left, right) => nearMissSeverity(right.nearMiss) - nearMissSeverity(left.nearMiss));

  const armA = withNearMiss('unanswered');
  const armB = withNearMiss('answered');
  const armATotal = trials.filter((trial) => trial.arm === 'unanswered').length;
  const armBTotal = trials.length - armATotal;
  const outscored = armA.filter((entry) => entry.nearMiss.outscored);
  const tied = armA.filter((entry) => !entry.nearMiss.outscored);
  const cleared = armA.filter((entry) => entry.nearMiss.marginCleared);
  const resolved = armA.filter((entry) => entry.trial.state === 'found');

  lines.push(
    `**Arm A: ${armA.length} of ${armATotal} trials ranked the wrong element first** — ` +
      `${outscored.length} where evidence favoured it, ${tied.length} exact ties. ` +
      `${cleared.length} cleared the tie gate, so only a later veto stopped them. ` +
      `${resolved.length} of the ${armA.length} resolved anyway.`,
  );
  lines.push('');
  lines.push(
    `Arm B: ${armB.length} of ${armBTotal}. Not a safety number — the author's ` +
      'policy overrides the ranking by design, so the ranking leading elsewhere is ' +
      'what a declared policy is *for*. Arm B safety is `intent-violated`, scored above.',
  );
  lines.push('');

  if (cleared.length > 0) {
    lines.push(`### The last check standing (Arm A, ${cleared.length})`);
    lines.push('');
    lines.push('| veto | trials |');
    lines.push('| --- | --- |');
    for (const [veto, count] of countBy(cleared.map((entry) => entry.nearMiss.veto))) {
      lines.push(`| \`${veto}\` | ${count} |`);
    }
    lines.push('');
  }

  if (outscored.length > 0) {
    lines.push(`### Evidence favoured the wrong element (Arm A, ${outscored.length})`);
    lines.push('');
    for (const entry of outscored) lines.push(...describeNearMiss(entry.trial, entry.nearMiss));
    lines.push('');
  }
  if (tied.length > 0) {
    // Summarised, not listed: an exact tie is the same fact repeated per
    // mutation — every candidate scores identically and sort order picks one.
    lines.push(`### Exact ties, sort order decided (Arm A, ${tied.length})`);
    lines.push('');
    lines.push('| page | trials |');
    lines.push('| --- | --- |');
    for (const [page, count] of countBy(tied.map((entry) => entry.trial.pageId))) {
      lines.push(`| \`${page}\` | ${count} |`);
    }
    lines.push('');
  }
  return lines;
}

/** Counts by value, largest first. */
function countBy(values: readonly string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

/**
 * Tie-fragility: how many trials sit one rounding change away from resolving.
 *
 * Unlike near-miss this needs no resolver change — `confidence` and
 * `runnerUpConfidence` are already the top two durable scores. It is reported
 * beside the contract, never inside it: an *expected* abstention on a tied page
 * is still a trial where a one-point scoring nudge would produce a confident
 * resolution onto an arbitrary element.
 */
function formatTieFragility(corpus: Corpus): string[] {
  const lines: string[] = [];
  const fragile = corpus.all.filter((trial) => trial.tieFragile);
  lines.push(`## Tie fragility (orthogonal to both contracts) — ${fragile.length}`);
  lines.push('');
  lines.push(
    'Trials whose top two durable scores are within half a point. First place ' +
      'there is decided by sort order, not by evidence, so any scoring change ' +
      'that nudges one candidate converts them into confident resolutions onto ' +
      'an arbitrary element. Step 5b is exactly such a change.',
  );
  lines.push('');
  if (fragile.length === 0) {
    lines.push('None.');
    lines.push('');
    return lines;
  }
  const byPage = new Map<string, number>();
  for (const trial of fragile) {
    const key = `${trial.arm} / ${trial.pageId}${trial.policyId ? ` [${trial.policyId}]` : ''}`;
    byPage.set(key, (byPage.get(key) ?? 0) + 1);
  }
  lines.push('| Arm / page | fragile trials |');
  lines.push('| --- | --- |');
  for (const [key, count] of byPage) lines.push(`| ${key} | ${count} |`);
  lines.push('');
  const resolved = fragile.filter((trial) => trial.outcome !== 'abstained');
  lines.push(
    resolved.length === 0
      ? '> Every fragile trial currently abstains. That is the tie gate holding, and it is the only thing holding.'
      : `> ${resolved.length} fragile trial(s) already resolve rather than abstain.`,
  );
  lines.push('');
  return lines;
}

function formatArm(title: string, note: string, trials: readonly Trial[]): string[] {
  const lines: string[] = [];
  const summary = summarize(trials);
  const intentArm = trials.some((trial) => trial.arm === 'answered');

  lines.push(`## ${title}`);
  lines.push('');
  lines.push(note);
  lines.push('');
  lines.push(
    intentArm
      ? `${summary.total} trials — **${summary.honoured} honoured the author's pick ` +
          `(${percent(summary.honoured, summary.total)})**, ${summary.intentViolated} intent-violated, ` +
          `${summary.abstained} abstained, **${summary.wrong} policy violations**.`
      : `${summary.total} trials — **${summary.met} met contract ` +
          `(${percent(summary.met, summary.total)})**, ${summary.wrong} wrong. ` +
          `Raw outcomes: ${summary.correct} correct, ${summary.abstained} abstained.`,
  );
  lines.push('');

  if (intentArm) {
    lines.push('| Mutation | honoured | abstained | intent-violated | violated policy |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const mutation of ALL_MUTATIONS) {
      const rows = trials.filter((trial) => trial.mutationId === mutation.id);
      if (rows.length === 0) continue;
      const count = (kind: string): number =>
        rows.filter((trial) => trial.intentOutcome === kind).length;
      lines.push(
        `| \`${mutation.id}\` | ${count('honoured')} | ${count('abstained')} | ` +
          `${count('intent-violated')} | ${count('wrong')} |`,
      );
    }
    lines.push('');
    return lines;
  }

  const byMutation = tallyBy(trials, (trial) => trial.mutationId);
  lines.push('| Mutation | correct | abstained | wrong | met | contract |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  // Iterate the declared order, not insertion order, so runs stay diffable.
  for (const mutation of ALL_MUTATIONS) {
    const tally = byMutation.get(mutation.id);
    if (!tally) continue;
    lines.push(tableRow(`\`${mutation.id}\``, tally));
  }
  lines.push('');
  return lines;
}

function formatArmAPages(trials: readonly Trial[]): string[] {
  const lines: string[] = [];
  const byPage = tallyBy(trials, (trial) => trial.pageId);
  lines.push('| Page | correct | abstained | wrong | met | contract |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const page of HOST_PAGES) {
    const tally = byPage.get(page.id);
    if (!tally) continue;
    const label = page.ambiguousWithoutSelection
      ? `\`${page.id}\` (tied — abstention expected)`
      : `\`${page.id}\` (${page.hardness})`;
    lines.push(tableRow(label, tally));
  }
  lines.push('');
  return lines;
}

/** Arm B by policy: the answer to "which policy should we offer". */
function formatPolicies(trials: readonly Trial[]): string[] {
  const lines: string[] = [];
  lines.push('### By declared policy');
  lines.push('');
  lines.push('| Policy | page | honoured | abstained | intent-violated | wrong |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const policyCase of POLICY_CASES) {
    const rows = trials.filter(
      (trial) => trial.policyId === policyCase.id && trial.pageId === policyCase.pageId,
    );
    if (rows.length === 0) continue;
    const count = (kind: string): number =>
      rows.filter((trial) => trial.intentOutcome === kind).length;
    lines.push(
      `| \`${policyCase.id}\` | \`${policyCase.pageId}\` | ${count('honoured')} | ` +
        `${count('abstained')} | ${count('intent-violated')} | ${count('wrong')} |`,
    );
  }
  lines.push('');
  return lines;
}

/**
 * What the compound sample covers, and what it does not.
 *
 * The plan asked for a bounded deterministic set rather than a brute-forced
 * power set, which means the coverage is partial by construction. Printing the
 * gap is the difference between a bounded sample and a silently truncated one.
 */
function formatCompoundCoverage(): string[] {
  const coverage = compoundCoverage();
  const lines: string[] = [];
  lines.push('## Compound mutation coverage');
  lines.push('');
  lines.push(
    `${coverage.chains.length} named compounds over ` +
      `${coverage.frequency.length} atomic classes. Hand-picked, not generated: ` +
      'each names a release a customer could ship in one sprint.',
  );
  lines.push('');
  lines.push('| Compound | chain | contract |');
  lines.push('| --- | --- | --- |');
  for (const chain of coverage.chains) {
    lines.push(
      `| \`${chain.id}\` | ${chain.parts.map((part) => `\`${part}\``).join(' → ')} | ` +
        `${chain.expectation} |`,
    );
  }
  lines.push('');
  lines.push(
    `> Atomic classes reached by no compound (${coverage.uncovered.length}): ` +
      (coverage.uncovered.length === 0
        ? 'none.'
        : `${coverage.uncovered.map((id) => `\`${id}\``).join(', ')}. These were measured ` +
          'alone only — read the compound rows as a sample, never as exhaustive.'),
  );
  lines.push('');
  return lines;
}

/**
 * Adversarial classes, separated from ordinary breakage.
 *
 * These were written to force a `wrong`. An abstention here is the resolver
 * holding under attack and deserves to be read that way, not averaged into the
 * same column as a class rename it was always going to survive.
 */
function formatAdversarial(corpus: Corpus): string[] {
  const adversarial = new Set(
    ALL_MUTATIONS.filter((mutation) => mutation.adversarial).map((mutation) => mutation.id),
  );
  const lines: string[] = [];
  lines.push('## Adversarial classes (written to force a wrong)');
  lines.push('');
  lines.push('| Mutation | arm | trials | held (abstained) | correct | wrong |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const mutation of ALL_MUTATIONS) {
    if (!adversarial.has(mutation.id)) continue;
    for (const [arm, trials] of [
      ['A', corpus.unanswered],
      ['B', corpus.answered],
    ] as const) {
      const rows = trials.filter((trial) => trial.mutationId === mutation.id);
      if (rows.length === 0) continue;
      const held = rows.filter((trial) => trial.outcome === 'abstained').length;
      const correct = rows.filter((trial) => trial.outcome === 'correct').length;
      const wrong = rows.filter(isHardWrong).length;
      lines.push(
        `| \`${mutation.id}\` | ${arm} | ${rows.length} | ${held} | ${correct} | ${wrong} |`,
      );
    }
  }
  lines.push('');
  return lines;
}

/**
 * Shadow DOM and iframe: capability, deliberately not scored.
 *
 * Folding "cannot see across this boundary" into the accuracy percentage would
 * mix a documented limit with a defect. The only alarming column is
 * `landed elsewhere`.
 */
function formatBoundaryProbes(results: readonly BoundaryProbeResult[]): string[] {
  const lines: string[] = [];
  lines.push('## Boundary probes (capability, not scored)');
  lines.push('');
  lines.push('| Probe | state | reason | on target | elsewhere | candidates |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const probe of results) {
    lines.push(
      `| \`${probe.id}\` | \`${probe.state}\` | \`${probe.reasonCode}\` | ` +
        `${probe.landedOnTarget ? 'yes' : 'no'} | ${probe.landedElsewhere ? '**yes**' : 'no'} | ` +
        `${probe.candidateCount} |`,
    );
  }
  lines.push('');
  const boundary = results.filter((probe) => probe.reasonCode === 'unsupported_boundary');
  lines.push(
    boundary.length === 0
      ? '> `unsupported_boundary` was emitted by **none** of these probes. The reason ' +
          'code exists in `@lodariq/schema` and nothing in `sdk-runtime` produces it, so a ' +
          'boundary failure is today indistinguishable from an ordinary miss.'
      : `> \`unsupported_boundary\` fired on ${boundary.length} probe(s).`,
  );
  lines.push('');
  for (const probe of results) {
    lines.push(`- \`${probe.id}\` — ${probe.description}`);
    lines.push(`  - hoped: ${probe.hoped}`);
    if (probe.threw) lines.push(`  - **threw:** ${probe.threw}`);
  }
  lines.push('');
  return lines;
}

export function formatReport(
  corpus: Corpus,
  boundaryProbes: readonly BoundaryProbeResult[] = [],
): string {
  const lines: string[] = [];
  const armA = summarize(corpus.unanswered);
  const armB = summarize(corpus.answered);
  const overall = summarize(corpus.all);

  lines.push('# Targeting accuracy');
  lines.push('');
  lines.push(
    'Two arms, reported separately. **Their totals are never merged**: Arm A ' +
      'measures whether an unanswered target resolves, Arm B whether a declared ' +
      'intent survives. One percentage across both would describe nothing.',
  );
  lines.push('');

  lines.push(
    ...formatArm(
      'Arm A — unanswered (no selection policy)',
      'The author was asked "which of these three?" and never answered. On a ' +
        'look-alike page the contract is therefore **abstain**, and resolving is ' +
        'the failure — the resolver would be guessing.',
      corpus.unanswered,
    ),
  );
  lines.push(...formatArmAPages(corpus.unanswered));

  lines.push(
    ...formatArm(
      'Arm B — answered (author supplied a selection policy)',
      'Scored on whether the declared intent survived. `intent-violated` means ' +
        'the resolver obeyed its rule and the page moved underneath — a finding ' +
        'about the policy, not a defect. `wrong` still means resolving against ' +
        'its own rule.',
      corpus.answered,
    ),
  );
  lines.push(...formatPolicies(corpus.answered));

  const wrongTrials = corpus.all.filter(isHardWrong);
  lines.push(`## Wrong resolutions (${wrongTrials.length})`);
  lines.push('');
  if (wrongTrials.length === 0) {
    lines.push('None in either arm.');
  } else {
    for (const trial of wrongTrials) {
      lines.push(`- **${trial.arm} / ${trial.pageId} / ${trial.mutationId}**`);
      lines.push(`  - expected: ${trial.expectedDescription ?? '(unknown)'}`);
      lines.push(`  - hit:      ${trial.resolvedDescription ?? '(nothing)'}`);
      lines.push(
        `  - confidence ${trial.confidence.toFixed(2)}, ${trial.candidateCount} candidates, ` +
          `reason \`${trial.reasonCode}\`, evidence [${trial.evidenceFamilies.join(', ')}]`,
      );
    }
  }
  lines.push('');

  lines.push(...formatAdversarial(corpus));
  lines.push(...formatNearMisses(corpus.all, overall));
  lines.push(...formatTieFragility(corpus));
  lines.push(...formatCompoundCoverage());
  if (boundaryProbes.length > 0) lines.push(...formatBoundaryProbes(boundaryProbes));

  const missed = corpus.unanswered.filter(
    (trial) => trial.outcome === 'abstained' && trial.expectedOutcome === 'correct',
  );
  lines.push(`## Arm A missed recoverable (${missed.length})`);
  lines.push('');
  lines.push(
    'Abstentions where the contract expected a resolution. Excludes the tied ' +
      'pages, whose abstentions are now correct by contract rather than backlog.',
  );
  lines.push('');
  if (missed.length === 0) {
    lines.push('None.');
  } else {
    // Ranked by mutation class: the biggest bucket is the cheapest thing to fix.
    const ranked = ALL_MUTATIONS.map((mutation) => ({
      mutation,
      hits: missed.filter((trial) => trial.mutationId === mutation.id),
    }))
      .filter((entry) => entry.hits.length > 0)
      .sort((left, right) => right.hits.length - left.hits.length);
    for (const entry of ranked) {
      lines.push(`- **${entry.mutation.id}** (${entry.hits.length})`);
      for (const trial of entry.hits) {
        lines.push(`  - ${trial.pageId}: \`${trial.state}\` / \`${trial.reasonCode}\``);
      }
    }
  }
  lines.push('');
  lines.push(
    `_Arm A ${armA.met}/${armA.total} contract, Arm B ${armB.met}/${armB.total} contract, ` +
      `${POLICY_PROBE_PAGES.length} Arm B-only probe fixture(s)._`,
  );
  lines.push('');

  return lines.join('\n');
}
