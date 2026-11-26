export type UserRole =
  | 'ADMIN'
  | 'REQUESTER'
  | 'MANAGER'
  | 'FINANCE_MANAGER'
  | 'DISBURSEMENT_OFFICER'
  | 'AUDITOR';

export type RequestType = 'PETTY_CASH' | 'CHEQUE';

export type RequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_MANAGER'
  | 'PENDING_FINANCE'
  | 'READY_FOR_PAYMENT'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'REJECTED'
  | 'CANCELLED';

export type CurrencyCode = 'EGP' | 'USD' | 'EUR';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  employeeCode: string;
  department: string;
  branchId: 'ABS';
  roles: UserRole[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  taxRegistrationNumber: string;
  address: string;
  phone: string;
  contactPerson: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE';
  branchId: 'ABS';
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalSnapshot {
  assignedManagerIds: string[];
  assignedFinanceManagerIds: string[];
  snapshottedAt: string;
  configVersion: number;
  reassignedAt?: string;
  reassignedBy?: string;
}

export interface ApprovalDecision {
  stage: 'MANAGER' | 'FINANCE_MANAGER';
  decision: 'APPROVED' | 'REJECTED';
  actorId: string;
  actorName: string;
  comment: string;
  decidedAt: string;
}

export interface AttachmentMeta {
  id: string;
  fileName: string;
  storagePath: string;
  downloadUrl: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ChequeDetails {
  chequeNumber: string;
  bankName: string;
  chequeDate: string;
  payeeName: string;
  chequeAmount: number;
  chequeAttachment?: AttachmentMeta | null;
}

export interface FinancialRequest {
  id: string;
  requestNumber: string;
  branchId: 'ABS';
  requestType: RequestType;
  requestDate: string;
  status: RequestStatus;
  customerId: string;
  customerSnapshot: {
    id: string;
    name: string;
    taxRegistrationNumber: string;
    address: string;
    phone: string;
    contactPerson: string;
    email: string;
    status: 'ACTIVE' | 'INACTIVE';
  };
  beneficiaryName: string;
  expenseCategory: string;
  purpose: string;
  currency: CurrencyCode;
  exchangeRateToEgp: number;
  requestedAmount: number;
  approvedAmount: number;
  totalPaidAmount: number;
  remainingAmount: number;
  chequeDetails?: ChequeDetails | null;
  attachments: AttachmentMeta[];
  approvalSnapshot?: ApprovalSnapshot | null;
  approvalHistory: ApprovalDecision[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  submittedAt?: string | null;
  updatedAt: string;
}

export interface DisbursementRecord {
  id: string;
  branchId: 'ABS';
  requestId: string;
  requestNumber: string;
  requestType: RequestType;
  customerId: string;
  customerName: string;
  amount: number;
  currency: CurrencyCode;
  paymentDate: string;
  paymentMethod: string;
  transactionReference: string;
  chequeDetails?: ChequeDetails | null;
  receiptUrl?: string | null;
  notes: string;
  isReversal: boolean;
  reversesPaymentId?: string | null;
  disbursedBy: string;
  disbursedByName: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  branchId: 'ABS';
  userId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  reason?: string | null;
  timestamp: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  link: string;
  read: boolean;
  createdAt: string;
}
