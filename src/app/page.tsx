'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { PaperAirplaneIcon, ClipboardIcon, CheckIcon, ArrowPathIcon, SparklesIcon } from '@heroicons/react/24/solid';
import { gsap } from 'gsap';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SplitType from 'split-type';
import CardsPanel from '@/components/CardsPanel';

// ----------------- Types -----------------
interface Source {
  id: number;
  title: string;
  link: string;
  published: string;
  snippet: string;
  arxiv_id?: string;
}
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
}

// ----------------- "Fancy" UI Components -----------------

// FINAL VERSION: The dynamic, animated logo component
const AnimatedLogo = () => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const emojis = ['🧠', '💡', '❓', '📚', '⚡️'];

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const emojiElements = Array.from(containerRef.current.children);
    gsap.set(emojiElements, { opacity: 0, scale: 0.8, y: 10 }); // Initial state

    const tl = gsap.timeline({ repeat: -1 });

    emojiElements.forEach((emoji) => {
      tl.to(emoji, {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 0.4,
        ease: 'power3.inOut',
      }).to(
        emoji,
        {
          opacity: 0,
          scale: 0.8,
          y: -10,
          duration: 0.4,
          ease: 'power3.inOut',
        },
        '+=1.5' // Hold each emoji for 1.5 seconds
      );
    });
  }, []);

  return (
    <span ref={containerRef} className="relative inline-block w-10 h-10 mx-2 text-3xl">
      {emojis.map((emoji, i) => (
        <span
          key={i}
          // PIXEL-PERFECT FIX: Added text-gray-800 to make the emoji visible
          className="absolute inset-0 flex items-center justify-center text-gray-800 opacity-0 scale-80 transform-gpu"
        >
          {emoji}
        </span>
      ))}
    </span>
  );
};

const WelcomeAnimation = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const puzzlePieces = "Mindsieve queries Google Gemini for generative answers and simultaneously performs hybrid search on an Elasticsearch vector database of arXiv papers. This provides grounded, accurate, and up-to-date responses for any Computer Science topic.".split(' ');

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const title = new SplitType('.split-title', { types: 'chars' });
      gsap.set(title.chars, { opacity: 0, y: 20 });
      gsap.set('.welcome-fade-in', { opacity: 0, y: 15 });
      const tl = gsap.timeline();
      tl.fromTo('.puzzle-piece',
        { opacity: 0, scale: 0.8, x: () => gsap.utils.random(-200, 200, 10), y: () => gsap.utils.random(-150, 150, 10), rotation: () => gsap.utils.random(-90, 90) },
        { opacity: 1, scale: 1, x: 0, y: 0, rotation: 0, duration: 1.2, ease: 'power3.out', stagger: { each: 0.03, from: 'random' } }
      )
      .to(title.chars, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: { each: 0.05, from: 'start' } }, "-=0.5")
      .to('.welcome-fade-in', { opacity: 1, y: 0, duration: 0.5, stagger: 0.15 }, "-=0.5");
    }, containerRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="text-center text-[--muted-fg] py-8 px-4 flex flex-col items-center justify-center h-full">
      <SparklesIcon className="welcome-fade-in w-16 h-16 text-transparent bg-clip-text bg-gradient-to-b from-gray-400 to-gray-700 mb-4" />
      <h2 className="split-title text-2xl font-serif font-bold text-[--foreground] mb-4">Welcome to Mindsieve</h2>
      <p className="max-w-xl mb-6 relative h-36">
        {puzzlePieces.map((word, i) => (
          <span key={i} className="puzzle-piece inline-block mr-1.5 opacity-0">{word}</span>
        ))}
      </p>
      <div className="welcome-fade-in text-sm text-[--muted-fg]">
        <p className="font-semibold mb-2">Try asking:</p>
        <ul className="space-y-1 list-inside">
          <li>"Explain the transformer architecture"</li>
          <li>"What are the key optimizations for LLM inference?"</li>
        </ul>
      </div>
    </div>
  );
};

const StreamingIndicator = () => {
  const orbRef = useRef(null);
  useLayoutEffect(() => {
    const tl = gsap.timeline({ repeat: -1, yoyo: true });
    tl.to(orbRef.current, { scale: 1.3, opacity: 0.5, duration: 0.8, ease: 'power1.inOut' });
    return () => tl.kill();
  }, []);
  return (
    <div className="flex items-center gap-2">
      <div ref={orbRef} className="w-2 h-2 rounded-full bg-[--color-primary]" />
      <span className="text-sm text-[--muted-fg]">Generating...</span>
    </div>
  );
};

const SubmitButton = ({ pending }: { pending: boolean }) => (
  <button
    type="submit"
    disabled={pending}
    className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-[--color-primary] text-white disabled:bg-gray-400 disabled:cursor-not-allowed hover:scale-110 active:scale-100 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[--color-primary]"
    aria-label="Send message"
  >
    {pending ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <PaperAirplaneIcon className="w-5 h-5" />}
  </button>
);

const SourcesDisplay = ({ sources }: { sources: Source[] }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-5 border-t border-[--glass-border]/30 pt-4">
      <button onClick={() => setIsExpanded(!isExpanded)} className="text-sm font-semibold text-[--muted-fg] mb-3 flex items-center gap-1.5">
        Sources {isExpanded ? '▼' : '▶'}
      </button>
      {isExpanded && (
        <div className="space-y-4">
          {sources.map((source) => (
            <div key={source.id} className="text-sm animate-fade-in">
              <a href={source.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-[--foreground] hover:text-[--color-primary] transition-colors">
                <span className="text-[--color-primary] mr-2">[{source.id}]</span>
                {source.title}
              </a>
              <p className="text-[--muted-fg] italic mt-1 text-xs pl-6" dangerouslySetInnerHTML={{ __html: source.snippet }} />
              {source.arxiv_id && (
                <a href={`https://arxiv.org/abs/${source.arxiv_id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[--color-primary] hover:underline mt-1 inline-block pl-6 font-medium">
                  View on arXiv
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const [hasCopied, setHasCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setHasCopied(true);
    toast.success('Copied to clipboard!');
    setTimeout(() => setHasCopied(false), 2000);
  };

  const renderContent = (content: string) => {
    let displayContent = content;
    if (content.includes('|||META|||')) {
      displayContent = content.substring(content.indexOf('|||META|||') + 9).trim();
    }
    const sanitizedContent = displayContent.replace(/\[(\d+)\]/g, '**[$1]**');
    return (
      <div className="prose prose-sm md:prose-base max-w-none text-[--foreground] prose-p:leading-relaxed prose-headings:font-serif prose-headings:mb-2 prose-headings:mt-4 prose-a:text-[--color-primary] prose-strong:text-[--foreground]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{sanitizedContent}</ReactMarkdown>
      </div>
    );
  };

  return (
    <div className={`animate-fade-in ${isUser ? 'flex justify-end' : ''}`}>
      <div className={`group relative p-4 rounded-2xl max-w-2xl ${isUser ? 'bg-gray-800 text-gray-50 shadow-lg' : 'glass'}`}>
        {message.isStreaming && !message.content && <StreamingIndicator />}
        {renderContent(message.content)}
        {!isUser && !message.isStreaming && message.content && (
          <button onClick={handleCopy} className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/5 text-[--muted-fg] opacity-0 group-hover:opacity-100 transition-opacity" title="Copy answer">
            {hasCopied ? <CheckIcon className="w-4 h-4 text-green-500" /> : <ClipboardIcon className="w-4 h-4" />}
          </button>
        )}
        {!isUser && <SourcesDisplay sources={message.sources || []} />}
      </div>
    </div>
  );
}

// ----------------- Session bootstrap -----------------
function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  useEffect(() => {
    const boot = async () => {
      const stored = localStorage.getItem('ms_session');
      if (stored) {
        setSessionId(JSON.parse(stored).sessionId);
        return;
      }
      try {
        const res = await fetch('/api/sessions', { method: 'POST' });
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        localStorage.setItem('ms_session', JSON.stringify(json));
        setSessionId(json.sessionId);
      } catch (err) {
        console.error('Session init error:', err);
      }
    };
    boot();
  }, []);
  return sessionId;
}

// ----------------- Main Page -----------------
export default function ChatPage() {
  const sessionId = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTurnId, setCurrentTurnId] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputRef.current?.value.trim() || !sessionId || isSubmitting) return;
    const query = inputRef.current.value.trim();
    formRef.current?.reset();
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: query };
    const assistantId = crypto.randomUUID();
    setCurrentTurnId(assistantId);
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', sources: [], isStreaming: true };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsSubmitting(true);
    try {
      await fetch('/api/turns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, userQuery: query, assistantId }) });
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, sessionId, turnId: assistantId }) });
      if (!response.ok || !response.body) throw new Error(await response.text() || 'Failed to get response');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sources: Source[] = [];
      let sourcesReceived = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (!sourcesReceived && buffer.includes('|||SOURCES|||')) {
          const parts = buffer.split('|||SOURCES|||');
          try { sources = JSON.parse(parts[0]); } catch { /* ignore */ }
          buffer = parts.slice(1).join('|||SOURCES|||');
          sourcesReceived = true;
        }
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: buffer, sources, isStreaming: true } : m)));
      }
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)));
      if (buffer.trim()) {
        try {
          const res = await fetch('/api/cards/enqueue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              turnId: assistantId,
              answer: buffer,
              sources: (sources || []).map((s) => ({ id: s.id, title: s.title, arxiv_id: s.arxiv_id })),
              topic: (buffer.match(/^(.{0,72})/)?.[0] || 'Study Topic').trim(),
              fromQuery: query,
            }),
          });
          if (!res.ok) throw new Error((await res.json())?.error || 'Failed to save card');
          window.dispatchEvent(new CustomEvent('cards:updated'));
        } catch (e: any) {
          console.warn("Auto-card generation failed:", e.message);
        }
      }
    } catch (error: any) {
      console.error(error);
      toast.error(`Error: ${error.message}`);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'rgb(var(--glass) / var(--glass-alpha))',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgb(var(--glass-border) / 0.3)',
            color: 'var(--foreground)',
            boxShadow: 'var(--elev-1)',
          },
        }}
      />
      <div className="flex flex-col h-screen">
        <header className="text-center p-4 flex-shrink-0">
          <h1 className="text-3xl md:text-4xl font-bold font-serif text-transparent bg-clip-text bg-gradient-to-b from-gray-400 to-gray-800 flex items-center justify-center">
            <AnimatedLogo />
            Mindsieve AI Tutor
          </h1>
        </header>
        <div className="flex flex-col md:flex-row gap-4 flex-1 overflow-hidden w-full max-w-7xl mx-auto">
          <main className="flex-grow flex flex-col overflow-hidden rounded-2xl glass glass-outline">
            <div className="flex-grow overflow-y-auto space-y-6 p-4 min-h-0">
              {messages.length === 0 ? (
                <WelcomeAnimation />
              ) : (
                messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
              )}
              <div ref={messagesEndRef} className="h-1" />
            </div>
            <footer className="p-4 border-t border-[--glass-border]/20 flex-shrink-0">
              <form ref={formRef} onSubmit={handleSubmit} className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  name="query"
                  required
                  placeholder="Ask about any computing topic, e.g., how virtual memory works"
                  className="w-full h-14 px-6 pr-16 bg-white/50 border border-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-[--color-primary] transition-all shadow-inner"
                  disabled={!sessionId || isSubmitting}
                />
                <SubmitButton pending={isSubmitting} />
              </form>
            </footer>
          </main>
          <aside className="w-full md:w-96 h-96 md:h-auto flex-shrink-0 rounded-2xl glass glass-outline overflow-hidden">
            <CardsPanel sessionId={sessionId} />
          </aside>
        </div>
      </div>
    </>
  );
}