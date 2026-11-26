import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, functions, storage } from '../../config/firebase';
import { DisbursementRecord, FinancialRequest } from '../../types/domain';
import { StatusBadge } from '../../components/common/StatusBadge';
import { RotateCcw, Wallet } from 'lucide-react';

export const DisbursementsPage: React.FC = () => {
  const [eligible, setEligible] = useState<FinancialRequest[]>([]);
  const [ledger, setLedger] = useState<DisbursementRecord[]>([]);
  const [selectedReq, setSelectedReq] = useState<FinancialRequest | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [transactionReference, setTransactionReference] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'requests'),
      where('branchId', '==', 'ABS'),
      where('status', 'in', ['READY_FOR_PAYMENT', 'PARTIALLY_PAID']),
      orderBy('createdAt', 'desc')
    );
    const unsubEligible = onSnapshot(q, (snap) => {
      setEligible(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FinancialRequest, 'id'>) }))
      );
    });

    const dq = query(
      collection(db, 'disbursements'),
      where('branchId', '==', 'ABS'),
      orderBy('createdAt', 'desc')
    );
    const unsubLedger = onSnapshot(dq, (snap) => {
      setLedger(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DisbursementRecord, 'id'>) }))
      );
    });

    return () => {
      unsubEligible();
      unsubLedger();
    };
  }, []);

  const openPaymentModal = (req: FinancialRequest) => {
    setSelectedReq(req);
    setAmount(String(req.remainingAmount));
    setPaymentMethod(req.requestType === 'CHEQUE' ? 'Cheque' : 'Cash');
    setChequeNumber(req.chequeDetails?.chequeNumber || '');
    setBankName(req.chequeDetails?.bankName || '');
    setChequeDate(req.chequeDetails?.chequeDate || '');
    setTransactionReference('');
    setNotes('');
    setReceiptFile(null);
    setError(null);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    setSubmitting(true);
    setError(null);

    try {
      let receiptUrl: string | null = null;
      if (receiptFile) {
        const path = `branches/ABS/disbursements/${selectedReq.id}/${Date.now()}_${receiptFile.name}`;
        const sRef = ref(storage, path);
        await uploadBytes(sRef, receiptFile);
        receiptUrl = await getDownloadURL(sRef);
      }

      const idempotencyKey = `${selectedReq.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const disburseFn = httpsCallable(functions, 'recordDisbursement');
      await disburseFn({
        requestId: selectedReq.id,
        idempotencyKey,
        amount: Number(amount),
        paymentDate,
        paymentMethod,
        transactionReference,
        chequeDetails:
          selectedReq.requestType === 'CHEQUE'
            ? {
                chequeNumber,
                bankName,
                chequeDate,
                payeeName: selectedReq.chequeDetails?.payeeName || selectedReq.beneficiaryName,
              }
            : null,
        receiptUrl,
        notes,
      });

      setSelectedReq(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Disbursement failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReversal = async (paymentId: string) => {
    const reason = window.prompt('Enter mandatory audit reason for reversing this payment:');
    if (!reason || reason.trim().length < 5) return;
    try {
      const revFn = httpsCallable(functions, 'reverseDisbursement');
      await revFn({ paymentId, reason });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Reversal failed');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-retac-navy">Disbursement Center</h2>
        <p className="text-xs text-slate-500">
          Only requests approved by both Manager and Finance Manager appear here.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {error}
        </div>
      )}

      {selectedReq && (
        <form
          onSubmit={handleRecordPayment}
          className="bg-white p-6 rounded-xl border-2 border-retac-gold shadow-md space-y-4"
        >
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-retac-navy">
              Execute Disbursement — {selectedReq.requestNumber} (Remaining:{' '}
              {selectedReq.remainingAmount.toFixed(2)} {selectedReq.currency})
            </h3>
            <button
              type="button"
              onClick={() => setSelectedReq(null)}
              className="text-xs text-slate-500"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Payment Amount *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={selectedReq.remainingAmount}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Payment Date *</label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Payment Method *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
              >
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Transaction Reference</label>
              <input
                value={transactionReference}
                onChange={(e) => setTransactionReference(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>
          </div>

          {selectedReq.requestType === 'CHEQUE' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 rounded-lg bg-slate-50">
              <input
                required
                placeholder="Cheque Number *"
                value={chequeNumber}
                onChange={(e) => setChequeNumber(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
              <input
                required
                placeholder="Bank Name *"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
              <input
                type="date"
                required
                value={chequeDate}
                onChange={(e) => setChequeDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              placeholder="Payment notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
            />
            <input
              type="file"
              onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-retac-navy text-retac-gold text-xs font-bold"
            >
              {submitting ? 'Confirming...' : 'Confirm & Lock Payment'}
            </button>
          </div>
        </form>
      )}

      {/* ELIGIBLE REQUESTS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 font-bold text-xs text-retac-navy">
          Eligible Approved Requests
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-start">Request #</th>
                <th className="px-4 py-3 text-start">Customer / Payee</th>
                <th className="px-4 py-3 text-end">Approved</th>
                <th className="px-4 py-3 text-end">Paid</th>
                <th className="px-4 py-3 text-end">Remaining</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-end">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {eligible.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-bold text-retac-navy">{r.requestNumber}</td>
                  <td className="px-4 py-3">{r.customerSnapshot?.name}</td>
                  <td className="px-4 py-3 text-end font-mono">{r.approvedAmount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-end font-mono">{r.totalPaidAmount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-end font-mono font-bold text-emerald-700">
                    {r.remainingAmount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-end">
                    <button
                      onClick={() => openPaymentModal(r)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-retac-navy text-white text-xs font-semibold"
                    >
                      <Wallet className="w-3.5 h-3.5 text-retac-gold" />
                      <span>Pay</span>
                    </button>
                  </td>
                </tr>
              ))}
              {eligible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No approved requests pending disbursement.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* IMMUTABLE PAYMENT LEDGER */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 font-bold text-xs text-retac-navy">
          Immutable Disbursement Ledger
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-start">Date</th>
                <th className="px-4 py-3 text-start">Request #</th>
                <th className="px-4 py-3 text-start">Method</th>
                <th className="px-4 py-3 text-start">Ref</th>
                <th className="px-4 py-3 text-end">Amount</th>
                <th className="px-4 py-3 text-start">Officer</th>
                <th className="px-4 py-3 text-end">Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.map((p) => (
                <tr key={p.id} className={p.isReversal ? 'bg-rose-50/40' : ''}>
                  <td className="px-4 py-3">{p.paymentDate}</td>
                  <td className="px-4 py-3 font-semibold">{p.requestNumber}</td>
                  <td className="px-4 py-3">{p.paymentMethod}</td>
                  <td className="px-4 py-3 font-mono">{p.transactionReference || '—'}</td>
                  <td className="px-4 py-3 text-end font-mono font-bold">
                    {p.amount.toFixed(2)} {p.currency}
                  </td>
                  <td className="px-4 py-3">{p.disbursedByName}</td>
                  <td className="px-4 py-3 text-end">
                    {!p.isReversal && (
                      <button
                        onClick={() => handleReversal(p.id)}
                        className="inline-flex items-center gap-1 text-rose-700 hover:underline text-[11px]"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reverse</span>
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
