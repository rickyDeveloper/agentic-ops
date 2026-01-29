import { useState, useEffect } from 'react';
import { FileSearch, Globe, Shield, Loader2, ArrowRight, Bot } from 'lucide-react';
import clsx from 'clsx';

interface AgentCollaborationLoadingProps {
  customerName: string;
  onComplete?: () => void;
}

interface AgentState {
  id: string;
  name: string;
  icon: React.ElementType;
  status: 'waiting' | 'working' | 'complete';
  message: string;
  color: string;
}

const AGENTS: Omit<AgentState, 'status' | 'message'>[] = [
  { id: 'document_inspector', name: 'Document Inspector', icon: FileSearch, color: 'text-blue-600' },
  { id: 'external_verifier', name: 'External Verifier', icon: Globe, color: 'text-purple-600' },
  { id: 'compliance_officer', name: 'Compliance Officer', icon: Shield, color: 'text-green-600' },
];

const MESSAGES = {
  document_inspector: [
    'Analyzing document image...',
    'Extracting text and data fields...',
    'Validating document authenticity...',
    'Processing complete ✓',
  ],
  external_verifier: [
    'Checking DVS database...',
    'Screening PEP lists...',
    'Verifying sanctions status...',
    'Matching against internal records...',
    'All checks complete ✓',
  ],
  compliance_officer: [
    'Analyzing all evidence...',
    'Calculating risk score...',
    'Generating audit report...',
    'Making final decision...',
    'Assessment complete ✓',
  ],
};

export function AgentCollaborationLoading({ customerName, onComplete }: AgentCollaborationLoadingProps) {
  const [agents, setAgents] = useState<AgentState[]>(() =>
    AGENTS.map(agent => ({
      ...agent,
      status: 'waiting' as const,
      message: '',
    }))
  );
  const [currentAgentIndex, setCurrentAgentIndex] = useState(0);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Simulate agent workflow progression
  useEffect(() => {
    if (currentAgentIndex >= AGENTS.length) {
      // All agents complete - ensure Compliance Officer had time to show
      setTimeout(() => {
        onComplete?.();
      }, 2000); // Give extra time to see completion
      return;
    }

    const currentAgent = agents[currentAgentIndex];
    
    // Start current agent - add a small delay before starting to ensure smooth transition
    if (currentAgent.status === 'waiting') {
      const startDelay = currentAgentIndex > 0 ? 500 : 0; // Small delay when transitioning between agents
      const timer = setTimeout(() => {
        setAgents(prev => prev.map((agent, idx) => 
          idx === currentAgentIndex 
            ? { ...agent, status: 'working', message: MESSAGES[agent.id as keyof typeof MESSAGES][0] }
            : agent
        ));
        setCurrentMessageIndex(0);
      }, startDelay);
      
      return () => clearTimeout(timer);
    }

    // Progress through messages for current agent
    const messages = MESSAGES[currentAgent.id as keyof typeof MESSAGES];
    if (currentMessageIndex < messages.length - 1) {
      // Add longer delay for External Verifier to show what's happening
      // Compliance Officer also gets slightly longer delays to ensure visibility
      const baseDelay = currentAgent.id === 'external_verifier' ? 3000 : 
                       currentAgent.id === 'compliance_officer' ? 2500 : 2000;
      const delay = baseDelay + Math.random() * 1000; // Add some randomness
      
      const timer = setTimeout(() => {
        setCurrentMessageIndex(prev => prev + 1);
        setAgents(prev => prev.map((agent, idx) => 
          idx === currentAgentIndex 
            ? { ...agent, message: messages[currentMessageIndex + 1] }
            : agent
        ));
      }, delay);

      return () => clearTimeout(timer);
    } else {
      // Agent complete - add a delay before moving to next agent
      // External Verifier gets longer delay, Compliance Officer gets delay too
      const completionDelay = currentAgent.id === 'external_verifier' ? 2500 : 
                              currentAgent.id === 'compliance_officer' ? 2000 : 1000;
      
      const timer = setTimeout(() => {
        setAgents(prev => prev.map((agent, idx) => 
          idx === currentAgentIndex 
            ? { ...agent, status: 'complete' }
            : idx === currentAgentIndex + 1
            ? { ...agent, status: 'working', message: MESSAGES[agent.id as keyof typeof MESSAGES][0] }
            : agent
        ));
        setCurrentAgentIndex(prev => prev + 1);
        setCurrentMessageIndex(0);
      }, completionDelay);

      return () => clearTimeout(timer);
    }
  }, [currentAgentIndex, currentMessageIndex, agents, onComplete]);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-blue-400 rounded-full opacity-30 animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-4xl px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img 
              src="https://www.nab.com.au/etc.clientlibs/nab/clientlibs/clientlib-generated-components/resources/images/svg/nab-logo.svg" 
              alt="NAB Logo" 
              className="h-12 w-auto"
              style={{ filter: 'brightness(0) invert(1)' }}
              onError={(e) => {
                // Fallback to text logo if image fails to load
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent && !parent.querySelector('.nab-text-logo')) {
                  const textLogo = document.createElement('div');
                  textLogo.className = 'nab-text-logo text-white font-bold text-2xl';
                  textLogo.textContent = 'NAB';
                  parent.appendChild(textLogo);
                }
              }}
            />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">
            Agentic Ops Workflow
          </h1>
          <p className="text-xl text-slate-300 mb-1">
            Processing ACIP verification for <span className="font-semibold text-white">{customerName}</span>
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm text-slate-400">Real-time agent coordination</span>
          </div>
        </div>

        {/* Agent Pipeline */}
        <div className="space-y-6">
          {agents.map((agent, index) => {
            const Icon = agent.icon;
            const isActive = agent.status === 'working';
            const isComplete = agent.status === 'complete';
            const isWaiting = agent.status === 'waiting';

            return (
              <div key={agent.id}>
                {/* Agent Card */}
                <div
                  className={clsx(
                    'relative rounded-xl border-2 p-6 transition-all duration-500',
                    isActive && 'bg-gradient-to-r from-blue-50 to-purple-50 border-blue-400 shadow-lg shadow-blue-500/20 scale-105',
                    isComplete && 'bg-green-50 border-green-400 shadow-md',
                    isWaiting && 'bg-slate-800/50 border-slate-700 opacity-50'
                  )}
                >
                  <div className="flex items-center gap-4">
                    {/* Agent Icon */}
                    <div
                      className={clsx(
                        'w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
                        isActive && 'bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg',
                        isComplete && 'bg-green-500',
                        isWaiting && 'bg-slate-700'
                      )}
                    >
                      {isActive ? (
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                      ) : isComplete ? (
                        <Icon className="w-8 h-8 text-white" />
                      ) : (
                        <Icon className="w-8 h-8 text-slate-400" />
                      )}
                    </div>

                    {/* Agent Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3
                          className={clsx(
                            'text-xl font-semibold',
                            isActive && 'text-blue-900',
                            isComplete && 'text-green-900',
                            isWaiting && 'text-slate-400'
                          )}
                        >
                          {agent.name}
                        </h3>
                        {isActive && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full animate-pulse">
                            Working
                          </span>
                        )}
                        {isComplete && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                            Complete
                          </span>
                        )}
                      </div>
                      {agent.message && (
                        <p
                          className={clsx(
                            'text-sm transition-all',
                            isActive && 'text-blue-700 font-medium',
                            isComplete && 'text-green-700',
                            isWaiting && 'text-slate-500'
                          )}
                        >
                          {agent.message}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Progress indicator */}
                  {isActive && (
                    <div className="mt-4 pt-4 border-t border-blue-200">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-blue-200 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-pulse" style={{ width: '60%' }} />
                        </div>
                        <span className="text-xs text-blue-600 font-medium">Processing...</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Connector Arrow */}
                {index < agents.length - 1 && (
                  <div className="flex justify-center py-2">
                    <div className={clsx(
                      'flex items-center gap-2 transition-colors',
                      isComplete ? 'text-green-400' : 'text-slate-600'
                    )}>
                      <div className="w-0.5 h-4 bg-current rounded-full" />
                      {isComplete ? (
                        <ArrowRight className="w-5 h-5 animate-pulse" />
                      ) : (
                        <ArrowRight className="w-5 h-5 opacity-30" />
                      )}
                      <div className="w-0.5 h-4 bg-current rounded-full" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Stats */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-6 px-6 py-3 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-sm text-slate-300">
                <span className="font-semibold text-white">{agents.filter(a => a.status === 'complete').length}</span> of {agents.length} agents complete
              </span>
            </div>
            <div className="w-px h-4 bg-slate-600" />
            <div className="text-sm text-slate-400">
              Elapsed: <span className="font-mono text-white">{elapsedTime}s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
