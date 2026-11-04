// ─────────────────────────────────────────────────────────────────────────────
// Insurance carrier routing — decides WHICH carrier insures a given rental,
// based on the vehicle's state. Lets TeqMobility and Rentid (Vishal) coexist,
// each owning its own states.
//
// LOCKED DESIGN (agreed with the owner):
//   • Default mode is "split": both carriers coexist. TeqMobility keeps the
//     states it already covers; Rentid/Vishal picks up genuinely-new states it
//     covers (states TeqMobility doesn't). Overlap stays with TeqMobility.
//   • "all_vishal" mode: route to Rentid wherever Rentid covers; any state
//     Rentid does NOT cover FALLS BACK to TeqMobility (never blocked for that).
//   • Each state maps to ONE carrier — carriers never swap trip-to-trip.
//   • This router NEVER blocks a booking. TeqMobility is always the safe default,
//     so resolveCarrier() always returns a carrier. The "no uninsured rental →
//     booking blocked" rule is enforced downstream by the SAME insurance gate
//     that exists today (the chosen carrier either activates coverage or the
//     booking is blocked) — identical behavior no matter which carrier a state
//     uses.
//   • MASTER OFF SWITCH (`enabled`): default false. While off, EVERYTHING routes
//     to TeqMobility — i.e. exactly how the platform works today. Flipping it off
//     instantly reverts to current behavior.
//
// SAFETY: additive and dormant. Nothing calls this yet. With `enabled:false`
// (the default) resolveCarrier() always returns 'teqmobility', so wiring it in
// later changes nothing until the owner deliberately turns it on.
// ─────────────────────────────────────────────────────────────────────────────

const SystemState = require('../models/SystemState');

const CARRIERS = Object.freeze({ TEQMOBILITY: 'teqmobility', RENTID: 'rentid' });
const SETTINGS_KEY = 'carrierRouting';

// Safe defaults: OFF, split mode, no states assigned. While `enabled` is false
// the whole thing is a no-op (always TeqMobility), so this is identical to today.
const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,        // master switch — false = everything TeqMobility (today)
  mode: 'split',         // 'split' | 'all_vishal'
  teqStates: [],         // 2-letter codes TeqMobility covers (owner-set)
  vishalStates: [],      // 2-letter codes Rentid/Vishal covers (synced from Rentid or owner-set)
  vishalPlanId: null,    // Rentid plan id to write Vishal policies against
  overrides: {}          // per-state manual override: { 'CA': 'teqmobility' | 'rentid' }
});

// Normalize a US state value to a 2-letter uppercase code, or null if we can't.
function normalizeState(state) {
  if (!state) return null;
  const s = String(state).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

// Coerce a raw stored value into a complete, well-typed settings object.
function normalizeSettings(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const states = (arr) =>
    Array.isArray(arr) ? arr.map(normalizeState).filter(Boolean) : [];
  const overrides = {};
  if (v.overrides && typeof v.overrides === 'object') {
    for (const [k, val] of Object.entries(v.overrides)) {
      const st = normalizeState(k);
      if (st && (val === CARRIERS.TEQMOBILITY || val === CARRIERS.RENTID)) overrides[st] = val;
    }
  }
  return {
    enabled: v.enabled === true,
    mode: v.mode === 'all_vishal' ? 'all_vishal' : 'split',
    teqStates: states(v.teqStates),
    vishalStates: states(v.vishalStates),
    vishalPlanId: typeof v.vishalPlanId === 'string' && v.vishalPlanId ? v.vishalPlanId : null,
    overrides
  };
}

// PURE decision function. Given a state and the settings, returns the carrier
// that insures a rental there. ALWAYS returns a carrier (never blocks here).
//   → { carrier: 'teqmobility' | 'rentid', reason: '<why>' }
function resolveCarrier(state, rawSettings) {
  const s = normalizeSettings(rawSettings);

  // Master OFF switch → today's behavior: everything TeqMobility.
  if (!s.enabled) return { carrier: CARRIERS.TEQMOBILITY, reason: 'routing_disabled' };

  const st = normalizeState(state);
  // Unknown/malformed state → be safe, default to today's carrier (never block).
  if (!st) return { carrier: CARRIERS.TEQMOBILITY, reason: 'unknown_state_default_teq' };

  // A manual per-state override always wins.
  const override = s.overrides[st];
  if (override) return { carrier: override, reason: 'manual_override' };

  const inTeq = s.teqStates.includes(st);
  const inVishal = s.vishalStates.includes(st);

  if (s.mode === 'all_vishal') {
    if (inVishal) return { carrier: CARRIERS.RENTID, reason: 'all_vishal' };
    // States Vishal doesn't cover fall back to TeqMobility (approved Option 2),
    // and anything else also defaults to TeqMobility — never blocked here.
    return { carrier: CARRIERS.TEQMOBILITY, reason: 'all_vishal_fallback_teq' };
  }

  // split (default): TeqMobility keeps its states; Vishal only takes states it
  // covers that TeqMobility does NOT (overlap stays with TeqMobility); everything
  // else defaults to TeqMobility.
  if (inVishal && !inTeq) return { carrier: CARRIERS.RENTID, reason: 'split_vishal_only' };
  return { carrier: CARRIERS.TEQMOBILITY, reason: 'split_teq_default' };
}

// Load the live settings from SystemState, merged over the safe defaults. Never
// throws — on any error it returns the safe defaults (which mean "all TeqMobility").
async function getCarrierRoutingSettings() {
  try {
    const doc = await SystemState.findOne({ key: SETTINGS_KEY }).lean();
    return normalizeSettings(doc ? doc.value : null);
  } catch (_) {
    return normalizeSettings(null);
  }
}

// Persist a full settings object (owner-only callers upstream). Upserts the
// single SystemState row. Returns the normalized settings that were saved.
async function saveCarrierRoutingSettings(patch) {
  const next = normalizeSettings(patch);
  await SystemState.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: { value: next, updatedAt: new Date() } },
    { upsert: true, new: true }
  );
  return next;
}

// Convenience: resolve the carrier using the live stored settings.
async function resolveCarrierForState(state) {
  const settings = await getCarrierRoutingSettings();
  return resolveCarrier(state, settings);
}

module.exports = {
  CARRIERS,
  SETTINGS_KEY,
  DEFAULT_SETTINGS,
  normalizeState,
  normalizeSettings,
  resolveCarrier,
  getCarrierRoutingSettings,
  saveCarrierRoutingSettings,
  resolveCarrierForState
};
