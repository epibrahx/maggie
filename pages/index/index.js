// 喜鹊 · 街机点赞冲关 (Host-facing Console)
// 商业级互动控制台：配置冲关关卡、监控实时点赞推流数据、控制直播间挂件生命周期

const CARD_DESIGN_WIDTH = 150
const CARD_DESIGN_HEIGHT = 96
const CARD_RATIO = CARD_DESIGN_HEIGHT / CARD_DESIGN_WIDTH
const CARD_MAX_WIDTH = 150

const GOAL_OPTIONS = [
  { label: '智能连环关', value: 'auto', tag: '推荐' },
  { label: '1万赞', value: 10000 },
  { label: '5万赞', value: 50000 },
  { label: '10万赞', value: 100000 },
  { label: '50万赞', value: 500000 },
]

const SAMPLE_LEADERBOARD = [
  { id: 'u1', name: '清风徐来', likes: 12000, rank: 1 },
  { id: 'u2', name: '星空漫步', likes: 8640, rank: 2 },
  { id: 'u3', name: '快乐小狗', likes: 5210, rank: 3 },
  { id: 'u4', name: '月下独酌', likes: 3102, rank: 4 },
  { id: 'u5', name: '小橘子', likes: 2877, rank: 5 },
  { id: 'u6', name: '路过的风', likes: 1, rank: 128, isLast: true, gap: true },
]

const AVATAR_PALETTE = [
  '#FF3366', '#FF9900', '#FFCC00', '#00E5A3',
  '#00E5FF', '#9D4EDD', '#F72585', '#4361EE',
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

function getAvatarColor(id) {
  let hash = 0
  for (let i = 0; i < (id || '').length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

function formatBoardView(list) {
  return (list || []).map(row => ({
    ...row,
    initial: Array.from(row.name || '?')[0] || '?',
    color: getAvatarColor(row.id),
    likesText: formatCount(row.likes),
    medal: row.rank <= 3 && !row.isLast ? row.rank : 0,
  }))
}

function padZero(num) {
  return String(num).padStart(2, '0')
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
    remainingText: '1千',
    percent: 0,
    litSegments: 0,
    segments: Array.from({ length: 10 }, (_, i) => i),
    level: 1,
    viewerCount: 0,
    board: [],
    sampleBoard: formatBoardView(SAMPLE_LEADERBOARD),
    sampleMVP: formatBoardView(SAMPLE_LEADERBOARD)[0],
    subscription: 'connecting',
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer)
  },

  // ---- 冲关模式配置 ----

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
      tt.showToast({ title: '请输入有效的点赞数字', icon: 'none' })
      return
    }
    this.applyGoal(value)
    this.setData({ customGoal: '' })
  },

  applyGoal(mode) {
    this.setData({ goalMode: mode, editingGoal: false })
    if (this.card) {
      this.card.setGoalMode(mode)
      tt.showToast({ title: '关卡目标已更新', icon: 'success' })
    }
  },

  toggleGoalEditor() {
    this.setData({ editingGoal: !this.data.editingGoal })
  },

  // ---- 挂件生命周期管控 ----

  startGame() {
    tt.showLoading({ title: '正在挂载挂件...' })
    tt.getLiveRoomCardInfo({
      success: ({ liveCardMaxWidth, liveCardMaxHeight }) => {
        tt.hideLoading()
        this.createCard(liveCardMaxWidth, liveCardMaxHeight)
      },
      fail: err => {
        tt.hideLoading()
        console.error('[喜鹊] 获取房间尺寸失败:', err)
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
        tt.showToast({ title: '挂件已成功上屏', icon: 'success' })
      },
      fail: err => {
        console.error('[喜鹊] 挂件创建失败:', err)
        tt.showToast({ title: '挂件上屏失败，请重试', icon: 'none' })
      },
    })
  },

  toggleCardVisible() {
    if (!this.card) return
    const hide = !this.data.cardHidden
    const onDone = () => {
      this.setData({ cardHidden: hide })
      tt.showToast({ title: hide ? '挂件已暂时隐藏' : '挂件已恢复展示', icon: 'none' })
    }
    if (hide) {
      this.card.hide({ success: onDone, fail: () => tt.showToast({ title: '操作失败', icon: 'none' }) })
    } else {
      this.card.show({ success: onDone, fail: () => tt.showToast({ title: '操作失败', icon: 'none' }) })
    }
  },

  resetSession() {
    tt.showModal({
      title: '重置本场数据',
      content: '重置后本场点赞记录与贡献榜将清零归一，确定重置吗？',
      confirmColor: '#FF3366',
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
      title: '下架并结束玩法',
      content: '下架后挂件将从直播间移除，确定结束本场互动吗？',
      confirmColor: '#FF3366',
      success: ({ confirm }) => {
        if (confirm) {
          if (this.timer) clearInterval(this.timer)
          tt.exitMiniProgram({ isFullExit: true })
        }
      },
    })
  },

  // ---- 数据同步与计时器 ----

  renderState(state) {
    if (!state) return
    const progress = Math.min(1, (state.totalLikes || 0) / (state.target || 1))
    this.setData({
      totalLikes: state.totalLikes || 0,
      totalText: formatCount(state.totalLikes),
      target: state.target || 1000,
      targetText: formatCount(state.target),
      remainingText: formatCount(state.remaining),
      percent: Math.floor(progress * 100),
      litSegments: Math.round(progress * 10),
      level: state.level || 1,
      viewerCount: state.viewerCount || 0,
      board: formatBoardView(state.board),
      subscription: state.subscription || 'connected',
    })
  },

  tickElapsed() {
    const sec = Math.floor((Date.now() - this.startedAt) / 1000)
    this.setData({
      elapsed: `${padZero(Math.floor(sec / 3600))}:${padZero(Math.floor((sec % 3600) / 60))}:${padZero(sec % 60)}`,
    })
  },
})
