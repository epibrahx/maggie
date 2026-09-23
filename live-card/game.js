Card({
  created: function(options) {
    const canvas = this.getCanvas();
    const ctx = canvas.getContext('2d');

    const img = tt.createImage();
    img.src = '/live-card/placeholder.png'; 
    img.onload = function () {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
  }
})
