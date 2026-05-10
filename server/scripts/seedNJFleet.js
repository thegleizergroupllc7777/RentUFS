/**
 * Seed script: NJ Fleet vehicles (Wheelbase-managed)
 *
 * Creates a "RentUFS Fleet" host user and inserts the 24 NJ fleet vehicles
 * that are managed via Wheelbase. Each vehicle is tagged with
 * bookingProvider: 'wheelbase' and its wheelbase.rentalId so the React app
 * loads the Wheelbase booking widget when a renter clicks it.
 *
 * IDEMPOTENT — safe to re-run. Skips records that already exist.
 *
 * USAGE:
 *   cd server
 *   node scripts/seedNJFleet.js
 *
 * VEHICLES ARE HIDDEN BY DEFAULT (availability: false).
 * They will NOT appear in the marketplace until you flip them on with:
 *   db.vehicles.updateMany(
 *     { bookingProvider: 'wheelbase' },
 *     { $set: { availability: true } }
 *   )
 *
 * REVERSAL (if needed):
 *   db.vehicles.deleteMany({ bookingProvider: 'wheelbase' })
 *   db.users.deleteOne({ email: 'thegleizergroupllc@gmail.com' })
 *
 * SAFETY:
 *   - Never modifies or deletes existing vehicles/users/bookings.
 *   - Only inserts new records.
 *   - Marketplace tile photos are placeholders — swap via host edit UI later.
 *   - TollSpot is intentionally disabled for these vehicles (Wheelbase has
 *     its own TollSpot account; we don't want double registration).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');

// ---------------------------------------------------------------------------
// CONFIG — edit these if you want different defaults before running
// ---------------------------------------------------------------------------
const FLEET_USER = {
  email: 'thegleizergroupllc@gmail.com',
  password: 'ChangeMe!Fleet2026',  // ⚠️ change via /forgot-password after first login
  firstName: 'United Fleet',
  lastName: 'Services',
  phone: '5555550100',
  userType: 'host'
};

const DEFAULT_PRICE_PER_DAY = 48;
const DEFAULT_PRICE_PER_WEEK = 300;

// City coordinates (approximate centers) for the marketplace map pins.
// Renter sees a pin somewhere near the actual location — close enough for browse.
const CITY_COORDS = {
  'Jersey City': { lng: -74.0776, lat: 40.7282 },
  'East Orange': { lng: -74.2107, lat: 40.7672 }
};

// Placeholder photo URL builder — black background, green text, vehicle nickname.
// Replace with real Wheelbase photos later via host edit UI.
const placeholderImage = (nickname) =>
  `https://placehold.co/800x600/000000/10b981?text=${encodeURIComponent(nickname)}`;

// ---------------------------------------------------------------------------
// THE 24 NJ FLEET VEHICLES
// ---------------------------------------------------------------------------
const NJ_FLEET = [
  { nickname: 'UFS-001', year: 2023, make: 'Kia',        model: 'Forte',  rentalId: '479203', city: 'Jersey City', vin: '3KPF24AD9PE521961', plate: 'NJ W32VCE' },
  { nickname: 'UFS-006', year: 2019, make: 'Kia',        model: 'Forte',  rentalId: '479204', city: 'East Orange', vin: '3KPF24AD4KE117006', plate: 'NJ K59VCB' },
  { nickname: 'UFS-008', year: 2019, make: 'Nissan',     model: 'Sentra', rentalId: '479202', city: 'East Orange', vin: '3N1AB7AP8KY250603', plate: 'NJ K61VCB' },
  { nickname: 'UFS-009', year: 2022, make: 'Kia',        model: 'Rio',    rentalId: '479198', city: 'Jersey City', vin: '3KPA24AD9NE439705', plate: 'NJ N11WFD' },
  { nickname: 'UFS-012', year: 2019, make: 'Kia',        model: 'Forte',  rentalId: '479205', city: 'Jersey City', vin: '3KPF24AD4KE036913', plate: 'NJ K79VCB' },
  { nickname: 'UFS-013', year: 2022, make: 'Kia',        model: 'Rio',    rentalId: '479184', city: 'Jersey City', vin: '3KPA24AD1NE469815', plate: 'NJ K80VCB' },
  { nickname: 'UFS-014', year: 2020, make: 'Mitsubishi', model: 'Mirage', rentalId: '479195', city: 'Jersey City', vin: 'ML32F4FJ3LHF13186',  plate: 'NJ K81VCB' },
  { nickname: 'UFS-017', year: 2015, make: 'Hyundai',    model: 'Sonata', rentalId: '479192', city: 'Jersey City', vin: '5NPE24AF2FH110151', plate: 'NJ K82VCB' },
  { nickname: 'UFS-018', year: 2018, make: 'Ford',       model: 'Fusion', rentalId: '479191', city: 'East Orange', vin: '3FA6P0LU1JR193853', plate: 'NJ K92VCB' },
  { nickname: 'UFS-019', year: 2017, make: 'Ford',       model: 'Fusion', rentalId: '479196', city: 'East Orange', vin: '3FA6P0LU6HR382217', plate: 'NJ K93VCB' },
  { nickname: 'UFS-021', year: 2022, make: 'Mitsubishi', model: 'Mirage', rentalId: '479190', city: 'East Orange', vin: 'ML32FVFJ9NHF01021',  plate: 'NJ K95VCB' },
  { nickname: 'UFS-023', year: 2021, make: 'Hyundai',    model: 'Sonata', rentalId: '479206', city: 'East Orange', vin: '5NPEG4JA2MH127020', plate: 'NJ W60VCE' },
  { nickname: 'UFS-024', year: 2021, make: 'Kia',        model: 'Forte',  rentalId: '479201', city: 'East Orange', vin: '3KPF24AD6ME364191', plate: 'NJ W43VCE' },
  { nickname: 'UFS-025', year: 2021, make: 'Kia',        model: 'Forte',  rentalId: '479197', city: 'Jersey City', vin: '3KPF24AD9ME398125', plate: 'NJ V73VMU' },
  { nickname: 'UFS-026', year: 2019, make: 'Ford',       model: 'Fusion', rentalId: '479186', city: 'Jersey City', vin: '3FA6P0LU2KR207809', plate: 'NJ V78VMT' },
  { nickname: 'UFS-027', year: 2019, make: 'Ford',       model: 'Fusion', rentalId: '479189', city: 'East Orange', vin: '3FA6P0RU5KR180550', plate: 'NJ V79VMT' },
  { nickname: 'UFS-028', year: 2019, make: 'Ford',       model: 'Fusion', rentalId: '479207', city: 'Jersey City', vin: '3FA6P0MU6KR235482', plate: 'NJ V72VMU' },
  { nickname: 'UFS-029', year: 2020, make: 'Ford',       model: 'Fusion', rentalId: '479187', city: 'Jersey City', vin: '3FA6P0LU2LR139268', plate: 'NJ A70WCS' },
  { nickname: 'UFS-030', year: 2017, make: 'Ford',       model: 'Fusion', rentalId: '479193', city: 'Jersey City', vin: '3FA6P0LU8HR303582', plate: 'NJ W88VXR' },
  { nickname: 'UFS-032', year: 2017, make: 'Ford',       model: 'Fusion', rentalId: '479185', city: 'Jersey City', vin: '3FA6P0LU0HR344918', plate: 'NJ E78VZA' },
  { nickname: 'UFS-033', year: 2018, make: 'Ford',       model: 'Fusion', rentalId: '479183', city: 'Jersey City', vin: '3FA6P0LU3JR172938', plate: 'NJ C74WBD' },
  { nickname: 'UFS-034', year: 2017, make: 'Ford',       model: 'Fusion', rentalId: '479200', city: 'Jersey City', vin: '3FA6P0LU5HR238108', plate: 'NJ C49WBD' },
  { nickname: 'UFS-035', year: 2019, make: 'Ford',       model: 'Fusion', rentalId: '494106', city: 'Jersey City', vin: '3FA6P0LU7KR189856', plate: 'NJ K60VCB' },
  { nickname: 'UFS-036', year: 2017, make: 'Ford',       model: 'Fusion', rentalId: '479188', city: 'Jersey City', vin: '3FA6P0LUXHR380759', plate: 'NJ C75WBD' }
];

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function seed() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not set in .env — aborting');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected');

  // -------------------------------------------------------------------------
  // Step 1: Find or create the RentUFS Fleet host user
  // -------------------------------------------------------------------------
  let fleetUser = await User.findOne({ email: FLEET_USER.email });

  if (fleetUser) {
    console.log(`\n👤 Found existing fleet user: ${fleetUser.email} (id: ${fleetUser._id})`);
  } else {
    console.log(`\n👤 Creating fleet user: ${FLEET_USER.email}`);
    fleetUser = new User(FLEET_USER);
    await fleetUser.save();  // pre-save hook hashes the password automatically
    console.log(`✅ Created (id: ${fleetUser._id})`);
    console.log(`   📝 Login credentials:`);
    console.log(`      email:    ${FLEET_USER.email}`);
    console.log(`      password: ${FLEET_USER.password}`);
    console.log(`      ⚠️  Change this password via /forgot-password after first login.`);
  }

  // -------------------------------------------------------------------------
  // Step 2: Insert each NJ fleet vehicle (skip if already exists)
  // -------------------------------------------------------------------------
  console.log(`\n🚗 Seeding ${NJ_FLEET.length} NJ fleet vehicles...\n`);

  let created = 0;
  let skipped = 0;
  const failures = [];

  for (const v of NJ_FLEET) {
    const existing = await Vehicle.findOne({ 'wheelbase.rentalId': v.rentalId });

    if (existing) {
      console.log(`   ⏭️  Skipped ${v.nickname} (rentalId ${v.rentalId} already exists)`);
      skipped++;
      continue;
    }

    const coords = CITY_COORDS[v.city];

    const vehicleDoc = {
      host: fleetUser._id,
      nickname: v.nickname,
      make: v.make,
      model: v.model,
      year: v.year,
      vin: v.vin,
      licensePlate: v.plate,
      registrationState: 'NJ',
      type: 'sedan',
      transmission: 'automatic',
      seats: 5,
      description: `RentUFS fleet vehicle in ${v.city}, NJ. Bookings handled via Wheelbase.`,
      features: [],
      location: {
        address: `${v.city}, NJ`,
        city: v.city,
        state: 'NJ',
        zipCode: '',
        coordinates: [coords.lng, coords.lat]
      },
      geoLocation: {
        type: 'Point',
        coordinates: [coords.lng, coords.lat]
      },
      pricePerDay: DEFAULT_PRICE_PER_DAY,
      pricePerWeek: DEFAULT_PRICE_PER_WEEK,
      images: [placeholderImage(v.nickname)],
      registrationImage: placeholderImage(`${v.nickname}-reg`),  // placeholder; not used by Wheelbase flow
      availability: false,  // HIDDEN until manually flipped — see top-of-file notes
      bookingProvider: 'wheelbase',
      wheelbase: { rentalId: v.rentalId },
      tollspot: { vehicleId: null, status: 'none' }  // intentionally NOT registered in your TollSpot
    };

    try {
      await Vehicle.create(vehicleDoc);
      console.log(`   ✅ Created ${v.nickname} (${v.year} ${v.make} ${v.model}) → rentalId ${v.rentalId}`);
      created++;
    } catch (err) {
      console.log(`   ❌ Failed ${v.nickname}: ${err.message}`);
      failures.push({ nickname: v.nickname, error: err.message });
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(`\n📊 Summary:`);
  console.log(`   Created: ${created}`);
  console.log(`   Skipped (already existed): ${skipped}`);
  console.log(`   Failed:  ${failures.length}`);

  if (failures.length > 0) {
    console.log(`\n   Failures:`);
    failures.forEach(f => console.log(`     - ${f.nickname}: ${f.error}`));
  }

  console.log(`\n✅ Done. Disconnecting.`);
  await mongoose.disconnect();
  process.exit(failures.length > 0 ? 1 : 0);
}

seed().catch(err => {
  console.error('❌ Fatal error:', err);
  mongoose.disconnect();
  process.exit(1);
});
