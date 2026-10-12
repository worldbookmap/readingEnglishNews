"use client";

import { useState, useSyncExternalStore } from "react";
import { recordingsFor, type Recording } from "@/lib/dictionary";
import { VolumeIcon } from "./icons";

// Pronunciation: native speakers' recordings from Wiktionary when there are any, otherwise
// the browser's built-in speech synthesis with the English voice picked in VoicePicker.

const VOICE_KEY = "ren.voice";

function savedVoice(): string {
  try {
    return localStorage.getItem(VOICE_KEY) ?? "";
  } catch {
    return "";
  }
}

const englishVoices = () =>
  typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"))
    : [];

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = englishVoices();
  const voice =
    voices.find((v) => v.voiceURI === savedVoice()) ??
    voices.find((v) => v.lang === "en-US" && v.localService) ??
    voices.find((v) => v.lang === "en-US");
  utterance.voice = voice ?? null;
  utterance.lang = voice?.lang ?? "en-US";
  utterance.rate = 0.9;
  synth.speak(utterance);
}

async function play(audio: HTMLAudioElement, recording: Recording): Promise<boolean> {
  audio.src = recording.url;
  try {
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

// iOS only plays audio and speech that start during a tap. When the recording still has
// to be looked up, the audio element and speech engine are started inside the tap so the
// later playback is allowed.
function unlockAudio(): HTMLAudioElement {
  const audio = new Audio();
  audio.load();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  }
  return audio;
}

const cache = new Map<string, Recording[]>();

const iconButton = "-m-1 self-center rounded-full p-1 text-muted transition-colors hover:text-ink disabled:opacity-50";

// With `recordings` (the reader popup, which already looked the word up): one button per
// accent plus the synthesized voice. Without (the word list): one button that plays the
// first recording it finds, or the synthesized voice.
export function SpeakButton({ text, recordings }: { text: string; recordings?: Recording[] }) {
  const [pending, setPending] = useState(false);

  const playOrSpeak = async (audio: HTMLAudioElement, recording: Recording | undefined) => {
    if (!recording || !(await play(audio, recording))) speak(text);
  };

  if (!recordings) {
    const onClick = async () => {
      const cached = cache.get(text);
      if (cached) return playOrSpeak(new Audio(), cached[0]);
      const audio = unlockAudio();
      setPending(true);
      try {
        const found = await recordingsFor(text);
        cache.set(text, found);
        await playOrSpeak(audio, found[0]);
      } finally {
        setPending(false);
      }
    };
    return (
      <button type="button" onClick={onClick} disabled={pending} aria-label={`'${text}' 발음 듣기`} title="발음 듣기" className={iconButton}>
        <VolumeIcon width={16} height={16} />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 self-center">
      {recordings.map((r) => (
        <button
          key={r.file}
          type="button"
          onClick={() => playOrSpeak(new Audio(), r)}
          aria-label={`${r.accent} 원어민 발음 듣기`}
          title={`${r.accent} 원어민 발음`}
          className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted transition-colors hover:border-ink/40 hover:text-ink"
        >
          <VolumeIcon width={13} height={13} />
          {r.accent}
        </button>
      ))}
      <button type="button" onClick={() => speak(text)} aria-label={`'${text}' 기계 음성으로 듣기`} title="기계 음성으로 듣기" className={iconButton}>
        <VolumeIcon width={16} height={16} />
      </button>
    </span>
  );
}

// Voices load asynchronously (and differ per device), so they're read as an external store.
function subscribeVoices(onChange: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", onChange);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", onChange);
}
const voiceList = () => englishVoices().map((v) => `${v.voiceURI}\t${v.name} (${v.lang})`).join("\n");

export function VoicePicker({ className = "" }: { className?: string }) {
  const list = useSyncExternalStore(subscribeVoices, voiceList, () => "");
  const [voice, setVoice] = useState(savedVoice);
  if (!list) return null;

  const choose = (uri: string) => {
    setVoice(uri);
    try {
      localStorage.setItem(VOICE_KEY, uri);
    } catch {}
    speak("Hello, this is my voice.");
  };

  return (
    <select
      value={voice}
      onChange={(e) => choose(e.target.value)}
      aria-label="기계 음성 선택"
      title="원어민 녹음이 없을 때 읽어줄 기계 음성"
      className={`max-w-48 truncate rounded-full border border-line bg-card px-3 py-2 text-sm ${className}`}
    >
      <option value="">기계 음성: 기본</option>
      {list.split("\n").map((line) => {
        const [uri, label] = line.split("\t");
        return (
          <option key={uri} value={uri}>
            {label}
          </option>
        );
      })}
    </select>
  );
}
