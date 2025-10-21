    // src/components/CardsPanel.tsx
'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArchiveBoxXMarkIcon } from '@heroicons/react/24/solid';
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

function CardTile({ card }: { card: StudyCard }) {
  return (
    <div
      className="ms-card relative rounded-xl bg-gray-800/80 border border-gray-700/60 p-4 shadow-lg hover:shadow-xl transition-shadow"
      data-key={card.id}
    >
      <div className="text-xs text-gray-400 mb-1">{new Date(card.createdAt).toLocaleString()}</div>
      <h3 className="font-semibold text-white mb-2 line-clamp-2">{card.topic}</h3>
      {!!card.bullets?.length && (
        <ul className="text-sm text-gray-300 list-disc ml-4 space-y-1">
          {card.bullets.slice(0, 3).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {!!card.links?.length && (
        <div className="mt-2 flex flex-wrap gap-2">
          {card.links.slice(0, 3).map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-300 underline decoration-dotted hover:text-blue-200"
            >
              Link {i + 1}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function CardsColumn({
  title,
  cards,
  onClear,
  emptyText,
}: {
  title: string;
  cards: StudyCard[];
  onClear?: () => void;
  emptyText?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scope animations to this column only
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      const tiles = containerRef.current!.querySelectorAll<HTMLElement>('.ms-card');
      gsap.fromTo(
        tiles,
        { y: 30, opacity: 0, rotate: (i) => (i % 2 === 0 ? 1.4 : -1.4), scale: 0.98 },
        { y: 0, opacity: 1, rotate: 0, scale: 1, duration: 0.45, ease: 'power2.out', stagger: { each: 0.06, from: 'end' } }
      );
    }, containerRef);
    return () => ctx.revert();
  }, [cards]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {onClear && (
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-md bg-red-600/90 px-2 py-1 text-xs text-white hover:bg-red-700"
            title="Clear"
          >
            <ArchiveBoxXMarkIcon className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>
      <div ref={containerRef} className="grid grid-cols-1 gap-3">
        {cards.map((c) => (
          <CardTile key={c.id} card={c} />
        ))}
        {cards.length === 0 && (
          <div className="text-sm text-gray-400 border border-dashed border-gray-600 rounded-lg p-4">
            {emptyText || 'No cards yet.'}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CardsPanel({
  sessionId,
  currentTurnId,
}: {
  sessionId: string | null;
  currentTurnId: string | null;
}) {
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [cursor, setCursor] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [collapsePrevious, setCollapsePrevious] = useState(false);

  const refresh = async (reset = true) => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const url = new URL('/api/cards', location.origin);
      url.searchParams.set('sessionId', sessionId);
      url.searchParams.set('limit', '60');
      if (!reset && cursor) url.searchParams.set('cursor', String(cursor));
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setCards((prev) => (reset ? json.cards : [...prev, ...json.cards]));
        setCursor(json.nextCursor);
      }
    } finally {
      setLoading(false);
    }
  };

  // Initial + live refresh on session changes and custom event
  useEffect(() => {
    if (!sessionId) return;
    setCursor(undefined);
    refresh(true);
    const onUpdate = () => refresh(true);
    window.addEventListener('cards:updated', onUpdate);
    return () => window.removeEventListener('cards:updated', onUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Local non-destructive “clear current turn” (just hides until refresh)
  const [hiddenTurnIds, setHiddenTurnIds] = useState<Set<string>>(new Set());
  const clearCurrentTurn = () => {
    if (!currentTurnId) return;
    setHiddenTurnIds((s) => new Set(s).add(currentTurnId));
  };

  const { currentCards, previousGroups, pinned } = useMemo(() => {
    const byTurn = new Map<string, StudyCard[]>();
    for (const c of cards) {
      const arr = byTurn.get(c.turnId) || [];
      arr.push(c);
      byTurn.set(c.turnId, arr);
    }

    const current = currentTurnId && !hiddenTurnIds.has(currentTurnId) ? byTurn.get(currentTurnId) || [] : [];
    const prev: Array<{ turnId: string; items: StudyCard[] }> = [];
    for (const [t, arr] of byTurn.entries()) {
      if (t === currentTurnId) continue;
      if (hiddenTurnIds.has(t)) continue;
      prev.push({ turnId: t, items: arr });
    }
    prev.sort((a, b) => (b.items[0]?.createdAt || 0) - (a.items[0]?.createdAt || 0));

    const pinned = cards.filter((c) => c.pinned);
    return { currentCards: current, previousGroups: prev, pinned };
  }, [cards, currentTurnId, hiddenTurnIds]);

  return (
    <aside className="w-full xl:w-[360px] shrink-0 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400">Study Cards</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refresh(true)}
            className="text-xs text-blue-300 hover:underline disabled:opacity-50"
            disabled={loading || !sessionId}
          >
            Refresh
          </button>
          <button
            onClick={() => setCollapsePrevious((v) => !v)}
            className="text-xs text-gray-300 hover:underline"
            disabled={!sessionId}
          >
            {collapsePrevious ? 'Expand previous' : 'Collapse previous'}
          </button>
        </div>
      </div>

      <CardsColumn
        title="Current Turn"
        cards={currentCards}
        onClear={currentTurnId ? clearCurrentTurn : undefined}
        emptyText="Cards from your latest answer will appear here."
      />

      {/* Previous Turns */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold">Previous Turns</h2>
        <div className="space-y-3">
          {previousGroups.length === 0 && <div className="text-sm text-gray-400">No previous turns yet.</div>}
          {!collapsePrevious &&
            previousGroups.map((group) => (
              <details key={group.turnId} className="rounded-lg bg-gray-800/60 border border-gray-700/60">
                <summary className="cursor-pointer px-3 py-2 text-sm text-gray-200">
                  Turn {group.turnId.slice(0, 6)} • {group.items.length} card{group.items.length > 1 ? 's' : ''}
                </summary>
                <div className="p-3 space-y-3">
                  {group.items.map((c) => (
                    <CardTile key={c.id} card={c} />
                  ))}
                </div>
              </details>
            ))}
        </div>
      </div>

      <CardsColumn title="Pinned" cards={pinned} emptyText="Pin cards to keep them handy." />

      {cursor && !collapsePrevious && (
        <button
          onClick={() => refresh(false)}
          className="mt-2 text-xs text-blue-300 hover:underline disabled:opacity-50"
          disabled={loading}
        >
          Load more
        </button>
      )}
    </aside>
  );
}
