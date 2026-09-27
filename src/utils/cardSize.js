// Utility to calculate live card size respecting Douyin limits
// maxW / maxH are the dimensions provided by tt.getLiveRoomCardInfo
// Returns an object { width, height } that never exceeds the official limits

const DESIGN_MAX_W = 420; // Douyin official max width (px)
const DESIGN_MAX_H = 720; // Douyin official max height (px)
const CARD_RATIO = 96 / 150; // same as original design ratio

/**
 * Compute card dimensions.
 * @param {number} maxW - live room max width (px)
 * @param {number} maxH - live room max height (px)
 * @returns {{width:number,height:number}}
 */
function calcCardSize(maxW, maxH) {
  // Guard against undefined / zero values – fall back to design defaults
  const w = typeof maxW === 'number' && maxW > 0 ? Math.min(DESIGN_MAX_W, maxW) : DESIGN_MAX_W;
  const hLim = typeof maxH === 'number' && maxH > 0 ? maxH : DESIGN_MAX_H;
  // Ensure the height respects the aspect ratio and does not exceed limits
  const heightByRatio = w * CARD_RATIO;
  const height = Math.min(DESIGN_MAX_H, hLim, heightByRatio);
  return { width: Math.floor(w), height: Math.floor(height) };
}

module.exports = { calcCardSize };
