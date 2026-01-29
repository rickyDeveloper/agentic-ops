import { useState, useEffect } from 'react';
import { FileText, Loader2, CheckCircle, Database, Shield, Clock } from 'lucide-react';
import clsx from 'clsx';

interface ReportGenerationLoadingProps {
  onComplete: () => void;
}

const REPORT_STEPS = [
  { id: 'preparing', message: 'Preparing report...', icon: FileText },
  { id: 'collating', message: 'Collating data from all sources...', icon: Database },
  { id: 'compiling', message: 'Compiling audit trail and compliance data...', icon: Shield },
  { id: 'finalizing', message: 'Preparing AUSTRAC-compliant report...', icon: FileText },
];

export function ReportGenerationLoading({ onComplete }: ReportGenerationLoadingProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (currentStepIndex >= REPORT_STEPS.length) {
      // All steps complete, wait a moment then call onComplete
      setTimeout(() => {
        onComplete();
      }, 500);
      return;
    }

    const currentStep = REPORT_STEPS[currentStepIndex];
    
    // Show step for 1.5-2 seconds
    const timer = setTimeout(() => {
      setCompletedSteps(prev => new Set([...prev, currentStep.id]));
      setCurrentStepIndex(prev => prev + 1);
    }, 1500 + Math.random() * 500);

    return () => clearTimeout(timer);
  }, [currentStepIndex, onComplete]);

  return (
    <div className="flex flex-col items-center justify-center py-12 px-6">
      <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl flex items-center justify-center shadow-lg mb-6">
        <FileText className="w-8 h-8 text-white" />
      </div>
      
      <h3 className="text-xl font-semibold text-slate-900 mb-2">Generating AUSTRAC ACIP Report</h3>
      <p className="text-sm text-slate-500 mb-8">Please wait while we compile your compliance report...</p>

      <div className="w-full max-w-md space-y-3">
        {REPORT_STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = index === currentStepIndex;
          const isComplete = completedSteps.has(step.id);
          const isPending = index > currentStepIndex;

          return (
            <div
              key={step.id}
              className={clsx(
                'flex items-center gap-3 p-3 rounded-lg border-2 transition-all',
                isActive && 'bg-red-50 border-red-300 shadow-sm',
                isComplete && 'bg-green-50 border-green-300',
                isPending && 'bg-slate-50 border-slate-200 opacity-50'
              )}
            >
              <div
                className={clsx(
                  'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                  isActive && 'bg-red-600',
                  isComplete && 'bg-green-600',
                  isPending && 'bg-slate-300'
                )}
              >
                {isActive ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : isComplete ? (
                  <CheckCircle className="w-5 h-5 text-white" />
                ) : (
                  <Icon className="w-5 h-5 text-slate-500" />
                )}
              </div>
              
              <div className="flex-1">
                <p
                  className={clsx(
                    'text-sm font-medium',
                    isActive && 'text-red-900',
                    isComplete && 'text-green-900',
                    isPending && 'text-slate-400'
                  )}
                >
                  {step.message}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center gap-2 text-xs text-slate-400">
        <Clock className="w-4 h-4" />
        <span>This may take a few moments...</span>
      </div>
    </div>
  );
}
