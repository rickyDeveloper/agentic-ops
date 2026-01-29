import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dashboard } from './components/Dashboard';
import { CaseList } from './components/CaseList';
import { CaseDetail } from './components/CaseDetail';
import { NewCaseModal } from './components/NewCaseModal';
import { AgentActivityFeed } from './components/AgentActivityFeed';
import { WorkflowProgressInline } from './components/WorkflowProgressInline';
import { AgentCollaborationLoading } from './components/AgentCollaborationLoading';
import { useWebSocket } from './hooks/useWebSocket';
import { casesApi } from './services/api';
import type { ACIPCase, CaseStatus, WebSocketMessage, AgentActivity } from './types';
import { 
  LayoutDashboard, 
  FileSearch, 
  Clock, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  Plus,
  RefreshCw,
  Wifi,
  WifiOff,
  Bot,
  Eye,
  EyeOff,
  Shield
} from 'lucide-react';
import clsx from 'clsx';

type View = 'dashboard' | 'all' | 'pending' | 'awaiting' | 'approved' | 'rejected' | 'workflow';

interface ActiveWorkflow {
  caseId: string;
  customerName: string;
}

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedCase, setSelectedCase] = useState<ACIPCase | null>(null);
  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [showActivityPanel, setShowActivityPanel] = useState(true);
  const [agentActivities, setAgentActivities] = useState<AgentActivity[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<ActiveWorkflow | null>(null);
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [loadingCustomerName, setLoadingCustomerName] = useState('');
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null);
  const queryClient = useQueryClient();

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    // Handle agent activity messages
    if (message.type === 'agent_activity') {
      const activity: AgentActivity = {
        timestamp: message.timestamp || new Date().toISOString(),
        case_id: message.case_id || '',
        agent: message.agent || 'system',
        agent_display_name: message.agent_display_name || 'System',
        action: message.action || '',
        details: message.details || '',
        status: message.status || 'in_progress',
        duration_ms: message.duration_ms,
        data: message.data,
      };
      setAgentActivities(prev => [...prev.slice(-100), activity]);
      
      // Hide loading screen only when Compliance Officer completes
      // This ensures all 3 agents (Document Inspector, External Verifier, Compliance Officer) are shown
      if (showLoadingScreen && activeWorkflow && message.case_id === activeWorkflow.caseId) {
        // Only hide when Compliance Officer sends a completion message
        // This ensures the loading screen animation completes for all agents
        const isComplianceOfficerComplete = activity.agent === 'compliance_officer' && 
          (activity.status === 'success' || activity.status === 'decision' || 
           activity.action?.includes('Complete') || activity.action?.includes('Decision'));
        
        if (isComplianceOfficerComplete) {
          // Compliance Officer completed - wait a bit more then hide
          const minDisplayTime = 2000; // 2 seconds to see completion
          const elapsed = loadingStartTime ? Date.now() - loadingStartTime : 0;
          const remainingTime = Math.max(0, minDisplayTime - elapsed);
          
          setTimeout(() => {
            setShowLoadingScreen(false);
            setLoadingStartTime(null);
          }, remainingTime);
        }
        // For other agents (Document Inspector, External Verifier), don't hide yet
        // Let the loading screen animation complete naturally
      }
    }
    
    // Handle workflow started
    if (message.type === 'workflow_started') {
      setAgentActivities([{
        timestamp: message.timestamp || new Date().toISOString(),
        case_id: message.case_id || '',
        agent: 'system',
        agent_display_name: 'System',
        action: 'Workflow Started',
        details: message.message || `Processing case for ${message.customer_name}`,
        status: 'started',
      }]);
      
      // Keep loading screen visible a bit longer when workflow starts
      // It will be hidden when first agent activity arrives
    }
    
    // Handle workflow complete
    if (message.type === 'workflow_complete') {
      setAgentActivities(prev => [...prev, {
        timestamp: message.timestamp || new Date().toISOString(),
        case_id: message.case_id || '',
        agent: 'system',
        agent_display_name: 'System',
        action: 'Workflow Complete',
        details: message.message || 'ACIP verification completed',
        status: message.ai_decision === 'APPROVE' ? 'success' : 
                message.ai_decision === 'REJECT' ? 'error' : 'decision',
        data: {
          decision: message.ai_decision,
          risk_level: message.risk_level,
          confidence: message.confidence_score,
        }
      }]);
    }
    
    // Handle case updates
    if (message.type === 'case_update' || message.type === 'new_case' || message.type === 'action_taken') {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['caseStats'] });
      
      if (selectedCase && message.case_id === selectedCase.id) {
        queryClient.invalidateQueries({ queryKey: ['case', selectedCase.id] });
      }
    }
  }, [queryClient, selectedCase, showLoadingScreen, activeWorkflow, loadingStartTime]);

  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
  });

  // Fetch statistics
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['caseStats'],
    queryFn: casesApi.getStats,
    refetchInterval: 30000,
  });

  const getStatusFilter = (): CaseStatus | undefined => {
    switch (currentView) {
      case 'pending': return 'pending';
      case 'awaiting': return 'awaiting_human';
      case 'approved': return 'approved';
      case 'rejected': return 'rejected';
      default: return undefined;
    }
  };

  const handleCaseSelect = (caseItem: ACIPCase) => {
    setSelectedCase(caseItem);
  };

  const handleCloseDetail = () => {
    setSelectedCase(null);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    queryClient.invalidateQueries({ queryKey: ['caseStats'] });
  };

  // Handle new case created - show loading screen first, then switch to workflow view
  const handleCaseCreated = (caseId: string, customerName: string) => {
    setShowNewCaseModal(false);
    setLoadingCustomerName(customerName);
    setShowLoadingScreen(true);
    setLoadingStartTime(Date.now());
    setActiveWorkflow({ caseId, customerName });
    setCurrentView('workflow');
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    queryClient.invalidateQueries({ queryKey: ['caseStats'] });
    
    // Fallback: Hide loading screen after 30 seconds even if no activities arrive
    // This ensures all 3 agents (Document Inspector, External Verifier, Compliance Officer) have time to show
    // Document Inspector: ~8s, External Verifier: ~18s, Compliance Officer: ~10s = ~36s total
    setTimeout(() => {
      setShowLoadingScreen(false);
      setLoadingStartTime(null);
    }, 30000);
  };

  // Handle workflow complete - go to dashboard or case detail
  const handleWorkflowComplete = () => {
    setCurrentView('dashboard');
    setActiveWorkflow(null);
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    queryClient.invalidateQueries({ queryKey: ['caseStats'] });
  };

  const handleViewCaseDetail = (caseId: string) => {
    setActiveWorkflow(null);
    // Fetch the case and show detail
    casesApi.get(caseId).then(caseData => {
      setSelectedCase(caseData);
      // Keep current view or switch to 'all' if on workflow view
      if (currentView === 'workflow') {
        setCurrentView('all');
      }
    }).catch(error => {
      console.error('Failed to load case:', error);
      // Still switch view even if fetch fails
      if (currentView === 'workflow') {
        setCurrentView('all');
      }
    });
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, count: undefined },
    { id: 'all', label: 'All Cases', icon: FileSearch, count: undefined },
    { id: 'pending', label: 'Pending', icon: Clock, count: stats?.total_pending },
    { id: 'awaiting', label: 'Awaiting Review', icon: AlertTriangle, count: stats?.awaiting_human_review },
    { id: 'approved', label: 'Approved', icon: CheckCircle, count: stats?.total_approved },
    { id: 'rejected', label: 'Rejected', icon: XCircle, count: stats?.total_rejected },
  ];

  // Filter activities for active workflow
  const workflowActivities = activeWorkflow 
    ? agentActivities.filter(a => a.case_id === activeWorkflow.caseId)
    : [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header - NAB-inspired clean header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="flex items-center">
                <img 
                  src="https://www.nab.com.au/etc.clientlibs/nab/clientlibs/clientlib-generated-components/resources/images/svg/nab-logo.svg" 
                  alt="NAB Logo" 
                  className="h-8 w-auto"
                  onError={(e) => {
                    // Fallback to text logo if image fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent && !parent.querySelector('.nab-text-logo')) {
                      const textLogo = document.createElement('div');
                      textLogo.className = 'nab-text-logo text-red-700 font-bold text-xl';
                      textLogo.textContent = 'NAB';
                      parent.appendChild(textLogo);
                    }
                  }}
                />
              </div>
              <div className="h-8 w-px bg-slate-300 mx-2" />
              <div>
                <h1 className="text-xl font-bold text-slate-900">FinCrime Operations</h1>
                <p className="text-xs text-slate-500">Customer Identification System</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {/* Connection Status */}
              <div className={clsx(
                'flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-sm',
                isConnected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              )}>
                {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                <span className="font-medium">{isConnected ? 'Connected' : 'Offline'}</span>
              </div>
              
              {/* Toggle Activity Panel */}
              <button
                onClick={() => setShowActivityPanel(!showActivityPanel)}
                className={clsx(
                  'flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-colors border',
                  showActivityPanel 
                    ? 'bg-slate-100 text-slate-700 border-slate-300' 
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                )}
              >
                {showActivityPanel ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                <span className="text-sm font-medium">AI Activity</span>
              </button>
              
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              
              {/* New Case Button - NAB Red */}
              <button
                onClick={() => setShowNewCaseModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                <span>New ACIP Check</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar Navigation */}
        <nav className="w-64 flex-shrink-0 border-r border-slate-200 min-h-[calc(100vh-4rem)] bg-white">
          <div className="p-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id as View);
                    if (item.id !== 'workflow') {
                      setActiveWorkflow(null);
                    }
                  }}
                  className={clsx(
                    'w-full flex items-center justify-between px-4 py-3 rounded-lg mb-1 transition-all',
                    isActive 
                      ? 'bg-red-50 text-red-700 border-l-4 border-red-700' 
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  )}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={clsx('w-5 h-5', isActive ? 'text-red-700' : 'text-slate-400')} />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  {item.count !== undefined && item.count > 0 && (
                    <span className={clsx(
                      'px-2 py-0.5 text-xs rounded-full font-medium',
                      isActive 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-slate-100 text-slate-600'
                    )}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          
          {/* Overdue Warning */}
          {stats && stats.overdue_cases > 0 && (
            <div className="mx-4 mb-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 text-amber-700">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-semibold">{stats.overdue_cases} Overdue</span>
              </div>
              <p className="mt-1 text-sm text-amber-600">
                Exceeding 15-day AUSTRAC deadline
              </p>
            </div>
          )}
          
          {/* Quick Stats */}
          <div className="mx-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Performance
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">AI Processed</span>
                <span className="text-green-700 font-semibold">95%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Avg. Time</span>
                <span className="text-slate-900 font-semibold">~45s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Cost Saved</span>
                <span className="text-slate-900 font-semibold">$19.50/case</span>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 min-w-0 p-6 bg-slate-50">
          {showLoadingScreen && loadingCustomerName ? (
            <AgentCollaborationLoading
              customerName={loadingCustomerName}
              onComplete={() => {
                // Loading screen animation complete, but keep showing until real activities arrive
                // This is handled by WebSocket message handler
              }}
            />
          ) : currentView === 'workflow' && activeWorkflow ? (
            <WorkflowProgressInline
              caseId={activeWorkflow.caseId}
              customerName={activeWorkflow.customerName}
              activities={workflowActivities}
              onComplete={handleWorkflowComplete}
              onViewDetails={() => handleViewCaseDetail(activeWorkflow.caseId)}
            />
          ) : currentView === 'dashboard' ? (
            <Dashboard stats={stats} isLoading={statsLoading} onViewChange={setCurrentView} />
          ) : (
            <CaseList 
              statusFilter={getStatusFilter()} 
              onSelectCase={handleCaseSelect}
            />
          )}
        </main>

        {/* Agent Activity Panel - Live Reasoning Sidebar */}
        {showActivityPanel && (
          <aside className="w-80 flex-shrink-0 border-l border-slate-200 bg-white min-h-[calc(100vh-4rem)]">
            <div className="p-3 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Bot className="w-4 h-4 text-slate-600" />
                  <h2 className="font-medium text-sm text-slate-900">AI Reasoning</h2>
                </div>
                {activeWorkflow && (
                  <span className="px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-700 font-medium animate-pulse">
                    Live
                  </span>
                )}
              </div>
            </div>
            
            <div className="p-3">
              <AgentActivityFeed 
                activities={agentActivities}
                maxHeight="calc(100vh - 10rem)"
              />
            </div>
          </aside>
        )}
      </div>

      {/* Case Detail Slide-over */}
      {selectedCase && (
        <CaseDetail 
          caseId={selectedCase.id} 
          onClose={handleCloseDetail}
          onActionComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['cases'] });
            queryClient.invalidateQueries({ queryKey: ['caseStats'] });
          }}
        />
      )}

      {/* New Case Modal - Simple form only */}
      {showNewCaseModal && (
        <NewCaseModal 
          onClose={() => setShowNewCaseModal(false)}
          onCaseCreated={handleCaseCreated}
        />
      )}
    </div>
  );
}

export default App;
