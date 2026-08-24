# Lodariq — Positioning and Pricing (v2)

Status: proposal
Date: 2026-08-17
Supersedes: v1 of the same date · §8 supersedes §3.4 · §9 is the costed final plan · §10 corrects the analytics scoping
Inputs: category research, Vendr closed-contract data, competitor pricing pages, Supademo reported figures, `docs/plans/authoring-ux-model.md`, ADR-0013/0014/0015/0016

---

## 0. Why there is a v2

v1 had three problems, and they were mine, not the research's.

1. **False precision.** "$18,000 enterprise floor", "$6,000 per additional application", "25 credits for theme generation" were presented as derived figures. They were judgment calls with invented decimal places. A number stated confidently gets treated as evidence by whoever reads it next — including you, in six months, when you've forgotten I made it up.
2. **An unverified claim carrying the whole strategy.** v1 made reliability the moat and asserted your resolver beats the category. I have read the ADR describing what it should do. I have never seen it run against a real redesign. That claim is the load-bearing wall of the positioning and it is currently unmeasured.
3. **I suppressed a real flaw in my own recommendation.** "Never charge for your users" is a great marketing line. It is also how you end up with no expansion revenue. v1 did not mention that. §3.2 now does.

Everything below is graded. Nothing is stated more confidently than the evidence supports.

### Evidence grades used throughout

| Grade   | Meaning                                                                                               |
| ------- | ----------------------------------------------------------------------------------------------------- |
| **[E]** | Evidenced — published competitor docs, reviews, closed-contract data, or something I ran and measured |
| **[J]** | Judgment — reasoned from evidence, but a different reasonable person could land elsewhere             |
| **[G]** | Guess — a placeholder that needs validation before you rely on it                                     |
| **[U]** | Unverified — a claim about Lodariq I have taken from your own docs without testing                    |

---

## 1. Positioning

### 1.1 What the category has documented about itself — all [E]

Quoted from competitor documentation and reviews, not invented:

- **"No-code" that isn't.** WalkMe reviewers: _"you need a solid understanding of CSS, HTML, and jQuery."_ Chameleon's own docs: _"Custom CSS takes precedence over any other point-and-click styling changes."_ Intercom's own docs: _"robust tour targeting ultimately requires collaboration between marketing teams and developers."_
- **Two tools, not one.** Usetiful's own documentation concedes its flow _"creates a deliberate context transition rather than a seamless single-interface experience."_
- **Guides that quietly break.** Pendo reviewers: _"guides can become hard to manage and update with time, and you might end up needing to create the guides from scratch."_

These three are solid. Build the messaging on them.

### 1.2 The three claims, honestly graded

| Claim                                                                           | Grade                                       | What actually backs it                                                                                                                               | What's missing                                                                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **One surface — authoring, targeting, theme, review, release all on your page** | **[E] for the gap · [U] for your delivery** | Every competitor splits these; several concede it in their own docs. Your model doc and the shipped inspector/mode-pill/Operations work make it real | Nobody outside your team has used it. No usability evidence yet                                                         |
| **No code after install**                                                       | **[E] for the gap · [U] for your delivery** | ADR-0013 forbids persisting raw CSS; targeting never exposes selectors (ADR-0016). The constraint is architectural, not a promise                    | Untested against a real customer's awkward app. The first enterprise that demands a CSS override is the real test       |
| **Doesn't break silently**                                                      | **[U] — the weak one**                      | Your ADR-0016 describes selector-free capture, independent evidence gates, semantic scoring, drift notification                                      | **No measurement exists.** I have never seen a resolution rate. Competitors' weakness here is [E]; your strength is not |

**Do not lead with claim 3 until §5 is done.** It is your best differentiator _if true_, and a refund request _if false_. Every prospect will test it on their own app — which is the right outcome, but it means the engine has to be genuinely good before the claim is loud.

Lead with claims 1 and 2 now. They are demonstrable in a thirty-second screen share and neither can be falsified by a redesign.

### 1.3 Statement

> **Install Lodariq once. After that, nobody touches code again.**
>
> Build tours, announcements, hotspots and checklists directly on your own product, in the page where they'll appear. No second dashboard, no browser extension, no CSS, no selectors.

Add the reliability line only once you can put a number on it:

> _"When your UI changes, Lodariq tells you which steps need attention — we resolve N% of targets across redesigns, and we show you the rest."_

### 1.4 Head-to-head — corrected

v1's battlecard contained strawmen. Fixed:

| Against                             | Honest read                                                                                                 | What you actually say                                                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pendo**                           | Their analytics are genuinely good and many buyers want the bundle. Attacking that is a losing argument [J] | "If you need product analytics, they're a real product. If you already have Amplitude or Mixpanel, you're paying twice — and you'd still be billed for every user who logs in."         |
| **Appcues / Userpilot**             | Closest real competitors. Feature parity is not on your side yet [J]                                        | "Same jobs. Ours stays no-code after the first deploy, and we don't bill you for users who never saw a guide."                                                                          |
| **Chameleon**                       | SSO at $400/mo on top of Pro is [E] and indefensible                                                        | "Their own docs say custom CSS overrides the point-and-click. And SSO isn't an add-on with us."                                                                                         |
| **WalkMe / Whatfix**                | Different delivery model entirely. Do not claim their ground                                                | "If you're guiding software you didn't build, use them — we can't install into Salesforce. If you're guiding software you did build, you don't need an agent or a services engagement." |
| **Storylane / Navattic / Supademo** | Pre-sale, different buyer and budget                                                                        | Don't position against. Partner or ignore.                                                                                                                                              |
| **Build in-house**                  | The honest competitor for most of your target market [J]                                                    | "The tooltips are two days. Keeping them pointing at the right thing through every redesign is the product."                                                                            |

v1 also claimed competitors "cannot copy" the no-CSS approach. **That was speculation stated as fact.** They could; it would be painful because their enterprise customers now depend on the escape hatch, which is a real switching cost — but "painful" is not "cannot." [J]

---

## 2. Segment scoping — unchanged and still important [E]

**"Enterprise internal adoption" cannot mean third-party SaaS for Lodariq.** WalkMe and Whatfix overlay applications the customer does not control. That is an extension or injected-agent problem. Your SDK only runs where someone can add a script tag.

Your second segment is enterprises guiding **software they built themselves** — internal portals, admin consoles, ops tools. Real, underserved, different pitch. Not the WalkMe market. Any positioning implying otherwise dies in the first technical call.

---

## 3. Pricing

### 3.1 The one thing I'm confident about [E]

**MAU pricing as competitors implement it is the category's biggest buyer grievance, and it is self-inflicted.**

Appcues counts every user who signs in — including anonymously-tracked ones — on a rolling 30-day basis, and on overage applies a prorated tier upgrade _across all remaining contract months_. Chameleon adds 20–40% overage. Buyers are billed for **reach**, not for **value delivered**.

That is the grievance. Note precisely what it is: not "reach-based pricing is wrong," but **"I'm billed for people who never saw anything, and I can't predict the bill."**

v1 leapt from that to "price on seats, users unlimited." That was too fast.

### 3.2 The flaw v1 hid

If users are unlimited, **where does expansion revenue come from?**

Pendo runs >130% NRR [E] largely _because_ MAU pricing expands automatically as the customer grows. Remove it and your expansion vectors are:

- **Creator seats** — weak. Guidance is authored by very few people. A 500-person company might have 3 authors forever [J]
- **Applications** — real, but enterprise-only
- **AI credits** — small, and usage-based revenue is volatile
- **Locales** — one-time step-ups, not compounding

**A pure seat model likely lands you at ~100% NRR.** [J] For a bootstrapped business that may be acceptable — Supademo appears to run this way at $1.3K average ACV [E, self-reported] — but it is a materially different company from one with a growth-aligned value metric, and v1 recommended it without saying so.

### 3.3 Three honest options

|                    | **A. Pure seats**                  | **B. Engaged users**                                              | **C. Applications + seats**                       |
| ------------------ | ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| Meter              | Creator seats, unlimited end users | Users who **actually saw** a Lodariq experience                   | Applications instrumented + creator seats         |
| Grievance solved?  | Completely                         | **Yes — this is the actual complaint**                            | Completely                                        |
| Expansion          | Weak [J]                           | **Strong, and value-aligned**                                     | Moderate; enterprise-heavy                        |
| Predictability     | Perfect                            | Good — scales with your own usage, not traffic                    | Perfect                                           |
| Marketing line     | "We don't charge for your users"   | "You only pay for users we actually helped"                       | "Pay per app, not per person"                     |
| Risk               | ~100% NRR [J]                      | Requires trustworthy engagement counting; adds a metering surface | Undersells the SaaS segment, where app count is 1 |
| Your cost exposure | Analytics storage only [U]         | Same                                                              | Same                                              |

**My recommendation is B, not A.** [J] It answers the real grievance more precisely than A does, it keeps a value metric that grows with the customer, and it is a _better_ marketing line: _"Appcues bills you for everyone who logs in. We bill you for people we actually helped."_ That is sharper than "unlimited," and it's honest.

The cost of B is that you must count engaged users credibly and show the number live in-product, or you inherit the unpredictability grievance you're attacking.

**Caveat I can't resolve for you [U]:** v1 asserted your marginal cost per end user is "effectively zero" because the runtime is a static artifact. That's plausible but I have not seen your analytics pipeline or event volumes, and predictive QA plus the Check report imply real data collection. **Model this before committing to any unlimited-anything promise.**

### 3.4 The ladder — a hypothesis, not a plan [G]

Everything in this table is a **starting point to be tested**, not a derived answer. I am showing it because a concrete anchor is easier to react to than an empty grid.

|                          | Free | Starter | Growth | Scale     | Enterprise |
| ------------------------ | ---- | ------- | ------ | --------- | ---------- |
| Monthly **[G]**          | $0   | ~$79    | ~$249  | ~$649     | quote      |
| Creator seats **[J]**    | 1    | 3       | 10     | 25        | unlimited  |
| Live experiences **[J]** | 1    | 10      | 50     | unlimited | unlimited  |
| Engaged users/mo **[G]** | 500  | 5,000   | 50,000 | 250,000   | custom     |

**What's actually reasoned here [J], and worth keeping regardless of the numbers:**

- **The gap is real.** Competitor entry points cluster at $72–299/mo and their next tier jumps to $625–849. Storylane goes $50 → $625 (12.5×); Chameleon $279 → $750; Userpilot $299 → $849 [E]. **A ladder with no cliff is a genuine wedge**, whatever the specific prices.
- **Four paid steps, not two**, so nobody hits a wall that makes them shop.
- **Free tier is distribution, not pricing.** Supademo converts 200,000 free users to 3,000 paying at ~1.5% [E, self-reported]. The funnel only works at that volume.

**What is not reasoned [G]:** every specific number. $79 vs $89 vs $99 has no basis. The engaged-user allowances are invented. **Validate before publishing** — §5.2.

**On the enterprise floor:** v1 said "publish $18,000/year." I made that number up. What I can defend [E] is that Vendr medians for adjacent products run $11K–49K and that published floors convert better than "Contact us." **Set the floor from your own first three enterprise conversations, not from my guess.**

### 3.5 AI credits [G except where noted]

Metering AI separately is the emerging category standard [E]: Userflow's Adoption Agent at $100/mo for 500 credits, Supademo at $0.50–0.80 per qualified demo, Arcade's monthly grants.

**Every credit allocation in v1 was fabricated.** I have no cost model for your AI calls. What I can say:

- Narration generation is genuinely cheap [E, from TTS vendor pricing]: ~2,400 characters for a 12-step tour ≈ $0.04 on OpenAI TTS-1. The cost that matters is **regeneration churn**, so cache by hash of `(script, voice, model, speed)`.
- Avatar video is 20–100× more expensive — HeyGen publishes $1–5/minute [E]. Out of scope until demand exists.
- **Build the cost model first**, then set credits so that ordinary work never feels metered. The moment a creator hesitates before clicking "Clearer," the feature is dead [J].

### 3.6 Packaging — the part of v1 I still stand behind [J]

Two rules, and these are the durable content:

**Never gate reliability.** Semantic targeting, verification states, approach recipes, drift detection, repair proposals — all tiers including Free. If a free user's tour breaks silently, your central claim is false to the exact people most likely to talk about you.

**Never gate no-code.** No "advanced targeting" tier requiring selectors. No CSS escape hatch sold as an upgrade. There is no version of Lodariq that needs a developer.

Gate on **team size, content volume, governance, retention, AI usage** — never on reach and never on anything that sends a customer back to their dev team.

Three specific calls I'd keep:

- **SSO at the middle tier, never an add-on.** Chameleon's $400/mo SSO charge is [E] and is free marketing for you on every comparison page.
- **Predictive layout QA low, not high.** It's your most novel feature and appears to be uncontested [E-ish — see §4]. Novel features belong low when you're the challenger; gate high only when defending ACV.
- **Presence before locking.** Presence removes most conflicts socially and is cheap; locking is the expensive half and a genuine larger-team need.

---

## 4. Claims I overstated in v1, corrected

| v1 said                                                                                               | Reality                                                            | Corrected claim                                                                        |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| "Nobody ships predictive layout QA"                                                                   | Research found _no confirmed example_. That is absence of evidence | "We found no competitor shipping this. Worth verifying before putting it in marketing" |
| "No DAP shows match count during hover"                                                               | Same shape of claim                                                | Same correction                                                                        |
| Your resolver "is genuinely stronger than the selector-string engines the rest of the category ships" | I read your ADR. I have never seen it run                          | **Unverified.** §5.1 is how you earn the right to say it                               |
| Competitors "cannot copy this"                                                                        | They could; it would be costly                                     | "Expensive for them to copy — their enterprise customers depend on the escape hatch"   |
| "Marginal cost per end user is effectively zero"                                                      | Plausible, but I haven't seen your infrastructure                  | Model it before promising anything unlimited                                           |
| "$18,000/yr floor + $6,000/app + $6,000 governance + $9,000 support"                                  | Invented, with false precision                                     | Derive from your first enterprise conversations                                        |

---

## 5. What to do before publishing any of this

### 5.1 Measure the resolver — this gates the whole positioning

The reliability claim is your best asset and currently your least evidenced. Make it a number:

1. Take 10–20 real applications — your design partners' products, plus open-source apps with git history.
2. Author a 6-step tour against an older commit.
3. Replay against a later commit that includes a real redesign.
4. Record: **resolved / needs context / not found**, per step, and false-positive rate (resolved to the _wrong_ element — the dangerous one).
5. Repeat across framework families: React with hashed CSS-in-JS, Angular scoped styles, Tailwind, server-rendered.

Publish the number, whatever it is. "94% across redesigns, and we tell you about the other 6%" is a far stronger claim than "reliable," and it's checkable — which is exactly why it converts.

**If the number is bad, you've learned it before a customer did**, and the positioning shifts to claims 1 and 2 while you fix it.

### 5.2 Validate the prices with the design partners you already have

You said clients are asking for this. That's a pricing research panel you already own. Cheap and standard:

- **Van Westendorp** on four questions per tier (too cheap / cheap / expensive / too expensive) with 8–12 partners
- **Ask what they pay today** for Appcues, Pendo, Intercom, or the internal engineering time this replaces — the substitution price is more informative than a willingness-to-pay abstraction
- **Sell before you build the billing.** Quote three partners at your Growth number and see whether they flinch. A signature validates a price; a survey doesn't

**Charge your design partners.** Free ones give polite feedback. Paying ones give accurate feedback and validate the number simultaneously.

### 5.3 Build the cost model

Per-account: analytics events stored, artifact delivery, AI calls. You need this before "unlimited" or an engaged-user allowance means anything.

### 5.4 Build the ungated free tool

Supademo's ungated free tools drove **"50% if not more of our traffic" at 11–12% signup conversion** [E, founder interview]. Your version: paste a URL, get a generated brand theme and a working tour targeted at real elements on your real product, in under a minute, no signup.

It demonstrates the two hard things on the prospect's own application. Supademo has no equivalent, because capture-based demos cannot say anything about surviving a redesign.

Treat it as launch-blocking. **But build it after §5.1**, so it demonstrates something you've measured.

---

## 6. What would change my mind

- **If the resolver benchmark comes back below ~85%** [G threshold], reliability is not the moat and positioning should lead entirely on the authoring experience, which is demonstrable today.
- **If design partners are indifferent to MAU pricing**, the whole §3 thesis weakens and you should price the conventional way and compete on UX alone.
- **If your analytics costs scale meaningfully per end user**, option B in §3.3 becomes the only viable one and "unlimited" leaves the vocabulary.
- **If enterprise deals arrive first** rather than self-serve, the ladder inverts: lead with the app-based model and treat self-serve as marketing.

---

## 7. Revenue shape [J], from the Supademo comp

Supademo: **$4M ARR, ~$1.3K average ACV, 3,000 paying orgs, 30% EBITDA, on $1M raised, in three years** [E, self-reported by the company].

The correction that matters: **Vendr medians ($11K–49K) are a censored sample.** Vendr only observes contracts large enough to route through procurement. The real self-serve distribution is dominated by $1–3K accounts with a thin six-figure tail — Supademo's own $1.3K-average against a $40K-largest shows exactly that shape.

Plan for **many customers at low ACV, not few at high**. That is a support-and-content company, not a sales company — different hiring, different onboarding, no field sales. Get that wrong and you build the wrong org around the right product.

---

## 8. Revised ladder — §3.4 was too cheap and had no growth engine

Added after modelling the MRR. §3.4's numbers are withdrawn; this replaces them.

### 8.1 Two errors, both mine

**Error 1 — the ceiling was below competitors' mid tiers.** I optimised for winning the $200–800 gap and built a ladder that tops out at $649. Appcues' Growth tier is ~$879/mo, Userpilot's starts at $849, Chameleon's Growth starts at $1,250 [E]. My _highest self-serve tier_ sat under where competitors _begin_ charging seriously. A challenger should undercut the entry point, not the ceiling.

**Error 2 — I used Supademo as the ACV comp.** Supademo is a _demo_ tool: pre-sale, marketing budget, lower stakes, $1.3K average ACV [E, self-reported]. Lodariq is onboarding infrastructure — it touches activation and retention, which is a product-or-exec-level budget. **The right ACV comps are Appcues and Userpilot: $15K and $11.3K Vendr medians** [E]. Supademo remains the right comp for _operating model_ (bootstrapped, capital-efficient, content-led) and the wrong one for _price_.

Net effect: v2 asked you to build a business that needs ~1,800 customers to reach $4M and can never expand an account.

### 8.2 What the model says

Blended MRR per customer, at a plausible tier mix:

|                                        | v2 ladder | Revised    |
| -------------------------------------- | --------- | ---------- |
| Blended MRR / customer                 | **$187**  | **$443**   |
| Implied ACV                            | $2,244    | **$5,317** |
| Customers for $1M ARR                  | 446       | **188**    |
| Customers for $4M ARR                  | 1,783     | **752**    |
| Free users needed for $4M @ 1.5% conv. | 118,835   | **50,154** |

The revised ACV still sits _below_ Appcues ($15K) and Userpilot ($11.3K) — so this is not aggressive pricing, it is closer to correct pricing.

**And the NRR effect is larger than the price effect.** From a fixed 400-customer base at the revised ACV, with no new logos at all:

| NRR  | Year 1 | Year 3 | Gained from the existing base |
| ---- | ------ | ------ | ----------------------------- |
| 100% | $2.13M | $2.13M | **$0**                        |
| 115% | $2.13M | $2.81M | $0.68M                        |
| 125% | $2.13M | $3.32M | $1.19M                        |
| 130% | $2.13M | $3.59M | $1.47M                        |

Which converts directly into how hard you have to work. New customers required to reach $4M by year three, starting from 400:

| NRR  | Additional customers | Per month  |
| ---- | -------------------- | ---------- |
| 100% | 352                  | **~15/mo** |
| 115% | 223                  | ~9/mo      |
| 125% | 127                  | **~5/mo**  |

**Fifteen new logos a month forever versus five.** That is the whole argument for having a growth-aligned metric, and v2 didn't have one.

### 8.3 The revised ladder [G on numbers, [J] on structure]

|                        | Free  | Starter | Growth | Scale     | Business  | Enterprise |
| ---------------------- | ----- | ------- | ------ | --------- | --------- | ---------- |
| Monthly                | $0    | ~$99    | ~$349  | ~$899     | ~$1,900   | quote      |
| Annual (per mo)        | —     | ~$79    | ~$279  | ~$749     | ~$1,590   | custom     |
| **Engaged users / mo** | 1,000 | 10,000  | 50,000 | 200,000   | 750,000   | custom     |
| Creator seats          | 1     | 3       | 10     | unlimited | unlimited | unlimited  |
| Live experiences       | 3     | 15      | 60     | unlimited | unlimited | unlimited  |
| Applications           | 1     | 1       | 3      | 10        | unlimited | unlimited  |

Five paid steps, no jump larger than 3.5×. The specific numbers remain **[G]** until §5.2 price-tests them; the _shape_ is **[J]** and I'd defend it.

### 8.4 Engaged users — the growth metric, and how not to repeat Appcues' mistake

**Engaged user = a person who was actually shown a Lodariq experience this month.** Not everyone who logged in. That single definition is the entire differentiator, and it is the honest answer to the category's loudest grievance.

The metric only works if the billing behaviour is trustworthy:

- **Show the count live in-product**, always, on every plan. Unpredictability is the grievance; a visible number removes it.
- **Soft overage.** Cross the limit and nothing breaks — experiences keep running, you get notified, and you have a grace period.
- **Upgrade at the start of the next cycle, never retroactively.** Appcues charges a prorated upgrade _across all remaining contract months_ [E]. Never do this. It is the single most resented mechanic in the category.
- **Never bill for anonymous or unengaged traffic.** A marketing spike costs the customer nothing, because those people saw nothing.

The line that follows: _"Appcues bills you for everyone who logs in. We bill you for the people we actually helped — and you can see the number."_

### 8.5 Expansion vectors, ranked

1. **Engaged users** — automatic, value-aligned, the main NRR driver
2. **Applications** — the second product a customer instruments; strong enterprise multiplier
3. **Creator seats** — real but slow; guidance is authored by few people
4. **AI credits** — usage-based, volatile, small
5. **Locales** — one-time step-ups

Vectors 1 and 2 are the business. v2 had only 3, 4 and 5.

### 8.6 What still has to be true

- **The cost model (§5.3) is now load-bearing.** If your per-engaged-user cost is material, the allowances above are wrong. Build it before publishing.
- **The engaged-user count must be defensible.** Impressions of an experience the user dismissed in 200ms — do they count? Decide, document it publicly, and err toward not counting.
- **Prices remain unvalidated.** §5.2 stands. Quote three design partners at the Growth number and watch their faces.

---

## 9. Cost model and the costed pricing plan

Built from an explicit unit-cost model (Paddle as Merchant of Record at 5% + $0.50/transaction). Every input is stated so it can be argued with. **Gross margin only** — salaries, marketing and R&D are excluded.

### 9.1 The three findings that shape everything

**Finding 1 — infrastructure is effectively free, and your architecture is why.**

Artifacts are content-addressed, so they cache forever. Preview compiles in the browser (ADR-0003). Style sampling runs in-page (ADR-0013). Predictive QA can simulate client-side. **The expensive compute happens on the creator's machine, not yours.**

The result: it takes roughly **500,000 engaged users a month to cost 1% of a $349 plan.**

| Analytics volume vs my estimate | Starter GM | Growth GM | Scale GM |
| ------------------------------- | ---------- | --------- | -------- |
| as modelled (8 events/user)     | 86.0%      | 90.5%     | 91.9%    |
| **5×**                          | 85.9%      | 90.4%     | 91.5%    |
| **20×**                         | 85.7%      | 89.7%     | 90.1%    |

Even if I am wrong by a factor of twenty, margin moves less than a point. **This means generous allowances cost you nothing.** Set them to drive upgrade behaviour, not to cover cost — there is no cost to cover.

**Finding 2 — Paddle is your largest COGS line, and it caps you.**

5% + $0.50 works out to **5.1–5.5% of revenue** across the ladder. No infrastructure decision you make will ever matter as much. Gross margin cannot exceed ~94.5% while Paddle is in the path.

Two things worth knowing: the 5% includes **Merchant-of-Record** — global VAT and sales-tax registration, filing and liability — which on Stripe you would pay for separately in tooling and accountant time, so it is not a straight comparison to 2.9% + 30¢. And Paddle negotiates below 5% at volume; revisit it above ~$1M ARR.

**Finding 3 — support is the only thing that can break the model.**

| Tier            | as modelled | 2× support | 4× support |
| --------------- | ----------- | ---------- | ---------- |
| Starter $99     | 90.6%       | 86.8%      | **79.2%**  |
| Growth $349     | 91.1%       | 87.5%      | 80.4%      |
| Scale $899      | 92.1%       | 89.5%      | 84.4%      |
| Business $1,900 | 92.2%       | 89.7%      | 84.9%      |

These figures assume the **final** plan's support budget (Starter 9 min/account/month — async email, no SLA). An earlier draft budgeted 20 minutes for Starter, at which 4× load took it to **60.7%**. That difference is the whole argument for the support policy in §9.3: the same tier is either resilient or fragile depending entirely on what you promise.

Even at 4× the plan holds above the 75% floor — but the _slope_ is what matters. Infrastructure at 20× costs you a point; support at 4× costs you eleven. **Support minutes per account is the single most important number to measure in your first six months.**

### 9.2 The free tier is one decision, and it is 48× either way

| Free tier support policy | Cost/account/mo | At 10,000 free accounts |
| ------------------------ | --------------- | ----------------------- |
| Community + docs only    | **$0.017**      | **$175/mo**             |
| 2 min of human support   | $0.851          | **$8,508/mo**           |

Community-only is not a cost-saving. It is the difference between a free tier you can run forever and one that eats a third of your revenue. **No human support on Free, ever** — route it to docs, community and an AI helper trained on your own docs.

### 9.3 The costed plan

Allowances tripled from §8, because §9.1 says they are free.

|                           | Free      | Starter             | Growth                | Scale        | Business      | Enterprise         |
| ------------------------- | --------- | ------------------- | --------------------- | ------------ | ------------- | ------------------ |
| **Monthly**               | $0        | **$99**             | **$349**              | **$899**     | **$1,900**    | quote              |
| **Annual (per mo, −15%)** | —         | **$84**             | **$297**              | **$764**     | **$1,615**    | custom             |
| Billed annually           | —         | $1,010              | $3,560                | $9,170       | $19,380       | —                  |
| **Engaged users / mo**    | 1,000     | **15,000**          | **75,000**            | **300,000**  | **1,000,000** | custom             |
| Creator seats             | 1         | 3                   | 10                    | unlimited    | unlimited     | unlimited          |
| Live experiences          | 3         | 15                  | 60                    | unlimited    | unlimited     | unlimited          |
| Applications              | 1         | 1                   | 3                     | 10           | unlimited     | unlimited          |
| Analytics retention       | 7 days    | 30 days             | 12 months             | 24 months    | 24 months     | 36 months          |
| Support                   | community | async email, no SLA | email, 1 business day | priority, 8h | priority, 4h  | named contact, SLA |

**Costed, per account per month:**

| Tier     | Price  | Infra | AI    | Support | Paddle | **COGS**    | **GM**    |
| -------- | ------ | ----- | ----- | ------- | ------ | ----------- | --------- |
| Starter  | $99    | $0.03 | $0.08 | $3.75   | $5.45  | **$9.30**   | **90.6%** |
| Growth   | $349   | $0.23 | $0.30 | $12.50  | $17.95 | **$30.98**  | **91.1%** |
| Scale    | $899   | $1.29 | $1.48 | $22.92  | $45.45 | **$71.13**  | **92.1%** |
| Business | $1,900 | $3.81 | $3.88 | $45.83  | $95.50 | **$149.02** | **92.2%** |

Annual billing at 15% costs **0.2–0.5 points** of margin and buys twelve months of cash up front plus a materially better retention profile. Take the trade. Note that a 20% annual discount would cost ~1.5 points — **15% is the better number**, and "two months free" framing gets you there.

### 9.4 Fixed platform cost

|                        |             |
| ---------------------- | ----------- |
| API, 2 instances       | $60         |
| Dashboard, 2 instances | $30         |
| Editor origin / CDN    | $8          |
| Postgres HA + disk     | $140        |
| Object storage (R2)    | $12         |
| Monitoring + logs      | $25         |
| Domains, certs, misc   | $20         |
| **Total**              | **$295/mo** |

### 9.5 The business

Mix per your assumption — Starter-heavy tail, Growth and Scale as the core:

**42% Starter · 34% Growth · 17% Scale · 7% Business → blended $446/mo, ACV $5,353, blended GM 91.7%**

| Customers | MRR      | ARR    | Variable COGS | Fixed | Free tier | **Net GM** |
| --------- | -------- | ------ | ------------- | ----- | --------- | ---------- |
| 25        | $11,152  | $134K  | $924          | $295  | $30       | **88.8%**  |
| 50        | $22,304  | $268K  | $1,848        | $295  | $59       | **90.1%**  |
| 100       | $44,607  | $535K  | $3,696        | $295  | $118      | **90.8%**  |
| 250       | $111,518 | $1.34M | $9,241        | $295  | $296      | **91.2%**  |
| 500       | $223,035 | $2.68M | $18,482       | $295  | $591      | **91.3%**  |
| 1,000     | $446,070 | $5.35M | $36,964       | $295  | $1,182    | **91.4%**  |

**You clear 88% net gross margin at 25 customers.** Fixed cost stops mattering almost immediately, which is the signature of a business that can be run profitably by a small team.

Target was 75–95%. Every tier lands **90.4–92.2%**, with the ceiling set by Paddle rather than by anything you control.

### 9.6 What would move these numbers

- **Support minutes are guesses.** Measure them from day one; they are the only line that can take Starter below 75%.
- **Infra figures are estimated, not measured.** They have so much headroom that being wrong by 20× is survivable, but instrument real egress and event volume before scaling the free tier.
- **Narration is the one AI line that can grow.** Cached by `(script, voice, model, speed)` it stays trivial; uncached regeneration is the risk. Keep it behind credits.
- **Paddle above ~$1M ARR** — renegotiate. A point off 5% is worth $53K a year at $5.35M ARR.
- **Excluded entirely:** salaries, CAC, R&D. This is gross margin, not profitability.

---

**Model:** `docs/product-design/cost-model.mjs` — every input above is a named export.
Run `node docs/product-design/cost-model.mjs --sensitivity` to regenerate these tables after
replacing any estimate with a measurement.

---

## 10. Analytics — correcting §9.1

§9.1 implied analytics is a cost to be minimised. That was wrong in a way that matters, because **the product is not saleable at Growth and above without it.** A PM buying an onboarding tool has to answer "did it work" to their own boss.

I had collapsed three different things into one. Separated:

|                           | What it is                                                               | Events/user   | Growth-tier GM |
| ------------------------- | ------------------------------------------------------------------------ | ------------- | -------------- |
| **1. Guidance analytics** | Did _this experience_ work — views, step drop-off, completion, dismissal | ~12           | 91%+           |
| **2. Adoption analytics** | Did the _behaviour stick_ — did completers actually use the feature      | ~45           | **91.0%**      |
| **3. Product analytics**  | Every click in the customer's whole app                                  | ~400          | 89.5%          |
| **4. Session replay**     | Video-scale capture                                                      | ~10,000 equiv | **48.3%**      |

**Only row 4 is a cliff.** Rows 1–3 all fit comfortably. My earlier warning applied to row 4 and I aimed it at rows 2–3 by mistake.

### 10.1 Adoption analytics is the feature that justifies the price

Not "289 of 347 people completed this tour." That is a vanity number.

> **"289 completed the tour. 71% of them used the feature within 7 days, against 23% of the people who didn't."**

That is the number a PM takes to their own review. It is the difference between a nice-to-have and a renewal.

**And it is cheap, because you don't need everything.** The customer declares a small set of **success events** — the 5 to 20 things that actually indicate adoption — and you track only those. Full clickstream is unnecessary. That's how row 2 costs $0.71 per Growth account per month instead of Pendo's cost structure.

### 10.2 The analytics ladder

Tiering depth is right, standard, and defensible — Userpilot gates funnels, retention, paths and A/B testing behind its Growth tier. Your framing is also sound: _because you charge per engaged user rather than per event, depth-by-tier is a fair trade rather than a penalty._

One hard rule, though. **Every tier — including Free — must show whether the experience worked.** Analytics is the evidence of value. Gate it completely and the customer has no case for upgrading, so they churn instead. The line is:

> **Everyone sees _whether_ it worked. You pay for _why_, and for how far back.**

|                                      | Free      | Starter   | Growth        | Scale     | Business  |
| ------------------------------------ | --------- | --------- | ------------- | --------- | --------- |
| Views, completions, completion rate  | ●         | ●         | ●             | ●         | ●         |
| Step-level drop-off                  | ●         | ●         | ●             | ●         | ●         |
| Dismissals, time-to-complete         | ●         | ●         | ●             | ●         | ●         |
| Retention window                     | 7 days    | 30 days   | 12 months     | 24 months | 36 months |
| **Adoption impact** (success events) | —         | —         | **10 events** | 50        | unlimited |
| Segmentation by audience/attribute   | —         | —         | ●             | ●         | ●         |
| Funnel across a sequence             | —         | —         | ●             | ●         | ●         |
| A/B arm comparison                   | —         | —         | ●             | ●         | ●         |
| Cohort / retention curves            | —         | —         | —             | ●         | ●         |
| Custom attributes                    | —         | —         | —             | ●         | ●         |
| CSV export                           | —         | —         | —             | ●         | ●         |
| Warehouse sync (Snowflake/BigQuery)  | —         | —         | —             | —         | ●         |
| Raw event export                     | —         | —         | —             | —         | ●         |
| **Session replay**                   | **never** | **never** | **never**     | **never** | **never** |

### 10.3 Costed

| Tier            | Events/user | Retention | Analytics cost | COGS    | GM        |
| --------------- | ----------- | --------- | -------------- | ------- | --------- |
| Starter $99     | 12          | 1 mo      | $0.04          | $9.31   | **90.6%** |
| Growth $349     | 45          | 12 mo     | $0.71          | $31.46  | **91.0%** |
| Scale $899      | 80          | 24 mo     | $5.10          | $74.94  | **91.7%** |
| Business $1,900 | 120         | 24 mo     | $22.47         | $167.68 | **91.2%** |

Real analytics costs you **0.04% to 1.2% of revenue**. Margins are unchanged from §9.

### 10.4 The engineering decision that makes 24-month retention affordable

**Pre-aggregate.** Keep raw events for 30 days; roll them into daily aggregates after that. Cuts long-retention storage by ~95%.

Without it, Business costs $51.39/month in analytics. With it, $22.47. The model has `PRE_AGGREGATE = true` — flip it to compare.

### 10.5 Session replay: a standing no

It is the only line that breaks the business — **91.0% → 48.3%** on Growth.

It is also why Pendo cannot offer unlimited MAU: their product _is_ the event pipeline, so every user genuinely costs them money. Yours isn't, so they don't. **That asymmetry is the foundation of your pricing differentiation, and shipping replay would surrender it.**

If a customer needs replay, integrate with FullStory or LogRocket. Don't build it.
