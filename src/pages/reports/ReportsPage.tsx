import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../../config/firebase';
import { FinancialRequest } from '../../types/domain';
import { StatusBadge } from '../../components/common/StatusBadge';
import { FileSpreadsheet, Printer } from 'lucide-react';

const REPORT_TYPES = [
  { id: 'ALL', label: '1. All Requests' },
  { id: 'PETTY_CASH', label: '2. Petty Cash Report' },
  { id: 'CHEQUE', label: '3. Cheque Report' },
  { id: 'PENDING_APPROVALS', label: '4. Pending Approvals' },
  { id: 'APPROVED_NOT_PAID', label: '5. Approved Not Paid' },
  { id: 'PARTIAL_PAYMENTS', label: '6. Partial Payments' },
  { id: 'PAID_TRANSACTIONS', label: '7. Paid Transactions' },
  { id: 'CUSTOMER_STATEMENT', label: '8. Customer Statement' },
  { id: 'EMPLOYEE_ACTIVITY', label: '9. Employee Activity' },
  { id: 'APPROVAL_PERFORMANCE', label: '10. Approval Performance' },
  { id: 'DISBURSEMENT_REPORT', label: '11. Disbursement Report' },
  { id: 'AUDIT_SUMMARY', label: '12. Audit Summary' },
] as const;

export const ReportsPage: React.FC = () => {
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
        requested: acc.requested + Number(r.requestedAmount || 0),
        approved: acc.approved + Number(r.approvedAmount || 0),
        paid: acc.paid + Number(r.totalPaidAmount || 0),
        remaining: acc.remaining + Number(r.remainingAmount || 0),
      }),
      { requested: 0, approved: 0, paid: 0, remaining: 0 }
    );
  }, [rows]);

  const exportExcel = () => {
    const data = rows.map((r) => ({
      'Request Number': r.requestNumber,
      Date: r.requestDate,
      Type: r.requestType,
      Customer: r.customerSnapshot?.name || '',
      Beneficiary: r.beneficiaryName,
      Category: r.expenseCategory,
      Currency: r.currency,
      'Requested Amount': r.requestedAmount,
      'Approved Amount': r.approvedAmount,
      'Paid Amount': r.totalPaidAmount,
      'Remaining Balance': r.remainingAmount,
      Status: r.status,
      'Created By': r.createdByName,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RETAC_Report');
    XLSX.writeFile(wb, `RETAC_ABS_${reportType}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-retac-navy">Financial Reports Center</h2>
          <p className="text-xs text-slate-500">
            Distinguishes Requested, Approved, Paid, and Remaining balances
          </p>
        </div>
        <div className="flex gap-2 no-print">
          <button
            onClick={exportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-retac-navy text-white text-xs font-semibold"
          >
            <Printer className="w-4 h-4 text-retac-gold" />
            <span>Print / PDF</span>
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
              {rt.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
        />
        <input
          placeholder="Filter by customer name..."
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
                <th className="px-4 py-3 text-start">Request #</th>
                <th className="px-4 py-3 text-start">Date</th>
                <th className="px-4 py-3 text-start">Type</th>
                <th className="px-4 py-3 text-start">Customer</th>
                <th className="px-4 py-3 text-end">Requested</th>
                <th className="px-4 py-3 text-end">Approved</th>
                <th className="px-4 py-3 text-end">Paid</th>
                <th className="px-4 py-3 text-end">Remaining</th>
                <th className="px-4 py-3 text-start">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 font-semibold">{r.requestNumber}</td>
                  <td className="px-4 py-2.5">{r.requestDate}</td>
                  <td className="px-4 py-2.5">{r.requestType}</td>
                  <td className="px-4 py-2.5">{r.customerSnapshot?.name}</td>
                  <td className="px-4 py-2.5 text-end font-mono">{r.requestedAmount.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-end font-mono">{r.approvedAmount.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-end font-mono">{r.totalPaidAmount.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-end font-mono">{r.remainingAmount.toFixed(2)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-100 font-bold text-retac-navy border-t-2 border-slate-300">
              <tr>
                <td colSpan={4} className="px-4 py-3">
                  TOTAL ({rows.length} records)
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
