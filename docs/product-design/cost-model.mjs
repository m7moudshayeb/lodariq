import process from 'node:process';

/**
 * Lodariq unit-cost and pricing model.
 *
 * Supports `docs/product-design/positioning-and-pricing.md` §9. Every input is a
 * named constant so it can be argued with and replaced by measurement. Nothing
 * here is fetched or inferred at runtime — change the numbers, re-run, and the
 * document's tables regenerate.
 *
 *   node docs/product-design/cost-model.mjs
 *   node docs/product-design/cost-model.mjs --sensitivity
 *
 * Gross margin only. Salaries, CAC and R&D are deliberately excluded.
 */

// ── billing ────────────────────────────────────────────────────────────────
/** Paddle acts as Merchant of Record; the 5% includes global VAT/sales tax handling. */
export const PADDLE = {
  rate: 0.05,
  /** Per checkout transaction — 12× a year on monthly billing, once on annual. */
  fixedPerTransaction: 0.5,
};

/** Annual discount. 15% costs ~0.3pt of margin; 20% costs ~1.5pt. */
export const ANNUAL_DISCOUNT = 0.15;

// ── variable infrastructure, per engaged user per month ────────────────────
/**
 * Artifacts are content-addressed, so they cache indefinitely: one cold load per
 * user per month is the worst case. Preview compilation (ADR-0003), style
 * sampling (ADR-0013) and predictive QA all run in the creator's browser, so the
 * expensive compute never reaches our infrastructure.
 */
export const INFRA = {
  kilobytesPerEngagedUser: 100,
  /** Cloudflare R2 / Bunny-class egress. */
  cdnUsdPerGb: 0.01,
  /**
   * Default event volume. Overridden per tier — analytics DEPTH is a tier
   * feature (§10), so Growth and above legitimately generate more events.
   */
  eventsPerEngagedUser: 8,
  bytesPerEvent: 200,
  postgresUsdPerGbMonth: 0.15,
  ingestUsdPerMillionEvents: 0.4,
};

const KB = 1024 ** 2;
const GB = 1024 ** 3;

/** Marginal infrastructure cost of one engaged user for one month. */
export function infraCostPerEngagedUser(
  retentionMonths,
  eventMultiplier = 1,
  eventsPerUser = INFRA.eventsPerEngagedUser,
) {
  const events = eventsPerUser * eventMultiplier;
  const cdn = (INFRA.kilobytesPerEngagedUser / KB) * INFRA.cdnUsdPerGb;
  // Raw events for the first month, daily rollups thereafter (~95% smaller).
  const bytes = PRE_AGGREGATE
    ? events * INFRA.bytesPerEvent * (1 + 0.05 * Math.max(0, retentionMonths - 1))
    : events * INFRA.bytesPerEvent * retentionMonths;
  const storage = (bytes / GB) * INFRA.postgresUsdPerGbMonth;
  const ingest = (events / 1_000_000) * INFRA.ingestUsdPerMillionEvents;
  return cdn + storage + ingest;
}

/**
 * Roll raw events into daily aggregates after 30 days. Cuts long-retention
 * storage by ~95% and is the reason 24-month retention is affordable.
 */
export const PRE_AGGREGATE = true;

// ── AI, per unit of work, server side only ─────────────────────────────────
export const AI_UNIT_COST = {
  themeGeneration: 0.01, // token derivation only; the render is client-side
  copyRewrite: 0.0006,
  draftStep: 0.001,
  translateExperience: 0.002,
  narrationPerTour: 0.04, // ~2,400 characters at the cheap TTS tier
};

// ── fixed platform ─────────────────────────────────────────────────────────
export const FIXED_PLATFORM = {
  'api (2 instances)': 60,
  'dashboard (2 instances)': 30,
  'editor origin / CDN': 8,
  'postgres HA + disk': 140,
  'object storage (R2)': 12,
  'monitoring + logs': 25,
  'domains, certs, misc': 20,
};
export const FIXED_PLATFORM_TOTAL = Object.values(FIXED_PLATFORM).reduce((a, b) => a + b, 0);

/** Blended cost of an hour of human support. The riskiest input in the model. */
export const SUPPORT_USD_PER_HOUR = 25;

// ── the plan ───────────────────────────────────────────────────────────────
/**
 * `utilisation` is the share of the allowance an average account actually uses.
 * `supportMinutes` is per account per month — measure this first; it is the only
 * line that can take a tier below 75%.
 */
export const TIERS = [
  {
    name: 'Free',
    monthly: 0,
    engagedUserAllowance: 1_000,
    utilisation: 0.35,
    retentionMonths: 0.25,
    supportMinutes: 0,
    eventsPerEngagedUser: 8,
    ai: { themeGeneration: 1, copyRewrite: 10 },
  },
  {
    name: 'Starter',
    monthly: 99,
    engagedUserAllowance: 15_000,
    utilisation: 0.4,
    retentionMonths: 1,
    supportMinutes: 9,
    eventsPerEngagedUser: 12, // guidance only: views, steps, completion, dismissal
    ai: { themeGeneration: 1, copyRewrite: 60, draftStep: 30 },
  },
  {
    name: 'Growth',
    monthly: 349,
    engagedUserAllowance: 75_000,
    utilisation: 0.45,
    retentionMonths: 12,
    supportMinutes: 30,
    eventsPerEngagedUser: 45, // + adoption impact, segments, funnels, A/B arms
    ai: { copyRewrite: 200, draftStep: 100, translateExperience: 40 },
  },
  {
    name: 'Scale',
    monthly: 899,
    engagedUserAllowance: 300_000,
    utilisation: 0.45,
    retentionMonths: 24,
    supportMinutes: 55,
    eventsPerEngagedUser: 80, // + cohorts, custom attributes, export
    ai: { copyRewrite: 400, draftStep: 200, translateExperience: 120, narrationPerTour: 20 },
  },
  {
    name: 'Business',
    monthly: 1_900,
    engagedUserAllowance: 1_000_000,
    utilisation: 0.4,
    retentionMonths: 24,
    supportMinutes: 110,
    eventsPerEngagedUser: 120, // + warehouse sync, raw export
    ai: { copyRewrite: 800, draftStep: 400, translateExperience: 300, narrationPerTour: 60 },
  },
];

/** Share of paying customers on each tier. Drives the blended figures. */
export const CUSTOMER_MIX = { Starter: 0.42, Growth: 0.34, Scale: 0.17, Business: 0.07 };

/** Free-to-paid conversion, used to size the free base behind a paying cohort. */
export const FREE_TO_PAID_CONVERSION = 0.015;

// ── costing ────────────────────────────────────────────────────────────────
export function costTier(
  tier,
  { annual = false, eventMultiplier = 1, supportMultiplier = 1 } = {},
) {
  const effectiveMonthly = annual ? tier.monthly * (1 - ANNUAL_DISCOUNT) : tier.monthly;
  const engagedUsers = tier.engagedUserAllowance * tier.utilisation;

  const infra =
    infraCostPerEngagedUser(tier.retentionMonths, eventMultiplier, tier.eventsPerEngagedUser) *
    engagedUsers;
  const ai = Object.entries(tier.ai).reduce(
    (total, [unit, count]) => total + AI_UNIT_COST[unit] * count,
    0,
  );
  const support = (SUPPORT_USD_PER_HOUR * tier.supportMinutes * supportMultiplier) / 60;

  let paddle = 0;
  if (effectiveMonthly > 0) {
    paddle = annual
      ? (effectiveMonthly * 12 * PADDLE.rate + PADDLE.fixedPerTransaction) / 12
      : effectiveMonthly * PADDLE.rate + PADDLE.fixedPerTransaction;
  }

  const cogs = infra + ai + support + paddle;
  return {
    effectiveMonthly,
    engagedUsers,
    infra,
    ai,
    support,
    paddle,
    cogs,
    grossMargin: effectiveMonthly > 0 ? (effectiveMonthly - cogs) / effectiveMonthly : null,
  };
}

// ── reporting ──────────────────────────────────────────────────────────────
const usd = (n, dp = 2) => `$${n.toFixed(dp)}`;
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const pad = (v, w, right = true) => (right ? String(v).padStart(w) : String(v).padEnd(w));
const rule = (label) => {
  console.log(`\n${'='.repeat(96)}`);
  console.log(label);
  console.log('='.repeat(96));
};

function reportPlan(annual) {
  rule(annual ? `PLAN — ANNUAL BILLING (−${pct(ANNUAL_DISCOUNT)})` : 'PLAN — MONTHLY BILLING');
  console.log(
    pad('Tier', 10, false) +
      pad('Price', 8) +
      pad('Allowance', 12) +
      pad('Ev/u', 7) +
      pad('Infra', 9) +
      pad('AI', 8) +
      pad('Support', 10) +
      pad('Paddle', 9) +
      pad('COGS', 9) +
      pad('GM', 9),
  );
  for (const tier of TIERS) {
    const c = costTier(tier, { annual });
    if (tier.monthly === 0) {
      if (annual) continue;
      console.log(
        pad(tier.name, 10, false) +
          pad('$0', 8) +
          pad(tier.engagedUserAllowance.toLocaleString(), 12) +
          pad(tier.eventsPerEngagedUser, 7) +
          pad(usd(c.infra, 3), 9) +
          pad(usd(c.ai, 3), 8) +
          pad(usd(c.support), 10) +
          pad('—', 9) +
          pad(usd(c.cogs), 9) +
          pad('cost', 9),
      );
      continue;
    }
    console.log(
      pad(tier.name, 10, false) +
        pad(usd(c.effectiveMonthly, 0), 8) +
        pad(tier.engagedUserAllowance.toLocaleString(), 12) +
        pad(tier.eventsPerEngagedUser, 7) +
        pad(usd(c.infra, 3), 9) +
        pad(usd(c.ai, 3), 8) +
        pad(usd(c.support), 10) +
        pad(usd(c.paddle), 9) +
        pad(usd(c.cogs), 9) +
        pad(pct(c.grossMargin), 9),
    );
  }
}

function reportBusiness() {
  const byName = Object.fromEntries(TIERS.map((t) => [t.name, t]));
  let blendedMrr = 0;
  let blendedCogs = 0;
  for (const [name, weight] of Object.entries(CUSTOMER_MIX)) {
    const tier = byName[name];
    blendedMrr += tier.monthly * weight;
    blendedCogs += costTier(tier).cogs * weight;
  }

  rule('BUSINESS AT SCALE');
  console.log(
    `  mix                     ${Object.entries(CUSTOMER_MIX)
      .map(([n, w]) => `${pct(w)} ${n}`)
      .join(' · ')}`,
  );
  console.log(`  blended MRR / customer  ${usd(blendedMrr)}   (ACV ${usd(blendedMrr * 12, 0)})`);
  console.log(`  blended gross margin    ${pct((blendedMrr - blendedCogs) / blendedMrr)}\n`);

  const freeCostPerAccount = costTier(byName.Free).cogs;
  console.log(
    pad('Customers', 11) +
      pad('MRR', 13) +
      pad('ARR', 14) +
      pad('Var COGS', 12) +
      pad('Fixed', 8) +
      pad('Free', 10) +
      pad('Net GM', 10),
  );
  for (const customers of [25, 50, 100, 250, 500, 1_000]) {
    const freeAccounts = (customers / FREE_TO_PAID_CONVERSION) * (1 - FREE_TO_PAID_CONVERSION);
    const freeCost = freeAccounts * freeCostPerAccount;
    const mrr = customers * blendedMrr;
    const variable = customers * blendedCogs;
    const net = (mrr - variable - FIXED_PLATFORM_TOTAL - freeCost) / mrr;
    console.log(
      pad(customers.toLocaleString(), 11) +
        pad(usd(mrr, 0), 13) +
        pad(usd(mrr * 12, 0), 14) +
        pad(usd(variable, 0), 12) +
        pad(usd(FIXED_PLATFORM_TOTAL, 0), 8) +
        pad(usd(freeCost, 0), 10) +
        pad(pct(net), 10),
    );
  }
}

function reportFixed() {
  rule('FIXED PLATFORM');
  for (const [item, cost] of Object.entries(FIXED_PLATFORM)) {
    console.log(`  ${pad(item, 28, false)}${pad(usd(cost, 0), 8)}`);
  }
  console.log(`  ${pad('TOTAL', 28, false)}${pad(usd(FIXED_PLATFORM_TOTAL, 0), 8)} / month`);
}

function reportSensitivity() {
  rule('SENSITIVITY — analytics volume (infrastructure barely matters)');
  console.log(pad('Tier', 10, false) + pad('1×', 10) + pad('5×', 10) + pad('20×', 10));
  for (const tier of TIERS.filter((t) => t.monthly > 0)) {
    const cells = [1, 5, 20].map((m) => pct(costTier(tier, { eventMultiplier: m }).grossMargin));
    console.log(pad(tier.name, 10, false) + cells.map((c) => pad(c, 10)).join(''));
  }

  rule('SENSITIVITY — support load (the only real risk)');
  console.log(pad('Tier', 10, false) + pad('as modelled', 14) + pad('2×', 10) + pad('4×', 10));
  for (const tier of TIERS.filter((t) => t.monthly > 0)) {
    const cells = [1, 2, 4].map((m) => pct(costTier(tier, { supportMultiplier: m }).grossMargin));
    console.log(
      pad(tier.name, 10, false) + pad(cells[0], 14) + pad(cells[1], 10) + pad(cells[2], 10),
    );
  }

  rule('FREE TIER — the single biggest cost decision');
  const free = TIERS.find((t) => t.name === 'Free');
  for (const [minutes, label] of [
    [0, 'community + docs only'],
    [2, '2 min human support'],
  ]) {
    const cost = costTier({ ...free, supportMinutes: minutes }).cogs;
    console.log(
      `  ${pad(label, 26, false)}${pad(usd(cost, 3), 10)} / account   ` +
        `at 10,000 accounts = ${usd(cost * 10_000, 0)} / month`,
    );
  }

  rule('THE ONE CLIFF — session replay');
  const growth = TIERS.find((t) => t.name === 'Growth');
  for (const [events, label] of [
    [growth.eventsPerEngagedUser, 'as planned (adoption analytics)'],
    [400, 'full product analytics'],
    [10_000, 'session replay (~2MB/session)'],
  ]) {
    const gm = costTier({ ...growth, eventsPerEngagedUser: events }).grossMargin;
    console.log(
      `  ${pad(label, 34, false)}${pad(events.toLocaleString() + ' ev/user', 18)}  GM ${pct(gm)}`,
    );
  }

  rule('WHERE INFRASTRUCTURE WOULD EVER MATTER');
  for (const [months, label] of [
    [1, '1-month retention'],
    [12, '12-month'],
    [24, '24-month'],
  ]) {
    const per = infraCostPerEngagedUser(months);
    console.log(
      `  ${pad(label, 20, false)}${pad(usd(per * 1e6), 10)} per 1M engaged users` +
        `   →  1% of a $349 plan = ${Math.round(3.49 / per).toLocaleString()} users/mo`,
    );
  }
}

function main() {
  reportPlan(false);
  reportPlan(true);
  reportFixed();
  reportBusiness();
  if (process.argv.includes('--sensitivity')) reportSensitivity();
  else console.log('\nRun with --sensitivity for stress tests.\n');
}

main();
