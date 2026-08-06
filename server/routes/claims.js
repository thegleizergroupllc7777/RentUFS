// ─────────────────────────────────────────────────────────────────────────────
// Accident / Claim reporting — STANDALONE + ADDITIVE
//
// A driver or host on a booking can report an accident from their trip. This
// route ONLY reads the booking and emails the details to the claims inbox.
// It writes NOTHING and never touches booking, payment, insurance, or toll code.
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const { sendEmail } = require('../utils/emailService');

const router = express.Router();

const CLAIMS_EMAIL = process.env.CLAIMS_EMAIL || 'claims@rentufs.com';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fullName = (u) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '');

// POST /api/claims — file an accident/claim for a booking. Photos are optional.
router.post('/', auth, async (req, res) => {
  try {
    const { bookingId, description, location, incidentDate, photos } = req.body;
    if (!bookingId || !description || !String(description).trim()) {
      return res.status(400).json({ message: 'Please describe what happened.' });
    }

    const booking = await Booking.findById(bookingId)
      .populate('vehicle', 'year make model nickname')
      .populate('driver', 'firstName lastName email phone')
      .populate('host', 'firstName lastName email phone');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    // Only the driver or host on this booking may file a claim for it.
    const uid = String(req.user._id);
    const driverId = booking.driver ? String(booking.driver._id) : null;
    const hostId = booking.host ? String(booking.host._id) : null;
    if (uid !== driverId && uid !== hostId) {
      return res.status(403).json({ message: 'You are not on this booking.' });
    }

    const reporter = uid === driverId ? booking.driver : booking.host;
    const reporterRole = uid === driverId ? 'Driver' : 'Host';
    const v = booking.vehicle || {};
    const vehicleName = v.nickname || `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || 'Vehicle';
    const resId = booking.reservationId || String(booking._id);
    const photoList = Array.isArray(photos) ? photos.filter(Boolean) : [];

    const photosHtml = photoList.length
      ? photoList.map((p, i) => `<div style="margin:6px 0"><a href="${esc(p)}">Photo ${i + 1}</a><br><img src="${esc(p)}" alt="Photo ${i + 1}" style="max-width:320px;border-radius:8px;margin-top:4px"></div>`).join('')
      : '<em>No photos attached.</em>';

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:640px">
        <h2 style="color:#dc2626;margin:0 0 4px">🚨 New Accident / Claim Report</h2>
        <p style="color:#6b7280;margin:0 0 16px">Filed from RentUFS by the ${esc(reporterRole)} on this trip.</p>

        <h3 style="margin:16px 0 6px">Reported by</h3>
        <p style="margin:0">${esc(fullName(reporter))} (${esc(reporterRole)})<br>
        ${esc(reporter && reporter.email || '')} · ${esc(reporter && reporter.phone || '')}</p>

        <h3 style="margin:16px 0 6px">Reservation</h3>
        <p style="margin:0">
          <strong>${esc(resId)}</strong> · ${esc(vehicleName)}<br>
          Trip: ${booking.startDate ? new Date(booking.startDate).toLocaleDateString('en-US') : '—'} → ${booking.endDate ? new Date(booking.endDate).toLocaleDateString('en-US') : '—'}<br>
          Driver: ${esc(fullName(booking.driver))} · ${esc(booking.driver && booking.driver.phone || '')} · ${esc(booking.driver && booking.driver.email || '')}<br>
          Host: ${esc(fullName(booking.host))} · ${esc(booking.host && booking.host.phone || '')} · ${esc(booking.host && booking.host.email || '')}
        </p>

        <h3 style="margin:16px 0 6px">Incident</h3>
        <p style="margin:0 0 6px"><strong>When:</strong> ${esc(incidentDate) || 'Not specified'} &nbsp; <strong>Where:</strong> ${esc(location) || 'Not specified'}</p>
        <p style="margin:0;white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px">${esc(description)}</p>

        <h3 style="margin:16px 0 6px">Photos</h3>
        ${photosHtml}
      </div>`;

    await sendEmail({
      to: CLAIMS_EMAIL,
      subject: `🚨 Accident/Claim — ${vehicleName} (${resId})`,
      html
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Could not submit your claim. Please try again.', error: err.message });
  }
});

module.exports = router;
