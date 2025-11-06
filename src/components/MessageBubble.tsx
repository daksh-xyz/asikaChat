import React from 'react';
import { Check, CheckCheck } from 'lucide-react';
type Message = {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
  type?: 'text' | 'image' | 'document';
};
type MessageBubbleProps = {
  message: Message;
};
export function MessageBubble({
  message
}: MessageBubbleProps) {
  const isUser = message.sender === 'user';
  return <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : 'order-1'}`}>
        {!isUser && <div className="flex items-center gap-2 mb-1">
            <img src="/Asika.png" alt="Agent" className="w-6 h-6 rounded-full" />
            <span className="text-xs text-gray-600 font-medium">
              Asika Assistant
            </span>
          </div>}
        <div className={`rounded-lg px-4 py-2.5 shadow-sm ${isUser ? 'bg-gradient-to-br from-blue-500 to-teal-500 text-white' : 'bg-white text-gray-800 border border-blue-100'}`}>
          <p className="text-sm leading-relaxed">{message.text}</p>
        </div>
        <div className={`flex items-center gap-1 mt-1 text-xs text-gray-500 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span>
            {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
          </span>
          {isUser && <CheckCheck className="w-3 h-3 text-blue-300" />}
        </div>
      </div>
    </div>;
}