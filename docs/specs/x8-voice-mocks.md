# X8 - Voice mock interviews (PRD + cost - HARD-STOP: paid infra approval)

> **Status: SPEC + COST ONLY.** The board flags X8 "likely paid voice infra → hard-stop for
> approval; spec + cost first." No code ships until you approve an option and its budget.

## Problem

Text mocks (the existing `/studio/coach` mock_interview skill) rehearse CONTENT, but interviews
are performed out loud: pacing, rambling, composure under interruption. Candidates who've said
their stories aloud interview measurably better. RO should run a realistic voice mock with
adaptive follow-ups and a candid debrief.

## What already exists (reuse)

`coach_prep` + `mock_interview` skills (text turns over `pipeline.messages`), the debrief skill,
quality gate, metering. Voice is a TRANSPORT upgrade to an existing loop, not a new brain.

## Options + real costs (2026 pricing, order-of-magnitude)

| Option | Stack | ~Cost per 30-min mock | Notes |
|---|---|---|---|
| **A - browser-native, no new vendor (recommended v1)** | Browser Web Speech API (STT, free, on-device in Chrome/Safari) → existing text mock loop → TTS via browser `speechSynthesis` (free) | **≈ $0.15–0.40** (just the model turns we already pay) | Quality: robotic voice, decent STT. ZERO new infra/vendors/keys. Ships behind a flag with no approval beyond this PR. |
| **B - OpenAI/ElevenLabs-style hosted voice** | Realtime speech-to-speech API | ≈ $3–9 per mock | Best latency/naturalness; NEW vendor + key + spend; per-user cost needs its own rate budget. |
| **C - CF Workers AI voice (Whisper STT + TTS models)** | Whisper on Workers AI + a TTS model, orchestrated ourselves | ≈ $0.50–1.50 per mock | Stays in the CF account (no new vendor); latency is stitch-it-yourself; TTS quality mid. |

Monthly read at 100 mocks/mo: A ≈ $15–40 · C ≈ $50–150 · B ≈ $300–900.

## Recommendation

**A now** (flag-gated, zero new vendors - genuinely useful rehearsal even with a robotic voice),
**C as the upgrade** when mock volume proves demand, **B only if** voice quality becomes the
differentiator users ask for. A can ship as a normal slice after you approve this direction -
it spends nothing beyond the model turns we already meter.

## Build sketch (post-approval - not built)

`/studio/coach` gains a "Voice mode" toggle (flag `VOICE_MOCKS_ENABLED`): browser STT streams
the candidate's answer → existing `mock_interview` turn → browser TTS speaks the interviewer.
Debrief adds delivery notes (fillers, answer length) computed client-side from transcripts -
no audio ever leaves the browser in option A (privacy win worth naming). House rules apply:
metering, rate limits (mocks/hour), a11y (captions ARE the transcript), injection tests.

## Acceptance criteria (for the build slice)

1. Voice mode runs a full mock loop hands-free (speak → interviewer speaks back) in Chrome +
   Safari; text mode remains the fallback everywhere else.
2. Debrief includes delivery observations grounded in the transcript only.
3. No audio leaves the browser (option A); flag-off = today's text coach, byte-identical.
4. Cost per mock stays within the metered budget (~$0.40); mocks rate-limited per user.

## Your move

Approve a direction on the PR: **A** (recommended - buildable next, no new spend),
**C**, **B**, or "not now."
