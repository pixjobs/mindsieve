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

type CardsApiResponse =
  | { cards: StudyCard[]; nextCursor?: number } // legacy
  | { cards: StudyCard[]; cursorCreatedAt?: number; cursorId?: string }; // new

// Accents
const cardColors = [
  'from-blue-400 to-cyan-400',
  'from-green-400 to-teal-400',
  'from-purple-400 to-indigo-400',
  'from-pink-400 to-rose-400',
  'from-orange-400 to-amber-400',
];

function CardTile({ card, index }: { card: StudyCard; index: number }) {
  const colorClass = cardColors[index % cardColors.length];
  return (
    <div className="ms-card relative rounded-xl bg-white/60 p-4 border border-black/10 overflow-hidden" data-key={card.id}>
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
  const [loading, setLoading] = useState(false);

  // Cursors (support both styles)
  const cursorRef = useRef<{ legacy?: number; createdAt?: number; id?: string } | null>(null);

  // For GSAP: remember which IDs we’ve already rendered
  const seenIdsRef = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset when session changes
  useEffect(() => {
    setCards([]);
    cursorRef.current = null;
    seenIdsRef.current = new Set();
  }, [sessionId]);

  // Fetch a single page (with whichever cursor we currently have)
  const fetchPage = async (limit = 60) => {
    if (!sessionId) return { got: 0, hasMore: false };
    const url = new URL('/api/cards', location.origin);
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.set('limit', String(limit));

    const cur = cursorRef.current;
    if (cur?.legacy != null) url.searchParams.set('cursor', String(cur.legacy));
    if (cur?.createdAt != null && cur?.id) {
      url.searchParams.set('cursorCreatedAt', String(cur.createdAt));
      url.searchParams.set('cursorId', cur.id);
    }

    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) return { got: 0, hasMore: false };

    const json: CardsApiResponse = await res.json();

    // De-dupe by id and append
    const byId = new Map<string, StudyCard>();
    for (const c of cards) byId.set(c.id, c);
    let newCount = 0;
    for (const c of json.cards) {
      if (!byId.has(c.id)) {
        byId.set(c.id, c);
        newCount++;
      }
    }
    const merged = Array.from(byId.values());
    setCards(merged);

    // Advance cursor (support both response styles)
    let hasMore = false;
    if ('nextCursor' in json && json.nextCursor != null) {
      cursorRef.current = { legacy: json.nextCursor };
      hasMore = true;
    } else if ('cursorCreatedAt' in json && json.cursorCreatedAt && json.cursorId) {
      cursorRef.current = { createdAt: json.cursorCreatedAt, id: json.cursorId };
      hasMore = true;
    } else {
      cursorRef.current = null;
      hasMore = false;
    }

    return { got: newCount, hasMore };
  };

  // Full refresh: page until we reach a cap or no more data
  const refresh = async () => {
    if (!sessionId || loading) return;
    setLoading(true);
    try {
      // Start from scratch for a hard refresh
      cursorRef.current = null;
      setCards([]);
      let pages = 0;
      let total = 0;
      do {
        const { got, hasMore } = await fetchPage(80);
        total += got;
        pages++;
        if (!hasMore || pages >= 4) break; // up to ~320 cards on first load
      } while (true);
    } finally {
      setLoading(false);
    }
  };

  // Initial load + listen for “cards:updated”
  useEffect(() => {
    if (!sessionId) return;
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener('cards:updated', onUpdate);
    return () => window.removeEventListener('cards:updated', onUpdate);
  }, [sessionId]);

  // GSAP animation: only animate truly new cards by ID
  useLayoutEffect(() => {
    if (!containerRef.current || loading) return;

    const newEls: HTMLElement[] = [];
    const nodes = containerRef.current.querySelectorAll<HTMLElement>('.ms-card');

    nodes.forEach((el) => {
      const id = el.getAttribute('data-key') || '';
      if (id && !seenIdsRef.current.has(id)) {
        newEls.push(el);
        seenIdsRef.current.add(id);
      }
    });

    if (newEls.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.from(newEls, {
        y: -100,
        x: (i) => (i % 2 === 0 ? 30 : -30),
        rotation: (i) => (i % 2 === 0 ? 15 : -15),
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: { each: 0.08, from: 'start' },
      });
    }, containerRef);

    return () => ctx.revert();
  }, [cards, loading]);

  // Non-mutating sort (newest first)
  const sortedCards = useMemo(() => {
    return [...cards].sort((a, b) => b.createdAt - a.createdAt);
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

        {!loading &&
          sortedCards.map((card, index) => <CardTile key={card.id} card={card} index={index} />)}

        {/* Optional: load more older cards on click */}
        {!loading && cursorRef.current && (
          <div className="pt-2">
            <button
              onClick={() => fetchPage(80)}
              className="mx-auto block text-xs px-3 py-1.5 rounded border border-black/10 bg-white/50 hover:bg-white/70"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
