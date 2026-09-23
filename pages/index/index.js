const app = getApp()

Page({
  data: {
  },
  onLoad() {
    tt.createLiveCard({
      url: '/live-card/game',
      width: 130,
      height: 160,
      success: () => {
        console.info('Live card created!');
      },
      fail: (errMsg) => {
        console.error('Live card create failed:!', errMsg);
      },
    })
  }
})
