// Audience-facing Live Card: Frosted Glassmorphism + Lightweight Pixel Art Widget
// Aspect Ratio: 150px × 168px (flexible height, translucent glass backdrop, high legibility)

const DESIGN_WIDTH = 150
const DESIGN_HEIGHT = 168
const TOP_ROWS = 4
const DRAW_THROTTLE_MS = 200
const MAX_SEEN_MESSAGES = 2000
const AUTO_TIERS = [1000, 10000, 100000, 500000, 1000000]

const GLASS_THEME = {
  // Translucent frosted glass layers
  bgTop: 'rgba(255, 255, 255, 0.90)',
  bgBottom: 'rgba(245, 247, 250, 0.78)',
  borderLight: 'rgba(255, 255, 255, 0.95)',
  borderDark: 'rgba(203, 213, 225, 0.55)',
  innerBorder: 'rgba(255, 255, 255, 0.60)',
  divider: 'rgba(226, 232, 240, 0.70)',
  
  // High-contrast modern typography
  textPrimary: '#0f172a',
  textSecondary: '#334155',
  textMuted: '#64748b',
  textSub: '#94a3b8',
  
  // Accents & energy
  accent: '#ff2d55',
  accentLight: '#ff758f',
  accentGlass: 'rgba(255, 45, 85, 0.10)',
  accentBorder: 'rgba(255, 45, 85, 0.25)',
  
  // Track & capsules
  trackBg: 'rgba(0, 0, 0, 0.05)',
  trackBorder: 'rgba(0, 0, 0, 0.06)',
  
  // Medals & rankings
  goldBg: 'rgba(254, 243, 199, 0.88)',
  goldBorder: 'rgba(245, 158, 11, 0.40)',
  goldBadge: '#f59e0b',
  goldText: '#b45309',
  
  silverBg: 'rgba(248, 250, 252, 0.75)',
  silverBorder: 'rgba(203, 213, 225, 0.60)',
  silverBadge: '#94a3b8',
  silverText: '#475569',
  
  bronzeBg: 'rgba(255, 237, 213, 0.82)',
  bronzeBorder: 'rgba(249, 115, 22, 0.35)',
  bronzeBadge: '#ea580c',
  bronzeText: '#c2410c',
  
  cheerBg: 'rgba(255, 241, 242, 0.82)',
  cheerBorder: 'rgba(255, 45, 85, 0.30)',
}

const AVATAR_COLORS = [
  '#f43f5e', '#ec4899', '#8b5cf6', '#6366f1',
  '#3b82f6', '#06b6d4', '#10b981', '#f59e0b',
]

// 4x6 pixel font glyphs
const GLYPHS = {
  0: ['1111', '1001', '1001', '1001', '1001', '1111'],
  1: ['0100', '1100', '0100', '0100', '0100', '1110'],
  2: ['1111', '0001', '1111', '1000', '1000', '1111'],
  3: ['1111', '0001', '1111', '0001', '0001', '1111'],
  4: ['1001', '1001', '1111', '0001', '0001', '0001'],
  5: ['1111', '1000', '1111', '0001', '0001', '1111'],
  6: ['1111', '1000', '1111', '1001', '1001', '1111'],
  7: ['1111', '0001', '0010', '0100', '0100', '0100'],
  8: ['1111', '1001', '1111', '1001', '1001', '1111'],
  9: ['1111', '1001', '1111', '0001', '0001', '1111'],
  '.': ['0', '0', '0', '0', '0', '1'],
  '%': ['1001', '0001', '0010', '0100', '1000', '1001'],
}

// 7x6 pixel heart
const HEART = [
  '0110110',
  '1111111',
  '1111111',
  '0111110',
  '0011100',
  '0001000',
]

// 7x5 pixel crown
const CROWN = [
  '1001001',
  '1010101',
  '1111111',
  '1111111',
  '0111110',
]

// 5x5 pixel star/sparkle
const SPARKLE = [
  '00100',
  '01110',
  '11111',
  '01110',
  '00100',
]

function formatCount(value) {
  if (value >= 100000000) return `${trimDecimal(value / 100000000)}亿`
  if (value >= 10000) return `${trimDecimal(value / 10000)}万`
  return String(value || 0)
}

function trimDecimal(value) {
  return value.toFixed(1).replace(/\.0$/, '')
}

function goalFor(mode, total) {
  if (mode !== 'auto') {
    const remaining = Math.max(0, mode - total)
    return { target: mode, level: total >= mode ? 1 : 0, remaining }
  }
  const tierIndex = AUTO_TIERS.findIndex(tier => total < tier)
  if (tierIndex >= 0) {
    const target = AUTO_TIERS[tierIndex]
    return { target, level: tierIndex, remaining: target - total }
  }
  const last = AUTO_TIERS[AUTO_TIERS.length - 1]
  const extra = Math.floor((total - last) / 1000000) + 1
  const target = last + extra * 1000000
  return { target, level: AUTO_TIERS.length + extra - 1, remaining: target - total }
}

function rankViewers(viewers) {
  return Array.from(viewers.values()).sort((a, b) => b.likes - a.likes || a.reachedSeq - b.reachedSeq)
}

function boardFor(ranked, topCount) {
  const rows = ranked.slice(0, topCount).map((viewer, index) => ({ ...viewer, rank: index + 1 }))
  if (ranked.length === topCount + 1) {
    rows.push({ ...ranked[topCount], rank: topCount + 1 })
  } else if (ranked.length > topCount + 1) {
    rows.push({ ...ranked[ranked.length - 1], rank: ranked.length, isLast: true, gap: true })
  }
  return rows
}

function colorForId(id) {
  let hash = 0
  for (let i = 0; i < (id || '').length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

Card({
  // ---- Host Panel Interop ----

  getState() {
    const ranked = rankViewers(this.viewers)
    const goal = goalFor(this.goalMode, this.totalLikes)
    return {
      totalLikes: this.totalLikes,
      goalMode: this.goalMode,
      target: goal.target,
      level: goal.level,
      remaining: goal.remaining,
      viewerCount: ranked.length,
      board: boardFor(ranked, 6).map(({ id, name, likes, rank, isLast, gap }) => ({
        id, name, likes, rank, isLast: !!isLast, gap: !!gap,
      })),
      top4: ranked.slice(0, 4).map((v, i) => ({ ...v, rank: i + 1 })),
      subscription: this.subscription,
    }
  },

  setGoalMode(mode) {
    this.goalMode = mode === 'auto' ? 'auto' : Math.max(1, Math.floor(Number(mode) || 0))
    this.scheduleFlush()
  },

  resetSession() {
    this.totalLikes = 0
    this.viewers = new Map()
    this.seenMessages = new Set()
    this.seq = 0
    this.scheduleFlush()
  },

  handleLiveMessages(payload) {
    const messages = Array.isArray(payload) ? payload : [payload]
    messages.forEach(message => this.applyLike(message))
    this.scheduleFlush()
  },

  applyLike(message) {
    const likes = Number(message && message.like_num)
    if (!likes || isNaN(likes) || likes <= 0) return
    const msgId = message.msg_id
    if (msgId) {
      if (this.seenMessages.has(msgId)) return
      this.seenMessages.add(msgId)
      if (this.seenMessages.size > MAX_SEEN_MESSAGES) {
        this.seenMessages.delete(this.seenMessages.values().next().value)
      }
    }
    const id = message.sec_open_id || message.nickname || 'anonymous'
    const viewer = this.viewers.get(id) || { id, name: '', likes: 0 }
    viewer.name = message.nickname || viewer.name || '神秘观众'
    viewer.likes += likes
    viewer.reachedSeq = ++this.seq
    this.viewers.set(id, viewer)
    this.totalLikes += likes
  },

  scheduleFlush() {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.draw()
      if (typeof this.onStateChange === 'function') this.onStateChange(this.getState())
    }, DRAW_THROTTLE_MS)
  },

  subscribe(attempt) {
    this.subscription = 'connecting'
    tt.subscribeLiveInteractPluginMessage({
      messageType: ['live_like'],
      success: () => {
        this.subscription = 'connected'
        tt.onReceiveLiveInteractPluginMessage(payload => this.handleLiveMessages(payload))
        this.scheduleFlush()
      },
      fail: error => {
        console.error('Live message subscription failed:', error)
        this.subscription = attempt < 4 ? 'retrying' : 'failed'
        this.scheduleFlush()
        if (attempt < 4) setTimeout(() => this.subscribe(attempt + 1), 1000 * Math.pow(2, attempt))
      },
    })
  },

  // ---- Canvas Glass Rendering Engine ----

  draw() {
    const { ctx } = this
    const scale = this.cardWidth / DESIGN_WIDTH
    const height = this.cardHeight / scale
    const state = this.getState()

    ctx.setTransform(this.pixelRatio * scale, 0, 0, this.pixelRatio * scale, 0, 0)
    ctx.clearRect(0, 0, DESIGN_WIDTH, height)
    ctx.textBaseline = 'top'

    this.drawGlassFrame(DESIGN_WIDTH, height)
    this.drawGoalPod(state)
    this.drawBoardPod(state, height)
  },

  // Multi-layer frosted glass backdrop with stepped pixel corners
  drawGlassFrame(w, h) {
    const { ctx } = this
    const corner = 4

    // 1. Translucent backdrop fill with gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, GLASS_THEME.bgTop)
    grad.addColorStop(1, GLASS_THEME.bgBottom)

    ctx.fillStyle = grad
    ctx.fillRect(corner, 0, w - corner * 2, h)
    ctx.fillRect(0, corner, w, h - corner * 2)

    // Corner stepped fills
    for (let i = 0; i < corner; i++) {
      ctx.fillRect(i, corner - 1 - i, 1, 1)
      ctx.fillRect(w - 1 - i, corner - 1 - i, 1, 1)
      ctx.fillRect(i, h - corner + i, 1, 1)
      ctx.fillRect(w - 1 - i, h - corner + i, 1, 1)
    }

    // 2. Glass Rim Highlights
    ctx.fillStyle = GLASS_THEME.borderLight
    ctx.fillRect(corner, 0, w - corner * 2, 1) // top highlight
    ctx.fillRect(0, corner, 1, h - corner * 2) // left highlight

    ctx.fillStyle = GLASS_THEME.borderDark
    ctx.fillRect(corner, h - 1, w - corner * 2, 1) // bottom edge
    ctx.fillRect(w - 1, corner, 1, h - corner * 2) // right edge
  },

  // Top Section: Like Goal, Progress Capsule & Milestones (y: 6 ~ 46)
  drawGoalPod(state) {
    const { ctx } = this
    const progress = Math.min(1, state.totalLikes / state.target)

    // Heart Icon with subtle glow
    drawBitmap(ctx, HEART, 7, 7.5, 1, GLASS_THEME.accent)

    // Goal Header Title
    ctx.fillStyle = GLASS_THEME.textPrimary
    ctx.font = 'bold 8.5px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('点赞目标', 17, 6.5)

    // Prominent Total Likes Count (Top Right)
    drawNumber(ctx, formatCount(state.totalLikes), 143, 6, 1.4, GLASS_THEME.accent, 'right')

    // Capsule Progress Bar (10 Segmented Glow Blocks)
    const barX = 7
    const barY = 19
    const totalSegments = 10
    const segWidth = 8.5
    const segGap = 1.3
    const barW = totalSegments * (segWidth + segGap) - segGap
    const lit = Math.round(progress * totalSegments)

    // Track capsule background
    ctx.fillStyle = GLASS_THEME.trackBg
    ctx.fillRect(barX - 1, barY - 1, barW + 2, 7)

    for (let i = 0; i < totalSegments; i++) {
      const sx = barX + i * (segWidth + segGap)
      const isLit = i < lit
      ctx.fillStyle = isLit ? GLASS_THEME.accent : 'rgba(255, 255, 255, 0.7)'
      ctx.fillRect(sx, barY, segWidth, 5)
      if (isLit) {
        ctx.fillStyle = GLASS_THEME.accentLight
        ctx.fillRect(sx, barY, segWidth, 1) // top glass sheen
      }
    }

    // Progress percentage on the right of bar
    drawNumber(ctx, `${Math.floor(progress * 100)}%`, 143, 18.5, 1.1, GLASS_THEME.accent, 'right')

    // Milestone Sub-info (y: 29)
    // Left tier pill
    const tierText = state.goalMode === 'auto' ? `已达${state.level}档` : '全员冲榜'
    ctx.fillStyle = GLASS_THEME.accentGlass
    ctx.fillRect(7, 28, 30, 9)
    ctx.fillStyle = GLASS_THEME.accent
    ctx.font = 'bold 6.5px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(tierText, 22, 29.5)

    // Right remaining info
    ctx.fillStyle = GLASS_THEME.textMuted
    ctx.font = '6.5px sans-serif'
    ctx.textAlign = 'right'
    const subText = state.remaining > 0 ? `还差 ${formatCount(state.remaining)} 升级` : `目标 ${formatCount(state.target)} 已达成`
    ctx.fillText(subText, 143, 29.5)

    // Frosted Divider Line
    ctx.fillStyle = GLASS_THEME.divider
    ctx.fillRect(7, 42, 136, 1)
  },

  // Bottom Section: Live Leaderboard Pod (y: 46 ~ 168)
  drawBoardPod(state, height) {
    const { ctx } = this

    // Crown Icon
    drawBitmap(ctx, CROWN, 7, 47.5, 1, GLASS_THEME.goldBadge)

    // Subtitle: "贡献榜"
    ctx.fillStyle = GLASS_THEME.textSecondary
    ctx.font = 'bold 8px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('贡献榜', 17, 46.5)

    // Right participant counter
    ctx.fillStyle = GLASS_THEME.textSub
    ctx.font = '6.5px sans-serif'
    ctx.textAlign = 'right'
    const countNote = state.viewerCount > 0 ? `${state.viewerCount}人参与` : '虚位以待'
    ctx.fillText(countNote, 143, 46.5)

    const list = state.top4 || []

    if (list.length === 0) {
      // Empty state
      drawBitmap(ctx, SPARKLE, 73, 85, 1.2, GLASS_THEME.goldBadge)
      ctx.fillStyle = GLASS_THEME.textMuted
      ctx.font = 'bold 7.5px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('点赞上榜 · 成为第 1 名✨', DESIGN_WIDTH / 2, 102)
      ctx.fillStyle = GLASS_THEME.textSub
      ctx.font = '6.5px sans-serif'
      ctx.fillText('轻点屏幕为全场助力', DESIGN_WIDTH / 2, 116)
      return
    }

    // 4 Leaderboard Rows (y: 58, 80, 102, 124)
    const rowYList = [58, 79.5, 101, 122.5]
    for (let i = 0; i < TOP_ROWS; i++) {
      const y = rowYList[i]
      if (i < list.length) {
        this.drawGlassRow(list[i], y, i)
      } else {
        this.drawEmptyGlassRow(y, i + 1)
      }
    }

    // Bottom prompt tip
    ctx.fillStyle = GLASS_THEME.textSub
    ctx.font = '6.5px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('轻触屏幕点赞 · 实时冲榜 ✨', DESIGN_WIDTH / 2, 149)
  },

  drawGlassRow(row, y, index) {
    const { ctx } = this
    const h = 18
    const isTop1 = index === 0
    const isTop2 = index === 1
    const isTop3 = index === 2

    let rowBg = GLASS_THEME.silverBg
    let rowBorder = GLASS_THEME.silverBorder
    let badgeBg = GLASS_THEME.silverBadge
    let scoreColor = GLASS_THEME.silverText

    if (isTop1) {
      rowBg = GLASS_THEME.goldBg
      rowBorder = GLASS_THEME.goldBorder
      badgeBg = GLASS_THEME.goldBadge
      scoreColor = GLASS_THEME.goldText
    } else if (isTop3) {
      rowBg = GLASS_THEME.bronzeBg
      rowBorder = GLASS_THEME.bronzeBorder
      badgeBg = GLASS_THEME.bronzeBadge
      scoreColor = GLASS_THEME.bronzeText
    } else if (row.isLast) {
      rowBg = GLASS_THEME.cheerBg
      rowBorder = GLASS_THEME.cheerBorder
      badgeBg = GLASS_THEME.accent
      scoreColor = GLASS_THEME.accent
    }

    // Glass row pill
    ctx.fillStyle = rowBg
    ctx.fillRect(7, y, 136, h)
    ctx.fillStyle = rowBorder
    ctx.fillRect(7, y, 136, 1)
    ctx.fillRect(7, y + h - 1, 136, 1)
    ctx.fillRect(7, y, 1, h)
    ctx.fillRect(142, y, 1, h)

    // Rank badge (11x11px)
    ctx.fillStyle = badgeBg
    ctx.fillRect(10, y + 3.5, 11, 11)
    drawNumber(ctx, String(row.rank), 15.5, y + 4.5, 0.9, '#ffffff', 'center')

    // Avatar (11x11px pastel block + initial)
    this.drawAvatar(row, 24, y + 3.5, 11, 7.5)

    // Name (Clean, legible font)
    this.drawName(row.name, 38, y + 4.5, 8, 52)

    // Likes count
    drawNumber(ctx, formatCount(row.likes), 139, y + 4.5, 1.2, scoreColor, 'right')
  },

  drawEmptyGlassRow(y, rank) {
    const { ctx } = this
    const h = 18

    ctx.fillStyle = 'rgba(255, 255, 255, 0.40)'
    ctx.fillRect(7, y, 136, h)
    ctx.fillStyle = 'rgba(226, 232, 240, 0.40)'
    ctx.fillRect(7, y, 136, 1)

    // Muted rank
    drawNumber(ctx, String(rank), 15.5, y + 4.5, 0.9, GLASS_THEME.textSub, 'center')

    ctx.fillStyle = GLASS_THEME.textSub
    ctx.font = '7px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('虚位以待 · 冲榜中~', 38, y + 5)
  },

  drawAvatar(row, x, y, size, fontSize) {
    const { ctx } = this
    ctx.fillStyle = colorForId(row.id)
    ctx.fillRect(x, y, size, size)
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(Array.from(row.name || '?')[0] || '?', x + size / 2, y + size / 2)
    ctx.textBaseline = 'top'
  },

  drawName(name, x, y, fontSize, maxWidth) {
    const { ctx } = this
    ctx.fillStyle = GLASS_THEME.textPrimary
    ctx.font = `600 ${fontSize}px sans-serif`
    ctx.textAlign = 'left'
    let text = name || '神秘观众'
    if (ctx.measureText(text).width > maxWidth) {
      const chars = Array.from(text)
      while (chars.length && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop()
      text = `${chars.join('')}…`
    }
    ctx.fillText(text, x, y)
  },

  created(options) {
    this.canvas = this.getCanvas()
    this.ctx = this.canvas.getContext('2d')
    this.cardWidth = Number(options && options.width) || this.canvas.clientWidth || DESIGN_WIDTH
    this.cardHeight = Number(options && options.height) || this.canvas.clientHeight || DESIGN_HEIGHT
    this.pixelRatio = Math.min(3, tt.getSystemInfoSync().pixelRatio || 2)
    this.canvas.width = Math.round(this.cardWidth * this.pixelRatio)
    this.canvas.height = Math.round(this.cardHeight * this.pixelRatio)

    this.goalMode = 'auto'
    this.resetSession()
    this.draw()
    this.subscribe(0)
  },
})

function drawBitmap(ctx, rows, x, y, px, color) {
  ctx.fillStyle = color
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '1') ctx.fillRect(x + c * px, y + r * px, px, px)
    }
  })
}

function drawNumber(ctx, text, x, y, px, color, align) {
  const unitSize = 4 * px + 0.5
  const chars = Array.from(String(text || '0'))
  const widths = chars.map(ch => (GLYPHS[ch] ? GLYPHS[ch][0].length * px : unitSize * 1.2))
  const total = widths.reduce((sum, w) => sum + w, 0) + Math.max(0, chars.length - 1) * px * 0.5
  let cursor = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x

  chars.forEach((ch, i) => {
    if (GLYPHS[ch]) {
      drawBitmap(ctx, GLYPHS[ch], cursor, y, px, color)
    } else {
      ctx.fillStyle = color
      ctx.font = `bold ${unitSize}px sans-serif`
      ctx.textAlign = 'left'
      ctx.fillText(ch, cursor, y)
    }
    cursor += widths[i] + px * 0.5
  })
}
