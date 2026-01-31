import { useState, useEffect, useCallback, useRef } from "react";

interface UseTextToSpeechOptions {
  rate?: number; // 0.1 to 10
  pitch?: number; // 0 to 2
  volume?: number; // 0 to 1
}

interface UseTextToSpeechReturn {
  isSpeaking: boolean;
  isPaused: boolean;
  isSupported: boolean;
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  speak: (text: string, id?: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setVoice: (voice: SpeechSynthesisVoice) => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
  setVolume: (volume: number) => void;
}

// Singleton state to track which message is currently speaking
let globalActiveId: string | null = null;
const activeIdListeners = new Set<(id: string | null) => void>();

const notifyListeners = () => {
  activeIdListeners.forEach((listener) => listener(globalActiveId));
};

export const useTextToSpeech = (
  options: UseTextToSpeechOptions = {},
): UseTextToSpeechReturn & { activeId: string | null } => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(globalActiveId);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] =
    useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRateState] = useState(options.rate ?? 1);
  const [pitch, setPitchState] = useState(options.pitch ?? 1);
  const [volume, setVolumeState] = useState(options.volume ?? 1);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check if browser supports Speech Synthesis
  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // Subscribe to activeId changes
  useEffect(() => {
    const listener = (id: string | null) => setActiveId(id);
    activeIdListeners.add(listener);
    return () => {
      activeIdListeners.delete(listener);
    };
  }, []);

  // Load available voices
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);

      // Set default voice (prefer English)
      if (availableVoices.length > 0 && !selectedVoice) {
        const defaultVoice =
          availableVoices.find((voice) => voice.lang.startsWith("en")) ||
          availableVoices[0];
        setSelectedVoice(defaultVoice);
      }
    };

    loadVoices();

    // Chrome loads voices asynchronously
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [isSupported, selectedVoice]);

  // Update speaking state
  useEffect(() => {
    if (!isSupported) return;

    const interval = setInterval(() => {
      setIsSpeaking(window.speechSynthesis.speaking);
      setIsPaused(window.speechSynthesis.paused);

      // Sync fallback if listeners missed something (e.g. browser cleared it)
      if (!window.speechSynthesis.speaking && globalActiveId !== null) {
        globalActiveId = null;
        notifyListeners();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isSupported]);

  const speak = useCallback(
    (text: string, id: string = "default") => {
      if (!isSupported) {
        console.warn("Speech synthesis is not supported in this browser.");
        return;
      }

      // Stop any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = selectedVoice;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;

      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsPaused(false);
        globalActiveId = id;
        notifyListeners();
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        if (globalActiveId === id) {
          globalActiveId = null;
          notifyListeners();
        }
      };

      utterance.onerror = (event) => {
        console.error("Speech synthesis error:", event);
        setIsSpeaking(false);
        setIsPaused(false);
        if (globalActiveId === id) {
          globalActiveId = null;
          notifyListeners();
        }
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [isSupported, selectedVoice, rate, pitch, volume],
  );

  const pause = useCallback(() => {
    if (!isSupported) return;
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, [isSupported]);

  const resume = useCallback(() => {
    if (!isSupported) return;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, [isSupported]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    globalActiveId = null;
    notifyListeners();
  }, [isSupported]);

  const setVoice = useCallback((voice: SpeechSynthesisVoice) => {
    setSelectedVoice(voice);
  }, []);

  const setRate = useCallback((newRate: number) => {
    setRateState(Math.max(0.1, Math.min(10, newRate)));
  }, []);

  const setPitch = useCallback((newPitch: number) => {
    setPitchState(Math.max(0, Math.min(2, newPitch)));
  }, []);

  const setVolume = useCallback((newVolume: number) => {
    setVolumeState(Math.max(0, Math.min(1, newVolume)));
  }, []);

  return {
    isSpeaking,
    isPaused,
    isSupported,
    voices,
    selectedVoice,
    activeId,
    speak,
    pause,
    resume,
    stop,
    setVoice,
    setRate,
    setPitch,
    setVolume,
  };
};
