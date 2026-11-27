import React from 'react';
import { RequestStatus } from '../../types/domain';
import { useI18n } from '../../contexts/I18nContext';

const STATUS_STYLES: Record<RequestStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-300',
  SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
  PENDING_MANAGER: 'bg-amber-50 text-amber-800 border-amber-300',
  PENDING_FINANCE: 'bg-indigo-50 text-indigo-800 border-indigo-300',
  READY_FOR_PAYMENT: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  PARTIALLY_PAID: 'bg-orange-50 text-orange-800 border-orange-300',
  PAID: 'bg-teal-900/10 text-teal-900 border-teal-400',
  REJECTED: 'bg-rose-50 text-rose-800 border-rose-300',
  CANCELLED: 'bg-zinc-100 text-zinc-600 border-zinc-300',
};

const STATUS_LABELS: Record<RequestStatus, Parameters<ReturnType<typeof useI18n>['t']>[0]> = {
  DRAFT: 'statusDraft',
  SUBMITTED: 'statusSubmitted',
  PENDING_MANAGER: 'statusPendingManager',
  PENDING_FINANCE: 'statusPendingFinance',
  READY_FOR_PAYMENT: 'statusReadyForPayment',
  PARTIALLY_PAID: 'statusPartiallyPaid',
  PAID: 'statusPaid',
  REJECTED: 'statusRejected',
  CANCELLED: 'statusCancelled',
};

export const StatusBadge: React.FC<{ status: RequestStatus }> = ({ status }) => {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[status]}`}
    >
      {t(STATUS_LABELS[status])}
    </span>
  );
};
