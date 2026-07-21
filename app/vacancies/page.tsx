'use client';

import { useState, type CSSProperties } from 'react';
import SiteHeader from '@/components/SiteHeader';
import { SERIF, SANS, fieldStyle, primaryBtnFull, eyebrow } from '@/lib/ui';

// Вакансії: значення (для БД) → підпис (для людини).
const POSITIONS: [string, string][] = [
  ['cook', 'Кухар'],
  ['waiter', 'Офіціант'],
  ['kitchen', 'Кухонний працівник'],
  ['bartender', 'Бармен'],
  ['maid', 'Покоївка'],
  ['cleaner', 'Працівник з прибирання'],
];

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#6E6E73',
  marginBottom: 6,
  fontFamily: SANS,
};

const hintStyle: CSSProperties = { fontSize: 12, color: '#A0A0A5', marginTop: 6, fontFamily: SANS };

export default function VacanciesPage() {
  const [position, setPosition] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [residence, setResidence] = useState('');
  const [contact, setContact] = useState('');
  const [experience, setExperience] = useState('');
  const [skills, setSkills] = useState('');
  const [resume, setResume] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const canSubmit =
    !!position &&
    firstName.trim() &&
    lastName.trim() &&
    age.trim() &&
    residence.trim() &&
    contact.trim() &&
    experience.trim() &&
    skills.trim();

  async function submit() {
    setError('');
    if (!canSubmit) {
      setError('Оберіть вакансію та заповніть усі обовʼязкові поля.');
      return;
    }
    setSending(true);
    try {
      const r = await fetch('/api/vacancies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position,
          first_name: firstName,
          last_name: lastName,
          age: Number(age),
          residence,
          experience,
          contact,
          skills,
          resume,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setError(j.message || 'Не вдалося надіслати заявку. Спробуйте ще раз.');
        setSending(false);
        return;
      }
      setDone(true);
    } catch {
      setError('Помилка мережі. Спробуйте ще раз.');
      setSending(false);
    }
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: '#FBFAF6' }}>
        <SiteHeader subtitle="Вакансії" />
        <div style={{ maxWidth: 620, margin: '0 auto', padding: '80px 22px', textAlign: 'center' }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#3BA55D',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              margin: '0 auto 20px',
            }}
          >
            ✓
          </div>
          <h1 style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 600, margin: '0 0 10px' }}>Дякуємо за заявку!</h1>
          <p style={{ fontFamily: SANS, fontSize: 16, color: '#6E6E73', lineHeight: 1.6 }}>
            Ми отримали вашу заявку і звʼяжемось із вами за вказаними контактами.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FBFAF6' }}>
      <SiteHeader subtitle="Вакансії" />
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '40px 22px 80px' }}>
        <h1 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 600, margin: '0 0 8px' }}>Приєднуйтесь до команди</h1>
        <p style={{ fontFamily: SANS, fontSize: 16, color: '#6E6E73', lineHeight: 1.6, margin: '0 0 28px' }}>
          «Підгорецький Маєток» шукає працьовитих і привітних людей. Оберіть вакансію та заповніть коротку форму — і ми
          звʼяжемось із вами.
        </p>

        <div style={{ ...eyebrow, marginBottom: 10 }}>Вакансія</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
          {POSITIONS.map(([k, l]) => {
            const active = position === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setPosition(k)}
                style={{
                  padding: '10px 18px',
                  borderRadius: 100,
                  cursor: 'pointer',
                  fontFamily: SANS,
                  fontSize: 14,
                  fontWeight: 600,
                  border: `1.5px solid ${active ? '#1D1D1F' : '#E0DED8'}`,
                  background: active ? '#1D1D1F' : '#fff',
                  color: active ? '#fff' : '#6E6E73',
                }}
              >
                {l}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="vac-row">
            <div>
              <label style={labelStyle}>Ім’я *</label>
              <input style={fieldStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Прізвище *</label>
              <input style={fieldStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="vac-row">
            <div>
              <label style={labelStyle}>Вік *</label>
              <input
                style={fieldStyle}
                type="number"
                inputMode="numeric"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Місце проживання *</label>
              <input
                style={fieldStyle}
                value={residence}
                onChange={(e) => setResidence(e.target.value)}
                placeholder="Місто / село"
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Контактні дані *</label>
            <input
              style={fieldStyle}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Телефон; за бажанням — email або Telegram"
            />
          </div>

          <div>
            <label style={labelStyle}>Досвід роботи *</label>
            <textarea
              style={{ ...fieldStyle, minHeight: 90, resize: 'vertical' }}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="Де та ким працювали, скільки років досвіду"
            />
          </div>

          <div>
            <label style={labelStyle}>Корисні навички *</label>
            <textarea
              style={{ ...fieldStyle, minHeight: 80, resize: 'vertical' }}
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="Що вмієте, що буде корисним для цієї роботи"
            />
          </div>

          <div>
            <label style={labelStyle}>Резюме або посилання на нього</label>
            <textarea
              style={{ ...fieldStyle, minHeight: 70, resize: 'vertical' }}
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              placeholder="Посилання на резюме (Google Drive, LinkedIn) або додаткова інформація"
            />
            <div style={hintStyle}>Необовʼязкове поле.</div>
          </div>

          {error && <div style={{ color: '#D9534F', fontSize: 14, fontFamily: SANS }}>{error}</div>}

          <button
            type="button"
            onClick={submit}
            disabled={sending}
            style={{ ...primaryBtnFull, opacity: sending ? 0.6 : 1, cursor: sending ? 'default' : 'pointer' }}
          >
            {sending ? 'Надсилаємо…' : 'Надіслати заявку'}
          </button>
          <div style={{ ...hintStyle, textAlign: 'center', marginTop: 0 }}>Поля з * — обовʼязкові.</div>
        </div>
      </div>

      <style>{`@media (max-width: 520px){ .vac-row{ grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
