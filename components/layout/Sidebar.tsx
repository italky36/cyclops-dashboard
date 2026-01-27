'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { LayerSwitcher } from '@/components/ui/LayerSwitcher';
import { useIsMobile, useBodyScrollLock } from '@/hooks/useMediaQuery';

const navigation = [
  {
    name: 'Обзор',
    href: '/',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    name: 'Бенефициары',
    href: '/beneficiaries',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    name: 'Виртуальные счета',
    href: '/virtual-accounts',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="4" width="22" height="16" rx="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    name: 'Сделки',
    href: '/deals',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    name: 'Платежи',
    href: '/payments',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    name: 'Выплаты',
    href: '/payouts',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
        <circle cx="12" cy="14" r="3" />
        <path d="M6 14h.01M18 14h.01" />
      </svg>
    ),
  },
  {
    name: 'Пользователи',
    href: '/users',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    name: 'Настройки',
    href: '/settings',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);

  // Блокируем скролл при открытом мобильном меню
  useBodyScrollLock(isMobile && isOpen);

  // Закрываем меню при изменении маршрута
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Закрываем меню при переходе на десктоп
  useEffect(() => {
    if (!isMobile) {
      setIsOpen(false);
    }
  }, [isMobile]);

  // Закрытие по Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/login');
    }
  };

  const toggleMenu = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <>
      {/* Mobile Header */}
      {isMobile && (
        <header className="mobile-header">
          <button
            className="hamburger"
            onClick={toggleMenu}
            aria-label={isOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={isOpen}
          >
            <span className={`hamburger-line ${isOpen ? 'open' : ''}`} />
            <span className={`hamburger-line ${isOpen ? 'open' : ''}`} />
            <span className={`hamburger-line ${isOpen ? 'open' : ''}`} />
          </button>

          <div className="mobile-logo">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" fill="url(#logo-gradient-mobile)" />
              <path
                d="M16 8C11.6 8 8 11.6 8 16s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 14c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6z"
                fill="white"
              />
              <circle cx="16" cy="16" r="3" fill="white" />
              <defs>
                <linearGradient id="logo-gradient-mobile" x1="2" y1="2" x2="30" y2="30">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
            <span className="mobile-logo-text">Cyclops</span>
          </div>

          <div className="mobile-header-spacer" />
        </header>
      )}

      {/* Overlay для мобильного меню */}
      {isMobile && isOpen && (
        <div
          className="sidebar-overlay"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isMobile ? 'mobile' : ''} ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="14" fill="url(#logo-gradient)" />
                <path
                  d="M16 8C11.6 8 8 11.6 8 16s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 14c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6z"
                  fill="white"
                />
                <circle cx="16" cy="16" r="3" fill="white" />
                <defs>
                  <linearGradient id="logo-gradient" x1="2" y1="2" x2="30" y2="30">
                    <stop stopColor="#6366f1" />
                    <stop offset="1" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div className="logo-text">
              <span className="logo-name">Cyclops</span>
              <span className="logo-sub">Dashboard</span>
            </div>
          </div>

          {isMobile && (
            <button
              className="close-btn"
              onClick={closeMenu}
              aria-label="Закрыть меню"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="sidebar-layer">
          <LayerSwitcher />
        </div>

        <nav className="sidebar-nav">
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                prefetch={false}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={isMobile ? closeMenu : undefined}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="logout" type="button" onClick={handleLogout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Выйти</span>
          </button>
          <div className="version">v1.0.0</div>
        </div>
      </aside>

      <style jsx>{`
        /* Mobile Header */
        .mobile-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: var(--header-height-mobile, 56px);
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          padding: 0 16px;
          z-index: 1001;
          gap: 12px;
        }

        .hamburger {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          width: 44px;
          height: 44px;
          background: transparent;
          border: none;
          cursor: pointer;
          padding: 0;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        .hamburger-line {
          display: block;
          width: 22px;
          height: 2px;
          background: var(--text-primary);
          border-radius: 2px;
          transition: all 0.3s ease;
          margin: 2.5px 0;
        }

        .hamburger-line.open:nth-child(1) {
          transform: rotate(45deg) translate(3.5px, 3.5px);
        }

        .hamburger-line.open:nth-child(2) {
          opacity: 0;
        }

        .hamburger-line.open:nth-child(3) {
          transform: rotate(-45deg) translate(3.5px, -3.5px);
        }

        .mobile-logo {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .mobile-logo-text {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .mobile-header-spacer {
          flex: 1;
        }

        /* Sidebar Overlay */
        .sidebar-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1002;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        /* Desktop Sidebar */
        .sidebar {
          width: 260px;
          height: 100vh;
          background: var(--bg-primary);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          position: fixed;
          left: 0;
          top: 0;
          z-index: 100;
        }

        /* Mobile Sidebar */
        .sidebar.mobile {
          width: 280px;
          max-width: 85vw;
          z-index: 1003;
          transform: translateX(-100%);
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: none;
          padding-top: 0;
        }

        .sidebar.mobile.open {
          transform: translateX(0);
          box-shadow: var(--shadow-lg);
        }

        .sidebar-header {
          padding: 20px;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-icon {
          flex-shrink: 0;
        }

        .logo-text {
          display: flex;
          flex-direction: column;
        }

        .logo-name {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.5px;
        }

        .logo-sub {
          font-size: 11px;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          background: var(--bg-hover);
          border: none;
          border-radius: 12px;
          cursor: pointer;
          color: var(--text-secondary);
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        .close-btn:active {
          background: var(--bg-tertiary);
        }

        .sidebar-layer {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
        }

        .sidebar-nav {
          flex: 1;
          padding: 16px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .sidebar-footer {
          padding: 16px 20px;
          border-top: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .version {
          font-size: 11px;
          color: var(--text-tertiary);
        }

        .logout {
          display: flex;
          align-items: center;
          gap: 8px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 14px;
          cursor: pointer;
          padding: 10px 14px;
          margin: -10px -14px;
          border-radius: 10px;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        .logout:hover,
        .logout:active {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
      `}</style>

      <style jsx global>{`
        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 10px;
          color: var(--text-secondary);
          text-decoration: none;
          transition: all 0.15s ease;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        .nav-item:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .nav-item:active {
          background: var(--bg-tertiary);
        }

        .nav-item.active {
          background: var(--accent-bg);
          color: var(--accent-color);
        }

        .nav-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          flex-shrink: 0;
        }

        .nav-label {
          font-size: 14px;
          font-weight: 500;
        }

        /* Mobile touch improvements */
        @media (max-width: 767px) {
          .nav-item {
            padding: 16px;
            min-height: 52px;
          }

          .nav-label {
            font-size: 15px;
          }
        }
      `}</style>
    </>
  );
}
