import React, { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import {
  CurrencyCode,
  Customer,
  FinancialRequest,
  RequestType,
} from '../../types/domain';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Plus, Send } from 'lucide-react';
import { submitFinancialRequestSpark } from '../../services/sparkOperations';

export const RequestsPage: React.FC = () => {
  const { profile, hasRole } = useAuth();
  const [requests, setRequests] = useState<FinancialRequest[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [requestType, setRequestType] = useState<RequestType>('PETTY_CASH');
  const [customerId, setCustomerId] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('Operations');
  const [purpose, setPurpose] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('EGP');
  const [exchangeRateToEgp, setExchangeRateToEgp] = useState(1);
  const [requestedAmount, setRequestedAmount] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [saving, setSaving] = useState(false);

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
    const unsubReqs = onSnapshot(q, (snap) => {
      setRequests(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FinancialRequest, 'id'>) }))
      );
    });

    const cq = query(
      collection(db, 'customers'),
      where('branchId', '==', 'ABS'),
      where('status', '==', 'ACTIVE'),
      orderBy('name', 'asc')
    );
    const unsubCust = onSnapshot(cq, (snap) => {
      setCustomers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Customer, 'id'>) })));
    });

    return () => {
      unsubReqs();
      unsubCust();
    };
  }, [profile]);

  const handleSelectCustomer = (id: string) => {
    setCustomerId(id);
    const found = customers.find((c) => c.id === id);
    if (found) {
      setBeneficiaryName(found.name);
      setPayeeName(found.name);
    }
  };

  const handleSaveDraft = async (e: React.FormEvent, autoSubmit: boolean) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    const selectedCustomer = customers.find((c) => c.id === customerId);
    if (!selectedCustomer) {
      setError('Please select an active customer.');
      return;
    }
    const amt = Number(requestedAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Requested amount must be greater than zero.');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const draftRef = await addDoc(collection(db, 'requests'), {
        requestNumber: `DRAFT-${Date.now()}`,
        branchId: 'ABS',
        requestType,
        requestDate: now.slice(0, 10),
        status: 'DRAFT',
        customerId: selectedCustomer.id,
        customerSnapshot: {
          id: selectedCustomer.id,
          name: selectedCustomer.name,
          taxRegistrationNumber: selectedCustomer.taxRegistrationNumber,
          address: selectedCustomer.address,
          phone: selectedCustomer.phone,
          contactPerson: selectedCustomer.contactPerson,
          email: selectedCustomer.email,
          status: selectedCustomer.status,
        },
        beneficiaryName: beneficiaryName.trim() || selectedCustomer.name,
        expenseCategory,
        purpose: purpose.trim(),
        currency,
        exchangeRateToEgp: currency === 'EGP' ? 1 : Number(exchangeRateToEgp) || 1,
        requestedAmount: amt,
        approvedAmount: 0,
        totalPaidAmount: 0,
        remainingAmount: amt,
        chequeDetails:
          requestType === 'CHEQUE'
            ? {
                chequeNumber: chequeNumber.trim(),
                bankName: bankName.trim(),
                chequeDate,
                payeeName: payeeName.trim() || selectedCustomer.name,
                chequeAmount: amt,
              }
            : null,
        attachments: [],
        approvalSnapshot: null,
        approvalHistory: [],
        createdBy: profile.uid,
        createdByName: profile.displayName,
        createdAt: now,
        updatedAt: now,
      });

      if (autoSubmit) {
        await submitFinancialRequestSpark(draftRef.id, profile);
      }

      setShowCreate(false);
      setRequestedAmount('');
      setPurpose('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create request');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitExisting = async (id: string) => {
    setSubmittingId(id);
    setError(null);
    try {
      if (!profile) throw new Error('You must be signed in to submit a request.');
      await submitFinancialRequestSpark(id, profile);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-retac-navy">Petty Cash & Cheque Requests</h2>
          <p className="text-xs text-slate-500">
            Transaction-safe numbering (ABS-PC / ABS-CH) and two-stage approval enforcement
          </p>
        </div>
        {hasRole(['REQUESTER', 'ADMIN']) && (
          <button
            onClick={() => setShowCreate((s) => !s)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-retac-navy text-white text-xs font-semibold hover:bg-retac-navySecondary"
          >
            <Plus className="w-4 h-4 text-retac-gold" />
            <span>New Request</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {error}
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={(e) => handleSaveDraft(e, true)}
          className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"
        >
          <div className="flex gap-3">
            {(['PETTY_CASH', 'CHEQUE'] as RequestType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setRequestType(type)}
                className={`px-4 py-2 rounded-lg text-xs font-bold border ${
                  requestType === type
                    ? 'bg-retac-navy text-retac-gold border-retac-navy'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                {type === 'PETTY_CASH' ? 'Petty Cash Request' : 'Cheque Request'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Customer / Supplier *
              </label>
              <select
                required
                value={customerId}
                onChange={(e) => handleSelectCustomer(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
              >
                <option value="">-- Select Active Customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.taxRegistrationNumber ? `(${c.taxRegistrationNumber})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Beneficiary Name *
              </label>
              <input
                required
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Expense Category *
              </label>
              <select
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
              >
                <option value="Operations">Hotel Operations</option>
                <option value="Maintenance">Engineering & Maintenance</option>
                <option value="F&B">Food & Beverage Supplies</option>
                <option value="Housekeeping">Housekeeping & Laundry</option>
                <option value="Admin">Administration & Utilities</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Requested Amount *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={requestedAmount}
                onChange={(e) => setRequestedAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
              >
                <option value="EGP">EGP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>

            {currency !== 'EGP' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Exchange Rate to EGP
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={exchangeRateToEgp}
                  onChange={(e) => setExchangeRateToEgp(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                />
              </div>
            )}
          </div>

          {requestType === 'CHEQUE' && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
              <input
                placeholder="Cheque Number (optional at draft)"
                value={chequeNumber}
                onChange={(e) => setChequeNumber(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
              <input
                placeholder="Bank Name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
              <input
                type="date"
                value={chequeDate}
                onChange={(e) => setChequeDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
              <input
                placeholder="Payee Name"
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Purpose / Expense Description *
            </label>
            <textarea
              required
              rows={2}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={(e) => handleSaveDraft(e, false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
            >
              Save Draft
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-retac-gold text-retac-navy text-xs font-bold"
            >
              {saving ? 'Processing...' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-start">Request #</th>
                <th className="px-4 py-3 text-start">Date</th>
                <th className="px-4 py-3 text-start">Type</th>
                <th className="px-4 py-3 text-start">Customer</th>
                <th className="px-4 py-3 text-end">Requested</th>
                <th className="px-4 py-3 text-end">Approved</th>
                <th className="px-4 py-3 text-end">Remaining</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-end">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-retac-navy">{r.requestNumber}</td>
                  <td className="px-4 py-3">{r.requestDate}</td>
                  <td className="px-4 py-3">{r.requestType}</td>
                  <td className="px-4 py-3">{r.customerSnapshot?.name}</td>
                  <td className="px-4 py-3 text-end font-mono">
                    {r.requestedAmount.toFixed(2)} {r.currency}
                  </td>
                  <td className="px-4 py-3 text-end font-mono">{r.approvedAmount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-end font-mono">{r.remainingAmount.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-end">
                    {(r.status === 'DRAFT' || r.status === 'REJECTED') &&
                      r.createdBy === profile?.uid && (
                        <button
                          disabled={submittingId === r.id}
                          onClick={() => handleSubmitExisting(r.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-retac-navy text-white text-[11px] font-semibold"
                        >
                          <Send className="w-3 h-3 text-retac-gold" />
                          <span>{r.status === 'REJECTED' ? 'Resubmit' : 'Submit'}</span>
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
