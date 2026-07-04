import { env } from "@/lib/env";
import CoachClient from "@/components/CoachClient";

/**
 * Gate 4 — interview coach. Thin server shell whose one job is reading the X8
 * voice-mode flag (VOICE_MOCKS_ENABLED, option A: browser-native STT/TTS, no
 * vendors, no audio leaves the browser). Flag unset ⇒ the text coach renders
 * byte-identical to before.
 */
export const dynamic = "force-dynamic";

export default function Coach() {
  return <CoachClient voiceEnabled={env().VOICE_MOCKS_ENABLED === "1"} />;
}
