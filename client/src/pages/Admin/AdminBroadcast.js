import React, { useCallback, useEffect, useState } from 'react';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';
import { useAuth } from '../../context/AuthContext';

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
  const { user: me } = useAuth();
  const [insTesting, setInsTesting] = useState(false);
  const [insResult, setInsResult] = useState(null);
  const [insVehicles, setInsVehicles] = useState([]);
  const [insVin, setInsVin] = useState('');

  const loadInsVehicles = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/admin/insurance-test/vehicles');
      setInsVehicles(data);
    } catch (e) { /* non-blocking */ }
  }, []);

  const runInsuranceTest = async () => {
    const picked = insVehicles.find(v => v.vin === insVin);
    const label = picked ? `${picked.label} (${picked.state})` : 'the first registered vehicle';
    if (!window.confirm(`Run an insurance coverage test on ${label}?\n\nUses a test driver — no reservation, no customer charged. Any coverage that starts is cancelled immediately.\n\n⚠️ If the state IS covered, coverage will SUCCEED and TeqMobility may charge RentUFS. (A non-covered state like NJ fails for free.)`)) return;
    setInsResult(null);
    setInsTesting(true);
    try {
      const { data } = await axios.post('/api/admin/insurance-test', insVin ? { vin: insVin } : {});
      setInsResult(data);
    } catch (e) {
      setInsResult({ error: e.response?.data?.error || e.response?.data?.message || 'Test failed.' });
    } finally {
      setInsTesting(false);
    }
  };

  const [channel, setChannel] = useState('email');
  const [audience, setAudience] = useState('both');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [design, setDesign] = useState(''); // '' = plain message, 'become_host' = host pitch
  const [recipients, setRecipients] = useState('');
  const [preview, setPreview] = useState({ total: 0, emailCount: 0, smsCount: 0 });
  const [templates, setTemplates] = useState([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Send-a-test-email tool
  const [testTemplate, setTestTemplate] = useState('cancellation');
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const sendTestEmail = async () => {
    setTestMsg('');
    if (!testEmail.trim() || !testEmail.includes('@')) { setTestMsg('Enter a valid email address.'); return; }
    setTestSending(true);
    try {
      await axios.post('/api/admin/email-test', { to: testEmail.trim(), template: testTemplate });
      setTestMsg(`✅ Test sent to ${testEmail.trim()} — check your inbox (and spam).`);
    } catch (e) {
      setTestMsg(`❌ ${e.response?.data?.error || e.response?.data?.message || 'Failed to send test.'}`);
    } finally {
      setTestSending(false);
    }
  };

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
  // Pre-designed layouts are email HTML. If the user switches to Text-only, drop
  // the design so the plain message box is always available (avoids getting stuck
  // with no message field and the design dropdown hidden).
  useEffect(() => { if (channel === 'sms') setDesign(''); }, [channel]);
  useEffect(() => { if (me?.isSuperAdmin) loadInsVehicles(); }, [me, loadInsVehicles]);

  const doEmail = channel === 'email' || channel === 'both';
  const doSms = channel === 'sms' || channel === 'both';

  const isHostPitch = design === 'become_host';
  const isListCar = design === 'list_car';
  const isJulyFourth = design === 'july_fourth';
  const isHostVideo = design === 'host_video';
  const isHoliday = ['happy_holidays', 'thanksgiving', 'new_years', 'memorial_day', 'labor_day'].includes(design);
  const isPreDesigned = isHostPitch || isListCar || isJulyFourth || isHostVideo || isHoliday;

  const handleSend = async () => {
    setError('');
    setResult(null);
    if (!isPreDesigned && !message.trim()) { setError('Please write a message first.'); return; }

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
      const { data } = await axios.post('/api/admin/broadcast', { channel, audience, subject, message, recipients, design });
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
    <AdminLayout title="Broadcast" subtitle="Send an email or text to your hosts and drivers" onRefresh={() => Promise.all([loadTemplates(), loadPreview(audience)])}>
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
              <label style={label}>Email design</label>
              <select style={input} value={design} onChange={(e) => setDesign(e.target.value)}>
                <option value="">Standard message (write your own)</option>
                <option value="become_host">Become a Host — pitch email (pre-designed)</option>
                <option value="list_car">List Your Car — reminder for signed-up hosts (pre-designed)</option>
                <option value="host_video">🎥 How to Host — YouTube video included (email + SMS)</option>
                <option value="july_fourth">4th of July — holiday greeting (pre-designed)</option>
                <option value="happy_holidays">🎄 Happy Holidays — Christmas + Hanukkah (pre-designed)</option>
                <option value="thanksgiving">🦃 Thanksgiving (pre-designed)</option>
                <option value="new_years">🎆 New Year's (pre-designed)</option>
                <option value="memorial_day">🇺🇸 Memorial Day (pre-designed)</option>
                <option value="labor_day">☀️ Labor Day (pre-designed)</option>
              </select>
              {isHostPitch && (
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 6 }}>
                  A polished, ready-made pitch (RentUFS intro, 0% commission, Host Guide button + contact info). Just pick who to send it to below — no message needed. <strong>Email only.</strong>
                </div>
              )}
              {isListCar && (
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 6 }}>
                  A branded green/black nudge for hosts who signed up but haven't listed a car yet (insurance + tolls perks, "List Your Car" button). Pick who to send it to below — no message needed. <strong>Email only.</strong> Best paired with the "Hosts" audience.
                </div>
              )}
              {isHostVideo && (
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 6 }}>
                  A branded email with a clickable "How to Host" video (opens YouTube), insurance + tolls perks, and a "List Your Car" button. Unlike the other designs, this one is <strong>email + SMS</strong> — choose "Both" above to also text the video link. No message needed. Best paired with the "Hosts" audience.
                </div>
              )}
              {isJulyFourth && (
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 6 }}>
                  A festive red/white/blue holiday greeting from RentUFS (flag + fireworks) — generic for both hosts and drivers. Pick who to send it to below — no message needed. <strong>Email only.</strong> Best paired with the "Everyone" audience.
                </div>
              )}
            </div>
          )}

          {doEmail && (
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Email subject</label>
              <input
                style={input}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={isPreDesigned ? 'Leave blank for the default subject' : 'e.g., A special offer just for you 🎉'}
              />
            </div>
          )}

          {!isPreDesigned && (
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
          )}

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

        {/* Send a test email — preview any transactional template */}
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Send yourself a test email</div>
          <div style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: 12 }}>
            Preview how any email looks in your real inbox (try it on your phone in light and dark mode).
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={label}>Email</label>
              <select style={{ ...input, minWidth: 200 }} value={testTemplate} onChange={(e) => setTestTemplate(e.target.value)}>
                <option value="booking_driver">Booking Confirmed (driver)</option>
                <option value="booking_host">New Booking (host)</option>
                <option value="extension">Booking Extended</option>
                <option value="cancellation">Reservation Cancelled</option>
                <option value="payment_failed">Payment Failed</option>
                <option value="toll">Toll Charge (driver)</option>
                <option value="toll_host">Toll Recorded (host)</option>
                <option value="charge">Extra Charge</option>
                <option value="reminder">Return Reminder</option>
                <option value="payout">Payout Sent</option>
                <option value="vehicle_listed">Vehicle Listed</option>
                <option value="registration">Registration Expiring</option>
                <option value="vehicle_paused">Vehicle Paused (reg. expired)</option>
                <option value="welcome">Welcome</option>
                <option value="email_verify">Email Verification</option>
                <option value="otp">Registration OTP</option>
                <option value="password_reset">Password Reset</option>
                <option value="become_host">Become a Host (sales pitch)</option>
                <option value="list_car">List Your Car (host reminder)</option>
                <option value="host_video">🎥 How to Host — YouTube video included</option>
                <option value="july_fourth">4th of July (holiday greeting)</option>
                <option value="happy_holidays">🎄 Happy Holidays</option>
                <option value="thanksgiving">🦃 Thanksgiving</option>
                <option value="new_years">🎆 New Year's</option>
                <option value="memorial_day">🇺🇸 Memorial Day</option>
                <option value="labor_day">☀️ Labor Day</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={label}>Send to</label>
              <input style={input} type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@email.com" />
            </div>
            <button onClick={sendTestEmail} disabled={testSending} style={{ ...pill(true), padding: '10px 20px', opacity: testSending ? 0.6 : 1 }}>
              {testSending ? 'Sending…' : 'Send test'}
            </button>
          </div>
          {testMsg && <div style={{ marginTop: 10, fontSize: '0.9rem', color: testMsg.startsWith('✅') ? '#065f46' : '#b91c1c' }}>{testMsg}</div>}
        </div>

        {/* Insurance coverage test — owner only */}
        {me?.isSuperAdmin && (
          <div style={card}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Test insurance coverage</div>
            <div style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: 12 }}>
              Checks TeqMobility directly with a <strong>test driver</strong> — no reservation is created and no customer is charged. Any coverage that starts is cancelled immediately.
            </div>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', fontSize: '0.82rem', color: '#92400e', marginBottom: 12 }}>
              ⚠️ A non-covered state (like NJ) fails for <strong>free</strong>. If the state IS covered, coverage <strong>succeeds</strong> and TeqMobility may <strong>charge</strong> RentUFS.
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={label}>Vehicle to test</label>
              <select style={{ ...input, minWidth: 260 }} value={insVin} onChange={(e) => setInsVin(e.target.value)}>
                <option value="">First registered vehicle</option>
                {insVehicles.map(v => (
                  <option key={v.vin} value={v.vin}>{v.label} — {v.state}</option>
                ))}
              </select>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 6 }}>
                The state shown is what RentUFS has on file for each car. TeqMobility doesn't cover NJ — covered states (e.g. GA, TX) will charge if the test succeeds.
              </div>
            </div>
            <button onClick={runInsuranceTest} disabled={insTesting} style={{ ...pill(true), padding: '10px 20px', opacity: insTesting ? 0.6 : 1 }}>
              {insTesting ? 'Testing…' : 'Run insurance test'}
            </button>
            {insResult && (
              <div style={{ marginTop: 12, fontSize: '0.9rem' }}>
                {insResult.error ? (
                  <div style={{ color: '#b91c1c' }}>❌ Still failing: {insResult.error}</div>
                ) : insResult.started ? (
                  <div style={{ color: '#065f46' }}>
                    ✅ Coverage started successfully on {insResult.vehicle} — insurance is working! {insResult.cancelled ? '(test coverage cancelled)' : '(⚠️ could not auto-cancel — check TeqMobility)'}
                    {insResult.cardUrl && <div style={{ marginTop: 4 }}><a href={insResult.cardUrl} target="_blank" rel="noreferrer">View test card →</a></div>}
                  </div>
                ) : (
                  <div style={{ color: '#b91c1c' }}>❌ Still failing: {insResult.error || 'Coverage did not start.'}</div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </AdminLayout>
  );
};

export default AdminBroadcast;
