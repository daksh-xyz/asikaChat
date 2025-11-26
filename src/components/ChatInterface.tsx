import React, { useEffect, useRef, useState } from "react"
import { Paperclip, Send, Trash2, FileText } from "lucide-react"
import { TypingIndicator } from "./TypingIndicator"

const CHAT_ENDPOINT = "https://prd-pristine.api.novocuris.org/chat"
const UPLOAD_ENDPOINT = "https://prd-pristine.api.novocuris.org/upload-referral"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

type AttachmentState = {
  name: string
  file: File
  sizeLabel: string
  type: "image" | "document"
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

function getGreetingMessage() {
  const hour = new Date().getHours()

  let greeting = "Good evening"
  if (hour < 12) greeting = "Good morning"
  else if (hour < 17) greeting = "Good afternoon"

  return `${greeting},
I'm Rachel, your personal hospital assistant.
I'm here to answer any questions you have about our clinic, or help you complete your patient registration.
You can upload a referral letter (PDF or DOCX) to get started with registration.
You can speak to me in any language: English, اَلْعَرَبِيَّةُ and more!`
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

  const uploadReferralDocument = async (file: File) => {
    const formData = new FormData()
    formData.append("file", file)

    const res = await fetch(UPLOAD_ENDPOINT, {
      method: "POST",
      body: formData
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || "Failed to process document")
    }

    return res.json()
  }

  const sendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault()

    if ((!inputValue.trim() && !attachment) || isLoading) return

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: inputValue || (attachment ? `📎 ${attachment.name}` : "")
    }

    const nextMessages = [...messages, userMessage]

    setMessages(nextMessages)
    setInputValue("")
    setIsLoading(true)
    setError(null)

    try {
      // Handle document upload (PDF/DOCX)
      if (attachment && attachment.type === "document") {
        const uploadResult = await uploadReferralDocument(attachment.file)

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || "Failed to process document")
        }

        // Create synthetic message with extracted referral data
        const synthetic: ChatMessage = {
          id: `user-referral-${Date.now()}`,
          role: "user",
          content: "~~~REFERRAL_DATA: " + JSON.stringify(uploadResult.extracted_data) + "~~~"
        }

        const withReferralData = [...nextMessages, synthetic]
        setMessages(withReferralData)

        // Send to chat for processing
        const chatResponse = await sendToBackend({
          messages: withReferralData
        })

        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: chatResponse.reply
          }
        ])

        // Handle RPA status if present
        if (chatResponse.rpa) {
          addRPAStatusMessage(chatResponse.rpa)
        }
      } 
      // Handle regular chat message
      else {
        const payload: any = {
          messages: nextMessages
        }

        const data = await sendToBackend(payload)

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

  const addRPAStatusMessage = (rpa: any) => {
    setMessages((prev) => {
      const now = Date.now()
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

      return [
        ...prev,
        {
          id: `rpa-status-${now}`,
          role: "user",
          content: `RPA_STATUS: ${statusParts.join("; ")}`,
        }
      ]
    })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isImage = file.type.startsWith("image/")
    const isDocument = file.type === "application/pdf" || 
                      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                      file.name.toLowerCase().endsWith(".pdf") ||
                      file.name.toLowerCase().endsWith(".docx")

    if (!isImage && !isDocument) {
      setError("Please upload an image, PDF, or DOCX file.")
      return
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("File too large (max 5MB).")
      return
    }

    setAttachment({
      name: file.name,
      file: file,
      sizeLabel: `${(file.size / 1024).toFixed(0)} KB`,
      type: isDocument ? "document" : "image"
    })
    setError(null)
    e.target.value = ""
  }

  type MessageBubbleProps = Pick<ChatMessage, 'role' | 'content'>

  function MessageBubble({ role, content }: MessageBubbleProps) {
    const isUser = role === 'user'
    return (
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[75%] whitespace-pre-line break-words rounded-2xl px-4 py-3 text-sm shadow-sm ${isUser ? 'bg-gradient-to-r from-slate-900 to-slate-700 text-white' : 'bg-white text-slate-800 ring-1 ring-slate-200'}`} >
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
          if (message.content.startsWith("~~~REFERRAL_DATA") || 
              message.content.startsWith("RPA_STATUS:")) {
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
            accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileChange}
          />

          {/* Attach button */}
          {!attachment ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg p-2 bg-[rgb(25,45,75)] hover:bg-[rgb(186,35,85)] transition-colors"
              title="Attach image, PDF, or DOCX file"
            >
              <Paperclip className="h-5 w-5 text-white" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="rounded-lg border border-red-200 p-1 text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-7 w-7" />
            </button>
          )}

          {!attachment ? (
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type your message or upload a referral letter..."
              className="flex-1 rounded-lg border px-4 py-2 text-sm focus:ring-2 focus:ring-[rgb(25,45,75)] focus:outline-none"
            />
          ) : (
            <div className="flex-1 flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3">
                {attachment.type === "document" ? (
                  <FileText className="h-5 w-5 text-blue-600" />
                ) : (
                  <div className="h-5 w-5 rounded bg-blue-600 flex items-center justify-center text-white text-xs">
                    📷
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-blue-900">{attachment.name}</span>
                  <span className="text-[10px] uppercase tracking-wide text-blue-500">
                    {attachment.sizeLabel} • {attachment.type === "document" ? "DOCUMENT" : "IMAGE"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={(!inputValue.trim() && !attachment) || isLoading}
            className="rounded-lg bg-[rgb(25,45,75)] p-2 hover:bg-[rgb(186,35,85)] disabled:opacity-60 disabled:hover:bg-[rgb(25,45,75)] transition-colors"
          >
            <Send className="h-5 w-5 text-white" />
          </button>
        </div>
      </form>
    </div>
  )
}