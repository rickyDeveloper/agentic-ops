import axios from 'axios';
import type { 
  ACIPCase, 
  CaseAction, 
  AuditLog, 
  CaseStats, 
  CaseListResponse,
  ActionType,
  Customer,
  AgentActivity
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Customers API
export const customersApi = {
  // List all customers
  list: async (): Promise<Customer[]> => {
    const { data } = await api.get('/customers');
    return data;
  },

  // Get customer by ID
  get: async (customerId: string): Promise<Customer> => {
    const { data } = await api.get(`/customers/${customerId}`);
    return data;
  },
};

// Document type for available documents
interface AvailableDocument {
  filename: string;
  path: string;
  size: number;
}

// Cases API
export const casesApi = {
  // List cases with filters
  list: async (params?: {
    status?: string;
    risk_level?: string;
    search?: string;
    overdue_only?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<CaseListResponse> => {
    const { data } = await api.get('/cases', { params });
    return data;
  },

  // Get case by ID
  get: async (caseId: string): Promise<ACIPCase> => {
    const { data } = await api.get(`/cases/${caseId}`);
    return data;
  },

  // List available documents for testing
  listDocuments: async (): Promise<AvailableDocument[]> => {
    const { data } = await api.get('/cases/documents');
    return data;
  },

  // Create new case with document upload
  create: async (formData: FormData): Promise<ACIPCase> => {
    const { data } = await api.post('/cases', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  // Create case with existing document (for demo/testing)
  createWithExistingDoc: async (customerId: string, documentFilename: string, notes?: string): Promise<ACIPCase> => {
    const formData = new FormData();
    formData.append('customer_id', customerId);
    formData.append('document_filename', documentFilename);
    if (notes) formData.append('notes', notes);
    
    const { data } = await api.post('/cases/with-existing-doc', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  // Update case
  update: async (caseId: string, updates: Partial<ACIPCase>): Promise<ACIPCase> => {
    const { data } = await api.patch(`/cases/${caseId}`, updates);
    return data;
  },

  // Get case statistics
  getStats: async (): Promise<CaseStats> => {
    const { data } = await api.get('/cases/stats');
    return data;
  },

  // Get audit trail
  getAuditTrail: async (caseId: string): Promise<AuditLog[]> => {
    const { data } = await api.get(`/cases/${caseId}/audit`);
    return data;
  },

  // Get agent activities
  getActivities: async (caseId: string): Promise<{ case_id: string; activities: AgentActivity[]; total: number }> => {
    const { data } = await api.get(`/cases/${caseId}/activities`);
    return data;
  },

  // Get document URL
  getDocumentUrl: (caseId: string): string => {
    return `/api/cases/${caseId}/document`;
  },

  // Generate and download ACIP report with user notes
  downloadReport: async (caseId: string): Promise<void> => {
    const response = await api.get(`/cases/${caseId}/report`, {
      responseType: 'blob',
    });
    
    // Create blob and download
    const blob = new Blob([response.data], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `acip_report_${caseId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};

// Actions API
export const actionsApi = {
  // Perform action on case
  perform: async (
    caseId: string,
    action: {
      action_type: ActionType;
      performed_by: string;
      notes?: string;
      escalated_to?: string;
      requested_documents?: string;
      override_data?: Record<string, unknown>;
    }
  ): Promise<CaseAction> => {
    const { data } = await api.post(`/cases/${caseId}/actions`, action);
    return data;
  },

  // List actions for case
  list: async (caseId: string): Promise<CaseAction[]> => {
    const { data } = await api.get(`/cases/${caseId}/actions`);
    return data;
  },

  // Bulk approve cases
  bulkApprove: async (
    caseIds: string[],
    performedBy: string,
    notes?: string
  ): Promise<{ approved: string[]; failed: { case_id: string; reason: string }[] }> => {
    const { data } = await api.post('/cases/bulk-approve', {
      case_ids: caseIds,
      performed_by: performedBy,
      notes,
    });
    return data;
  },
};

export default api;
