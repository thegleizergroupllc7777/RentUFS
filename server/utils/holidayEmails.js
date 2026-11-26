// Pre-designed holiday email templates — shared by the Broadcast admin route
// (manual send) and the scheduler (auto-send). Each uses a hosted illustration
// PNG (rendered from SVG so it shows in every inbox) + a "Browse Cars" button
// and a host line. Festive top-to-bottom.
//
// `sendMonth`/`sendDay` drive the auto-send scheduler. For weekday-based holidays
// (Thanksgiving, Memorial Day, Labor Day) the exact date is computed each year
// via `rule` so it always lands on the right day — no yearly maintenance.
const HOLIDAY_TEMPLATES = {
  happy_holidays: { subject: '✨ Happy Holidays from RentUFS! 🎄🕎', img: 'happy_holidays.png', badge: '🎄 HAPPY HOLIDAYS 🕎', badgeBg: 'linear-gradient(90deg,#e11d2a,#ca8a04,#0b8f4e)', panel: '#eef4ff', text: '#1e293b', accent: '#0b8f4e', headingColor: '#0b1836', heading: "Happy holidays from RentUFS to you", body: "As the year winds down, we want to say a heartfelt thank you for being part of the RentUFS family. This is a season for the people we love, for gratitude, and for making memories — and we're so grateful you're along for the ride. Wherever the season takes you — near or far, to loved ones or a cozy getaway — we hope it's safe, warm, and full of joy. If you need a car for the trip, there's one ready and waiting. And if your own car is sitting idle over the break, it could be earning you a little extra this season. Warmest wishes to you and yours! 🎉", rule: { fixed: [12, 23] } },
  thanksgiving: { subject: '🦃 Happy Thanksgiving from RentUFS!', img: 'thanksgiving.png', badge: '🦃 HAPPY THANKSGIVING 🦃', ctaFlank: '🦃', badgeBg: '#c2410c', panel: '#fdf2e3', text: '#5c2010', accent: '#b45309', headingColor: '#7c2d12', heading: 'Happy Thanksgiving', body: "This Thanksgiving, we just want to say thank you — to you, our hosts. Your car isn't just a car. It's your asset out there working for you, and it's the reason this community keeps growing and staying strong. Every trip on RentUFS starts with a host like you, and we don't take that for granted. However you're spending the day — a full table, a drive to see family, or just some well-earned rest — we hope it's a good one. Happy Thanksgiving, from our family to yours. 🍂", rule: { month: 11, weekday: 4, nth: 4 } },
  new_years: { subject: '🎆 Happy New Year from RentUFS! 🥂', img: 'new_years.png', badge: '🎆 HAPPY NEW YEAR 🥂', badgeBg: '#ca8a04', panel: '#141024', text: '#e5e7eb', accent: '#ffd54a', headingColor: '#ffd54a', heading: 'Happy New Year', body: "Here's to a fresh start — a year full of new roads, new trips, and new opportunities. Thank you for being part of RentUFS this past year; we can't wait to see where the road takes you next. Whether your resolution is to travel more, earn more by sharing your car, or simply get out and explore, we've got the ride to make it happen. Wishing you a happy, healthy, and prosperous New Year. 🥂", rule: { fixed: [1, 1] } },
  memorial_day: { subject: '🇺🇸 Memorial Day from RentUFS', img: 'memorial_day.png', badge: '🇺🇸 MEMORIAL DAY 🇺🇸', badgeBg: '#b22234', panel: '#eef2ff', text: '#1e293b', accent: '#1e3a8a', headingColor: '#7f1d1d', heading: 'Happy Memorial Day', body: "This Memorial Day, we pause to honor and remember the brave men and women who gave everything in service to our country. As the unofficial start of summer, it's also the perfect time to hit the road — a weekend getaway, a beach trip, or a visit with family. Whatever your plans, there's a car ready when you are. And if yours is parked this weekend, it could be earning while others travel. Have a safe and meaningful Memorial Day. 🇺🇸", rule: { month: 5, weekday: 1, nth: 'last' } },
  labor_day: { subject: '☀️ Happy Labor Day from RentUFS', img: 'labor_day.png', badge: '☀️ HAPPY LABOR DAY ☀️', badgeBg: '#0369a1', panel: '#ecfbff', text: '#0c4a6e', accent: '#0369a1', headingColor: '#0369a1', heading: 'Happy Labor Day', body: "You've earned this one. As summer winds down, we hope you get to kick back, relax, and enjoy the long weekend your way — whether that's one last road trip, a cookout with friends, or simply some well-deserved rest. If you're heading out of town, there's a car ready whenever you are. And to every host sharing their car this weekend: thank you for keeping people moving. Happy Labor Day. ☀️", rule: { month: 9, weekday: 1, nth: 1 } },
  // July 4th: fires every July 4. No illustration image (holidayEmailHtml renders
  // fine without one) — the badge + colors carry the theme.
  independence_day: { subject: '🇺🇸 Happy 4th of July from RentUFS! 🎆', badge: '🇺🇸 4TH OF JULY 🎆', badgeBg: '#b22234', panel: '#eef2ff', text: '#1e293b', accent: '#1e3a8a', headingColor: '#7f1d1d', heading: 'Happy 4th of July', body: "Wishing you a happy, safe, and fun Fourth of July! The Fourth is one of the busiest travel weekends of the year — so many of us hitting the road to see family and friends. Wherever the holiday takes you, RentUFS is here for the journey. And if your car is parked this weekend, it could be earning while others travel. Have a safe and happy Fourth! 🇺🇸", rule: { fixed: [7, 4] } },
  // Veterans Day: fires every Nov 11. No illustration image (holidayEmailHtml
  // renders fine without one) — the badge + patriotic colors carry the theme.
  // Respectful, honor-first tone; the platform note stays light.
  veterans_day: { subject: '🇺🇸 Honoring Our Veterans — Thank You', badge: '🇺🇸 VETERANS DAY 🇺🇸', badgeBg: '#1e3a8a', panel: '#eef2ff', text: '#1e293b', accent: '#1e3a8a', headingColor: '#1e3a8a', heading: 'Thank you to those who served', body: "Today, we pause to honor the men and women who have worn our nation's uniform. Your service, your sacrifice, and your courage are the reason the rest of us are free to go wherever the road leads — to chase new horizons, take the long way home, and reach the people we love. To every veteran in the RentUFS community, and to the families who stood beside them: thank you. It's an honor to share the road with you, today and every day. 🇺🇸", rule: { fixed: [11, 11] } }
};

// Driver-flavored copy for each holiday — used by driverHolidayEmailHtml so
// drivers get a fun, road-trip-themed greeting while hosts get the version
// above. Keys match HOLIDAY_TEMPLATES; the badge/colors are pulled from there.
const DRIVER_HOLIDAY = {
  new_years:       { subject: '🥂 New year, new roads — RentUFS', heading: 'New year, new roads', emoji: '🥂', body: "A fresh start means fresh adventures. Wherever this year takes you — a road trip, a visit home, or a spontaneous drive to nowhere in particular — grab a car near you and make it a great one. Here's to the miles ahead. Happy New Year!" },
  memorial_day:    { subject: '☀️ Summer starts now — grab a ride', heading: 'Summer starts now', emoji: '☀️', body: "Memorial Day weekend is the unofficial kickoff to summer — beach trips, cookouts, long-weekend getaways. Grab a car near you and make it count. (And a heartfelt thank you to those who served. 🇺🇸)" },
  independence_day:{ subject: '🎆 Freedom to roam this 4th — grab a ride', heading: 'Freedom to roam', emoji: '🎆', body: "Beach day, BBQ across town, or fireworks with the family — however you're celebrating the 4th, grab a car and make it a trip to remember. Have a safe, happy Fourth! 🇺🇸" },
  labor_day:       { subject: '🏖️ One last summer ride — RentUFS', heading: 'One last summer ride', emoji: '🏖️', body: "Squeeze every last drop out of summer — one more road trip, one more escape before the season winds down. There's a car near you, ready to roll. Happy Labor Day!" },
  thanksgiving:    { subject: '🦃 Over the river to family — grab a ride', heading: 'Over the river to family', emoji: '🦃', body: "There's nothing quite like Thanksgiving — the drive home, the warm kitchen, and the people waiting at the door. It's a day to slow down and be grateful for the ones who matter most. Wherever they are, across town or across the state, grab a car and go be with them. Turkey, stuffing, pie, and a warm welcome are waiting on the other end — and honestly, the trip there is half the memory. From all of us at RentUFS, thank you for riding with us this year. We're grateful for you, and we hope your Thanksgiving is full of good food, full hearts, and the people you love. Happy Thanksgiving! 🦃🍂" },
  happy_holidays:  { subject: '🎄 Home for the holidays — grab a ride', heading: 'Home for the holidays', emoji: '🎄', body: "The season's all about the people you love. Wherever you're headed — family, friends, or a cozy getaway — there's a car near you to get you there. Happy Holidays! 🎄🕎" },
  veterans_day:    { subject: '🇺🇸 Honoring our veterans today', heading: 'Thank you, veterans', emoji: '🇺🇸', body: "Today we honor everyone who served our country — the reason we're free to roam every road out there. To the veterans riding with us, and the families beside them: thank you for your service. Wherever today takes you, we're proud to share the road with you. 🇺🇸" }
};

function holidayEmailHtml(cfg, firstName, unsubscribeUrl) {
  const greeting = firstName ? `${cfg.heading}, ${firstName}!` : `${cfg.heading}!`;
  const unsub = unsubscribeUrl ? `<br><a href="${unsubscribeUrl}" style="color:#064e3b;text-decoration:underline">Unsubscribe</a>` : '';
  const clientUrl = process.env.CLIENT_URL || 'https://app.rentufs.com';
  // Illustration is optional — holidays without a hosted image (e.g. July 4th)
  // still render cleanly; the badge + colored panel carry the theme.
  const imgTag = cfg.img ? `<img src="${clientUrl}/holiday/${cfg.img}" alt="${cfg.heading}" width="600" style="display:block;width:100%;height:auto;border:0;">` : '';
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#dfe7f2;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <div style="border:3px solid #00FF66;border-radius:10px;overflow:hidden;">
        ${cfg.ctaFlank ? `<div style="background:#1c0a03 url('${clientUrl}/holiday/thanksgiving-food-bg-host.png') center/cover no-repeat;padding:48px 20px 44px;text-align:center;"><span style="display:inline-block;"><img src="https://app.rentufs.com/rentufs-logo-white.png" alt="RentUFS" height="46" style="height:46px;width:auto;display:block;border:0;margin:0 auto;"></span><div style="margin-top:16px;"><span style="display:inline-block;background:${cfg.badgeBg};color:#fff;font-weight:bold;font-size:17px;letter-spacing:1px;padding:6px 16px;border-radius:20px;">${cfg.badge}</span></div></div>` : `<div style="background:#000;padding:22px 20px 6px;text-align:center;"><span style="display:inline-block;"><img src="https://app.rentufs.com/rentufs-logo-white.png" alt="RentUFS" height="36" style="height:36px;width:auto;display:block;border:0;"></span></div><div style="background:#000;padding:0 20px 16px;text-align:center;"><span style="display:inline-block;background:${cfg.badgeBg};color:#fff;font-weight:bold;font-size:13px;letter-spacing:1px;padding:6px 16px;border-radius:20px;">${cfg.badge}</span></div>`}
        ${cfg.ctaFlank ? '' : imgTag}
        <div style="background:${cfg.panel};padding:26px 28px 24px;color:${cfg.text};font-size:15px;line-height:1.7;text-align:center;">
          <p style="margin:0 0 12px;font-size:1.25rem;font-weight:bold;color:${cfg.headingColor};">${greeting}</p>
          <p style="margin:0 0 18px;${cfg.ctaFlank ? 'font-style:italic;' : ''}">${cfg.body}</p>
          <p style="margin:0 0 10px;"><a href="${clientUrl}/host/add-vehicle" style="display:inline-block;background:#00FF66;color:#000;padding:14px 40px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">${cfg.ctaFlank ? cfg.ctaFlank + ' List Your Car ' + cfg.ctaFlank : '🚗 List Your Car'}</a></p>
          <p style="margin:0 0 4px;font-size:14px;"><a href="${clientUrl}/host/dashboard" style="color:${cfg.accent};font-weight:bold;text-decoration:none;">Already a host? Go to your dashboard &rarr;</a></p>
        </div>
        <div style="background:#00FF66;text-align:center;color:#000;padding:18px;font-size:12px;">&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.<br>597 West Side Ave PMB 194, Jersey City, NJ 07304${unsub}</div>
      </div>
    </div>
  </body></html>`;
}

// Driver-flavored holiday email — same funky look as the "Grab the Keys" driver
// invite (skyline banner, 🚗 RENTUFS 🚗, "Find My Ride" button), themed to the
// holiday via its badge/colors and the DRIVER_HOLIDAY copy. Renders in every
// inbox (hosted skyline image + text/emoji; no fragile web effects).
function driverHolidayEmailHtml(key, firstName, unsubscribeUrl) {
  const cfg = HOLIDAY_TEMPLATES[key] || {};
  const dv = DRIVER_HOLIDAY[key] || {};
  const greeting = firstName ? `Hey ${firstName}, 👋` : 'Hey there, 👋';
  const unsub = unsubscribeUrl ? `<br><a href="${unsubscribeUrl}" style="color:#064e3b;text-decoration:underline">Unsubscribe</a>` : '';
  const clientUrl = process.env.CLIENT_URL || 'https://app.rentufs.com';
  const heading = dv.heading || cfg.heading || 'Happy holidays';
  const emoji = dv.emoji || '🎉';
  const body = dv.body || cfg.body || '';
  const badgeBg = cfg.badgeBg || '#00FF66';
  const badge = cfg.badge || 'RENTUFS';
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#eef0f2;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <div style="border-radius:14px;overflow:hidden;border:3px solid #00FF66;">
        <!-- HERO -->
        <div style="background:${cfg.ctaFlank ? '#1c0a03' : '#050d09'};text-align:center;">
          ${cfg.ctaFlank ? '' : `<img src="${clientUrl}/holiday/grab-keys-skyline.png" width="600" alt="" style="display:block;width:100%;height:auto;border:0;">`}
          <div style="padding:${cfg.ctaFlank ? '30px' : '10px'} 24px 28px;background:${cfg.ctaFlank ? `#1c0a03 url('${clientUrl}/holiday/thanksgiving-food-bg.png') center/cover no-repeat` : '#050d09'};">
            <div style="white-space:nowrap;">
              ${cfg.ctaFlank ? '' : '<span style="font-size:24px;vertical-align:middle;">🚗</span>'}
              <span style="display:inline-block;vertical-align:middle;margin:0 8px;"><img src="https://app.rentufs.com/rentufs-logo-white.png" alt="RentUFS" height="${cfg.ctaFlank ? '46' : '34'}" style="height:${cfg.ctaFlank ? '46' : '34'}px;width:auto;display:block;border:0;"></span>
              ${cfg.ctaFlank ? '' : '<span style="font-size:24px;vertical-align:middle;">🚗</span>'}
            </div>
            <div style="display:inline-block;background:${badgeBg};color:#ffffff;font-weight:bold;font-size:${cfg.ctaFlank ? '16px' : '12px'};letter-spacing:1px;padding:6px 16px;border-radius:999px;margin-top:14px;">${badge}</div>
            <div style="font-size:1.9rem;font-weight:900;color:#ffffff;line-height:1.15;margin-top:14px;">${cfg.ctaFlank ? cfg.ctaFlank + ' ' : ''}${heading} ${emoji}</div>${cfg.ctaFlank ? '<div style="font-size:22px;letter-spacing:12px;margin-top:12px;">🍁 🍂 🍁 🍂 🍁</div>' : ''}
          </div>
        </div>
        <!-- BODY -->
        <div style="background:#ffffff;padding:28px 26px 10px;color:#374151;font-size:15px;line-height:1.7;">
          <p style="margin:0 0 14px;font-size:1.05rem;color:#111827;">${greeting}</p>
          <p style="margin:0 0 24px;${cfg.ctaFlank ? 'font-style:italic;' : ''}">${body}</p>
          <p style="text-align:center;margin:0 0 18px;">
            <a href="${clientUrl}/marketplace" style="display:inline-block;background:#00FF66;color:#000000;padding:16px 44px;text-decoration:none;border-radius:999px;font-weight:900;font-size:18px;">${cfg.ctaFlank ? cfg.ctaFlank + ' Find My Ride &rarr; ' + cfg.ctaFlank : '🔑 Find My Ride &rarr;'}</a>
          </p>
          <p style="text-align:center;margin:0 0 20px;color:#6b7280;font-size:14px;">There's a car near you, ready whenever you are. <a href="${clientUrl}/marketplace" style="color:#059669;font-weight:bold;text-decoration:none;">Let's go.</a> 🌎</p>
        </div>
        <div style="background:#00FF66;text-align:center;color:#000000;padding:18px;font-size:12px;line-height:1.6;">
          &copy; ${new Date().getFullYear()} RentUFS. All rights reserved.<br>
          597 West Side Ave PMB 194, Jersey City, NJ 07304${unsub}
        </div>
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

module.exports = { HOLIDAY_TEMPLATES, DRIVER_HOLIDAY, holidayEmailHtml, driverHolidayEmailHtml, holidayForDate };
