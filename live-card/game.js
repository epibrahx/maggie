Card({
  getMetrics() {
    return this.metrics
  },

  getSubscriptionState() {
    return this.subscriptionState
  },

  setSubscriptionState(state) {
    this.subscriptionState = state
    if (typeof this.onConnectionChange === 'function') {
      this.onConnectionChange(state === 'connected')
    }
  },

  handleLiveMessages(payload) {
    const messages = Array.isArray(payload) ? payload : [payload]

    messages.forEach(message => {
      const likes = Number(message._like_num_ || 0)
      const gifts = Number(message._gift_num_ || 0)
      const comments = message._content_ ? 1 : 0
      const follows = message._use_follow_action_ === 1 ? 1 : 0
      const fansclubActions = message._fansclub_reason_type_ ? 1 : 0

      this.metrics.likeCount += likes
      this.metrics.interactionCount += likes + gifts + comments + follows + fansclubActions
    })

    this.draw()
    if (typeof this.onLiveData === 'function') {
      this.onLiveData(this.getMetrics())
    }
  },

  draw() {
    const { canvas, ctx, metrics } = this

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#221b4f'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#6f5be7'
    ctx.fillRect(0, 0, canvas.width, 58)
    ctx.fillStyle = '#ff98aa'
    ctx.beginPath()
    ctx.arc(18, 20, 5, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 15px sans-serif'
    ctx.fillText('喜鹊 · 直播间', 30, 25)
    ctx.font = '11px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,.75)'
    ctx.fillText('LIVE INTERACTION', 30, 43)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 25px sans-serif'
    ctx.fillText(String(metrics.interactionCount), 18, 94)
    ctx.font = '11px sans-serif'
    ctx.fillStyle = '#bdb5ff'
    ctx.fillText('实时互动', 20, 112)

    ctx.fillStyle = '#372d70'
    ctx.fillRect(18, 127, canvas.width - 36, 1)
    ctx.fillStyle = '#ffffff'
    ctx.font = '12px sans-serif'
    ctx.fillText(`点赞 ${metrics.likeCount}`, 18, 148)
  },

  created: function () {
    this.canvas = this.getCanvas()
    this.ctx = this.canvas.getContext('2d')
    this.metrics = {
      likeCount: 0,
      interactionCount: 0,
    }
    this.subscriptionState = 'connecting'
    this.draw()

    tt.subscribeLiveInteractPluginMessage({
      messageType: ['live_like', 'live_comment', 'live_gift', 'live_follow', 'live_fansclub'],
      success: () => {
        this.setSubscriptionState('connected')
        tt.onReceiveLiveInteractPluginMessage(payload => this.handleLiveMessages(payload))
      },
      fail: error => {
        this.setSubscriptionState('failed')
        console.error('Live message subscription failed:', error)
      },
    })
  },
})
