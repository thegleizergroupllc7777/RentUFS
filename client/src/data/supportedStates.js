// States where RentUFS has insurance coverage, per the TeqMobility agreement.
// These are the ONLY states a host may list a vehicle in. NJ is intentionally
// NOT covered. To add or remove a state, update this one list — the host setup
// dropdowns are built directly from it so they can never drift out of sync.
export const SUPPORTED_STATES = ['AZ', 'CA', 'FL', 'GA', 'IL', 'MD', 'TX'];

const STATE_NAMES = {
  AZ: 'Arizona',
  CA: 'California',
  FL: 'Florida',
  GA: 'Georgia',
  IL: 'Illinois',
  MD: 'Maryland',
  TX: 'Texas'
};

// States shown in the host vehicle-setup dropdowns. Built straight from the
// insurance-covered list above so the dropdown always matches the agreement —
// only states with active coverage can be chosen.
export const ALL_LISTED_STATES = SUPPORTED_STATES.map((code) => ({
  code,
  name: STATE_NAMES[code] || code
}));

export const isSupportedState = (code) => SUPPORTED_STATES.includes(code);
