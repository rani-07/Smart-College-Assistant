"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type VoiceLang = "mr-IN" | "hi-IN" | "en-IN";

export interface UseVoiceOptions {
  /** Called with the final recognised transcript so the caller can submit it */
  onTranscript: (text: string) => void;
  /** Default recognition + TTS language. Defaults to "mr-IN". */
  defaultLang?: VoiceLang;
}

export interface UseVoiceReturn {
  isListening: boolean;
  isSpeaking: boolean;
  isSupported: boolean;
  transcript: string;       // live interim transcript shown in the input box
  errorMsg: string | null;
  lang: VoiceLang;
  setLang: (l: VoiceLang) => void;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Clean a bot reply before speaking:
 * - Remove markdown symbols (* # ` _ ~)
 * - Remove URLs
 * - Remove emojis
 * - Optionally remove English words inside parentheses, e.g. "(fee structure)"
 *   so the voice doesn't switch languages mid-sentence.
 */
function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")          // fenced code blocks
    .replace(/`[^`]*`/g, "")                  // inline code
    .replace(/https?:\/\/\S+/g, "")           // URLs
    .replace(/[*#_~]/g, "")                   // markdown symbols
    .replace(/\([^)]*[a-zA-Z][^)]*\)/g, "")  // English inside brackets
    // eslint-disable-next-line no-misleading-character-class
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      ""
    )                                          // emojis
    .replace(/\s{2,}/g, " ")                  // collapse whitespace
    .trim();
}

/**
 * Split text into chunks of ~150 chars, breaking at sentence boundaries
 * (।  .  ?  !) so Chrome doesn't silently cut off long utterances.
 */
function splitIntoChunks(text: string, maxLen = 150): string[] {
  const sentences = text.split(/(?<=[।.?!])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length <= maxLen) {
      current = (current + " " + sentence).trim();
    } else {
      if (current) chunks.push(current);
      // If a single sentence is still too long, hard-split it
      if (sentence.length > maxLen) {
        const words = sentence.split(" ");
        let part = "";
        for (const word of words) {
          if ((part + " " + word).trim().length <= maxLen) {
            part = (part + " " + word).trim();
          } else {
            if (part) chunks.push(part);
            part = word;
          }
        }
        if (part) chunks.push(part);
        current = "";
      } else {
        current = sentence;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

/**
 * Pick the best available voice for the given language.
 * Priority: exact lang match → same script (hi-IN for Devanagari) → default.
 */
function pickVoice(lang: VoiceLang): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // 1. Exact match
  const exact = voices.find((v) => v.lang === lang);
  if (exact) return exact;

  // 2. Same language prefix (e.g. "mr" matches "mr-IN")
  const prefix = lang.split("-")[0];
  const prefixMatch = voices.find((v) => v.lang.startsWith(prefix));
  if (prefixMatch) return prefixMatch;

  // 3. For Marathi/Hindi fall back to the other Devanagari language
  if (lang === "mr-IN") {
    const hindi = voices.find((v) => v.lang === "hi-IN");
    if (hindi) return hindi;
  }

  // 4. Give up — browser will use its default
  return null;
}

/**
 * Fallback: call our /api/tts route (Google Cloud TTS) and play the audio.
 * Returns a promise that resolves when playback ends.
 */
async function speakViaApi(text: string, lang: VoiceLang): Promise<void> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
    URL.revokeObjectURL(url);
  } catch {
    // silently ignore — TTS is best-effort
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVoice({
  onTranscript,
  defaultLang = "mr-IN",
}: UseVoiceOptions): UseVoiceReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lang, setLang] = useState<VoiceLang>(defaultLang);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Queue of text chunks waiting to be spoken
  const chunkQueueRef = useRef<string[]>([]);
  const speakingRef = useRef(false); // sync ref so callbacks see latest value

  // ── Check browser support ─────────────────────────────────────────────────
  const isSupported =
    typeof window !== "undefined" &&
    !!(
      (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition
    );

  // ── Build / rebuild SpeechRecognition whenever lang changes ───────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SR =
      (window as Window & { SpeechRecognition?: typeof SpeechRecognition })
        .SpeechRecognition ||
      (
        window as Window & {
          webkitSpeechRecognition?: typeof SpeechRecognition;
        }
      ).webkitSpeechRecognition;

    if (!SR) return;

    // Abort any existing session before replacing
    recognitionRef.current?.abort();

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true; // show live text in the input box
    rec.lang = lang;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      // Show interim text live in the textarea
      setTranscript(interim || final);
      if (final.trim()) {
        setTranscript("");
        setIsListening(false);
        onTranscript(final.trim());
      }
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      if (e.error === "not-allowed") {
        setErrorMsg("माइक परवानगी नाकारली. (Mic permission denied.)");
      } else if (e.error === "no-speech") {
        setErrorMsg("आवाज ऐकू आला नाही. पुन्हा प्रयत्न करा.");
      } else if (e.error === "network") {
        setErrorMsg("नेटवर्क त्रुटी. (Network error.)");
      } else {
        setErrorMsg(`त्रुटी: ${e.error}`);
      }
    };

    rec.onend = () => {
      setIsListening((prev) => {
        if (prev) return false; // ended without a result
        return prev;
      });
    };

    recognitionRef.current = rec;
  }, [lang, onTranscript]);

  // ── Speak next chunk from the queue ───────────────────────────────────────
  const speakNextChunk = useCallback(() => {
    if (!chunkQueueRef.current.length) {
      speakingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    const chunk = chunkQueueRef.current.shift()!;
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = lang;
    utterance.rate = 0.9; // slightly slower for Marathi clarity
    utterance.pitch = 1;

    // Wait for voices to be loaded (they may not be ready on first call)
    const assignVoice = () => {
      const voice = pickVoice(lang);
      if (voice) utterance.voice = voice;
    };

    if (window.speechSynthesis.getVoices().length) {
      assignVoice();
      window.speechSynthesis.speak(utterance);
    } else {
      // Voices not loaded yet — wait for the event
      window.speechSynthesis.addEventListener(
        "voiceschanged",
        () => {
          assignVoice();
          window.speechSynthesis.speak(utterance);
        },
        { once: true }
      );
    }

    utterance.onend = () => speakNextChunk();
    utterance.onerror = () => speakNextChunk(); // skip broken chunk
  }, [lang]);

  // ── Public: speak a full bot reply ────────────────────────────────────────
  const speak = useCallback(
    async (rawText: string) => {
      if (!window.speechSynthesis) return;

      // Stop anything currently playing
      window.speechSynthesis.cancel();
      speakingRef.current = false;

      const cleaned = cleanForSpeech(rawText);
      if (!cleaned) return;

      const chunks = splitIntoChunks(cleaned);
      if (!chunks.length) return;

      // Check if any suitable voice exists; if not, use API fallback
      const voices = window.speechSynthesis.getVoices();
      const hasVoice =
        voices.length > 0 &&
        (voices.some((v) => v.lang === lang) ||
          voices.some((v) => v.lang.startsWith(lang.split("-")[0])) ||
          (lang === "mr-IN" && voices.some((v) => v.lang === "hi-IN")));

      if (!hasVoice && voices.length > 0) {
        // No Devanagari voice — use Google Cloud TTS API
        setIsSpeaking(true);
        speakingRef.current = true;
        await speakViaApi(cleaned, lang);
        speakingRef.current = false;
        setIsSpeaking(false);
        return;
      }

      // Use Web Speech API with chunked queue
      chunkQueueRef.current = chunks;
      speakingRef.current = true;
      setIsSpeaking(true);
      speakNextChunk();
    },
    [lang, speakNextChunk]
  );

  // ── Public: stop speaking ─────────────────────────────────────────────────
  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    chunkQueueRef.current = [];
    speakingRef.current = false;
    setIsSpeaking(false);
  }, []);

  // ── Public: start listening ───────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setErrorMsg("हे ब्राउझर मायक्रोफोन सपोर्ट करत नाही. (Unsupported browser.)");
      return;
    }
    // Stop TTS while user is speaking
    stopSpeaking();
    setErrorMsg(null);
    setTranscript("");
    setIsListening(true);
    try {
      recognitionRef.current.start();
    } catch {
      // Already started — ignore
    }
  }, [stopSpeaking]);

  // ── Public: stop listening ────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  return {
    isListening,
    isSpeaking,
    isSupported,
    transcript,
    errorMsg,
    lang,
    setLang,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
