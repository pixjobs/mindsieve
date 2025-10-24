'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type ReactElement,
} from 'react';
import { Toaster, toast } from 'react-hot-toast';
import {
  PaperAirplaneIcon,
  ClipboardIcon,
  CheckIcon,
  ArrowPathIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { gsap } from 'gsap';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CardsPanel from '@/components/CardsPanel';
import StarfieldGrid from '@/components/StarfieldGrid';

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

// ----------------- Utils -----------------
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// ======================================================================
// Particle Logo (header)
// ======================================================================
const ParticleLogo = memo(function ParticleLogo(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<any[]>([]);
  const animationState = useRef<'intro' | 'idle' | 'streaming'>('intro');
  const visualState = useRef({ particleAlpha: 1, textAlpha: 0, haloSize: 0 });
  const rafRef = useRef<number>(0);

  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const isSmall = width < 480;
    const particleCount = isSmall ? 800 : 1600;
    const colors = ['#cbd5e1', '#94a3b8', '#64748b', '#475569'];

    const fontSize = Math.max(32, Math.min(height * 0.7, 72));
    const text = 'Mindsieve';
    const font = `bold ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    let textWidth = 0;
    let textX = 0;
    let textY = 0;

    class Particle {
      x: number; y: number; originX: number; originY: number;
      vx: number; vy: number; size: number; color: string;
      friction: number; ease: number;

      constructor(x: number, y: number) {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.originX = x; this.originY = y;
        this.vx = 0; this.vy = 0;
        this.size = Math.random() * 1.4 + 0.4;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.friction = 0.92;
        this.ease = 0.06 + Math.random() * 0.04;
      }
      update() {
        this.vx += (this.originX - this.x) * this.ease;
        this.vy += (this.originY - this.y) * this.ease;
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.x += this.vx;
        this.y += this.vy;

        if (animationState.current === 'idle') {
          const idleForceX = Math.sin(Date.now() * 0.0008 + this.originY * 0.05) * 0.05;
          const idleForceY = Math.cos(Date.now() * 0.0008 + this.originX * 0.05) * 0.05;
          this.x += idleForceX;
          this.y += idleForceY;
        } else if (animationState.current === 'streaming') {
          this.x += (Math.random() - 0.5) * 0.7;
          this.y += (Math.random() - 0.5) * 0.7;
        }
      }
      draw(context: CanvasRenderingContext2D) {
        context.fillStyle = this.color;
        context.beginPath();
        context.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        context.fill();
      }
    }

    const init = () => {
      const tempCtx = document.createElement('canvas').getContext('2d');
      if (!tempCtx) return;
      tempCtx.canvas.width = width;
      tempCtx.canvas.height = height;
      
      tempCtx.font = font;
      textWidth = tempCtx.measureText(text).width;
      textX = (width - textWidth) / 2;
      textY = (height + fontSize * 0.35) / 2;

      tempCtx.fillStyle = 'black';
      tempCtx.fillText(text, textX, textY);
      
      const imageData = tempCtx.getImageData(0, 0, width, height).data;
      const pts: { x: number; y: number }[] = [];
      const step = isSmall ? 3 : 2;
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          if (imageData[(y * width + x) * 4 + 3] > 128) pts.push({ x, y });
        }
      }
      particles.current = Array.from({ length: particleCount }, (_, i) => {
        const p = pts[i % pts.length];
        return new Particle(p.x, p.y);
      });
    };

    const loop = () => {
      ctx.clearRect(0, 0, width, height);

      if (visualState.current.textAlpha > 0) {
        ctx.globalAlpha = visualState.current.textAlpha;
        ctx.font = font;
        
        ctx.shadowColor = 'rgba(165, 180, 252, 0.7)';
        if (animationState.current === 'idle' || animationState.current === 'streaming') {
          ctx.shadowBlur = visualState.current.haloSize + Math.sin(Date.now() * 0.0025) * 3;
        } else {
          ctx.shadowBlur = visualState.current.haloSize;
        }
        
        ctx.fillStyle = '#e0e7ff';
        ctx.fillText(text, textX, textY);

        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      }

      if (visualState.current.particleAlpha > 0) {
        ctx.globalAlpha = visualState.current.particleAlpha;
        for (const p of particles.current) {
          p.update();
          p.draw(ctx);
        }
      }
      
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(loop);
    };

    init();
    rafRef.current = requestAnimationFrame(loop);

    const handleStreamStart = () => { animationState.current = 'streaming'; };
    const handleStreamEnd = () => { animationState.current = 'idle'; };
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(rafRef.current);
      else rafRef.current = requestAnimationFrame(loop);
    };

    window.addEventListener('llm-stream-start', handleStreamStart);
    window.addEventListener('llm-stream-end', handleStreamEnd);
    document.addEventListener('visibilitychange', onVisibility);

    // Initial animation sequence
    gsap.fromTo(
      particles.current,
      {
        x: () => (Math.random() < 0.5 ? -50 : canvas.clientWidth + 50),
        y: () => (Math.random() < 0.5 ? -50 : canvas.clientHeight + 50),
      },
      {
        x: (i, p) => p.originX,
        y: (i, p) => p.originY,
        ease: 'power3.out',
        duration: 2.0,
        stagger: { each: 0.003, from: 'random' },
      }
    );

    gsap.timeline({ delay: 1.6 })
      .to(visualState.current, {
        particleAlpha: 0,
        duration: 0.8,
        ease: 'power2.inOut',
      })
      .to(visualState.current, {
        textAlpha: 1,
        haloSize: 20,
        duration: 1.2,
        ease: 'power3.out',
        onComplete: () => {
          animationState.current = 'idle';
        },
      }, '-=0.6');

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('llm-stream-start', handleStreamStart);
      window.removeEventListener('llm-stream-end', handleStreamEnd);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-12 md:h-16" aria-hidden />;
});

// ======================================================================
// Chat UI Sub-components
// ======================================================================
const StreamingIndicator = memo(function StreamingIndicator(): ReactElement {
  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
      <span className="text-sm text-muted-foreground">Generating…</span>
    </div>
  );
});

const SubmitButton = memo(function SubmitButton({ pending }: { pending: boolean }): ReactElement {
  return (
    <button
      type="submit"
      disabled={pending}
      className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-primary text-primary-foreground disabled:bg-gray-400 disabled:cursor-not-allowed hover:scale-110 active:scale-100 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
      aria-label={pending ? 'Sending…' : 'Send message'}
    >
      {pending ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <PaperAirplaneIcon className="w-5 h-5" />}
    </button>
  );
});

const SourcesDisplay = memo(function SourcesDisplay({ sources }: { sources: Source[] }): ReactElement | null {
  const [isExpanded, setIsExpanded] = useState(true);
  if (!sources?.length) return null;
  return (
    <div className="mt-5 border-t [border-color:rgb(var(--glass-border)/0.3)] pt-4">
      <button
        onClick={() => setIsExpanded((s) => !s)}
        className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"
        aria-expanded={isExpanded}
      >
        Sources {isExpanded ? '▼' : '▶'}
      </button>
      {isExpanded && (
        <div className="space-y-4">
          {sources.map((source) => (
            <div key={source.id} className="text-sm animate-fade-in">
              <a href={source.link} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground hover:text-primary transition-colors">
                <span className="text-primary mr-2">[{source.id}]</span>
                {source.title}
              </a>
              <p className="text-muted-foreground italic mt-1 text-xs pl-6" dangerouslySetInnerHTML={{ __html: source.snippet }} />
              {source.arxiv_id && (
                <a href={`https://arxiv.org/abs/${source.arxiv_id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block pl-6 font-medium">
                  View on arXiv
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

const ChatMessage = memo(function ChatMessage({ message }: { message: Message }): ReactElement {
  const isUser = message.role === 'user';
  const [hasCopied, setHasCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    toast.success('Copied to clipboard!');
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 1600);
  }, [message.content]);

  const renderedContent = useMemo(() => {
    const raw = message.content;
    const displayContent = raw.includes('|||META|||') ? raw.substring(raw.indexOf('|||META|||') + 9).trim() : raw;
    const sanitized = displayContent.replace(/\[(\d+)\]/g, '**[$1]**');
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{sanitized}</ReactMarkdown>;
  }, [message.content]);

  return (
    <div className={`animate-fade-in ${isUser ? 'flex justify-end' : ''}`}>
      <div className={`group relative p-4 rounded-2xl max-w-2xl ${isUser ? 'bg-muted text-foreground shadow-lg' : 'glass'}`}>
        {message.isStreaming && !message.content && <StreamingIndicator />}
        <div className="prose prose-sm md:prose-base max-w-none text-foreground prose-p:leading-relaxed prose-headings:font-serif prose-headings:mb-2 prose-headings:mt-4 prose-a:text-primary prose-strong:text-foreground">
          {renderedContent}
        </div>
        {!isUser && !message.isStreaming && message.content && (
          <button onClick={handleCopy} className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" title="Copy answer" aria-label="Copy answer">
            {hasCopied ? <CheckIcon className="w-4 h-4 text-green-500" /> : <ClipboardIcon className="w-4 h-4" />}
          </button>
        )}
        {!isUser && <SourcesDisplay sources={message.sources || []} />}
      </div>
    </div>
  );
});

// ======================================================================
// Session Hook & Main Page Component
// ======================================================================
function useSession(): string | null {
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

export default function ChatPage(): ReactElement {
  const sessionId = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCardsMobile, setShowCardsMobile] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const query = inputRef.current?.value.trim();
      if (!query || !sessionId || isSubmitting) return;

      formRef.current?.reset();

      const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: query };
      const assistantId = crypto.randomUUID();
      const assistantMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        sources: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsSubmitting(true);
      window.dispatchEvent(new CustomEvent('llm-stream-start'));

      try {
        await fetch('/api/turns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, userQuery: query, assistantId }),
        });

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, sessionId, turnId: assistantId }),
        });

        if (!response.ok || !response.body)
          throw new Error((await response.text()) || 'Failed to get response');

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
            try {
              sources = JSON.parse(parts[0]);
            } catch { /* ignore malformed payload */ }
            buffer = parts.slice(1).join('|||SOURCES|||');
            sourcesReceived = true;
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: buffer, sources, isStreaming: true } : m
            )
          );
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
        );

        if (buffer.trim()) {
          try {
            await fetch('/api/cards/enqueue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId,
                turnId: assistantId,
                answer: buffer,
                sources: (sources || []).map((s) => ({
                  id: s.id,
                  title: s.title,
                  arxiv_id: s.arxiv_id,
                })),
                topic: (buffer.match(/^(.{0,72})/)?.[0] || 'Study Topic').trim(),
                fromQuery: query,
              }),
            });
            window.dispatchEvent(new CustomEvent('cards:updated'));
          } catch (e: any) {
            console.warn('Auto-card generation failed:', e.message);
          }
        }
      } catch (error: any) {
        console.error(error);
        toast.error(`Error: ${error.message}`);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id));
      } finally {
        setIsSubmitting(false);
        window.dispatchEvent(new CustomEvent('llm-stream-end'));
      }
    },
    [isSubmitting, sessionId]
  );

  return (
    <>
      <StarfieldGrid dim={false} />

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

      <div className="relative z-10 isolate flex flex-col h-screen">
        <header className="text-center p-4 flex-shrink-0 flex items-center justify-center">
          <div id="particle-logo-target" className="w-full max-w-xs md:max-w-md">
            <ParticleLogo />
          </div>
        </header>

        <div className="relative flex flex-col md:flex-row gap-4 flex-1 overflow-hidden w-full max-w-7xl mx-auto">
          <main className="flex-grow flex flex-col overflow-hidden rounded-2xl bg-transparent">
            <div className="flex-grow overflow-y-auto space-y-6 p-4 min-h-0">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-8 px-4 flex flex-col items-center justify-center h-full">
                  <SparklesIcon className="w-16 h-16 text-transparent bg-clip-text bg-gradient-to-b from-gray-400 to-gray-700 mb-4" />
                  <h2 className="text-2xl font-serif font-bold text-foreground mb-4">
                    Welcome to Mindsieve
                  </h2>
                  <p className="max-w-xl">
                    Mindsieve provides grounded, accurate, and up-to-date responses for any
                    Computer Science topic, helping you to re-engage with the subject you love.
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}

              <div ref={messagesEndRef} className="h-1" />
            </div>

            <footer className="p-4 border-t [border-color:rgb(var(--glass-border)/0.2)] flex-shrink-0">
              <form ref={formRef} onSubmit={handleSubmit} className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  name="query"
                  required
                  placeholder="Ask about any computing topic…"
                  className="w-full h-14 px-6 pr-16 bg-muted/70 border border-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-inner text-foreground placeholder:text-muted-foreground"
                  disabled={!sessionId || isSubmitting}
                  autoComplete="off"
                />
                <SubmitButton pending={isSubmitting} />
              </form>
            </footer>
          </main>

          <aside className="hidden md:block md:w-96 flex-shrink-0 rounded-2xl glass glass-outline overflow-hidden">
            <CardsPanel sessionId={sessionId} />
          </aside>

          <div className={`md:hidden fixed inset-0 z-30 transition-transform duration-300 ease-in-out ${showCardsMobile ? 'translate-y-0' : 'translate-y-full'}`}>
            <div className="flex flex-col h-full glass glass-outline overflow-hidden rounded-t-2xl">
              <div className="p-4 border-b [border-color:rgb(var(--glass-border)/0.2)] flex-shrink-0 flex justify-between items-center">
                <h2 className="font-bold text-lg">My Study Cards</h2>
                <button onClick={() => setShowCardsMobile(false)} className="p-2 rounded-full hover:bg-muted/60" aria-label="Close study cards">
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
              <CardsPanel sessionId={sessionId} />
            </div>
          </div>
        </div>

        <div className="md:hidden absolute bottom-6 right-6 z-20">
          <button
            onClick={() => setShowCardsMobile((s) => !s)}
            className="p-4 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-110 active:scale-100 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
            aria-label="Open study cards"
          >
            <SparklesIcon className="w-6 h-6" />
          </button>
        </div>
      </div>
    </>
  );
}