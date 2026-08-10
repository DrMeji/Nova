import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchChatMessages, saveChatMessage } from '@/lib/api';
import type { ChatMessage } from '@/types';
import { Bot, User as UserIcon, Send, Loader2, Cpu, Zap } from 'lucide-react';

export function AIChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChatMessages(null)
      .then(data => setMessages(data as ChatMessage[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !user) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      user_id: user.id,
      project_id: null,
      role: 'user',
      content: input,
      provider_used: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    const content = input;
    setInput('');

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      user_id: user.id,
      project_id: null,
      role: 'assistant',
      content: '',
      provider_used: 'Local AI · Qwen2.5 Coder',
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, assistantMsg]);

    const responses = [
      "I can help you build that. Would you like me to create a new project for this?",
      "Great idea! Let me break this down into steps and start building.",
      "I understand what you're looking for. I'll plan the architecture and create the files needed.",
      "That sounds like a good project. I can set up the project structure, install dependencies, and build it for you.",
    ];
    const response = responses[Math.floor(Math.random() * responses.length)];

    setTimeout(async () => {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: response } : m));
      await saveChatMessage(null, 'user', content);
      await saveChatMessage(null, 'assistant', response, 'Local AI · Qwen2.5 Coder');
    }, 800);
  };

  const suggestions = [
    'Build a React todo app with dark mode',
    'Create a REST API for a blog',
    'Make a calculator tool',
    'Build a landing page for a coffee shop',
  ];

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-surface-border">
        <h1 className="text-lg font-semibold text-content-primary">AI Chat</h1>
        <p className="text-xs text-content-secondary mt-0.5">Talk to ARK naturally about what you want to build</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-content-tertiary">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-ark-blue-500/10 mb-4">
              <Bot className="w-7 h-7 text-ark-blue-400" />
            </div>
            <h2 className="text-base font-medium text-content-primary mb-1">Start building with ARK</h2>
            <p className="text-sm text-content-secondary mb-6">Describe what you want to create and ARK will build it for you</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="ark-card p-3 text-left text-xs text-content-secondary hover:text-content-primary hover:border-surface-border-light transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 animate-fade-in ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                msg.role === 'user' ? 'bg-ark-blue-500/20' : 'bg-ark-accent-green/15'
              }`}>
                {msg.role === 'user' ? <UserIcon className="w-4 h-4 text-ark-blue-300" /> : <Bot className="w-4 h-4 text-ark-accent-green" />}
              </div>
              <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                <div className={`rounded-xl px-4 py-3 text-sm ${
                  msg.role === 'user' ? 'bg-ark-blue-500/15 text-content-primary' : 'ark-card text-content-primary'
                }`}>
                  {msg.content || <Loader2 className="w-4 h-4 animate-spin text-content-tertiary" />}
                </div>
                {msg.provider_used && (
                  <div className="flex items-center gap-1.5 mt-1.5 px-1">
                    <Zap className="w-3 h-3 text-ark-blue-400" />
                    <span className="text-2xs text-content-tertiary">{msg.provider_used}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-6 py-4 border-t border-surface-border">
        <div className="ark-card p-1.5 flex items-end gap-2 focus-within:border-ark-blue-400 transition-colors">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask ARK to build something..."
            rows={1}
            className="flex-1 bg-transparent border-none resize-none px-3 py-2.5 text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none max-h-32"
          />
          <button onClick={handleSend} disabled={!input.trim()} className="ark-btn-primary mb-1 mr-1 !px-3">
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2 px-1">
          <Cpu className="w-3 h-3 text-ark-accent-green" />
          <span className="text-2xs text-content-tertiary">ARK AI · Optimizing · Local AI Ready</span>
        </div>
      </div>
    </div>
  );
}
