import { useState, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { casesApi, customersApi } from '../services/api';
import { X, Upload, Loader2, FileText, User, Search, CheckCircle } from 'lucide-react';
import type { Customer } from '../types';
import clsx from 'clsx';

interface NewCaseModalProps {
  onClose: () => void;
  onCaseCreated: (caseId: string, customerName: string) => void;
}

export function NewCaseModal({ onClose, onCaseCreated }: NewCaseModalProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: customers, isLoading: customersLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: customersApi.list,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer || !file) throw new Error('Missing required fields');
      const formData = new FormData();
      formData.append('customer_id', selectedCustomer.customer_id);
      formData.append('document', file);
      return casesApi.create(formData);
    },
    onSuccess: (data) => {
      const customerName = selectedCustomer 
        ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}`
        : 'Customer';
      onCaseCreated(data.id, customerName);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) setFile(selectedFile);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    uploadMutation.mutate();
  };

  const filteredCustomers = customers?.filter(customer => {
    const fullName = `${customer.first_name} ${customer.last_name}`.toLowerCase();
    const search = searchTerm.toLowerCase();
    return fullName.includes(search) || customer.customer_id.toLowerCase().includes(search);
  });

  const canSubmit = selectedCustomer && file;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">New ACIP Check</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Customer Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Customer</label>
            <div className="relative mb-1.5">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-red-500 focus:border-red-500"
              />
            </div>
            
            <div className="border border-slate-200 rounded-md max-h-28 overflow-y-auto">
              {customersLoading ? (
                <div className="p-3 text-center text-sm text-slate-500">Loading...</div>
              ) : filteredCustomers?.length === 0 ? (
                <div className="p-3 text-center text-sm text-slate-500">No customers found</div>
              ) : (
                filteredCustomers?.map((customer) => (
                  <button
                    key={customer.customer_id}
                    type="button"
                    onClick={() => setSelectedCustomer(customer)}
                    className={clsx(
                      'w-full px-3 py-2 text-left text-sm border-b border-slate-100 last:border-b-0 transition-colors flex items-center justify-between',
                      selectedCustomer?.customer_id === customer.customer_id
                        ? 'bg-red-50 text-red-700'
                        : 'hover:bg-slate-50'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      <span className="font-medium">{customer.first_name} {customer.last_name}</span>
                      <span className="text-slate-400 text-xs">{customer.document_type}</span>
                    </div>
                    {selectedCustomer?.customer_id === customer.customer_id && (
                      <CheckCircle className="w-4 h-4 text-red-600" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Document Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Document</label>
            
            <div
              onClick={() => fileInputRef.current?.click()}
              className={clsx(
                'border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-all',
                file ? 'border-green-300 bg-green-50' : 'border-slate-300 hover:border-red-300'
              )}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2 text-green-700 text-sm">
                  <FileText className="w-4 h-4" />
                  <span>{file.name}</span>
                </div>
              ) : (
                <div className="text-sm text-slate-500">Click to upload document</div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileSelect} className="hidden" />
          </div>

          {/* Error */}
          {uploadMutation.isError && (
            <div className="bg-red-50 text-red-700 p-2 rounded text-sm">
              {uploadMutation.error instanceof Error ? uploadMutation.error.message : 'Failed to create case'}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || uploadMutation.isPending}
              className="px-4 py-1.5 text-sm bg-red-700 text-white rounded hover:bg-red-800 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              Start Verification
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
