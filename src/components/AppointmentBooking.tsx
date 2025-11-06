import React, { useState } from 'react';
import { ArrowLeft, Calendar as CalendarIcon, Clock, User, CheckCircle, Send } from 'lucide-react';
type AppointmentBookingProps = {
  onBack: () => void;
};
type Message = {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
};
type PatientType = 'new' | 'existing' | null;
const doctors = [{
  id: 1,
  name: 'Dr. Rajesh Kumar',
  specialty: 'Cardiologist',
  available: true
}, {
  id: 2,
  name: 'Dr. Priya Sharma',
  specialty: 'Pediatrician',
  available: true
}, {
  id: 3,
  name: 'Dr. Amit Patel',
  specialty: 'Orthopedic',
  available: true
}, {
  id: 4,
  name: 'Dr. Sneha Reddy',
  specialty: 'Dermatologist',
  available: true
}];
const timeSlots = ['09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM'];
export function AppointmentBooking({
  onBack
}: AppointmentBookingProps) {
  const [messages, setMessages] = useState<Message[]>([{
    id: '1',
    text: "I'd be happy to help you book an appointment! Are you a new patient or an existing patient? Please type 'new' or 'existing'.",
    sender: 'agent',
    timestamp: new Date()
  }]);
  const [inputValue, setInputValue] = useState('');
  const [patientType, setPatientType] = useState<PatientType>(null);
  const [patientId, setPatientId] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [step, setStep] = useState<'patient-type' | 'verification' | 'verified' | 'doctor-selection' | 'date-selection' | 'time-selection' | 'confirmation'>('patient-type');
  const addMessage = (text: string, sender: 'user' | 'agent') => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      sender,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newMessage]);
  };
  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    addMessage(inputValue, 'user');
    const userInput = inputValue.toLowerCase().trim();
    setInputValue('');
    // Handle different conversation steps
    setTimeout(() => {
      if (step === 'patient-type') {
        if (userInput.includes('new')) {
          setPatientType('new');
          addMessage("Great! Since you're a new patient, I'll need your phone number to create your profile. Please enter your phone number.", 'agent');
          setStep('verification');
        } else if (userInput.includes('existing')) {
          setPatientType('existing');
          addMessage('Welcome back! Please provide your Patient ID or phone number so I can verify your account.', 'agent');
          setStep('verification');
        } else {
          addMessage("I didn't quite understand that. Please type 'new' if you're a new patient or 'existing' if you're already registered with us.", 'agent');
        }
      } else if (step === 'verification') {
        // Simulate verification
        setPatientId(inputValue);
        setIsVerified(true);
        if (patientType === 'new') {
          addMessage(`Thank you! I've created your patient profile with phone number ${inputValue}. Your Patient ID is PT-2024-${Math.floor(Math.random() * 10000)}.`, 'agent');
        } else {
          addMessage(`Perfect! I've verified your account. Welcome back, Patient ${inputValue}!`, 'agent');
        }
        setTimeout(() => {
          addMessage("Now, let's book your appointment. You can either:\n\n1. Tell me your symptoms and I'll suggest the right doctor\n2. Type the name of a specific doctor you'd like to see\n\nWhat would you prefer?", 'agent');
          setStep('doctor-selection');
        }, 1000);
      } else if (step === 'doctor-selection') {
        // Check if user mentioned a doctor name
        const mentionedDoctor = doctors.find(doc => userInput.includes(doc.name.toLowerCase()));
        if (mentionedDoctor) {
          setSelectedDoctor(mentionedDoctor.id);
          addMessage(`Excellent choice! I'll book you with ${mentionedDoctor.name}, our ${mentionedDoctor.specialty}. What date would you like to schedule your appointment? Please enter a date (e.g., tomorrow, next Monday, or a specific date).`, 'agent');
          setStep('date-selection');
        } else {
          // Assume they're describing symptoms
          addMessage("Based on your symptoms, I'd recommend seeing one of these specialists:\n\n" + doctors.slice(0, 3).map(d => `• ${d.name} - ${d.specialty}`).join('\n') + '\n\nWhich doctor would you like to see? You can type their name or number.', 'agent');
        }
      } else if (step === 'date-selection') {
        // Parse date input (simplified)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setSelectedDate(tomorrow.toISOString().split('T')[0]);
        addMessage(`Great! I'll schedule you for ${tomorrow.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric'
        })}. Here are the available time slots. Please select a time by typing the number or time:`, 'agent');
        setTimeout(() => {
          addMessage(timeSlots.map((time, idx) => `${idx + 1}. ${time}`).join('\n'), 'agent');
          setStep('time-selection');
        }, 500);
      } else if (step === 'time-selection') {
        // Check if user entered a number or time
        const timeIndex = parseInt(userInput) - 1;
        const selectedSlot = timeIndex >= 0 && timeIndex < timeSlots.length ? timeSlots[timeIndex] : timeSlots.find(t => t.toLowerCase().includes(userInput));
        if (selectedSlot) {
          setSelectedTime(selectedSlot);
          const doctor = doctors.find(d => d.id === selectedDoctor);
          addMessage(`Perfect! Let me confirm your appointment:\n\n` + `Doctor: ${doctor?.name} (${doctor?.specialty})\n` + `Date: ${new Date(selectedDate).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          })}\n` + `Time: ${selectedSlot}\n\n` + `Please type 'confirm' to book this appointment or 'change' to modify.`, 'agent');
          setStep('confirmation');
        } else {
          addMessage("I didn't recognize that time slot. Please select a number from the list or type a time like '10:00 AM'.", 'agent');
        }
      } else if (step === 'confirmation') {
        if (userInput.includes('confirm')) {
          addMessage(`🎉 Appointment confirmed! Your booking reference is APT-${Math.floor(Math.random() * 100000)}.\n\n` + `You'll receive a confirmation SMS shortly. Please arrive 15 minutes early and bring your ID.\n\n` + `Is there anything else I can help you with?`, 'agent');
        } else {
          addMessage("No problem! Let's start over. What would you like to change?", 'agent');
          setStep('doctor-selection');
        }
      }
    }, 1000);
  };
  return <div className="h-[calc(100%-80px)] flex flex-col bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white p-4 flex items-center gap-3 border-b border-emerald-600">
        <button onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">Book Appointment</h2>
          <p className="text-sm text-emerald-50">
            {!isVerified ? 'Patient Verification' : 'Schedule your appointment'}
          </p>
        </div>
      </div>
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-emerald-50/30 to-white">
        {messages.map(message => <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg px-4 py-2 ${message.sender === 'user' ? 'bg-gradient-to-br from-blue-500 to-teal-500 text-white' : 'bg-white border border-emerald-200 text-gray-800'}`}>
              <p className="text-sm whitespace-pre-line">{message.text}</p>
              <span className={`text-xs mt-1 block ${message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                {message.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
              </span>
            </div>
          </div>)}
      </div>
      {/* Input Area */}
      <div className="border-t bg-white p-4">
        <div className="flex items-center gap-2">
          <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSendMessage()} placeholder="Type your message..." className="flex-1 px-4 py-2 border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent" />
          <button onClick={handleSendMessage} disabled={!inputValue.trim()} className="p-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:from-gray-300 disabled:to-gray-300 rounded-lg transition-colors" aria-label="Send message">
            <Send className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>;
}