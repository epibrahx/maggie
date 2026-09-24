// Audience-facing live card: a shared like goal plus a like leaderboard.
// Everything is laid out in a 150px-wide design space and scaled uniformly
// to whatever size the panel created the card with.

const DESIGN_WIDTH = 150
const FULL_DESIGN_HEIGHT = 196
const COMPACT_ROW_HEIGHT = 15
const TOP_ROWS = 6
const DRAW_THROTTLE_MS = 200
const MAX_SEEN_MESSAGES = 2000
const AUTO_TIERS = [1000, 10000, 100000, 500000, 1000000]

const COLORS = {
  panel: '#141826',
  panelEdge: '#3a4468',
  panelInner: '#1c2236',
  text: '#f2f3f7',
  muted: '#8a93b2',
  accent: '#ff4d6d',
  track: '#2a3150',
  gold: '#ffd166',
  silver: '#c9d1e3',
  bronze: '#e39a6b',
  row: '#1a2033',
  rowEdge: '#2a3250',
}
const AVATAR_COLORS = ['#e05a84', '#4f7be0', '#4fae62', '#9a5ee0', '#e0913f', '#2fb3c9', '#d4569f', '#6c7ee8']
const MEDAL_COLORS = [COLORS.gold, COLORS.silver, COLORS.bronze]

// 3x5 bitmap glyphs for numbers; anything else falls back to the system font.
const GLYPHS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '001', '001', '001'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  '.': ['0', '0', '0', '0', '1'],
  '%': ['101', '001', '010', '100', '101'],
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
    // Stepped pixel corners: an outer edge color, then the panel inset by 1px.
    steppedRect(ctx, 0, 0, w, height, 3, COLORS.panelEdge)
    steppedRect(ctx, 1, 1, w - 2, height - 2, 2, COLORS.panel)
  },

  drawGoal(state) {
    const { ctx } = this
    const progress = Math.min(1, state.totalLikes / state.target)

    drawBitmap(ctx, HEART, 9, 10, 1.3, COLORS.accent)
    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('一起点亮', 21, 9.5)
    drawNumber(ctx, formatCount(state.totalLikes), 141, 8, 2.2, COLORS.accent, 'right')

    // Segmented progress bar: 12 blocks, lit ones in the accent color.
    const segments = 12
    const barX = 9
    const barY = 28
    const segWidth = 6.5
    ctx.fillStyle = COLORS.track
    ctx.fillRect(barX - 1, barY - 1, segments * (segWidth + 1) + 1, 8)
    const lit = Math.round(progress * segments)
    for (let i = 0; i < segments; i++) {
      ctx.fillStyle = i < lit ? COLORS.accent : COLORS.panelInner
      ctx.fillRect(barX + i * (segWidth + 1), barY, segWidth, 6)
    }
    drawNumber(ctx, `${Math.floor(progress * 100)}%`, 141, 28.5, 1.1, COLORS.accent, 'right')

    ctx.fillStyle = COLORS.muted
    ctx.font = '7px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`目标 ${formatCount(state.target)}`, 141, 39)

    // Pixel divider with a small diamond in the middle.
    ctx.fillStyle = COLORS.rowEdge
    ctx.fillRect(9, 51, 58, 1)
    ctx.fillRect(83, 51, 58, 1)
    ctx.fillRect(74, 49, 2, 2)
    ctx.fillRect(74, 52, 2, 2)
    ctx.fillRect(72, 51, 2, 1)
    ctx.fillRect(76, 51, 2, 1)
  },

  drawBoard(state, height) {
    const { ctx } = this
    drawBitmap(ctx, CROWN, 9, 59, 1.3, COLORS.gold)
    ctx.fillStyle = COLORS.text
    ctx.font = 'bold 9px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('点赞榜', 21, 57.5)

    if (!state.board.length) {
      ctx.fillStyle = COLORS.muted
      ctx.font = '8px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('点赞即可上榜', DESIGN_WIDTH / 2, 100)
      return
    }

    // Drop compact rows 6 and 5 when the host gave us less height than the full layout.
    const missing = Math.max(0, FULL_DESIGN_HEIGHT - height)
    const hiddenRanks = new Set()
    if (missing > 0) hiddenRanks.add(6)
    if (missing > COMPACT_ROW_HEIGHT) hiddenRanks.add(5)

    let y = 71
    state.board.forEach(row => {
      if (!row.isLast && hiddenRanks.has(row.rank)) return
      if (row.gap) {
        ctx.fillStyle = COLORS.muted
        for (let i = 0; i < 3; i++) ctx.fillRect(70 + i * 4, y + 1, 2, 2)
        y += 6
      }
      y += row.rank <= 3 && !row.isLast ? this.drawTopRow(row, y) : this.drawCompactRow(row, y)
    })
  },

  drawTopRow(row, y) {
    const { ctx } = this
    const medal = MEDAL_COLORS[row.rank - 1]
    const h = 17
    steppedRect(ctx, 7, y, 136, h, 2, row.rank === 1 ? COLORS.gold : COLORS.rowEdge)
    steppedRect(ctx, 8, y + 1, 134, h - 2, 1, row.rank === 1 ? '#2a2518' : COLORS.row)

    // Medal: stepped disc with the rank digit.
    steppedRect(ctx, 11, y + 3, 11, 11, 2, medal)
    drawNumber(ctx, String(row.rank), 16.5, y + 5.5, 1.2, COLORS.panel, 'center')

    this.drawAvatar(row, 26, y + 3, 11, 8)
    this.drawName(row.name, 41, y + 4.5, 9, 68)
    drawNumber(ctx, formatCount(row.likes), 139, y + 5, 1.4, row.rank === 1 ? COLORS.gold : COLORS.text, 'right')
    return h + 2
  },

  drawCompactRow(row, y) {
    const { ctx } = this
    const h = 13
    steppedRect(ctx, 7, y, 136, h, 2, COLORS.rowEdge)
    steppedRect(ctx, 8, y + 1, 134, h - 2, 1, COLORS.row)

    drawNumber(ctx, String(row.rank), 16.5, y + 4, 1, COLORS.muted, 'center')
    this.drawAvatar(row, 26, y + 2, 9, 7)
    this.drawName(row.name, 39, y + 3, 8, row.isLast ? 50 : 70)
    drawNumber(ctx, formatCount(row.likes), 139, y + 4, 1, COLORS.text, 'right')

    if (row.isLast) {
      ctx.save()
      ctx.translate(106, y + 6.5)
      ctx.rotate(-0.14)
      ctx.strokeStyle = COLORS.accent
      ctx.lineWidth = 0.8
      ctx.strokeRect(-9, -4, 18, 8)
      ctx.fillStyle = COLORS.accent
      ctx.font = 'bold 6px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('加油', 0, 0.3)
      ctx.restore()
      ctx.textBaseline = 'top'
    }
    return h + 2
  },

  drawAvatar(row, x, y, size, fontSize) {
    const { ctx } = this
    ctx.fillStyle = colorForId(row.id)
    ctx.fillRect(x, y, size, size)
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(Array.from(row.name)[0] || '?', x + size / 2, y + (size - fontSize) / 2)
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
  const unitSize = 5 * px + 1
  const chars = Array.from(text)
  const widths = chars.map(ch => (GLYPHS[ch] ? GLYPHS[ch][0].length * px : unitSize))
  const total = widths.reduce((sum, w) => sum + w, 0) + Math.max(0, chars.length - 1) * px
  let cursor = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x

  chars.forEach((ch, i) => {
    if (GLYPHS[ch]) {
      drawBitmap(ctx, GLYPHS[ch], cursor, y, px, color)
    } else {
      ctx.fillStyle = color
      ctx.font = `bold ${unitSize}px sans-serif`
      ctx.textAlign = 'left'
      ctx.fillText(ch, cursor, y - px * 0.6)
    }
    cursor += widths[i] + px
  })
}
