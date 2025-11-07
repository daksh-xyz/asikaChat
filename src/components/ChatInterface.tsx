import React, { useEffect, useState, useRef } from 'react';
import { Send, Paperclip, Mic, Upload, Camera, ArrowLeft } from 'lucide-react';
import { normalizeDOB } from '@/lib/date';
import { groqCall } from '@/lib/assistant';
import { savePatientData } from '@/lib/supabase';
import { triggerPatientRegistrationWorkflow } from '@/lib/rpa';
import { WelcomeScreen } from './WelcomeScreen';
import { MessageBubble } from './MessageBubble';
import { QuickActions } from './QuickActions';
import { TypingIndicator } from './TypingIndicator';
import { AppointmentBooking } from './AppointmentBooking';
type Message = {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
  type?: 'text' | 'image' | 'document' | 'extracted-info';
  extractedData?: {
    firstName: string;
    lastName: string;
    phone?: number;
    dateOfBirth: string;
    gender: string;
    country: string;
  };
};
type CorrectionField = 'firstName' | 'lastName' | 'dateOfBirth' | 'gender' | 'country' | 'phone';

type ChatMode =
  | 'welcome'
  | 'chat'
  | 'registration'
  | 'appointment'
  | 'awaiting-document'
  | 'awaiting-gender'
  | 'awaiting-country'
  | 'awaiting-phone'
  | 'awaiting-field-selection'
  | 'awaiting-field-input'
  | 'confirming-info';
export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [mode, setMode] = useState<ChatMode>('welcome');
  const [extractedInfo, setExtractedInfo] = useState<any>(null);
  const [correctionField, setCorrectionField] = useState<CorrectionField | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const correctionOptions: Array<{ key: CorrectionField; label: string }> = [
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'dateOfBirth', label: 'Date of Birth' },
    { key: 'gender', label: 'Gender' },
    { key: 'country', label: 'Country' },
    { key: 'phone', label: 'Phone Number' }
  ];
  const correctionLabelMap: Record<CorrectionField, string> = {
    firstName: 'first name',
    lastName: 'last name',
    dateOfBirth: 'date of birth',
    gender: 'gender',
    country: 'country',
    phone: 'phone number'
  };

  async function callGroqAPI(payload: any) {
    return groqCall(payload);
  }
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth'
    });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    const newMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
      type: 'text'
    };
    setMessages(prev => [...prev, newMessage]);
    const userText = inputValue;
    setInputValue('');
    // Handle confirmation during registration
    if (mode === 'confirming-info') {
      const lowerInput = userText.toLowerCase();
      if (lowerInput.includes('yes') || lowerInput.includes('correct')) {
        handleConfirmRegistration();
        return;
      }
      if (lowerInput.includes('no') || lowerInput.includes('incorrect')) {
        const askCorrection: Message = {
          id: Date.now().toString(),
          text: 'No problem. Which detail should we correct? Please tap a field below.',
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, askCorrection]);
        setCorrectionField(null);
        setMode('awaiting-field-selection');
        return;
      }
    }
    if (mode === 'awaiting-field-input' && correctionField) {
      const text = userText.trim();
      const updated = { ...(extractedInfo || {}) } as any;

      const presentUpdatedInfo = (info: any) => {
        setExtractedInfo(info);
        setInputValue('');
        const summaryIntro: Message = {
          id: Date.now().toString(),
          text: "Thanks! Here's the updated information:",
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        const infoMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: '',
          sender: 'agent',
          timestamp: new Date(),
          type: 'extracted-info',
          extractedData: info
        };
        const confirmMessage: Message = {
          id: (Date.now() + 2).toString(),
          text: "Is everything correct now? Reply 'yes' or 'no'.",
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, summaryIntro, infoMessage, confirmMessage]);
        setCorrectionField(null);
        setMode('confirming-info');
      };

      if (!text) {
        const retry: Message = {
          id: Date.now().toString(),
          text: `Please enter the correct ${correctionLabelMap[correctionField]}.`,
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, retry]);
        return;
      }

      switch (correctionField) {
        case 'phone': {
          const digits = text.replace(/\D+/g, '');
          if (digits.length < 7 || digits.length > 15) {
            const retry: Message = {
              id: Date.now().toString(),
              text: 'Please enter a valid phone number (7-15 digits).',
              sender: 'agent',
              timestamp: new Date(),
              type: 'text'
            };
            setMessages(prev => [...prev, retry]);
            return;
          }
          updated.phone = Number(digits);
          presentUpdatedInfo(updated);
          return;
        }
        case 'gender': {
          const g = text.toLowerCase();
          if (g === 'm' || g === 'male') {
            updated.gender = 'Male';
          } else if (g === 'f' || g === 'female') {
            updated.gender = 'Female';
          } else {
            const retry: Message = {
              id: Date.now().toString(),
              text: "Please reply with 'Male' or 'Female'.",
              sender: 'agent',
              timestamp: new Date(),
              type: 'text'
            };
            setMessages(prev => [...prev, retry]);
            return;
          }
          presentUpdatedInfo(updated);
          return;
        }
        case 'dateOfBirth': {
          updated.dateOfBirth = normalizeDOB(text);
          presentUpdatedInfo(updated);
          return;
        }
        case 'firstName':
        case 'lastName': {
          updated[correctionField] = text.trim();
          presentUpdatedInfo(updated);
          return;
        }
        case 'country': {
          updated.country = text.trim();
          presentUpdatedInfo(updated);
          return;
        }
        default:
          break;
      }
      return;
    }
    if (mode === 'awaiting-field-selection') {
      const reminder: Message = {
        id: Date.now().toString(),
        text: 'Please select the detail you want to correct by tapping one of the buttons above.',
        sender: 'agent',
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, reminder]);
      return;
    }
    // Collect gender if awaited
    if (mode === 'awaiting-gender') {
      const g = userText.trim().toLowerCase();
      let gender: string | null = null;
      if (g === 'm' || g === 'male') gender = 'Male';
      if (g === 'f' || g === 'female') gender = 'Female';
      if (!gender) {
        const again: Message = {
          id: Date.now().toString(),
          text: "Please reply with 'Male' or 'Female'.",
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, again]);
        return;
      }
      const updated = { ...(extractedInfo || {}), gender };
      setExtractedInfo(updated);
      // Next: country or phone
      if (!updated.country) {
        const askCountry: Message = {
          id: Date.now().toString(),
          text: 'Which country are you from? Please provide the country name.',
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, askCountry]);
        setMode('awaiting-country');
      } else {
        const askPhone: Message = {
          id: Date.now().toString(),
          text: 'Please share your phone number (digits only).',
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, askPhone]);
        setMode('awaiting-phone');
      }
      return;
    }
    // Collect country if awaited
    if (mode === 'awaiting-country') {
      const country = userText.trim();
      if (!country) {
        const again: Message = {
          id: Date.now().toString(),
          text: 'Please provide your country name.',
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, again]);
        return;
      }
      const updated = { ...(extractedInfo || {}), country };
      setExtractedInfo(updated);
      const askPhone: Message = {
        id: Date.now().toString(),
        text: 'Please share your phone number (digits only).',
        sender: 'agent',
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, askPhone]);
      setMode('awaiting-phone');
      return;
    }
    // If we are collecting phone, handle it locally (no model call)
    if (mode === 'awaiting-phone') {
      const digits = userText.replace(/\D+/g, '');
      if (digits.length < 7 || digits.length > 15) {
        const askAgain: Message = {
          id: Date.now().toString(),
          text: 'Please enter a valid phone number (digits only).',
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, askAgain]);
        return;
      }
      setIsTyping(true);
      setTimeout(() => {
        const merged = { ...(extractedInfo || {}), phone: Number(digits) };
        setExtractedInfo(merged);
        const extractedMessage: Message = {
          id: Date.now().toString(),
          text: "Great! Here's the information I have:",
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        const infoMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: '',
          sender: 'agent',
          timestamp: new Date(),
          type: 'extracted-info',
          extractedData: merged
        };
        const confirmMessage: Message = {
          id: (Date.now() + 2).toString(),
          text: "Is this information correct? Reply 'yes' to confirm or 'no' to correct.",
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, extractedMessage, infoMessage, confirmMessage]);
        setMode('confirming-info');
        setIsTyping(false);
      }, 400);
      return;
    }
    // Outside of the strict workflow: do not handle general texts
    const workflowOnly: Message = {
      id: Date.now().toString(),
      text: 'I can only help with the current workflow.',
      sender: 'agent',
      timestamp: new Date(),
      type: 'text'
    };
    setMessages(prev => [...prev, workflowOnly]);
    // Do not auto-advance or change modes here; user must use the UI (e.g., Register button or upload document when prompted)
    return;
  };
  const handleConfirmRegistration = async () => {
    setIsTyping(true);
    
    try {
      // Save patient data to Supabase
      const result = await savePatientData(extractedInfo);
      
      if (result.success) {
        // Trigger the RPA workflow asynchronously; do not block the user flow.
        void triggerPatientRegistrationWorkflow({
          patientId: result.patientId,
          patientData: extractedInfo ?? undefined,
        }).catch(error => {
          console.error('Failed to trigger RPA workflow', error);
        });

        const successMessage: Message = {
          id: Date.now().toString(),
          text: `Perfect! Your registration has been completed successfully. Your patient ID is ${result.patientId}. You can now book appointments or ask me any health-related questions. How else can I help you today?`,
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, successMessage]);
        setMode('chat');
      } else {
        const errorMessage: Message = {
          id: Date.now().toString(),
          text: `I'm sorry, there was an issue saving your registration: ${result.error}. Please try again or contact support.`,
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        text: 'An unexpected error occurred while saving your registration. Please try again.',
        sender: 'agent',
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, errorMessage]);
      console.error('Error during registration:', error);
    } finally {
      setIsTyping(false);
    }
  };
  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Add user message showing document uploaded
      const uploadMessage: Message = {
        id: Date.now().toString(),
        text: `📎 Uploaded: ${file.name}`,
        sender: 'user',
        timestamp: new Date(),
        type: 'document'
      };
      setMessages(prev => [...prev, uploadMessage]);
      // Read file as data URL
      const toDataURL = (f: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });

      setIsTyping(true);
      try {
        const dataUrl = await toDataURL(file);
        const processingMessage: Message = {
          id: Date.now().toString(),
          text: "I'm processing your document with OCR...",
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, processingMessage]);

        const { reply } = await callGroqAPI({ image: { dataUrl }, task: 'extract_id' });

        // Try to parse the reply as JSON
        let parsed: any | null = null;
        try {
          // Extract JSON if model wrapped it in code fences
          const jsonText = (reply || '').match(/\{[\s\S]*\}/)?.[0] || reply;
          parsed = JSON.parse(jsonText);
        } catch { }

        // Normalize to desired schema in case model returns fullName or other keys
        const normalizeToSchema = (p: any) => {
          if (!p || typeof p !== 'object') return null;
          let firstName = String(p.firstName || '').trim();
          let lastName = String(p.lastName || '').trim();
          const fullName = String(p.fullName || p.name || '').trim();
          if ((!firstName || !lastName) && fullName) {
            const parts = fullName.split(/\s+/).filter(Boolean);
            if (parts.length === 1) {
              firstName = parts[0];
              lastName = '';
            } else if (parts.length > 1) {
              firstName = firstName || parts[0];
              lastName = lastName || parts.slice(1).join(' ');
            }
          }
          const dateOfBirth = normalizeDOB(String(p.dateOfBirth || p.dob || p.DOB || '').trim());
          let gender = String(p.gender || '').trim();
          // Map short codes to canonical values
          const g = gender.toLowerCase();
          if (g === 'm' || g === 'male') gender = 'Male';
          else if (g === 'f' || g === 'female') gender = 'Female';
          const country = String(p.country || '').trim();
          if (!firstName && !lastName && !dateOfBirth && !gender && !country) return null;
          return { firstName, lastName, dateOfBirth, gender, country };
        };

        const normalized = normalizeToSchema(parsed);

        if (normalized) {
          const info = normalized;
          setExtractedInfo(info);
          // Ask for any missing fields, one at a time: gender -> country -> phone
          if (!info.gender) {
            const askGender: Message = {
              id: Date.now().toString(),
              text: 'What is your gender? Please reply Male or Female.',
              sender: 'agent',
              timestamp: new Date(),
              type: 'text'
            };
            setMessages(prev => [...prev, askGender]);
            setMode('awaiting-gender');
          } else if (!info.country) {
            const askCountry: Message = {
              id: Date.now().toString(),
              text: 'Which country are you from? Please provide the country name.',
              sender: 'agent',
              timestamp: new Date(),
              type: 'text'
            };
            setMessages(prev => [...prev, askCountry]);
            setMode('awaiting-country');
          } else {
            const nextMessage: Message = {
              id: Date.now().toString(),
              text: 'Thanks! I have your name, DOB, gender, and country. Please share your phone number (digits only) to continue.',
              sender: 'agent',
              timestamp: new Date(),
              type: 'text'
            };
            setMessages(prev => [...prev, nextMessage]);
            setMode('awaiting-phone');
          }
        } else {
          const fallback: Message = {
            id: Date.now().toString(),
            text: reply || 'I could not confidently extract your details. Please try a clearer photo.',
            sender: 'agent',
            timestamp: new Date(),
            type: 'text'
          };
          setMessages(prev => [...prev, fallback]);
        }
      } catch (err) {
        const errMsg: Message = {
          id: Date.now().toString(),
          text: 'Sorry, there was an error processing your document.',
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, errMsg]);
      } finally {
        setIsTyping(false);
      }
    }
  };
  const handleQuickAction = (action: string) => {
    if (action === 'register') {
      setMode('awaiting-document');
      const registrationMessage: Message = {
        id: Date.now().toString(),
        text: "Great! Let's get you registered. I'll need some information from you.",
        sender: 'agent',
        timestamp: new Date(),
        type: 'text'
      };
      setMessages([registrationMessage]);
      setTimeout(() => {
        const documentRequest: Message = {
          id: (Date.now() + 1).toString(),
          text: 'Please upload a photo of your identity card (Aadhar Card, Driving License, or Passport). You can attach a file or use your camera to scan it.',
          sender: 'agent',
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, documentRequest]);
      }, 1000);
    } else if (action === 'appointment') {
      setMode('appointment');
    } else if (action === 'call') {
      setMode('chat');
      const callMessage: Message = {
        id: Date.now().toString(),
        text: "I'll connect you with our healthcare team right away. Please hold for a moment while I initiate the call...",
        sender: 'agent',
        timestamp: new Date(),
        type: 'text'
      };
      setMessages([callMessage]);
    } else if (action === 'chat') {
      setMode('chat');
      const welcomeMessage: Message = {
        id: Date.now().toString(),
        text: "Hello! I'm your Asika healthcare assistant. How can I help you today?",
        sender: 'agent',
        timestamp: new Date(),
        type: 'text'
      };
      setMessages([welcomeMessage]);
    }
  };
  const handleCorrectionSelection = (field: CorrectionField) => {
    setCorrectionField(field);
    setMode('awaiting-field-input');
    setInputValue('');
    const prompt: Message = {
      id: Date.now().toString(),
      text: `Please enter the correct ${correctionLabelMap[field]}.`,
      sender: 'agent',
      timestamp: new Date(),
      type: 'text'
    };
    setMessages(prev => [...prev, prompt]);
  };
  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };
  if (mode === 'welcome') {
    return <WelcomeScreen onAction={handleQuickAction} />;
  }
  if (mode === 'appointment') {
    return <AppointmentBooking onBack={() => setMode('welcome')} />;
  }
  const inputPlaceholder = (() => {
    if (mode === 'confirming-info') {
      return "Type 'yes' to confirm or 'no' to correct.";
    }
    if (mode === 'awaiting-field-selection') {
      return 'Tap a field above to choose what to update.';
    }
    if (mode === 'awaiting-field-input' && correctionField) {
      return `Type the correct ${correctionLabelMap[correctionField]}.`;
    }
    if (mode === 'awaiting-phone') {
      return 'Enter your phone number (digits only).';
    }
    return 'Type your message...';
  })();
  return <div className="flex flex-col h-[calc(100%-80px)]">
    {/* Back Button - Show during registration flows */}
    {(mode === 'awaiting-document' || mode === 'awaiting-phone' || mode === 'awaiting-field-selection' || mode === 'awaiting-field-input' || mode === 'confirming-info') && <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
      <button onClick={() => {
        setMode('welcome');
        setMessages([]);
        setExtractedInfo(null);
      }} className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm font-medium">Back to Main Menu</span>
      </button>
    </div>}
    {/* Emergency Banner */}
    <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-900">
      <span className="font-semibold">Emergency?</span> Call 911 or visit ER
      immediately
    </div>
    {/* Messages Area */}
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-blue-50/30 to-white">
      {messages.map(message => {
        if (message.type === 'extracted-info' && message.extractedData) {
          return <div key={message.id} className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="max-w-[80%]">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-blue-900 min-w-[120px]">
                      First Name:
                    </span>
                    <span className="text-gray-900">
                      {message.extractedData.firstName}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-blue-900 min-w-[120px]">
                      Last Name:
                    </span>
                    <span className="text-gray-900">
                      {message.extractedData.lastName}
                    </span>
                  </div>
                  {message.extractedData.phone !== undefined && (
                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-blue-900 min-w-[120px]">
                        Phone Number:
                      </span>
                      <span className="text-gray-900">
                        {message.extractedData.phone}
                      </span>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-blue-900 min-w-[120px]">
                      Date of Birth:
                    </span>
                    <span className="text-gray-900">
                      {message.extractedData.dateOfBirth}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-blue-900 min-w-[120px]">
                      Gender:
                    </span>
                    <span className="text-gray-900">
                      {message.extractedData.gender}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-blue-900 min-w-[120px]">
                      Country:
                    </span>
                    <span className="text-gray-900">
                      {message.extractedData.country}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>;
        }
        return <MessageBubble key={message.id} message={message} />;
      })}
      {isTyping && <TypingIndicator />}
      <div ref={messagesEndRef} />
    </div>
    {/* Document Upload Section - Show when awaiting document */}
    {mode === 'awaiting-document' && <div className="px-4 py-3 bg-blue-50 border-t border-blue-100">
      <div className="flex gap-2 justify-center">
        <input type="file" ref={fileInputRef} onChange={handleDocumentUpload} className="hidden" accept="image/*,.pdf" />
        <button onClick={handleFileUpload} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-teal-500 hover:from-blue-600 hover:to-teal-600 text-white rounded-lg flex items-center gap-2 transition-colors">
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
        <button onClick={handleFileUpload} className="px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white rounded-lg flex items-center gap-2 transition-colors">
          <Camera className="w-4 h-4" />
          Scan with Camera
        </button>
      </div>
    </div>}
    {/* Correction field selection */}
    {mode === 'awaiting-field-selection' && <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
        <p className="text-sm text-amber-900 font-medium">Select the detail you want to update:</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {correctionOptions.map(option => (
          <button key={option.key} onClick={() => handleCorrectionSelection(option.key)} className="px-3 py-1.5 bg-white border border-amber-200 text-amber-800 rounded-full text-sm hover:bg-amber-100 transition-colors">
              {option.label}
            </button>
          ))}
        </div>
      </div>}
    {/* Quick Actions */}
    {messages.length > 0 && mode === 'chat' && <QuickActions onAction={handleQuickAction} />}
    {/* Input Area */}
    <div className="border-t bg-white p-4">
      <div className="flex items-center gap-2">
        <input type="file" ref={fileInputRef} onChange={handleDocumentUpload} className="hidden" accept="image/*,.pdf,.doc,.docx" />
        <button onClick={handleFileUpload} className="p-2 hover:bg-blue-50 rounded-lg transition-colors" aria-label="Attach file">
          <Paperclip className="w-5 h-5 text-blue-600" />
        </button>
        <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendMessage()} placeholder={inputPlaceholder} className="flex-1 px-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" />
        <button onClick={handleSendMessage} className="p-2 hover:bg-teal-50 rounded-lg transition-colors" aria-label="Voice input">
          <Mic className="w-5 h-5 text-teal-600" />
        </button>
        <button onClick={handleSendMessage} disabled={mode === 'awaiting-field-selection' || !inputValue.trim()} className="p-2 bg-gradient-to-r from-blue-500 to-teal-500 hover:from-blue-600 hover:to-teal-600 disabled:from-gray-300 disabled:to-gray-300 rounded-lg transition-colors" aria-label="Send message">
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>
      <div className="flex items-center justify-center gap-2 mt-2 text-xs text-gray-500">
        <span className="w-2 h-2 bg-emerald-500 rounded-full" />
        <span>Secure & HIPAA Compliant</span>
      </div>
    </div>
  </div>;
}
