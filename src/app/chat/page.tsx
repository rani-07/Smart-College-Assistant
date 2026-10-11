// src/app/chat/page.tsx
"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Response } from "@/components/ai-elements/response";
import { Loader } from "@/components/ai-elements/loader";
import {
  AutoSpeakToggle,
  LangToggle,
  MessageSpeakButton,
  VoiceMicButton,
} from "@/components/ai-elements/voice-button";
import { useVoice } from "@/hooks/use-voice";

export default function RAGChatBot() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat();

  // ── Auto-speak toggle state ───────────────────────────────────────────────
  const [autoSpeak, setAutoSpeak] = useState(true);

  // Track which message is currently being spoken (for per-message button state)
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  // Track the last assistant message id we already auto-spoke
  const spokenIdRef = useRef<string | null>(null);

  // ── When user finishes speaking → put text in box and submit ─────────────
  const handleTranscript = useCallback(
    (text: string) => {
      setInput(text);
      sendMessage({ text });
      setInput("");
    },
    [sendMessage]
  );

  const {
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
  } = useVoice({ onTranscript: handleTranscript, defaultLang: "mr-IN" });

  // Show live interim transcript in the textarea while the user is speaking
  useEffect(() => {
    if (transcript) setInput(transcript);
  }, [transcript]);

  // ── Auto-speak the latest assistant reply when streaming finishes ─────────
  useEffect(() => {
    if (!autoSpeak) return;
    if (status !== "ready") return; // still streaming

    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last || last.id === spokenIdRef.current) return;

    const text = last.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join(" ");

    if (text) {
      spokenIdRef.current = last.id;
      setSpeakingMsgId(last.id);
      speak(text);
    }
  }, [status, messages, speak, autoSpeak]);

  // Clear speakingMsgId when TTS finishes
  useEffect(() => {
    if (!isSpeaking) setSpeakingMsgId(null);
  }, [isSpeaking]);

  // ── Manual per-message speak ──────────────────────────────────────────────
  const handleMessageSpeak = useCallback(
    (msgId: string, text: string) => {
      if (isSpeaking && speakingMsgId === msgId) {
        stopSpeaking();
      } else {
        setSpeakingMsgId(msgId);
        speak(text);
      }
    },
    [isSpeaking, speakingMsgId, speak, stopSpeaking]
  );

  // ── Chat submit ───────────────────────────────────────────────────────────
  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text) return;
    sendMessage({ text: message.text });
    setInput("");
  };

  return (
    <div className="max-w-4xl mx-auto p-6 relative size-full h-[calc(100vh-4rem)]">
      <div className="flex flex-col h-full">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.map((message) => (
              <div key={message.id}>
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case "text": {
                      const partText = part.text;
                      return (
                        <Fragment key={`${message.id}-${i}`}>
                          <Message from={message.role}>
                            <MessageContent>
                              <Response>{partText}</Response>
                              {/* Per-message speak button — only on assistant messages */}
                              {message.role === "assistant" && isSupported && (
                                <MessageSpeakButton
                                  isSpeaking={
                                    isSpeaking && speakingMsgId === message.id
                                  }
                                  onSpeak={() =>
                                    handleMessageSpeak(message.id, partText)
                                  }
                                  onStop={stopSpeaking}
                                />
                              )}
                            </MessageContent>
                          </Message>
                        </Fragment>
                      );
                    }
                    case "tool-getLocationInfo": {
                      if (part.state !== "output-available") return null;
                      const output = part.output as
                        | {
                            found: boolean;
                            department?: string;
                            imageUrl?: string | null;
                          }
                        | undefined;

                      if (!output?.found || !output.imageUrl) return null;

                      return (
                        <Fragment key={`${message.id}-${i}`}>
                          <Message from={message.role}>
                            <MessageContent>
                              <img
                                src={output.imageUrl}
                                alt={output.department ?? "Campus location"}
                                className="rounded-lg max-w-full mt-2"
                              />
                            </MessageContent>
                          </Message>
                        </Fragment>
                      );
                    }
                    default:
                      return null;
                  }
                })}
              </div>
            ))}
            {(status === "submitted" || status === "streaming") && <Loader />}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Error message above the input box */}
        {errorMsg && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400 px-1 mb-1">
            ⚠️ {errorMsg}
          </p>
        )}

        <PromptInput onSubmit={handleSubmit} className="mt-2">
          <PromptInputBody>
            <PromptInputTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </PromptInputBody>

          <PromptInputToolbar>
            {/* LEFT side: auto-speak toggle + language selector */}
            <PromptInputTools>
              <AutoSpeakToggle
                enabled={autoSpeak}
                onToggle={() => setAutoSpeak((v) => !v)}
              />
              {isSupported && (
                <LangToggle lang={lang} onChange={setLang} />
              )}
            </PromptInputTools>

            {/* RIGHT side: mic button (immediately left of send) + send */}
            <div className="flex items-center gap-1">
              <VoiceMicButton
                isListening={isListening}
                isSpeaking={isSpeaking}
                isSupported={isSupported}
                onMicClick={isListening ? stopListening : startListening}
                onStopSpeaking={stopSpeaking}
              />
              <PromptInputSubmit disabled={!input && !status} status={status} />
            </div>
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
}
