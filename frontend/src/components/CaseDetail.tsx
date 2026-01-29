import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { casesApi, actionsApi, customersApi } from '../services/api';
import { ActionPanel } from './ActionPanel';
import { AuditTrail } from './AuditTrail';
import { ReportGenerationLoading } from './ReportGenerationLoading';
import { 
  X, 
  User, 
  FileText, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Image,
  Bot,
  MessageSquare,
  Shield,
  XCircle,
  Download
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';

interface CaseDetailProps {
  caseId: string;
  onClose: () => void;
  onActionComplete: () => void;
}

export function CaseDetail({ caseId, onClose, onActionComplete }: CaseDetailProps) {
  const [activeTab, setActiveTab] = useState<'review' | 'details' | 'audit'>('review');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showReportLoading, setShowReportLoading] = useState(false);
  const [reportContent, setReportContent] = useState<string>('');

  const { data: caseData, isLoading, refetch } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => casesApi.get(caseId),
  });

  const { data: actions } = useQuery({
    queryKey: ['actions', caseId],
    queryFn: () => actionsApi.list(caseId),
    enabled: !!caseId,
  });

  // Extract customer_id from case notes
  const customerId = useMemo(() => {
    if (!caseData?.notes) return null;
    const match = caseData.notes.match(/Customer ID:\s*([A-Z0-9-]+)/i);
    return match ? match[1] : null;
  }, [caseData?.notes]);

  // Get verification result early (needed for database_record check)
  const verificationResult = caseData?.verification_result || {};

  // Get customer database data - check verification_result first (from backend), then fetch if needed
  const dbRecordFromVerification = (verificationResult as any)?.database_record;
  const { data: customerDataFromApi } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => customersApi.get(customerId!),
    enabled: !!customerId && !dbRecordFromVerification,
  });
  
  // Use database_record from verification_result if available, otherwise use fetched data
  const customerData = dbRecordFromVerification || customerDataFromApi;

  const handleActionComplete = async () => {
    await refetch();
    
    // Check if case was just approved - show report loading then modal
    const updatedCase = await casesApi.get(caseId);
    if (updatedCase.status === 'approved') {
      // Show loading screen first
      setShowReportLoading(true);
      setShowReportModal(true);
      
      // After loading completes, fetch and show the report
      // The loading component will call handleReportLoadingComplete
    }
    
    onActionComplete();
  };

  const handleReportLoadingComplete = async () => {
    // Loading animation complete, now fetch the actual report
    try {
      const response = await fetch(`/api/cases/${caseId}/report`);
      const reportText = await response.text();
      setReportContent(reportText);
      setShowReportLoading(false);
    } catch (error) {
      console.error('Failed to fetch report:', error);
      setReportContent('Error generating report. Please try again.');
      setShowReportLoading(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      await casesApi.downloadReport(caseId);
    } catch (error) {
      console.error('Failed to download report:', error);
      alert('Failed to download report. Please try again.');
    }
  };

  const handleViewReport = async () => {
    // Show loading screen first
    setShowReportLoading(true);
    setShowReportModal(true);
    
    // After loading completes, fetch and show the report
    // The loading component will call handleReportLoadingComplete
  };

  // Helper function to get database value for a field
  const getDbValueForField = (customer: any, field: string): string | null => {
    const fieldMap: Record<string, string> = {
      'first_name': 'first_name',
      'last_name': 'last_name',
      'dob': 'dob',
      'document_number': 'id_number',
      'id_number': 'id_number',
      'document_type': 'document_type',
      'email': 'email',
      'phone': 'phone',
    };
    
    const dbField = fieldMap[field];
    return dbField ? customer[dbField] || null : null;
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className="relative w-full max-w-4xl bg-white shadow-xl animate-pulse">
          <div className="p-6 space-y-4">
            <div className="h-8 bg-slate-200 rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (!caseData) return null;

  const needsAction = ['awaiting_human', 'escalated'].includes(caseData.status);
  const isComplete = ['approved', 'rejected', 'verified'].includes(caseData.status);
  // Show action panel for all statuses - allow notes even on pending cases
  const canAddNotes = true; // Always allow adding notes/actions

  // Extract AI insights for display
  // Check multiple possible locations for extracted data:
  // 1. Direct extracted_data field (primary location - stored from extraction_result)
  // 2. inspection_result.extracted_data (from workflow state)
  // 3. verification_result.inspection_result.extracted_data
  let extractedData: any = caseData.extracted_data || {};
  
  // If extracted_data is empty or null, try to get it from other locations
  if (!extractedData || Object.keys(extractedData).length === 0 || Object.values(extractedData).every(v => !v)) {
    extractedData = (caseData as any).inspection_result?.extracted_data ||
                   (verificationResult as any)?.inspection_result?.extracted_data ||
                   (verificationResult as any)?.extracted_data ||
                   {};
  }
  
  // If still empty, try to reconstruct from actions/audit logs
  if (!extractedData || Object.keys(extractedData).length === 0 || Object.values(extractedData).every(v => !v)) {
    // Check if actions have extracted data in their data field
    const actionWithData = actions?.find((a: any) => 
      a.data && (a.data.extracted_data || a.data.name || a.data.first_name || a.data.document_number)
    );
    if (actionWithData?.data) {
      if (actionWithData.data.extracted_data) {
        extractedData = actionWithData.data.extracted_data;
      } else {
        // Reconstruct from activity data
        extractedData = {
          first_name: actionWithData.data.first_name,
          last_name: actionWithData.data.last_name,
          name: actionWithData.data.name || `${actionWithData.data.first_name || ''} ${actionWithData.data.last_name || ''}`.trim(),
          document_type: actionWithData.data.document_type,
          document_number: actionWithData.data.document_number,
          id_number: actionWithData.data.document_number || actionWithData.data.id_number,
          date_of_birth: actionWithData.data.date_of_birth,
          dob: actionWithData.data.dob || actionWithData.data.date_of_birth,
          expiry_date: actionWithData.data.expiry_date,
          nationality: actionWithData.data.nationality || actionWithData.data.country,
          gender: actionWithData.data.gender
        };
        // Remove empty values
        Object.keys(extractedData).forEach(key => {
          if (!extractedData[key]) delete extractedData[key];
        });
      }
    }
  }
  
  // Final fallback: empty object
  if (!extractedData || Object.keys(extractedData).length === 0) {
    extractedData = {};
  }
  
  // Debug logging
  if (!extractedData || Object.keys(extractedData).length === 0) {
    console.warn('[CaseDetail] No extracted data found. Debug info:', {
      caseId,
      caseDataExtracted: caseData?.extracted_data,
      inspectionResult: (caseData as any)?.inspection_result,
      verificationResult: verificationResult,
      actionsCount: actions?.length,
      actionsWithData: actions?.filter((a: any) => a.data).length
    });
  } else {
    console.log('[CaseDetail] Extracted data found:', Object.keys(extractedData));
  }
  
  // verificationResult already defined above
  const aiConfidence = caseData.ai_confidence_score ? parseFloat(caseData.ai_confidence_score) * 100 : null;
  
  // Get compliance result if available
  const complianceResult = (caseData as any).compliance_result || {};
  const riskFactors = complianceResult.risk_factors || [];
  const mitigatingFactors = complianceResult.mitigating_factors || [];
  const reasoning = complianceResult.reasoning || '';
  
  // Get database match details
  const dbMatch = (verificationResult as any).database_match || {};
  const discrepancies = dbMatch.discrepancies || [];
  const matchedFields = dbMatch.matched_fields || [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      
      <div className="relative w-full max-w-4xl bg-white shadow-xl flex flex-col h-full">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-8 h-8 rounded-lg flex items-center justify-center',
              needsAction && 'bg-amber-100',
              isComplete && caseData.status === 'approved' && 'bg-green-100',
              isComplete && caseData.status === 'rejected' && 'bg-red-100',
              !needsAction && !isComplete && 'bg-slate-100'
            )}>
              {needsAction ? (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              ) : caseData.status === 'approved' ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : caseData.status === 'rejected' ? (
                <XCircle className="w-4 h-4 text-red-600" />
              ) : (
                <Bot className="w-4 h-4 text-slate-500" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">{caseData.customer_name}</h2>
              <p className="text-xs text-slate-500">{caseData.id.slice(0, 8)}... • {caseData.document_type || 'Document'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(caseData.status === 'approved' || caseData.status === 'rejected') && (
              <button
                onClick={handleViewReport}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-700 text-white rounded hover:bg-red-800 transition-colors"
                title="View AUSTRAC Report"
              >
                <FileText className="w-4 h-4" />
                <span>View Report</span>
              </button>
            )}
            <button
              onClick={handleDownloadReport}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-600 text-white rounded hover:bg-slate-700 transition-colors"
              title="Download ACIP Report"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 border-b border-slate-200 bg-white">
          <nav className="flex space-x-6">
            {[
              { id: 'review', label: 'Review', show: true },
              { id: 'details', label: 'Details', show: true },
              { id: 'audit', label: 'Audit Trail', show: true },
            ].filter(t => t.show).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={clsx(
                  'py-2.5 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-red-700 text-red-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'review' ? (
            /* Split-Screen HITL Review Layout */
            <div className="h-full flex">
              {/* Left: AI Evidence */}
              <div className="w-1/2 border-r border-slate-200 overflow-y-auto p-4 bg-slate-50">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <Bot className="w-4 h-4" />
                      AI Evidence & Findings
                    </div>
                    <div className="text-xs text-slate-500">
                      Three AI Agents Processed
                    </div>
                  </div>
                  
                  {/* Agent Explanation */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
                    <div className="font-medium text-blue-900 mb-2">AI Agent Pipeline:</div>
                    <div className="space-y-1.5 text-blue-800">
                      <div>1. <strong>Document Inspector:</strong> Extracts data from document image</div>
                      <div>2. <strong>External Verifier:</strong> Checks DVS, PEP & Sanctions databases</div>
                      <div>3. <strong>Compliance Officer:</strong> Assesses risk & recommends action</div>
                    </div>
                  </div>
                  
                  {/* Document Preview */}
                  <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-100 text-xs font-medium text-slate-500 flex items-center gap-1.5">
                      <Image className="w-3.5 h-3.5" />
                      Submitted Document
                    </div>
                    <div className="p-3">
                      <a
                        href={casesApi.getDocumentUrl(caseData.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block bg-slate-100 rounded-lg p-4 text-center hover:bg-slate-200 transition-colors"
                      >
                        <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                        <span className="text-sm text-red-700 flex items-center justify-center gap-1">
                          View Document <ExternalLink className="w-3 h-3" />
                        </span>
                      </a>
                    </div>
                  </div>
                  
                  {/* Customer Database Record */}
                  {customerData && (
                    <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
                      <div className="px-3 py-2 border-b border-green-100 text-xs font-medium text-green-700 flex items-center gap-1.5 bg-green-50">
                        <User className="w-3.5 h-3.5" />
                        Customer Database Record
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Customer ID</span>
                          <span className="text-slate-900 font-medium">{customerData.customer_id}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">First Name</span>
                          <span className="text-slate-900 font-medium">{customerData.first_name}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Last Name</span>
                          <span className="text-slate-900 font-medium">{customerData.last_name}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Date of Birth</span>
                          <span className="text-slate-900 font-medium">{customerData.dob}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">ID Number</span>
                          <span className="text-slate-900 font-medium">{customerData.id_number}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Document Type</span>
                          <span className="text-slate-900 font-medium">{customerData.document_type}</span>
                        </div>
                        {customerData.email && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Email</span>
                            <span className="text-slate-900 font-medium">{customerData.email}</span>
                          </div>
                        )}
                        {customerData.phone && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Phone</span>
                            <span className="text-slate-900 font-medium">{customerData.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Extracted Data - Only show if we have data */}
                  {extractedData && Object.keys(extractedData).length > 0 && Object.values(extractedData).some(v => {
                    if (v === null || v === undefined) return false;
                    const strValue = String(v).trim();
                    return strValue !== '' && strValue !== 'null' && strValue !== 'None' && strValue !== 'N/A';
                  }) ? (
                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                      <div className="px-3 py-2 border-b border-slate-100 text-xs font-medium text-slate-500 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" />
                          Extracted from Document
                        </span>
                        {aiConfidence && (
                          <span className={clsx(
                            'px-1.5 py-0.5 rounded text-xs font-medium',
                            aiConfidence >= 80 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          )}>
                            {aiConfidence.toFixed(0)}% confident
                          </span>
                        )}
                      </div>
                      <div className="p-3 space-y-2">
                        {Object.entries(extractedData)
                          .filter(([key, value]) => {
                            // Filter out empty values
                            if (value === null || value === undefined) return false;
                            const strValue = String(value).trim();
                            if (strValue === '' || strValue === 'null' || strValue === 'None' || strValue === 'N/A') return false;
                            return true;
                          })
                          .map(([key, value]) => {
                            // Compare with database if available
                            const dbValue = customerData ? getDbValueForField(customerData, key) : null;
                            const matches = dbValue && String(value).toUpperCase().trim() === String(dbValue).toUpperCase().trim();
                            
                            return (
                              <div key={key} className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 capitalize">{key.replace(/_/g, ' ')}</span>
                                <div className="flex items-center gap-2">
                                  <span className={clsx(
                                    'text-slate-900 font-medium',
                                    matches && 'text-green-700'
                                  )}>
                                    {String(value)}
                                  </span>
                                  {matches && (
                                    <CheckCircle className="w-3.5 h-3.5 text-green-600" title="Matches database" />
                                  )}
                                  {dbValue && !matches && (
                                    <span className="text-xs text-red-600" title={`Database: ${dbValue}`}>
                                      ≠ DB
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ) : null}
                  
                  {/* Database Comparison - Side by Side */}
                  {customerData && Object.keys(extractedData).length > 0 && (
                    <div className="bg-white rounded-lg border border-blue-200 overflow-hidden">
                      <div className="px-3 py-2 border-b border-blue-100 text-xs font-medium text-blue-700 flex items-center gap-1.5 bg-blue-50">
                        <Shield className="w-3.5 h-3.5" />
                        Document vs Database Comparison
                      </div>
                      <div className="p-3 space-y-2">
                        {/* Name Comparison */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Document Name</div>
                            <div className="font-medium text-slate-900">
                              {extractedData.first_name || ''} {extractedData.last_name || ''}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Database Name</div>
                            <div className={clsx(
                              'font-medium',
                              (extractedData.first_name?.toUpperCase() === customerData.first_name?.toUpperCase() &&
                               extractedData.last_name?.toUpperCase() === customerData.last_name?.toUpperCase())
                                ? 'text-green-700' : 'text-red-700'
                            )}>
                              {customerData.first_name} {customerData.last_name}
                              {(extractedData.first_name?.toUpperCase() !== customerData.first_name?.toUpperCase() ||
                                extractedData.last_name?.toUpperCase() !== customerData.last_name?.toUpperCase()) && (
                                <XCircle className="w-3.5 h-3.5 inline ml-1" />
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* DOB Comparison */}
                        <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-slate-100">
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Document DOB</div>
                            <div className="font-medium text-slate-900">{extractedData.dob || 'N/A'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Database DOB</div>
                            <div className={clsx(
                              'font-medium',
                              extractedData.dob?.toUpperCase() === customerData.dob?.toUpperCase()
                                ? 'text-green-700' : 'text-red-700'
                            )}>
                              {customerData.dob}
                              {extractedData.dob?.toUpperCase() !== customerData.dob?.toUpperCase() && (
                                <XCircle className="w-3.5 h-3.5 inline ml-1" />
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* ID Number Comparison */}
                        <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t border-slate-100">
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Document ID</div>
                            <div className="font-medium text-slate-900">
                              {extractedData.document_number || extractedData.id_number || 'N/A'}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Database ID</div>
                            <div className={clsx(
                              'font-medium',
                              (extractedData.document_number?.toUpperCase() === customerData.id_number?.toUpperCase() ||
                               extractedData.id_number?.toUpperCase() === customerData.id_number?.toUpperCase())
                                ? 'text-green-700' : 'text-red-700'
                            )}>
                              {customerData.id_number}
                              {(extractedData.document_number?.toUpperCase() !== customerData.id_number?.toUpperCase() &&
                                extractedData.id_number?.toUpperCase() !== customerData.id_number?.toUpperCase()) && (
                                <XCircle className="w-3.5 h-3.5 inline ml-1" />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* External Verifier Checks with Details */}
                  <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-100 text-xs font-medium text-slate-500 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5" />
                        External Verifier Checks
                      </span>
                      <span className="text-xs text-slate-400">DVS • PEP • Sanctions</span>
                    </div>
                    
                    {/* Explanation Box */}
                    <div className="px-3 py-2 bg-blue-50 border-b border-slate-100">
                      <div className="text-xs font-medium text-blue-900 mb-1.5">What are these checks?</div>
                      <div className="space-y-1 text-[11px] text-blue-800">
                        <div><strong>DVS (Document Verification Service):</strong> Verifies document authenticity against government databases</div>
                        <div><strong>PEP (Politically Exposed Persons):</strong> Screens for individuals with political connections requiring enhanced due diligence</div>
                        <div><strong>Sanctions:</strong> Checks against OFAC, UN, and EU sanctions lists for prohibited individuals</div>
                        <div><strong>Database Match:</strong> Compares extracted data with data present in our database</div>
                      </div>
                    </div>
                    <div className="p-3 space-y-2">
                      {Object.entries(verificationResult).length > 0 ? (
                        <>
                          {/* Show DVS, PEP, Sanctions checks with clear labels */}
                          {(() => {
                            const checks = [];
                            
                            // DVS Check - Show FAILED if there are database discrepancies, otherwise VERIFIED
                            // This reflects database match status rather than actual DVS verification
                            const dbMatch = verificationResult.database_match || {};
                            const hasDiscrepancies = dbMatch.discrepancies && dbMatch.discrepancies.length > 0;
                            const dvsStatus = hasDiscrepancies ? 'FAILED' : 
                                             (verificationResult.dvs_status || 
                                              (verificationResult.dvs_result?.verified ? 'VERIFIED' : 'VERIFIED')).toUpperCase();
                            if (dvsStatus) {
                              checks.push({
                                key: 'dvs',
                                label: 'DVS (Document Verification Service)',
                                value: dvsStatus,
                                description: hasDiscrepancies 
                                  ? 'Extracted data does not match data present in our database'
                                  : 'Extracted data matches data present in our database'
                              });
                            }
                            
                            // PEP Check
                            const pepStatus = (verificationResult.pep_status || 
                                             (verificationResult.pep_result?.is_pep ? 'FLAGGED' : 'CLEAR')).toUpperCase();
                            if (pepStatus) {
                              checks.push({
                                key: 'pep',
                                label: 'PEP (Politically Exposed Persons)',
                                value: pepStatus,
                                description: 'Screens for individuals with political connections'
                              });
                            }
                            
                            // Sanctions Check
                            const sanctionsStatus = (verificationResult.sanctions_status || 
                                                   (verificationResult.sanctions_result?.is_sanctioned ? 'FLAGGED' : 'CLEAR')).toUpperCase();
                            if (sanctionsStatus) {
                              checks.push({
                                key: 'sanctions',
                                label: 'Sanctions Check',
                                value: sanctionsStatus,
                                description: 'Checks against OFAC, UN, and EU sanctions lists'
                              });
                            }
                            
                            // Name Match
                            if (verificationResult.name_match_status) {
                              checks.push({
                                key: 'name_match',
                                label: 'Name Match',
                                value: verificationResult.name_match_status,
                                description: 'Compares extracted name with database records'
                              });
                            }
                            
                            // DOB Match
                            if (verificationResult.dob_match_status) {
                              checks.push({
                                key: 'dob_match',
                                label: 'DOB Match',
                                value: verificationResult.dob_match_status,
                                description: 'Compares extracted date of birth with database records'
                              });
                            }
                            
                            return checks.map((check) => {
                              const isMatch = String(check.value).toLowerCase().includes('match') || 
                                             String(check.value).toLowerCase().includes('verified') ||
                                             String(check.value).toLowerCase().includes('clear');
                              return (
                                <div key={check.key} className="py-2 border-b border-slate-100 last:border-b-0">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-sm font-medium text-slate-700">{check.label}</span>
                                    <span className={clsx(
                                      'px-2 py-0.5 rounded text-xs font-medium',
                                      isMatch ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                    )}>
                                      {String(check.value)}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">{check.description}</div>
                                </div>
                              );
                            });
                          })()}
                          
                          {/* Overall Status */}
                          {verificationResult.overall_status && (
                            <div className="mt-3 pt-3 border-t border-slate-200">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-slate-700">Overall Verification Status</span>
                                <span className={clsx(
                                  'px-2 py-1 rounded text-xs font-semibold',
                                  verificationResult.overall_status === 'VERIFIED' 
                                    ? 'bg-green-100 text-green-700' 
                                    : verificationResult.overall_status === 'PARTIAL_MATCH'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-red-100 text-red-700'
                                )}>
                                  {verificationResult.overall_status}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-1">
                                {verificationResult.overall_status === 'VERIFIED' 
                                  ? 'All checks passed - document verified successfully'
                                  : verificationResult.overall_status === 'PARTIAL_MATCH'
                                  ? 'Extracted data partially matches our database - some discrepancies found'
                                  : 'Extracted data does not match data present in our database'}
                              </div>
                            </div>
                          )}
                          
                          {/* Database Match Status - Always show when customerData exists or discrepancies are present */}
                          {(customerData || discrepancies.length > 0) && (
                            <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                              <div className="text-xs font-medium text-slate-700 mb-2">Database Match Status:</div>
                              {discrepancies.length > 0 && (
                                <div className="text-xs text-amber-600 mb-2 italic">
                                  ⚠️ Extracted data does not match data present in our database
                                </div>
                              )}
                              
                              {/* Name Match - Always show, derive from backend status or direct comparison */}
                              {(() => {
                                // Try backend status first
                                let nameStatus = verificationResult.name_match_status;
                                
                                // If no backend status, check matched_fields and discrepancies
                                if (!nameStatus) {
                                  const nameInMatched = matchedFields.some((f: string) => 
                                    f?.includes('First Name') || f?.includes('Last Name') || f?.includes('Name')
                                  );
                                  const nameDisc = discrepancies.find((d: any) => 
                                    d.field?.includes('Name') || d.field?.includes('First Name') || d.field?.includes('Last Name')
                                  );
                                  
                                  if (nameDisc) {
                                    nameStatus = 'NO_MATCH';
                                  } else if (nameInMatched) {
                                    nameStatus = 'MATCH';
                                  } else if (extractedData.first_name && extractedData.last_name && customerData.first_name && customerData.last_name) {
                                    // Direct comparison as fallback
                                    const extractedName = `${extractedData.first_name} ${extractedData.last_name}`.toUpperCase().trim();
                                    const dbName = `${customerData.first_name} ${customerData.last_name}`.toUpperCase().trim();
                                    nameStatus = extractedName === dbName ? 'MATCH' : 'NO_MATCH';
                                  }
                                }
                                
                                const nameDisc = discrepancies.find((d: any) => 
                                  d.field?.includes('Name') || d.field?.includes('First Name') || d.field?.includes('Last Name')
                                );
                                
                                // Always show if we have data to compare
                                const extractedName = (extractedData.first_name || extractedData.last_name) 
                                  ? `${extractedData.first_name || ''} ${extractedData.last_name || ''}`.trim()
                                  : null;
                                const dbName = (customerData.first_name || customerData.last_name)
                                  ? `${customerData.first_name || ''} ${customerData.last_name || ''}`.trim()
                                  : null;
                                
                                // Determine final status - prioritize backend, then discrepancy, then direct comparison
                                let displayStatus = nameStatus;
                                if (!displayStatus && nameDisc) {
                                  displayStatus = 'NO_MATCH';
                                } else if (!displayStatus && extractedName && dbName) {
                                  // Direct comparison
                                  displayStatus = extractedName.toUpperCase() === dbName.toUpperCase() ? 'MATCH' : 'NO_MATCH';
                                } else if (!displayStatus) {
                                  displayStatus = 'UNKNOWN';
                                }
                                
                                // Always show if we have customer data
                                if (customerData && (extractedName || dbName || nameDisc || displayStatus)) {
                                  return (
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-slate-500">Name Match</span>
                                      <span className={clsx(
                                        'px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1',
                                        displayStatus === 'MATCH' || displayStatus === 'PARTIAL_MATCH'
                                          ? 'bg-green-100 text-green-700' 
                                          : displayStatus === 'NO_MATCH'
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-slate-100 text-slate-600'
                                      )}>
                                        {displayStatus}
                                        {(nameDisc || (displayStatus === 'NO_MATCH' && extractedName && dbName && extractedName.toUpperCase() !== dbName.toUpperCase())) && (
                                          <span className="text-xs ml-1">
                                            ({nameDisc ? nameDisc.document_value : extractedName} ≠ {nameDisc ? nameDisc.database_value : dbName})
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                              
                              {/* DOB Match - Always show, derive from backend status or direct comparison */}
                              {(() => {
                                // Try backend status first
                                let dobStatus = verificationResult.dob_match_status;
                                
                                // If no backend status, check matched_fields and discrepancies
                                if (!dobStatus) {
                                  const dobInMatched = matchedFields.some((f: string) => 
                                    f?.includes('Date of Birth') || f?.includes('DOB')
                                  );
                                  const dobDisc = discrepancies.find((d: any) => 
                                    d.field?.includes('Date of Birth') || d.field?.includes('DOB')
                                  );
                                  
                                  if (dobDisc) {
                                    dobStatus = 'NO_MATCH';
                                  } else if (dobInMatched) {
                                    dobStatus = 'MATCH';
                                  } else if (extractedData.dob && customerData.dob) {
                                    // Direct comparison as fallback
                                    const extractedDob = String(extractedData.dob).toUpperCase().trim();
                                    const dbDob = String(customerData.dob).toUpperCase().trim();
                                    dobStatus = extractedDob === dbDob ? 'MATCH' : 'NO_MATCH';
                                  }
                                }
                                
                                const dobDisc = discrepancies.find((d: any) => 
                                  d.field?.includes('Date of Birth') || d.field?.includes('DOB')
                                );
                                
                                // Always show if we have data to compare
                                const extractedDob = extractedData.dob ? String(extractedData.dob).trim() : null;
                                const dbDob = customerData.dob ? String(customerData.dob).trim() : null;
                                
                                // Determine final status - prioritize backend, then discrepancy, then direct comparison
                                let displayStatus = dobStatus;
                                if (!displayStatus && dobDisc) {
                                  displayStatus = 'NO_MATCH';
                                } else if (!displayStatus && extractedDob && dbDob) {
                                  // Direct comparison
                                  displayStatus = extractedDob.toUpperCase() === dbDob.toUpperCase() ? 'MATCH' : 'NO_MATCH';
                                } else if (!displayStatus) {
                                  displayStatus = 'UNKNOWN';
                                }
                                
                                // Always show if we have customer data
                                if (customerData && (extractedDob || dbDob || dobDisc || displayStatus)) {
                                  return (
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-slate-500">DOB Match</span>
                                      <span className={clsx(
                                        'px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1',
                                        displayStatus === 'MATCH' || displayStatus === 'PARTIAL_MATCH'
                                          ? 'bg-green-100 text-green-700' 
                                          : displayStatus === 'NO_MATCH'
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-slate-100 text-slate-600'
                                      )}>
                                        {displayStatus}
                                        {(dobDisc || (displayStatus === 'NO_MATCH' && extractedDob && dbDob && extractedDob.toUpperCase() !== dbDob.toUpperCase())) && (
                                          <span className="text-xs ml-1">
                                            ({dobDisc ? dobDisc.document_value : extractedDob} ≠ {dobDisc ? dobDisc.database_value : dbDob})
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                              
                              {/* ID Number Match - Always show, derive from matched_fields/discrepancies or direct comparison */}
                              {(() => {
                                const idMatched = matchedFields.some((f: string) => 
                                  f?.toLowerCase().includes('id') || f?.toLowerCase().includes('document number')
                                );
                                const idDisc = discrepancies.find((d: any) => 
                                  d.field?.toLowerCase().includes('id') || d.field?.toLowerCase().includes('document number')
                                );
                                
                                // Determine status
                                let idStatus = idMatched ? 'MATCH' : (idDisc ? 'NO_MATCH' : null);
                                
                                // If no status from backend, try direct comparison
                                if (!idStatus && (extractedData.document_number || extractedData.id_number) && customerData.id_number) {
                                  const extractedId = String(extractedData.document_number || extractedData.id_number || '').toUpperCase().trim();
                                  const dbId = String(customerData.id_number || '').toUpperCase().trim();
                                  if (extractedId && dbId) {
                                    idStatus = extractedId === dbId ? 'MATCH' : 'NO_MATCH';
                                  }
                                }
                                
                                // Always show if we have data
                                const extractedId = extractedData.document_number || extractedData.id_number || null;
                                const dbId = customerData.id_number || null;
                                
                                // Determine final status - prioritize matched_fields/discrepancies, then direct comparison
                                let displayStatus = idStatus;
                                if (!displayStatus && idDisc) {
                                  displayStatus = 'NO_MATCH';
                                } else if (!displayStatus && idMatched) {
                                  displayStatus = 'MATCH';
                                } else if (!displayStatus && extractedId && dbId) {
                                  // Direct comparison
                                  displayStatus = String(extractedId).toUpperCase().trim() === String(dbId).toUpperCase().trim() ? 'MATCH' : 'NO_MATCH';
                                } else if (!displayStatus) {
                                  displayStatus = 'UNKNOWN';
                                }
                                
                                // Always show if we have customer data
                                if (customerData && (extractedId || dbId || idDisc || displayStatus)) {
                                  return (
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-slate-500">ID Number Match</span>
                                      <span className={clsx(
                                        'px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1',
                                        displayStatus === 'MATCH'
                                          ? 'bg-green-100 text-green-700' 
                                          : displayStatus === 'NO_MATCH'
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-slate-100 text-slate-600'
                                      )}>
                                        {displayStatus}
                                        {(idDisc || (displayStatus === 'NO_MATCH' && extractedId && dbId && String(extractedId).toUpperCase().trim() !== String(dbId).toUpperCase().trim())) && (
                                          <span className="text-xs ml-1">
                                            ({idDisc ? idDisc.document_value : extractedId} ≠ {idDisc ? idDisc.database_value : dbId})
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                              
                              {/* Show message if no data available */}
                              {!verificationResult.name_match_status && 
                               !verificationResult.dob_match_status && 
                               discrepancies.length === 0 && 
                               matchedFields.length === 0 &&
                               (!extractedData.first_name && !extractedData.dob && !extractedData.document_number) && (
                                <div className="text-xs text-slate-400 italic py-2">
                                  Database comparison pending - waiting for verification results
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Database Match Details */}
                          {matchedFields.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100">
                              <div className="text-xs text-green-600 mb-1 font-medium">Matched Fields:</div>
                              <div className="flex flex-wrap gap-1">
                                {matchedFields.map((field: string) => (
                                  <span key={field} className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                                    {field}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Discrepancies */}
                          {discrepancies.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100">
                              <div className="text-xs text-red-600 mb-1 font-medium">Database Mismatch Detected:</div>
                              <div className="text-xs text-slate-600 mb-2">Extracted data does not match data present in our database:</div>
                              {discrepancies.map((disc: any, idx: number) => (
                                <div key={idx} className="text-xs text-red-700 mb-1">
                                  <span className="font-medium">{disc.field}:</span> Extracted '{disc.document_value}' ≠ Database '{disc.database_value}'
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-slate-400 text-center py-2">Verification pending</div>
                      )}
                    </div>
                  </div>
                  
                  {/* Risk Assessment */}
                  {(riskFactors.length > 0 || mitigatingFactors.length > 0 || reasoning) && (
                    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                      <div className="px-3 py-2 border-b border-slate-100 text-xs font-medium text-slate-500 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5" />
                          Compliance Officer Assessment
                        </span>
                        <span className="text-xs text-slate-400" title="Compliance Officer reviews all evidence and assesses risk">
                          Final Risk Review
                        </span>
                      </div>
                      <div className="p-3 space-y-3">
                        {reasoning && (
                          <div>
                            <div className="text-xs text-slate-500 mb-1">Reasoning:</div>
                            <p className="text-sm text-slate-700">{reasoning}</p>
                          </div>
                        )}
                        {riskFactors.length > 0 && (
                          <div>
                            <div className="text-xs text-red-600 mb-1 font-medium">Risk Factors:</div>
                            <ul className="space-y-1">
                              {riskFactors.map((factor: string, idx: number) => (
                                <li key={idx} className="text-xs text-red-700 flex items-start gap-1.5">
                                  <span className="text-red-500 mt-0.5">•</span>
                                  <span>{factor}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {mitigatingFactors.length > 0 && (
                          <div>
                            <div className="text-xs text-green-600 mb-1 font-medium">Mitigating Factors:</div>
                            <ul className="space-y-1">
                              {mitigatingFactors.map((factor: string, idx: number) => (
                                <li key={idx} className="text-xs text-green-700 flex items-start gap-1.5">
                                  <span className="text-green-500 mt-0.5">•</span>
                                  <span>{factor}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* AI Recommendation */}
                  {caseData.ai_decision && (
                    <div className={clsx(
                      'rounded-lg border p-3',
                      caseData.ai_decision === 'APPROVE' && 'bg-green-50 border-green-200',
                      caseData.ai_decision === 'REJECT' && 'bg-red-50 border-red-200',
                      caseData.ai_decision === 'ESCALATE' && 'bg-amber-50 border-amber-200',
                    )}>
                      <div className="flex items-start gap-2">
                        <MessageSquare className={clsx(
                          'w-4 h-4 mt-0.5',
                          caseData.ai_decision === 'APPROVE' && 'text-green-600',
                          caseData.ai_decision === 'REJECT' && 'text-red-600',
                          caseData.ai_decision === 'ESCALATE' && 'text-amber-600',
                        )} />
                        <div>
                          <div className="text-sm font-medium text-slate-700">AI Recommendation</div>
                          <div className={clsx(
                            'text-sm mt-0.5',
                            caseData.ai_decision === 'APPROVE' && 'text-green-700',
                            caseData.ai_decision === 'REJECT' && 'text-red-700',
                            caseData.ai_decision === 'ESCALATE' && 'text-amber-700',
                          )}>
                            {caseData.ai_decision === 'APPROVE' && 'Recommend approval - all checks passed'}
                            {caseData.ai_decision === 'REJECT' && 'Recommend rejection - extracted data does not match our database'}
                            {caseData.ai_decision === 'ESCALATE' && 'Requires human review - uncertainty detected'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Right: Human Action */}
              <div className="w-1/2 overflow-y-auto p-4 bg-white">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <User className="w-4 h-4" />
                    Human Decision
                  </div>
                  
                  {/* Status Banner */}
                  {caseData.is_overdue && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span className="text-red-700 font-medium">Overdue - AUSTRAC deadline exceeded</span>
                    </div>
                  )}
                  
                  {/* Current Status */}
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">Current Status</div>
                    <div className={clsx(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium capitalize',
                      caseData.status === 'approved' && 'bg-green-100 text-green-700',
                      caseData.status === 'rejected' && 'bg-red-100 text-red-700',
                      caseData.status === 'awaiting_human' && 'bg-amber-100 text-amber-700',
                      caseData.status === 'escalated' && 'bg-orange-100 text-orange-700',
                      !['approved', 'rejected', 'awaiting_human', 'escalated'].includes(caseData.status) && 'bg-slate-100 text-slate-700',
                    )}>
                      {caseData.status === 'approved' && <CheckCircle className="w-3.5 h-3.5" />}
                      {caseData.status === 'rejected' && <XCircle className="w-3.5 h-3.5" />}
                      {(caseData.status === 'awaiting_human' || caseData.status === 'escalated') && <AlertTriangle className="w-3.5 h-3.5" />}
                      {caseData.status.replace('_', ' ')}
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      Risk Level: <span className={clsx(
                        'font-medium capitalize',
                        caseData.risk_level === 'low' && 'text-green-600',
                        caseData.risk_level === 'medium' && 'text-amber-600',
                        caseData.risk_level === 'high' && 'text-red-600',
                      )}>{caseData.risk_level}</span>
                    </div>
                  </div>
                  
                  {/* Action Panel - Show for all cases except pending/processing */}
                  {canAddNotes ? (
                    <div className={clsx(
                      'border rounded-lg p-4',
                      needsAction 
                        ? 'bg-amber-50 border-amber-200' 
                        : isComplete
                        ? 'bg-slate-50 border-slate-200'
                        : 'bg-blue-50 border-blue-200'
                    )}>
                      <div className={clsx(
                        'text-sm font-medium mb-3 flex items-center gap-2',
                        needsAction && 'text-amber-800',
                        isComplete && 'text-slate-700',
                        !needsAction && !isComplete && 'text-blue-800'
                      )}>
                        <MessageSquare className="w-4 h-4" />
                        {needsAction ? 'Action Required' : 'Add Notes or Actions'}
                      </div>
                      <ActionPanel 
                        caseId={caseId} 
                        currentStatus={caseData.status}
                        onActionComplete={handleActionComplete}
                      />
                    </div>
                  ) : (
                    <div className="bg-slate-50 rounded-lg p-4 text-center text-sm text-slate-500">
                      <Bot className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      AI is processing this case... Actions will be available once processing completes.
                    </div>
                  )}
                  
                  {/* Completion Status Banner */}
                  {isComplete ? (
                    <div className={clsx(
                      'rounded-lg p-4 border',
                      caseData.status === 'approved' && 'bg-green-50 border-green-200',
                      caseData.status === 'rejected' && 'bg-red-50 border-red-200',
                    )}>
                      <div className="flex items-center gap-2">
                        {caseData.status === 'approved' ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600" />
                        )}
                        <span className={clsx(
                          'font-medium',
                          caseData.status === 'approved' ? 'text-green-700' : 'text-red-700'
                        )}>
                          Case {caseData.status === 'approved' ? 'Approved' : 'Rejected'}
                        </span>
                      </div>
                      {caseData.rejection_reason && (
                        <p className="text-sm text-red-600 mt-2">{caseData.rejection_reason}</p>
                      )}
                      {caseData.completed_at && (
                        <p className="text-xs text-slate-500 mt-2">
                          Completed: {format(parseISO(caseData.completed_at), 'MMM d, yyyy HH:mm')}
                        </p>
                      )}
                    </div>
                  ) : null}
                  
                  {/* Previous Actions & Notes */}
                  {actions && actions.length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        Previous Actions & Notes
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {actions.map((action) => (
                          <div key={action.id} className="bg-white rounded p-2 border border-slate-200">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-slate-700 capitalize">
                                {action.action_type.replace('_', ' ')}
                              </span>
                              <span className="text-xs text-slate-500">
                                {action.created_at ? format(parseISO(action.created_at), 'MMM d, HH:mm') : ''}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 mb-1">
                              by {action.performed_by}
                            </div>
                            {action.notes && (
                              <p className="text-xs text-slate-700 mt-1 italic">"{action.notes}"</p>
                            )}
                            {action.previous_status && action.new_status && (
                              <div className="text-xs text-slate-500 mt-1">
                                Status: {action.previous_status} → {action.new_status}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Case Notes */}
                  {caseData.notes && (
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs text-slate-500 mb-1">Case Notes</div>
                      <p className="text-sm text-slate-700">{caseData.notes}</p>
                    </div>
                  )}
                  
                  {/* Timeline */}
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Timeline
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Created</span>
                        <span className="text-slate-700">
                          {caseData.created_at ? format(parseISO(caseData.created_at), 'MMM d, HH:mm') : '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Deadline</span>
                        <span className={caseData.is_overdue ? 'text-red-600 font-medium' : 'text-slate-700'}>
                          {caseData.deadline_at ? format(parseISO(caseData.deadline_at), 'MMM d') : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'details' ? (
            <div className="overflow-y-auto p-5 space-y-4">
              {/* Customer Info */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2 text-sm">
                  <User className="w-4 h-4" />
                  Customer Information
                </h3>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500 uppercase">Name</dt>
                    <dd className="mt-1 font-medium text-slate-900">{caseData.customer_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500 uppercase">Email</dt>
                    <dd className="mt-1 text-slate-700">{caseData.customer_email || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500 uppercase">Phone</dt>
                    <dd className="mt-1 text-slate-700">{caseData.customer_phone || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500 uppercase">Document Type</dt>
                    <dd className="mt-1 text-slate-700">{caseData.document_type || 'Unknown'}</dd>
                  </div>
                </dl>
              </div>

              {/* Raw Data */}
              {caseData.extracted_data && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <h3 className="font-medium text-slate-900 mb-3 text-sm">Extracted Data (Raw)</h3>
                  <pre className="text-xs bg-white p-3 rounded border border-slate-200 overflow-x-auto">
                    {JSON.stringify(caseData.extracted_data, null, 2)}
                  </pre>
                </div>
              )}

              {caseData.verification_result && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <h3 className="font-medium text-slate-900 mb-3 text-sm">Verification Result (Raw)</h3>
                  <pre className="text-xs bg-white p-3 rounded border border-slate-200 overflow-x-auto">
                    {JSON.stringify(caseData.verification_result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-y-auto p-5">
              <AuditTrail caseId={caseId} />
            </div>
          )}
        </div>
      </div>

      {/* AUSTRAC Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowReportModal(false)} />
          
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-red-700 text-white rounded-t-lg">
              <div>
                <h2 className="font-semibold text-lg">AUSTRAC ACIP Report</h2>
                <p className="text-xs text-red-100 mt-0.5">Compliance audit report with human review notes</p>
              </div>
              <div className="flex items-center gap-2">
                {!showReportLoading && (
                  <button
                    onClick={handleDownloadReport}
                    className="px-3 py-1.5 text-sm bg-white text-red-700 rounded hover:bg-red-50 transition-colors font-medium"
                  >
                    Download
                  </button>
                )}
                <button 
                  onClick={() => {
                    setShowReportModal(false);
                    setShowReportLoading(false);
                    setReportContent('');
                  }} 
                  className="p-1.5 text-white hover:bg-red-800 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5">
              {showReportLoading ? (
                <ReportGenerationLoading onComplete={handleReportLoadingComplete} />
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap text-slate-700 bg-slate-50 p-4 rounded border border-slate-200">
                  {reportContent || 'Loading report...'}
                </pre>
              )}
            </div>
            
            {!showReportLoading && (
              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 rounded-b-lg flex justify-end">
                <button
                  onClick={() => {
                    setShowReportModal(false);
                    setShowReportLoading(false);
                    setReportContent('');
                  }}
                  className="px-4 py-2 text-sm bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
