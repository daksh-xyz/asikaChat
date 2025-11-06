import React, { useState } from 'react';
import { UserPlus, Calendar, Phone, Globe, Shield, Clock } from 'lucide-react';
type WelcomeScreenProps = {
  onAction: (action: string) => void;
};
export function WelcomeScreen({
  onAction
}: WelcomeScreenProps) {
  const [language, setLanguage] = useState('en');
  return <div className="h-[calc(100%-80px)] overflow-y-auto bg-gradient-to-b from-blue-50/50 to-white p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <img src="/Asika.png" alt="Asika Hospital" className="w-20 h-20 mx-auto mb-4 rounded-full shadow-md border-2 border-blue-100" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Welcome to Asika Hospital
        </h2>
        <p className="text-gray-600 text-sm leading-relaxed">
          Your 24/7 healthcare companion. I can help you register, book
          appointments, and answer health questions- either on text, or I can
          call you
        </p>
      </div>
      {/* Language Selection */}
      <div className="mb-6">
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-2 font-medium">
          <Globe className="w-4 h-4 text-teal-600" />
          Select Language
        </label>
        <select value={language} onChange={e => setLanguage(e.target.value)} className="w-full px-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-white">
          <option value="en">English</option>
          <option value="hi">हिन्दी (Hindi)</option>
          <option value="te">తెలుగు (Telugu)</option>
          <option value="ta">தமிழ் (Tamil)</option>
          <option value="kn">ಕನ್ನಡ (Kannada)</option>
        </select>
      </div>
      {/* Quick Action Cards */}
      <div className="space-y-3 mb-6">
        <button onClick={() => onAction('register')} className="w-full bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 border-2 border-blue-300 rounded-lg p-4 transition-all hover:shadow-lg group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center group-hover:bg-blue-600 transition-colors shadow-md">
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <div className="text-left flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">
                I want to register as a patient
              </h3>
              <p className="text-xs text-blue-700">
                Register and upload documents
              </p>
            </div>
          </div>
        </button>
        <button onClick={() => onAction('appointment')} className="w-full bg-gradient-to-br from-emerald-50 to-emerald-100 hover:from-emerald-100 hover:to-emerald-200 border-2 border-emerald-300 rounded-lg p-4 transition-all hover:shadow-lg group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500 rounded-lg flex items-center justify-center group-hover:bg-emerald-600 transition-colors shadow-md">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div className="text-left flex-1">
              <h3 className="font-semibold text-emerald-900 mb-1">
                I want to book an appointment
              </h3>
              <p className="text-xs text-emerald-700">
                Schedule with our specialists
              </p>
            </div>
          </div>
        </button>
        <button onClick={() => onAction('call')} className="w-full bg-gradient-to-br from-amber-50 to-amber-100 hover:from-amber-100 hover:to-amber-200 border-2 border-amber-300 rounded-lg p-4 transition-all hover:shadow-lg group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-500 rounded-lg flex items-center justify-center group-hover:bg-amber-600 transition-colors shadow-md">
              <Phone className="w-6 h-6 text-white" />
            </div>
            <div className="text-left flex-1">
              <h3 className="font-semibold text-amber-900 mb-1">
                I'd like to speak to you
              </h3>
              <p className="text-xs text-amber-700">
                24/7 available - instant connection
              </p>
            </div>
          </div>
        </button>
      </div>
      {/* Features */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="text-center">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-2">
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-xs text-gray-600">24/7 Available</p>
        </div>
        <div className="text-center">
          <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center mx-auto mb-2">
            <Shield className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-xs text-gray-600">HIPAA Secure</p>
        </div>
        <div className="text-center">
          <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center mx-auto mb-2">
            <Globe className="w-5 h-5 text-teal-600" />
          </div>
          <p className="text-xs text-gray-600">Multi-lingual</p>
        </div>
      </div>
      {/* Footer */}
      <div className="text-center text-xs text-gray-500 pt-4 border-t border-gray-200">
        <p>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>;
}