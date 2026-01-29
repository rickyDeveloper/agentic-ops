import { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Loader2, FileSearch, Globe, Shield, Bot, User, ArrowRight, Pause, Play, MessageSquare } from 'lucide-react';
import clsx from 'clsx';

interface AgentActivity {
  timestamp: string;
  case_id: string;
  agent: string;
  agent_display_name: string;
  action: string;
  details: string;
  status: string;
  duration_ms?: number;
  data?: Record<string, unknown>;
}

interface AgentActivityFeedProps {
  activities: AgentActivity[];
  maxHeight?: string;
}

// Define the 3 main workflow stages
const WORKFLOW_STAGES = [
  { id: 'document_inspector', name: 'Document Inspector', icon: FileSearch, emoji: '🔍' },
  { id: 'external_verifier', name: 'External Verifier', icon: Globe, emoji: '⚖️' },
  { id: 'compliance_officer', name: 'Compliance Officer', icon: Shield, emoji: '📝' },
];

function getStageStatus(activities: AgentActivity[], stageId: string): 'pending' | 'active' | 'complete' | 'warning' | 'error' | 'escalated' {
  const stageActivities = activities.filter(a => a.agent === stageId);
  
  if (stageActivities.length === 0) {
    const stageIndex = WORKFLOW_STAGES.findIndex(s => s.id === stageId);
    const earlierStages = WORKFLOW_STAGES.slice(0, stageIndex);
    const anyEarlierActive = earlierStages.some(s => {
      const acts = activities.filter(a => a.agent === s.id);
      return acts.length > 0 && !acts.some(a => 
        a.status === 'success' || a.status === 'warning' || a.status === 'error'
      );
    });
    if (anyEarlierActive || activities.length === 0) return 'pending';
    return 'pending';
  }
  
  const hasError = stageActivities.some(a => a.status === 'error');
  if (hasError) return 'error';
  
  const completedWithWarning = stageActivities.some(a => 
    a.status === 'warning' && (a.action.includes('Complete') || a.action.includes('Decision'))
  );
  if (completedWithWarning) return 'warning';
  
  const isEscalated = stageActivities.some(a => 
    a.data?.decision === 'ESCALATE'
  );
  if (isEscalated) return 'escalated';
  
  const isComplete = stageActivities.some(a => 
    (a.status === 'success' || a.status === 'decision') && 
    (a.action.includes('Complete') || a.action.includes('Decision'))
  );
  if (isComplete) return 'complete';
  
  // Check if agent is actively working
  // If any activity has in_progress or started status, agent is working
  const isActivelyWorking = stageActivities.some(a => 
    a.status === 'in_progress' || a.status === 'started'
  );
  
  // If we have activities but none indicate completion, agent is likely still working
  const hasIncompleteActivities = stageActivities.length > 0 && 
    !stageActivities.some(a => 
      a.status === 'success' || 
      a.status === 'error' || 
      (a.status === 'decision' && a.action.includes('Decision'))
    );
  
  if (isActivelyWorking || hasIncompleteActivities) return 'active';
  
  return 'active';
}

function getConfidenceScore(activities: AgentActivity[], stageId: string): number | null {
  const stageActivities = activities.filter(a => a.agent === stageId);
  const withConfidence = stageActivities.find(a => a.data?.confidence);
  if (withConfidence?.data?.confidence) {
    return (withConfidence.data.confidence as number) * 100;
  }
  // Simulate confidence for demo
  if (stageActivities.some(a => a.status === 'success')) return 95;
  if (stageActivities.some(a => a.status === 'warning')) return 65;
  if (stageActivities.length > 0) return 78;
  return null;
}

function getLatestMessage(activities: AgentActivity[], stageId: string): string {
  const stageActivities = activities.filter(a => a.agent === stageId);
  if (stageActivities.length === 0) return '';
  const latest = stageActivities[stageActivities.length - 1];
  return latest.details;
}

function getDecisionData(activities: AgentActivity[]): { decision?: string; risk?: string; confidence?: number } | null {
  const decisionActivity = activities.find(a => 
    a.agent === 'compliance_officer' && a.status === 'decision'
  );
  if (decisionActivity?.data) {
    return {
      decision: decisionActivity.data.decision as string,
      risk: decisionActivity.data.risk_level as string,
      confidence: decisionActivity.data.confidence as number,
    };
  }
  return null;
}

export function AgentActivityFeed({ activities, maxHeight = '500px' }: AgentActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  
  useEffect(() => {
    if (scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities, isPaused]);

  const isWorkflowStarted = activities.length > 0;
  const decision = getDecisionData(activities);
  const needsHumanReview = decision?.decision === 'ESCALATE';

  if (!isWorkflowStarted) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
        <Bot className="w-10 h-10 mb-2 opacity-30" />
        <p className="text-sm text-slate-500">Waiting for case</p>
        <p className="text-xs mt-1 text-slate-400">AI reasoning will appear here</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="space-y-3" style={{ maxHeight, overflowY: 'auto' }}>
      {/* Header with controls */}
      <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-100">
        <span className="font-medium">Live Reasoning</span>
        <button
          onClick={() => setIsPaused(!isPaused)}
          className={clsx(
            'flex items-center gap-1 px-2 py-0.5 rounded text-xs',
            isPaused ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
          )}
        >
          {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          {isPaused ? 'Resume' : 'Pause'}
        </button>
      </div>

      {/* Workflow Stages with reasoning */}
      <div className="space-y-2">
        {WORKFLOW_STAGES.map((stage, index) => {
          const status = getStageStatus(activities, stage.id);
          const message = getLatestMessage(activities, stage.id);
          const confidence = getConfidenceScore(activities, stage.id);
          const Icon = stage.icon;
          const isLowConfidence = confidence !== null && confidence < 70;
          
          return (
            <div key={stage.id}>
              {/* Stage Card */}
              <div className={clsx(
                'rounded-lg border transition-all',
                status === 'pending' && 'bg-slate-50 border-slate-200 opacity-50',
                status === 'active' && 'bg-white border-slate-300 shadow-sm',
                status === 'complete' && 'bg-green-50 border-green-200',
                status === 'warning' && 'bg-amber-50 border-amber-200',
                status === 'error' && 'bg-red-50 border-red-200',
                status === 'escalated' && 'bg-amber-50 border-amber-300',
              )}>
                {/* Main row */}
                <div className="p-2.5 flex items-center gap-2.5">
                  {/* Status icon with emoji */}
                  <div className={clsx(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-sm',
                    status === 'pending' && 'bg-slate-100',
                    status === 'active' && 'bg-blue-50',
                    status === 'complete' && 'bg-green-100',
                    status === 'warning' && 'bg-amber-100',
                    status === 'error' && 'bg-red-100',
                    status === 'escalated' && 'bg-amber-200',
                  )}>
                    {status === 'active' ? (
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    ) : status === 'complete' ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : status === 'warning' || status === 'escalated' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    ) : status === 'error' ? (
                      <XCircle className="w-4 h-4 text-red-600" />
                    ) : (
                      <Icon className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={clsx(
                        'font-medium text-sm',
                        status === 'pending' && 'text-slate-400',
                        status === 'active' && 'text-slate-700',
                        status === 'complete' && 'text-green-700',
                        (status === 'warning' || status === 'escalated') && 'text-amber-700',
                        status === 'error' && 'text-red-700',
                      )}>
                        {stage.name}
                      </span>
                      
                      {/* Confidence score */}
                      {confidence !== null && status !== 'pending' && (
                        <span className={clsx(
                          'text-xs px-1.5 py-0.5 rounded font-medium',
                          isLowConfidence 
                            ? 'bg-amber-100 text-amber-700' 
                            : 'bg-green-100 text-green-700'
                        )}>
                          {confidence.toFixed(0)}%
                        </span>
                      )}
                    </div>
                    
                    {/* Reasoning message */}
                    {message && (
                      <p className="text-xs text-slate-500 mt-0.5 flex items-start gap-1">
                        <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span className="italic">"{message}"</span>
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Low confidence warning */}
                {isLowConfidence && status === 'active' && (
                  <div className="px-2.5 pb-2 -mt-1">
                    <div className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Low confidence - may require human review
                    </div>
                  </div>
                )}
              </div>
              
              {/* Connector with hand-off animation */}
              {index < WORKFLOW_STAGES.length - 1 && (
                <div className="flex items-center justify-center py-1">
                  <div className={clsx(
                    'flex items-center gap-1',
                    status === 'complete' || status === 'warning' ? 'text-slate-400' : 'text-slate-200'
                  )}>
                    <div className="w-0.5 h-2 bg-current rounded-full" />
                    {status === 'complete' && (
                      <ArrowRight className="w-3 h-3 animate-pulse" />
                    )}
                    <div className="w-0.5 h-2 bg-current rounded-full" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Human Hand-off Indicator */}
      {needsHumanReview && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-amber-600">
              <Bot className="w-5 h-5" />
              <ArrowRight className="w-4 h-4 animate-bounce" />
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-medium text-amber-800">Human Review Required</div>
              <div className="text-xs text-amber-600">AI has flagged this case for officer review</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Decision Result */}
      {decision && !needsHumanReview && (
        <div className={clsx(
          'rounded-lg p-3 border mt-2',
          decision.decision === 'APPROVE' && 'bg-green-50 border-green-200',
          decision.decision === 'REJECT' && 'bg-red-50 border-red-200',
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {decision.decision === 'APPROVE' ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              <span className={clsx(
                'font-semibold',
                decision.decision === 'APPROVE' ? 'text-green-700' : 'text-red-700'
              )}>
                {decision.decision}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-600">
                Risk: <span className={clsx(
                  'font-medium',
                  decision.risk === 'LOW' && 'text-green-600',
                  decision.risk === 'MEDIUM' && 'text-amber-600',
                  decision.risk === 'HIGH' && 'text-red-600',
                )}>{decision.risk}</span>
              </span>
              {decision.confidence && (
                <span className="text-slate-600">
                  <span className="font-medium">{(decision.confidence * 100).toFixed(0)}%</span> confident
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Activity Log (collapsed by default) */}
      <details className="text-xs mt-3">
        <summary className="text-slate-400 cursor-pointer hover:text-slate-600">
          View detailed log ({activities.length} events)
        </summary>
        <div className="mt-2 space-y-1 pl-2 border-l-2 border-slate-100">
          {activities.map((activity, i) => (
            <div key={i} className="text-slate-500 py-0.5">
              <span className="text-slate-400">{new Date(activity.timestamp).toLocaleTimeString()}</span>
              {' '}{activity.action}: {activity.details}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// Compact version for embedding
export function AgentActivityCompact({ activities }: { activities: AgentActivity[] }) {
  return (
    <div className="flex items-center gap-2">
      {WORKFLOW_STAGES.map((stage, i) => {
        const status = getStageStatus(activities, stage.id);
        return (
          <div key={stage.id} className="flex items-center gap-1">
            {i > 0 && <div className="w-3 h-0.5 bg-slate-200" />}
            <div className={clsx(
              'w-5 h-5 rounded-full flex items-center justify-center text-xs',
              status === 'pending' && 'bg-slate-200 text-slate-400',
              status === 'active' && 'bg-slate-300 text-slate-600',
              status === 'complete' && 'bg-green-500 text-white',
              (status === 'warning' || status === 'escalated') && 'bg-amber-500 text-white',
              status === 'error' && 'bg-red-500 text-white',
            )}>
              {status === 'active' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : status === 'complete' ? (
                <CheckCircle className="w-3 h-3" />
              ) : status === 'warning' || status === 'escalated' ? (
                <AlertTriangle className="w-3 h-3" />
              ) : (
                <span>{i + 1}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
