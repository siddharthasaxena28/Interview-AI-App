'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="text-gray-900 font-semibold">{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i} className="italic">{part.slice(1, -1)}</em>
    return part
  })
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const numMatch = line.match(/^(\d+)\.\s+(.+)/)
    const bulletMatch = line.match(/^[-*]\s+(.+)/)

    if (numMatch) {
      const items: string[] = [numMatch[2]]
      while (i + 1 < lines.length && lines[i + 1].match(/^\d+\.\s+/)) {
        i++
        const m = lines[i].match(/^\d+\.\s+(.+)/)
        if (m) items.push(m[1])
      }
      elements.push(
        <ol key={i} className="list-decimal list-outside ml-4 space-y-1 my-1.5">
          {items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
        </ol>
      )
    } else if (bulletMatch) {
      const items: string[] = [bulletMatch[1]]
      while (i + 1 < lines.length && lines[i + 1].match(/^[-*]\s+/)) {
        i++
        const m = lines[i].match(/^[-*]\s+(.+)/)
        if (m) items.push(m[1])
      }
      elements.push(
        <ul key={i} className="list-disc list-outside ml-4 space-y-1 my-1.5">
          {items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
        </ul>
      )
    } else if (line.trim() === '') {
      if (elements.length > 0) elements.push(<div key={`gap-${i}`} className="h-1.5" />)
    } else {
      elements.push(<p key={i} className="leading-relaxed">{renderInline(line)}</p>)
    }
    i++
  }

  return <div className="space-y-0.5 text-sm">{elements}</div>
}

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
  const abortRef = useRef<AbortController | null>(null)
  const MAX_MSGS = 6 // 3 exchanges

  useEffect(() => {
    return () => { abortRef.current?.abort() }
  }, [])

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

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/interview-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: msg, history }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw new Error('Request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done || controller.signal.aborted) break
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
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStreaming(false)
        return
      }
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
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header — toggles open/close */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-100 border border-indigo-200 rounded-xl flex items-center justify-center">
            <Bot className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-gray-900 text-sm">Ask Your Interview Coach</div>
            <div className="text-xs text-gray-500">AI-powered coaching on your performance</div>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-200">
          {/* Starter prompts — only if no messages yet */}
          {messages.length === 0 && (
            <div className="px-5 pt-4 pb-2">
              <p className="text-xs text-gray-500 mb-2 font-medium">Try asking:</p>
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="text-xs bg-gray-100 hover:bg-indigo-100 border border-gray-200 hover:border-indigo-300 rounded-full text-gray-700 hover:text-indigo-700 px-3 py-1.5 transition-colors"
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
                    m.role === 'assistant' ? 'bg-indigo-100 border border-indigo-200' : 'bg-gray-100 border border-gray-200'
                  }`}>
                    {m.role === 'assistant'
                      ? <Bot className="w-3.5 h-3.5 text-indigo-600" />
                      : <User className="w-3.5 h-3.5 text-gray-700" />}
                  </div>
                  <div className={`rounded-2xl px-3.5 py-2.5 max-w-[85%] ${
                    m.role === 'assistant'
                      ? 'bg-white border border-gray-200 text-gray-700 rounded-tl-sm'
                      : 'bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-tr-sm text-sm leading-relaxed'
                  }`}>
                    {m.role === 'assistant'
                      ? (m.content
                          ? <MarkdownMessage content={m.content} />
                          : streaming && i === messages.length - 1
                            ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                            : null)
                      : m.content}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Input */}
          <div className="px-5 py-3 border-t border-gray-200">
            {exhausted ? (
              <p className="text-xs text-gray-500 text-center py-1">
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
                  className="flex-1 text-sm bg-gray-100 border border-gray-200 rounded-xl px-3.5 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-500/40 disabled:opacity-50 transition-colors"
                />
                <button
                  onClick={() => send()}
                  disabled={!input.trim() || streaming}
                  className="w-9 h-9 bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 transition-colors flex-shrink-0 shadow-lg shadow-indigo-500/20"
                >
                  {streaming
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />}
                </button>
              </div>
            )}
            <p className="text-xs text-gray-400 text-center mt-1.5">{MAX_MSGS - msgCount} questions remaining</p>
          </div>
        </div>
      )}
    </div>
  )
}
