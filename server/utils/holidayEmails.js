// Pre-designed holiday email templates — shared by the Broadcast admin route
// (manual send) and the scheduler (auto-send). Each uses a hosted illustration
// PNG (rendered from SVG so it shows in every inbox) + a "Browse Cars" button
// and a host line. Festive top-to-bottom.
//
// `sendMonth`/`sendDay` drive the auto-send scheduler. For weekday-based holidays
// (Thanksgiving, Memorial Day, Labor Day) the exact date is computed each year
// via `rule` so it always lands on the right day — no yearly maintenance.
const HOLIDAY_TEMPLATES = {
  happy_holidays: { subject: '✨ Happy Holidays from RentUFS! 🎄🕎', img: 'happy_holidays.png', badge: '🎄 HAPPY HOLIDAYS 🕎', badgeBg: 'linear-gradient(90deg,#e11d2a,#ca8a04,#0b8f4e)', panel: '#eef4ff', text: '#1e293b', accent: '#0b8f4e', headingColor: '#0b1836', heading: "Season's Greetings", body: "However you celebrate this season — <strong>Merry Christmas</strong>, <strong>Happy Hanukkah</strong>, and warm wishes to all — thank you for being part of the RentUFS family. Traveling to see loved ones? There's a car ready for every trip. 💚", rule: { fixed: [11, 23] } },
  thanksgiving: { subject: '🦃 Happy Thanksgiving from RentUFS!', img: 'thanksgiving.png', badge: '🦃 HAPPY THANKSGIVING 🍂', badgeBg: '#c2410c', panel: '#fdf2e3', text: '#5c2010', accent: '#b45309', headingColor: '#7c2d12', heading: 'Happy Thanksgiving', body: "We're grateful for every host and driver in the RentUFS family. Heading to see family this year? Grab a car for the trip. 🍂", rule: { month: 11, weekday: 4, nth: 4 } },
  new_years: { subject: '🎆 Happy New Year from RentUFS! 🥂', img: 'new_years.png', badge: '🎆 HAPPY NEW YEAR 🥂', badgeBg: '#ca8a04', panel: '#141024', text: '#e5e7eb', accent: '#ffd54a', headingColor: '#ffd54a', heading: 'Happy New Year', body: "Here's to a year full of new roads, new trips, and new earnings. Wherever the year takes you — we've got the ride. 🎉", rule: { fixed: [1, 1] } },
  memorial_day: { subject: '🇺🇸 Memorial Day from RentUFS', img: 'memorial_day.png', badge: '🇺🇸 MEMORIAL DAY 🇺🇸', badgeBg: '#b22234', panel: '#eef2ff', text: '#1e293b', accent: '#1e3a8a', headingColor: '#7f1d1d', heading: 'Happy Memorial Day', body: "Honoring those who served — and kicking off summer travel season. Ready to hit the road? 🚗", rule: { month: 5, weekday: 1, nth: 'last' } },
  labor_day: { subject: '☀️ Happy Labor Day from RentUFS', img: 'labor_day.png', badge: '☀️ HAPPY LABOR DAY ☀️', badgeBg: '#0369a1', panel: '#ecfbff', text: '#0c4a6e', accent: '#0369a1', headingColor: '#0369a1', heading: 'Happy Labor Day', body: "Make the most of the long weekend — a car's ready whenever you are. 😎", rule: { month: 9, weekday: 1, nth: 1 } }
};

function holidayEmailHtml(cfg, firstName, unsubscribeUrl) {
  const greeting = firstName ? `${cfg.heading}, ${firstName}!` : `${cfg.heading}!`;
  const unsub = unsubscribeUrl ? `<br><a href="${unsubscribeUrl}" style="color:#064e3b;text-decoration:underline">Unsubscribe</a>` : '';
  const clientUrl = process.env.CLIENT_URL || 'https://app.rentufs.com';
  const img = `${clientUrl}/holiday/${cfg.img}`;
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#dfe7f2;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <div style="border:3px solid #00FF66;border-radius:10px;overflow:hidden;">
        <div style="background:#000;padding:22px 20px 6px;text-align:center;"><span style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#00FF66;">RENTUFS</span></div>
        <div style="background:#000;padding:0 20px 16px;text-align:center;"><span style="display:inline-block;background:${cfg.badgeBg};color:#fff;font-weight:bold;font-size:13px;letter-spacing:1px;padding:6px 16px;border-radius:20px;">${cfg.badge}</span></div>
        <img src="${img}" alt="${cfg.heading}" width="600" style="display:block;width:100%;height:auto;border:0;">
        <div style="background:${cfg.panel};padding:26px 28px 24px;color:${cfg.text};font-size:15px;line-height:1.7;text-align:center;">
          <p style="margin:0 0 12px;font-size:1.25rem;font-weight:bold;color:${cfg.headingColor};">${greeting}</p>
          <p style="margin:0 0 18px;">${cfg.body}</p>
          <p style="margin:0 0 10px;"><a href="${clientUrl}/marketplace" style="display:inline-block;background:#00FF66;color:#000;padding:14px 40px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">🚗 Browse Cars</a></p>
          <p style="margin:0 0 4px;font-size:14px;"><a href="${clientUrl}/host/add-vehicle" style="color:${cfg.accent};font-weight:bold;text-decoration:none;">Own a car? List it and start earning &rarr;</a></p>
        </div>
        <div style="background:#00FF66;text-align:center;color:#000;padding:18px;font-size:12px;">&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.<br>597 West Side Ave PMB 194, Jersey City, NJ 07304${unsub}</div>
      </div>
    </div>
  </body></html>`;
}

// Which holiday (if any) falls on the given date, per each template's rule.
// `date` is a Date already shifted to ET. Returns the holiday key or null.
function holidayForDate(date) {
  const month = date.getMonth() + 1;       // 1-12
  const day = date.getDate();              // 1-31
  const weekday = date.getDay();           // 0=Sun..6=Sat
  const year = date.getFullYear();
  for (const [key, cfg] of Object.entries(HOLIDAY_TEMPLATES)) {
    const r = cfg.rule;
    if (!r) continue;
    if (r.fixed) {
      if (r.fixed[0] === month && r.fixed[1] === day) return key;
      continue;
    }
    if (r.month !== month || r.weekday !== weekday) continue;
    // nth occurrence of this weekday in the month
    if (r.nth === 'last') {
      const daysInMonth = new Date(year, month, 0).getDate();
      if (day + 7 > daysInMonth) return key;   // no same weekday later this month
    } else {
      const occurrence = Math.floor((day - 1) / 7) + 1;
      if (occurrence === r.nth) return key;
    }
  }
  return null;
}

module.exports = { HOLIDAY_TEMPLATES, holidayEmailHtml, holidayForDate };
