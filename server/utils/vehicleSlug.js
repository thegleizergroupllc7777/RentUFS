// Builds a URL-friendly slug for a vehicle, e.g. "2024-bmw-x3-brooklyn-ny-a1b2c3".
// The short suffix (derived from the vehicle _id) keeps slugs unique so two
// similar vehicles never collide. Slugs are for the public URL only — all
// internal lookups continue to use the immutable _id.

const slugify = (str) =>
  String(str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, '')     // trim leading/trailing hyphens
    .replace(/-{2,}/g, '-');     // collapse repeats

const buildVehicleSlug = (vehicle) => {
  if (!vehicle) return null;
  const parts = [
    vehicle.year,
    vehicle.make,
    vehicle.model,
    vehicle.location?.city,
    vehicle.location?.state
  ];
  const base = slugify(parts.filter(Boolean).join(' '));
  // Short, stable unique suffix from the end of the Mongo _id (hex).
  const suffix = vehicle._id ? String(vehicle._id).slice(-6) : '';
  const slug = [base, suffix].filter(Boolean).join('-');
  return slug || suffix || null;
};

module.exports = { buildVehicleSlug, slugify };
