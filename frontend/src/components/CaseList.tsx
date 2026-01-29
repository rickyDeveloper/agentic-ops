import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { casesApi } from '../services/api';
import type { ACIPCase, CaseStatus } from '../types';
import { 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  User,
  Bot,
  Shield
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';

interface CaseListProps {
  statusFilter?: CaseStatus;
  onSelectCase: (caseItem: ACIPCase) => void;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', color: 'text-slate-600', bgColor: 'bg-slate-100', icon: Clock },
  processing: { label: 'Processing', color: 'text-slate-700', bgColor: 'bg-slate-100', icon: Bot },
  ai_review: { label: 'AI Review', color: 'text-slate-700', bgColor: 'bg-slate-100', icon: Bot },
  awaiting_human: { label: 'Awaiting Review', color: 'text-amber-700', bgColor: 'bg-amber-50', icon: AlertTriangle },
  approved: { label: 'Approved', color: 'text-green-700', bgColor: 'bg-green-50', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'text-red-700', bgColor: 'bg-red-50', icon: XCircle },
  escalated: { label: 'Escalated', color: 'text-orange-700', bgColor: 'bg-orange-50', icon: AlertTriangle },
  docs_requested: { label: 'Docs Requested', color: 'text-slate-700', bgColor: 'bg-slate-100', icon: Clock },
  verified: { label: 'Verified', color: 'text-green-700', bgColor: 'bg-green-50', icon: Shield },
};

const riskColors: Record<string, string> = {
  low: 'text-green-700 bg-green-50',
  medium: 'text-amber-700 bg-amber-50',
  high: 'text-red-700 bg-red-50',
  unknown: 'text-slate-600 bg-slate-100',
};

export function CaseList({ statusFilter, onSelectCase }: CaseListProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading, error } = useQuery({
    queryKey: ['cases', statusFilter, search, page],
    queryFn: () => casesApi.list({
      status: statusFilter,
      search: search || undefined,
      page,
      page_size: pageSize,
    }),
  });

  const StatusBadge = ({ status }: { status: string }) => {
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium', config.bgColor, config.color)}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700">
        Error loading cases. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
          </div>
          <button className="flex items-center space-x-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors">
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>
        </div>
      </div>

      {/* Cases List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="animate-pulse p-4 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-lg" />
            ))}
          </div>
        ) : data?.cases.length === 0 ? (
          <div className="p-12 text-center">
            <User className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 font-medium">No cases found</p>
            <p className="text-sm text-slate-500 mt-1">
              {search ? 'Try a different search term' : 'Create a new ACIP request to get started'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data?.cases.map((caseItem) => (
              <button
                key={caseItem.id}
                onClick={() => onSelectCase(caseItem)}
                className="w-full p-4 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-slate-500" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{caseItem.customer_name}</p>
                      <p className="text-sm text-slate-500">
                        {caseItem.customer_email || 'No email provided'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    {/* Risk Level */}
                    <span className={clsx('px-2 py-1 rounded text-xs font-medium capitalize', riskColors[caseItem.risk_level])}>
                      {caseItem.risk_level}
                    </span>
                    
                    {/* Status */}
                    <StatusBadge status={caseItem.status} />
                    
                    {/* Date */}
                    <span className="text-sm text-slate-500 w-24 text-right">
                      {caseItem.created_at && format(parseISO(caseItem.created_at), 'MMM d, HH:mm')}
                    </span>
                    
                    {/* Overdue indicator */}
                    {caseItem.is_overdue && (
                      <span className="px-2 py-1 bg-red-50 text-red-700 text-xs rounded-full font-medium">
                        Overdue
                      </span>
                    )}
                  </div>
                </div>
                
                {/* AI Confidence Score if available */}
                {caseItem.ai_confidence_score && (
                  <div className="mt-2 flex items-center space-x-2 text-xs text-slate-500">
                    <Bot className="w-3 h-3" />
                    <span>AI Confidence: {(parseFloat(caseItem.ai_confidence_score) * 100).toFixed(0)}%</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-200 bg-slate-50">
            <p className="text-sm text-slate-600">
              Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, data.total)} of {data.total} cases
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-slate-600"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-600">
                Page {page} of {data.total_pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(data.total_pages, p + 1))}
                disabled={page === data.total_pages}
                className="p-2 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-slate-600"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
