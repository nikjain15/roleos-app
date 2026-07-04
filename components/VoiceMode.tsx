"use client";

import { useEffect, useRef, useState } from "react";

/**
 * X8 (option A) — browser-native voice transport for the mock loop. STT via
 * the Web Speech API (on-device/browser service; NO audio ever reaches our
 * servers — only the final text goes to the same mock-turn endpoint as typing)
 * and TTS via speechSynthesis. Captions are first-class: the live interim
 * transcript renders while you speak, and the full transcript stays on screen.
 * Browsers without SpeechRecognition get an honest fallback line; the text
 * box keeps working everywhere.
 */

// Minimal Web Speech typings (lib.dom's are behind a flag in our TS config).
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
}

function getRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

export default function VoiceControls({
  active,
  interviewerLine,
  disabled,
  onAnswer,
}: {
  /** Voice mode is on (flag + user toggle). */
  active: boolean;
  /** Latest interviewer line — spoken aloud when it changes. */
  interviewerLine: string | null;
  disabled: boolean;
  /** Final spoken answer + how long the candidate spoke. */
  onAnswer: (text: string, durationMs: number) => void;
}) {
  const [supported] = useState(speechSupported);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [recError, setRecError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const startedAt = useRef(0);

  // Speak each new interviewer line; captions (the transcript) stay on screen.
  useEffect(() => {
    if (!active || !interviewerLine || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(interviewerLine);
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
    return () => window.speechSynthesis.cancel();
  }, [active, interviewerLine]);

  // Stop everything if voice mode is switched off mid-flight or on unmount.
  useEffect(() => {
    if (!active) {
      recRef.current?.stop();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    }
    return () => {
      recRef.current?.stop();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, [active]);

  if (!active) return null;

  if (!supported) {
    return (
      <p className="mt-2 text-xs text-tx3">
        Voice isn&apos;t available in this browser — Chrome or Safari can do it. The text box below
        works everywhere.
      </p>
    );
  }

  function start() {
    const rec = getRecognition();
    if (!rec) return;
    recRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    finalRef.current = "";
    startedAt.current = Date.now();
    setInterim("");
    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      setListening(false);
      // Constructor present but the service/mic isn't (headless, denied mic,
      // offline) — say so plainly; the text box below always works.
      setRecError(
        e.error === "not-allowed"
          ? "I need mic permission to hear you — or just type below."
          : "Couldn't reach this browser's speech service — the text box below always works.",
      );
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      const text = finalRef.current.trim();
      if (text) onAnswer(text, Date.now() - startedAt.current);
    };
    setRecError(null);
    setListening(true);
    rec.start();
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {!listening ? (
          <button
            type="button"
            onClick={start}
            disabled={disabled}
            className="min-h-10 rounded-md bg-info px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            🎙 Speak your answer
          </button>
        ) : (
          <button
            type="button"
            onClick={() => recRef.current?.stop()}
            className="min-h-10 animate-pulse rounded-md bg-dng px-4 text-sm font-medium text-white"
          >
            ■ Done answering
          </button>
        )}
        <span className="text-[11px] text-tx3">Your voice never leaves the browser — only the words do.</span>
      </div>
      {listening && (
        <p aria-live="polite" className="mt-2 rounded-md bg-surf p-2 text-sm italic text-tx2">
          {interim || "listening…"}
        </p>
      )}
      {recError && (
        <p role="alert" className="mt-2 text-xs text-tx3">
          {recError}
        </p>
      )}
    </div>
  );
}
