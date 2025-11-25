import React, { useState } from 'react';
import { X, Minimize2 } from 'lucide-react';
import { ChatInterface } from './ChatInterface';
export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  return <>
    {/* Floating Widget Button */}
    {!isOpen && <button onClick={() => setIsOpen(true)} className="fixed bottom-6 right-6 w-16 h-16 bg-[rgb(25,45,75)] rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-105 z-50" aria-label="Open chat">
      <img src="/Ramsay.png" alt="Asika Chat" className="w-10 h-10 rounded-full" />
      <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white" />
    </button>}
    {/* Expanded Chat Window */}
    {isOpen && <div className={`fixed top-20 right-2 bg-white rounded-lg shadow-xl transition-all duration-300 z-50 border border-blue-100 ${isMinimized ? 'w-80 h-16' : 'w-[420px] h-[calc(100vh-120px)]'} max-w-[95vw] max-h-[100vh]`}>
      {/* Header */}
      <div className="bg-[rgb(25,45,75)] text-white p-4 rounded-t-lg flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/Ramsay.png" alt="Asika" className="w-10 h-10 rounded-full border-2 border-white/30" />
          <div>
            <h3 className="font-semibold text-lg">Ramsay Health Care</h3>
            <div className="flex items-center gap-1 text-xs text-blue-50">
              <span className="w-2 h-2 bg-emerald-300 rounded-full" />
              <span>Online</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsMinimized(!isMinimized)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors" aria-label="Minimize">
            <Minimize2 className="w-5 h-5" />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors" aria-label="Close chat">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      {/* Chat Interface */}
      {!isMinimized && <ChatInterface />}
    </div>}
  </>;
}