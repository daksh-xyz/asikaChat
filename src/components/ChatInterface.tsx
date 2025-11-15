import React, { useEffect, useRef, useState } from "react"
import { Paperclip, Send, Trash2, Mic } from "lucide-react"
import { TypingIndicator } from "./TypingIndicator"

const CHAT_ENDPOINT =
  ("http://localhost:5000/chat")

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

type AttachmentState = {
  name: string
  dataUrl: string
  sizeLabel: string
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

function getGreetingMessage() {
  const hour = new Date().getHours()

  let greeting = "Good evening"
  if (hour < 12) greeting = "Good morning"
  else if (hour < 17) greeting = "Good afternoon"

  return `${greeting},
I'm Maya, your personal Fertility Plus agent.
I'm here to answer any questions you have about our clinic, or complete your registration as a patient.
You can speak to me in any language: English, हिंदी, اَلْعَرَبِيَّةُ and more!`
}

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [attachment, setAttachment] = useState<AttachmentState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  useEffect(() => {
  // Only show welcome message if there are no messages yet
  if (messages.length === 0) {
    const welcome: ChatMessage = {
      id: `assistant-welcome`,
      role: "assistant",
      content: getGreetingMessage(),
    }
    setMessages([welcome])
  }
}, [])

  const sendToBackend = async (payload: any) => {
    const res = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || "Server error")
    }

    return res.json()
  }

  const sendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault()

    if ((!inputValue.trim() && !attachment) || isLoading) return

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: inputValue || (attachment ? attachment.name : "")
    }

    const nextMessages = [...messages, userMessage]

    setMessages(nextMessages)
    setInputValue("")
    setIsLoading(true)
    setError(null)

    try {
      const payload: any = {
        messages: nextMessages
      }

      if (attachment) {
        payload.task = "ocr"
        payload.image = userMessage.content.includes("data:image")
          ? userMessage.content
          : attachment.dataUrl
      } else {
        payload.task = "chat"
      }

      const data = await sendToBackend(payload)

      if (data.ocr_data) {
        // Convert OCR into synthetic user message for registration
        const synthetic: ChatMessage = {
          id: `user-ocr-${Date.now()}`,
          role: "user",
          content: "~~~OCR_DATA: " + JSON.stringify(data.ocr_data) + "~~~"
        }

        const withOCR = [...nextMessages, synthetic]
        setMessages(withOCR)

        const regResponse = await sendToBackend({
          task: "chat",
          messages: withOCR
        })

        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: regResponse.reply
          }
        ])
      } else {
        setMessages((prev) => {
          const now = Date.now()
          const updated: ChatMessage[] = [
            ...prev,
            {
              id: `assistant-${now}`,
              role: "assistant",
              content: data.reply,
            },
          ]

          // If backend returned RPA metadata, add a hidden status message
          const rpa = (data as any).rpa
          if (rpa && (rpa.rpa_ok !== undefined || rpa.rpa_error || rpa.rpa_status_code)) {
            const statusParts: string[] = []

            if (rpa.rpa_ok === true) {
              statusParts.push("SUCCESS")
            } else if (rpa.rpa_ok === false) {
              statusParts.push("FAIL")
            } else {
              statusParts.push("UNKNOWN")
            }

            if (rpa.rpa_status_code) {
              statusParts.push(`status=${rpa.rpa_status_code}`)
            }
            if (rpa.rpa_error) {
              statusParts.push(`error=${rpa.rpa_error}`)
            }

            updated.push({
              id: `rpa-status-${now}`,
              role: "user",
              content: `RPA_STATUS: ${statusParts.join("; ")}`,
            })
          }

          return updated
        })
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
      setAttachment(null)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setError("Invalid file.")
      return
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("Image too large.")
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setAttachment({
        name: file.name,
        dataUrl: reader.result as string,
        sizeLabel: `${(file.size / 1024).toFixed(0)} KB`
      })
      setError(null)
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  type MessageBubbleProps = Pick<ChatMessage, 'role' | 'content'>

  function MessageBubble({ role, content }: MessageBubbleProps) {
    const isUser = role === 'user'
    return (
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[75%] whitespace-pre-line break-words rounded-2xl px-4 py-3 text-sm shadow-sm ${isUser ? 'bg-gradient-to-r from-rose-500 to-red-500 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-200'}`} >
          {
            renderFormattedContent(content)
          }
        </div>
      </div>
    )
  }
  function renderFormattedContent(content: string) {
    const cleaned = content.replace(/~~~[\s\S]*?~~~/g, "").trimEnd()
    if (!cleaned) {
      return null
    }
    const segments = cleaned.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    return segments.map(
      (segment, index) => {
        if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
          const trimmed = segment.slice(2, -2)
          return (<strong key={`bold-${index}`} className="font-semibold"> {trimmed} </strong>)
        }
        if (segment.startsWith('*') && segment.endsWith('*') && segment.length > 2) {
          const trimmed = segment.slice(1, -1)
          return (<em key={`italic-${index}`} className="italic"> {trimmed} </em>)
        }
        return (<React.Fragment key={`text-${index}`}> {segment} </React.Fragment>)
      })
  }

  return (
    <div className="flex h-[calc(100vh-210px)] flex-col bg-white">
      {/* Chat window */}
      <div className="flex-1 overflow-y-auto space-y-4 bg-slate-50 p-4">
        {messages.map((message) => {
          if (message.content.startsWith("OCR_DATA") || message.content.startsWith("RPA_STATUS:")) {
            return null
          }
          return <MessageBubble key={message.id} role={message.role} content={message.content} />
        })}

        {isLoading && (
          <div className="flex justify-start text-slate-500 text-sm">
            <TypingIndicator />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form
        onSubmit={sendMessage}
        className="border-t border-slate-200 bg-white p-4"
      >
        {error && (
          <p className="mb-2 text-sm text-red-600">{error}</p>
        )}

        <div className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
          />

          {/* Attach button */}
          {!attachment ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg p-2 bg-[rgb(206,40,95)]"
            >
              <Paperclip className="h-5 w-5 text-white" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="rounded-lg border border-red-200 p-1 text-red-600"
            >
              <Trash2 className="h-7 w-7" />
            </button>
          )}

          {!attachment ? (<input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder=""
            className="flex-1 rounded-lg border px-4 py-2 text-sm focus:ring-2 focus:ring-[rgb(206,40,95)]"
          />) : (
            <div className="flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-blue-900">{attachment.name}</span>
                <span className="text-[10px] uppercase tracking-wide text-blue-500">
                  {attachment.sizeLabel}
                </span>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={(!inputValue.trim() && !attachment) || isLoading}
            className="rounded-lg bg-[rgb(206,40,95)] p-2 disabled:opacity-60"
          >
            <Send className="h-5 w-5 text-white" />
          </button>
        </div>
      </form>
    </div>
  )
}
