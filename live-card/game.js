// Audience-facing live card: a shared like goal plus a like leaderboard.
// Everything is laid out in a 150px-wide design space and scaled uniformly
// to whatever size the panel created the card with.

const DESIGN_WIDTH = 150
const FULL_DESIGN_HEIGHT = 88
const COMPACT_ROW_HEIGHT = 13
const TOP_ROWS = 4
const DRAW_THROTTLE_MS = 200
const MAX_SEEN_MESSAGES = 2000
const AUTO_TIERS = [1000, 10000, 100000, 500000, 1000000]

const COLORS = {
  panel: '#ffffff',
  panelEdge: '#e5e8f0',
  panelInner: '#f8f9fc',
  text: '#1d2133',
  muted: '#8a93b2',
  accent: '#ff4d6d',
  track: '#ececf1',
  gold: '#ffd166',
  silver: '#c9d1e3',
  bronze: '#e39a6b',
  row: '#f5f6fa',
  rowEdge: '#e5e8f0',
}
const AVATAR_COLORS = ['#e05a84', '#4f7be0', '#4fae62', '#9a5ee0', '#e0913f', '#2fb3c9', '#d4569f', '#6c7ee8']
const MEDAL_COLORS = [COLORS.gold, COLORS.silver, COLORS.bronze]

// 4x6 bitmap glyphs for numbers (9pt+); anything else falls back to the system font.
const GLYPHS = {
  0: ['1111', '1001', '1001', '1001', '1001', '1111'],
  1: ['0100', '1100', '0100', '0100', '0100', '1110'],
  2: ['1110', '0001', '1110', '1000', '1000', '1111'],
  3: ['1110', '0001', '1110', '0001', '0001', '1110'],
  4: ['1001', '1001', '1111', '0001', '0001', '0001'],
  5: ['1111', '1000', '1110', '0001', '0001', '1110'],
  6: ['1110', '1000', '1110', '1001', '1001', '1110'],
  7: ['1111', '0001', '0010', '0100', '1000', '1000'],
  8: ['1110', '1001', '1110', '1001', '1001', '1110'],
  9: ['1110', '1001', '1111', '0001', '0001', '1110'],
  '.': ['0', '0', '0', '0', '0', '1'],
  '%': ['1001', '0001', '0010', '0100', '1000', '1001'],
}
const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000']
const CROWN = ['1001001', '1101011', '1111111', '1111111']

function formatCount(value) {
  if (value >= 100000000) return `${trimDecimal(value / 100000000)}亿`
  if (value >= 10000) return `${trimDecimal(value / 10000)}万`
  return String(value)
}

function trimDecimal(value) {
  return value.toFixed(1).replace(/\.0$/, '')
}

// Auto mode walks the tier list, then continues in steps of one million.
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

// Sorted by likes; ties go to whoever reached that count first.
function rankViewers(viewers) {
  return Array.from(viewers.values()).sort((a, b) => b.likes - a.likes || a.reachedSeq - b.reachedSeq)
}

// Top six, plus the last place when it is not already visible.
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
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

Card({
  // ---- API used by the panel (pages/index) ----

  getState() {
    const ranked = rankViewers(this.viewers)
    const goal = goalFor(this.goalMode, this.totalLikes)
    return {
      totalLikes: this.totalLikes,
      goalMode: this.goalMode,
      target: goal.target,
      level: goal.level,
      viewerCount: ranked.length,
      board: boardFor(ranked, TOP_ROWS).map(({ id, name, likes, rank, isLast, gap }) => ({
        id, name, likes, rank, isLast: !!isLast, gap: !!gap,
      })),
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

  // Also the entry point for simulated messages during development.
  handleLiveMessages(payload) {
    const messages = Array.isArray(payload) ? payload : [payload]
    messages.forEach(message => this.applyLike(message))
    this.scheduleFlush()
  },

  // ---- internals ----

  applyLike(message) {
    const likes = Number(message && message.like_num)
    if (!likes) return
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
        if (attempt < 4) setTimeout(() => this.subscribe(attempt + 1), 1000 * 2 ** attempt)
      },
    })
  },

  // ---- drawing ----

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

  drawFrame(height) {
    const { ctx } = this
    const w = DESIGN_WIDTH
    const corner = 3

    // Pixel-style rounded corners (4px corner)
    ctx.fillStyle = COLORS.panelEdge
    // Main background with corner cutouts
    ctx.fillRect(0 + corner, 0, w - corner * 2, height)
    ctx.fillRect(0, corner, w, height - corner * 2)

    // Corner pixels
    for (let i = 0; i < corner; i++) {
      const size = corner - i
      ctx.fillRect(i, i, size, 1)
      ctx.fillRect(w - corner + i, i, 1, 1)
      ctx.fillRect(i, height - corner + i, 1, 1)
      ctx.fillRect(w - corner + i, height - corner + i, 1, 1)
    }

    // Inner panel
    ctx.fillStyle = COLORS.panel
    ctx.fillRect(1 + corner, 1, w - 2 - corner * 2, height - 2)
    ctx.fillRect(1, 1 + corner, w - 2, height - 2 - corner * 2)
  },

  drawGoal(state) {
    const { ctx } = this
    const progress = Math.min(1, state.totalLikes / state.target)

    // Compact header: heart + text + total likes + percent
    drawBitmap(ctx, HEART, 5, 4, 1, COLORS.accent)
    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 8px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('一起', 13, 3)

    drawNumber(ctx, formatCount(state.totalLikes), 148, 2, 1.8, COLORS.accent, 'right')

    // Progress indicator: 8 compact blocks
    const segments = 8
    const barX = 5
    const barY = 14
    const segWidth = 5
    ctx.fillStyle = COLORS.track
    ctx.fillRect(barX - 0.5, barY - 0.5, segments * (segWidth + 0.5) + 0.5, 6)
    const lit = Math.round(progress * segments)
    for (let i = 0; i < segments; i++) {
      ctx.fillStyle = i < lit ? COLORS.accent : COLORS.panelInner
      ctx.fillRect(barX + i * (segWidth + 0.5), barY, segWidth, 5)
    }

    // Percent on the right
    drawNumber(ctx, `${Math.floor(progress * 100)}%`, 148, 13, 1.4, COLORS.accent, 'right')

    // Thin divider line
    ctx.fillStyle = COLORS.rowEdge
    ctx.fillRect(5, 24, 140, 1)
  },

  drawBoard(state, height) {
    const { ctx } = this
    drawBitmap(ctx, CROWN, 5, 29, 1, COLORS.gold)
    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 8px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('榜', 13, 28)

    if (!state.board.length) {
      ctx.fillStyle = COLORS.muted
      ctx.font = '7px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('点赞即可上榜', DESIGN_WIDTH / 2, 55)
      return
    }

    let y = 38
    state.board.forEach((row, index) => {
      if (index >= TOP_ROWS) return
      if (row.gap) return
      y += this.drawCompactRow(row, y)
    })
  },

  drawCompactRow(row, y) {
    const { ctx } = this
    const h = 12
    const isTop3 = row.rank <= 3 && !row.isLast

    // Row background
    ctx.fillStyle = COLORS.row
    ctx.fillRect(5, y, 140, h)

    // Border
    ctx.fillStyle = COLORS.rowEdge
    ctx.fillRect(5, y, 140, 1)

    // Medal or rank number
    if (isTop3) {
      const medal = MEDAL_COLORS[row.rank - 1]
      ctx.fillStyle = medal
      ctx.fillRect(8, y + 2, 10, 8)
      drawNumber(ctx, String(row.rank), 13, y + 2.5, 1, COLORS.panel, 'center')
    } else {
      drawNumber(ctx, String(row.rank), 13, y + 3.5, 0.9, COLORS.muted, 'center')
    }

    // Avatar
    this.drawAvatar(row, 21, y + 2, 8, 6)

    // Name
    this.drawName(row.name, 32, y + 3, 7, 60)

    // Likes
    drawNumber(ctx, formatCount(row.likes), 145, y + 3, 1.2, isTop3 ? COLORS.gold : COLORS.text, 'right')

    return h + 1
  },

  drawAvatar(row, x, y, size, fontSize) {
    const { ctx } = this
    ctx.fillStyle = colorForId(row.id)
    ctx.fillRect(x, y, size, size)
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(Array.from(row.name)[0] || '?', x + size / 2, y + size / 2)
    ctx.textBaseline = 'top'
  },

  drawName(name, x, y, fontSize, maxWidth) {
    const { ctx } = this
    ctx.fillStyle = COLORS.text
    ctx.font = `${fontSize}px sans-serif`
    ctx.textAlign = 'left'
    let text = name
    if (ctx.measureText(text).width > maxWidth) {
      const chars = Array.from(name)
      while (chars.length && ctx.measureText(`${chars.join('')}…`).width > maxWidth) chars.pop()
      text = `${chars.join('')}…`
    }
    ctx.fillText(text, x, y)
  },

  created(options) {
    this.canvas = this.getCanvas()
    this.ctx = this.canvas.getContext('2d')
    this.cardWidth = Number(options && options.width) || this.canvas.clientWidth || 150
    this.cardHeight = Number(options && options.height) || this.canvas.clientHeight || 200
    this.pixelRatio = Math.min(3, tt.getSystemInfoSync().pixelRatio || 2)
    this.canvas.width = Math.round(this.cardWidth * this.pixelRatio)
    this.canvas.height = Math.round(this.cardHeight * this.pixelRatio)

    this.goalMode = 'auto'
    this.resetSession()
    this.draw()
    this.subscribe(0)
  },
})

function steppedRect(ctx, x, y, w, h, step, color) {
  ctx.fillStyle = color
  ctx.fillRect(x + step, y, w - step * 2, h)
  ctx.fillRect(x, y + step, w, h - step * 2)
  if (step > 1) {
    const half = Math.ceil(step / 2)
    ctx.fillRect(x + half, y + half, w - half * 2, h - half * 2)
  }
}

function drawBitmap(ctx, rows, x, y, px, color) {
  ctx.fillStyle = color
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '1') ctx.fillRect(x + c * px, y + r * px, px, px)
    }
  })
}

// Draws digits, '.', and '%' as pixel glyphs; other characters (万/亿) use the
// system font at matching height. `y` is the top of the glyphs.
function drawNumber(ctx, text, x, y, px, color, align) {
  const unitSize = 4 * px + 0.5
  const chars = Array.from(text)
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
