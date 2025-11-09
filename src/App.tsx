import React from 'react';
import { ChatWidget } from './components/ChatWidget';
export function App() {
  return <div className="w-full min-h-screen bg-gradient-to-br from-blue-50 via-white to-teal-50">
    {/* Demo page content */}
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Fertility Plus
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Your trusted healthcare partner. Click the chat icon to get started
          with our AI assistant.
        </p>
        <div className="grid md:grid-cols-3 gap-6 mt-12">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-blue-100 hover:border-blue-200 transition-colors">
            <h3 className="font-semibold text-lg mb-2 text-blue-900">
              24/7 Support
            </h3>
            <p className="text-gray-600">Get instant assistance anytime</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-teal-100 hover:border-teal-200 transition-colors">
            <h3 className="font-semibold text-lg mb-2 text-teal-900">
              Easy Booking
            </h3>
            <p className="text-gray-600">Schedule appointments in minutes</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-emerald-100 hover:border-emerald-200 transition-colors">
            <h3 className="font-semibold text-lg mb-2 text-emerald-900">
              Secure & Private
            </h3>
            <p className="text-gray-600">HIPAA compliant and encrypted</p>
          </div>
        </div>
      </div>
    </div>
    {/* Chat Widget */}
    <ChatWidget />
  </div>;
}