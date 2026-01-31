"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { VoiceSettings } from "@/types";
import { loadVoiceSettings, saveVoiceSettings } from "@/lib/storage";

interface VoiceContextType {
  // Speech Recognition Settings
  speechRecognitionEnabled: boolean;
  setSpeechRecognitionEnabled: (enabled: boolean) => void;
  speechRecognitionLanguage: string;
  setSpeechRecognitionLanguage: (language: string) => void;

  // Text-to-Speech Settings
  textToSpeechEnabled: boolean;
  setTextToSpeechEnabled: (enabled: boolean) => void;
  textToSpeechAutoPlay: boolean;
  setTextToSpeechAutoPlay: (autoPlay: boolean) => void;
  textToSpeechVoiceURI: string | null;
  setTextToSpeechVoiceURI: (uri: string | null) => void;
  textToSpeechRate: number;
  setTextToSpeechRate: (rate: number) => void;
  textToSpeechPitch: number;
  setTextToSpeechPitch: (pitch: number) => void;
  textToSpeechVolume: number;
  setTextToSpeechVolume: (volume: number) => void;

  // Full settings object
  voiceSettings: VoiceSettings;

  // Actions
  resetToDefaults: () => void;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings | null>(
    null,
  );

  // Load settings on mount
  useEffect(() => {
    const loaded = loadVoiceSettings();
    setVoiceSettings(loaded);
  }, []);

  // Save settings whenever they change
  const updateSettings = useCallback((newSettings: Partial<VoiceSettings>) => {
    setVoiceSettings((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...newSettings };
      saveVoiceSettings(updated);
      return updated;
    });
  }, []);

  const value: VoiceContextType = {
    // Speech Recognition Settings
    speechRecognitionEnabled: voiceSettings?.speechRecognition.enabled ?? true,
    setSpeechRecognitionEnabled: (enabled) =>
      updateSettings({
        speechRecognition: { ...voiceSettings!.speechRecognition, enabled },
      }),
    speechRecognitionLanguage:
      voiceSettings?.speechRecognition.language ?? "en-US",
    setSpeechRecognitionLanguage: (language) =>
      updateSettings({
        speechRecognition: { ...voiceSettings!.speechRecognition, language },
      }),

    // Text-to-Speech Settings
    textToSpeechEnabled: voiceSettings?.textToSpeech.enabled ?? false,
    setTextToSpeechEnabled: (enabled) =>
      updateSettings({
        textToSpeech: { ...voiceSettings!.textToSpeech, enabled },
      }),
    textToSpeechAutoPlay: voiceSettings?.textToSpeech.autoPlay ?? false,
    setTextToSpeechAutoPlay: (autoPlay) =>
      updateSettings({
        textToSpeech: { ...voiceSettings!.textToSpeech, autoPlay },
      }),
    textToSpeechVoiceURI: voiceSettings?.textToSpeech.voiceURI ?? null,
    setTextToSpeechVoiceURI: (voiceURI) =>
      updateSettings({
        textToSpeech: { ...voiceSettings!.textToSpeech, voiceURI },
      }),
    textToSpeechRate: voiceSettings?.textToSpeech.rate ?? 1,
    setTextToSpeechRate: (rate) =>
      updateSettings({
        textToSpeech: { ...voiceSettings!.textToSpeech, rate },
      }),
    textToSpeechPitch: voiceSettings?.textToSpeech.pitch ?? 1,
    setTextToSpeechPitch: (pitch) =>
      updateSettings({
        textToSpeech: { ...voiceSettings!.textToSpeech, pitch },
      }),
    textToSpeechVolume: voiceSettings?.textToSpeech.volume ?? 1,
    setTextToSpeechVolume: (volume) =>
      updateSettings({
        textToSpeech: { ...voiceSettings!.textToSpeech, volume },
      }),

    // Full settings object
    voiceSettings: voiceSettings!,

    // Actions
    resetToDefaults: () => {
      const defaults = {
        speechRecognition: {
          enabled: true,
          language: "en-US",
          continuous: false,
        },
        textToSpeech: {
          enabled: false,
          autoPlay: false,
          voiceURI: null,
          rate: 1,
          pitch: 1,
          volume: 1,
        },
      };
      setVoiceSettings(defaults);
      saveVoiceSettings(defaults);
    },
  };

  // Don't render children until settings are loaded
  if (!voiceSettings) {
    return null;
  }

  return (
    <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
  );
}

export function useVoiceSettings() {
  const context = useContext(VoiceContext);
  if (context === undefined) {
    throw new Error("useVoiceSettings must be used within a VoiceProvider");
  }
  return context;
}
