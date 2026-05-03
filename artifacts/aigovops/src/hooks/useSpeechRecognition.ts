import { useCallback, useRef, useState } from "react";

interface UseSpeechRecognitionOptions {
  onResult: (transcript: string) => void;
  onError?: (error: string) => void;
  lang?: string;
}

export function useSpeechRecognition({
  onResult,
  onError,
  lang = "en-US",
}: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const start = useCallback(() => {
    if (!isSupported) {
      onError?.("Speech recognition is not supported in this browser.");
      return;
    }
    const SpeechRec =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRec();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event.error !== "no-speech") {
        onError?.(event.error);
      }
    };
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as any[])
        .map((r: any) => r[0].transcript)
        .join(" ")
        .trim();
      onResult(transcript);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, onResult, onError, lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  return { isListening, isSupported, start, stop, toggle };
}
