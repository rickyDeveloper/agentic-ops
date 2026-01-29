import { useState, useEffect } from 'react';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Users,
  Bot,
  ArrowRight,
  Shield,
  Globe,
  FileSearch,
  Zap,
  Timer,
  TrendingUp
} from 'lucide-react';
import type { CaseStats } from '../types';
import clsx from 'clsx';

interface DashboardProps {
  stats?: CaseStats;
  isLoading: boolean;
  onViewChange: (view: string) => void;
}

export function Dashboard({ stats, isLoading, onViewChange }: DashboardProps) {
  const [timeSaved, setTimeSaved] = useState(0);
  
  // Animate time saved counter
  useEffect(() => {
    const totalCases = (stats?.total_approved || 0) + (stats?.total_rejected || 0);
    const targetTimeSaved = totalCases * 47.5; // 47.5 minutes saved per case (48 - 0.5)
    
    if (targetTimeSaved > timeSaved) {
      const interval = setInterval(() => {
        setTimeSaved(prev => {
          const next = prev + Math.ceil((targetTimeSaved - prev) / 10);
          return next >= targetTimeSaved ? targetTimeSaved : next;
        });
      }, 50);
      return () => clearInterval(interval);
    }
  }, [stats, timeSaved]);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-24 bg-white rounded-xl border border-slate-200" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 h-24 border border-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  const totalProcessed = (stats?.total_approved || 0) + (stats?.total_rejected || 0);
  const aiResolved = Math.round(totalProcessed * 0.92);
  const humanReviewed = totalProcessed - aiResolved;
  const costSaved = totalProcessed * 19.5;

  return (
    <div className="space-y-5">
      {/* Throughput Funnel - Supervisor View */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-900">Automation Throughput</h3>
            <p className="text-xs text-slate-500">Real-time processing funnel</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-green-600">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          </div>
        </div>
        
        {/* Funnel visualization */}
        <div className="flex items-center gap-2">
          {/* Incoming */}
          <div className="flex-1 text-center">
            <div className="bg-slate-100 rounded-lg p-3">
              <div className="text-2xl font-bold text-slate-700">{totalProcessed + (stats?.total_pending || 0)}</div>
              <div className="text-xs text-slate-500">Total Cases</div>
            </div>
          </div>
          
          <ArrowRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
          
          {/* AI Processed */}
          <div className="flex-1 text-center">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-700">{aiResolved}</div>
              <div className="text-xs text-green-600">AI Resolved</div>
              <div className="text-xs text-green-500 font-medium">92%</div>
            </div>
          </div>
          
          <ArrowRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
          
          {/* Human Review */}
          <div className="flex-1 text-center">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="text-2xl font-bold text-amber-700">{humanReviewed + (stats?.awaiting_human_review || 0)}</div>
              <div className="text-xs text-amber-600">Human Review</div>
              <div className="text-xs text-amber-500 font-medium">8%</div>
            </div>
          </div>
        </div>
        
        {/* Time saved ticker */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-green-600" />
              <span className="text-sm text-slate-600">Time Saved:</span>
              <span className="text-lg font-bold text-green-700">
                {Math.floor(timeSaved / 60)}h {timeSaved % 60}m
              </span>
            </div>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-slate-500" />
              <span className="text-sm text-slate-600">Cost Saved:</span>
              <span className="text-lg font-bold text-slate-700">
                ${costSaved.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="text-xs text-slate-400">
            vs. 48 min avg. manual processing
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <button
          onClick={() => onViewChange('pending')}
          className="bg-white rounded-xl p-4 border border-slate-200 hover:shadow-md transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <Bot className="w-5 h-5 text-slate-500" />
            <span className="text-2xl font-bold text-slate-700">{stats?.total_processing || 0}</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">AI Processing</div>
        </button>
        
        <button
          onClick={() => onViewChange('awaiting')}
          className="bg-white rounded-xl p-4 border border-amber-200 hover:shadow-md transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <Users className="w-5 h-5 text-amber-600" />
            <span className="text-2xl font-bold text-amber-700">{stats?.awaiting_human_review || 0}</span>
          </div>
          <div className="text-xs text-amber-600 mt-2">Needs Review</div>
        </button>
        
        <button
          onClick={() => onViewChange('approved')}
          className="bg-white rounded-xl p-4 border border-green-200 hover:shadow-md transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-2xl font-bold text-green-700">{stats?.total_approved || 0}</span>
          </div>
          <div className="text-xs text-green-600 mt-2">Approved</div>
        </button>
        
        <button
          onClick={() => onViewChange('rejected')}
          className="bg-white rounded-xl p-4 border border-red-200 hover:shadow-md transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <XCircle className="w-5 h-5 text-red-600" />
            <span className="text-2xl font-bold text-red-700">{stats?.total_rejected || 0}</span>
          </div>
          <div className="text-xs text-red-600 mt-2">Rejected</div>
        </button>
      </div>

      {/* Urgent Actions */}
      {stats && stats.overdue_cases > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div>
                <span className="font-semibold text-amber-800">{stats.overdue_cases} Overdue Cases</span>
                <span className="text-sm text-amber-600 ml-2">Exceeding 15-day AUSTRAC deadline</span>
              </div>
            </div>
            <button
              onClick={() => onViewChange('awaiting')}
              className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700"
            >
              Review Now
            </button>
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-5">
        {/* AI Agents Overview */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-4">AI Agent Pipeline</h3>
          <div className="space-y-3">
            {[
              { icon: FileSearch, name: 'Document Inspector', desc: 'OCR & Data Extraction', color: 'text-slate-600' },
              { icon: Globe, name: 'External Verifier', desc: 'DVS, PEP & Sanctions', color: 'text-slate-600' },
              { icon: Shield, name: 'Compliance Officer', desc: 'Risk & Decision', color: 'text-slate-600' },
            ].map((agent, i) => (
              <div key={agent.name} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                  <agent.icon className={clsx('w-4 h-4', agent.color)} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-700">{agent.name}</div>
                  <div className="text-xs text-slate-400">{agent.desc}</div>
                </div>
                <div className="flex items-center gap-1">
                  {i < 2 && <ArrowRight className="w-4 h-4 text-slate-300" />}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Avg. processing time</span>
              <span className="font-medium text-slate-700">~30 seconds</span>
            </div>
          </div>
        </div>

        {/* Comparison */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Efficiency Comparison</h3>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-600">Processing Time</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 line-through">48 min</span>
                <ArrowRight className="w-3 h-3 text-green-500" />
                <span className="text-sm font-medium text-green-700">30 sec</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-600">Cost per Check</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 line-through">$20.00</span>
                <ArrowRight className="w-3 h-3 text-green-500" />
                <span className="text-sm font-medium text-green-700">$0.50</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-600">Error Rate</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 line-through">5-10%</span>
                <ArrowRight className="w-3 h-3 text-green-500" />
                <span className="text-sm font-medium text-green-700">&lt;1%</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-600">Audit Trail</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">Manual</span>
                <ArrowRight className="w-3 h-3 text-green-500" />
                <span className="text-sm font-medium text-green-700">Auto</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        <button
          onClick={() => onViewChange('awaiting')}
          className="bg-white rounded-xl border border-slate-200 p-4 hover:border-amber-300 hover:shadow-md transition-all text-left group"
        >
          <Users className="w-6 h-6 text-amber-600 mb-2" />
          <h4 className="font-medium text-slate-900 text-sm">Exception Queue</h4>
          <p className="text-xs text-slate-500 mt-1">Cases flagged for human review</p>
          <div className="mt-2 flex items-center text-amber-600 text-xs font-medium">
            <span>Review queue</span>
            <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
        
        <button
          onClick={() => onViewChange('all')}
          className="bg-white rounded-xl border border-slate-200 p-4 hover:border-slate-300 hover:shadow-md transition-all text-left group"
        >
          <TrendingUp className="w-6 h-6 text-slate-600 mb-2" />
          <h4 className="font-medium text-slate-900 text-sm">All Cases</h4>
          <p className="text-xs text-slate-500 mt-1">Complete verification history</p>
          <div className="mt-2 flex items-center text-slate-600 text-xs font-medium">
            <span>Browse all</span>
            <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
        
        <button
          onClick={() => onViewChange('pending')}
          className="bg-white rounded-xl border border-slate-200 p-4 hover:border-red-300 hover:shadow-md transition-all text-left group"
        >
          <Bot className="w-6 h-6 text-red-700 mb-2" />
          <h4 className="font-medium text-slate-900 text-sm">AI Processing</h4>
          <p className="text-xs text-slate-500 mt-1">Currently being analyzed</p>
          <div className="mt-2 flex items-center text-red-700 text-xs font-medium">
            <span>View active</span>
            <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </div>
    </div>
  );
}
