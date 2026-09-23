Page({
  data: {
    elapsedTime: '00:00:00',
    likeCount: '0',
    interactionCount: '0',
    connected: false,
  },

  onLoad() {
    this.startedAt = Date.now()
    this.updateElapsedTime()
    this.timer = setInterval(() => this.updateElapsedTime(), 1000)
    this.createLiveCard()
  },

  onUnload() {
    clearInterval(this.timer)
  },

  updateElapsedTime() {
    const seconds = Math.floor((Date.now() - this.startedAt) / 1000)
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = seconds % 60
    const pad = value => String(value).padStart(2, '0')

    this.setData({
      elapsedTime: `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`,
    })
  },

  createLiveCard() {
    tt.createLiveCard({
      url: '/live-card/game',
      width: 130,
      height: 160,
      success: ({ cardContext }) => {
        this.cardContext = cardContext
        cardContext.onLiveData = metrics => this.updateMetrics(metrics)
        cardContext.onConnectionChange = connected => this.setData({ connected })
        this.updateMetrics(cardContext.getMetrics())
        this.setData({ connected: cardContext.getSubscriptionState() === 'connected' })
      },
      fail: error => {
        console.error('Live card create failed:', error)
      },
    })
  },

  updateMetrics(metrics) {
    this.setData({
      likeCount: this.formatNumber(metrics.likeCount),
      interactionCount: this.formatNumber(metrics.interactionCount),
    })
  },

  formatNumber(value) {
    return Number(value || 0).toLocaleString('zh-CN')
  },
})
