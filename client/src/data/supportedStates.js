// States where RentUFS currently has insurance coverage, per the TeqMobility
// agreement. NJ is intentionally NOT covered.
// To add or remove a state, update SUPPORTED_STATES below.
export const SUPPORTED_STATES = ['AZ', 'CA', 'FL', 'GA', 'IL', 'MD', 'TX'];

// Full list of states shown in dropdowns. Unsupported entries are rendered
// grayed-out with a "Coming soon" suffix; selecting one shows an inline warning
// and blocks form submission. Kept intentionally wider than SUPPORTED_STATES to
// signal where service is expanding next.
export const ALL_LISTED_STATES = [
  { code: 'AZ', name: 'Arizona' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'IL', name: 'Illinois' },
  { code: 'MD', name: 'Maryland' },
  { code: 'NV', name: 'Nevada' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'TX', name: 'Texas' }
];

export const isSupportedState = (code) => SUPPORTED_STATES.includes(code);
