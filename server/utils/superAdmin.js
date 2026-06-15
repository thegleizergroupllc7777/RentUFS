// Owner-level protection ("Super Admin").
//
// A super admin is the platform owner. Regular admins can run day-to-day
// operations, but they CANNOT demote, deactivate, edit, or otherwise remove a
// super admin — and only a super admin can promote/demote admins. This prevents
// a staff admin (e.g. a dispatcher) from ever locking the owner out.
//
// Owners are identified by the SUPER_ADMIN_EMAILS env var (comma-separated).
// A sensible default is included so protection works out of the box; set the
// env var on the server to change/add owners without a code change.
const DEFAULT_SUPER_ADMINS = ['thegleizergroupllc@gmail.com'];

function superAdminEmails() {
  const fromEnv = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_SUPER_ADMINS;
}

// True if the given user is the protected owner.
function isSuperAdmin(user) {
  if (!user) return false;
  if (user.isSuperAdmin === true) return true;
  const email = (user.email || '').toLowerCase();
  return superAdminEmails().includes(email);
}

module.exports = { isSuperAdmin, superAdminEmails };
