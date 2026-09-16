import { useState, useRef, useCallback, useEffect } from 'react';

type SR = typeof window extends { SpeechRecognition: infer T } ? T : never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRecognitionCtor: (new () => any) | undefined =
  (typeof window !== 'undefined')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition)
    : undefined;

export interface UseVoiceReturn {
  isListening: boolean;
  isSupported: boolean;
  interimText: string;
  start: () => void;
  stop: () => void;
}

export function useVoice(onFinalTranscript: (text: string) => void): UseVoiceReturn {
  const [isListening, setIsListening]   = useState(false);
  const [interimText, setInterimText]   = useState('');
  const isSupported                     = !!SpeechRecognitionCtor;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef  = useRef<any>(null);
  const isListeningRef  = useRef(false);   // tracks intent without stale closure
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinalRef      = useRef(onFinalTranscript);
  onFinalRef.current    = onFinalTranscript;

  useEffect(() => {
    if (!SpeechRecognitionCtor) return;

    const rec = new SpeechRecognitionCtor();
    rec.continuous     = true;   // keep listening through pauses
    rec.interimResults = true;
    rec.lang           = 'en-US';
    rec.maxAlternatives = 1;

    rec.onresult = (event: { resultIndex: number; results: SpeechRecognitionResultList }) => {
      let interim = '';
      let final   = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      setInterimText(interim);
      if (final) {
        // Don't clear interimText immediately — let it stay until the next interim arrives
        onFinalRef.current(final.trim());
      }
    };

    rec.onend = () => {
      // Only restart if the user hasn't explicitly stopped
      if (isListeningRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (isListeningRef.current && recognitionRef.current) {
            try { recognitionRef.current.start(); } catch { /* already started */ }
          }
        }, 200);
      } else {
        setIsListening(false);
        setInterimText('');
      }
    };

    rec.onerror = (e: { error: string }) => {
      // 'no-speech' is normal — just restart if still intending to listen
      if (e.error === 'no-speech') return;
      if (e.error === 'aborted') return;  // from explicit .stop() call
      console.warn('[Voice] error:', e.error);
      isListeningRef.current = false;
      setIsListening(false);
      setInterimText('');
    };

    recognitionRef.current = rec;
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current || isListeningRef.current) return;
    isListeningRef.current = true;
    setIsListening(true);
    try { recognitionRef.current.start(); } catch { /* already started */ }
  }, []);

  const stop = useCallback(() => {
    isListeningRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimText('');
  }, []);

  return { isListening, isSupported, interimText, start, stop };
}
