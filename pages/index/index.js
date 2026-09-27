// Host-facing panel: configure the like goal, start/stop the live card,
// and watch the same leaderboard the audience sees.

// Must match the design size in live-card/game.js (150 × 88).
const CARD_RATIO = 88 / 150
const CARD_MAX_WIDTH = 150
const GOAL_OPTIONS = [
  { label: '自动升级', value: 'auto' },
  { label: '1万', value: 10000 },
  { label: '10万', value: 100000 },
  { label: '100万', value: 1000000 },
]
const SAMPLE_BOARD = [
  { id: 'a', name: '清风徐来', likes: 12000, rank: 1 },
  { id: 'b', name: '星空漫步', likes: 8640, rank: 2 },
  { id: 'c', name: '快乐小狗', likes: 5210, rank: 3 },
  { id: 'd', name: '月下独酌', likes: 3102, rank: 4 },
  { id: 'e', name: '小橘子', likes: 2877, rank: 5 },
  { id: 'f', name: '阿木', likes: 1950, rank: 6 },
  { id: 'g', name: '路过的风', likes: 1, rank: 128, isLast: true, gap: true },
]
const AVATAR_COLORS = ['#e05a84', '#4f7be0', '#4fae62', '#9a5ee0', '#e0913f', '#2fb3c9', '#d4569f', '#6c7ee8']

function formatCount(value) {
  if (value >= 100000000) return `${trimDecimal(value / 100000000)}亿`
  if (value >= 10000) return `${trimDecimal(value / 10000)}万`
  return String(value)
}

function trimDecimal(value) {
  return value.toFixed(1).replace(/\.0$/, '')
}

function colorForId(id) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function boardView(board) {
  return board.map(row => ({
    ...row,
    initial: Array.from(row.name)[0] || '?',
    color: colorForId(row.id),
    likesText: formatCount(row.likes),
    medal: row.rank <= 3 && !row.isLast ? row.rank : 0,
  }))
}

function pad(value) {
  return String(value).padStart(2, '0')
}

Page({
  data: {
    running: false,
    cardHidden: false,
    editingGoal: false,
    goalOptions: GOAL_OPTIONS,
    goalMode: 'auto',
    customGoal: '',
    elapsed: '00:00:00',
    totalText: '0',
    targetText: '1千',
    percent: 0,
    litSegments: 0,
    segments: Array.from({ length: 12 }, (_, i) => i),
    level: 0,
    board: [],
    sampleBoard: boardView(SAMPLE_BOARD),
    subscription: 'connecting',
  },

  onUnload() {
    clearInterval(this.timer)
  },

  // ---- goal config ----

  selectGoal(event) {
    const value = event.currentTarget.dataset.value
    this.applyGoal(value === 'auto' ? 'auto' : Number(value))
  },

  inputCustomGoal(event) {
    this.setData({ customGoal: event.detail.value })
  },

  confirmCustomGoal() {
    const value = Math.floor(Number(this.data.customGoal))
    if (!value || value < 1) {
      tt.showToast({ title: '请输入大于 0 的数字', icon: 'none' })
      return
    }
    this.applyGoal(value)
  },

  applyGoal(mode) {
    this.setData({ goalMode: mode, editingGoal: false })
    if (this.card) this.card.setGoalMode(mode)
  },

  toggleGoalEditor() {
    this.setData({ editingGoal: !this.data.editingGoal })
  },

  // ---- card lifecycle ----

  startGame() {
    tt.getLiveRoomCardInfo({
      success: ({ liveCardMaxWidth, liveCardMaxHeight }) => this.createCard(liveCardMaxWidth, liveCardMaxHeight),
      fail: error => {
        console.error('getLiveRoomCardInfo failed:', error)
        this.createCard(CARD_MAX_WIDTH, CARD_MAX_WIDTH * CARD_RATIO)
      },
    })
  },

  // Largest card with the design aspect ratio that fits the host's limits.
  createCard(maxWidth, maxHeight) {
    const width = Math.floor(Math.min(CARD_MAX_WIDTH, maxWidth || CARD_MAX_WIDTH, (maxHeight || Infinity) / CARD_RATIO))
    const height = Math.floor(Math.min(maxHeight || Infinity, width * CARD_RATIO))
    tt.createLiveCard({
      url: '/live-card/game',
      width,
      height,
      success: ({ cardContext }) => {
        this.card = cardContext
        cardContext.onStateChange = state => this.renderState(state)
        cardContext.setGoalMode(this.data.goalMode)
        this.startedAt = Date.now()
        this.timer = setInterval(() => this.tickElapsed(), 1000)
        this.setData({ running: true, cardHidden: false, elapsed: '00:00:00' })
        this.renderState(cardContext.getState())
      },
      fail: error => {
        console.error('createLiveCard failed:', error)
        tt.showToast({ title: '开启失败，请重试', icon: 'none' })
      },
    })
  },

  toggleCardVisible() {
    if (!this.card) return
    const hide = !this.data.cardHidden
    const done = () => this.setData({ cardHidden: hide })
    if (hide) this.card.hide({ success: done })
    else this.card.show({ success: done })
  },

  resetSession() {
    tt.showModal({
      title: '重置本场数据',
      content: '点赞数和点赞榜将清零，确定吗？',
      success: ({ confirm }) => {
        if (confirm && this.card) this.card.resetSession()
      },
    })
  },

  closeGame() {
    tt.showModal({
      title: '关闭玩法',
      content: '关闭后卡片从直播间移除，本场数据不会保留。',
      success: ({ confirm }) => {
        if (confirm) tt.exitMiniProgram({ isFullExit: true })
      },
    })
  },

  // ---- rendering ----

  renderState(state) {
    const progress = Math.min(1, state.totalLikes / state.target)
    this.setData({
      totalText: formatCount(state.totalLikes),
      targetText: formatCount(state.target),
      percent: Math.floor(progress * 100),
      litSegments: Math.round(progress * 12),
      level: state.level,
      board: boardView(state.board),
      subscription: state.subscription,
    })
  },

  tickElapsed() {
    const seconds = Math.floor((Date.now() - this.startedAt) / 1000)
    this.setData({
      elapsed: `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`,
    })
  },
})
