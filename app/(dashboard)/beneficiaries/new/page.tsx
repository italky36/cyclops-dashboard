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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ЮЛ fields
  const [ulData, setUlData] = useState({
    inn: '',
    name: '',
    kpp: '',
  });

  // ИП fields
  const [ipData, setIpData] = useState({
    inn: '',
    nominal_account_code: '',
    nominal_account_bic: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    tax_resident: true,
  });

  // ФЛ fields
  const [flData, setFlData] = useState({
    inn: '',
    nominal_account_code: '',
    nominal_account_bic: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    birth_date: '',
    birth_place: '',
    passport_series: '',
    passport_number: '',
    passport_date: '',
    registration_address: '',
    resident: true,
    reg_country_code: '',
    tax_resident: true,
  });

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validateDigits = (value: string, length: number) => {
    const cleaned = value.replace(/\s+/g, '');
    return /^\d+$/.test(cleaned) && cleaned.length === length;
  };

  const validateOptionalDigits = (value: string, length: number) => {
    if (!value.trim()) return true;
    return validateDigits(value, length);
  };

  const birthPlaceRegex = /^(?!.*[IVX]{5,})[-. ,А-Яа-яёЁ0-9\)\(IVX"\/\\№]+$/;
  const minAddressLength = 15;

  const digitsOnly = (value: string) => value.replace(/\D+/g, '');
  const upperTwoLetters = (value: string) => value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2);

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (type === 'ul') {
      if (!validateDigits(ulData.inn, 10)) {
        errors.ul_inn = 'ИНН должен содержать 10 цифр';
      }
      if (!validateDigits(ulData.kpp, 9)) {
        errors.ul_kpp = 'КПП должен содержать 9 цифр';
      }
      if (!ulData.name.trim()) {
        errors.ul_name = 'Укажите наименование';
      }
    }

    if (type === 'ip') {
      if (!validateDigits(ipData.inn, 12)) {
        errors.ip_inn = 'ИНН должен содержать 12 цифр';
      }
      if (!validateOptionalDigits(ipData.nominal_account_code, 20)) {
        errors.ip_nominal_account_code = 'Номер счёта должен содержать 20 цифр';
      }
      if (!validateOptionalDigits(ipData.nominal_account_bic, 9)) {
        errors.ip_nominal_account_bic = 'БИК должен содержать 9 цифр';
      }
      if (!ipData.last_name.trim()) {
        errors.ip_last_name = 'Укажите фамилию';
      }
      if (!ipData.first_name.trim()) {
        errors.ip_first_name = 'Укажите имя';
      }
    }

    if (type === 'fl') {
      if (!validateDigits(flData.inn, 12)) {
        errors.fl_inn = 'ИНН должен содержать 12 цифр';
      }
      if (!validateOptionalDigits(flData.nominal_account_code, 20)) {
        errors.fl_nominal_account_code = 'Номер счёта должен содержать 20 цифр';
      }
      if (!validateOptionalDigits(flData.nominal_account_bic, 9)) {
        errors.fl_nominal_account_bic = 'БИК должен содержать 9 цифр';
      }
      if (!flData.last_name.trim()) {
        errors.fl_last_name = 'Укажите фамилию';
      }
      if (!flData.first_name.trim()) {
        errors.fl_first_name = 'Укажите имя';
      }
      if (!flData.birth_date) {
        errors.fl_birth_date = 'Укажите дату рождения';
      }
      if (!flData.birth_place.trim() || !birthPlaceRegex.test(flData.birth_place.trim())) {
        errors.fl_birth_place = 'Недопустимый формат места рождения';
      }
      if (!validateDigits(flData.passport_series, 4)) {
        errors.fl_passport_series = 'Серия паспорта: 4 цифры';
      }
      if (!validateDigits(flData.passport_number, 6)) {
        errors.fl_passport_number = 'Номер паспорта: 6 цифр';
      }
      if (!flData.passport_date) {
        errors.fl_passport_date = 'Укажите дату выдачи';
      }
      if (!flData.registration_address.trim()) {
        errors.fl_registration_address = 'Укажите адрес регистрации';
      } else if (flData.registration_address.trim().length < minAddressLength) {
        errors.fl_registration_address = `Адрес должен быть не короче ${minAddressLength} символов`;
      }
      if (!flData.resident) {
        const code = flData.reg_country_code.trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(code)) {
          errors.fl_reg_country_code = 'Код страны должен быть из 2 латинских букв';
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!validateForm()) {
        setIsSubmitting(false);
        return;
      }
      let response;
      let beneficiaryName = '';

      switch (type) {
        case 'ul':
          response = await cyclops.createBeneficiaryUL(ulData);
          beneficiaryName = ulData.name;
          break;
        case 'ip':
          response = await cyclops.createBeneficiaryIP({
            inn: ipData.inn,
            nominal_account_code: ipData.nominal_account_code || undefined,
            nominal_account_bic: ipData.nominal_account_bic || undefined,
            beneficiary_data: {
              first_name: ipData.first_name,
              middle_name: ipData.middle_name || undefined,
              last_name: ipData.last_name,
              tax_resident: ipData.tax_resident,
            },
          });
          beneficiaryName = `${ipData.last_name} ${ipData.first_name}`;
          break;
        case 'fl':
          response = await cyclops.createBeneficiaryFL({
            inn: flData.inn,
            nominal_account_code: flData.nominal_account_code || undefined,
            nominal_account_bic: flData.nominal_account_bic || undefined,
            beneficiary_data: {
              first_name: flData.first_name,
              middle_name: flData.middle_name || undefined,
              last_name: flData.last_name,
              birth_date: flData.birth_date,
              birth_place: flData.birth_place,
              passport_series: flData.passport_series,
              passport_number: flData.passport_number,
              passport_date: flData.passport_date,
              registration_address: flData.registration_address,
              resident: flData.resident,
              reg_country_code: flData.resident ? undefined : (flData.reg_country_code || undefined),
              tax_resident: flData.tax_resident,
            },
          });
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
                  className={`form-input ${fieldErrors.ul_inn ? 'input-error' : ''}`}
                  placeholder="10 цифр"
                  maxLength={10}
                  value={ulData.inn}
                  onChange={(e) => {
                    setUlData({ ...ulData, inn: digitsOnly(e.target.value).slice(0, 10) });
                    clearFieldError('ul_inn');
                  }}
                  required
                />
                {fieldErrors.ul_inn && <span className="form-error">{fieldErrors.ul_inn}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">КПП *</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.ul_kpp ? 'input-error' : ''}`}
                  placeholder="9 цифр"
                  maxLength={9}
                  value={ulData.kpp}
                  onChange={(e) => {
                    setUlData({ ...ulData, kpp: digitsOnly(e.target.value).slice(0, 9) });
                    clearFieldError('ul_kpp');
                  }}
                  required
                />
                {fieldErrors.ul_kpp && <span className="form-error">{fieldErrors.ul_kpp}</span>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Наименование организации *</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.ul_name ? 'input-error' : ''}`}
                  placeholder='ООО "Название"'
                  value={ulData.name}
                  onChange={(e) => {
                    setUlData({ ...ulData, name: e.target.value });
                    clearFieldError('ul_name');
                }}
                required
              />
              <p className="form-hint">Должно совпадать с данными ЕГРЮЛ</p>
              {fieldErrors.ul_name && <span className="form-error">{fieldErrors.ul_name}</span>}
            </div>
          </div>
        )}

        {/* ИП Form */}
        {type === 'ip' && (
          <div className="form-fields">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Номер номинального счёта</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.ip_nominal_account_code ? 'input-error' : ''}`}
                  placeholder="20 цифр (опционально)"
                  maxLength={20}
                  value={ipData.nominal_account_code}
                  onChange={(e) => {
                    setIpData({ ...ipData, nominal_account_code: digitsOnly(e.target.value).slice(0, 20) });
                    clearFieldError('ip_nominal_account_code');
                  }}
                />
                {fieldErrors.ip_nominal_account_code && (
                  <span className="form-error">{fieldErrors.ip_nominal_account_code}</span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">БИК номинального счёта</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.ip_nominal_account_bic ? 'input-error' : ''}`}
                  placeholder="9 цифр (опционально)"
                  maxLength={9}
                  value={ipData.nominal_account_bic}
                  onChange={(e) => {
                    setIpData({ ...ipData, nominal_account_bic: digitsOnly(e.target.value).slice(0, 9) });
                    clearFieldError('ip_nominal_account_bic');
                  }}
                />
                {fieldErrors.ip_nominal_account_bic && (
                  <span className="form-error">{fieldErrors.ip_nominal_account_bic}</span>
                )}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">ИНН *</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.ip_inn ? 'input-error' : ''}`}
                  placeholder="12 цифр"
                  maxLength={12}
                  value={ipData.inn}
                  onChange={(e) => {
                    setIpData({ ...ipData, inn: digitsOnly(e.target.value).slice(0, 12) });
                    clearFieldError('ip_inn');
                  }}
                  required
                />
              {fieldErrors.ip_inn && <span className="form-error">{fieldErrors.ip_inn}</span>}
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">Фамилия *</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.ip_last_name ? 'input-error' : ''}`}
                  value={ipData.last_name}
                  onChange={(e) => {
                    setIpData({ ...ipData, last_name: e.target.value });
                    clearFieldError('ip_last_name');
                  }}
                  required
                />
                {fieldErrors.ip_last_name && <span className="form-error">{fieldErrors.ip_last_name}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Имя *</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.ip_first_name ? 'input-error' : ''}`}
                  value={ipData.first_name}
                  onChange={(e) => {
                    setIpData({ ...ipData, first_name: e.target.value });
                    clearFieldError('ip_first_name');
                  }}
                  required
                />
                {fieldErrors.ip_first_name && <span className="form-error">{fieldErrors.ip_first_name}</span>}
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
                <label className="form-label">Налоговый резидент РФ</label>
                <label className="form-checkbox">
                  <input
                    type="checkbox"
                    checked={ipData.tax_resident}
                    onChange={(e) => setIpData({ ...ipData, tax_resident: e.target.checked })}
                  />
                  <span>Является налоговым резидентом РФ</span>
                </label>
              </div>
          </div>
        )}

        {/* ФЛ Form */}
        {type === 'fl' && (
          <div className="form-fields">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Номер номинального счёта</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.fl_nominal_account_code ? 'input-error' : ''}`}
                  placeholder="20 цифр (опционально)"
                  maxLength={20}
                  value={flData.nominal_account_code}
                  onChange={(e) => {
                    setFlData({ ...flData, nominal_account_code: digitsOnly(e.target.value).slice(0, 20) });
                    clearFieldError('fl_nominal_account_code');
                  }}
                />
                {fieldErrors.fl_nominal_account_code && (
                  <span className="form-error">{fieldErrors.fl_nominal_account_code}</span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">БИК номинального счёта</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.fl_nominal_account_bic ? 'input-error' : ''}`}
                  placeholder="9 цифр (опционально)"
                  maxLength={9}
                  value={flData.nominal_account_bic}
                  onChange={(e) => {
                    setFlData({ ...flData, nominal_account_bic: digitsOnly(e.target.value).slice(0, 9) });
                    clearFieldError('fl_nominal_account_bic');
                  }}
                />
                {fieldErrors.fl_nominal_account_bic && (
                  <span className="form-error">{fieldErrors.fl_nominal_account_bic}</span>
                )}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">ИНН *</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.fl_inn ? 'input-error' : ''}`}
                  placeholder="12 цифр"
                  maxLength={12}
                  value={flData.inn}
                  onChange={(e) => {
                    setFlData({ ...flData, inn: digitsOnly(e.target.value).slice(0, 12) });
                    clearFieldError('fl_inn');
                  }}
                  required
                />
              {fieldErrors.fl_inn && <span className="form-error">{fieldErrors.fl_inn}</span>}
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">Фамилия *</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.fl_last_name ? 'input-error' : ''}`}
                  value={flData.last_name}
                  onChange={(e) => {
                    setFlData({ ...flData, last_name: e.target.value });
                    clearFieldError('fl_last_name');
                  }}
                  required
                />
                {fieldErrors.fl_last_name && <span className="form-error">{fieldErrors.fl_last_name}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Имя *</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.fl_first_name ? 'input-error' : ''}`}
                  value={flData.first_name}
                  onChange={(e) => {
                    setFlData({ ...flData, first_name: e.target.value });
                    clearFieldError('fl_first_name');
                  }}
                  required
                />
                {fieldErrors.fl_first_name && <span className="form-error">{fieldErrors.fl_first_name}</span>}
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
                  className={`form-input ${fieldErrors.fl_birth_date ? 'input-error' : ''}`}
                  value={flData.birth_date}
                  onChange={(e) => {
                    setFlData({ ...flData, birth_date: e.target.value });
                    clearFieldError('fl_birth_date');
                  }}
                  required
                />
                {fieldErrors.fl_birth_date && <span className="form-error">{fieldErrors.fl_birth_date}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Место рождения *</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.fl_birth_place ? 'input-error' : ''}`}
                  placeholder="г. Москва"
                  value={flData.birth_place}
                  onChange={(e) => {
                    setFlData({ ...flData, birth_place: e.target.value });
                    clearFieldError('fl_birth_place');
                  }}
                  required
                />
                {fieldErrors.fl_birth_place && <span className="form-error">{fieldErrors.fl_birth_place}</span>}
              </div>
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">Серия паспорта *</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.fl_passport_series ? 'input-error' : ''}`}
                  placeholder="4516"
                  maxLength={4}
                  value={flData.passport_series}
                  onChange={(e) => {
                    setFlData({ ...flData, passport_series: digitsOnly(e.target.value).slice(0, 4) });
                    clearFieldError('fl_passport_series');
                  }}
                  required
                />
                {fieldErrors.fl_passport_series && <span className="form-error">{fieldErrors.fl_passport_series}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Номер паспорта *</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.fl_passport_number ? 'input-error' : ''}`}
                  placeholder="123456"
                  maxLength={6}
                  value={flData.passport_number}
                  onChange={(e) => {
                    setFlData({ ...flData, passport_number: digitsOnly(e.target.value).slice(0, 6) });
                    clearFieldError('fl_passport_number');
                  }}
                  required
                />
                {fieldErrors.fl_passport_number && (
                  <span className="form-error">{fieldErrors.fl_passport_number}</span>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Дата выдачи *</label>
                <input
                  type="date"
                  className={`form-input ${fieldErrors.fl_passport_date ? 'input-error' : ''}`}
                  value={flData.passport_date}
                  onChange={(e) => {
                    setFlData({ ...flData, passport_date: e.target.value });
                    clearFieldError('fl_passport_date');
                  }}
                  required
                />
                {fieldErrors.fl_passport_date && <span className="form-error">{fieldErrors.fl_passport_date}</span>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Адрес регистрации *</label>
              <textarea
                className={`form-input form-textarea ${fieldErrors.fl_registration_address ? 'input-error' : ''}`}
                placeholder="г. Москва, ул. Примерная, д. 1, кв. 1, 123456"
                value={flData.registration_address}
                onChange={(e) => {
                  setFlData({ ...flData, registration_address: e.target.value });
                  clearFieldError('fl_registration_address');
                }}
                required
              />
              <p className="form-hint">Адрес должен полностью совпадать с адресом в паспорте</p>
              {fieldErrors.fl_registration_address && (
                <span className="form-error">{fieldErrors.fl_registration_address}</span>
              )}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Резидент РФ</label>
                <label className="form-checkbox">
                  <input
                    type="checkbox"
                    checked={flData.resident}
                    onChange={(e) => setFlData({ ...flData, resident: e.target.checked })}
                  />
                  <span>Имеет паспорт РФ (резидент)</span>
                </label>
              </div>
              {!flData.resident && (
                <div className="form-group">
                  <label className="form-label">Код гражданства (ОКСМ, alpha-2)</label>
                  <input
                    type="text"
                    className={`form-input ${fieldErrors.fl_reg_country_code ? 'input-error' : ''}`}
                    placeholder="US, DE, KZ"
                    maxLength={2}
                    value={flData.reg_country_code}
                    onChange={(e) => {
                      setFlData({ ...flData, reg_country_code: upperTwoLetters(e.target.value) });
                      clearFieldError('fl_reg_country_code');
                    }}
                  />
                  {fieldErrors.fl_reg_country_code && (
                    <span className="form-error">{fieldErrors.fl_reg_country_code}</span>
                  )}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Налоговый резидент РФ</label>
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={flData.tax_resident}
                  onChange={(e) => setFlData({ ...flData, tax_resident: e.target.checked })}
                />
                <span>Является налоговым резидентом РФ</span>
              </label>
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

        .form-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--text-secondary);
          margin-top: 6px;
        }

        .form-checkbox input {
          width: 16px;
          height: 16px;
        }

        .input-error {
          border-color: var(--color-error);
          box-shadow: 0 0 0 3px var(--color-error-bg);
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
