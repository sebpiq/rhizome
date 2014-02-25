// Made with FabricJS. Source : http://fabricjs.com/freedrawing/

var $ = function(id){ return document.getElementById(id) }

$('c').setAttribute('width', window.innerWidth)
$('c').setAttribute('height', window.innerWidth)

var canvas = this.__canvas = new fabric.Canvas('c', {
  isDrawingMode: true
})

fabric.Object.prototype.transparentCorners = false

var drawingColorEl = $('drawing-color'),
    drawingLineWidthEl = $('drawing-line-width'),
    clearEl = $('clear-canvas')

clearEl.onclick = function() { canvas.clear() }

if (fabric.PatternBrush) {
  var vLinePatternBrush = new fabric.PatternBrush(canvas)
  vLinePatternBrush.getPatternSrc = function() {

    var patternCanvas = fabric.document.createElement('canvas')
    patternCanvas.width = patternCanvas.height = 10
    var ctx = patternCanvas.getContext('2d')

    ctx.strokeStyle = this.color
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(0, 5)
    ctx.lineTo(10, 5)
    ctx.closePath()
    ctx.stroke()

    return patternCanvas
  }

  var hLinePatternBrush = new fabric.PatternBrush(canvas)
  hLinePatternBrush.getPatternSrc = function() {

    var patternCanvas = fabric.document.createElement('canvas')
    patternCanvas.width = patternCanvas.height = 10
    var ctx = patternCanvas.getContext('2d')

    ctx.strokeStyle = this.color
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(5, 0)
    ctx.lineTo(5, 10)
    ctx.closePath()
    ctx.stroke()

    return patternCanvas
  }

  var squarePatternBrush = new fabric.PatternBrush(canvas)
  squarePatternBrush.getPatternSrc = function() {

    var squareWidth = 10, squareDistance = 2

    var patternCanvas = fabric.document.createElement('canvas')
    patternCanvas.width = patternCanvas.height = squareWidth + squareDistance
    var ctx = patternCanvas.getContext('2d')

    ctx.fillStyle = this.color
    ctx.fillRect(0, 0, squareWidth, squareWidth)

    return patternCanvas
  }

  var diamondPatternBrush = new fabric.PatternBrush(canvas)
  diamondPatternBrush.getPatternSrc = function() {

    var squareWidth = 10, squareDistance = 5
    var patternCanvas = fabric.document.createElement('canvas')
    var rect = new fabric.Rect({
      width: squareWidth,
      height: squareWidth,
      angle: 45,
      fill: this.color
    })

    var canvasWidth = rect.getBoundingRectWidth()

    patternCanvas.width = patternCanvas.height = canvasWidth + squareDistance
    rect.set({ left: canvasWidth / 2, top: canvasWidth / 2 })

    var ctx = patternCanvas.getContext('2d')
    rect.render(ctx)

    return patternCanvas
  }
}

$('drawing-mode-selector').onchange = function() {

  if (this.value === 'hline') {
    canvas.freeDrawingBrush = vLinePatternBrush
  }
  else if (this.value === 'vline') {
    canvas.freeDrawingBrush = hLinePatternBrush
  }
  else if (this.value === 'square') {
    canvas.freeDrawingBrush = squarePatternBrush
  }
  else if (this.value === 'diamond') {
    canvas.freeDrawingBrush = diamondPatternBrush
  }
  else {
    canvas.freeDrawingBrush = new fabric[this.value + 'Brush'](canvas)
  }

  if (canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.color = drawingColorEl.value
    canvas.freeDrawingBrush.width = parseInt(drawingLineWidthEl.value, 10) || 1
  }
}

drawingColorEl.onchange = function() {
  canvas.freeDrawingBrush.color = this.value
}
drawingLineWidthEl.onchange = function() {
  canvas.freeDrawingBrush.width = parseInt(this.value, 10) || 1
  this.previousSibling.innerHTML = this.value
}
if (canvas.freeDrawingBrush) {
  canvas.freeDrawingBrush.color = drawingColorEl.value
  canvas.freeDrawingBrush.width = parseInt(drawingLineWidthEl.value, 10) || 1
}

