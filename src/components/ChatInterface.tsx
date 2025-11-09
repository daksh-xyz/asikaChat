import { Mic, Paperclip, Send } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'

type Role = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: Role
  content: string
}

const computeChatEndpoint = () => {
  const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) || ''
  if (!rawBase) {
    return '/api/chat'
  }

  const normalizedBase = rawBase.startsWith('http://') || rawBase.startsWith('https://')
    ? rawBase
    : `http://${rawBase}`

  return `${normalizedBase.replace(/\/$/, '')}/api/chat`
}

const CHAT_ENDPOINT = computeChatEndpoint()

type AttachmentState = {
  name: string
  dataUrl: string
  sizeLabel: string
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024 // 5MB hard limit for quick previews

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'assistant-welcome',
      role: 'assistant',
      content:
        "Hi, I'm Asika your fertility clinic assistant. Ask me anything about our services, treatments, or next steps and I'll help out!\nYou can speak to me in any language: English, తెలుగు, हिंदी, and more!",
    },
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<AttachmentState | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const sendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault()
    const trimmed = inputValue.trim()
    if ((!trimmed && !attachment) || isLoading) {
      return
    }

    let messageContent = trimmed
    if (attachment) {
      const note = `[Attachment: ${attachment.name}]`
      messageContent = [trimmed, note].filter(Boolean).join('\n\n')
    }

    if (!messageContent) {
      messageContent = attachment ? `Uploaded ${attachment.name}` : ''
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageContent,
    }

    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInputValue('')
    setIsLoading(true)
    setError(null)

    try {
      const body: Record<string, unknown> = {
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
      }

      if (attachment) {
        body.image = {
          dataUrl: attachment.dataUrl,
          filename: attachment.name,
          size: attachment.sizeLabel,
        }
        body.task = 'extract_id'
      }

      const response = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        throw new Error(errorBody.error || `Request failed with status ${response.status}`)
      }

      const data = (await response.json()) as { reply?: string }
      if (!data.reply) {
        throw new Error('The server response is missing the assistant reply.')
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.reply.trim(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setIsLoading(false)
      setAttachment(null)
    }
  }

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  const handleAttachClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPEG, PNG, etc.).')
      event.target.value = ''
      return
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError('Image too large. Please keep uploads under 5MB.')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setAttachment({
        name: file.name,
        dataUrl: String(reader.result),
        sizeLabel: `${(file.size / 1024).toFixed(0)} KB`,
      })
      setError(null)
    }
    reader.onerror = () => {
      setError('Failed to read the selected image. Please try again.')
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const handleRemoveAttachment = () => {
    setAttachment(null)
  }

  const renderedMessages = useMemo(
    () =>
      messages.map((message) => (
        <MessageBubble key={message.id} role={message.role} content={message.content} />
      )),
    [messages],
  )

  return (
    <div className="flex h-[calc(100%-96px)] flex-col justify-between bg-white">
      <div className="flex-1 overflow-y-auto space-y-4 bg-slate-50 p-4">
        {renderedMessages}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
              Asika is typing…
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={sendMessage} className="space-y-2 border-t border-slate-200 bg-white p-4">
        {error && (
          <p className="text-sm text-red-600">
            {error} — please try again or check the server connection.
          </p>
        )}
        <div className="w-full rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={handleAttachClick}
              className="rounded-lg p-2 transition-colors hover:bg-blue-50"
              aria-label="Attach file"
            >
              <Paperclip className="h-5 w-5 text-blue-600" />
            </button>
            {attachment && (
              <button
                type="button"
                onClick={handleRemoveAttachment}
                className="rounded-lg border border-red-100 px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Remove {attachment.name}
              </button>
            )}
            <input
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Type your message..."
              className="flex-1 rounded-lg border border-blue-200 px-4 py-2 text-sm text-slate-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              type="button"
              onClick={() => {
                // Voice input integration can be wired in later.
              }}
              className="rounded-lg p-2 transition-colors hover:bg-teal-50"
              aria-label="Voice input"
            >
              <Mic className="h-5 w-5 text-teal-600" />
            </button>
            <button
              type="submit"
              disabled={(!inputValue.trim() && !attachment) || isLoading}
              className="rounded-lg bg-gradient-to-r from-blue-500 to-teal-500 p-2 transition-colors hover:from-blue-600 hover:to-teal-600 disabled:from-gray-300 disabled:to-gray-300"
              aria-label="Send message"
            >
              <Send className="h-5 w-5 text-white" />
            </button>
          </div>
          {attachment && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-800">
              <div className="flex flex-col">
                <span className="font-medium">{attachment.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-blue-500">{attachment.sizeLabel}</span>
              </div>
              <span className="text-[10px] text-blue-500">Ready for OCR</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-gray-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Secure & HIPAA Compliant</span>
          </div>
        </div>
      </form>
    </div>
  )
}

type MessageBubbleProps = Pick<ChatMessage, 'role' | 'content'>

function MessageBubble({ role, content }: MessageBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm shadow-sm ${isUser
          ? 'bg-gradient-to-r from-blue-500 to-teal-500 text-white'
          : 'bg-white text-slate-800 ring-1 ring-slate-200'
          }`}
      >
        {renderFormattedContent(content)}
      </div>
    </div>
  )
}

function renderFormattedContent(content: string) {
  const segments = content.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)

  return segments.map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
      const trimmed = segment.slice(2, -2)
      return (
        <strong key={`bold-${index}`} className="font-semibold">
          {trimmed}
        </strong>
      )
    }

    if (segment.startsWith('*') && segment.endsWith('*') && segment.length > 2) {
      const trimmed = segment.slice(1, -1)
      return (
        <em key={`italic-${index}`} className="italic">
          {trimmed}
        </em>
      )
    }

    return (
      <React.Fragment key={`text-${index}`}>
        {segment}
      </React.Fragment>
    )
  })
}
