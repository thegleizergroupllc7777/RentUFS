import React, { useCallback, useEffect, useState } from 'react';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';

const card = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '16px'
};
const label = { display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '6px' };
const input = { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' };
const pill = (active) => ({
  padding: '8px 16px',
  borderRadius: '999px',
  border: `1px solid ${active ? '#10b981' : '#d1d5db'}`,
  background: active ? '#10b981' : '#fff',
  color: active ? '#fff' : '#374151',
  fontWeight: 600,
  fontSize: '0.9rem',
  cursor: 'pointer'
});

const AdminBroadcast = () => {
  const [channel, setChannel] = useState('email');
  const [audience, setAudience] = useState('both');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState('');
  const [preview, setPreview] = useState({ total: 0, emailCount: 0, smsCount: 0 });
  const [templates, setTemplates] = useState([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const loadPreview = useCallback(async (aud) => {
    try {
      const { data } = await axios.get('/api/admin/broadcast/preview', { params: { audience: aud } });
      setPreview(data);
    } catch (e) { /* non-blocking */ }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/admin/broadcast/templates');
      setTemplates(data);
    } catch (e) { /* non-blocking */ }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);
  useEffect(() => { loadPreview(audience); }, [audience, loadPreview]);

  const doEmail = channel === 'email' || channel === 'both';
  const doSms = channel === 'sms' || channel === 'both';

  const handleSend = async () => {
    setError('');
    setResult(null);
    if (!message.trim()) { setError('Please write a message first.'); return; }

    let confirmMsg;
    if (audience === 'specific') {
      const tokens = recipients.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
      if (tokens.length === 0) { setError('Enter at least one email or phone number above.'); return; }
      const emails = tokens.filter((t) => t.includes('@')).length;
      const phones = tokens.filter((t) => !t.includes('@')).length;
      const reach = [];
      if (doEmail) reach.push(`• ${emails} email${emails === 1 ? '' : 's'}`);
      if (doSms) reach.push(`• ${phones} phone number${phones === 1 ? '' : 's'}`);
      confirmMsg = `Send this only to the people you entered?\n\n${reach.join('\n')}\n\nThis cannot be undone.`;
    } else {
      const reach = [];
      if (doEmail) reach.push(`• ${preview.emailCount} by email`);
      if (doSms) reach.push(`• ${preview.smsCount} by text`);
      const audienceLabel = audience === 'both' ? 'all users' : audience;
      confirmMsg = `Send this to ${audienceLabel}?\n\nIt will reach roughly:\n${reach.join('\n')}\n\nThis cannot be undone.`;
    }
    if (!window.confirm(confirmMsg)) return;

    setSending(true);
    try {
      const { data } = await axios.post('/api/admin/broadcast', { channel, audience, subject, message, recipients });
      setResult(data.results);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!message.trim()) { setError('Write a message before saving it as a template.'); return; }
    const name = window.prompt('Name this template (e.g., "Host Bonus", "10% Discount"):');
    if (!name) return;
    try {
      await axios.post('/api/admin/broadcast/templates', { name, channel, subject, message });
      loadTemplates();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save template.');
    }
  };

  const loadTemplate = (t) => {
    setChannel(t.channel || 'both');
    setSubject(t.subject || '');
    setMessage(t.message || '');
    setResult(null);
    setError('');
  };

  const deleteTemplate = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await axios.delete(`/api/admin/broadcast/templates/${id}`);
      loadTemplates();
    } catch (e) { /* non-blocking */ }
  };

  return (
    <AdminLayout title="Broadcast" subtitle="Send an email or text to your hosts and drivers">
      <div style={{ maxWidth: 720 }}>

        {/* Compose */}
        <div style={card}>
          <div style={{ marginBottom: 16 }}>
            <span style={label}>Channel</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={pill(channel === 'email')} onClick={() => setChannel('email')}>📧 Email</button>
              <button style={pill(channel === 'sms')} onClick={() => setChannel('sms')}>📱 Text</button>
              <button style={pill(channel === 'both')} onClick={() => setChannel('both')}>Both</button>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <span style={label}>Send to</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={pill(audience === 'both')} onClick={() => setAudience('both')}>Everyone</button>
              <button style={pill(audience === 'hosts')} onClick={() => setAudience('hosts')}>Hosts</button>
              <button style={pill(audience === 'drivers')} onClick={() => setAudience('drivers')}>Drivers</button>
              <button style={pill(audience === 'sms-subscribers')} onClick={() => { setAudience('sms-subscribers'); setChannel('sms'); }}>Text sign-ups</button>
              <button style={pill(audience === 'specific')} onClick={() => setAudience('specific')}>Specific people</button>
            </div>
            {audience === 'sms-subscribers' && (
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 8 }}>
                People who opted in by texting your keyword (e.g. “RENT”) to 888-773-9405. Text only.
              </div>
            )}
            {audience === 'specific' && (
              <div style={{ marginTop: 10 }}>
                <textarea
                  style={{ ...input, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }}
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder={'Enter emails and/or phone numbers, separated by commas\ne.g. you@email.com, +13472510825'}
                />
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 6 }}>
                  Goes <strong>only</strong> to the people you list here — perfect for testing to yourself or messaging one person. Use the channel buttons above to pick email, text, or both.
                </div>
              </div>
            )}
          </div>

          {doEmail && (
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Email subject</label>
              <input
                style={input}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., A special offer just for you 🎉"
              />
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <label style={label}>Message</label>
            <textarea
              style={{ ...input, minHeight: 140, resize: 'vertical', fontFamily: 'inherit' }}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={'Hi {firstName}, ...'}
            />
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 6 }}>
              Tip: type <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>{'{firstName}'}</code> and each person sees their own name.
              {doSms && <span> Texts automatically include “Reply STOP to opt out”.</span>}
            </div>
          </div>

          {/* Reach preview */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px', fontSize: '0.9rem', color: '#065f46', marginTop: 8 }}>
            {audience === 'specific' ? (
              <span>This goes <strong>only</strong> to the email(s) and number(s) you entered above.</span>
            ) : (
              <span>
                This will reach{' '}
                {doEmail && <strong>{preview.emailCount} by email</strong>}
                {doEmail && doSms && ' and '}
                {doSms && <strong>{preview.smsCount} by text</strong>}
                {' '}({audience === 'both' ? 'everyone' : audience}).
              </span>
            )}
            {doSms && audience !== 'specific' && (
              <div style={{ color: '#6b7280', marginTop: 6, fontSize: '0.82rem' }}>
                ℹ️ Texts only go to users who opted in to SMS.
              </div>
            )}
          </div>

          {error && <div style={{ color: '#b91c1c', marginTop: 12, fontSize: '0.9rem' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              onClick={handleSend}
              disabled={sending}
              style={{ ...pill(true), padding: '10px 22px', opacity: sending ? 0.6 : 1, cursor: sending ? 'default' : 'pointer' }}
            >
              {sending ? 'Sending…' : 'Send broadcast'}
            </button>
            <button
              onClick={handleSaveTemplate}
              style={{ ...pill(false), padding: '10px 18px' }}
            >
              💾 Save as template
            </button>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div style={{ ...card, borderColor: '#bbf7d0', background: '#f0fdf4' }}>
            <strong style={{ color: '#065f46' }}>Done! ✅</strong>
            <div style={{ fontSize: '0.9rem', color: '#065f46', marginTop: 8, lineHeight: 1.7 }}>
              {doEmail && <div>📧 Email — sent: <strong>{result.emailSent}</strong>, skipped: {result.emailSkipped}, failed: {result.emailFailed}</div>}
              {doSms && <div>📱 Text — sent: <strong>{result.smsSent}</strong>, skipped: {result.smsSkipped}, failed: {result.smsFailed}</div>}
              <div style={{ color: '#6b7280', marginTop: 4, fontSize: '0.82rem' }}>
                "Skipped" = people without that contact method, who opted out (email), or who didn't opt in to texts (SMS).
              </div>
            </div>
          </div>
        )}

        {/* Templates */}
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Saved templates</div>
          {templates.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>No templates yet. Write a message above and click “Save as template”.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {templates.map((t) => (
                <div key={t._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{t.name} <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: '0.8rem' }}>({t.channel})</span></div>
                    <div style={{ color: '#6b7280', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 420 }}>{t.message}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                    <button onClick={() => loadTemplate(t)} style={{ ...pill(false), padding: '6px 12px', fontSize: '0.8rem' }}>Use</button>
                    <button onClick={() => deleteTemplate(t._id)} style={{ padding: '6px 12px', fontSize: '0.8rem', border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', borderRadius: 999, cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </AdminLayout>
  );
};

export default AdminBroadcast;
