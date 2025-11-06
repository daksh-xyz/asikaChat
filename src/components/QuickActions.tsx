import React from 'react';
import { Calendar, FileText, HelpCircle, AlertCircle } from 'lucide-react';
type QuickActionsProps = {
  onAction: (action: string) => void;
};
export function QuickActions({
  onAction
}: QuickActionsProps) {
  const actions = [{
    id: 'appointment',
    label: 'Book Appointment',
    icon: Calendar,
    color: 'bg-teal-50 text-teal-700 hover:bg-teal-100 border-teal-200'
  }, {
    id: 'register',
    label: 'Register',
    icon: FileText,
    color: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200'
  }, {
    id: 'status',
    label: 'Check Status',
    icon: HelpCircle,
    color: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
  }, {
    id: 'emergency',
    label: 'Emergency',
    icon: AlertCircle,
    color: 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200'
  }];
  return <div className="px-4 py-3 border-t bg-white">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {actions.map(action => {
        const Icon = action.icon;
        return <button key={action.id} onClick={() => onAction(action.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all hover:shadow-sm flex-shrink-0 border ${action.color}`}>
              <Icon className="w-4 h-4" />
              {action.label}
            </button>;
      })}
      </div>
    </div>;
}