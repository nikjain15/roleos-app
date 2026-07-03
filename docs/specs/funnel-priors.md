# Funnel priors — the starting conversion benchmarks

> Resolves the Goal Engine open question (`goal-engine.md` §7b·A, "which public
> source for the senior-PM conversion priors"). These are the **starting** rates
> the pace engine uses before a user's own data accrues; the empirical-Bayes blend
> in `lib/plan/rates.ts` shrinks toward the user's real rates as events arrive
> (dimension 14), so the priors matter most early and fade with evidence.

## The key framing: targeted, not spray-and-pray

RoleOS applies **selectively to matched roles with a tailored résumé** — that is its
whole value proposition. So the right benchmark is the **qualified / targeted**
funnel, *not* the job-board aggregate (which is dragged down to ~3% application→
interview by mass, generic, often-unqualified applications). Using the aggregate
would make every plan needlessly pessimistic and dishonest in the other direction.

## The priors (v1)

| Stage | Prior | Basis |
|---|---|---|
| **apply → screen** (first interview) | **0.12** | Qualified + tailored applications convert ~4–12% to a first interview vs. ~3% for the raw aggregate. Career.IO 2025: the average *successful* seeker applied to **32 jobs → 4 interviews** (12.5%). We take 0.12 with wide uncertainty. |
| **screen → onsite** (final round) | **0.45** | First interview → onsite/final loop. Hiring-manager-screen→onsite targets run 70–80%, but earlier recruiter screens drop more; ~45% is a realistic blended first-interview→onsite. |
| **onsite → offer** | **0.35** | Onsite→offer benchmark is ~30–40%. |

**Combined:** ~1 / (0.12 × 0.45 × 0.35) ≈ **50 targeted applications → ~6 first
interviews → ~3 final rounds → 1 offer.** This lands inside the well-replicated
"**21–80 applications = highest offer probability**" band and is deliberately more
conservative (honest) than the spec's earlier optimistic ~25–40.

## Uncertainty & personalization

Each prior carries a pseudo-count (`strength` 8–12 in `rates.ts`) — roughly "how
many of your real attempts it takes to outweigh the prior." Small, so a user's own
conversions dominate within a few dozen data points. The engine always surfaces
**ranges**, never point precision.

## Sources

- [Career.IO / The Interview Guys — how many applications it takes to get hired (2025), aggregating multiple studies](https://blog.theinterviewguys.com/how-many-applications-it-takes-to-get-hired-in-2025/)
- [CareerPlug — Recruiting Metrics & Benchmarks 2025 (application→interview ~3%, interview→hire ~27% aggregate)](https://www.careerplug.com/recruiting-metrics-and-kpis/)
- [Pin — Recruitment Funnel Benchmarks 2026 (screen→onsite, onsite→offer targets)](https://www.pin.com/blog/recruitment-funnel-benchmarks/)
- [NACE — Interview-to-Offer / Offer-to-Acceptance rates](https://www.naceweb.org/talent-acquisition/trends-and-predictions/calculating-and-using-interview-to-offer-offer-to-acceptance-rates/)
- [TailorForge — State of Resume Tailoring 2026 (tailored vs generic response-rate lift)](https://tailorforge.com/blog/state-of-resume-tailoring-2026)
- [Monster — Job Application Behavior Report (48% "spray & pray")](https://www.monster.com/career-advice/research/job-application-behavior-report)

## Revisit when

- Enough real cross-user data accrues to publish RoleOS's **own** observed senior-PM
  funnel (replace the literature priors with in-product empirical priors).
- A domain/seniority split is worth it (e.g. separate priors for Staff+ vs Senior,
  or by company stage) — currently one shared prior set, personalized per user.
