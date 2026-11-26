import React, { useEffect, useState } from 'react';
import { Menu, Globe, LogOut, Bell } from 'lucide-react';
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { AppNotification } from '../../types/domain';

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { profile, signOut } = useAuth();
  const { lang, setLang, t } = useI18n();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    if (!profile?.uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', profile.uid),
      orderBy('createdAt', 'desc'),
      limit(15)
    );
    return onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AppNotification, 'id'>) })));
    });
  }, [profile?.uid]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpenNotification = async (n: AppNotification) => {
    if (!n.read) {
      await updateDoc(doc(db, 'notifications', n.id), {
        read: true,
        readAt: new Date().toISOString(),
      });
    }
    setNotifOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <header className="no-print h-16 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-sm sm:text-base font-bold text-retac-navy">{t('brandTitle')}</h1>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-retac-navy hover:bg-slate-50"
        >
          <Globe className="w-3.5 h-3.5 text-retac-goldSecondary" />
          <span>{lang === 'en' ? 'العربية' : 'English'}</span>
        </button>

        <div className="relative">
          <button
            onClick={() => setNotifOpen((prev) => !prev)}
            className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -end-0.5 h-4 min-w-[16px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute end-0 mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-2.5 bg-retac-navy text-white text-xs font-semibold flex justify-between">
                <span>Notifications</span>
                <span>{unreadCount} unread</span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500 text-center">No notifications</p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleOpenNotification(n)}
                      className={`w-full text-start p-3 hover:bg-slate-50 transition-colors ${
                        !n.read ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      <p className="text-xs font-semibold text-retac-navy">{n.title}</p>
                      <p className="text-[11px] text-slate-600 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {profile && (
          <div className="hidden sm:flex flex-col items-end border-s border-slate-200 ps-3">
            <span className="text-xs font-semibold text-retac-navy">{profile.displayName}</span>
            <span className="text-[11px] text-slate-500">{profile.roles.join(' • ')}</span>
          </div>
        )}

        <button
          onClick={() => signOut()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-retac-navy text-white text-xs font-medium hover:bg-retac-navySecondary"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden md:inline">{t('signOut')}</span>
        </button>
      </div>
    </header>
  );
};
