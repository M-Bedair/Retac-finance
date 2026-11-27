import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useI18n } from '../../contexts/I18nContext';
import { FinancialRequest } from '../../types/domain';
import { StatusBadge } from '../../components/common/StatusBadge';
import { FileSpreadsheet, Printer } from 'lucide-react';

const REPORT_TYPES = [
  { id: 'ALL', labelKey: 'allRequestsReport' },
  { id: 'PETTY_CASH', labelKey: 'pettyCashReport' },
  { id: 'CHEQUE', labelKey: 'chequeReport' },
  { id: 'PENDING_APPROVALS', labelKey: 'pendingApprovalsReport' },
  { id: 'APPROVED_NOT_PAID', labelKey: 'approvedNotPaidReport' },
  { id: 'PARTIAL_PAYMENTS', labelKey: 'partialPaymentsReport' },
  { id: 'PAID_TRANSACTIONS', labelKey: 'paidTransactionsReport' },
  { id: 'CUSTOMER_STATEMENT', labelKey: 'customerStatementReport' },
  { id: 'DISBURSEMENT_REPORT', labelKey: 'disbursementReport' },
] as const;

type TranslationKey = Parameters<ReturnType<typeof useI18n>['t']>[0];

const CATEGORY_LABELS: Partial<Record<string, TranslationKey>> = {
  Operations: 'categoryLabelOperations',
  Maintenance: 'categoryLabelMaintenance',
  'F&B': 'categoryLabelFood',
  Housekeeping: 'categoryLabelHousekeeping',
  Admin: 'categoryLabelAdmin',
};

function categoryLabel(
  category: string,
  translate: ReturnType<typeof useI18n>['t']
): string {
  const key = CATEGORY_LABELS[category];
  return key ? translate(key) : category;
}

export const ReportsPage: React.FC = () => {
  const { t } = useI18n();
  const [requests, setRequests] = useState<FinancialRequest[]>([]);
  const [reportType, setReportType] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'requests'),
      where('branchId', '==', 'ABS'),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
      setRequests(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FinancialRequest, 'id'>) }))
      );
    });
  }, []);

  const rows = useMemo(() => {
    return requests.filter((r) => {
      if (fromDate && r.requestDate < fromDate) return false;
      if (toDate && r.requestDate > toDate) return false;
      if (
        customerFilter &&
        !(r.customerSnapshot?.name || '').toLowerCase().includes(customerFilter.toLowerCase())
      ) {
        return false;
      }

      switch (reportType) {
        case 'PETTY_CASH':
          return r.requestType === 'PETTY_CASH';
        case 'CHEQUE':
          return r.requestType === 'CHEQUE';
        case 'PENDING_APPROVALS':
          return r.status === 'PENDING_MANAGER' || r.status === 'PENDING_FINANCE';
        case 'APPROVED_NOT_PAID':
          return r.status === 'READY_FOR_PAYMENT';
        case 'PARTIAL_PAYMENTS':
          return r.status === 'PARTIALLY_PAID';
        case 'PAID_TRANSACTIONS':
          return r.status === 'PAID';
        case 'DISBURSEMENT_REPORT':
          return r.totalPaidAmount > 0;
        default:
          return true;
      }
    });
  }, [requests, reportType, fromDate, toDate, customerFilter]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        requested: acc.requested + Number(r.requestedAmount || 0) * Number(r.exchangeRateToEgp || 1),
        approved: acc.approved + Number(r.approvedAmount || 0) * Number(r.exchangeRateToEgp || 1),
        paid: acc.paid + Number(r.totalPaidAmount || 0) * Number(r.exchangeRateToEgp || 1),
        remaining: acc.remaining + Number(r.remainingAmount || 0) * Number(r.exchangeRateToEgp || 1),
      }),
      { requested: 0, approved: 0, paid: 0, remaining: 0 }
    );
  }, [rows]);

  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const data = rows.map((r) => ({
      [t('requestNumber')]: r.requestNumber,
      [t('date')]: r.requestDate,
      [t('requestType')]: r.requestType === 'CHEQUE' ? t('cheque') : t('pettyCash'),
      [t('customer')]: r.customerSnapshot?.name || '',
      [t('beneficiary')]: r.beneficiaryName,
      [t('category')]: categoryLabel(r.expenseCategory, t),
      [t('currency')]: r.currency,
      [t('requested')]: r.requestedAmount,
      [t('approved')]: r.approvedAmount,
      [t('paid')]: r.totalPaidAmount,
      [t('remaining')]: r.remainingAmount,
      [t('status')]: r.status,
      [t('createdBy')]: r.createdByName,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'التقرير');
    XLSX.writeFile(wb, `RETAC_ABS_${reportType}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-retac-navy">{t('reportTitle')}</h2>
          <p className="text-xs text-slate-500">{t('reportSubtitle')}</p>
        </div>
        <div className="flex gap-2 no-print">
          <button
            onClick={exportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{t('exportExcel')}</span>
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-retac-navy text-white text-xs font-semibold"
          >
            <Printer className="w-4 h-4 text-retac-gold" />
            <span>{t('printReport')}</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3 no-print">
        <select
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
        >
          {REPORT_TYPES.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {t(rt.labelKey)}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label={t('dateFrom')}
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
        />
        <input
          type="date"
          aria-label={t('dateTo')}
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
        />
        <input
          placeholder={t('filterByCustomer')}
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-retac-navy text-white uppercase">
              <tr>
                <th className="px-4 py-3 text-start">{t('requestNumber')}</th>
                <th className="px-4 py-3 text-start">{t('date')}</th>
                <th className="px-4 py-3 text-start">{t('requestType')}</th>
                <th className="px-4 py-3 text-start">{t('customer')}</th>
                <th className="px-4 py-3 text-end">{t('requested')}</th>
                <th className="px-4 py-3 text-end">{t('approved')}</th>
                <th className="px-4 py-3 text-end">{t('paid')}</th>
                <th className="px-4 py-3 text-end">{t('remaining')}</th>
                <th className="px-4 py-3 text-start">{t('status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-semibold">{r.requestNumber}</td>
                  <td className="px-4 py-2.5">{r.requestDate}</td>
                  <td className="px-4 py-2.5">
                    {r.requestType === 'CHEQUE' ? t('cheque') : t('pettyCash')}
                  </td>
                  <td className="px-4 py-2.5">{r.customerSnapshot?.name}</td>
                  <td className="px-4 py-2.5 text-end font-mono">{r.requestedAmount.toFixed(2)} {r.currency}</td>
                  <td className="px-4 py-2.5 text-end font-mono">{r.approvedAmount.toFixed(2)} {r.currency}</td>
                  <td className="px-4 py-2.5 text-end font-mono">{r.totalPaidAmount.toFixed(2)} {r.currency}</td>
                  <td className="px-4 py-2.5 text-end font-mono">{r.remainingAmount.toFixed(2)} {r.currency}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-100 font-bold text-retac-navy border-t-2 border-slate-300">
              <tr>
                <td colSpan={4} className="px-4 py-3">
                  {t('totalsEgpEquivalent', { count: rows.length })}
                </td>
                <td className="px-4 py-3 text-end font-mono">{totals.requested.toFixed(2)}</td>
                <td className="px-4 py-3 text-end font-mono">{totals.approved.toFixed(2)}</td>
                <td className="px-4 py-3 text-end font-mono">{totals.paid.toFixed(2)}</td>
                <td className="px-4 py-3 text-end font-mono">{totals.remaining.toFixed(2)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
