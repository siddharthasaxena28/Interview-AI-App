'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, Bot, User, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const STARTER_PROMPTS = [
  'Why did I score low on my weakest question?',
  'What should I have said differently?',
  'What are my top 2 areas to improve?',
  'Give me the ideal answer for my worst question.',
]

export default function CoachChat({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [msgCount, setMsgCount] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const MAX_MSGS = 6 // 3 exchanges

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || streaming || msgCount >= MAX_MSGS) return
    setInput('')
    const userMsg: Message = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setMsgCount(c => c + 1)
    setStreaming(true)

    const history = messages.slice(-6)
    let assistantText = ''
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/interview-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: msg, history }),
      })
      if (!res.ok || !res.body) throw new Error('Request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') break
            try {
              const { text } = JSON.parse(data) as { text: string }
              assistantText += text
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: assistantText }
                return updated
              })
            } catch { /* skip bad chunk */ }
          }
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }
        return updated
      })
    } finally {
      setStreaming(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  const exhausted = msgCount >= MAX_MSGS

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header — toggles open/close */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center">
            <Bot className="w-4.5 h-4.5 text-purple-600" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-gray-900 text-sm">Ask Your Interview Coach</div>
            <div className="text-xs text-gray-400">AI-powered coaching on your performance</div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {/* Starter prompts — only if no messages yet */}
          {messages.length === 0 && (
            <div className="px-5 pt-4 pb-2">
              <p className="text-xs text-gray-400 mb-2 font-medium">Try asking:</p>
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="text-xs bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-600 px-3 py-1.5 rounded-lg transition-colors border border-gray-200 hover:border-blue-200"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message history */}
          {messages.length > 0 && (
            <div className="px-5 py-3 space-y-3 max-h-80 overflow-y-auto">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    m.role === 'assistant' ? 'bg-purple-100' : 'bg-blue-100'
                  }`}>
                    {m.role === 'assistant'
                      ? <Bot className="w-3.5 h-3.5 text-purple-600" />
                      : <User className="w-3.5 h-3.5 text-blue-600" />}
                  </div>
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%] ${
                    m.role === 'assistant'
                      ? 'bg-gray-50 text-gray-700 rounded-tl-sm'
                      : 'bg-blue-600 text-white rounded-tr-sm'
                  }`}>
                    {m.content || (streaming && i === messages.length - 1
                      ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      : null)}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Input */}
          <div className="px-5 py-3 border-t border-gray-100">
            {exhausted ? (
              <p className="text-xs text-gray-400 text-center py-1">
                You&apos;ve reached the session limit. Start a new interview to continue coaching.
              </p>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder="Ask about your performance…"
                  disabled={streaming}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3.5 py-2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent disabled:opacity-50"
                />
                <button
                  onClick={() => send()}
                  disabled={!input.trim() || streaming}
                  className="w-9 h-9 bg-purple-600 text-white rounded-xl flex items-center justify-center hover:bg-purple-700 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  {streaming
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />}
                </button>
              </div>
            )}
            <p className="text-xs text-gray-300 text-center mt-1.5">{MAX_MSGS - msgCount} questions remaining</p>
          </div>
        </div>
      )}
    </div>
  )
}
