import { useState, useEffect } from 'react';
import { 
  FileSearch, 
  Globe, 
  Shield, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Loader2,
  ArrowRight,
  User,
  Bot,
  Clock,
  Upload,
} from 'lucide-react';
import clsx from 'clsx';

interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  status: 'pending' | 'active' | 'success' | 'warning' | 'error';
  details?: string;
  data?: Record<string, any>;
  duration?: number;
  subSteps?: { name: string; status: 'pending' | 'active' | 'done' }[];
}

interface WorkflowProgressProps {
  caseId: string | null;
  customerName: string;
  activities: any[];
  isCreating?: boolean;
  onComplete?: () => void;
  onViewDetails?: () => void;
}

export function WorkflowProgress({ 
  caseId, 
  customerName, 
  activities, 
  isCreating = false,
  onComplete,
  onViewDetails 
}: WorkflowProgressProps) {
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 'upload',
      name: 'Initializing',
      description: 'Creating case and uploading document',
      icon: Upload,
      status: isCreating ? 'active' : 'success',
      subSteps: [
        { name: 'Creating case record', status: isCreating ? 'active' : 'done' },
        { name: 'Uploading document', status: 'pending' },
        { name: 'Starting AI workflow', status: 'pending' },
      ]
    },
    {
      id: 'document_inspector',
      name: 'Document Inspector',
      description: 'Analyzing ID document with AI vision',
      icon: FileSearch,
      status: 'pending',
      subSteps: [
        { name: 'Reading document image', status: 'pending' },
        { name: 'Extracting text & data', status: 'pending' },
        { name: 'Validating document type', status: 'pending' },
      ]
    },
    {
      id: 'external_verifier',
      name: 'External Verifier',
      description: 'Checking against external databases',
      icon: Globe,
      status: 'pending',
      subSteps: [
        { name: 'DVS verification', status: 'pending' },
        { name: 'PEP screening', status: 'pending' },
        { name: 'Sanctions check', status: 'pending' },
        { name: 'Database matching', status: 'pending' },
      ]
    },
    {
      id: 'compliance_officer',
      name: 'Compliance Officer',
      description: 'Risk assessment & ACIP decision',
      icon: Shield,
      status: 'pending',
      subSteps: [
        { name: 'Analyzing evidence', status: 'pending' },
        { name: 'Calculating risk score', status: 'pending' },
        { name: 'Generating audit report', status: 'pending' },
        { name: 'Making decision', status: 'pending' },
      ]
    },
  ]);

  const [finalDecision, setFinalDecision] = useState<{
    decision: string;
    risk: string;
    confidence: number;
  } | null>(null);

  const [elapsedTime, setElapsedTime] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [currentThought, setCurrentThought] = useState<string>('Initializing verification process...');
  
  // Store extracted data and verification results
  const [extractedData, setExtractedData] = useState<Record<string, any> | null>(null);
  const [verificationResults, setVerificationResults] = useState<Record<string, any> | null>(null);

  // Update steps when case is created
  useEffect(() => {
    if (caseId && isCreating === false) {
      setSteps(prev => prev.map(step => {
        if (step.id === 'upload') {
          return {
            ...step,
            status: 'success',
            details: 'Case created successfully',
            subSteps: step.subSteps?.map(s => ({ ...s, status: 'done' as const }))
          };
        }
        if (step.id === 'document_inspector' && step.status === 'pending') {
          return { ...step, status: 'active' };
        }
        return step;
      }));
      setCurrentThought('AI Document Inspector analyzing the uploaded ID...');
    }
  }, [caseId, isCreating]);

  // Update steps based on activities
  useEffect(() => {
    if (!activities.length) return;

    const thoughts: Record<string, string> = {
      'document_inspector': 'Extracting data from document using computer vision...',
      'external_verifier': 'Checking against DVS, PEP lists, and sanctions databases...',
      'compliance_officer': 'Analyzing all evidence and calculating risk score...',
    };

    setSteps(prevSteps => {
      return prevSteps.map(step => {
        if (step.id === 'upload') {
          return { ...step, status: 'success', subSteps: step.subSteps?.map(s => ({ ...s, status: 'done' as const })) };
        }

        const stepActivities = activities.filter(a => a.agent === step.id);
        
        if (stepActivities.length === 0) {
          const stepIndex = prevSteps.findIndex(s => s.id === step.id);
          const prevStep = stepIndex > 0 ? prevSteps[stepIndex - 1] : null;
          
          if (prevStep && (prevStep.status === 'success' || prevStep.status === 'warning')) {
            if (thoughts[step.id]) setCurrentThought(thoughts[step.id]);
            return { 
              ...step, 
              status: 'active',
              subSteps: step.subSteps?.map((s, i) => ({ 
                ...s, 
                status: i === 0 ? 'active' as const : 'pending' as const 
              }))
            };
          }
          return step;
        }

        const latest = stepActivities[stepActivities.length - 1];
        let status: WorkflowStep['status'] = 'active';
        
        if (latest.status === 'success' || (latest.status === 'decision' && latest.data?.decision === 'APPROVE')) {
          status = 'success';
        } else if (latest.status === 'warning' || (latest.status === 'decision' && latest.data?.decision === 'ESCALATE')) {
          status = 'warning';
        } else if (latest.status === 'error' || (latest.status === 'decision' && latest.data?.decision === 'REJECT')) {
          status = step.id === 'compliance_officer' ? 'error' : 'warning';
        } else if (latest.action?.includes('Complete') || latest.action?.includes('Decision')) {
          status = latest.status === 'warning' ? 'warning' : 'success';
        }

        if (latest.details) {
          setCurrentThought(latest.details);
        }

        // Store extracted data from document inspector
        if (step.id === 'document_inspector' && latest.data) {
          setExtractedData(latest.data);
        }
        
        // Store verification results from external verifier
        if (step.id === 'external_verifier' && latest.data) {
          setVerificationResults(latest.data);
        }

        return {
          ...step,
          status,
          details: latest.details,
          data: latest.data,
          duration: latest.duration_ms,
          subSteps: step.subSteps?.map(s => ({ ...s, status: 'done' as const }))
        };
      });
    });

    // Check for final decision
    const decisionActivity = activities.find(a => 
      a.agent === 'compliance_officer' && a.status === 'decision'
    );
    
    if (decisionActivity?.data) {
      setFinalDecision({
        decision: decisionActivity.data.decision,
        risk: decisionActivity.data.risk_level,
        confidence: decisionActivity.data.confidence,
      });
      setIsComplete(true);
      setCurrentThought('Verification complete!');
    }

    const completeActivity = activities.find(a => a.action === 'Workflow Complete');
    if (completeActivity) {
      setIsComplete(true);
      if (completeActivity.data && !finalDecision) {
        setFinalDecision({
          decision: completeActivity.data.decision,
          risk: completeActivity.data.risk_level,
          confidence: completeActivity.data.confidence,
        });
      }
    }
  }, [activities]);

  // Timer
  useEffect(() => {
    if (isComplete) return;
    
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isComplete]);

  const getStatusIcon = (status: WorkflowStep['status']) => {
    switch (status) {
      case 'active':
        return <Loader2 className="w-4 h-4 animate-spin text-red-600" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-emerald-600" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-600" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-slate-300" />;
    }
  };

  const getStatusColor = (status: WorkflowStep['status']) => {
    switch (status) {
      case 'active': return 'border-l-red-600 bg-white';
      case 'success': return 'border-l-emerald-600 bg-white';
      case 'warning': return 'border-l-amber-500 bg-white';
      case 'error': return 'border-l-red-600 bg-white';
      default: return 'border-l-slate-300 bg-slate-50';
    }
  };


  // Render extracted data table
  const renderExtractedData = () => {
    if (!extractedData) return null;
    
    const fields = [
      { label: 'Full Name', value: extractedData.name },
      { label: 'Document Type', value: extractedData.document_type },
      { label: 'Document Number', value: extractedData.document_number },
      { label: 'Date of Birth', value: extractedData.date_of_birth },
      { label: 'Expiry Date', value: extractedData.expiry_date },
      { label: 'Nationality', value: extractedData.nationality },
    ].filter(f => f.value);

    if (fields.length === 0) return null;

    return (
      <div className="mt-2 bg-slate-50 rounded p-2">
        <div className="text-xs font-medium text-slate-600 mb-1">Extracted Data:</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {fields.map((field, i) => (
            <div key={i} className="text-xs">
              <span className="text-slate-500">{field.label}:</span>{' '}
              <span className="text-slate-800 font-medium">{field.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render verification results table
  const renderVerificationTable = () => {
    if (!verificationResults) return null;

    // DVS Check - Show FAILED if there are database discrepancies, otherwise VERIFIED
    const dbMatch = verificationResults.database_match || {};
    const hasDiscrepancies = dbMatch.discrepancies && dbMatch.discrepancies.length > 0;
    const dvsStatus = hasDiscrepancies ? 'FAILED' : 
                     (verificationResults.dvs_status || 
                      (verificationResults.dvs_result?.verified ? 'VERIFIED' : 'VERIFIED')).toUpperCase();
    
    const checks = [
      { 
        name: 'DVS (Document Verification Service)', 
        status: dvsStatus,
        description: hasDiscrepancies 
          ? 'Extracted data does not match data present in our database'
          : 'Extracted data matches data present in our database',
        detail: verificationResults.dvs?.message
      },
      { 
        name: 'PEP (Politically Exposed Persons)', 
        status: (verificationResults.pep_status || (verificationResults.pep_result?.is_pep ? 'FLAGGED' : 'CLEAR')).toUpperCase(),
        description: 'Screens for individuals with political connections requiring enhanced due diligence',
        detail: verificationResults.pep?.message
      },
      { 
        name: 'Sanctions Check', 
        status: (verificationResults.sanctions_status || (verificationResults.sanctions_result?.is_sanctioned ? 'FLAGGED' : 'CLEAR')).toUpperCase(),
        description: 'Checks against OFAC, UN, and EU sanctions lists for prohibited individuals',
        detail: verificationResults.sanctions?.message
      },
      { 
        name: 'Name Match', 
        status: verificationResults.name_match_status,
        description: 'Compares extracted name with internal database records',
        detail: verificationResults.name_match_detail
      },
      { 
        name: 'DOB Match', 
        status: verificationResults.dob_match_status,
        description: 'Compares extracted date of birth with internal database records',
        detail: verificationResults.dob_match_detail
      },
    ].filter(c => c.status);

    if (checks.length === 0 && verificationResults.overall_status) {
      // Fallback: show overall status
      return (
        <div className="mt-2 bg-slate-50 rounded p-2">
          <div className="text-xs font-medium text-slate-600 mb-1">Verification Result:</div>
          <span className={clsx(
            'text-xs px-2 py-0.5 rounded font-medium',
            verificationResults.overall_status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          )}>
            {verificationResults.overall_status}
          </span>
        </div>
      );
    }

    return (
      <div className="mt-2 bg-slate-50 rounded p-2">
        <div className="text-xs font-medium text-slate-600 mb-2">External Verification Checks:</div>
        <div className="space-y-2">
          {checks.map((check, i) => (
            <div key={i} className="bg-white rounded border border-slate-200 p-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-medium text-slate-700">{check.name}</span>
                <span className={clsx(
                  'px-1.5 py-0.5 rounded text-xs font-medium',
                  check.status === 'VERIFIED' || check.status === 'CLEAR' || check.status === 'MATCH' 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : check.status === 'PARTIAL_MATCH' || check.status === 'PARTIAL'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
                )}>
                  {check.status}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{check.description}</div>
            </div>
          ))}
        </div>
        {verificationResults.overall_status && (
          <div className="mt-2 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Overall Status:</span>
              <span className={clsx(
                'text-xs px-2 py-0.5 rounded font-medium',
                verificationResults.overall_status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              )}>
                {verificationResults.overall_status}
              </span>
            </div>
            
            {verificationResults.rationale && verificationResults.rationale.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded p-1.5 mt-1.5">
                <div className="text-[9px] uppercase tracking-wider font-bold text-amber-800 mb-0.5">Database Mismatch Details</div>
                <div className="text-[9px] text-amber-700 mb-1">Extracted data does not match our database:</div>
                <ul className="space-y-0.5">
                  {verificationResults.rationale.map((item: string, idx: number) => (
                    <li key={idx} className="text-[10px] text-amber-700 leading-tight">
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden border border-slate-200">
      {/* Header */}
      <div className="bg-slate-800 px-5 py-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">ACIP Verification</h2>
              <p className="text-slate-300 text-xs">{customerName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-700 rounded px-2 py-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span className="text-xs font-mono">{elapsedTime}s</span>
          </div>
        </div>
        
        {/* Current thought/status */}
        <div className="mt-3 bg-slate-700/50 rounded px-3 py-2 flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-xs text-slate-200">{currentThought}</span>
        </div>
      </div>

      {/* Workflow Steps */}
      <div className="p-4 max-h-[450px] overflow-y-auto bg-slate-50">
        <div className="space-y-2">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isLast = index === steps.length - 1;
            const isActive = step.status === 'active';
            const isPending = step.status === 'pending';
            const isDocInspector = step.id === 'document_inspector';
            const isExtVerifier = step.id === 'external_verifier';
            
            return (
              <div key={step.id}>
                {/* Step Card */}
                <div className={clsx(
                  'rounded border border-slate-200 border-l-4 transition-all',
                  getStatusColor(step.status),
                  isPending && 'opacity-50'
                )}>
                  <div className="p-3 flex items-start gap-3">
                    {/* Icon */}
                    <div className={clsx(
                      'w-8 h-8 rounded flex items-center justify-center flex-shrink-0',
                      isPending ? 'bg-slate-100' : 'bg-slate-100'
                    )}>
                      <Icon className={clsx(
                        'w-4 h-4',
                        isPending ? 'text-slate-400' : 'text-slate-600'
                      )} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h3 className={clsx(
                            'font-medium text-sm',
                            isPending ? 'text-slate-400' : 'text-slate-800'
                          )}>
                            {step.name}
                          </h3>
                          {getStatusIcon(step.status)}
                        </div>
                        {step.duration && (
                          <span className="text-xs text-slate-400">{step.duration}ms</span>
                        )}
                      </div>
                      
                      <p className={clsx(
                        'text-xs mt-0.5',
                        isPending ? 'text-slate-400' : 'text-slate-500'
                      )}>
                        {step.details || step.description}
                      </p>

                      {/* Sub-steps for active step */}
                      {isActive && step.subSteps && (
                        <div className="mt-2 space-y-1 pl-1 border-l-2 border-slate-200 ml-1">
                          {step.subSteps.map((subStep, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs pl-2">
                              {subStep.status === 'done' ? (
                                <CheckCircle className="w-3 h-3 text-emerald-500" />
                              ) : subStep.status === 'active' ? (
                                <Loader2 className="w-3 h-3 text-red-500 animate-spin" />
                              ) : (
                                <div className="w-3 h-3 rounded-full border border-slate-300" />
                              )}
                              <span className={clsx(
                                subStep.status === 'done' ? 'text-slate-600' :
                                subStep.status === 'active' ? 'text-slate-800 font-medium' : 'text-slate-400'
                              )}>
                                {subStep.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Show extracted data for Document Inspector */}
                      {isDocInspector && !isPending && !isActive && renderExtractedData()}

                      {/* Show verification table for External Verifier */}
                      {isExtVerifier && !isPending && !isActive && renderVerificationTable()}
                    </div>
                  </div>
                </div>

                {/* Connector */}
                {!isLast && (
                  <div className="flex justify-start pl-6 py-0.5">
                    <div className={clsx(
                      'w-0.5 h-2',
                      step.status === 'success' ? 'bg-emerald-400' : 
                      step.status === 'warning' ? 'bg-amber-400' : 'bg-slate-300'
                    )} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Final Decision */}
        {isComplete && finalDecision && (
          <div className={clsx(
            'mt-4 p-4 rounded-lg text-center border',
            finalDecision.decision === 'APPROVE' && 'bg-emerald-50 border-emerald-200',
            finalDecision.decision === 'REJECT' && 'bg-red-50 border-red-200',
            finalDecision.decision === 'ESCALATE' && 'bg-amber-50 border-amber-200',
          )}>
            <div className="flex items-center justify-center gap-2 mb-2">
              {finalDecision.decision === 'APPROVE' && (
                <>
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                  <span className="text-lg font-bold text-emerald-700">APPROVED</span>
                </>
              )}
              {finalDecision.decision === 'REJECT' && (
                <>
                  <XCircle className="w-6 h-6 text-red-600" />
                  <span className="text-lg font-bold text-red-700">REJECTED</span>
                </>
              )}
              {finalDecision.decision === 'ESCALATE' && (
                <>
                  <div className="flex items-center gap-1 text-amber-600">
                    <Bot className="w-4 h-4" />
                    <ArrowRight className="w-3 h-3" />
                    <User className="w-4 h-4" />
                  </div>
                  <span className="text-lg font-bold text-amber-700">HUMAN REVIEW</span>
                </>
              )}
            </div>
            
            <div className="flex items-center justify-center gap-3 text-sm">
              <span className={clsx(
                'px-2 py-0.5 rounded text-xs font-medium',
                finalDecision.risk === 'LOW' && 'bg-emerald-200 text-emerald-800',
                finalDecision.risk === 'MEDIUM' && 'bg-amber-200 text-amber-800',
                finalDecision.risk === 'HIGH' && 'bg-red-200 text-red-800',
              )}>
                {finalDecision.risk} Risk
              </span>
              {finalDecision.confidence && (
                <span className="text-slate-600 text-xs">
                  {(finalDecision.confidence * 100).toFixed(0)}% Confidence
                </span>
              )}
            </div>

            {finalDecision.decision === 'ESCALATE' && (
              <p className="mt-2 text-xs text-amber-700">
                Flagged for human review in Exception Queue
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-white border-t border-slate-200 flex justify-end gap-2">
        {isComplete ? (
          <>
            {onViewDetails && (
              <button
                onClick={() => {
                  if (onViewDetails) {
                    onViewDetails();
                  }
                }}
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded transition-colors"
              >
                View Details
              </button>
            )}
            <button
              onClick={() => {
                if (onComplete) {
                  onComplete();
                }
              }}
              className="px-4 py-1.5 text-sm bg-slate-800 text-white rounded hover:bg-slate-900 transition-colors font-medium"
            >
              Done
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing...
          </div>
        )}
      </div>
    </div>
  );
}
