# RoleOS design system — the visual contract

> Status: **APPROVED (2026-07-24)**. The token source of truth is `app/globals.css`;
> the Tailwind mapping is `tailwind.config.ts`; the living style guide is `/design`
> (`app/design/page.tsx`). Every Phase-J slice and every new component builds on
> these tokens — never raw hex, never one-off sizes. React to the rendered guide,
> then change tokens, not components.

## 1 · Direction (why it looks like this)

Reference: **openrouter.ai** — chosen for its discipline (cool neutrals, one lead
accent, layered color depth, a tidy type + radius scale). We adopt the *structure*
and the *mood* the user approved, adapted into RoleOS's own identity and calm,
candid voice (`ro-voice.html`). **Two faces, on purpose:**

- **App = LIGHT** — cool near-white surfaces, grape accent. The default; where work happens.
- **Marketing = DARK** — ink surfaces, volt spark. Opt in with `.theme-dark` on a wrapper.

Both faces use the **same semantic token names**, revalued — so a screen written once
works in either, and a re-theme is a token swap.

## 2 · Brand — the identity is six colors

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#03080a` | near-black (dark bg, on-light nothing) |
| `--cloud` | `#fcfcfe` | near-white |
| `--grape` | `#7624f4` | **lead accent** — buttons, links, RO's voice |
| `--volt` | `#c8ff00` | electric spark — highlights on dark, tiny accents only |
| `--coral` | `#ff6849` | warm attention — sparingly |
| `--royal` | `#035ade` | informational blue |

**Rules:** grape leads. Volt is a spark, **never body text on light** (fails contrast) —
use it on ink, on a fill with `--spark-ink` text, or as a small dot/underline. Coral is
an accent of last resort, not a second primary.

## 3 · Semantic tokens (what components reference)

Never reference brand hex directly in a component. Reference these; they revalue per face.

- **Surfaces:** `--bg` (page) · `--surf` (card) · `--surf2` (raised/hover) · `--surf3` (inset).
- **Text:** `--tx` (headings+body) · `--tx2` (secondary) · `--tx3` (faint — still AA).
- **Borders:** `--bd` (hairline) · `--bd2` (stronger/interactive).
- **Primary:** `--primary`, `--primary-tx` (on-fill), `--primary-hover`, `--primary-active`,
  `--primary-bg` (6% tint), `--primary-bd` (tinted border), `--primary-ring` (focus).
  `--link` = contrast-tuned grape for text.
- **States** — each has 4 members `--<s>` / `--<s>-tx` / `--<s>-bg` / `--<s>-bd`:
  `info` (blue), `suc` (green, "pursue"), `warn` (amber, "aging"), `dng` (red, "closed").

Tailwind exposes all of these: `bg-surf2`, `text-tx3`, `border-bd`, `bg-primary`,
`text-primary`, `bg-suc-bg text-suc-tx border-suc-bd`, etc.

## 4 · Type

- **Display:** Space Grotesk (geometric grotesk — our Gordita stand-in). `font-display`.
- **Body:** Plus Jakarta Sans (humanist, crisp). `font-sans`. Body weight is **450**, a
  touch heavier than normal — crisp on long reads (résumé editor, briefs).
- **Mono:** JetBrains Mono. `font-mono` — code, tokens, IDs.

Semantic size scale (Tailwind `text-*`): `display` 56 · `h1` 36 · `h2` 24 · `h3` 20 ·
`section` 16 · `body` 15 · `small` 13 · `overline` 12 (uppercase, tracked). Line-heights
and tracking are baked into each step. Weights: `body` 450 · `medium` 500 · `semibold`
600 · `bold` 700. **Use the scale — no arbitrary px.**

## 5 · Radius, elevation, motion

- **Radius:** `sm` 4 · `md` 6 (buttons/inputs) · `lg` 8 · `xl` 12 (cards) · `2xl` 16 · `full` (pills).
- **Elevation:** prefer a hairline border; add `shadow-sm/md/lg` for genuine lift only.
  Focus uses `shadow-ring` (grape) or the global `:focus-visible` outline.
- **Motion:** `--ease` (cubic-bezier(.2,0,0,1)), durations `--dur-fast/–dur/–dur-slow`
  (120/180/260ms). Respect `prefers-reduced-motion` (handled globally).

## 6 · Component conventions — use the primitives

**Build on `components/ui/` — don't hand-roll these.** `import { Button, Badge, Card, Input }
from "@/components/ui"`. They encode the rules below on the tokens, so every screen matches
and a rule change is one edit. The `/design` style guide renders them.


- **Buttons:** primary = `bg-primary text-primary-tx`, hover `bg-primary-hover`; secondary =
  `border-bd2 bg-surf`; ghost = `text-primary hover:bg-primary-bg`; spark CTA (rare) =
  `bg-spark text-spark-ink`; danger = `bg-dng text-white`. Radius `md`, `text-small font-semibold`.
- **Inputs:** `border-bd2 bg-surf`, focus → `border-primary shadow-ring`.
- **Status pills:** `bg-<s>-bg text-<s>-tx border-<s>-bd` + a `--<s>` dot. Radius `full`.
- **Cards:** `rounded-xl bg-surf`, hairline `border-bd`, optional `shadow-md/lg`.

## 7 · Accessibility (non-negotiable)

- Body/faint text ≥ 4.5:1 on its surface; large text ≥ 3:1 (tokens tuned for this on both faces).
- Keyboard `:focus-visible` ring is global; never remove it.
- Volt is decorative — never rely on it for text contrast or as the only signal.
- State is never color-only — pair with a label/icon (pills already do).

## 8 · Migration — replace, don't re-skin (per J-slice)

**Policy (approved 2026-07-24):** there is one design system, and each screen adopts it by
being **rebuilt on it in its Phase-J slice** — a clean replacement using these tokens and the
`components/ui/` primitives, not a partial find-replace. New work follows the system entirely.

The old warm-paper tokens were replaced in place, so legacy screens not yet rebuilt keep
working — they render on the new cool neutrals immediately, but still show `info`-blue where
they hard-coded it (the old accent). That's expected and temporary: it disappears when that
screen's slice lands. Auto dark-mode (`prefers-color-scheme`) was replaced by the intentional
`.theme-dark` marketing face; the app is light-first by decision.

**Do, per J-slice:** rebuild the screen fully on the tokens + primitives (grape accent, the
type scale, `Button`/`Badge`/`Card`/`Input`); use `info` only for genuinely informational
messaging, never as the action accent. Add nothing to `globals.css` without a reason noted
here, and keep `/design` current when a genuinely new primitive is introduced.
