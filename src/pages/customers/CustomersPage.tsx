import React, { useEffect, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { Customer } from '../../types/domain';
import { Plus, Search } from 'lucide-react';

export const CustomersPage: React.FC = () => {
  const { hasRole } = useAuth();
  const { t } = useI18n();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    taxRegistrationNumber: '',
    address: '',
    phone: '',
    contactPerson: '',
    email: '',
  });

  useEffect(() => {
    const q = query(
      collection(db, 'customers'),
      where('branchId', '==', 'ABS'),
      orderBy('name', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setCustomers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Customer, 'id'>) })));
    });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = form.name.trim();
    const trimmedTax = form.taxRegistrationNumber.trim();

    const duplicate = customers.find(
      (c) =>
        c.name.toLowerCase() === trimmedName.toLowerCase() ||
        (trimmedTax && c.taxRegistrationNumber === trimmedTax)
    );
    if (duplicate) {
      setError(
        t('duplicateCustomerDetected', {
          name: duplicate.name,
          taxNumber: duplicate.taxRegistrationNumber,
        })
      );
      return;
    }

    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, 'customers'), {
        ...form,
        name: trimmedName,
        taxRegistrationNumber: trimmedTax,
        status: 'ACTIVE',
        branchId: 'ABS',
        createdAt: now,
        updatedAt: now,
      });

      setForm({
        name: '',
        taxRegistrationNumber: '',
        address: '',
        phone: '',
        contactPerson: '',
        email: '',
      });
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('customerSaveFailed'));
    }
  };

  const toggleStatus = async (c: Customer) => {
    if (!hasRole(['ADMIN'])) return;
    try {
      await updateDoc(doc(db, 'customers', c.id), {
        status: c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('customerUpdateFailed'));
    }
  };

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.taxRegistrationNumber.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-retac-navy">{t('customerTitle')}</h2>
          <p className="text-xs text-slate-500">{t('customerSubtitle')}</p>
        </div>
        {hasRole(['ADMIN', 'REQUESTER']) && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-retac-navy text-white text-xs font-semibold hover:bg-retac-navySecondary"
          >
            <Plus className="w-4 h-4 text-retac-gold" />
            <span>{t('addCustomer')}</span>
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4"
        >
          <h3 className="text-sm font-bold text-retac-navy">{t('newCustomer')}</h3>
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input
              required
              placeholder={t('customerName')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
            />
            <input
              placeholder={t('taxNumber')}
              value={form.taxRegistrationNumber}
              onChange={(e) => setForm({ ...form, taxRegistrationNumber: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
            />
            <input
              placeholder={t('phone')}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
            />
            <input
              placeholder={t('contactPerson')}
              value={form.contactPerson}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
            />
            <input
              type="email"
              placeholder={t('email')}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
            />
            <input
              placeholder={t('address')}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="px-3 py-2 rounded-lg border border-slate-300 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-retac-gold text-retac-navy font-semibold text-xs"
            >
              {t('saveCustomer')}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            placeholder={t('searchCustomers')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs focus:outline-none"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-start">{t('name')}</th>
                <th className="px-4 py-3 text-start">{t('taxNumber')}</th>
                <th className="px-4 py-3 text-start">{t('contact')}</th>
                <th className="px-4 py-3 text-start">{t('phone')}</th>
                <th className="px-4 py-3 text-start">{t('status')}</th>
                {hasRole(['ADMIN']) && <th className="px-4 py-3 text-end">{t('action')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-retac-navy">{c.name}</td>
                  <td className="px-4 py-3 font-mono">{c.taxRegistrationNumber || '—'}</td>
                  <td className="px-4 py-3">{c.contactPerson || '—'}</td>
                  <td className="px-4 py-3">{c.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        c.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {c.status === 'ACTIVE' ? t('active') : t('inactive')}
                    </span>
                  </td>
                  {hasRole(['ADMIN']) && (
                    <td className="px-4 py-3 text-end">
                      <button
                        onClick={() => toggleStatus(c)}
                        className="text-xs font-semibold text-retac-navy underline"
                      >
                        {c.status === 'ACTIVE' ? t('deactivate') : t('activate')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
