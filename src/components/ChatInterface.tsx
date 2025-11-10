import { Mic, Paperclip, Send, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { triggerPatientRegistrationWorkflow } from '../lib/rpa'
import { Trash2 } from 'lucide-react'
import { TypingIndicator } from './TypingIndicator'

type Role = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: Role
  content: string
}

type RegistrationData = {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: string
  country: string
  phone?: string
  causeOfInfertility?: string
  additionalInfo?: string
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
        `Good Afternoon,\nI'm Maya, your personal Fertility Plus agent.\nI'm here to answer any questions you have about our clinic, or complete your registration as a patient. \nYou can speak to me in any language: English, हिंदी, اَلْعَرَبِيَّةُ and more!`,
    },
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingRegistration, setPendingRegistration] = useState<RegistrationData | null>(null)
  const [awaitingPhone, setAwaitingPhone] = useState(false)
  const [awaitingCause, setAwaitingCause] = useState(false)
  const [awaitingAdditional, setAwaitingAdditional] = useState(false)
  const [waitingForFinalDetails, setWaitingForFinalDetails] = useState(false)
  const [isTriggeringRegistration, setIsTriggeringRegistration] = useState(false)
  const [registrationFeedback, setRegistrationFeedback] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<AttachmentState | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (!pendingRegistration) {
      setAwaitingPhone(false)
      setAwaitingCause(false)
      setAwaitingAdditional(false)
      setWaitingForFinalDetails(false)
    }
  }, [pendingRegistration])

  const handlePhoneCapture = (rawInput: string) => {
    if (!pendingRegistration) {
      return false
    }
    const digitsOnly = rawInput.replace(/\D/g, '')
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      return false
    }
    const updated: RegistrationData = {
      ...pendingRegistration,
      phone: digitsOnly,
    }
    setPendingRegistration(updated)
    setAwaitingPhone(false)
    setRegistrationFeedback(null)
    setError(null)
    setMessages((prev) => [
      ...prev,
      {
        id: `assistant-phone-${Date.now()}`,
        role: 'assistant',
        content: 'Great, I captured your phone number. Let me know when everything looks good so I can proceed.',
      },
    ])
    return true
  }

  const handleCauseCapture = (rawInput: string) => {
    if (!pendingRegistration) {
      return false
    }
    const trimmed = rawInput.trim()
    if (!trimmed) {
      return false
    }
    const updated: RegistrationData = {
      ...pendingRegistration,
      causeOfInfertility: trimmed,
    }
    setPendingRegistration(updated)
    setAwaitingCause(false)
    const needsAdditional = !updated.additionalInfo
    if (waitingForFinalDetails && needsAdditional) {
      setAwaitingAdditional(true)
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-additional-${Date.now()}`,
          role: 'assistant',
          content: 'Appreciate the context. Any other information you would like to share with us?',
        },
      ])
    } else {
      setAwaitingAdditional(false)
      if (waitingForFinalDetails) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-detail-ack-${Date.now()}`,
            role: 'assistant',
            content: 'Thanks for sharing that. One moment while I finish up.',
          },
        ])
      }
    }
    setRegistrationFeedback(null)
    maybeSubmitAfterDetailCapture(updated)
    return true
  }

  const handleAdditionalInfoCapture = (rawInput: string) => {
    if (!pendingRegistration) {
      return false
    }
    const trimmed = rawInput.trim()
    if (!trimmed) {
      return false
    }
    const updated: RegistrationData = {
      ...pendingRegistration,
      additionalInfo: trimmed,
    }
    setPendingRegistration(updated)
    setAwaitingAdditional(false)
    setRegistrationFeedback(null)
    setMessages((prev) => [
      ...prev,
      {
        id: `assistant-confirm-${Date.now()}`,
        role: 'assistant',
        content: waitingForFinalDetails
          ? 'Thanks for the additional information. I will go ahead and notify our team.'
          : 'Got it. Please review all the details and let me know if everything looks good.',
      },
    ])
    maybeSubmitAfterDetailCapture(updated)
    return true
  }

  const maybeSubmitAfterDetailCapture = (updated: RegistrationData) => {
    if (
      waitingForFinalDetails &&
      updated.causeOfInfertility &&
      updated.additionalInfo &&
      updated.phone
    ) {
      setWaitingForFinalDetails(false)
      setAwaitingCause(false)
      setAwaitingAdditional(false)
      void submitRegistrationToRpa(updated)
    }
  }

  const handleRegistrationSave = (updated: RegistrationData) => {
    const digitsOnly = updated.phone ? updated.phone.replace(/\D/g, '') : ''
    const normalized: RegistrationData = {
      ...updated,
      phone: digitsOnly ? digitsOnly : undefined,
      firstName: formatNameCase(updated.firstName),
      lastName: formatNameCase(updated.lastName),
      causeOfInfertility: updated.causeOfInfertility?.trim(),
      additionalInfo: updated.additionalInfo?.trim(),
    }
    setPendingRegistration(normalized)
    setAwaitingPhone(false)
    setAwaitingCause(false)
    setAwaitingAdditional(false)
    setWaitingForFinalDetails(false)
    let nextMessage = 'Updated the registration details. Let me know if everything looks good.'
    if (!normalized.phone) {
      nextMessage = 'Updated the details. Please share the patient phone number so I can complete the registration.'
    } else if (!normalized.causeOfInfertility) {
      nextMessage = 'Updated the details. Please share the cause of infertility or reason for treatment.'
    } else if (!normalized.additionalInfo) {
      nextMessage = 'Updated the details. Please share any additional information you would like us to know.'
    }
    setRegistrationFeedback(nextMessage)
  }

  const submitRegistrationToRpa = async (data: RegistrationData) => {
    if (!data.phone) {
      setRegistrationFeedback('Please share a valid phone number before we complete the registration.')
      return
    }
    if (!data.causeOfInfertility) {
      setRegistrationFeedback('Please share the cause of infertility or reason for treatment.')
      return
    }
    if (!data.additionalInfo) {
      setRegistrationFeedback('Please share any additional information you would like us to know.')
      return
    }

    setWaitingForFinalDetails(false)
    setIsTriggeringRegistration(true)
    setRegistrationFeedback(null)
    try {
      const result = await triggerPatientRegistrationWorkflow({ patientData: data })
      if (result.success) {
        setPendingRegistration(null)
        setAwaitingPhone(false)
        setRegistrationFeedback('Success')
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-rpa-${Date.now()}`,
            role: 'assistant',
            content: 'Thanks for confirming. I have shared your registration details with our onboarding team.',
          },
        ])
      } else {
        setRegistrationFeedback('Failed. Please try again.')
      }
    } catch (err) {
      setRegistrationFeedback('Failed. Please try again.')
    } finally {
      setIsTriggeringRegistration(false)
    }
  }

  const handleConfirmationRequest = () => {
    if (!pendingRegistration) {
      return
    }

    const record = pendingRegistration
    if (!record.phone) {
      setError('Please share the patient phone number before confirming.')
      setAwaitingPhone(true)
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-phone-reminder-${Date.now()}`,
          role: 'assistant',
          content: 'I still need the patient phone number before I can complete the registration.',
        },
      ])
      return
    }

    if (!record.causeOfInfertility) {
      if (!awaitingCause) {
        setWaitingForFinalDetails(true)
        setAwaitingCause(true)
        setRegistrationFeedback('Please share the cause of infertility or reason for treatment.')
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-cause-${Date.now()}`,
            role: 'assistant',
            content: 'Before I finalize things, could you tell me the cause of infertility or reason you need treatment?',
          },
        ])
      }
      return
    }

    if (!record.additionalInfo) {
      if (!awaitingAdditional) {
        setWaitingForFinalDetails(true)
        setAwaitingAdditional(true)
        setRegistrationFeedback('Please share any additional information you would like us to know.')
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-additional-${Date.now()}`,
            role: 'assistant',
            content: 'Thanks! Any additional information you would like to share before I notify the team?',
          },
        ])
      }
      return
    }

    setWaitingForFinalDetails(false)
    void submitRegistrationToRpa(record)
  }

  const sendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault()
    const trimmed = inputValue.trim()
    if ((!trimmed && !attachment) || isLoading) {
      return
    }

    const normalizedInput = trimmed.toLowerCase()
    const shouldConfirmRegistration =
      Boolean(pendingRegistration) && !attachment && normalizedInput === 'yes'
    const shouldRejectRegistration =
      Boolean(pendingRegistration) && !attachment && normalizedInput === 'no'

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

    if (shouldConfirmRegistration) {
      handleConfirmationRequest()
    } else if (shouldRejectRegistration && pendingRegistration) {
      setWaitingForFinalDetails(false)
      setAwaitingCause(false)
      setAwaitingAdditional(false)
      setRegistrationFeedback('No problem. Use the Edit button or tell me what needs to change.')
    }

    try {
      const body: Record<string, unknown> = {
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
      }

      if (awaitingPhone && !attachment) {
        const handled = handlePhoneCapture(trimmed)
        setIsLoading(false)
        setAttachment(null)
        if (!handled) {
          setError('Please enter a valid phone number containing 7-15 digits.')
        }
        return
      }

      if (awaitingCause && !attachment) {
        const handled = handleCauseCapture(trimmed)
        setIsLoading(false)
        setAttachment(null)
        if (!handled) {
          setError('Please describe the cause of infertility or reason for treatment.')
        }
        return
      }

      if (awaitingAdditional && !attachment) {
        const handled = handleAdditionalInfoCapture(trimmed)
        setIsLoading(false)
        setAttachment(null)
        if (!handled) {
          setError('Please share any additional information you would like us to know.')
        }
        return
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

      let assistantReply = data.reply.trim()
      const extracted = extractRegistrationDataFromContent(assistantReply)
      if (extracted) {
        setPendingRegistration({
          ...extracted,
          causeOfInfertility: '',
          additionalInfo: '',
        })
        setAwaitingPhone(true)
        setAwaitingCause(false)
        setAwaitingAdditional(false)
        setRegistrationFeedback(null)
        assistantReply =
          'I extracted the details from your document. Please review them below and share the patient phone number so I can continue.'
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: assistantReply,
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

  const followUpPrompt =
    waitingForFinalDetails && awaitingCause
      ? 'Before I finalize things, could you tell me the cause of infertility or reason you need treatment?'
      : waitingForFinalDetails && awaitingAdditional
        ? 'Thanks! Any additional information you would like to share before I notify the team?'
        : null

  return (
    <div className="flex h-[calc(100%-96px)] flex-col justify-between bg-white">
      <div className="flex-1 overflow-y-auto space-y-4 bg-slate-50 p-4">
        {renderedMessages}
        {isLoading && (
          <div className="flex justify-start">
            <TypingIndicator />
          </div>
        )}
        {pendingRegistration && (
          <>
            <RegistrationReviewCard
              data={pendingRegistration}
              awaitingPhone={awaitingPhone}
              isCollectingFinalDetails={waitingForFinalDetails}
              isSubmitting={isTriggeringRegistration}
              feedback={registrationFeedback}
              onConfirm={handleConfirmationRequest}
              onSave={handleRegistrationSave}
            />
            {followUpPrompt && <FollowUpPrompt prompt={followUpPrompt} />}
          </>
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
            {!attachment ? (
              <button
                type="button"
                onClick={handleAttachClick}
                className="rounded-lg p-2 transition-colors hover:bg-blue-50"
                aria-label="Attach file"
              >
                <Paperclip className="h-5 w-5 text-[rgb(206,40,95)]" />
              </button>) :
              (
                <button
                  type="button"
                  onClick={handleRemoveAttachment}
                  className="rounded-lg border border-red-100 p-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 />
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
              <Mic className="h-5 w-5 text-[rgb(206,40,95)]" />
            </button>
            <button
              type="submit"
              disabled={(!inputValue.trim() && !attachment) || isLoading}
              className="rounded-lg bg-[rgb(206,40,95)] p-2 transition-color disabled:from-gray-300 disabled:to-gray-300"
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

type RegistrationReviewCardProps = {
  data: RegistrationData
  awaitingPhone: boolean
  isCollectingFinalDetails: boolean
  isSubmitting: boolean
  feedback: string | null
  onConfirm: () => void
  onSave: (updated: RegistrationData) => void
}

function RegistrationReviewCard({
  data,
  awaitingPhone,
  isCollectingFinalDetails,
  isSubmitting,
  feedback,
  onConfirm,
  onSave,
}: RegistrationReviewCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [draft, setDraft] = useState<RegistrationData>({ ...data })

  useEffect(() => {
    setDraft({ ...data })
    setIsEditing(false)
    setEditError(null)
  }, [data])

  const fieldConfigs: Array<{ key: keyof RegistrationData; label: string; placeholder?: string }> = [
    { key: 'firstName', label: 'First Name', placeholder: 'Jane' },
    { key: 'lastName', label: 'Last Name', placeholder: 'Doe' },
    { key: 'dateOfBirth', label: 'Date of Birth', placeholder: '1996-04-15' },
    { key: 'gender', label: 'Gender', placeholder: 'Female' },
    { key: 'country', label: 'Country', placeholder: 'India' },
    { key: 'phone', label: 'Phone', placeholder: '+91 98765 43210' },
  ]

  const handleDraftChange = (key: keyof RegistrationData, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const handleSave = () => {
    const missingField = REQUIRED_REGISTRATION_KEYS.find((key) => !String(draft[key] || '').trim())
    if (missingField) {
      setEditError('Please fill out all required fields before saving.')
      return
    }
    const phoneDigits = draft.phone ? draft.phone.replace(/\D/g, '') : ''
    if (draft.phone && (phoneDigits.length < 7 || phoneDigits.length > 15)) {
      setEditError('Phone numbers should contain 7-15 digits.')
      return
    }

    setEditError(null)
    onSave({
      ...draft,
      phone: phoneDigits ? phoneDigits : undefined,
    })
    setIsEditing(false)
  }

  const missingPhone = !data.phone

  const confirmDisabled =
    awaitingPhone ||
    isCollectingFinalDetails ||
    missingPhone ||
    isSubmitting

  return (
    <div className="rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-blue-100">
      <div className="mb-3 flex items-center gap-2 text-blue-700">
        <CheckCircle className="h-4 w-4" />
        <span className="font-semibold">Confirm extracted details</span>
      </div>

      {isEditing ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {fieldConfigs.map(({ key, label, placeholder }) => (
            <label key={label} className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              {label}
              <input
                type={key === 'phone' ? 'tel' : 'text'}
                value={(draft[key] as string) || ''}
                placeholder={placeholder}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                onChange={(event) => handleDraftChange(key, event.target.value)}
              />
            </label>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {fieldConfigs.map(({ label, key }) => (
            <div key={label} className="rounded-xl bg-blue-50/60 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-blue-500">{label}</p>
              <p className="font-medium text-blue-900">{(data[key] as string) || '—'}</p>
            </div>
          ))}
        </div>
      )}

      {(data.causeOfInfertility || data.additionalInfo) && (
        <div className="mt-3 space-y-2">
          {data.causeOfInfertility && (
            <div className="rounded-xl bg-emerald-50/70 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-emerald-600">
                Cause of Infertility / Reason for Treatment
              </p>
              <p className="text-sm text-emerald-900">{data.causeOfInfertility}</p>
            </div>
          )}
          {data.additionalInfo && (
            <div className="rounded-xl bg-amber-50/70 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-amber-600">Additional Information</p>
              <p className="text-sm text-amber-900">{data.additionalInfo}</p>
            </div>
          )}
        </div>
      )}

      {missingPhone && !isEditing && (
        <p className="mt-3 text-xs text-amber-600">
          Please share the patient&apos;s phone number so I can finish the registration.
        </p>
      )}
      {isCollectingFinalDetails && !isEditing && (
        <p className="mt-2 text-xs text-blue-600">
          I&apos;m just capturing the final details from our chat before I notify the team.
        </p>
      )}

      {editError && (
        <p className="mt-3 text-xs font-medium text-red-600">
          {editError}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {isEditing ? (
          <>
            <button
              type="button"
              onClick={() => {
                setDraft({ ...data })
                setIsEditing(false)
                setEditError(null)
              }}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 rounded-lg bg-gradient-to-r from-blue-500 to-teal-500 px-3 py-2 font-semibold text-white transition"
            >
              Save changes
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Edit details
          </button>
        )}
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className="flex-1 rounded-lg bg-gradient-to-r from-blue-500 to-teal-500 px-3 py-2 font-semibold text-white transition disabled:opacity-60"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Submitting…
            </span>
          ) : confirmDisabled && awaitingPhone ? (
            'Waiting for phone'
          ) : (
            'Looks good'
          )}
        </button>
      </div>
      {feedback && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />
          <span>{feedback}</span>
        </div>
      )}
    </div>
  )
}

const REQUIRED_REGISTRATION_KEYS = ['firstName', 'lastName', 'dateOfBirth', 'gender', 'country'] as const

function FollowUpPrompt({ prompt }: { prompt: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 px-4 py-3 text-sm text-blue-900">
      <p className="font-semibold">One more thing…</p>
      <p>{prompt}</p>
    </div>
  )
}

function extractRegistrationDataFromContent(content: string): RegistrationData | null {
  const candidates: string[] = []
  const sanitized = stripCodeFence(content)
  if (sanitized.startsWith('{') && sanitized.endsWith('}')) {
    candidates.push(sanitized)
  }

  const objectMatch = content.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    candidates.push(objectMatch[0])
  }

  for (const snippet of candidates) {
    try {
      const parsed = JSON.parse(snippet)
      if (!isPlainObject(parsed)) {
        continue
      }
      const missingField = REQUIRED_REGISTRATION_KEYS.find((key) => !(key in parsed))
      if (missingField) {
        continue
      }
      return {
        firstName: formatNameCase(parsed.firstName),
        lastName: formatNameCase(parsed.lastName),
        dateOfBirth: toStringValue(parsed.dateOfBirth),
        gender: toStringValue(parsed.gender),
        country: toStringValue(parsed.country),
        phone: undefined,
        causeOfInfertility: '',
        additionalInfo: '',
      }
    } catch {
      continue
    }
  }

  return null
}

function stripCodeFence(value: string) {
  return value.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toStringValue(value: unknown) {
  if (value === null || value === undefined) {
    return ''
  }
  return typeof value === 'string' ? value : String(value)
}

function formatNameCase(value: unknown) {
  const text = toStringValue(value).trim()
  if (!text) {
    return ''
  }
  const lower = text.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
