// States where RentUFS currently has insurance coverage.
// Source: United Fleet Services insurance partner, confirmed 2026-05-12.
// To add or remove a state, update SUPPORTED_STATES below.
export const SUPPORTED_STATES = ['AZ', 'CA', 'FL', 'GA', 'IL', 'MD', 'TX'];

// Full list of states shown in dropdowns. Unsupported entries are rendered
// grayed-out with a "Not in service area" suffix; selecting one shows an
// inline warning and blocks form submission.
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
