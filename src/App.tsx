import { useState, useEffect, useCallback, useRef } from 'react';
import { useVoiceEngine } from './hooks/useVoiceEngine';
import { useStoryAI, STORY_GENRES } from './hooks/useStoryAI';
import type { StoryState, StoryGenre, Character } from './hooks/useStoryAI';
import './index.css';

const API_KEY = 'AIzaSyA9f5YjDt4Fd-ZA4nv6NCizNKf4_LZPgGY';

// ── ICONS ────────────────────────────────────────────────────────────────────
const MicIcon = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
  </svg>
);

const StopIcon = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2"/>
  </svg>
);

// Animated dots while character is speaking (lip-sync indicator)
const SpeakingDots = ({ active }: { active: boolean }) => (
  <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', marginLeft: 6, verticalAlign: 'middle' }}>
    {[0, 1, 2].map(i => (
      <span key={i} style={{
        width: 5, height: 5, borderRadius: '50%',
        background: active ? '#ff6b9d' : 'rgba(255,255,255,0.18)',
        display: 'inline-block',
        animation: active ? `lipBounce 0.55s ease-in-out ${i * 0.14}s infinite alternate` : 'none',
        transition: 'background 0.3s',
      }} />
    ))}
  </span>
);

type Screen = 'start' | 'genres' | 'loading' | 'game';

// ── CHARACTER POSITIONING (Episode-style, one at a time) ─────────────────────
// Always shows only the current speaker, centered.
// When speakerId changes, the new char slides in fresh (key= on the img triggers remount).
function getCharStyle(): React.CSSProperties {
  return {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    width: '78%',
    maxWidth: 380,
    height: '80vh',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 4,
  };
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]           = useState<Screen>('start');
  const [lang, setLang]               = useState('en-US');
  const [selectedGenre, setSelectedGenre] = useState<StoryGenre | null>(null);
  const [currentNode, setCurrentNode] = useState<StoryState | null>(null);
  const [statusMsg, setStatusMsg]     = useState('');
  const [displayedText, setDisplayedText] = useState(''); // typing animation
  const [prevBg, setPrevBg]           = useState('');     // for crossfade
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
      setStatusMsg('Couldn\'t connect — try again.');
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
        const delay = ['.',  '!',  '?'].includes(ch) ? 90
                    : ch === ','                       ? 45
                    : ch === '…'                       ? 130
                    :                                    22;
        typingRef.current = setTimeout(typeNext, delay);
      }
    };
    typingRef.current = setTimeout(typeNext, 350);
    return () => { if (typingRef.current) clearTimeout(typingRef.current); };
  }, [currentNode?.spokenLine]);

  // ── Auto-speak when dialogue changes ──
  useEffect(() => {
    if (currentNode?.spokenLine && screen === 'game') {
      const speaker = currentNode.characters.find(c => c.id === currentNode.speakerId) ?? currentNode.characters[0];
      const gender: 'male' | 'female' = speaker?.imageType === 'female' ? 'female' : 'male';
      const t = setTimeout(() => speakLine(currentNode.spokenLine, gender), 500);
      return () => clearTimeout(t);
    }
  }, [currentNode, screen]);

  // ── Auto-listen once TTS finishes ──
  // NOTE: isListening intentionally NOT in deps — it would cause a rapid toggle loop.
  // This fires only when speaking ends or a new node arrives.
  useEffect(() => {
    if (!isSpeaking && screen === 'game' && currentNode && !currentNode.isEnd && !isAiThinking) {
      const t = setTimeout(() => startListening(), 600);
      return () => clearTimeout(t);
    }
  }, [isSpeaking, screen, isAiThinking, currentNode?.speakerId]);

  // ── Background crossfade: track previous bg ──
  useEffect(() => {
    if (currentNode?.bgImageUrl && currentNode.bgImageUrl !== prevBg) {
      setPrevBg(currentNode.bgImageUrl);
    }
  }, [currentNode?.bgImageUrl]);

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
    const first = await generateNextNode(`[Story begins. Open with a short, punchy first line in ${langName}. React naturally as your character would when meeting someone new. Keep it to 1-2 sentences.]`);
    if (first) { setCurrentNode(first); setScreen('game'); }
    else { setScreen('genres'); }
  };

  const handleMicToggle = () => {
    if (isListening) stopListening();
    else if (isSpeaking) { stopSpeaking(); setTimeout(startListening, 150); }
    else startListening();
  };

  // ═══════════════════════════════════════════════════════════
  // START SCREEN
  // ═══════════════════════════════════════════════════════════
  if (screen === 'start') return (
    <div className="start-screen" style={{ gap: 0 }}>
      <div style={{ maxWidth: 400, width: '100%', padding: '48px 28px', textAlign: 'center' }}>
        {/* Logo */}
        <div style={{
          width: 80, height: 80, borderRadius: 22,
          background: 'linear-gradient(135deg, #ff6b9d, #c44dff)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 22px', fontSize: '2.2rem',
          boxShadow: '0 8px 40px rgba(255,107,157,0.45)',
        }}>🎭</div>

        <h1 style={{
          fontSize: '2.8rem', fontWeight: 900, marginBottom: 6,
          background: 'linear-gradient(135deg, #fff 40%, rgba(255,255,255,0.5))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Story.AI</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 36, fontSize: '0.95rem', lineHeight: 1.6 }}>
          Speak. Choose. Shape your destiny.
        </p>

        <div style={{ marginBottom: 18, textAlign: 'left' }}>
          <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Language</label>
          <select value={lang} onChange={e => setLang(e.target.value)} style={{
            width: '100%', padding: '12px 16px', borderRadius: 12,
            fontSize: '1rem', background: 'rgba(255,255,255,0.07)', color: 'white',
            border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', outline: 'none',
          }}>
            <option value="en-IN">🇮🇳 Hinglish (Hindi + English)</option>
            <option value="en-US">🇺🇸 English only</option>
            <option value="hi-IN">🇮🇳 Hindi only</option>
          </select>
        </div>

        <button className="start-button" style={{ width: '100%', fontSize: '1.05rem', padding: '15px' }} onClick={() => setScreen('genres')}>
          Start Playing →
        </button>

        <p style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.72rem', marginTop: 20 }}>
          Voice-powered · AI characters · 8 cinematic stories
        </p>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // GENRE SCREEN
  // ═══════════════════════════════════════════════════════════
  if (screen === 'genres') return (
    <div style={{ width: '100vw', height: '100dvh', background: 'linear-gradient(160deg,#060612,#0d0920)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
        <button onClick={() => setScreen('start')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '0.88rem', marginBottom: 14, fontFamily: 'inherit' }}>← Back</button>
        <h2 style={{ color: 'white', fontSize: '1.55rem', fontWeight: 800, margin: 0 }}>Choose Your Story</h2>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem', marginTop: 4, marginBottom: 14 }}>Tap to begin</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignContent: 'start' }}>
        {STORY_GENRES.map(genre => (
          <button key={genre.id} onClick={() => handleGenreSelect(genre)} style={{
            background: genre.color,
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 16, padding: '18px 14px', cursor: 'pointer', textAlign: 'left', color: 'white',
            transition: 'transform 0.15s, box-shadow 0.15s', outline: 'none', fontFamily: 'inherit',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0,0.45)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
            onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <div style={{ fontSize: '1.65rem', marginBottom: 6 }}>{genre.emoji}</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 3 }}>{genre.title}</div>
            <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.7rem', lineHeight: 1.35 }}>{genre.description}</div>
          </button>
        ))}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // LOADING SCREEN
  // ═══════════════════════════════════════════════════════════
  if (screen === 'loading' || !currentNode) return (
    <div className="start-screen">
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2.4rem', display: 'inline-block', animation: 'spin 1.5s linear infinite', marginBottom: 18 }}>✨</div>
        <h2 style={{ color: 'white', fontSize: '1.3rem', fontWeight: 700 }}>{selectedGenre?.title ?? 'Loading'}…</h2>
        <p style={{ color: 'rgba(255,255,255,0.28)', marginTop: 8, fontSize: '0.88rem' }}>Setting the scene…</p>
        {aiError && <p style={{ color: '#ff8080', marginTop: 14, fontSize: '0.78rem', maxWidth: 300, margin: '14px auto 0' }}>{aiError}</p>}
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // GAME SCREEN — Episode-style
  // ═══════════════════════════════════════════════════════════
  const speakerChar = currentNode.characters.find(c => c.id === currentNode.speakerId) ?? currentNode.characters[0];

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#000',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "'Outfit', sans-serif",
      maxWidth: 500, margin: '0 auto',   // mobile-first, Episode-style portrait
    }}>

      {/* ── BACKGROUND (crossfade on change) ── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        {currentNode.bgImageUrl && (
          <img
            key={currentNode.bgImageUrl}  /* key change triggers re-mount + fade-in */
            src={currentNode.bgImageUrl}
            alt=""
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center',
              filter: 'brightness(0.52) saturate(1.25)',
              animation: 'bgFadeIn 0.9s ease',
            }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        {/* Cinematic vignette */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 30%, transparent 40%, rgba(0,0,0,0.55) 100%)' }} />
        {/* Bottom gradient for dialogue legibility */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.25) 48%, transparent 100%)' }} />
      </div>

      {/* ── TOP BAR ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)',
      }}>
        <button onClick={goToStories} style={{
          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)',
          color: 'white', padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
          fontSize: '0.78rem', fontFamily: 'inherit', backdropFilter: 'blur(8px)',
        }}>← Stories</button>

        {selectedGenre && (
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem' }}>
            {selectedGenre.emoji} {selectedGenre.title}
          </span>
        )}

        {/* Status indicator top-right */}
        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>
          {isListening ? '🎙 Listening' : isSpeaking ? '🔊 Speaking' : isAiThinking ? '⟳ Thinking' : ''}
        </span>
      </div>

      {/* ── CHARACTER — only the active speaker, one at a time ── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
        {(() => {
          const char = speakerChar;
          if (!char) return null;
          return (
            <div key={currentNode.speakerId} style={getCharStyle()}>
              {/* Glow behind speaker when talking */}
              {isSpeaking && (
                <div style={{
                  position: 'absolute', inset: -12, top: 60,
                  background: 'transparent',
                  boxShadow: '0 0 60px rgba(255,107,157,0.28)',
                  borderRadius: 12,
                  animation: 'speakGlow 1.4s ease infinite',
                  pointerEvents: 'none',
                }} />
              )}
              <img
                key={char.imageUrl}
                src={char.imageUrl}
                alt={char.name}
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'contain', objectPosition: 'bottom center',
                  maskImage: 'linear-gradient(to top, transparent 0%, black 12%)',
                  WebkitMaskImage: 'linear-gradient(to top, transparent 0%, black 12%)',
                  display: 'block',
                  // Slide in fresh every time speaker changes + lip-sync while speaking
                  animation: isSpeaking
                    ? 'charSlideUp 0.55s cubic-bezier(0.16,1,0.3,1) both, lipSync 0.32s ease-in-out infinite'
                    : 'charSlideUp 0.55s cubic-bezier(0.16,1,0.3,1) both',
                  transformOrigin: 'bottom center',
                  filter: 'saturate(1.4) contrast(1.05)',
                }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          );
        })()}
      </div>

      {/* ── DIALOGUE BOX ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
        padding: '0 10px 12px',
        animation: 'slideUp 0.4s ease',
      }}>

        {/* Interim transcript (user speaking preview) */}
        {isListening && interimTranscript && (
          <div style={{
            textAlign: 'center', marginBottom: 8,
            animation: 'fadeIn 0.2s ease',
          }}>
            <span style={{
              color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem',
              background: 'rgba(255,107,157,0.15)',
              border: '1px solid rgba(255,107,157,0.3)',
              padding: '4px 14px', borderRadius: 20, display: 'inline-block',
            }}>
              🎙 {interimTranscript}
            </span>
          </div>
        )}

        {/* Error / status */}
        {(statusMsg || voiceError || (aiError && !isSpeaking)) && !interimTranscript && (
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <span style={{ color: voiceError || aiError ? '#ff8080' : 'rgba(255,255,255,0.45)', fontSize: '0.76rem', background: 'rgba(0,0,0,0.5)', padding: '3px 12px', borderRadius: 12 }}>
              {voiceError || aiError || statusMsg}
            </span>
          </div>
        )}

        {/* Main dialogue card */}
        <div style={{
          background: 'rgba(6,6,16,0.93)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 20,
          padding: '14px 16px 12px',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 -4px 40px rgba(0,0,0,0.7)',
        }}>
          {/* Name plate */}
          {speakerChar && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
              <div style={{
                background: 'linear-gradient(135deg, #ff6b9d, #c44dff)',
                borderRadius: 8, padding: '4px 12px',
                fontSize: '0.82rem', fontWeight: 800, color: 'white', letterSpacing: 0.5,
              }}>
                {speakerChar.name}
              </div>
              {speakerChar.role && (
                <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {speakerChar.role}
                </span>
              )}
              <SpeakingDots active={isSpeaking} />

              {/* Character dots (multi-char scene indicator) */}
              {currentNode.characters.length > 1 && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center' }}>
                  {currentNode.characters.map(c => (
                    <div key={c.id} title={c.name} style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: c.id === currentNode.speakerId ? '#ff6b9d' : 'rgba(255,255,255,0.18)',
                      transition: 'background 0.35s',
                    }} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Dialogue text with typing animation */}
          <p style={{
            color: 'rgba(255,255,255,0.93)', fontSize: '0.97rem',
            lineHeight: 1.72, margin: 0, minHeight: 56,
          }}>
            {displayedText}
            {/* Blinking cursor while typing */}
            {displayedText.length < (currentNode.spokenLine?.length ?? 0) && (
              <span style={{ animation: 'blink 0.7s step-end infinite', borderRight: '2px solid rgba(255,255,255,0.6)', marginLeft: 1 }}/>
            )}
          </p>

          {/* Bottom controls */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            {!currentNode.isEnd && (
              isAiThinking ? (
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem', animation: 'pulse 1s infinite', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '1rem', animation: 'spin 1s linear infinite' }}>⟳</span> Generating…
                </span>
              ) : (
                <button
                  onClick={handleMicToggle}
                  style={{
                    background: isListening
                      ? 'linear-gradient(135deg, #ff6b9d, #c44dff)'
                      : 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    color: 'white', borderRadius: 30, padding: '9px 20px',
                    display: 'flex', alignItems: 'center', gap: 7,
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600,
                    transition: 'all 0.2s',
                    animation: isListening ? 'micPulse 1.4s ease infinite' : 'none',
                    boxShadow: isListening ? '0 0 20px rgba(255,107,157,0.4)' : 'none',
                  }}
                >
                  {isListening ? <><StopIcon size={16}/> Listening…</> : <><MicIcon size={16}/> {isSpeaking ? 'Interrupt' : 'Speak'}</>}
                </button>
              )
            )}

            {isSpeaking && !isListening && !isAiThinking && (
              <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: '0.75rem' }}>
                Tap mic to interrupt
              </span>
            )}
          </div>
        </div>

        {/* Story ended */}
        {currentNode.isEnd && (
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <button className="start-button" onClick={() => { setCurrentNode(null); setScreen('genres'); }}
              style={{ padding: '12px 28px', fontSize: '0.95rem' }}>
              Play Another Story →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
