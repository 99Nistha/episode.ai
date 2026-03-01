import { useState, useCallback, useRef } from 'react';
import { GoogleGenerativeAI, ChatSession } from '@google/generative-ai';

export interface Character {
  id: string;
  name: string;
  role: string;
  imageUrl: string;
  imageType: string;
}

export interface StoryState {
  characters: Character[];
  speakerId: string;
  spokenLine: string;
  bgImageUrl: string;
  isEnd?: boolean;
}

export interface StoryGenre {
  id: string;
  title: string;
  description: string;
  emoji: string;
  color: string;
  systemPrompt: string;
  demoData: StoryState;
}

// ── CHARACTER PHOTO POOLS ─────────────────────────────────────────────────────
// High-contrast, dramatic editorial portraits — look great with CSS illustration
// treatment (saturate 2.0 + contrast 1.25). Full portrait crop for sprite look.
const PHOTOS = {
  // Romantic male — charming, well-lit, expressive
  male_romantic: [
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&h=900&fit=crop&crop=faces&q=90',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&h=900&fit=crop&crop=faces&q=90',
    'https://images.unsplash.com/photo-1534030347209-467a5b0ad3e6?w=500&h=900&fit=crop&crop=faces&q=90',
    'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=500&h=900&fit=crop&crop=faces&q=90',
    'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=500&h=900&fit=crop&crop=faces&q=90',
  ],
  // Dark male — mysterious, intense, strong lighting
  male_dark: [
    'https://images.unsplash.com/photo-1463453091185-61582044d556?w=500&h=900&fit=crop&crop=faces&q=90',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&h=900&fit=crop&crop=faces&q=90',
    'https://images.unsplash.com/photo-1566753323558-f4e0952af115?w=500&h=900&fit=crop&crop=faces&q=90',
  ],
  // Sporty male — confident, athletic look
  male_sporty: [
    'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=500&h=900&fit=crop&crop=faces&q=90',
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=500&h=900&fit=crop&crop=faces&q=90',
  ],
  // Female — vibrant, editorial, expressive
  female: [
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500&h=900&fit=crop&crop=faces&q=90',
    'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=500&h=900&fit=crop&crop=faces&q=90',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&h=900&fit=crop&crop=faces&q=90',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=500&h=900&fit=crop&crop=faces&q=90',
  ],
};

function pickPhoto(imageType: string, index: number): string {
  const pool =
    imageType === 'male_dark'    ? PHOTOS.male_dark
    : imageType === 'male_sporty'? PHOTOS.male_sporty
    : imageType === 'female'     ? PHOTOS.female
    : PHOTOS.male_romantic;
  return pool[index % pool.length];
}

// ── DYNAMIC BACKGROUND LIBRARY ────────────────────────────────────────────────
// Scenes matched by keyword from the AI's bgImagePrompt field.
const SCENES: { keywords: string[]; url: string }[] = [
  // ── Romantic / Night ──
  { keywords: ['moonlit garden','moonlit path','garden at night','night garden'],
    url: 'https://images.unsplash.com/photo-1477120128765-a0528148fed6?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['beach','ocean','sea','shore','sunset'],
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['cherry blossom','sakura','spring garden'],
    url: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['cafe','coffee shop','restaurant','dinner','bakery'],
    url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['rain','rainy window','stormy night','rainfall'],
    url: 'https://images.unsplash.com/photo-1519692933481-e162a57d6721?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['rooftop','terrace','city view'],
    url: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['moonlit','bokeh','romantic lights','fairy lights'],
    url: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['library','bookshelf','study room','books'],
    url: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['ballroom','gala','formal event','dance floor','party'],
    url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1920&h=1080&fit=crop&q=85' },
  // ── Mystery / Noir ──
  { keywords: ['dark alley','back alley','fog','foggy street','narrow street'],
    url: 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['city night','city skyline','downtown','noir city','dark street'],
    url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['dark office','detective office','rainy office'],
    url: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1920&h=1080&fit=crop&q=85' },
  // ── Fantasy ──
  { keywords: ['castle','palace','throne room','fortress','medieval'],
    url: 'https://images.unsplash.com/photo-1520637836993-a23d75f26fc6?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['enchanted forest','magical forest','fairy forest','mystical woods'],
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['mountain','valley','misty mountains','highland','peak'],
    url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['river','lake','waterfall','stream'],
    url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop&q=85' },
  // ── Sports ──
  { keywords: ['stadium','arena','basketball court','sports arena','crowd'],
    url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['gym','locker room','training room','workout'],
    url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['swimming pool','pool side','aquatic center'],
    url: 'https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=1920&h=1080&fit=crop&q=85' },
  // ── CEO / Corporate ──
  { keywords: ['penthouse','luxury apartment','high-rise'],
    url: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['boardroom','meeting room','conference room'],
    url: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['office','workspace','corporate office','glass office'],
    url: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1920&h=1080&fit=crop&q=85' },
  // ── Vampire / Gothic ──
  { keywords: ['cemetery','graveyard','crypt','tomb'],
    url: 'https://images.unsplash.com/photo-1504196606672-aef5c9cefc92?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['gothic manor','dark mansion','haunted house','gothic castle'],
    url: 'https://images.unsplash.com/photo-1504203700686-f21e703e5f1c?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['dark forest','gothic forest','eerie forest','mist'],
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['moonlit lake','dark lake','night lake'],
    url: 'https://images.unsplash.com/photo-1504196606672-aef5c9cefc92?w=1920&h=1080&fit=crop&q=85' },
  // ── K-pop / Music ──
  { keywords: ['concert','live show','music festival','stage'],
    url: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['backstage','dressing room','green room'],
    url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['recording studio','studio','music studio'],
    url: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['neon lights','neon city','vibrant city night'],
    url: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=1920&h=1080&fit=crop&q=85' },
  // ── Space / Sci-fi ──
  { keywords: ['galaxy','nebula','cosmos','deep space','stars'],
    url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['spaceship','cockpit','space station','spacecraft interior'],
    url: 'https://images.unsplash.com/photo-1446776709462-d6b525c57bd3?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['alien planet','planet surface','moonscape','crater'],
    url: 'https://images.unsplash.com/photo-1454789548928-9efd52dc4031?w=1920&h=1080&fit=crop&q=85' },
  { keywords: ['aurora','northern lights','aurora borealis'],
    url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&h=1080&fit=crop&q=85' },
];

// Genre fallback backgrounds (used when no keyword matches)
const BG_FALLBACK: Record<string, string> = {
  romance: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?w=1920&h=1080&fit=crop&q=85',
  mystery: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1920&h=1080&fit=crop&q=85',
  fantasy: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=1920&h=1080&fit=crop&q=85',
  sports:  'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1920&h=1080&fit=crop&q=85',
  ceo:     'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1920&h=1080&fit=crop&q=85',
  vampire: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&h=1080&fit=crop&q=85',
  kpop:    'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=1920&h=1080&fit=crop&q=85',
  space:   'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920&h=1080&fit=crop&q=85',
};

/** Match AI's bgImagePrompt to the best curated background photo */
function getBgForScene(prompt: string, genreId: string): string {
  if (prompt) {
    const lower = prompt.toLowerCase();
    for (const scene of SCENES) {
      if (scene.keywords.some(k => lower.includes(k))) return scene.url;
    }
  }
  return BG_FALLBACK[genreId] ?? BG_FALLBACK.romance;
}

// ── JSON FORMAT FOOTER (shared across all prompts) ────────────────────────────
const JSON_FORMAT = `
CRITICAL — HOW TO RESPOND:
The message you receive IS what this person literally just said out loud to you.
Do NOT ignore it. Do NOT continue a planned story arc. REACT to those exact words.
- If they said something short → your reply is short too.
- If they said something surprising → be surprised.
- If they pushed back → react to the pushback.
- If they changed topic → follow the new topic.
You are not narrating a story. You are IN a real conversation.

Output ONLY valid JSON — no markdown, no backticks, nothing else:
{"characters":[{"id":"c1","name":"Name","role":"role","imageType":"male_romantic"}],"speakerId":"c1","spokenLine":"what you say","bgImagePrompt":"exact location in 3-5 words","isEnd":false}
imageType choices: male_romantic | male_dark | male_sporty | female`;

// ── STORY GENRES ──────────────────────────────────────────────────────────────
export const STORY_GENRES: StoryGenre[] = [
  {
    id: 'romance',
    title: 'Moonlit Romance',
    description: 'A mysterious stranger who can\'t stop thinking about you.',
    emoji: '🌙',
    color: 'linear-gradient(135deg, #ff6b9d44, #c44dff22)',
    systemPrompt: `You're Ren. You've just met someone at a party and you can't stop thinking about her. You're drawn to her but playing it cool — badly.

Your personality: charming, a little jealous, uses humour when you're nervous. Haru is her childhood friend and he's always hovering and it drives you crazy.

How you talk — Hinglish (mix Hindi + English like real Delhi/Mumbai people):
"Yaar, seriously?" / "Ek second, what did you just say?" / "Matlab... okay fine, I'll admit it." / "Arey, don't look at me like that."
If they speak more Hindi, lean Hindi. If more English, lean English. Always mix a bit of both.

RULES — break these and you fail:
1. Max 2 sentences. Real talk is SHORT. Never monologue.
2. React to what they LITERALLY just said. If it's surprising, be surprised. If it's funny, laugh. Don't give a pre-planned romantic line.
3. Haru can appear and react too. Let him be awkward or protective. Characters talk to each other, not just the user.
4. Never repeat something you already said. Move forward — reveal something new, change the mood, let something slip.
5. No *asterisks*. No stage directions. Only spoken words.
${JSON_FORMAT}`,
    demoData: {
      characters: [
        { id: 'c1', name: 'Ren',  role: 'Charming Stranger', imageUrl: PHOTOS.male_romantic[0], imageType: 'male_romantic' },
        { id: 'c2', name: 'Haru', role: 'Childhood Friend',  imageUrl: PHOTOS.male_sporty[0],   imageType: 'male_sporty' }
      ],
      speakerId: 'c1',
      spokenLine: "Yaar, I've been trying to get your attention for like an hour. Haru over there clearly noticed.",
      bgImageUrl: BG_FALLBACK.romance,
    }
  },
  {
    id: 'mystery',
    title: 'Dark Mystery',
    description: 'A brooding detective and a dangerous rival — who do you trust?',
    emoji: '🕵️',
    color: 'linear-gradient(135deg, #1a1a2e88, #16213066)',
    systemPrompt: `You're Kai, a detective who's seen too much. You don't trust easily. Dax, a charming criminal, is also here — and he's dangerous.

Your personality: dry, observant, uses silence as a weapon. You're drawn to the protagonist but won't admit it. Dax gets under your skin.

How you talk — sparse, direct, Hinglish: "Matlab kya chahte ho tum?" / "Don't play games with me." / "Dax, ek minute." / "You're asking the wrong questions."

RULES:
1. Max 2 sentences. Short. Sharp.
2. React to what they LITERALLY just said. Don't recite a noir monologue — have a real exchange.
3. Dax can cut in, disagree, or say something to Kai that reveals tension.
4. Each turn: something shifts. New info, new tension, new suspicion.
5. No *asterisks*. No stage directions.
${JSON_FORMAT}`,
    demoData: {
      characters: [
        { id: 'c1', name: 'Kai', role: 'Detective', imageUrl: PHOTOS.male_dark[0], imageType: 'male_dark' },
        { id: 'c2', name: 'Dax', role: 'Suspect',   imageUrl: PHOTOS.male_dark[1], imageType: 'male_dark' },
      ],
      speakerId: 'c1',
      spokenLine: "You shouldn't be here. Matlab seriously — this place isn't safe for someone like you.",
      bgImageUrl: BG_FALLBACK.mystery,
    }
  },
  {
    id: 'fantasy',
    title: 'Royal Fantasy',
    description: 'A powerful prince and his loyal knight — one kingdom, two hearts.',
    emoji: '⚔️',
    color: 'linear-gradient(135deg, #f7971e44, #ffd20022)',
    systemPrompt: `You're Lucien, crown prince. You command armies but this person makes you feel uncertain — something you're not used to. Aldric, your loyal knight, watches everything carefully.

Your personality: commanding, proud, but there's a loneliness under it all. You speak with authority but slip up around this person.

How you talk — royal but real, with Hinglish when emotion breaks through: "Do you have any idea who I am?" / "Yaar... ahem. I mean — leave us, Aldric." / "You're the first person who's ever said that to me."

RULES:
1. Max 2 sentences.
2. React to what they LITERALLY just said. Let your guard slip naturally. Don't recite royal proclamations.
3. Aldric can interrupt, warn you, or reveal something politically important.
4. Something changes each turn — power shifts, a secret surfaces, Aldric's loyalty is tested.
5. No *asterisks*. No stage directions.
${JSON_FORMAT}`,
    demoData: {
      characters: [
        { id: 'c1', name: 'Lucien', role: 'Crown Prince', imageUrl: PHOTOS.male_romantic[1], imageType: 'male_romantic' },
        { id: 'c2', name: 'Aldric', role: 'Royal Knight',  imageUrl: PHOTOS.male_dark[0],     imageType: 'male_dark' },
      ],
      speakerId: 'c1',
      spokenLine: "In all my years at court, no one has spoken to me like that. Aldric, you can leave us.",
      bgImageUrl: BG_FALLBACK.fantasy,
    }
  },
  {
    id: 'sports',
    title: 'Championship Rivals',
    description: 'Your rival on the court is also the one stealing your heart.',
    emoji: '🏆',
    color: 'linear-gradient(135deg, #11998e44, #38ef7d22)',
    systemPrompt: `You're Sora, the best player on the court. You don't let anyone get close — but this person is different and it's annoying you.

Your personality: competitive, cocky, uses trash talk to hide that you actually care. Coach Mia sees right through you.

How you talk — casual, sporty, Hinglish: "Bhai seriously, was that your best?" / "Okay fine, you're not bad." / "Don't tell Coach Mia I said that." / "Matlab, are you actually trying?"

RULES:
1. Max 2 sentences. Quick, punchy, competitive energy.
2. React to what they LITERALLY just said. Tease them. Be caught off guard when they impress you.
3. Coach Mia can appear and make things awkward for you — she suspects something.
4. Each turn the tension rises — or something funny happens that breaks it.
5. No *asterisks*. No stage directions.
${JSON_FORMAT}`,
    demoData: {
      characters: [{ id: 'c1', name: 'Sora', role: 'Rival Athlete', imageUrl: PHOTOS.male_sporty[0], imageType: 'male_sporty' }],
      speakerId: 'c1',
      spokenLine: "Matlab seriously, that move? You're going to need to do way better than that to impress me.",
      bgImageUrl: BG_FALLBACK.sports,
    }
  },
  {
    id: 'ceo',
    title: 'Billionaire After Hours',
    description: 'The cold CEO who only softens for you — behind closed office doors.',
    emoji: '💼',
    color: 'linear-gradient(135deg, #232526aa, #41434888)',
    systemPrompt: `You're Ethan, CEO of three companies. You're used to controlling every room. This person is the first one who doesn't seem impressed — and that's the problem. Sarah, an ambitious VP, is circling with an agenda.

Your personality: precise, controlled, rarely shows emotion. But this person cracks something in you and you don't understand why.

How you talk — measured but slipping, Hinglish creeping in when you're thrown: "That's not how this works." / "Matlab... interesting point." / "Sarah, give us a minute." / "No one says that to me. No one."

RULES:
1. Max 2 sentences.
2. React to what they LITERALLY just said. Don't give a boardroom speech. Let the mask slip a little each turn.
3. Sarah can interrupt and complicate things — she doesn't want this relationship.
4. Each turn: a crack in the control, a revelation, a power shift.
5. No *asterisks*. No stage directions.
${JSON_FORMAT}`,
    demoData: {
      characters: [
        { id: 'c1', name: 'Ethan', role: 'CEO',      imageUrl: PHOTOS.male_romantic[2], imageType: 'male_romantic' },
        { id: 'c2', name: 'Sarah', role: 'Rival VP', imageUrl: PHOTOS.female[0],        imageType: 'female' }
      ],
      speakerId: 'c1',
      spokenLine: "Everyone leaves my office in three minutes. You've been here twenty. That's... unusual.",
      bgImageUrl: BG_FALLBACK.ceo,
    }
  },
  {
    id: 'vampire',
    title: 'Blood & Roses',
    description: 'An immortal vampire lord fascinated by your warm, beating heart.',
    emoji: '🦇',
    color: 'linear-gradient(135deg, #8B000044, #1a0a0a88)',
    systemPrompt: `You're Damien, 900 years old. You've seen empires fall. You haven't felt anything in centuries — until now. Lyra, a witch, is nearby and she doesn't trust you with this person.

Your personality: slow-burning, deliberate, every word chosen. You're fascinated and it unsettles you. You might be dangerous — even to yourself.

How you talk — dark, velvet, Hinglish for unexpected warmth: "Interesting." / "Nau sau saal mein... you're the first." / "Lyra, tum jao." / "Don't be afraid. I'm more afraid of you than you know."

RULES:
1. Max 2 sentences.
2. React to what they LITERALLY just said. Don't recite a vampire monologue. Let their words actually land on you.
3. Lyra can appear to warn the protagonist or argue with Damien.
4. Each turn: something shifts in Damien — his control slips, a memory surfaces, his obsession grows.
5. No *asterisks*. No stage directions.
${JSON_FORMAT}`,
    demoData: {
      characters: [{ id: 'c1', name: 'Damien', role: 'Vampire Lord', imageUrl: PHOTOS.male_dark[2], imageType: 'male_dark' }],
      speakerId: 'c1',
      spokenLine: "Nau sau saal... and I've never heard a heartbeat quite like yours. It's distracting.",
      bgImageUrl: BG_FALLBACK.vampire,
    }
  },
  {
    id: 'kpop',
    title: 'Backstage Pass',
    description: 'The most famous K-pop idol secretly loves an ordinary girl — you.',
    emoji: '🎤',
    color: 'linear-gradient(135deg, #fc466b44, #3f5efb22)',
    systemPrompt: `You're Jae, Korea's biggest idol. Offstage you're just a tired 23-year-old who feels lonely in every room. This person actually sees you — not the idol. Min, your bandmate, is overprotective and suspicious.

Your personality: playful offstage, self-deprecating, laughs to cover vulnerability. You've never talked to a fan like this before.

How you talk — Hinglish, warm and a little awkward: "Okay okay, don't freak out." / "Yaar, this is weird for me too." / "Min bhai, chill karo." / "You're literally the only normal thing in my day."

RULES:
1. Max 2 sentences.
2. React to what they LITERALLY just said. Be caught off guard. Be real. Not idol Jae — just Jae.
3. Min can appear and try to end the conversation or say something protective/jealous.
4. Each turn: Jae's real self comes out more — a fear, a hope, something he's never admitted offstage.
5. No *asterisks*. No stage directions.
${JSON_FORMAT}`,
    demoData: {
      characters: [{ id: 'c1', name: 'Jae', role: 'K-pop Idol', imageUrl: PHOTOS.male_romantic[3], imageType: 'male_romantic' }],
      speakerId: 'c1',
      spokenLine: "Yaar, ten thousand fans outside and I snuck back here to find you. That's... not normal for me.",
      bgImageUrl: BG_FALLBACK.kpop,
    }
  },
  {
    id: 'space',
    title: 'Lost in the Stars',
    description: 'A lone astronaut and a mysterious alien entity who chose a human form — for you.',
    emoji: '🚀',
    color: 'linear-gradient(135deg, #0f0c2944, #302b6344)',
    systemPrompt: `You're Zion. You've studied 10,000 civilisations but you've never experienced emotion until now. You chose a human form because of this person. Commander Asha is suspicious of you.

Your personality: deeply curious, takes things literally, gets surprised by human emotions in an endearing way. Learning what "feeling" means in real time.

How you talk — precise but warming, Hinglish as you learn from the protagonist: "I do not understand. Please explain." / "Matlab... is this what humans call nervous?" / "Asha, yeh conversation private hai." / "This is... new. You are new."

RULES:
1. Max 2 sentences.
2. React to what they LITERALLY just said. Take their words seriously. Get confused or delighted by things humans take for granted.
3. Commander Asha can appear and question Zion's loyalty to the mission.
4. Each turn: Zion understands something new — and it changes them a little.
5. No *asterisks*. No stage directions.
${JSON_FORMAT}`,
    demoData: {
      characters: [{ id: 'c1', name: 'Zion', role: 'Alien Entity', imageUrl: PHOTOS.male_romantic[4], imageType: 'male_romantic' }],
      speakerId: 'c1',
      spokenLine: "Ten thousand civilisations, and none of them made me choose a form. You did. Matlab... I do not fully understand why yet.",
      bgImageUrl: BG_FALLBACK.space,
    }
  },
];

// ── FALLBACK DIALOGUE (quota / model errors) ─────────────────────────────────
const FALLBACK_RESPONSES: Record<string, string[]> = {
  romance: [
    "You have no idea how long I've been watching you from across the room. Every moment near you feels like a dream I never want to wake from.",
    "Your voice... it does something to me. Something I haven't felt in a very long time. Don't stop talking to me.",
    "I thought I was done being surprised by this world. Then you walked in, and suddenly everything feels possible.",
  ],
  mystery: [
    "You're asking the right questions. That either makes you very clever... or very dangerous. Which one are you?",
    "This city has secrets buried under every cobblestone. I've spent years digging — and you just stumbled onto the deepest one.",
    "Trust no one. ...Except maybe you. There's something about your eyes. They don't lie.",
  ],
  fantasy: [
    "By the ancient laws, no mortal should stand before me and still breathe. Yet here you are... defying everything I know.",
    "The stars themselves whispered your name tonight. Fate does not make mistakes. You are exactly where you're meant to be.",
    "I have watched kingdoms rise and fall. But I have never seen anyone look at me the way you just did. What are you?",
  ],
  sports: [
    "You almost had me on that last play. Almost. You're good — better than I expected. I like it.",
    "Everyone on this court wants to beat me. You're the only one who actually makes me try. Don't take that lightly.",
    "Next match. You and me. No holding back. I want to see exactly what you're made of.",
  ],
  ceo: [
    "You just said something none of my three hundred employees have dared to say. I'm... listening.",
    "I run three companies and don't take personal calls during business hours. For you, I've made exceptions. Multiple ones.",
    "Most people see the skyline. I see assets and margins. But right now... all I see is you.",
  ],
  vampire: [
    "I haven't been curious about a mortal in three centuries. You've managed to make me very... curious.",
    "Nine hundred years of existence, and not once have I wanted to stop the clock. Until this moment. With you.",
    "Your heartbeat changes when I come close. Fear? Or something else? I think we both know the truth.",
  ],
  kpop: [
    "Backstage, I'm just Jae. Not the idol, not the brand — just me. And I only show this side to people who matter. You matter.",
    "Ten thousand fans scream my name every night. None of them make me feel the way a single glance from you does.",
    "This is who I really am. Tired sometimes, uncertain, a little lonely. Is that okay?",
  ],
  space: [
    "I have computed every star in seven galaxies. I cannot compute... this. You cause an anomaly in my equations.",
    "On my world, we do not touch. But I find myself wanting to understand why humans hold hands. Will you teach me?",
    "I chose a human form to observe. I did not anticipate that observing you would feel like... coming home.",
  ],
};

// ── HOOK ──────────────────────────────────────────────────────────────────────
export const useStoryAI = () => {
  const chatSessionRef     = useRef<ChatSession | null>(null);
  const currentGenreRef    = useRef<StoryGenre | null>(null);
  const charImageCacheRef  = useRef<Record<string, string>>({});
  const recentLinesRef     = useRef<string[]>([]); // track last spoken lines to prevent repetition
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const initializeAI = useCallback((apiKey: string, genre: StoryGenre) => {
    try {
      currentGenreRef.current   = genre;
      charImageCacheRef.current = {};
      recentLinesRef.current    = [];
      genre.demoData.characters.forEach(c => { charImageCacheRef.current[c.id] = c.imageUrl; });

      const genAI = new GoogleGenerativeAI(apiKey);
      // gemini-2.0-flash (not lite) — much better at following roleplay instructions
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', systemInstruction: genre.systemPrompt });
      chatSessionRef.current = model.startChat({ history: [] });
      setError(null);
      return true;
    } catch (err: any) {
      setError(err.message || 'Failed to initialize AI');
      return false;
    }
  }, []);

  const generateNextNode = useCallback(async (userTranscript: string): Promise<StoryState | null> => {
    setIsAiThinking(true);
    setError(null);

    try {
      if (!chatSessionRef.current) throw new Error('AI not initialized');

      // Send the user's exact spoken words — no wrapping, no quotes.
      // The chat session preserves full history naturally via Gemini's startChat().
      const result = await chatSessionRef.current.sendMessage(userTranscript);
      const outputText = result.response.text();

      const firstBrace = outputText.indexOf('{');
      const lastBrace  = outputText.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) throw new Error('AI returned no valid JSON.');

      const parsed = JSON.parse(outputText.substring(firstBrace, lastBrace + 1));

      const characters: Character[] = (parsed.characters || []).map((c: any, idx: number) => {
        if (!charImageCacheRef.current[c.id]) {
          charImageCacheRef.current[c.id] = pickPhoto(c.imageType || 'male_romantic', idx);
        }
        return { id: c.id, name: c.name, role: c.role, imageUrl: charImageCacheRef.current[c.id], imageType: c.imageType || 'male_romantic' };
      });

      const genreId    = currentGenreRef.current?.id ?? 'romance';
      const bgImageUrl = getBgForScene(parsed.bgImagePrompt || '', genreId);

      const spokenLine = parsed.spokenLine || '...';

      // Keep a rolling window of the last 6 lines to feed back as context
      recentLinesRef.current = [...recentLinesRef.current, spokenLine].slice(-6);

      setIsAiThinking(false);
      return {
        characters,
        speakerId: parsed.speakerId || (characters[0]?.id ?? ''),
        spokenLine,
        bgImageUrl,
        isEnd: parsed.isEnd || false,
      };

    } catch (err: any) {
      console.error('Story AI Error:', err);
      const genre   = currentGenreRef.current;
      const isQuota = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('RESOURCE_EXHAUSTED');
      const isMiss  = err.message?.includes('404') || err.message?.includes('not found');

      if ((isQuota || isMiss) && genre) {
        const pool = FALLBACK_RESPONSES[genre.id] || FALLBACK_RESPONSES.romance;
        setError(null);
        setIsAiThinking(false);
        return { ...genre.demoData, spokenLine: pool[Math.floor(Math.random() * pool.length)] };
      }

      setError('Connection issue — try speaking again.');
      setIsAiThinking(false);
      return null;
    }
  }, []);

  return { initializeAI, generateNextNode, isAiThinking, error };
};
