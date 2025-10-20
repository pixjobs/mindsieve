'use client';

import { useState, useRef, useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { PaperAirplaneIcon, ClipboardIcon, CheckIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import { gsap } from 'gsap';

// --- Type Definitions ---
interface Source {
  id: number;
  title: string;
  link: string;
  published: string;
  snippet: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
}

// --- UI Components ---
const SubmitButton = ({ pending }: { pending: boolean }) => {
  return (
    <button
      type="submit"
      disabled={pending}
      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-blue-600 text-white disabled:bg-gray-500 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {pending ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <PaperAirplaneIcon className="w-5 h-5" />}
    </button>
  );
};

const SourcesDisplay = ({ sources }: { sources: Source[] }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  if (!sources || sources.length === 0) return null;
  return (
    <div className="mt-4 border-t border-gray-700/50 pt-4">
      <button onClick={() => setIsExpanded(!isExpanded)} className="text-sm font-semibold text-gray-400 mb-2">
        Consulted Sources {isExpanded ? '▼' : '▶'}
      </button>
      {isExpanded && (
        <div className="space-y-3">
          {sources.map((source) => (
            <div key={source.id} className="bg-gray-800/80 p-3 rounded-lg text-sm animate-fade-in">
              <p className="font-bold text-white">
                <span className="text-blue-400 mr-2">[{source.id}]</span>
                <a href={source.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {source.title}
                </a>
              </p>
              <p className="text-gray-400 italic mt-1" dangerouslySetInnerHTML={{ __html: source.snippet }} />
              <p className="text-xs text-gray-500 mt-1">Published: {source.published}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ChatMessage = ({ message }: { message: Message }) => {
  const isUser = message.role === 'user';
  const [hasCopied, setHasCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`group relative p-4 rounded-lg max-w-2xl ${isUser ? 'bg-blue-600' : 'bg-gray-700'}`}>
        <p
          className="whitespace-pre-wrap"
          dangerouslySetInnerHTML={{
            __html: message.content.replace(/\[(\d+)\]/g, '<strong class="text-blue-300">[$1]</strong>'),
          }}
        ></p>
        {!isUser && !message.isStreaming && message.content && (
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1 rounded bg-gray-800/50 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {hasCopied ? <CheckIcon className="w-4 h-4 text-green-400" /> : <ClipboardIcon className="w-4 h-4" />}
          </button>
        )}
        {!isUser && <SourcesDisplay sources={message.sources || []} />}
      </div>
    </div>
  );
};

// --- Main Page Component ---
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (messages.length > 0) {
      gsap.from(messagesEndRef.current, { opacity: 0, y: 20, duration: 0.4 });
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputRef.current) return;

    const query = inputRef.current.value.trim();
    if (!query) return;

    formRef.current?.reset();

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: query };
    const assistantId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      sources: [],
      isStreaming: true,
    };

    // IMPORTANT: seed the real state so subsequent updates can map by id
    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
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

        // Parse sources once when delimiter appears; allow JSON to span chunks
        if (!sourcesReceived && buffer.includes('|||SOURCES|||')) {
          const parts = buffer.split('|||SOURCES|||');
          try {
            sources = JSON.parse(parts[0]);
          } catch (err) {
            console.error('Failed to parse sources JSON:', err);
            sources = [];
          }
          buffer = parts.slice(1).join('|||SOURCES|||');
          sourcesReceived = true;
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: buffer, sources } : m))
        );
      }

      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m)));
    } catch (error: any) {
      console.error(error);
      toast.error(`Error: ${error.message || 'Failed to get response'}`);
      // remove the placeholder assistant message if streaming failed
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Toaster position="top-center" toastOptions={{ style: { background: '#333', color: '#fff' } }} />
      <div className="flex flex-col h-screen max-w-4xl mx-auto p-4 font-sans">
        <header className="text-center mb-4 p-4">
          <h1 className="text-3xl font-bold">🧠 Mindsieve AI Tutor</h1>
          <p className="text-gray-400">Powered by Next.js 15, Gemini, and Elasticsearch</p>
        </header>
        <main className="flex-grow overflow-y-auto space-y-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
          {messages.length === 0 && (
            <div className="text-center text-gray-400">Ask a question to get started...</div>
          )}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </main>
        <footer className="mt-4">
          <form ref={formRef} onSubmit={handleSubmit} className="relative">
            <input
              ref={inputRef}
              type="text"
              name="query"
              required
              placeholder="e.g., Explain the transformer architecture"
              className="w-full p-4 pr-14 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
            <SubmitButton pending={isSubmitting} />
          </form>
        </footer>
      </div>
    </>
  );
}
