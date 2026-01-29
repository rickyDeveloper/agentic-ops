import { useQuery } from '@tanstack/react-query';
import { casesApi } from '../services/api';
import { format, parseISO } from 'date-fns';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  User,
  Bot,
  FileText
} from 'lucide-react';
import clsx from 'clsx';

interface AuditTrailProps {
  caseId: string;
}

export function AuditTrail({ caseId }: AuditTrailProps) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['auditTrail', caseId],
    queryFn: () => casesApi.getAuditTrail(caseId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="w-8 h-8 bg-slate-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-1/2" />
              <div className="h-3 bg-slate-200 rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">
        No audit trail entries yet.
      </div>
    );
  }

  const getStepIcon = (stepName: string, performedBy?: string) => {
    if (performedBy === 'ai' || stepName.toLowerCase().includes('extraction') || stepName.toLowerCase().includes('review')) {
      return { icon: Bot, color: 'bg-slate-100 text-slate-600' };
    }
    if (stepName.toLowerCase().includes('approve') || stepName.toLowerCase().includes('verified')) {
      return { icon: CheckCircle, color: 'bg-green-100 text-green-600' };
    }
    if (stepName.toLowerCase().includes('reject')) {
      return { icon: XCircle, color: 'bg-red-100 text-red-600' };
    }
    if (stepName.toLowerCase().includes('action') || performedBy && performedBy !== 'system') {
      return { icon: User, color: 'bg-slate-100 text-slate-600' };
    }
    return { icon: FileText, color: 'bg-slate-100 text-slate-500' };
  };

  return (
    <div className="space-y-4">
      <h3 className="font-medium text-slate-900 text-sm">Activity Timeline</h3>
      
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />
        
        <div className="space-y-4">
          {logs.map((log) => {
            const { icon: Icon, color } = getStepIcon(log.step_name, log.performed_by);
            
            return (
              <div key={log.id} className="relative flex gap-3">
                <div className={clsx('relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', color)}>
                  <Icon className="w-4 h-4" />
                </div>
                
                <div className="flex-1 min-w-0 bg-slate-50 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-medium text-slate-900 text-sm">{log.step_name}</h4>
                      {log.performed_by && (
                        <p className="text-xs text-slate-500">By: {log.performed_by}</p>
                      )}
                    </div>
                    <time className="text-xs text-slate-400 flex items-center gap-1 flex-shrink-0">
                      <Clock className="w-3 h-3" />
                      {log.created_at ? format(parseISO(log.created_at), 'MMM d, HH:mm') : '-'}
                    </time>
                  </div>
                  
                  {log.details && (
                    <p className="mt-1.5 text-sm text-slate-600">{log.details}</p>
                  )}
                  
                  {log.langgraph_node && (
                    <p className="mt-1 text-xs text-slate-500">
                      Node: {log.langgraph_node}
                    </p>
                  )}
                  
                  {log.extracted_data && (
                    <details className="mt-2">
                      <summary className="text-xs text-red-700 cursor-pointer hover:text-red-800 font-medium">
                        View Extracted Data
                      </summary>
                      <pre className="mt-2 text-xs bg-white p-2 rounded border border-slate-200 overflow-x-auto">
                        {JSON.stringify(log.extracted_data, null, 2)}
                      </pre>
                    </details>
                  )}
                  
                  {log.verification_result && (
                    <details className="mt-2">
                      <summary className="text-xs text-red-700 cursor-pointer hover:text-red-800 font-medium">
                        View Verification Result
                      </summary>
                      <pre className="mt-2 text-xs bg-white p-2 rounded border border-slate-200 overflow-x-auto">
                        {JSON.stringify(log.verification_result, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
