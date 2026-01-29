// Customer types

export interface Customer {
  customer_id: string;
  first_name: string;
  last_name: string;
  dob: string;
  id_number: string;
  document_type: string;
  email?: string;
  phone?: string;
}

// ACIP Case types

export type CaseStatus = 
  | 'pending'
  | 'processing'
  | 'ai_review'
  | 'awaiting_human'
  | 'approved'
  | 'rejected'
  | 'escalated'
  | 'docs_requested'
  | 'verified';

export type RiskLevel = 'low' | 'medium' | 'high' | 'unknown';

export type ActionType = 
  | 'approve'
  | 'reject'
  | 'escalate'
  | 'request_docs'
  | 'manual_override'
  | 'add_note'
  | 'assign'
  | 'resume';

export interface ACIPCase {
  id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  document_path: string;
  document_type?: string;
  status: CaseStatus;
  risk_level: RiskLevel;
  extracted_data?: Record<string, unknown>;
  verification_result?: Record<string, unknown>;
  ai_confidence_score?: string;
  ai_decision?: string;
  assigned_to?: string;
  escalated_to?: string;
  notes?: string;
  rejection_reason?: string;
  created_at?: string;
  updated_at?: string;
  deadline_at?: string;
  completed_at?: string;
  is_overdue: boolean;
  days_until_deadline: number;
  actions?: CaseAction[];
}

export interface CaseAction {
  id: string;
  case_id: string;
  action_type: ActionType;
  performed_by: string;
  notes?: string;
  previous_status?: string;
  new_status?: string;
  escalated_to?: string;
  requested_documents?: string;
  created_at?: string;
}

export interface AuditLog {
  id: string;
  case_id: string;
  step_name: string;
  step_number?: string;
  details?: string;
  extracted_data?: Record<string, unknown>;
  verification_result?: Record<string, unknown>;
  langgraph_node?: string;
  screenshot_path?: string;
  document_path?: string;
  performed_by?: string;
  created_at?: string;
}

export interface CaseStats {
  total_pending: number;
  total_processing: number;
  awaiting_human_review: number;
  total_approved: number;
  total_rejected: number;
  docs_requested: number;
  overdue_cases: number;
  status_breakdown: Record<string, number>;
}

export interface CaseListResponse {
  cases: ACIPCase[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface WebSocketMessage {
  type: 'connected' | 'case_update' | 'new_case' | 'action_taken' | 'bulk_action' | 'pong' | 'agent_activity' | 'workflow_started' | 'workflow_complete' | 'workflow_error';
  case_id?: string;
  customer_name?: string;
  status?: string;
  action_type?: string;
  performed_by?: string;
  timestamp?: string;
  message?: string;
  // Agent activity fields
  agent?: string;
  agent_display_name?: string;
  action?: string;
  details?: string;
  duration_ms?: number;
  data?: Record<string, unknown>;
  // Workflow complete fields
  ai_decision?: string;
  risk_level?: string;
  confidence_score?: number;
  reasoning?: string;
  inspection_success?: boolean;
  verification_status?: string;
}

export interface AgentActivity {
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
