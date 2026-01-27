'use client';

import { useEffect, useState } from 'react';

interface UserSummary {
  id: number;
  username: string;
  created_at: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editPasswordConfirm, setEditPasswordConfirm] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const loadUsers = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Ошибка загрузки пользователей');
      }
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Ошибка загрузки пользователей');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);
    setDeleteError(null);

    if (!newUsername.trim() || !newPassword) {
      setCreateError('Введите логин и пароль');
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      setCreateError('Пароли не совпадают');
      return;
    }

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', username: newUsername, password: newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Ошибка создания пользователя');
      }
      setCreateSuccess('Пользователь добавлен');
      setNewUsername('');
      setNewPassword('');
      setNewPasswordConfirm('');
      await loadUsers();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Ошибка создания пользователя');
    }
  };

  const startPasswordEdit = (userId: number) => {
    setEditUserId(userId);
    setEditPassword('');
    setEditPasswordConfirm('');
    setEditError(null);
    setEditSuccess(null);
  };

  const handleUpdatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEditError(null);
    setEditSuccess(null);
    setDeleteError(null);

    if (!editUserId || !editPassword) {
      setEditError('Введите новый пароль');
      return;
    }

    if (editPassword !== editPasswordConfirm) {
      setEditError('Пароли не совпадают');
      return;
    }

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-password', userId: editUserId, password: editPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Ошибка смены пароля');
      }
      setEditSuccess('Пароль обновлен');
      setEditPassword('');
      setEditPasswordConfirm('');
      setEditUserId(null);
      await loadUsers();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Ошибка смены пароля');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    setDeleteError(null);
    setCreateSuccess(null);
    setEditSuccess(null);
    if (!confirm('Удалить пользователя?')) {
      return;
    }
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', userId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Ошибка удаления пользователя');
      }
      await loadUsers();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Ошибка удаления пользователя');
    }
  };

  return (
    <div>
      <header className="page-header">
        <h1 className="page-title">Пользователи</h1>
        <p className="page-description">Управление доступом к панели</p>
      </header>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Добавить пользователя</h2>
          </div>
          <form onSubmit={handleCreateUser}>
            <div className="form-group">
              <label className="form-label" htmlFor="new-username">Логин</label>
              <input
                id="new-username"
                className="form-input"
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="new-password">Пароль</label>
              <input
                id="new-password"
                type="password"
                className="form-input"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="new-password-confirm">Повторите пароль</label>
              <input
                id="new-password-confirm"
                type="password"
                className="form-input"
                value={newPasswordConfirm}
                onChange={(event) => setNewPasswordConfirm(event.target.value)}
                autoComplete="new-password"
              />
              <div className="form-hint">Минимум 8 символов.</div>
            </div>
            {createError && <div className="form-error">{createError}</div>}
            {createSuccess && <div style={{ color: 'var(--color-success)', fontSize: 13 }}>{createSuccess}</div>}
            <button className="btn btn-primary" type="submit">Добавить</button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Список пользователей</h2>
          </div>
          {isLoading ? (
            <div className="loading"><span className="spinner" /> Загрузка...</div>
          ) : loadError ? (
            <div className="form-error">{loadError}</div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Логин</th>
                    <th>Создан</th>
                    <th style={{ width: 240 }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.username}</td>
                      <td>{formatDate(user.created_at)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            type="button"
                            onClick={() => startPasswordEdit(user.id)}
                          >
                            Сменить пароль
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            style={{ color: 'var(--color-error)' }}
                            onClick={() => handleDeleteUser(user.id)}
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {deleteError && <div className="form-error" style={{ marginTop: 12 }}>{deleteError}</div>}

          {editUserId && (
            <form onSubmit={handleUpdatePassword} style={{ marginTop: 20 }}>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-password">Новый пароль</label>
                <input
                  id="edit-password"
                  type="password"
                  className="form-input"
                  value={editPassword}
                  onChange={(event) => setEditPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="edit-password-confirm">Повторите пароль</label>
                <input
                  id="edit-password-confirm"
                  type="password"
                  className="form-input"
                  value={editPasswordConfirm}
                  onChange={(event) => setEditPasswordConfirm(event.target.value)}
                  autoComplete="new-password"
                />
              </div>
              {editError && <div className="form-error">{editError}</div>}
              {editSuccess && <div style={{ color: 'var(--color-success)', fontSize: 13 }}>{editSuccess}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" type="submit">Сохранить</button>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  onClick={() => setEditUserId(null)}
                >
                  Отмена
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
