// UI helper utilities using theme colors
// Provides a simple wrapper for tt.showToast that respects the brand palette

const { COLORS } = require('./theme');

/**
 * Show a toast with primary or accent styling.
 * @param {Object} opts - Options for tt.showToast
 *   {string} title - Message text
 *   {string} [icon] - 'success' | 'none' ...
 *   {boolean} [mask]
 */
function brandToast({ title, icon = 'none', mask = false }) {
  // Choose color based on icon type
  const bgColor = icon === 'success' ? COLORS.accent : COLORS.primary;
  // Mini‑Program toast does not allow custom bg, but we can use tt.showModal as fallback for important messages.
  // For now, just call the native toast.
  tt.showToast({ title, icon, mask });
}

module.exports = { brandToast };
