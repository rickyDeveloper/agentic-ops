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
  ArrowLeft
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

interface WorkflowProgressInlineProps {
  caseId: string;
  customerName: string;
  activities: any[];
  onComplete?: () => void;
  onViewDetails?: () => void;
}

export function WorkflowProgressInline({ 
  caseId, 
  customerName, 
  activities, 
  onComplete,
  onViewDetails 
}: WorkflowProgressInlineProps) {
  const [steps, setSteps] = useState<WorkflowStep[]>([
    {
      id: 'upload',
      name: 'Case Created',
      description: 'ACIP verification case initialized',
      icon: Upload,
      status: 'success',
      subSteps: [
        { name: 'Case record created', status: 'done' },
        { name: 'Document uploaded', status: 'done' },
        { name: 'Workflow initiated', status: 'done' },
      ]
    },
    {
      id: 'document_inspector',
      name: 'Document Inspector',
      description: 'Analyzing ID document with AI vision',
      icon: FileSearch,
      status: 'active',
      subSteps: [
        { name: 'Reading document image', status: 'active' },
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
  const [currentThought, setCurrentThought] = useState<string>('AI Document Inspector analyzing the uploaded ID...');
  const [extractedData, setExtractedData] = useState<Record<string, any> | null>(null);
  const [verificationResults, setVerificationResults] = useState<Record<string, any> | null>(null);

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

        if (step.id === 'document_inspector' && latest.data) {
          setExtractedData(latest.data);
        }
        
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
        return <Loader2 className="w-5 h-5 animate-spin text-red-600" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-emerald-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-slate-300" />;
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
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h4 className="text-sm font-semibold text-slate-700 mb-3">Extracted Data</h4>
        <div className="grid grid-cols-2 gap-3">
          {fields.map((field, i) => (
            <div key={i}>
              <div className="text-xs text-slate-500">{field.label}</div>
              <div className="text-sm font-medium text-slate-800">{field.value}</div>
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
          : 'Extracted data matches data present in our database'
      },
      { 
        name: 'PEP (Politically Exposed Persons)', 
        status: (verificationResults.pep_status || (verificationResults.pep_result?.is_pep ? 'FLAGGED' : 'CLEAR')).toUpperCase(),
        description: 'Screens for individuals with political connections requiring enhanced due diligence'
      },
      { 
        name: 'Sanctions Check', 
        status: (verificationResults.sanctions_status || (verificationResults.sanctions_result?.is_sanctioned ? 'FLAGGED' : 'CLEAR')).toUpperCase(),
        description: 'Checks against OFAC, UN, and EU sanctions lists for prohibited individuals'
      },
      { 
        name: 'Name Match', 
        status: verificationResults.name_match_status,
        description: 'Compares extracted name with internal database records'
      },
      { 
        name: 'DOB Match', 
        status: verificationResults.dob_match_status,
        description: 'Compares extracted date of birth with internal database records'
      },
    ].filter(c => c.status);

    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h4 className="text-sm font-semibold text-slate-700 mb-3">External Verification Checks</h4>
        <div className="space-y-2 mb-3">
          {checks.map((check, i) => (
            <div key={i} className="bg-slate-50 rounded border border-slate-200 p-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-medium text-slate-700">{check.name}</span>
                <span className={clsx(
                  'px-2 py-1 rounded text-xs font-medium',
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
          <div className="pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-600">Overall Status:</span>
              <span className={clsx(
                'px-3 py-1 rounded text-sm font-semibold',
                verificationResults.overall_status === 'VERIFIED' 
                  ? 'bg-emerald-100 text-emerald-700' 
                  : 'bg-amber-100 text-amber-700'
              )}>
                {verificationResults.overall_status}
              </span>
            </div>
            
            {verificationResults.rationale && verificationResults.rationale.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded p-2 mt-2">
                <div className="text-[10px] uppercase tracking-wider font-bold text-amber-800 mb-1">Database Mismatch Details</div>
                <div className="text-xs text-amber-700 mb-2">Extracted data does not match data present in our database:</div>
                <ul className="space-y-1">
                  {verificationResults.rationale.map((item: string, idx: number) => (
                    <li key={idx} className="text-xs text-amber-700 flex items-start gap-1">
                      <span className="mt-0.5">•</span>
                      <span>{item}</span>
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

  // Render comparison table for PARTIAL_MATCH rationale
  const renderComparisonTable = () => {
    if (!verificationResults || !verificationResults.comparison) return null;
    
    const { extracted, database } = verificationResults.comparison;
    const discrepancies = verificationResults.discrepancies || [];
    
    const fields = [
      { 
        label: 'First Name', 
        extracted: extracted.first_name || '', 
        database: database.first_name || '',
        hasDiscrepancy: discrepancies.some((d: any) => d.field === 'First Name')
      },
      { 
        label: 'Last Name', 
        extracted: extracted.last_name || '', 
        database: database.last_name || '',
        hasDiscrepancy: discrepancies.some((d: any) => d.field === 'Last Name')
      },
      { 
        label: 'Date of Birth', 
        extracted: extracted.dob || '', 
        database: database.dob || '',
        hasDiscrepancy: discrepancies.some((d: any) => d.field === 'Date of Birth')
      },
      { 
        label: 'ID Number', 
        extracted: extracted.document_number || '', 
        database: database.id_number || '',
        hasDiscrepancy: discrepancies.some((d: any) => d.field === 'ID Number')
      },
    ];

    return (
      <div className="bg-white rounded-lg border-2 border-amber-300 p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <h4 className="text-sm font-semibold text-slate-700">PARTIAL_MATCH Rationale</h4>
        </div>
        <p className="text-xs text-slate-600 mb-3">
          The following fields differ between the extracted document data and our database:
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 text-slate-600 font-medium">Field</th>
              <th className="text-left py-2 text-slate-600 font-medium">From Document</th>
              <th className="text-left py-2 text-slate-600 font-medium">In Database</th>
              <th className="text-center py-2 text-slate-600 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, i) => {
              const matches = field.extracted.toLowerCase().trim() === field.database.toLowerCase().trim();
              return (
                <tr key={i} className={clsx(
                  'border-b border-slate-100',
                  field.hasDiscrepancy && 'bg-amber-50'
                )}>
                  <td className="py-2 text-slate-700 font-medium">{field.label}</td>
                  <td className="py-2 text-slate-800">{field.extracted || '-'}</td>
                  <td className="py-2 text-slate-800">{field.database || '-'}</td>
                  <td className="py-2 text-center">
                    {matches ? (
                      <CheckCircle className="w-4 h-4 text-emerald-600 mx-auto" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600 mx-auto" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {discrepancies.length > 0 && (
          <div className="mt-3 pt-3 border-t border-amber-200">
            <p className="text-xs font-medium text-amber-700 mb-1">Discrepancies Found:</p>
            <ul className="text-xs text-slate-600 space-y-1">
              {discrepancies.map((d: any, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-amber-600">•</span>
                  <span>
                    <span className="font-medium">{d.field}:</span> Document shows "{d.document_value}" but database has "{d.database_value}"
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onComplete}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Dashboard</span>
        </button>
        
        <div className="bg-slate-800 rounded-lg px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">ACIP Verification In Progress</h1>
                <p className="text-slate-300">{customerName}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-xs text-slate-400">Case ID</div>
                <div className="text-sm font-mono">{caseId.slice(0, 8)}...</div>
              </div>
              <div className="flex items-center gap-2 bg-slate-700 rounded-lg px-4 py-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-lg font-mono">{elapsedTime}s</span>
              </div>
            </div>
          </div>
          
          {/* Current thought/status */}
          <div className="mt-4 bg-slate-700/50 rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-sm text-slate-200">{currentThought}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Workflow Steps - Left Column */}
        <div className="col-span-2 space-y-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = step.status === 'active';
            const isPending = step.status === 'pending';
            
            return (
              <div 
                key={step.id}
                className={clsx(
                  'bg-white rounded-lg border-2 transition-all',
                  step.status === 'pending' && 'border-slate-200 opacity-50',
                  step.status === 'active' && 'border-red-400 shadow-md',
                  step.status === 'success' && 'border-emerald-400',
                  step.status === 'warning' && 'border-amber-400',
                  step.status === 'error' && 'border-red-400',
                )}
              >
                <div className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Step Number & Icon */}
                    <div className={clsx(
                      'w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0',
                      isPending ? 'bg-slate-100' : 
                      step.status === 'active' ? 'bg-red-100' :
                      step.status === 'success' ? 'bg-emerald-100' :
                      step.status === 'warning' ? 'bg-amber-100' : 'bg-red-100'
                    )}>
                      <Icon className={clsx(
                        'w-6 h-6',
                        isPending ? 'text-slate-400' : 
                        step.status === 'active' ? 'text-red-600' :
                        step.status === 'success' ? 'text-emerald-600' :
                        step.status === 'warning' ? 'text-amber-600' : 'text-red-600'
                      )} />
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h3 className={clsx(
                            'font-semibold',
                            isPending ? 'text-slate-400' : 'text-slate-800'
                          )}>
                            {step.name}
                          </h3>
                          {getStatusIcon(step.status)}
                        </div>
                        {step.duration && (
                          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">
                            {step.duration}ms
                          </span>
                        )}
                      </div>
                      
                      <p className={clsx(
                        'text-sm mt-1',
                        isPending ? 'text-slate-400' : 'text-slate-600'
                      )}>
                        {step.details || step.description}
                      </p>

                      {/* Sub-steps for active step */}
                      {isActive && step.subSteps && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {step.subSteps.map((subStep, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              {subStep.status === 'done' ? (
                                <CheckCircle className="w-4 h-4 text-emerald-500" />
                              ) : subStep.status === 'active' ? (
                                <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border-2 border-slate-300" />
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

                      {/* Data badges for completed steps */}
                      {!isPending && !isActive && step.data && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {step.data.name && (
                            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                              {step.data.name}
                            </span>
                          )}
                          {step.data.document_type && (
                            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                              {step.data.document_type}
                            </span>
                          )}
                          {step.data.overall_status && (
                            <span className={clsx(
                              'text-xs px-2 py-1 rounded font-medium',
                              step.data.overall_status === 'VERIFIED' 
                                ? 'bg-emerald-100 text-emerald-700' 
                                : 'bg-amber-100 text-amber-700'
                            )}>
                              {step.data.overall_status}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Final Decision */}
          {isComplete && finalDecision && (
            <div className={clsx(
              'rounded-lg p-6 text-center border-2',
              finalDecision.decision === 'APPROVE' && 'bg-emerald-50 border-emerald-400',
              finalDecision.decision === 'REJECT' && 'bg-red-50 border-red-400',
              finalDecision.decision === 'ESCALATE' && 'bg-amber-50 border-amber-400',
            )}>
              <div className="flex items-center justify-center gap-3 mb-3">
                {finalDecision.decision === 'APPROVE' && (
                  <>
                    <CheckCircle className="w-10 h-10 text-emerald-600" />
                    <span className="text-2xl font-bold text-emerald-700">APPROVED</span>
                  </>
                )}
                {finalDecision.decision === 'REJECT' && (
                  <>
                    <XCircle className="w-10 h-10 text-red-600" />
                    <span className="text-2xl font-bold text-red-700">REJECTED</span>
                  </>
                )}
                {finalDecision.decision === 'ESCALATE' && (
                  <>
                    <div className="flex items-center gap-2 text-amber-600">
                      <Bot className="w-8 h-8" />
                      <ArrowRight className="w-5 h-5" />
                      <User className="w-8 h-8" />
                    </div>
                    <span className="text-2xl font-bold text-amber-700">HUMAN REVIEW REQUIRED</span>
                  </>
                )}
              </div>
              
              <div className="flex items-center justify-center gap-4">
                <span className={clsx(
                  'px-3 py-1.5 rounded-full text-sm font-semibold',
                  finalDecision.risk === 'LOW' && 'bg-emerald-200 text-emerald-800',
                  finalDecision.risk === 'MEDIUM' && 'bg-amber-200 text-amber-800',
                  finalDecision.risk === 'HIGH' && 'bg-red-200 text-red-800',
                )}>
                  {finalDecision.risk} Risk
                </span>
                {finalDecision.confidence && (
                  <span className="text-slate-600">
                    {(finalDecision.confidence * 100).toFixed(0)}% Confidence
                  </span>
                )}
              </div>

              {finalDecision.decision === 'ESCALATE' && (
                <p className="mt-3 text-amber-700">
                  This case has been flagged for human review in the Exception Queue
                </p>
              )}

              <div className="mt-5 flex justify-center gap-3">
                {onViewDetails && (
                  <button
                    onClick={() => {
                      if (onViewDetails) {
                        onViewDetails();
                      }
                    }}
                    className="px-4 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    View Case Details
                  </button>
                )}
                <button
                  onClick={() => {
                    if (onComplete) {
                      onComplete();
                    }
                  }}
                  className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors font-medium"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Data Panel - Right Column */}
        <div className="space-y-4">
          {extractedData && renderExtractedData()}
          {verificationResults && renderVerificationTable()}
          {verificationResults && verificationResults.overall_status === 'PARTIAL_MATCH' && renderComparisonTable()}
          
          {!extractedData && !verificationResults && (
            <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
              <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500">Waiting for data extraction...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
