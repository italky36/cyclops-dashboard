'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useCyclops } from '@/hooks/useCyclops';
import type { BeneficiaryType } from '@/types/cyclops';

export default function NewBeneficiaryPage() {
  const router = useRouter();
  const layer = useAppStore((s) => s.layer);
  const addRecentAction = useAppStore((s) => s.addRecentAction);
  const cyclops = useCyclops({ layer });

  const [type, setType] = useState<BeneficiaryType>('ul');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ЮЛ fields
  const [ulData, setUlData] = useState({
    inn: '',
    name: '',
    kpp: '',
  });

  // ИП fields
  const [ipData, setIpData] = useState({
    inn: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    ogrnip: '',
  });

  // ФЛ fields
  const [flData, setFlData] = useState({
    inn: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    birth_date: '',
    birth_place: '',
    passport_series: '',
    passport_number: '',
    passport_date: '',
    registration_address: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      let response;
      let beneficiaryName = '';

      switch (type) {
        case 'ul':
          response = await cyclops.createBeneficiaryUL(ulData);
          beneficiaryName = ulData.name;
          break;
        case 'ip':
          response = await cyclops.createBeneficiaryIP(ipData);
          beneficiaryName = `${ipData.last_name} ${ipData.first_name}`;
          break;
        case 'fl':
          response = await cyclops.createBeneficiaryFL(flData);
          beneficiaryName = `${flData.last_name} ${flData.first_name}`;
          break;
      }

      if (response.error) {
        throw new Error(response.error.message);
      }

      addRecentAction({
        type: 'Создание бенефициара',
        description: `Создан бенефициар ${beneficiaryName}`,
        layer,
      });

      router.push('/beneficiaries');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при создании');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="new-beneficiary-page">
      <header className="page-header">
        <div>
          <nav className="breadcrumb">
            <Link href="/beneficiaries">Бенефициары</Link>
            <span>/</span>
            <span>Новый</span>
          </nav>
          <h1 className="page-title">Добавить бенефициара</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="card form-card">
        {/* Type Selector */}
        <div className="form-group">
          <label className="form-label">Тип бенефициара</label>
          <div className="type-selector">
            <button
              type="button"
              className={`type-option ${type === 'ul' ? 'active' : ''}`}
              onClick={() => setType('ul')}
            >
              <span className="type-icon">🏢</span>
              <span className="type-label">Юр. лицо</span>
              <span className="type-desc">ООО, АО, ПАО</span>
            </button>
            <button
              type="button"
              className={`type-option ${type === 'ip' ? 'active' : ''}`}
              onClick={() => setType('ip')}
            >
              <span className="type-icon">👤</span>
              <span className="type-label">ИП</span>
              <span className="type-desc">Индивидуальный предприниматель</span>
            </button>
            <button
              type="button"
              className={`type-option ${type === 'fl' ? 'active' : ''}`}
              onClick={() => setType('fl')}
            >
              <span className="type-icon">👱</span>
              <span className="type-label">Физ. лицо</span>
              <span className="type-desc">Физическое лицо, самозанятый</span>
            </button>
          </div>
        </div>

        <hr className="divider" />

        {/* ЮЛ Form */}
        {type === 'ul' && (
          <div className="form-fields">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">ИНН *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="10 цифр"
                  maxLength={10}
                  value={ulData.inn}
                  onChange={(e) => setUlData({ ...ulData, inn: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">КПП *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="9 цифр"
                  maxLength={9}
                  value={ulData.kpp}
                  onChange={(e) => setUlData({ ...ulData, kpp: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Наименование организации *</label>
              <input
                type="text"
                className="form-input"
                placeholder='ООО "Название"'
                value={ulData.name}
                onChange={(e) => setUlData({ ...ulData, name: e.target.value })}
                required
              />
              <p className="form-hint">Должно совпадать с данными ЕГРЮЛ</p>
            </div>
          </div>
        )}

        {/* ИП Form */}
        {type === 'ip' && (
          <div className="form-fields">
            <div className="form-group">
              <label className="form-label">ИНН *</label>
              <input
                type="text"
                className="form-input"
                placeholder="12 цифр"
                maxLength={12}
                value={ipData.inn}
                onChange={(e) => setIpData({ ...ipData, inn: e.target.value })}
                required
              />
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">Фамилия *</label>
                <input
                  type="text"
                  className="form-input"
                  value={ipData.last_name}
                  onChange={(e) => setIpData({ ...ipData, last_name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Имя *</label>
                <input
                  type="text"
                  className="form-input"
                  value={ipData.first_name}
                  onChange={(e) => setIpData({ ...ipData, first_name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Отчество</label>
                <input
                  type="text"
                  className="form-input"
                  value={ipData.middle_name}
                  onChange={(e) => setIpData({ ...ipData, middle_name: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">ОГРНИП</label>
              <input
                type="text"
                className="form-input"
                placeholder="15 цифр"
                maxLength={15}
                value={ipData.ogrnip}
                onChange={(e) => setIpData({ ...ipData, ogrnip: e.target.value })}
              />
            </div>
          </div>
        )}

        {/* ФЛ Form */}
        {type === 'fl' && (
          <div className="form-fields">
            <div className="form-group">
              <label className="form-label">ИНН *</label>
              <input
                type="text"
                className="form-input"
                placeholder="12 цифр"
                maxLength={12}
                value={flData.inn}
                onChange={(e) => setFlData({ ...flData, inn: e.target.value })}
                required
              />
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">Фамилия *</label>
                <input
                  type="text"
                  className="form-input"
                  value={flData.last_name}
                  onChange={(e) => setFlData({ ...flData, last_name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Имя *</label>
                <input
                  type="text"
                  className="form-input"
                  value={flData.first_name}
                  onChange={(e) => setFlData({ ...flData, first_name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Отчество</label>
                <input
                  type="text"
                  className="form-input"
                  value={flData.middle_name}
                  onChange={(e) => setFlData({ ...flData, middle_name: e.target.value })}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Дата рождения *</label>
                <input
                  type="date"
                  className="form-input"
                  value={flData.birth_date}
                  onChange={(e) => setFlData({ ...flData, birth_date: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Место рождения *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="г. Москва"
                  value={flData.birth_place}
                  onChange={(e) => setFlData({ ...flData, birth_place: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">Серия паспорта *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="4516"
                  maxLength={4}
                  value={flData.passport_series}
                  onChange={(e) => setFlData({ ...flData, passport_series: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Номер паспорта *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="123456"
                  maxLength={6}
                  value={flData.passport_number}
                  onChange={(e) => setFlData({ ...flData, passport_number: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Дата выдачи *</label>
                <input
                  type="date"
                  className="form-input"
                  value={flData.passport_date}
                  onChange={(e) => setFlData({ ...flData, passport_date: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Адрес регистрации *</label>
              <textarea
                className="form-input form-textarea"
                placeholder="г. Москва, ул. Примерная, д. 1, кв. 1, 123456"
                value={flData.registration_address}
                onChange={(e) => setFlData({ ...flData, registration_address: e.target.value })}
                required
              />
              <p className="form-hint">Адрес должен полностью совпадать с адресом в паспорте</p>
            </div>
          </div>
        )}

        {error && (
          <div className="error-message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        <div className="form-actions">
          <Link href="/beneficiaries" className="btn btn-secondary">
            Отмена
          </Link>
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" />
                Создание...
              </>
            ) : (
              'Создать бенефициара'
            )}
          </button>
        </div>
      </form>

      <style jsx>{`
        .new-beneficiary-page {
          max-width: 800px;
        }

        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: var(--text-tertiary);
          margin-bottom: 8px;
        }

        .breadcrumb a {
          color: var(--text-secondary);
          text-decoration: none;
        }

        .breadcrumb a:hover {
          color: var(--accent-color);
        }

        .form-card {
          padding: 32px;
        }

        .type-selector {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .type-option {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 20px;
          background: var(--bg-secondary);
          border: 2px solid transparent;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .type-option:hover {
          background: var(--bg-tertiary);
        }

        .type-option.active {
          background: var(--accent-bg);
          border-color: var(--accent-color);
        }

        .type-icon {
          font-size: 32px;
        }

        .type-label {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .type-desc {
          font-size: 12px;
          color: var(--text-tertiary);
        }

        .divider {
          border: none;
          border-top: 1px solid var(--border-color);
          margin: 24px 0;
        }

        .form-fields {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .form-row-3 {
          grid-template-columns: repeat(3, 1fr);
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          background: var(--color-error-bg);
          color: var(--color-error);
          border-radius: 10px;
          font-size: 14px;
          margin-top: 20px;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid var(--border-color);
        }

        @media (max-width: 767px) {
          .breadcrumb {
            font-size: 13px;
          }

          .form-card {
            padding: 20px;
          }

          .type-selector {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .type-option {
            flex-direction: row;
            align-items: center;
            padding: 16px;
            gap: 12px;
          }

          .type-icon {
            font-size: 24px;
          }

          .type-label {
            text-align: left;
          }

          .type-desc {
            text-align: left;
          }

          .form-row,
          .form-row-3 {
            grid-template-columns: 1fr;
            gap: 0;
          }

          .form-actions {
            flex-direction: column-reverse;
            gap: 10px;
            margin-top: 24px;
          }

          .form-actions .btn {
            width: 100%;
          }

          .divider {
            margin: 20px 0;
          }

          .error-message {
            font-size: 13px;
          }
        }
      `}</style>
    </div>
  );
}
