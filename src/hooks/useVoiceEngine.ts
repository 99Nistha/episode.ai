import { useState, useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface UseVoiceEngineProps {
  onSpeechRecognized: (transcript: string) => void;
  lang?: string;
}

function cleanForSpeech(raw: string): string {
  return raw
    .replace(/\*[^*]*\*/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toChunks(text: string): string[] {
  const parts = text.match(/[^.!?…]+[.!?…]+(?:\s|$)|[^.!?…]+$/g);
  return (parts ?? [text]).map(s => s.trim()).filter(Boolean);
}

export const useVoiceEngine = ({ onSpeechRecognized, lang = 'en-US' }: UseVoiceEngineProps) => {
  const [isSpeaking, setIsSpeaking]               = useState(false);
  const [isListening, setIsListening]             = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError]                         = useState<string | null>(null);
  const [voicesLoaded, setVoicesLoaded]           = useState(false);

  const recognitionRef  = useRef<any>(null);
  const onSpeechRef     = useRef(onSpeechRecognized);
  const isSpeakingRef   = useRef(false);
  const isListeningRef  = useRef(false);

  useEffect(() => { onSpeechRef.current = onSpeechRecognized; }, [onSpeechRecognized]);

  // Load TTS voices (async in most browsers)
  useEffect(() => {
    const load = () => { if (window.speechSynthesis.getVoices().length > 0) setVoicesLoaded(true); };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  // ── Speech Recognition ────────────────────────────────────────────────────
  // continuous: true  → recognition keeps going even through pauses, no flicker
  // interimResults: true → user sees live transcript as they speak
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError('Speech recognition not supported.'); return; }

    const rec = new SR();
    rec.continuous     = true;    // ← stay alive through pauses — NO flicker
    rec.interimResults = true;    // ← show live transcript
    rec.lang           = lang;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      let interim = '';
      let finalText = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }

      if (interim) setInterimTranscript(interim);

      if (finalText.trim()) {
        // Got a complete utterance — stop listening and send it
        setInterimTranscript('');
        try { rec.stop(); } catch {}
        isListeningRef.current = false;
        setIsListening(false);
        onSpeechRef.current(finalText.trim());
      }
    };

    rec.onerror = (e: any) => {
      if (e.error === 'no-speech') {
        // With continuous mode this is just a pause — ignore, keep listening
        return;
      }
      if (e.error === 'aborted') return;
      // Real error — surface it and stop
      setError(`Mic: ${e.error}`);
      isListeningRef.current = false;
      setIsListening(false);
      setInterimTranscript('');
    };

    rec.onend = () => {
      // Only update state if we intended to stop (not a restart mid-session)
      if (isListeningRef.current) {
        // Recognition ended unexpectedly — try restarting once
        try { rec.start(); } catch {
          isListeningRef.current = false;
          setIsListening(false);
        }
      }
    };

    recognitionRef.current = rec;
    return () => {
      isListeningRef.current = false;
      try { rec.abort(); } catch {}
    };
  }, [lang]);

  // ── TTS (human-like, chunked) ─────────────────────────────────────────────
  const speakLine = useCallback((text: string, gender: 'male' | 'female' = 'male') => {
    if (!text) return;
    window.speechSynthesis.cancel();

    const cleaned = cleanForSpeech(text);
    if (!cleaned) return;

    const chunks  = toChunks(cleaned);
    const voices  = window.speechSynthesis.getVoices();
    const langBase = lang.split('-')[0];
    const isHindi  = lang.startsWith('hi');

    let pick: SpeechSynthesisVoice | undefined;

    if (isHindi) {
      pick = voices.find(v => v.lang.startsWith('hi') && v.name.toLowerCase().includes('google'));
      if (!pick) pick = voices.find(v => v.lang === 'en-IN' && v.name.toLowerCase().includes('rishi'));
      if (!pick) pick = voices.find(v => v.lang === 'en-IN');
      if (!pick) pick = voices.find(v => v.lang.startsWith('hi'));
    } else if (lang === 'en-IN') {
      // Rishi is the most natural-sounding en-IN male voice
      pick = voices.find(v => v.name.toLowerCase().includes('rishi'));
      if (!pick) pick = voices.find(v => v.lang === 'en-IN');
      if (!pick) pick = voices.find(v => v.name.toLowerCase().includes('daniel'));
      if (!pick) pick = voices.find(v => v.lang === 'en-US' || v.lang === 'en-GB');
    } else {
      // Priority: Google neural voices (best quality) → named system voices → any en-US
      const googleMale   = ['google uk english male', 'google us english'];
      const googleFemale = ['google uk english female'];
      // System voices — most natural-sounding on each platform
      const sysMale   = ['daniel', 'arthur', 'rishi', 'alex', 'tom', 'aaron', 'mark', 'david'];
      const sysFemale = ['samantha', 'moira', 'karen', 'fiona', 'tessa', 'victoria', 'zira'];

      if (gender === 'female') {
        pick = voices.find(v => googleFemale.some(n => v.name.toLowerCase().includes(n)));
        if (!pick) pick = voices.find(v => v.lang.startsWith(langBase) && sysFemale.some(n => v.name.toLowerCase().includes(n)));
      } else {
        pick = voices.find(v => googleMale.some(n => v.name.toLowerCase().includes(n)));
        if (!pick) pick = voices.find(v => v.lang.startsWith(langBase) && sysMale.some(n => v.name.toLowerCase().includes(n)));
      }
      if (!pick) pick = voices.find(v => v.lang === 'en-US' || v.lang === 'en-GB');
    }
    if (!pick && voices.length) pick = voices[0];

    let chunkIdx = 0;

    const speakNext = () => {
      if (chunkIdx >= chunks.length) {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        return;
      }
      const utt   = new SpeechSynthesisUtterance(chunks[chunkIdx]);
      utt.lang    = lang;
      // Natural rate: 0.9–1.05 — don't go too slow, it sounds robotic
      utt.rate    = 0.92 + (Math.random() * 0.10 - 0.05);
      // Natural pitch: keep it at 1.0 for male — lowering pitch sounds mechanical.
      // Females: very slight raise. Hindi: flat natural.
      utt.pitch   = isHindi ? 1.0 : gender === 'female' ? 1.05 : 1.0;
      if (pick) utt.voice = pick;

      if (chunkIdx === 0) {
        utt.onstart = () => { isSpeakingRef.current = true; setIsSpeaking(true); };
      }
      utt.onend = () => {
        chunkIdx++;
        if (chunkIdx < chunks.length) setTimeout(speakNext, 120 + Math.random() * 160);
        else { isSpeakingRef.current = false; setIsSpeaking(false); }
      };
      utt.onerror = () => { isSpeakingRef.current = false; setIsSpeaking(false); };
      window.speechSynthesis.speak(utt);
    };

    setTimeout(speakNext, 80);
  }, [lang]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListeningRef.current || isSpeakingRef.current) return;
    try {
      setError(null);
      setInterimTranscript('');
      recognitionRef.current.start();
      isListeningRef.current = true;
      setIsListening(true);
    } catch (e) {
      console.error('Start listening error:', e);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListeningRef.current) {
      isListeningRef.current = false;
      setIsListening(false);
      setInterimTranscript('');
      try { recognitionRef.current.stop(); } catch {}
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    setIsSpeaking(false);
  }, []);

  return {
    isSpeaking, isListening, interimTranscript,
    speakLine, startListening, stopListening, stopSpeaking,
    error, voicesLoaded,
  };
};
