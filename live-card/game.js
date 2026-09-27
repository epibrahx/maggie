// Audience-facing live card: 150px × 88px lightweight pixel-art live widget.
// Compliant with Douyin Live Interactive Tools design specifications (≤88px height, high readability, light theme).

const DESIGN_WIDTH = 150
const DESIGN_HEIGHT = 88
const TOP_ROWS = 3
const DRAW_THROTTLE_MS = 200
const MAX_SEEN_MESSAGES = 2000
const AUTO_TIERS = [1000, 10000, 100000, 500000, 1000000]

const COLORS = {
  bg: '#ffffff',
  border: '#e2e8f0',
  inner: '#f8fafc',
  text: '#0f172a',
  sub: '#475569',
  muted: '#94a3b8',
  accent: '#ff4d6d',
  accentLight: '#ff758f',
  track: '#f1f5f9',
  gold: '#f59e0b',
  goldLight: '#fffbeb',
  goldBorder: '#fde68a',
  silver: '#94a3b8',
  silverLight: '#f8fafc',
  silverBorder: '#e2e8f0',
  bronze: '#ea580c',
  bronzeLight: '#fff7ed',
  bronzeBorder: '#fed7aa',
  rowBg: '#f8fafc',
  rowBorder: '#e2e8f0',
  divider: '#f1f5f9',
}

const AVATAR_COLORS = [
  '#f43f5e', '#ec4899', '#8b5cf6', '#6366f1',
  '#3b82f6', '#06b6d4', '#10b981', '#f59e0b',
]

const MEDAL_CONFIG = [
  { bg: COLORS.gold, light: COLORS.goldLight, border: COLORS.goldBorder, text: '#ffffff', scoreColor: '#d97706' },
  { bg: COLORS.silver, light: COLORS.silverLight, border: COLORS.silverBorder, text: '#ffffff', scoreColor: '#475569' },
  { bg: COLORS.bronze, light: COLORS.bronzeLight, border: COLORS.bronzeBorder, text: '#ffffff', scoreColor: '#ea580c' },
]

// 4x6 pixel font glyphs for ultra-crisp numbers and symbols
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
    return { target: mode, level: total >= mode ? 1 : 0 }
  }
  const tierIndex = AUTO_TIERS.findIndex(tier => total < tier)
  if (tierIndex >= 0) return { target: AUTO_TIERS[tierIndex], level: tierIndex }
  const last = AUTO_TIERS[AUTO_TIERS.length - 1]
  const extra = Math.floor((total - last) / 1000000) + 1
  return { target: last + extra * 1000000, level: AUTO_TIERS.length + extra - 1 }
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
  // ---- Panel Interop API ----

  getState() {
    const ranked = rankViewers(this.viewers)
    const goal = goalFor(this.goalMode, this.totalLikes)
    return {
      totalLikes: this.totalLikes,
      goalMode: this.goalMode,
      target: goal.target,
      level: goal.level,
      viewerCount: ranked.length,
      board: boardFor(ranked, 6).map(({ id, name, likes, rank, isLast, gap }) => ({
        id, name, likes, rank, isLast: !!isLast, gap: !!gap,
      })),
      top3: ranked.slice(0, 3).map((v, i) => ({ ...v, rank: i + 1 })),
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

  // ---- Message handling ----

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

  // ---- Rendering Engine ----

  draw() {
    const { ctx } = this
    const scale = this.cardWidth / DESIGN_WIDTH
    const height = this.cardHeight / scale
    const state = this.getState()

    ctx.setTransform(this.pixelRatio * scale, 0, 0, this.pixelRatio * scale, 0, 0)
    ctx.clearRect(0, 0, DESIGN_WIDTH, height)
    ctx.textBaseline = 'top'

    this.drawFrame(height)
    this.drawGoal(state)
    this.drawBoard(state, height)
  },

  // Lightweight pixel card frame with 3px stepped corners
  drawFrame(height) {
    const { ctx } = this
    const w = DESIGN_WIDTH
    const corner = 3

    // Outer border
    ctx.fillStyle = COLORS.border
    ctx.fillRect(corner, 0, w - corner * 2, height)
    ctx.fillRect(0, corner, w, height - corner * 2)
    // Corner pixels
    for (let i = 0; i < corner; i++) {
      ctx.fillRect(i, corner - 1 - i, 1, 1)
      ctx.fillRect(w - 1 - i, corner - 1 - i, 1, 1)
      ctx.fillRect(i, height - corner + i, 1, 1)
      ctx.fillRect(w - 1 - i, height - corner + i, 1, 1)
    }

    // Inner pure white surface
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(corner, 1, w - corner * 2, height - 2)
    ctx.fillRect(1, corner, w - 2, height - corner * 2)
    for (let i = 0; i < corner - 1; i++) {
      ctx.fillRect(i + 1, corner - 1 - i, 1, 1)
      ctx.fillRect(w - 2 - i, corner - 1 - i, 1, 1)
      ctx.fillRect(i + 1, height - corner + i, 1, 1)
      ctx.fillRect(w - 2 - i, height - corner + i, 1, 1)
    }
  },

  // Top goal section: 0 to 27px
  drawGoal(state) {
    const { ctx } = this
    const progress = Math.min(1, state.totalLikes / state.target)

    // Pixel Heart icon
    drawBitmap(ctx, HEART, 6, 4.5, 1, COLORS.accent)

    // Title: "点赞目标"
    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 8px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('点赞目标', 15.5, 3.5)

    // Total likes formatted on top right
    drawNumber(ctx, formatCount(state.totalLikes), 144, 3, 1.4, COLORS.accent, 'right')

    // Segmented progress bar (8 blocks, total 96px width)
    const barX = 6
    const barY = 14
    const totalSegments = 8
    const segWidth = 10.5
    const segGap = 1.5
    const lit = Math.round(progress * totalSegments)

    for (let i = 0; i < totalSegments; i++) {
      const sx = barX + i * (segWidth + segGap)
      const isLit = i < lit
      ctx.fillStyle = isLit ? COLORS.accent : COLORS.track
      ctx.fillRect(sx, barY, segWidth, 4.5)
      if (isLit) {
        // Highlight notch
        ctx.fillStyle = COLORS.accentLight
        ctx.fillRect(sx, barY, segWidth, 1)
      }
    }

    // Percent on right of progress bar
    drawNumber(ctx, `${Math.floor(progress * 100)}%`, 144, 13.5, 1.1, COLORS.accent, 'right')

    // Sub note: Milestone info & target
    ctx.fillStyle = COLORS.muted
    ctx.font = '6.5px sans-serif'
    ctx.textAlign = 'left'
    const tierNote = state.goalMode === 'auto' ? `已达${state.level}档` : '全员冲榜'
    ctx.fillText(tierNote, 6, 20.5)

    ctx.textAlign = 'right'
    ctx.fillText(`目标 ${formatCount(state.target)}`, 144, 20.5)

    // Thin separator line
    ctx.fillStyle = COLORS.divider
    ctx.fillRect(6, 28, 138, 1)
  },

  // Bottom leaderboard section: 29px to 86px
  drawBoard(state, height) {
    const { ctx } = this

    // Crown icon
    drawBitmap(ctx, CROWN, 6, 31, 1, COLORS.gold)

    // Subtitle: "点赞榜"
    ctx.fillStyle = COLORS.sub
    ctx.font = 'bold 7px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('点赞榜', 15.5, 30.5)

    // Participant count on top right
    ctx.fillStyle = COLORS.muted
    ctx.font = '6.5px sans-serif'
    ctx.textAlign = 'right'
    const countNote = state.viewerCount > 0 ? `${state.viewerCount}人参与` : '虚位以待'
    ctx.fillText(countNote, 144, 30.5)

    const list = state.top3 || []

    if (list.length === 0) {
      // Clean empty state
      drawBitmap(ctx, SPARKLE, 73, 46, 1, COLORS.gold)
      ctx.fillStyle = COLORS.muted
      ctx.font = '7px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('点赞即可上榜 冲锋第1名✨', DESIGN_WIDTH / 2, 58)
      return
    }

    // Render up to 3 rows
    const rowYList = [39, 54, 69]
    for (let i = 0; i < TOP_ROWS; i++) {
      const y = rowYList[i]
      if (i < list.length) {
        this.drawRow(list[i], y, i)
      } else {
        this.drawEmptyRow(y, i + 1)
      }
    }
  },

  drawRow(row, y, index) {
    const { ctx } = this
    const h = 13.5
    const medal = MEDAL_CONFIG[index] || MEDAL_CONFIG[1]

    // Row container
    ctx.fillStyle = medal.light
    ctx.fillRect(6, y, 138, h)
    ctx.fillStyle = medal.border
    ctx.fillRect(6, y, 138, 1)
    ctx.fillRect(6, y + h - 1, 138, 1)
    ctx.fillRect(6, y, 1, h)
    ctx.fillRect(143, y, 1, h)

    // Medal rank badge (9x9px)
    ctx.fillStyle = medal.bg
    ctx.fillRect(8, y + 2, 9, 9)
    drawNumber(ctx, String(row.rank), 12.5, y + 2.5, 0.8, medal.text, 'center')

    // Avatar (9x9px pastel block + initial)
    this.drawAvatar(row, 19, y + 2, 9, 6.5)

    // Viewer Name
    this.drawName(row.name, 30, y + 2.5, 7.5, 62)

    // Likes count
    drawNumber(ctx, formatCount(row.likes), 141, y + 2.5, 1.1, medal.scoreColor, 'right')
  },

  drawEmptyRow(y, rank) {
    const { ctx } = this
    const h = 13.5

    ctx.fillStyle = COLORS.inner
    ctx.fillRect(6, y, 138, h)
    ctx.fillStyle = COLORS.border
    ctx.fillRect(6, y, 138, 1)

    // Rank number in muted color
    drawNumber(ctx, String(rank), 12.5, y + 2.5, 0.8, COLORS.muted, 'center')

    ctx.fillStyle = COLORS.muted
    ctx.font = '6.5px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('虚位以待 · 冲榜中~', 30, y + 3)
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
    ctx.fillStyle = COLORS.text
    ctx.font = `${fontSize}px sans-serif`
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
    this.cardWidth = Number(options && options.width) || this.canvas.clientWidth || 150
    this.cardHeight = Number(options && options.height) || this.canvas.clientHeight || 88
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

// Draws digits, '.', and '%' as pixel glyphs; other characters (万/亿) use system font
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
