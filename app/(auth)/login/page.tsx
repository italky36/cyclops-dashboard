'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSetup = useMemo(() => hasUsers === false, [hasUsers]);

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        if (active) {
          setHasUsers(Boolean(data.hasUsers));
        }
      } catch {
        if (active) {
          setHasUsers(true);
        }
      }
    };
    loadStatus();
    return () => { active = false; };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Введите логин и пароль');
      return;
    }

    if (isSetup && password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(isSetup ? '/api/auth/setup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Ошибка авторизации');
      }
      router.replace('/');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Ошибка авторизации');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={`card ${styles.card}`}>
        <div className={styles.header}>
          <div className={styles.title}>Cyclops Dashboard</div>
          <div className={styles.subtitle}>
            {hasUsers === null
              ? 'Проверяем доступ...'
              : isSetup
                ? 'Создайте первый аккаунт администратора'
                : 'Войдите с вашим логином и паролем'}
          </div>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Логин</label>
            <input
              id="username"
              className="form-input"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              disabled={isSubmitting}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Пароль</label>
            <input
              id="password"
              className="form-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              disabled={isSubmitting}
            />
          </div>

          {isSetup && (
            <div className="form-group">
              <label className="form-label" htmlFor="confirmPassword">Повторите пароль</label>
              <input
                id="confirmPassword"
                className="form-input"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                disabled={isSubmitting}
              />
              <div className={styles.hint}>Минимум 8 символов.</div>
            </div>
          )}

          {error && <div className={styles.error}>✗ {error}</div>}

          <div className={styles.actions}>
            <button className="btn btn-primary" type="submit" disabled={isSubmitting || hasUsers === null}>
              {isSubmitting ? 'Проверка...' : (isSetup ? 'Создать администратора' : 'Войти')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
