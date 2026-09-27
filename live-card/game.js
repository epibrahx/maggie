// 喜鹊 · 街机点赞冲关 (Magpie Arcade Live HUD)
// 专属设计语言：Neo-Arcade（复古街机像素 + 现代高清晰 HUD）
// 核心设计规范：纯正 8-Bit 能量槽、双层浮雕像素边框、街机计分牌字模与荣誉冠名

const DESIGN_WIDTH = 150
const DESIGN_HEIGHT = 96
const DRAW_THROTTLE_MS = 160
const MAX_SEEN_MESSAGES = 2000
const AUTO_TIERS = [1000, 10000, 50000, 100000, 500000, 1000000]

// 专属 Neo-Arcade 调色盘
const ARCADE = {
  // 机体底座与边框浮雕
  chassis: '#0F121D',
  bezelLight: '#3B4868',
  bezelDark: '#1E2538',
  screenBg: '#161B2E',
  innerBorder: '#232B45',

  // 街机霓虹核心色
  coral: '#FF3366',       // 主力点赞光能
  coralLight: '#FF6688',
  gold: '#FFB800',        // 街机金币 / 榜首
  goldLight: '#FFE082',
  cyan: '#00E5FF',        // 关卡指示器
  mint: '#00E5A3',        // 连击达成

  // 能量槽 (Gauge)
  gaugeSlot: '#121626',
  gaugeGrid: '#2A3352',

  // 文本与辅助
  textWhite: '#F8FAFC',
  textMuted: '#8D99AE',
  textDark: '#0A0C14',
  divider: '#232B45',
}

const AVATAR_PALETTE = [
  '#FF3366', '#FF9900', '#FFCC00', '#00E5A3',
  '#00E5FF', '#9D4EDD', '#F72585', '#4361EE',
]

// 5×7 经典街机高清字模（纯正像素，清晰度与复古感兼备）
const ARCADE_GLYPHS = {
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '.': ['0', '0', '0', '0', '0', '1', '1'],
  '%': ['11001', '11010', '00100', '01000', '01011', '10011', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
}

// 8×7 街机像素爱心 (Pixel Heart)
const ICON_HEART = [
  '01100110',
  '11111111',
  '11111111',
  '11111111',
  '01111110',
  '00111100',
  '00011000',
]

// 9×6 街机像素皇冠 (Pixel Crown)
const ICON_CROWN = [
  '100010001',
  '101010101',
  '111111111',
  '111111111',
  '111111111',
  '011111110',
]

// 5×7 街机闪电能量 (Pixel Bolt)
const ICON_BOLT = [
  '00010',
  '00110',
  '01100',
  '11111',
  '00110',
  '01100',
  '01000',
]

function formatCount(value) {
  const num = Number(value) || 0
  if (num >= 100000000) return `${trimDecimal(num / 100000000)}亿`
  if (num >= 10000) return `${trimDecimal(num / 10000)}万`
  return String(num)
}

function trimDecimal(num) {
  return num.toFixed(1).replace(/\.0$/, '')
}

function calcGoal(mode, totalLikes) {
  const likes = Number(totalLikes) || 0
  if (mode !== 'auto') {
    const target = Number(mode) || 10000
    const remaining = Math.max(0, target - likes)
    return { target, level: likes >= target ? 1 : 0, remaining }
  }
  const tierIdx = AUTO_TIERS.findIndex(t => likes < t)
  if (tierIdx >= 0) {
    const target = AUTO_TIERS[tierIdx]
    return { target, level: tierIdx + 1, remaining: target - likes }
  }
  const last = AUTO_TIERS[AUTO_TIERS.length - 1]
  const extraTiers = Math.floor((likes - last) / 1000000) + 1
  const target = last + extraTiers * 1000000
  return { target, level: AUTO_TIERS.length + extraTiers, remaining: target - likes }
}

function getSortedViewers(viewersMap) {
  return Array.from(viewersMap.values()).sort((a, b) => b.likes - a.likes || a.reachedSeq - b.reachedSeq)
}

function getAvatarColor(id) {
  let hash = 0
  for (let i = 0; i < (id || '').length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

// 绘制纯正像素位图
function drawBitmap(ctx, rows, x, y, px, color) {
  ctx.fillStyle = color
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '1') {
        ctx.fillRect(Math.round(x + c * px), Math.round(y + r * px), px, px)
      }
    }
  }
}

// 绘制街机点阵数字
function drawArcadeNum(ctx, text, x, y, px, color, align) {
  const chars = Array.from(String(text || '0'))
  let totalWidth = 0
  const charWidths = chars.map(ch => {
    if (ARCADE_GLYPHS[ch]) {
      return (ARCADE_GLYPHS[ch][0].length + 1) * px
    }
    // 汉字“万”或“亿”宽度
    return 11 * px
  })

  totalWidth = charWidths.reduce((a, b) => a + b, 0)
  let curX = align === 'right' ? x - totalWidth : align === 'center' ? x - totalWidth / 2 : x

  chars.forEach((ch, idx) => {
    if (ARCADE_GLYPHS[ch]) {
      drawBitmap(ctx, ARCADE_GLYPHS[ch], curX, y, px, color)
    } else {
      // 汉字单位平滑微缩排版
      ctx.fillStyle = color
      ctx.font = `900 ${Math.round(7 * px)}px -apple-system, sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(ch, curX, y)
    }
    curX += charWidths[idx]
  })
}

// 绘制切角复古像素容器 (Pixel Chamfer Box)
function drawPixelPanel(ctx, x, y, w, h, bg, border, highlight) {
  // 切掉4个角的像素阶梯 (cut = 2px)
  ctx.fillStyle = border
  ctx.fillRect(x + 2, y, w - 4, h)
  ctx.fillRect(x, y + 2, w, h - 4)
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2)

  // 内部底色
  ctx.fillStyle = bg
  ctx.fillRect(x + 3, y + 1, w - 6, h - 2)
  ctx.fillRect(x + 1, y + 3, w - 2, h - 6)
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4)

  if (highlight) {
    // 顶部与左侧像素高光条 (模拟街机立体按键浮雕)
    ctx.fillStyle = highlight
    ctx.fillRect(x + 3, y + 1, w - 6, 1)
    ctx.fillRect(x + 1, y + 3, 1, h - 6)
  }
}

Card({
  // ---- 主播端面板调用接口 ----

  getState() {
    const ranked = getSortedViewers(this.viewers)
    const goal = calcGoal(this.goalMode, this.totalLikes)
    return {
      totalLikes: this.totalLikes,
      goalMode: this.goalMode,
      target: goal.target,
      level: goal.level,
      remaining: goal.remaining,
      viewerCount: ranked.length,
      topLeader: ranked[0] || null,
      board: ranked.slice(0, 6).map((v, i) => ({ ...v, rank: i + 1 })),
      subscription: this.subscription,
    }
  },

  setGoalMode(mode) {
    this.goalMode = mode === 'auto' ? 'auto' : Math.max(1, Math.floor(Number(mode) || 10000))
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
    messages.forEach(msg => this.applyLike(msg))
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

    const id = message.sec_open_id || message.nickname || 'guest'
    const viewer = this.viewers.get(id) || { id, name: '', likes: 0 }
    viewer.name = (message.nickname || viewer.name || '神秘玩家').trim()
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
      if (typeof this.onStateChange === 'function') {
        this.onStateChange(this.getState())
      }
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
      fail: err => {
        console.error('[喜鹊] 消息通道订阅失败:', err)
        this.subscription = attempt < 4 ? 'retrying' : 'failed'
        this.scheduleFlush()
        if (attempt < 4) setTimeout(() => this.subscribe(attempt + 1), 1000 * Math.pow(2, attempt))
      },
    })
  },

  // ---- 街机 Canvas 绘制引擎 ----

  draw() {
    const { ctx } = this
    const scale = this.cardWidth / DESIGN_WIDTH
    const height = this.cardHeight / scale
    const state = this.getState()

    ctx.save()
    ctx.setTransform(this.pixelRatio * scale, 0, 0, this.pixelRatio * scale, 0, 0)
    ctx.clearRect(0, 0, DESIGN_WIDTH, height)

    // 1. 街机机壳主边框 (150 × 96)
    this.drawArcadeChassis(DESIGN_WIDTH, height)

    // 2. 上部：集气充能冲关模块 (y: 6 ~ 48)
    this.drawArcadeStage(state)

    // 3. 下部：MVP 榜首擂台 (y: 50 ~ 90)
    this.drawArcadeMVP(state)

    ctx.restore()
  },

  // 街机机壳与双层像素浮雕
  drawArcadeChassis(w, h) {
    const { ctx } = this

    // 最外层硬核街机底座
    drawPixelPanel(ctx, 0, 0, w, h, ARCADE.chassis, ARCADE.bezelDark, ARCADE.bezelLight)

    // 内嵌像素屏幕凹槽
    drawPixelPanel(ctx, 4, 4, w - 8, h - 8, ARCADE.screenBg, ARCADE.innerBorder, null)
  },

  // 上部：街机关卡与 10 段式能量管 (y: 6 ~ 48)
  drawArcadeStage(state) {
    const { ctx } = this
    const progress = Math.min(1, state.totalLikes / (state.target || 1))

    // 1. 关卡徽章：[ STAGE 02 ] 像素卡槽
    const stageStr = state.goalMode === 'auto' ? `STAGE ${String(state.level).padStart(2, '0')}` : 'STAGE BOSS'
    ctx.fillStyle = ARCADE.chassis
    ctx.fillRect(8, 8, 54, 11)
    ctx.fillStyle = ARCADE.cyan
    ctx.fillRect(8, 8, 2, 11) // 蓝条指示标

    ctx.fillStyle = ARCADE.cyan
    ctx.font = '900 8px -apple-system, monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(stageStr, 13, 13.5)

    // 右侧大号计分板数字 (SCORE: 5.2万)
    drawArcadeNum(ctx, formatCount(state.totalLikes), 141, 9, 1.2, ARCADE.coral, 'right')

    // 2. 街机 10 格分段能量槽 (The 10-Segment Energy Gauge)
    const gaugeX = 8
    const gaugeY = 22
    const totalBlocks = 10
    const blockW = 11.5
    const blockGap = 1.8
    const blockH = 7
    const litCount = Math.round(progress * totalBlocks)

    // 槽底座外框
    ctx.fillStyle = ARCADE.gaugeSlot
    ctx.fillRect(gaugeX - 1, gaugeY - 1, (blockW + blockGap) * totalBlocks - blockGap + 2, blockH + 2)

    for (let i = 0; i < totalBlocks; i++) {
      const bx = gaugeX + i * (blockW + blockGap)
      const isLit = i < litCount

      if (isLit) {
        // 点亮状态：从粉红到街机金的蓄力光色
        ctx.fillStyle = i >= 8 ? ARCADE.gold : ARCADE.coral
        ctx.fillRect(bx, gaugeY, blockW, blockH)
        // 像素发光高光头
        ctx.fillStyle = i >= 8 ? ARCADE.goldLight : ARCADE.coralLight
        ctx.fillRect(bx, gaugeY, blockW, 1.5)
      } else {
        // 未充能状态：街机暗槽网格
        ctx.fillStyle = ARCADE.gaugeGrid
        ctx.fillRect(bx, gaugeY, blockW, blockH)
        ctx.fillStyle = ARCADE.screenBg
        ctx.fillRect(bx + 1, gaugeY + 1, blockW - 2, blockH - 2)
      }
    }

    // 3. 破关差额指示 (y: 33)
    drawBitmap(ctx, ICON_BOLT, 8, 33, 1, ARCADE.gold)

    ctx.font = 'bold 8.5px -apple-system, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    if (state.remaining > 0) {
      ctx.fillStyle = ARCADE.textMuted
      ctx.fillText('距破关还差', 16, 36.5)
      ctx.fillStyle = ARCADE.coral
      ctx.fillText(`${formatCount(state.remaining)} 赞`, 60, 36.5)
    } else {
      ctx.fillStyle = ARCADE.mint
      ctx.fillText('STAGE CLEAR! 突破晋级', 16, 36.5)
    }

    // 右侧百分比
    drawArcadeNum(ctx, `${Math.floor(progress * 100)}%`, 141, 33.5, 0.9, ARCADE.textWhite, 'right')

    // 4. 像素打孔分割线 (y: 44)
    ctx.fillStyle = ARCADE.divider
    for (let x = 8; x < 142; x += 4) {
      ctx.fillRect(x, 44, 2, 1)
    }
  },

  // 下部：MVP 榜首擂台 (y: 48 ~ 88)
  drawArcadeMVP(state) {
    const { ctx } = this
    const leader = state.topLeader

    // MVP 展台底座
    const mvpX = 8
    const mvpY = 48
    const mvpW = 134
    const mvpH = 38

    drawPixelPanel(
      ctx,
      mvpX,
      mvpY,
      mvpW,
      mvpH,
      leader ? ARCADE.chassis : 'rgba(15, 18, 29, 0.6)',
      leader ? ARCADE.gold : ARCADE.innerBorder,
      leader ? 'rgba(255, 184, 0, 0.4)' : null
    )

    // 场景 A：已有擂主大哥
    if (leader) {
      // 像素皇冠 (左上角)
      drawBitmap(ctx, ICON_CROWN, 13, 53, 1.2, ARCADE.gold)

      // 像素头像色块框
      const avX = 26
      const avY = 54
      const avSize = 13
      ctx.fillStyle = getAvatarColor(leader.id)
      ctx.fillRect(avX, avY, avSize, avSize)
      // 头像内部字
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 8.5px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(Array.from(leader.name || '?')[0] || '?', avX + avSize / 2, avY + avSize / 2)

      // 玩家昵称 (街机字体)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle = ARCADE.textWhite
      ctx.font = 'bold 9.5px -apple-system, sans-serif'
      let name = leader.name || '神秘玩家'
      if (ctx.measureText(name).width > 54) {
        const chars = Array.from(name)
        while (chars.length && ctx.measureText(`${chars.join('')}…`).width > 54) chars.pop()
        name = `${chars.join('')}…`
      }
      ctx.fillText(name, 43, 54)

      // 贡献数点阵
      ctx.fillStyle = ARCADE.gold
      ctx.font = 'bold 8.5px -apple-system, sans-serif'
      ctx.fillText('贡献', 43, 67)
      drawArcadeNum(ctx, formatCount(leader.likes), 64, 66.5, 0.9, ARCADE.gold, 'left')

      // 右侧街机打榜按键 [ 抢榜 ]
      ctx.fillStyle = ARCADE.coral
      ctx.fillRect(108, 56, 28, 14)
      ctx.fillStyle = ARCADE.coralLight
      ctx.fillRect(108, 56, 28, 1)

      ctx.fillStyle = '#FFFFFF'
      ctx.font = '900 8px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('抢擂 >', 122, 63)

      // 底部激励微文案
      ctx.fillStyle = ARCADE.textMuted
      ctx.font = '7.5px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('双击连击 · 冲刺本场 MVP 👑', 75, 79)
      return
    }

    // 场景 B：暂无擂主 (虚位以待，强号召)
    drawBitmap(ctx, ICON_HEART, 16, 58, 1.2, ARCADE.coral)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = ARCADE.gold
    ctx.font = '900 9.5px -apple-system, sans-serif'
    ctx.fillText('擂主虚位以待', 30, 56)

    ctx.fillStyle = ARCADE.textMuted
    ctx.font = '8.5px -apple-system, sans-serif'
    ctx.fillText('狂按屏幕连击 · 抢先登顶 MVP', 30, 69)
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
