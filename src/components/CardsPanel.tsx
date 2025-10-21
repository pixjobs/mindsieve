'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';

export type StudyCard = {
  id: string;
  sessionId: string;
  turnId: string;
  topic: string;
  summary: string;
  bullets: string[];
  keyTerms: string[];
  links?: string[];
  sources: Array<{ id: number; title: string; arxiv_id?: string }>;
  pinned?: boolean;
  createdAt: number;
  fromQuery?: string;
};

// Vibrant color palette for the card accents
const cardColors = [
  'from-blue-400 to-cyan-400',
  'from-green-400 to-teal-400',
  'from-purple-400 to-indigo-400',
  'from-pink-400 to-rose-400',
  'from-orange-400 to-amber-400',
];

function CardTile({ card, index }: { card: StudyCard; index: number }) {
  const colorClass = cardColors[index % cardColors.length]; // Cycle through colors

  return (
    <div
      className="ms-card relative rounded-xl bg-white/60 p-4 border border-black/10 overflow-hidden"
      data-key={card.id}
    >
      {/* Colorful Gradient Accent Border */}
      <div className={`absolute top-0 left-0 h-1 w-full bg-gradient-to-r ${colorClass}`} />

      <div className="text-xs text-[--muted-fg] mb-1.5">{new Date(card.createdAt).toLocaleString()}</div>
      
      <h3 className="font-semibold text-[--foreground] mt-0 mb-2 line-clamp-2">{card.topic}</h3>
      
      {!!card.bullets?.length && (
        <ul className="text-sm text-[--foreground] list-disc ml-4 space-y-1">
          {card.bullets.slice(0, 3).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CardsPanel({ sessionId }: { sessionId: string | null }) {
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [loading, setLoading] = useState(true);
  
  // FIX: Replaced useState with useRef to prevent re-render loops.
  // This ref will hold the previous number of cards to compare against.
  const prevCardCountRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const url = new URL('/api/cards', location.origin);
      url.searchParams.set('sessionId', sessionId);
      url.searchParams.set('limit', '100');
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setCards(json.cards);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener('cards:updated', onUpdate);
    return () => window.removeEventListener('cards:updated', onUpdate);
  }, [sessionId]);

  // "Magical Stack" GSAP Animation
  useLayoutEffect(() => {
    if (!containerRef.current || loading) return;

    // Read the previous count from the ref
    const newCardCount = cards.length - prevCardCountRef.current;
    if (newCardCount <= 0) {
      // If no new cards, just ensure the ref is up to date for the next render
      prevCardCountRef.current = cards.length;
      return;
    }

    const newCards = Array.from(containerRef.current.querySelectorAll<HTMLElement>('.ms-card')).slice(0, newCardCount);

    const ctx = gsap.context(() => {
      gsap.from(newCards, {
        y: -100,
        x: (i) => (i % 2 === 0 ? 30 : -30),
        rotation: (i) => (i % 2 === 0 ? 15 : -15),
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: {
          each: 0.1,
          from: 'start',
        },
      });
    }, containerRef);

    // Update the ref with the new count *after* the animation is set up.
    // This does NOT trigger a re-render.
    prevCardCountRef.current = cards.length;

    return () => ctx.revert();
  }, [cards, loading]); // The dependency array is now stable.

  const sortedCards = useMemo(() => {
    return cards.sort((a, b) => b.createdAt - a.createdAt);
  }, [cards]);

  return (
    <div className="flex flex-col h-full w-full">
      <header className="p-4 flex-shrink-0">
        <h3 className="text-lg font-serif font-bold text-[--foreground]">Study Cards</h3>
      </header>
      <div ref={containerRef} className="flex-grow overflow-y-auto px-4 pb-4 space-y-3">
        {loading && <div className="text-center text-sm text-[--muted-fg] pt-4">Loading Cards...</div>}
        {!loading && sortedCards.length === 0 && (
          <div className="text-center text-sm text-[--muted-fg] bg-black/5 border border-black/5 rounded-lg p-6">
            Your generated study cards will appear here automatically.
          </div>
        )}
        {!loading && sortedCards.map((card, index) => (
          <CardTile key={card.id} card={card} index={index} />
        ))}
      </div>
    </div>
  );
}