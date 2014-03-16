;(function() {
// Made with FabricJS. Source : http://fabricjs.com/freedrawing/

var $ = function(id){ return document.getElementById(id) }

var drawingColorEl = $('drawing-color')
  , drawingLineWidthEl = $('drawing-line-width')
  , clearEl = $('clear-canvas')
  , drawingModeSelectorEl = $('drawing-mode-selector')

var canvas, drawingMode

canvas = window.fabricCanvas = new fabric.Canvas('c', { isDrawingMode: true, backgroundColor: 'white' })
canvas.freeDrawingBrush.color = drawingColorEl.value
canvas.freeDrawingBrush.width = parseInt(drawingLineWidthEl.value, 10) || 1

var setDrawingMode = function() {
  canvas.freeDrawingBrush = new fabric[drawingMode](canvas)
  canvas.freeDrawingBrush.color = drawingColorEl.value
  canvas.freeDrawingBrush.width = parseInt(drawingLineWidthEl.value, 10) || 1
}

fabric.Object.prototype.transparentCorners = false

clearEl.onclick = function() { canvas.clear() }

drawingModeSelectorEl.onchange = function() {
  drawingMode = this.value + 'Brush'
  setDrawingMode()
}

drawingColorEl.onchange = function() {
  canvas.freeDrawingBrush.color = this.value
}

drawingLineWidthEl.onchange = function() {
  canvas.freeDrawingBrush.width = parseInt(this.value, 10) || 1
  this.previousSibling.innerHTML = this.value
}

})()