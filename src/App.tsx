import { useState, useEffect, useCallback, useRef } from 'react';
import { useVoiceEngine } from './hooks/useVoiceEngine';
import { useStoryAI, STORY_GENRES } from './hooks/useStoryAI';
import type { StoryState, StoryGenre } from './hooks/useStoryAI';
import './index.css';

const API_KEY = 'AIzaSyA9f5YjDt4Fd-ZA4nv6NCizNKf4_LZPgGY';

// ── ICONS ─────────────────────────────────────────────────────────────────────
const MicIcon = ({ size = 20 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
  </svg>
);

const StopIcon = ({ size = 20 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2"/>
  </svg>
);

type Screen = 'start' | 'genres' | 'loading' | 'game';

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]             = useState<Screen>('start');
  const [lang, setLang]                 = useState('en-IN');
  const [selectedGenre, setSelectedGenre] = useState<StoryGenre | null>(null);
  const [currentNode, setCurrentNode]   = useState<StoryState | null>(null);
  const [statusMsg, setStatusMsg]       = useState('');
  const [displayedText, setDisplayedText] = useState('');
  const screenRef  = useRef<Screen>('start');
  const typingRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { screenRef.current = screen; }, [screen]);

  const { initializeAI, generateNextNode, isAiThinking, error: aiError } = useStoryAI();

  const handleSpeechRecognized = useCallback(async (transcript: string) => {
    if (screenRef.current !== 'game') return;
    setStatusMsg('');
    const next = await generateNextNode(transcript);
    if (next) {
      setCurrentNode(next);
    } else {
      setStatusMsg("Couldn't connect — try again.");
      setTimeout(() => setStatusMsg(''), 3000);
    }
  }, [generateNextNode]);

  const {
    isSpeaking, isListening, interimTranscript,
    speakLine, startListening, stopListening, stopSpeaking,
    error: voiceError,
  } = useVoiceEngine({ onSpeechRecognized: handleSpeechRecognized, lang });

  // ── Typing animation whenever dialogue changes ──
  useEffect(() => {
    if (!currentNode?.spokenLine) return;
    if (typingRef.current) clearTimeout(typingRef.current);
    setDisplayedText('');
    let i = 0;
    const text = currentNode.spokenLine;
    const typeNext = () => {
      i++;
      setDisplayedText(text.slice(0, i));
      if (i < text.length) {
        const ch = text[i - 1];
        const delay = ['.', '!', '?'].includes(ch) ? 85
                    : ch === ','                    ? 40
                    : ch === '…'                    ? 120
                    :                                 18;
        typingRef.current = setTimeout(typeNext, delay);
      }
    };
    typingRef.current = setTimeout(typeNext, 300);
    return () => { if (typingRef.current) clearTimeout(typingRef.current); };
  }, [currentNode?.spokenLine]);

  // ── Auto-speak when dialogue changes ──
  useEffect(() => {
    if (currentNode?.spokenLine && screen === 'game') {
      const speaker = currentNode.characters.find(c => c.id === currentNode.speakerId) ?? currentNode.characters[0];
      const gender: 'male' | 'female' = speaker?.imageType === 'female' ? 'female' : 'male';
      const t = setTimeout(() => speakLine(currentNode.spokenLine, gender), 450);
      return () => clearTimeout(t);
    }
  }, [currentNode, screen]);

  // ── Auto-listen once TTS finishes ──
  // isListening is NOT in deps on purpose — it would cause a rapid toggle loop.
  useEffect(() => {
    if (!isSpeaking && screen === 'game' && currentNode && !currentNode.isEnd && !isAiThinking) {
      const t = setTimeout(() => startListening(), 600);
      return () => clearTimeout(t);
    }
  }, [isSpeaking, screen, isAiThinking, currentNode?.speakerId]);

  const goToStories = useCallback(() => {
    stopSpeaking(); stopListening();
    setCurrentNode(null); setSelectedGenre(null); setStatusMsg('');
    setScreen('genres');
  }, [stopSpeaking, stopListening]);

  const handleGenreSelect = async (genre: StoryGenre) => {
    setSelectedGenre(genre);
    setScreen('loading');
    stopSpeaking();
    window.speechSynthesis.cancel();
    const ok = initializeAI(API_KEY, genre);
    if (!ok) { setScreen('genres'); return; }
    const langName = lang === 'hi-IN' ? 'Hindi only' : lang === 'en-IN' ? 'Hinglish (mix of Hindi and English)' : 'English';
    const first = await generateNextNode(
      `[Story begins. Say one short punchy opening line in ${langName}. React as your character naturally would when meeting someone new. MAX 1-2 sentences.]`
    );
    if (first) { setCurrentNode(first); setScreen('game'); }
    else { setScreen('genres'); }
  };

  const handleMicToggle = () => {
    if (isListening) stopListening();
    else if (isSpeaking) { stopSpeaking(); setTimeout(startListening, 150); }
    else startListening();
  };

  // ═══════════════════════════════════════════════════════════
  // START SCREEN — Episode-style dark splash
  // ═══════════════════════════════════════════════════════════
  if (screen === 'start') return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(160deg, #06040f 0%, #0e0720 50%, #06040f 100%)',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
      fontFamily: "'Outfit', sans-serif",
      overflow: 'hidden',
    }}>
      {/* Background orbs */}
      <div style={{
        position: 'absolute', width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(255,61,127,0.12) 0%, transparent 70%)',
        top: '-10%', left: '-10%', borderRadius: '50%',
        filter: 'blur(40px)',
      }} />
      <div style={{
        position: 'absolute', width: 300, height: 300,
        background: 'radial-gradient(circle, rgba(184,61,255,0.10) 0%, transparent 70%)',
        bottom: '5%', right: '-5%', borderRadius: '50%',
        filter: 'blur(40px)',
      }} />

      <div style={{ maxWidth: 380, width: '100%', padding: '40px 28px', textAlign: 'center', position: 'relative' }}>
        {/* Logo */}
        <div style={{
          width: 88, height: 88, borderRadius: 24,
          background: 'linear-gradient(135deg, #FF3D7F, #B83DFF)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px', fontSize: '2.4rem',
          boxShadow: '0 12px 48px rgba(255,61,127,0.5)',
        }}>🎭</div>

        <h1 style={{
          fontSize: '3rem', fontWeight: 900, marginBottom: 6, lineHeight: 1,
          background: 'linear-gradient(135deg, #fff 30%, rgba(255,255,255,0.5))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Story.AI</h1>
        <p style={{ color: 'rgba(255,255,255,0.35)', marginBottom: 38, fontSize: '0.92rem', lineHeight: 1.6 }}>
          Voice-powered stories. You choose what happens next.
        </p>

        {/* Language selector */}
        <div style={{ marginBottom: 20, textAlign: 'left' }}>
          <label style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1.5 }}>
            Language
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { value: 'en-IN', label: '🇮🇳 Hinglish' },
              { value: 'en-US', label: '🇺🇸 English' },
              { value: 'hi-IN', label: '🇮🇳 Hindi' },
            ].map(opt => (
              <button key={opt.value} onClick={() => setLang(opt.value)} style={{
                flex: 1, padding: '10px 8px', borderRadius: 12,
                background: lang === opt.value ? 'linear-gradient(135deg, #FF3D7F22, #B83DFF22)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${lang === opt.value ? '#FF3D7F' : 'rgba(255,255,255,0.1)'}`,
                color: lang === opt.value ? 'white' : 'rgba(255,255,255,0.45)',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600,
                transition: 'all 0.2s',
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setScreen('genres')}
          style={{
            width: '100%', padding: '16px', borderRadius: 16,
            background: 'linear-gradient(135deg, #FF3D7F, #B83DFF)',
            border: 'none', color: 'white', fontFamily: 'inherit',
            fontSize: '1.05rem', fontWeight: 800, cursor: 'pointer',
            letterSpacing: 0.5, boxShadow: '0 8px 32px rgba(255,61,127,0.45)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(255,61,127,0.6)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(255,61,127,0.45)'; }}
        >
          Start Playing →
        </button>

        <p style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.7rem', marginTop: 18 }}>
          8 cinematic stories · AI characters · Voice-powered
        </p>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // GENRE SCREEN — Episode-style story cards
  // ═══════════════════════════════════════════════════════════
  if (screen === 'genres') return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(160deg, #06040f, #0e0720)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Outfit', sans-serif",
      overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 18px 0', flexShrink: 0 }}>
        <button onClick={() => setScreen('start')} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
          cursor: 'pointer', fontSize: '0.85rem', marginBottom: 16, fontFamily: 'inherit',
        }}>← Back</button>
        <h2 style={{ color: 'white', fontSize: '1.6rem', fontWeight: 900, margin: 0 }}>Choose Your Story</h2>
        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem', marginTop: 4, marginBottom: 16 }}>Tap to begin</p>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', padding: '0 18px 32px',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignContent: 'start',
      }}>
        {STORY_GENRES.map(genre => (
          <button
            key={genre.id}
            onClick={() => handleGenreSelect(genre)}
            style={{
              background: genre.color, border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 20, padding: '20px 14px',
              cursor: 'pointer', textAlign: 'left', color: 'white',
              transition: 'transform 0.15s, box-shadow 0.15s', outline: 'none',
              fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'; }}
            onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <div style={{ fontSize: '1.8rem', marginBottom: 8 }}>{genre.emoji}</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, marginBottom: 4 }}>{genre.title}</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.68rem', lineHeight: 1.4 }}>{genre.description}</div>
          </button>
        ))}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // LOADING SCREEN
  // ═══════════════════════════════════════════════════════════
  if (screen === 'loading' || !currentNode) return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(160deg, #06040f, #0e0720)',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
      fontFamily: "'Outfit', sans-serif",
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: 'linear-gradient(135deg, #FF3D7F22, #B83DFF22)',
          border: '2px solid rgba(255,61,127,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: '2rem',
          animation: 'pulse 1.5s ease infinite',
        }}>
          {selectedGenre?.emoji ?? '✨'}
        </div>
        <h2 style={{ color: 'white', fontSize: '1.25rem', fontWeight: 800 }}>{selectedGenre?.title ?? 'Loading'}…</h2>
        <p style={{ color: 'rgba(255,255,255,0.25)', marginTop: 8, fontSize: '0.85rem' }}>Setting the scene…</p>
        {aiError && <p style={{ color: '#ff8080', marginTop: 16, fontSize: '0.78rem', maxWidth: 280, margin: '16px auto 0' }}>{aiError}</p>}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // GAME SCREEN — Episode-style
  // ═══════════════════════════════════════════════════════════
  const speakerChar = currentNode.characters.find(c => c.id === currentNode.speakerId) ?? currentNode.characters[0];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: "'Outfit', sans-serif",
      maxWidth: 500, margin: '0 auto',
    }}>

      {/* ── BACKGROUND ── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        {currentNode.bgImageUrl && (
          <img
            key={currentNode.bgImageUrl}
            src={currentNode.bgImageUrl}
            alt=""
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center top',
              filter: 'brightness(0.42) saturate(1.3)',
              animation: 'bgFadeIn 0.8s ease',
            }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        {/* Deep cinematic gradient — darker at bottom for dialogue, lighter at top for character */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(4,2,14,1) 0%, rgba(4,2,14,0.75) 30%, rgba(4,2,14,0.1) 60%, transparent 100%)',
        }} />
      </div>

      {/* ── TOP BAR ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={goToStories} style={{
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.75)', padding: '6px 16px', borderRadius: 20,
          cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit',
          fontWeight: 600,
        }}>← Stories</button>

        {selectedGenre && (
          <span style={{
            marginLeft: 'auto',
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.4)', padding: '5px 12px', borderRadius: 20,
            fontSize: '0.72rem',
          }}>
            {selectedGenre.emoji} {selectedGenre.title}
          </span>
        )}
      </div>

      {/* ── CHARACTER — one speaker at a time, Episode-style ── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
        {speakerChar && (() => {
          const char = speakerChar;
          return (
            <div
              key={currentNode.speakerId}
              style={{
                position: 'absolute', bottom: 0,
                left: '50%', transform: 'translateX(-50%)',
                width: '80%', maxWidth: 400,
                height: '82vh',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              }}
            >
              {/* Character glow/atmosphere */}
              <div style={{
                position: 'absolute',
                bottom: '20%', left: '5%', right: '5%', height: '55%',
                background: 'radial-gradient(ellipse at center bottom, rgba(255,61,127,0.18) 0%, transparent 65%)',
                animation: isSpeaking ? 'speakGlow 1.4s ease-in-out infinite' : 'none',
                pointerEvents: 'none',
              }} />

              {/* Character image — heavily stylized to look illustrated */}
              <img
                src={char.imageUrl}
                alt={char.name}
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'contain', objectPosition: 'bottom center',
                  // Fade out at the feet so character blends with scene
                  maskImage: 'linear-gradient(to top, transparent 0%, black 10%)',
                  WebkitMaskImage: 'linear-gradient(to top, transparent 0%, black 10%)',
                  display: 'block',
                  // Heavy CSS treatment — makes photos look more illustrated/vivid
                  filter: 'saturate(2.0) contrast(1.25) brightness(1.08)',
                  // Slide in when character changes + lip-sync while speaking
                  animation: isSpeaking
                    ? 'charSlideUp 0.55s cubic-bezier(0.16,1,0.3,1) both, lipSync 0.32s ease-in-out infinite'
                    : 'charSlideUp 0.55s cubic-bezier(0.16,1,0.3,1) both',
                  transformOrigin: 'bottom center',
                }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />

              {/* Subtle pink outline/edge glow when speaking */}
              {isSpeaking && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'transparent',
                  boxShadow: 'inset 0 0 60px rgba(255,61,127,0.08)',
                  pointerEvents: 'none',
                }} />
              )}
            </div>
          );
        })()}
      </div>

      {/* ── DIALOGUE BOX — Episode-style ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
        padding: '0 12px 16px',
      }}>

        {/* Interim transcript — user's live speech bubble */}
        {isListening && interimTranscript && (
          <div style={{ textAlign: 'center', marginBottom: 10, animation: 'fadeIn 0.2s ease' }}>
            <span style={{
              color: 'rgba(255,255,255,0.85)', fontSize: '0.83rem',
              background: 'rgba(255,61,127,0.15)',
              border: '1px solid rgba(255,61,127,0.3)',
              padding: '6px 18px', borderRadius: 20, display: 'inline-block',
            }}>
              🎙 {interimTranscript}
            </span>
          </div>
        )}

        {/* Error / status */}
        {(statusMsg || voiceError || (aiError && !isSpeaking)) && !interimTranscript && (
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <span style={{
              color: voiceError || aiError ? '#ff7070' : 'rgba(255,255,255,0.4)',
              fontSize: '0.74rem', background: 'rgba(0,0,0,0.6)',
              padding: '4px 14px', borderRadius: 12,
            }}>
              {voiceError || aiError || statusMsg}
            </span>
          </div>
        )}

        {/* Main dialogue card */}
        <div style={{
          background: 'rgba(5, 3, 16, 0.94)',
          borderRadius: 22,
          padding: '16px 18px 14px',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 -4px 48px rgba(0,0,0,0.85)',
          animation: 'slideUp 0.35s ease',
        }}>
          {/* ── Name plate ── */}
          {speakerChar && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {/* Name badge — Episode pink/purple gradient pill */}
              <div style={{
                background: 'linear-gradient(135deg, #FF3D7F, #B83DFF)',
                borderRadius: 10, padding: '5px 15px',
                fontSize: '0.82rem', fontWeight: 900,
                color: 'white', letterSpacing: 0.8,
                textTransform: 'uppercase',
                boxShadow: '0 3px 14px rgba(255,61,127,0.4)',
              }}>
                {speakerChar.name}
              </div>

              {/* Speaking dots */}
              {isSpeaking && (
                <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #FF3D7F, #B83DFF)',
                      display: 'inline-block',
                      animation: `lipBounce 0.5s ease-in-out ${i * 0.13}s infinite alternate`,
                    }} />
                  ))}
                </div>
              )}

              {/* Listening / thinking status — right-aligned */}
              <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'rgba(255,255,255,0.22)' }}>
                {isListening ? '● listening' : isAiThinking ? '● thinking' : isSpeaking ? '● speaking' : ''}
              </span>
            </div>
          )}

          {/* ── Dialogue text ── */}
          <p style={{
            color: 'rgba(255,255,255,0.95)', fontSize: '1.02rem',
            lineHeight: 1.78, margin: 0, minHeight: 52,
            fontWeight: 400, letterSpacing: 0.1,
          }}>
            {displayedText}
            {/* Blinking cursor while text is still typing */}
            {displayedText.length < (currentNode.spokenLine?.length ?? 0) && (
              <span style={{
                animation: 'blink 0.7s step-end infinite',
                borderRight: '2px solid rgba(255,255,255,0.45)',
                marginLeft: 1,
              }} />
            )}
          </p>

          {/* ── Controls ── */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            {!currentNode.isEnd && (
              isAiThinking ? (
                <span style={{
                  color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem',
                  animation: 'pulse 1s infinite', display: 'flex', alignItems: 'center', gap: 7,
                }}>
                  <span style={{ fontSize: '1rem', animation: 'spin 1s linear infinite' }}>✦</span>
                  Generating…
                </span>
              ) : (
                <button
                  onClick={handleMicToggle}
                  style={{
                    background: isListening
                      ? 'linear-gradient(135deg, #FF3D7F, #B83DFF)'
                      : 'rgba(255,255,255,0.07)',
                    border: `1px solid ${isListening ? 'transparent' : 'rgba(255,255,255,0.13)'}`,
                    color: 'white', borderRadius: 50, padding: '10px 22px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '0.88rem', fontWeight: 700,
                    transition: 'all 0.2s',
                    animation: isListening ? 'micPulse 1.4s ease infinite' : 'none',
                    boxShadow: isListening ? '0 0 24px rgba(255,61,127,0.5)' : 'none',
                    letterSpacing: 0.3,
                  }}
                >
                  {isListening
                    ? <><StopIcon size={16}/> Listening…</>
                    : <><MicIcon size={16}/> {isSpeaking ? 'Interrupt' : 'Speak'}</>
                  }
                </button>
              )
            )}

            {isSpeaking && !isListening && !isAiThinking && !currentNode.isEnd && (
              <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.72rem' }}>
                tap mic to interrupt
              </span>
            )}
          </div>
        </div>

        {/* Story ended */}
        {currentNode.isEnd && (
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <button
              onClick={() => { setCurrentNode(null); setScreen('genres'); }}
              style={{
                background: 'linear-gradient(135deg, #FF3D7F, #B83DFF)',
                border: 'none', color: 'white', padding: '13px 32px',
                borderRadius: 50, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: '0.95rem', fontWeight: 800,
                boxShadow: '0 6px 28px rgba(255,61,127,0.45)',
              }}
            >
              Play Another Story →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
