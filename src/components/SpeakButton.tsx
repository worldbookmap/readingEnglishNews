"use client";

import { VolumeIcon } from "./icons";

// Reads the word aloud with the browser's built-in speech synthesis (no audio files or API key).
function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  const voices = synth.getVoices();
  utterance.voice = voices.find((v) => v.lang === "en-US" && v.localService) ?? voices.find((v) => v.lang === "en-US") ?? null;
  synth.speak(utterance);
}

export function SpeakButton({ text, className = "" }: { text: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => speak(text)}
      aria-label={`'${text}' 발음 듣기`}
      title="발음 듣기"
      className={`-m-1 self-center rounded-full p-1 text-muted transition-colors hover:text-ink ${className}`}
    >
      <VolumeIcon width={16} height={16} />
    </button>
  );
}
