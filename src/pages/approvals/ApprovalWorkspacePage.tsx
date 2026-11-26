import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { FinancialRequest } from '../../types/domain';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Check, X } from 'lucide-react';

interface ApprovalWorkspaceProps {
  stage: 'MANAGER' | 'FINANCE_MANAGER';
}

export const ApprovalWorkspacePage: React.FC<ApprovalWorkspaceProps> = ({ stage }) => {
  const { profile, hasRole } = useAuth();
  const [queue, setQueue] = useState<FinancialRequest[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [approvedAmounts, setApprovedAmounts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targetStatus = stage === 'MANAGER' ? 'PENDING_MANAGER' : 'PENDING_FINANCE';

  useEffect(() => {
    const q = query(
      collection(db, 'requests'),
      where('branchId', '==', 'ABS'),
      where('status', '==', targetStatus),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<FinancialRequest, 'id'>),
      }));
      setQueue(
        items.filter((req) => {
          if (hasRole(['ADMIN'])) return true;
          if (!profile) return false;
          if (stage === 'MANAGER') {
            return req.approvalSnapshot?.assignedManagerIds?.includes(profile.uid);
          }
          return req.approvalSnapshot?.assignedFinanceManagerIds?.includes(profile.uid);
        })
      );
    });
  }, [profile, stage, targetStatus]);

  const handleDecision = async (req: FinancialRequest, decision: 'APPROVED' | 'REJECTED') => {
    setError(null);
    const comment = (comments[req.id] || '').trim();
    if (decision === 'REJECTED' && comment.length < 3) {
      setError('A mandatory rejection reason (at least 3 characters) is required.');
      return;
    }

    setBusyId(req.id);
    try {
      const decideFn = httpsCallable(functions, 'processApprovalDecision');
      const customAmt = approvedAmounts[req.id];
      await decideFn({
        requestId: req.id,
        stage,
        decision,
        comment,
        approvedAmount:
          stage === 'FINANCE_MANAGER' && decision === 'APPROVED' && customAmt
            ? Number(customAmt)
            : req.requestedAmount,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Approval action failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-retac-navy">
          {stage === 'MANAGER' ? 'Manager Approval Workspace' : 'Finance Manager Approval Workspace'}
        </h2>
        <p className="text-xs text-slate-500">
          Segregation of duties enforced: self-approval and dual-stage single-person approval are blocked on server.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          {error}
        </div>
      )}

      {queue.length === 0 ? (
        <div className="bg-white p-10 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
          No requests currently assigned to your queue.
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((req) => (
            <div
              key={req.id}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <span className="font-bold text-retac-navy text-sm">{req.requestNumber}</span>
                  <span className="ms-2 text-xs text-slate-500">
                    ({req.requestType}) • Requested by {req.createdByName}
                  </span>
                </div>
                <StatusBadge status={req.status} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Customer / Beneficiary</span>
                  <span className="font-semibold text-retac-navy">
                    {req.customerSnapshot?.name} — {req.beneficiaryName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Category & Date</span>
                  <span className="font-semibold">
                    {req.expenseCategory} ({req.requestDate})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Requested Amount</span>
                  <span className="font-bold text-base text-retac-navy font-mono">
                    {req.requestedAmount.toFixed(2)} {req.currency}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg">{req.purpose}</p>

              {req.attachments?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {req.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={att.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-700 underline"
                    >
                      📎 {att.fileName}
                    </a>
                  ))}
                </div>
              )}

              {req.approvalHistory?.length > 0 && (
                <div className="text-[11px] text-slate-600 border-t border-slate-100 pt-2 space-y-1">
                  <span className="font-semibold block">Approval Timeline:</span>
                  {req.approvalHistory.map((h, i) => (
                    <div key={i}>
                      • [{h.stage}] {h.decision} by {h.actorName} at{' '}
                      {new Date(h.decidedAt).toLocaleString()}
                      {h.comment ? ` — "${h.comment}"` : ''}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                {stage === 'FINANCE_MANAGER' && (
                  <input
                    type="number"
                    step="0.01"
                    max={req.requestedAmount}
                    placeholder={`Approved Amt (default ${req.requestedAmount})`}
                    value={approvedAmounts[req.id] ?? ''}
                    onChange={(e) =>
                      setApprovedAmounts({ ...approvedAmounts, [req.id]: e.target.value })
                    }
                    className="sm:w-56 px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                  />
                )}
                <input
                  placeholder="Comments / Mandatory rejection reason..."
                  value={comments[req.id] ?? ''}
                  onChange={(e) => setComments({ ...comments, [req.id]: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
                <div className="flex gap-2">
                  <button
                    disabled={busyId === req.id}
                    onClick={() => handleDecision(req, 'APPROVED')}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>Approve</span>
                  </button>
                  <button
                    disabled={busyId === req.id}
                    onClick={() => handleDecision(req, 'REJECTED')}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-rose-700 text-white text-xs font-semibold hover:bg-rose-800 disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
