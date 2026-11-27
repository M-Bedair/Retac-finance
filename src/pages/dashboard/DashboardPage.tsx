import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { FinancialRequest, RequestStatus } from '../../types/domain';
import { StatusBadge } from '../../components/common/StatusBadge';
import { FileSpreadsheet, CheckCircle2, Clock, Wallet } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { profile, hasRole } = useAuth();
  const { t, lang } = useI18n();
  const [requests, setRequests] = useState<FinancialRequest[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    if (!profile) return;
    const canViewAll = hasRole([
      'ADMIN',
      'MANAGER',
      'FINANCE_MANAGER',
      'DISBURSEMENT_OFFICER',
      'AUDITOR',
    ]);
    const q = canViewAll
      ? query(
          collection(db, 'requests'),
          where('branchId', '==', 'ABS'),
          orderBy('createdAt', 'desc')
        )
      : query(
          collection(db, 'requests'),
          where('branchId', '==', 'ABS'),
          where('createdBy', '==', profile.uid),
          orderBy('createdAt', 'desc')
        );

    return onSnapshot(q, (snap) => {
      setRequests(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FinancialRequest, 'id'>) }))
      );
    });
  }, [profile]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (fromDate && r.requestDate < fromDate) return false;
      if (toDate && r.requestDate > toDate) return false;
      return true;
    });
  }, [requests, fromDate, toDate]);

  const metrics = useMemo(() => {
    let totalRequested = 0;
    let totalApproved = 0;
    let totalPaid = 0;
    let pendingManager = 0;
    let pendingFinance = 0;
    let readyForPayment = 0;
    let partiallyPaid = 0;
    let pettyCashTotal = 0;
    let chequeTotal = 0;

    const statusCounts: Record<string, number> = {};
    const customerTotals: Record<string, { name: string; value: number }> = {};

    for (const r of filtered) {
      const exchangeRate = Number(r.exchangeRateToEgp || 1);
      totalRequested += Number(r.requestedAmount || 0) * exchangeRate;
      totalApproved += Number(r.approvedAmount || 0) * exchangeRate;
      totalPaid += Number(r.totalPaidAmount || 0) * exchangeRate;

      if (r.status === 'PENDING_MANAGER') pendingManager++;
      if (r.status === 'PENDING_FINANCE') pendingFinance++;
      if (r.status === 'READY_FOR_PAYMENT') readyForPayment++;
      if (r.status === 'PARTIALLY_PAID') partiallyPaid++;

      if (r.requestType === 'PETTY_CASH') {
        pettyCashTotal += Number(r.requestedAmount || 0) * exchangeRate;
      }
      if (r.requestType === 'CHEQUE') {
        chequeTotal += Number(r.requestedAmount || 0) * exchangeRate;
      }

      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;

      const cName = r.customerSnapshot?.name || 'Unknown';
      if (!customerTotals[r.customerId]) {
        customerTotals[r.customerId] = { name: cName, value: 0 };
      }
      customerTotals[r.customerId].value +=
        Number(r.approvedAmount || r.requestedAmount || 0) * exchangeRate;
    }

    const topCustomers = Object.values(customerTotals)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      totalCount: filtered.length,
      totalRequested,
      totalApproved,
      totalPaid,
      pendingManager,
      pendingFinance,
      readyForPayment,
      partiallyPaid,
      pettyCashTotal,
      chequeTotal,
      statusCounts,
      topCustomers,
    };
  }, [filtered]);

  const fmt = (n: number) =>
    new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-retac-navy">{t('dashboardTitle')}</h2>
          <p className="text-xs text-slate-500">{t('dashboardSubtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label={t('dateFrom')}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
          />
          <span className="text-xs text-slate-400">{t('dateTo')}</span>
          <input
            type="date"
            aria-label={t('dateTo')}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
          />
          {(fromDate || toDate) && (
            <button
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
              className="px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg"
            >
              {t('reset')}
            </button>
          )}
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title={t('totalRequests')} value={String(metrics.totalCount)} icon={FileSpreadsheet} />
        <KpiCard title={`${t('totalRequested')} (EGP)`} value={fmt(metrics.totalRequested)} icon={Clock} />
        <KpiCard title={`${t('totalApproved')} (EGP)`} value={fmt(metrics.totalApproved)} icon={CheckCircle2} />
        <KpiCard title={`${t('totalPaid')} (EGP)`} value={fmt(metrics.totalPaid)} icon={Wallet} accent />
        <KpiCard title={t('pendingManager')} value={String(metrics.pendingManager)} />
        <KpiCard title={t('pendingFinance')} value={String(metrics.pendingFinance)} />
        <KpiCard title={t('readyForPayment')} value={String(metrics.readyForPayment)} />
        <KpiCard title={t('partiallyPaid')} value={String(metrics.partiallyPaid)} />
      </div>

      {/* CHARTS & BREAKDOWNS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-retac-navy mb-4">{t('pettyCashVsCheques')}</h3>
          <div className="space-y-4">
            <BarRow
              label={t('pettyCash')}
              value={metrics.pettyCashTotal}
              total={metrics.pettyCashTotal + metrics.chequeTotal}
              color="bg-retac-navy"
              formatted={fmt(metrics.pettyCashTotal)}
            />
            <BarRow
              label={t('cheques')}
              value={metrics.chequeTotal}
              total={metrics.pettyCashTotal + metrics.chequeTotal}
              color="bg-retac-gold"
              formatted={fmt(metrics.chequeTotal)}
            />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-retac-navy mb-4">{t('statusDistribution')}</h3>
          <div className="space-y-2">
            {Object.entries(metrics.statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-xs py-1">
                <StatusBadge status={status as RequestStatus} />
                <span className="font-bold text-retac-navy">{count}</span>
              </div>
            ))}
            {Object.keys(metrics.statusCounts).length === 0 && (
              <p className="text-xs text-slate-400">{t('noRecordsInRange')}</p>
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-retac-navy mb-4">{t('topCustomers')}</h3>
          <div className="space-y-3">
            {metrics.topCustomers.map((c) => (
              <div key={c.name} className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 truncate max-w-[170px]">{c.name}</span>
                <span className="font-bold text-retac-navy">{fmt(c.value)}</span>
              </div>
            ))}
            {metrics.topCustomers.length === 0 && (
              <p className="text-xs text-slate-400">{t('noCustomerTransactions')}</p>
            )}
          </div>
        </div>
      </div>

      {/* RECENT ACTIVITY */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-retac-navy">{t('latestRequests')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-start">{t('requestNumber')}</th>
                <th className="px-4 py-3 text-start">{t('requestType')}</th>
                <th className="px-4 py-3 text-start">{t('customerOrPayee')}</th>
                <th className="px-4 py-3 text-end">{t('requested')}</th>
                <th className="px-4 py-3 text-end">{t('approved')}</th>
                <th className="px-4 py-3 text-end">{t('paid')}</th>
                <th className="px-4 py-3 text-start">{t('status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, 10).map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-retac-navy">{r.requestNumber}</td>
                  <td className="px-4 py-3">{r.requestType}</td>
                  <td className="px-4 py-3">{r.customerSnapshot?.name || r.beneficiaryName}</td>
                  <td className="px-4 py-3 text-end font-mono">{r.requestedAmount.toFixed(2)} {r.currency}</td>
                  <td className="px-4 py-3 text-end font-mono">{r.approvedAmount.toFixed(2)} {r.currency}</td>
                  <td className="px-4 py-3 text-end font-mono">{r.totalPaidAmount.toFixed(2)} {r.currency}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    {t('noRequests')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const KpiCard: React.FC<{
  title: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}> = ({ title, value, icon: Icon, accent }) => (
  <div
    className={`p-4 rounded-xl border shadow-sm ${
      accent
        ? 'bg-retac-navy text-white border-retac-navy'
        : 'bg-white text-retac-navy border-slate-200'
    }`}
  >
    <div className="flex items-center justify-between">
      <span className={`text-xs font-medium ${accent ? 'text-slate-300' : 'text-slate-500'}`}>
        {title}
      </span>
      {Icon && (
        <Icon className={`w-4 h-4 ${accent ? 'text-retac-gold' : 'text-retac-navy'}`} />
      )}
    </div>
    <p className={`text-xl font-bold mt-2 ${accent ? 'text-retac-gold' : 'text-retac-navy'}`}>
      {value}
    </p>
  </div>
);

const BarRow: React.FC<{
  label: string;
  value: number;
  total: number;
  color: string;
  formatted: string;
}> = ({ label, value, total, color, formatted }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-bold text-retac-navy">
          {formatted} ({pct}%)
        </span>
      </div>
      <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};
