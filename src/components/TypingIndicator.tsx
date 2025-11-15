import React from 'react';
export function TypingIndicator() {
  return <div className="flex justify-start animate-in fade-in duration-300">
    <div className="flex items-center gap-2 bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-200">
      <img src="/Asika.png" alt="Agent" className="w-6 h-6 rounded-full" />
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{
          animationDelay: '0ms'
        }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{
          animationDelay: '150ms'
        }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{
          animationDelay: '300ms'
        }} />
      </div>
    </div>
  </div>;
}