import React, { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { AuditLogEntry } from '../../types/domain';

export const AuditLogPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'audit_logs'),
      where('branchId', '==', 'ABS'),
      orderBy('timestamp', 'desc'),
      limit(150)
    );
    return onSnapshot(q, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLogEntry, 'id'>) })));
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-retac-navy">Append-Only Financial Audit Trail</h2>
        <p className="text-xs text-slate-500">
          Server-generated immutable records protected against client modification or deletion.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-start">Timestamp</th>
                <th className="px-4 py-3 text-start">Actor</th>
                <th className="px-4 py-3 text-start">Action</th>
                <th className="px-4 py-3 text-start">Entity</th>
                <th className="px-4 py-3 text-start">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-semibold text-retac-navy">{log.actorName}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-[11px]">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    {log.entityType}: {log.entityId}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{log.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
