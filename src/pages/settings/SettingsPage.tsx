import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { UserProfile, UserRole } from '../../types/domain';
import {
  provisionUserSpark,
  updateApprovalChainConfigSpark,
} from '../../services/sparkOperations';

const ALL_ROLES: UserRole[] = [
  'ADMIN',
  'REQUESTER',
  'MANAGER',
  'FINANCE_MANAGER',
  'DISBURSEMENT_OFFICER',
  'AUDITOR',
];

export const SettingsPage: React.FC = () => {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [financeIds, setFinanceIds] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [configVersion, setConfigVersion] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [savingChain, setSavingChain] = useState(false);

  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    displayName: '',
    employeeCode: '',
    department: 'Finance',
    roles: ['REQUESTER'] as UserRole[],
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const uq = query(
      collection(db, 'users'),
      where('branchId', '==', 'ABS'),
      orderBy('displayName', 'asc')
    );
    const unsubUsers = onSnapshot(uq, (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<UserProfile, 'uid'>) })));
    });

    const unsubConfig = onSnapshot(doc(db, 'settings', 'approval_chain'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setManagerIds(d.managerUserIds || []);
        setFinanceIds(d.financeManagerUserIds || []);
        setEnabled(Boolean(d.enabled));
        setConfigVersion(d.version || 1);
      }
    });

    return () => {
      unsubUsers();
      unsubConfig();
    };
  }, []);

  const toggleId = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const handleSaveApprovalChain = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingChain(true);
    setMessage(null);
    try {
      if (!profile) throw new Error('You must be signed in to update settings.');
      await updateApprovalChainConfigSpark({
        managerUserIds: managerIds,
        financeManagerUserIds: financeIds,
        enabled,
        reason,
        user: profile,
      });
      setReason('');
      setMessage('Approval chain updated and version snapshot recorded in audit logs.');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Failed to update approval chain');
    } finally {
      setSavingChain(false);
    }
  };

  const handleProvisionUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    setMessage(null);
    try {
      if (!profile) throw new Error('You must be signed in to provision a user.');
      await provisionUserSpark({ ...newUser, adminUser: profile });
      setNewUser({
        email: '',
        password: '',
        displayName: '',
        employeeCode: '',
        department: 'Finance',
        roles: ['REQUESTER'],
      });
      setMessage('User provisioned in Firebase Authentication and the branch directory.');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'User provisioning failed');
    } finally {
      setCreatingUser(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-retac-navy">
          System Governance & Dynamic Approval Assignment
        </h2>
        <p className="text-xs text-slate-500">
          Changes apply to newly submitted requests while preserving historical request snapshots.
        </p>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
          {message}
        </div>
      )}

      {/* DYNAMIC APPROVAL CHAIN */}
      <form
        onSubmit={handleSaveApprovalChain}
        className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-retac-navy">
              Active Approval Chain (Config Version #{configVersion})
            </h3>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span>Workflow Enabled</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-slate-200 rounded-lg p-4">
            <h4 className="text-xs font-bold text-retac-navy mb-2">
              Stage 1: Assigned Manager Approvers
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {users
                .filter((u) => u.isActive && u.roles.includes('MANAGER'))
                .map((u) => (
                  <label key={u.uid} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={managerIds.includes(u.uid)}
                      onChange={() => toggleId(managerIds, setManagerIds, u.uid)}
                    />
                    <span>
                      {u.displayName} ({u.email})
                    </span>
                  </label>
                ))}
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4">
            <h4 className="text-xs font-bold text-retac-navy mb-2">
              Stage 2: Assigned Finance Manager Approvers
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {users
                .filter((u) => u.isActive && u.roles.includes('FINANCE_MANAGER'))
                .map((u) => (
                  <label key={u.uid} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={financeIds.includes(u.uid)}
                      onChange={() => toggleId(financeIds, setFinanceIds, u.uid)}
                    />
                    <span>
                      {u.displayName} ({u.email})
                    </span>
                  </label>
                ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            placeholder="Audit note / reason for configuration change..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs"
          />
          <button
            type="submit"
            disabled={savingChain}
            className="px-5 py-2 rounded-lg bg-retac-navy text-retac-gold text-xs font-bold"
          >
            {savingChain ? 'Saving...' : 'Save Approval Chain'}
          </button>
        </div>
      </form>

      {/* PROVISION USER */}
      <form
        onSubmit={handleProvisionUser}
        className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"
      >
        <h3 className="text-sm font-bold text-retac-navy">Provision Branch User</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <input
            required
            placeholder="Full Name *"
            value={newUser.displayName}
            onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
          />
          <input
            type="email"
            required
            placeholder="Corporate Email *"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Temporary Password *"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          {ALL_ROLES.map((role) => (
            <label key={role} className="inline-flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={newUser.roles.includes(role)}
                onChange={() =>
                  setNewUser({
                    ...newUser,
                    roles: newUser.roles.includes(role)
                      ? newUser.roles.filter((r) => r !== role)
                      : [...newUser.roles, role],
                  })
                }
              />
              <span>{role}</span>
            </label>
          ))}
        </div>
        <button
          type="submit"
          disabled={creatingUser}
          className="px-4 py-2 rounded-lg bg-retac-gold text-retac-navy text-xs font-bold"
        >
          {creatingUser ? 'Creating...' : 'Create User'}
        </button>
      </form>
    </div>
  );
};
