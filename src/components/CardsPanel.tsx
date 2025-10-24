'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { TagIcon } from '@heroicons/react/24/outline';

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
  | { cards: StudyCard[]; nextCursor?: number }
  | { cards: StudyCard[]; cursorCreatedAt?: number; cursorId?: string };

const cardColors = [
  'from-sky-400 to-cyan-400',
  'from-teal-400 to-emerald-400',
  'from-indigo-400 to-violet-400',
  'from-rose-400 to-pink-400',
  'from-amber-400 to-orange-400',
];

function CardTile({ card, index }: { card: StudyCard; index: number }) {
  const colorClass = cardColors[index % cardColors.length];

  return (
    <div
      className="ms-card relative rounded-xl bg-muted/70 p-4 border [border-color:rgb(var(--glass-border)/0.35)] overflow-hidden hover:bg-muted/80 transition-colors"
      data-key={card.id}
    >
      <div className={`absolute top-0 left-0 h-1 w-full bg-gradient-to-r ${colorClass}`} />
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
        {new Date(card.createdAt).toLocaleString()}
      </div>

      <h3 className="font-semibold text-foreground mt-0 mb-2 line-clamp-2">
        {card.topic}
      </h3>

      {!!card.bullets?.length && (
        <ul className="text-sm text-foreground/90 list-disc ml-4 space-y-1 mt-3">
          {card.bullets.slice(0, 3).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}

      {/* --- NEW: Display Key Terms as Badges --- */}
      {!!card.keyTerms?.length && (
        <div className="mt-4 pt-3 border-t [border-color:rgb(var(--glass-border)/0.2)]">
          <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <TagIcon className="w-3.5 h-3.5" />
            Key Terms
          </h4>
          <div className="flex flex-wrap gap-2">
            {card.keyTerms.slice(0, 4).map((term, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full"
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CardsPanel({ sessionId }: { sessionId: string | null }) {
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [loading, setLoading] = useState(false);
  const cursorRef = useRef<{ legacy?: number; createdAt?: number; id?: string } | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCards([]);
    cursorRef.current = null;
    seenIdsRef.current = new Set();
  }, [sessionId]);

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

  const refresh = async () => {
    if (!sessionId || loading) return;
    setLoading(true);
    try {
      cursorRef.current = null;
      setCards([]);
      let pages = 0;
      do {
        const { hasMore } = await fetchPage(80);
        pages++;
        if (!hasMore || pages >= 4) break;
      } while (true);
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
        y: -80,
        x: (i) => (i % 2 === 0 ? 24 : -24),
        rotation: (i) => (i % 2 === 0 ? 10 : -10),
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
        stagger: { each: 0.06, from: 'start' },
      });
    }, containerRef);

    return () => ctx.revert();
  }, [cards, loading]);

  const sortedCards = useMemo(() => {
    return [...cards].sort((a, b) => b.createdAt - a.createdAt);
  }, [cards]);

  return (
    <div className="flex flex-col h-full w-full">
      <header className="p-4 flex-shrink-0">
        <h3 className="text-base font-serif font-semibold text-foreground m-0">Study Cards</h3>
      </header>

      <div ref={containerRef} className="flex-grow overflow-y-auto px-4 pb-4 space-y-3">
        {loading && (
          <div className="text-center text-sm text-muted-foreground pt-4">Loading cards…</div>
        )}

        {!loading && sortedCards.length === 0 && (
          <div className="text-center text-sm text-muted-foreground bg-muted/60 border [border-color:rgb(var(--glass-border)/0.35)] rounded-lg p-6">
            Your generated study cards will appear here automatically.
          </div>
        )}

        {!loading &&
          sortedCards.map((card, index) => <CardTile key={card.id} card={card} index={index} />)}

        {!loading && cursorRef.current && (
          <div className="pt-2">
            <button
              onClick={() => fetchPage(80)}
              className="mx-auto block text-xs px-3 py-1.5 rounded border [border-color:rgb(var(--glass-border)/0.35)] bg-muted/70 hover:bg-muted/80 text-foreground transition-colors"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}