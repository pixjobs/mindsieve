'use client';

import { useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { PaperAirplaneIcon, ClipboardIcon, CheckIcon, ArrowPathIcon, PlusIcon } from '@heroicons/react/24/solid';
import { gsap } from 'gsap';
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

// ----------------- Small UI bits -----------------
const SubmitButton = ({ pending }: { pending: boolean }) => (
  <button
    type="submit"
    disabled={pending}
    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-blue-600 text-white disabled:bg-gray-500 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
  >
    {pending ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <PaperAirplaneIcon className="w-5 h-5" />}
  </button>
);

const SourcesDisplay = ({ sources }: { sources: Source[] }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  if (!sources || sources.length === 0) return null;
  
  return (
    <div className="mt-4 border-t border-gray-700/50 pt-4">
      <button 
        onClick={() => setIsExpanded(!isExpanded)} 
        className="text-sm font-semibold text-gray-400 mb-2 flex items-center gap-1"
      >
        Consulted Sources {isExpanded ? '▼' : '▶'}
      </button>
      {isExpanded && (
        <div className="space-y-3">
          {sources.map((source) => (
            <div 
              key={source.id} 
              className="bg-gray-800/80 p-3 rounded-lg text-sm animate-fade-in"
            >
              <p className="font-bold text-white">
                <span className="text-blue-400 mr-2">[{source.id}]</span>
                <a 
                  href={source.link} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:underline text-blue-300"
                >
                  {source.title}
                </a>
              </p>
              <p 
                className="text-gray-400 italic mt-1" 
                dangerouslySetInnerHTML={{ __html: source.snippet }} 
              />
              <p className="text-xs text-gray-500 mt-1">Published: {source.published}</p>
              {source.arxiv_id && (
                <a 
                  href={`https://arxiv.org/abs/${source.arxiv_id}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-xs text-green-400 hover:underline mt-1 inline-block"
                >
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

const SaveCardButton = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="mt-3 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-600 transition-colors"
    title="Save as study card"
  >
    <PlusIcon className="w-4 h-4" />
    Save as card
  </button>
);

function ChatMessage({
  message,
  onSaveCard,
}: {
  message: Message;
  onSaveCard?: (payload: { answer: string; sources: Source[]; topic: string; fromQuery: string }) => void;
}) {
  const isUser = message.role === 'user';
  const [hasCopied, setHasCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 1600);
  };

  // Parse and render markdown content
  const renderContent = (content: string) => {
    // Check if content is JSON with markdown format
    if (content.startsWith('{') && content.includes('"format":"markdown"')) {
      try {
        const jsonMatch = content.match(/\{.*"format":"markdown".*\}/s);
        if (jsonMatch) {
          const json = JSON.parse(jsonMatch[0]);
          if (json.format === 'markdown') {
            // Extract markdown content after META delimiter
            const metaIndex = content.indexOf('|||META|||');
            if (metaIndex !== -1) {
              const markdownContent = content.substring(metaIndex + 9).trim();
              return (
                <div className="prose prose-invert max-w-none noto-serif-pro">
                  <div dangerouslySetInnerHTML={{ __html: markdownContent.replace(/\n/g, '<br />') }} />
                </div>
              );
            }
          }
        }
      } catch (e) {
        // Fall back to regular content rendering
      }
    }
    
    // Regular content rendering
    return (
      <p 
        className="whitespace-pre-wrap noto-serif-pro"
        dangerouslySetInnerHTML={{ 
          __html: content.replace(/\[(\d+)\]/g, '<strong class="text-blue-300">[$1]</strong>') 
        }}
      />
    );
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`group relative p-4 rounded-lg max-w-2xl ${isUser ? 'bg-blue-600' : 'bg-gray-700'}`}>
        {renderContent(message.content)}
        {!isUser && !message.isStreaming && message.content && (
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1 rounded bg-gray-800/50 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Copy answer"
          >
            {hasCopied ? <CheckIcon className="w-4 h-4 text-green-400" /> : <ClipboardIcon className="w-4 h-4" />}
          </button>
        )}
        {!isUser && <SourcesDisplay sources={message.sources || []} />}
        {!isUser && !message.isStreaming && onSaveCard && (
          <SaveCardButton
            onClick={() =>
              onSaveCard({
                answer: message.content,
                sources: message.sources || [],
                topic: (message.content.match(/^(.{0,72})/)?.[0] || 'Study Topic').trim(),
                fromQuery: 'chat',
              })
            }
          />
        )}
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
        const { sessionId } = JSON.parse(stored);
        setSessionId(sessionId);
        return;
      }
      
      try {
        const res = await fetch('/api/sessions', { method: 'POST' });
        if (!res.ok) {
          const text = await res.text();
          console.warn('Failed to init session:', res.status, text);
          return;
        }
        
        const json = await res.json();
        localStorage.setItem('ms_session', JSON.stringify({ 
          sessionId: json.sessionId, 
          sessionKey: json.sessionKey 
        }));
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

  // Smooth-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (messages.length > 0) {
      gsap.from(messagesEndRef.current, { 
        opacity: 0, 
        y: 20, 
        duration: 0.35, 
        ease: 'power2.out' 
      });
    }
  }, [messages]);

  // Create a turn then stream chat
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputRef.current || !sessionId) return;

    const query = inputRef.current.value.trim();
    if (!query) return;

    formRef.current?.reset();

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: query };
    const assistantId = crypto.randomUUID(); // also used as turnId
    setCurrentTurnId(assistantId);

    // Create Turn
    try {
      const turnRes = await fetch('/api/turns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, userQuery: query, assistantId }),
      });
      
      if (!turnRes.ok) {
        const t = await turnRes.text();
        toast.error(`Failed to create turn: ${t}`);
        return;
      }
    } catch (err: any) {
      toast.error(`Turn error: ${err?.message || 'unknown'}`);
      return;
    }

    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', sources: [], isStreaming: true };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, sessionId, turnId: assistantId }),
      });

      if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(text || 'Failed to get response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';
      let sources: Source[] = [];
      let sourcesReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Extract sources once
        if (!sourcesReceived && buffer.includes('|||SOURCES|||')) {
          const parts = buffer.split('|||SOURCES|||');
          try {
            sources = JSON.parse(parts[0]);
          } catch {
            sources = [];
          }
          buffer = parts.slice(1).join('|||SOURCES|||');
          sourcesReceived = true;
        }

        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: buffer, sources } : m)));
      }

      // Mark finished
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)));

      // Auto-enqueue a card for the current turn
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
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || 'Failed to save card');
          // tell the panel to refresh now
          window.dispatchEvent(new CustomEvent('cards:updated'));
        } catch (e: any) {
          // non-fatal
        }
      }
    } catch (error: any) {
      console.error(error);
      toast.error(`Error: ${error.message || 'Failed to get response'}`);
      // remove the placeholder assistant message if streaming failed
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Manual save from a specific assistant message
  const handleSaveCard = async (p: { answer: string; sources: Source[]; topic: string; fromQuery: string }) => {
    if (!sessionId || !currentTurnId) return;
    try {
      const res = await fetch('/api/cards/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          turnId: currentTurnId,
          answer: p.answer,
          sources: p.sources.map((s) => ({ id: s.id, title: s.title, arxiv_id: s.arxiv_id })),
          topic: p.topic,
          fromQuery: p.fromQuery,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save card');
      window.dispatchEvent(new CustomEvent('cards:updated'));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save card');
    }
  };

  return (
    <>
      <Toaster 
        position="top-center" 
        toastOptions={{ 
          style: { background: '#333', color: '#fff' },
          duration: 3000
        }} 
      />

      <div className="flex flex-col h-screen max-w-7xl mx-auto p-4 font-sans noto-serif-pro">
        <header className="text-center mb-4 p-4">
          <h1 className="text-3xl font-bold noto-serif-pro">🧠 Mindsieve AI Tutor</h1>
        </header>

        <div className="flex gap-4 flex-1">
          {/* Chat pane */}
          <main className="flex-grow overflow-y-auto space-y-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 py-8">
                <div className="text-lg mb-2 noto-serif-pro">Ask a question to get started...</div>
                <div className="text-sm text-gray-500 max-w-md mx-auto noto-serif-pro">
                  Try: "Explain the transformer architecture" or "What are LLM inference optimizations?"
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} onSaveCard={handleSaveCard} />
            ))}
            <div ref={messagesEndRef} />
          </main>

          {/* Cards Panel (extracted) */}
          <CardsPanel sessionId={sessionId} currentTurnId={currentTurnId} />
        </div>

        <footer className="mt-4">
          <form ref={formRef} onSubmit={handleSubmit} className="relative">
            <input
              ref={inputRef}
              type="text"
              name="query"
              required
              placeholder="e.g., Explain the transformer architecture"
              className="w-full p-4 pr-14 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all noto-serif-pro"
              disabled={!sessionId}
            />
            <SubmitButton pending={isSubmitting || !sessionId} />
          </form>
        </footer>
      </div>
    </>
  );
}
