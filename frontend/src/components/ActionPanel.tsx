import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { actionsApi } from '../services/api';
import type { ActionType, CaseStatus } from '../types';
import { 
  CheckCircle, 
  XCircle, 
  ArrowUpCircle, 
  FileQuestion,
  Loader2,
  MessageSquare
} from 'lucide-react';
import clsx from 'clsx';

interface ActionPanelProps {
  caseId: string;
  currentStatus: CaseStatus;
  onActionComplete: () => void;
}

export function ActionPanel({ caseId, currentStatus, onActionComplete }: ActionPanelProps) {
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);
  const [notes, setNotes] = useState('');
  const [escalateTo, setEscalateTo] = useState('');
  const [requestedDocs, setRequestedDocs] = useState('');
  const [performedBy, setPerformedBy] = useState('operator');

  const mutation = useMutation({
    mutationFn: (action: ActionType) => {
      setPendingAction(action);
      return actionsApi.perform(caseId, {
        action_type: action,
        performed_by: performedBy,
        notes: notes || undefined,
        escalated_to: escalateTo || undefined,
        requested_documents: requestedDocs || undefined,
      });
    },
    onSuccess: () => {
      setSelectedAction(null);
      setPendingAction(null);
      setNotes('');
      setEscalateTo('');
      setRequestedDocs('');
      onActionComplete();
    },
    onError: () => {
      setPendingAction(null);
    },
  });

  const actions = [
    { type: 'approve' as ActionType, label: 'Approve', icon: CheckCircle, color: 'bg-green-600 hover:bg-green-700 text-white' },
    { type: 'reject' as ActionType, label: 'Reject', icon: XCircle, color: 'bg-red-600 hover:bg-red-700 text-white' },
    { type: 'escalate' as ActionType, label: 'Escalate', icon: ArrowUpCircle, color: 'bg-amber-600 hover:bg-amber-700 text-white' },
    { type: 'request_docs' as ActionType, label: 'Request Docs', icon: FileQuestion, color: 'bg-slate-600 hover:bg-slate-700 text-white' },
    { type: 'add_note' as ActionType, label: 'Add Note', icon: MessageSquare, color: 'bg-blue-600 hover:bg-blue-700 text-white' },
  ];

  const handleAction = (action: ActionType) => {
    if (action === 'approve' && currentStatus === 'awaiting_human') {
      mutation.mutate(action);
    } else {
      setSelectedAction(action);
    }
  };

  const handleSubmit = () => {
    if (selectedAction) mutation.mutate(selectedAction);
  };

  const handleCancel = () => {
    setSelectedAction(null);
    setNotes('');
    setEscalateTo('');
    setRequestedDocs('');
  };

  if (selectedAction) {
    const actionConfig = actions.find(a => a.type === selectedAction);
    
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 capitalize">
            {selectedAction.replace('_', ' ')}
          </span>
          <button onClick={handleCancel} className="text-xs text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-red-500 focus:border-red-500"
          placeholder={
            selectedAction === 'approve' ? 'Approval notes (required for AUSTRAC compliance)...' :
            selectedAction === 'reject' ? 'Rejection reason (required)...' : 
            selectedAction === 'add_note' ? 'Add your notes or comments...' :
            'Notes (optional)...'
          }
          required={selectedAction === 'approve' || selectedAction === 'reject'}
        />

        {selectedAction === 'escalate' && (
          <input
            type="text"
            value={escalateTo}
            onChange={(e) => setEscalateTo(e.target.value)}
            className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-red-500 focus:border-red-500"
            placeholder="Escalate to (required)..."
          />
        )}

        {selectedAction === 'request_docs' && (
          <input
            type="text"
            value={requestedDocs}
            onChange={(e) => setRequestedDocs(e.target.value)}
            className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-md focus:ring-1 focus:ring-red-500 focus:border-red-500"
            placeholder="Documents needed (required)..."
          />
        )}

        <button
          onClick={handleSubmit}
          disabled={mutation.isPending || 
                   (selectedAction === 'approve' && !notes.trim()) || 
                   (selectedAction === 'reject' && !notes.trim()) || 
                   (selectedAction === 'escalate' && !escalateTo) || 
                   (selectedAction === 'request_docs' && !requestedDocs) || 
                   (selectedAction === 'add_note' && !notes.trim())}
          className={clsx(
            'w-full py-2 rounded-md text-sm font-medium flex items-center justify-center gap-1.5 transition-colors',
            actionConfig?.color,
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {mutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              {actionConfig && <actionConfig.icon className="w-4 h-4" />}
              Confirm
            </>
          )}
        </button>

        {mutation.isError && (
          <div className="text-xs text-red-600 space-y-1">
            <p className="font-medium">Request failed</p>
            {mutation.error && 'response' in mutation.error && (mutation.error as any).response?.data?.detail ? (
              <p className="text-red-500">{(mutation.error as any).response.data.detail}</p>
            ) : mutation.error instanceof Error ? (
              <p className="text-red-500">{mutation.error.message}</p>
            ) : (
              <p className="text-red-500">Request failed with status code {(mutation.error as any)?.response?.status || 'unknown'}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          const isPending = mutation.isPending && pendingAction === action.type;
          return (
            <button
              key={action.type}
              onClick={() => handleAction(action.type)}
              disabled={mutation.isPending}
              className={clsx(
                'flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                action.color,
                'disabled:opacity-50'
              )}
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Icon className="w-4 h-4" />
              )}
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
