// Host-facing panel: configure like goals, monitor real-time stats and leaderboard,
// and control live card visibility and lifecycle.

const CARD_RATIO = 88 / 150
const CARD_MAX_WIDTH = 150

const GOAL_OPTIONS = [
  { label: '自动升级', value: 'auto', tag: '推荐' },
  { label: '1万', value: 10000 },
  { label: '10万', value: 100000 },
  { label: '50万', value: 500000 },
  { label: '100万', value: 1000000 },
]

const SAMPLE_BOARD = [
  { id: 'a', name: '清风徐来', likes: 12000, rank: 1 },
  { id: 'b', name: '星空漫步', likes: 8640, rank: 2 },
  { id: 'c', name: '快乐小狗', likes: 5210, rank: 3 },
  { id: 'd', name: '月下独酌', likes: 3102, rank: 4 },
  { id: 'e', name: '小橘子', likes: 2877, rank: 5 },
  { id: 'f', name: '路过的风', likes: 1, rank: 128, isLast: true, gap: true },
]

const AVATAR_COLORS = [
  '#f43f5e', '#ec4899', '#8b5cf6', '#6366f1',
  '#3b82f6', '#06b6d4', '#10b981', '#f59e0b',
]

function formatCount(value) {
  if (value >= 100000000) return `${trimDecimal(value / 100000000)}亿`
  if (value >= 10000) return `${trimDecimal(value / 10000)}万`
  return String(value || 0)
}

function trimDecimal(value) {
  return value.toFixed(1).replace(/\.0$/, '')
}

function colorForId(id) {
  let hash = 0
  for (let i = 0; i < (id || '').length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function boardView(board) {
  return (board || []).map(row => ({
    ...row,
    initial: Array.from(row.name || '?')[0] || '?',
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
    totalLikes: 0,
    totalText: '0',
    target: 1000,
    targetText: '1千',
    percent: 0,
    litSegments: 0,
    segments: Array.from({ length: 8 }, (_, i) => i),
    level: 0,
    viewerCount: 0,
    board: [],
    sampleBoard: boardView(SAMPLE_BOARD),
    sampleTop3: boardView(SAMPLE_BOARD.slice(0, 3)),
    subscription: 'connecting',
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer)
  },

  // ---- Goal Config ----

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
      tt.showToast({ title: '请输入大于 0 的有效数字', icon: 'none' })
      return
    }
    this.applyGoal(value)
    this.setData({ customGoal: '' })
  },

  applyGoal(mode) {
    this.setData({ goalMode: mode, editingGoal: false })
    if (this.card) {
      this.card.setGoalMode(mode)
      tt.showToast({ title: '目标已更新', icon: 'success' })
    }
  },

  toggleGoalEditor() {
    this.setData({ editingGoal: !this.data.editingGoal })
  },

  // ---- Card Lifecycle ----

  startGame() {
    tt.showLoading({ title: '开启中...' })
    tt.getLiveRoomCardInfo({
      success: ({ liveCardMaxWidth, liveCardMaxHeight }) => {
        tt.hideLoading()
        this.createCard(liveCardMaxWidth, liveCardMaxHeight)
      },
      fail: error => {
        tt.hideLoading()
        console.error('getLiveRoomCardInfo failed:', error)
        this.createCard(CARD_MAX_WIDTH, CARD_MAX_WIDTH * CARD_RATIO)
      },
    })
  },

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
        tt.showToast({ title: '玩法已开启', icon: 'success' })
      },
      fail: error => {
        console.error('createLiveCard failed:', error)
        tt.showToast({ title: '开启卡片失败，请重试', icon: 'none' })
      },
    })
  },

  toggleCardVisible() {
    if (!this.card) return
    const hide = !this.data.cardHidden
    const done = () => {
      this.setData({ cardHidden: hide })
      tt.showToast({ title: hide ? '卡片已隐藏' : '卡片已展示', icon: 'none' })
    }
    if (hide) {
      this.card.hide({ success: done, fail: () => tt.showToast({ title: '操作失败', icon: 'none' }) })
    } else {
      this.card.show({ success: done, fail: () => tt.showToast({ title: '操作失败', icon: 'none' }) })
    }
  },

  resetSession() {
    tt.showModal({
      title: '重置本场数据',
      content: '重置后点赞数及点赞榜将立即清零，确定清空吗？',
      confirmColor: '#ff4d6d',
      success: ({ confirm }) => {
        if (confirm && this.card) {
          this.card.resetSession()
          tt.showToast({ title: '数据已清零', icon: 'success' })
        }
      },
    })
  },

  closeGame() {
    tt.showModal({
      title: '结束互动玩法',
      content: '确定结束并移除直播间卡片吗？本场数据将不会保留。',
      confirmColor: '#ff4d6d',
      success: ({ confirm }) => {
        if (confirm) {
          if (this.timer) clearInterval(this.timer)
          tt.exitMiniProgram({ isFullExit: true })
        }
      },
    })
  },

  // ---- State & Time Sync ----

  renderState(state) {
    if (!state) return
    const progress = Math.min(1, (state.totalLikes || 0) / (state.target || 1))
    this.setData({
      totalLikes: state.totalLikes || 0,
      totalText: formatCount(state.totalLikes),
      target: state.target || 1000,
      targetText: formatCount(state.target),
      percent: Math.floor(progress * 100),
      litSegments: Math.round(progress * 8),
      level: state.level || 0,
      viewerCount: state.viewerCount || 0,
      board: boardView(state.board),
      subscription: state.subscription || 'connected',
    })
  },

  tickElapsed() {
    const seconds = Math.floor((Date.now() - this.startedAt) / 1000)
    this.setData({
      elapsed: `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`,
    })
  },
})
