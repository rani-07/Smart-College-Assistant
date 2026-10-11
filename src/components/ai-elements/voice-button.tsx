"use client";

import { Button } from "@/components/ui/button";
import type { VoiceLang } from "@/hooks/use-voice";
import {
  MicIcon,
  MicOffIcon,
  Volume2Icon,
  VolumeXIcon,
  Volume1Icon,
} from "lucide-react";

// ── Language selector ─────────────────────────────────────────────────────────

interface LangToggleProps {
  lang: VoiceLang;
  onChange: (l: VoiceLang) => void;
}

const LANGS: { value: VoiceLang; label: string }[] = [
  { value: "mr-IN", label: "मर" },
  { value: "hi-IN", label: "हि" },
  { value: "en-IN", label: "EN" },
];

export function LangToggle({ lang, onChange }: LangToggleProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border px-1 py-0.5 text-xs text-muted-foreground">
      {LANGS.map((l) => (
        <button
          key={l.value}
          type="button"
          onClick={() => onChange(l.value)}
          className={`px-1 rounded transition-colors ${
            lang === l.value
              ? "bg-primary text-primary-foreground font-semibold"
              : "hover:text-foreground"
          }`}
          title={l.value}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

// ── Mic + Stop-speaking buttons (placed on the RIGHT of the toolbar) ──────────

interface VoiceMicButtonProps {
  isListening: boolean;
  isSpeaking: boolean;
  isSupported: boolean;
  onMicClick: () => void;
  onStopSpeaking: () => void;
}

export function VoiceMicButton({
  isListening,
  isSpeaking,
  isSupported,
  onMicClick,
  onStopSpeaking,
}: VoiceMicButtonProps) {
  if (!isSupported) return null;

  if (isSpeaking) {
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        title="बोलणे थांबवा (Stop speaking)"
        onClick={onStopSpeaking}
        className="text-blue-500 animate-pulse shrink-0"
      >
        <VolumeXIcon className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      title={isListening ? "ऐकणे थांबवा (Stop)" : "बोला (Speak)"}
      onClick={onMicClick}
      className={`shrink-0 ${
        isListening
          ? "text-red-500 animate-pulse"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {isListening ? (
        <MicOffIcon className="size-4" />
      ) : (
        <MicIcon className="size-4" />
      )}
    </Button>
  );
}

// ── Auto-speak toggle (speaker icon in the toolbar left side) ─────────────────

interface AutoSpeakToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function AutoSpeakToggle({ enabled, onToggle }: AutoSpeakToggleProps) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      title={enabled ? "Auto-speak ON — click to turn off" : "Auto-speak OFF — click to turn on"}
      onClick={onToggle}
      className={enabled ? "text-green-500" : "text-muted-foreground"}
    >
      {enabled ? (
        <Volume2Icon className="size-4" />
      ) : (
        <Volume1Icon className="size-4" />
      )}
    </Button>
  );
}

// ── Per-message speak button (shown next to each bot reply) ───────────────────

interface MessageSpeakButtonProps {
  isSpeaking: boolean;
  onSpeak: () => void;
  onStop: () => void;
}

export function MessageSpeakButton({
  isSpeaking,
  onSpeak,
  onStop,
}: MessageSpeakButtonProps) {
  return (
    <button
      type="button"
      title={isSpeaking ? "थांबवा (Stop)" : "वाचा (Read aloud)"}
      onClick={isSpeaking ? onStop : onSpeak}
      className={`ml-1 inline-flex items-center opacity-50 hover:opacity-100 transition-opacity ${
        isSpeaking ? "text-blue-500 animate-pulse" : "text-muted-foreground"
      }`}
    >
      <Volume2Icon className="size-3.5" />
    </button>
  );
}
