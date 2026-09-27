App({
  onLaunch: function () {
    console.info('Welcome!')
  },
  // 全局异常上报，统一使用 tt.reportEvent
  onError: function (err) {
    console.error('[全局异常]', err)
    if (typeof tt !== 'undefined' && tt.reportEvent) {
      tt.reportEvent({ event: 'globalError', error: err?.message, stack: err?.stack })
    }
  }
})
