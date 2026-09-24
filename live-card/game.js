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
    if (!canvas || !ctx) return

    const width = canvas.width
    const height = canvas.height
    const scaleX = width / 220
    const scaleY = height / 160
    const cardWidth = 220
    const cardHeight = 160

    ctx.save()
    ctx.scale(scaleX, scaleY)
    ctx.clearRect(0, 0, cardWidth, cardHeight)

    // The host owns the rounded card frame; paint a translucent full-bleed
    // backdrop so its corners stay visible and no second frame is introduced.
    ctx.fillStyle = 'rgba(16, 18, 24, 0.82)'
    ctx.fillRect(0, 0, cardWidth, cardHeight)

    // Header: one warm live pulse plus restrained brand signature.
    ctx.fillStyle = 'rgba(255, 77, 94, 0.16)'
    ctx.beginPath()
    ctx.arc(18, 19, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ff5368'
    ctx.beginPath()
    ctx.arc(18, 19, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.font = '600 10px sans-serif'
    ctx.fillText('直播热度', 31, 22)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('喜鹊 LIVE', 207, 22)
    ctx.textAlign = 'left'

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(13, 36)
    ctx.lineTo(207, 36)
    ctx.stroke()

    // Open circular meter frames the number as a live pulse, not a table cell.
    const cx = 110
    const cy = 88
    const radius = 35
    ctx.beginPath()
    ctx.arc(cx, cy, radius, -Math.PI * 0.78, Math.PI * 0.78)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.stroke()
    const pulse = Math.min(0.72, 0.16 + Math.log10(Number(metrics.interactionCount || 0) + 1) * 0.17)
    ctx.beginPath()
    ctx.arc(cx, cy, radius, -Math.PI * 0.78, -Math.PI * 0.78 + Math.PI * 1.56 * pulse)
    const arc = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy)
    arc.addColorStop(0, '#ff596e')
    arc.addColorStop(1, '#ffc17a')
    ctx.strokeStyle = arc
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.stroke()

    // The live interaction total is the single focal point.
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 27px sans-serif'
    ctx.fillText(Number(metrics.interactionCount || 0).toLocaleString('zh-CN'), cx, 90)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.58)'
    ctx.font = '9px sans-serif'
    ctx.fillText('本场互动', cx, 103)
    ctx.textAlign = 'left'

    // Bottom heartbeat: heart beats and likes stay secondary to the headline.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.065)'
    ctx.beginPath()
    ctx.roundRect(12, 126, 196, 22, 11)
    ctx.fill()
    ctx.fillStyle = '#ff7183'
    ctx.font = '11px sans-serif'
    ctx.fillText('♥', 21, 141)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.56)'
    ctx.font = '9px sans-serif'
    ctx.fillText('点赞', 38, 140)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.font = '600 10px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(Number(metrics.likeCount || 0).toLocaleString('zh-CN'), 198, 140)
    ctx.textAlign = 'left'

    ctx.restore()
  },

  created: function () {
    this.canvas = this.getCanvas()
    this.ctx = this.canvas.getContext('2d')
    this.metrics = {
      likeCount: 0,
      interactionCount: 0,
    }
    this.subscriptionState = 'connecting'
    this.canvas.width = 440
    this.canvas.height = 320
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
