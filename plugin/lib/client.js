// dsh-quick-image-editor — Client half (static, persistent).
//
// Watches the official composer ImageLightbox (a body portal). When the
// lightbox shows a pending draft image, this plugin mounts a quick editor:
// rotate 90° CW/CCW, crop, freehand brush, outline shapes (line / arrow /
// rectangle / ellipse / polygon, solid or dashed). Saving replaces the draft
// descriptor so the edited image is what gets sent to the model.
window.__ModuleLoader__.load({
  id: "dsh-quick-image-editor",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })

    // ------------------------------------------------------------------
    // Constants / configuration
    // ------------------------------------------------------------------
    var MAX_LONG_EDGE = 4096
    var MAX_PIXELS = 16 * 1000 * 1000
    var MAX_BYTES = 4.5 * 1024 * 1024
    var MIN_CROP = 8
    var MAX_HISTORY = 50
    var HANDLE = "n,s,e,w,ne,nw,se,sw".split(",")

    var PALETTE = [
      "#e5484d", "#f59e0b", "#facc15", "#22c55e", "#3b82f6",
      "#8b5cf6", "#111827", "#ffffff"
    ]

    var SHAPES = [
      ["line", "直线"],
      ["arrow", "箭头"],
      ["rect", "矩形"],
      ["ellipse", "圆形"],
      ["polygon", "多边形"]
    ]

    var QIE_CSS = `
.qie-root, .qie-root * { box-sizing: border-box; }
.qie-root {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 18px;
  z-index: 40;
  display: flex;
  justify-content: center;
  pointer-events: none;
  font-family: var(--dsw-font-family, inherit);
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
}
.qie-bar {
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px;
  max-width: min(96vw, 1060px);
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin, var(--dsw-alias-border-l1));
  border-radius: 14px;
  background: color-mix(in srgb, var(--dsw-specific-input-major, #1f2937) 82%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: var(--dsw-shadow-lv3, 0 10px 30px rgba(0,0,0,.35));
}
.qie-group {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  min-height: 30px;
  border-left: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.3));
}
.qie-group:first-child { border-left: none; }
.qie-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 32px;
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.35));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,.06));
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  animation: none !important;
  transition: border-color .12s ease, background-color .12s ease, opacity .12s ease;
}
.qie-btn:hover:not(:disabled) { border-color: var(--dsw-alias-brand-primary); }
.qie-btn:disabled { opacity: .38; cursor: default; }
.qie-btn.active {
  border-color: var(--dsw-alias-brand-primary);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);
  color: var(--dsw-alias-brand-primary);
}
.qie-btn.primary {
  background: var(--dsw-alias-brand-primary);
  border-color: transparent;
  color: var(--dsw-alias-bg-base, #fff);
}
.qie-btn.primary:hover:not(:disabled) { opacity: .9; border-color: transparent; }
.qie-btn.ghost { border-color: transparent; background: transparent; }
.qie-btn.dashed { min-width: auto; }
.qie-select {
  height: 30px;
  max-width: 110px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.35));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,.06));
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  padding: 0 6px;
  outline: none;
}
.qie-color {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.35));
  border-radius: 999px;
  cursor: pointer;
  animation: none !important;
}
.qie-color.active { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.qie-color-custom { width: 24px; height: 24px; padding: 0; border: none; background: transparent; cursor: pointer; }
.qie-status {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  padding: 0 4px;
}
.qie-status.error { color: var(--dsw-alias-state-error-primary); }
.qie-stage {
  position: relative;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 12px;
  background: var(--dsw-specific-input-major, #111827);
  box-shadow: var(--dsw-shadow-lv3, 0 12px 40px rgba(0,0,0,.45));
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}
.qie-stage canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}
.qie-cursor-brush { cursor: crosshair; }
.qie-cursor-crop { cursor: crosshair; }
.qie-cursor-shape { cursor: crosshair; }
`

    // ------------------------------------------------------------------
    // Small DOM / geometry helpers
    // ------------------------------------------------------------------
    function el(tag, attrs, children) {
      var node = document.createElement(tag)
      if (attrs) {
        for (var key in attrs) {
          var value = attrs[key]
          if (value === null || value === undefined || value === false) continue
          if (key === "style" && typeof value === "object") {
            for (var sk in value) node.style[sk] = value[sk]
          } else if (key.indexOf("on") === 0 && typeof value === "function") {
            node.addEventListener(key.slice(2).toLowerCase(), value)
          } else {
            node.setAttribute(key, value === true ? "" : value)
          }
        }
      }
      if (children) {
        for (var ci = 0; ci < children.length; ci++) {
          var child = children[ci]
          if (child === null || child === undefined || child === false) continue
          node.appendChild(typeof child === "string" ? document.createTextNode(child) : child)
        }
      }
      return node
    }

    function clamp(value, min, max) {
      return value < min ? min : value > max ? max : value
    }

    function cloneCommand(cmd) {
      return {
        kind: cmd.kind,
        points: cmd.points ? cmd.points.slice() : [],
        color: cmd.color,
        width: cmd.width,
        dashed: !!cmd.dashed
      }
    }

    function commandBounds(cmd) {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (var i = 0; i < cmd.points.length; i += 2) {
        var x = cmd.points[i], y = cmd.points[i + 1]
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
      return { x0: minX, y0: minY, x1: maxX, y1: maxY }
    }

    function cloneRect(r) {
      return r ? { x: r.x, y: r.y, w: r.w, h: r.h } : null
    }

    function rectFromPoints(x0, y0, x1, y1) {
      return {
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        w: Math.abs(x1 - x0),
        h: Math.abs(y1 - y0)
      }
    }

    function normalizeScale(width, height) {
      if (width < 1 || height < 1) return 1
      var scale = Math.min(1, MAX_LONG_EDGE / width, MAX_LONG_EDGE / height)
      if (width * height * scale * scale > MAX_PIXELS) {
        scale = Math.min(scale, Math.sqrt(MAX_PIXELS / (width * height)))
      }
      return scale
    }

    function fileNameToMime(name) {
      name = String(name || "").toLowerCase()
      if (/\.jpe?g$/.test(name)) return "image/jpeg"
      if (/\.webp$/.test(name)) return "image/webp"
      if (/\.gif$/.test(name)) return "image/gif"
      if (/\.png$/.test(name)) return "image/png"
      return ""
    }

    function extensionForType(type) {
      if (type === "image/jpeg") return "jpg"
      if (type === "image/webp") return "webp"
      return "png"
    }

    function editedFileName(name, type) {
      var base = String(name || "image")
      base = base.replace(/\.(png|jpe?g|webp|gif)$/i, "")
      if (!base) base = "image"
      return base + ".edited." + extensionForType(type)
    }

    function loadImageElement(url) {
      return new Promise(function (resolve, reject) {
        var img = new Image()
        img.onload = function () { resolve(img) }
        img.onerror = function () { reject(new Error("图片解码失败")) }
        img.src = url
      })
    }

    // Decode one draft File into a normalized canvas. The returned canvas is
    // both the render source and the WYSIWYG editing resolution.
    async function decodeToCanvas(file) {
      var bitmap = null
      var fallbackUrl = null
      try {
        if (typeof createImageBitmap === "function") {
          bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
        }
      } catch (err) {
        bitmap = null
      }
      if (bitmap === null) {
        fallbackUrl = URL.createObjectURL(file)
        try {
          var img = await loadImageElement(fallbackUrl)
          bitmap = await createImageBitmap(img)
        } finally {
          URL.revokeObjectURL(fallbackUrl)
          fallbackUrl = null
        }
      }
      if (bitmap === null) throw new Error("无法解码该图片")

      var width = bitmap.width
      var height = bitmap.height
      var scale = normalizeScale(width, height)
      var outW = Math.max(1, Math.round(width * scale))
      var outH = Math.max(1, Math.round(height * scale))
      var canvas = document.createElement("canvas")
      canvas.width = outW
      canvas.height = outH
      var ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = "high"
        ctx.drawImage(bitmap, 0, 0, outW, outH)
      }
      if (typeof bitmap.close === "function") {
        try { bitmap.close() } catch (err) {}
      }
      return { canvas: canvas, normalized: scale < 1 }
    }

    // ------------------------------------------------------------------
    // Command drawing
    // ------------------------------------------------------------------
    function applyStrokeStyle(ctx, cmd) {
      ctx.strokeStyle = cmd.color
      ctx.fillStyle = cmd.color
      ctx.lineWidth = cmd.width
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.setLineDash(cmd.dashed ? [Math.max(3, cmd.width * 2.5), Math.max(2, cmd.width * 1.6)] : [])
    }

    function drawCommand(ctx, cmd) {
      if (!cmd || !cmd.points || cmd.points.length < 2) return
      ctx.save()
      applyStrokeStyle(ctx, cmd)
      var pts = cmd.points
      if (cmd.kind === "stroke") {
        ctx.beginPath()
        ctx.moveTo(pts[0], pts[1])
        for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
        ctx.stroke()
      } else if (cmd.kind === "line" || cmd.kind === "arrow") {
        var x0 = pts[0], y0 = pts[1], x1 = pts[2], y1 = pts[3]
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
        if (cmd.kind === "arrow") {
          var angle = Math.atan2(y1 - y0, x1 - x0)
          var head = Math.max(10, cmd.width * 3.5)
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x1 - head * Math.cos(angle - Math.PI / 6), y1 - head * Math.sin(angle - Math.PI / 6))
          ctx.lineTo(x1 - head * Math.cos(angle + Math.PI / 6), y1 - head * Math.sin(angle + Math.PI / 6))
          ctx.closePath()
          ctx.fill()
        }
      } else if (cmd.kind === "rect") {
        var r = rectFromPoints(pts[0], pts[1], pts[2], pts[3])
        ctx.strokeRect(r.x, r.y, r.w, r.h)
      } else if (cmd.kind === "ellipse") {
        var r2 = rectFromPoints(pts[0], pts[1], pts[2], pts[3])
        ctx.beginPath()
        ctx.ellipse(r2.x + r2.w / 2, r2.y + r2.h / 2, Math.abs(r2.w / 2), Math.abs(r2.h / 2), 0, 0, Math.PI * 2)
        ctx.stroke()
      } else if (cmd.kind === "polygon") {
        ctx.beginPath()
        ctx.moveTo(pts[0], pts[1])
        for (var j = 2; j < pts.length; j += 2) ctx.lineTo(pts[j], pts[j + 1])
        ctx.closePath()
        ctx.stroke()
      }
      ctx.restore()
    }

    // ------------------------------------------------------------------
    // Editor controller for one lightbox
    // ------------------------------------------------------------------
    function createEditor(conversation, lightbox, img, attachment) {
      var disposed = false
      var statusTimer = null

      var state = {
        editing: false,
        loading: false,
        busy: false,
        ready: false,
        dirty: false,
        tool: "brush",
        shapeKind: "line",
        color: PALETTE[0],
        width: 4,
        dashed: false,
        source: null,          // normalized source canvas
        dims: { w: 1, h: 1 },
        baseOps: [],
        annotations: [],
        history: [],
        redoStack: [],
        cropRect: null,
        cropDrag: null,
        draft: null,
        polygonPts: [],
        pointer: { x: 0, y: 0 }
      }

      var root = el("div", { class: "qie-root", "data-qie-editor": "1" })
      var bar = el("div", { class: "qie-bar" })
      root.appendChild(bar)

      var stage = null
      var baseCanvas = null
      var overlayCanvas = null

      // ---------------- toolbar construction ----------------
      var status = el("span", { class: "qie-status" })
      var editBtn = qieButton("编辑图片", "进入快捷编辑", function () { enterEditing() })
      editBtn.classList.add("primary")

      var rotateCcw = qieButton("⟲", "左转 90°", function () { applyRotation(-1) })
      var rotateCw = qieButton("⟳", "右转 90°", function () { applyRotation(1) })
      var cropBtn = qieButton("裁剪", "裁剪图片", function () { setTool("crop") })
      var cropOk = qieButton("确认裁剪", "应用当前裁剪选区", function () {
        if (state.cropRect) applyCrop(state.cropRect)
      })
      cropOk.classList.add("primary")
      var cropCancel = qieButton("取消裁剪", "清除裁剪选区", function () {
        state.cropRect = null
        state.cropDrag = null
        redrawOverlay()
        updateButtons()
      })
      var cropRatio = "free"
      var cropRatioSelect = el("select", { class: "qie-select", title: "裁剪比例" })
      ;[["free", "自由"], ["1:1", "1:1"], ["4:3", "4:3"], ["16:9", "16:9"]].forEach(function (item) {
        var o = el("option", { value: item[0] }, [item[1]])
        cropRatioSelect.appendChild(o)
      })
      cropRatioSelect.addEventListener("change", function () {
        cropRatio = cropRatioSelect.value
        state.cropRect = null
        state.cropDrag = null
        redrawOverlay()
        updateButtons()
      })
      var brushBtn = qieButton("画笔", "自由画笔", function () { setTool("brush") })

      var shapeSelect = el("select", { class: "qie-select", title: "形状工具" })
      for (var si = 0; si < SHAPES.length; si++) {
        var opt = el("option", { value: SHAPES[si][0] }, [SHAPES[si][1]])
        shapeSelect.appendChild(opt)
      }
      shapeSelect.addEventListener("change", function () {
        state.shapeKind = shapeSelect.value
        state.draft = null
        state.polygonPts = []
        setTool("shape")
      })
      var dashedBtn = qieButton("虚线", "形状描边使用虚线", function () {
        state.dashed = !state.dashed
        dashedBtn.classList.toggle("active", state.dashed)
        if (state.tool === "brush") setTool("shape")
      })

      var colorGroup = el("span", { class: "qie-group" })
      var swatches = []
      for (var ci = 0; ci < PALETTE.length; ci++) {
        ;(function (color) {
          var sw = el("button", { class: "qie-color", type: "button", title: color, style: { backgroundColor: color } })
          sw.addEventListener("click", function () { setColor(color, sw) })
          swatches.push(sw)
          colorGroup.appendChild(sw)
        })(PALETTE[ci])
      }
      var customColor = el("input", { class: "qie-color-custom", type: "color", value: state.color, title: "自定义颜色" })
      customColor.addEventListener("input", function () {
        setColor(customColor.value, null)
      })
      colorGroup.appendChild(customColor)

      var widthSelect = el("select", { class: "qie-select", title: "笔宽" })
      ;[2, 4, 8, 12].forEach(function (w) {
        var o = el("option", { value: String(w) }, [String(w) + " px"])
        widthSelect.appendChild(o)
      })
      widthSelect.value = String(state.width)
      widthSelect.addEventListener("change", function () {
        state.width = parseInt(widthSelect.value, 10) || 4
      })

      var undoBtn = qieButton("撤销", "撤销", function () { undo() })
      var redoBtn = qieButton("重做", "重做", function () { redo() })
      var resetBtn = qieButton("重置", "重置为原图", function () { resetEditing() })
      var saveBtn = qieButton("保存并替换", "保存并替换待发送图片", function () { save() })
      saveBtn.classList.add("primary")
      var cancelBtn = qieButton("取消编辑", "放弃修改并退出编辑", function () { cancelEditing() })

      bar.appendChild(
        el("span", { class: "qie-group" }, [
          editBtn
        ])
      )
      bar.appendChild(
        el("span", { class: "qie-group" }, [
          rotateCcw, rotateCw, cropBtn, cropRatioSelect, cropOk, cropCancel, brushBtn
        ])
      )
      bar.appendChild(
        el("span", { class: "qie-group" }, [
          shapeSelect, dashedBtn
        ])
      )
      bar.appendChild(colorGroup)
      bar.appendChild(el("span", { class: "qie-group" }, [widthSelect]))
      bar.appendChild(
        el("span", { class: "qie-group" }, [
          undoBtn, redoBtn, resetBtn
        ])
      )
      bar.appendChild(
        el("span", { class: "qie-group" }, [
          saveBtn, cancelBtn, status
        ])
      )

      function qieButton(label, title, onClick) {
        return el("button", { class: "qie-btn", type: "button", title: title, onclick: onClick }, [label])
      }

      // ---------------- status / buttons ----------------
      function setStatus(text, isError, sticky) {
        status.textContent = text || ""
        status.classList.toggle("error", !!isError)
        if (statusTimer) clearTimeout(statusTimer)
        if (text && !isError && !sticky) {
          statusTimer = setTimeout(function () {
            if (status.textContent === text) status.textContent = ""
          }, 3200)
        }
      }

      function updateButtons() {
        var canEdit = state.ready && state.editing && !state.loading
        var canUndo = state.history.length > 0 && !state.busy
        var canRedo = state.redoStack.length > 0 && !state.busy
        rotateCcw.disabled = !canEdit || state.busy
        rotateCw.disabled = !canEdit || state.busy
        cropBtn.disabled = !canEdit || state.busy
        brushBtn.disabled = !canEdit || state.busy
        shapeSelect.disabled = !canEdit || state.busy
        dashedBtn.disabled = !canEdit || state.busy
        undoBtn.disabled = !canUndo
        redoBtn.disabled = !canRedo
        resetBtn.disabled = !canEdit || state.busy || (!state.dirty && state.history.length === 0)
        saveBtn.disabled = !canEdit || state.busy || !state.dirty
        cancelBtn.disabled = state.busy
        cropBtn.classList.toggle("active", state.tool === "crop")
        var cropActive = state.editing && state.tool === "crop" && !!state.cropRect && state.cropRect.w >= MIN_CROP && state.cropRect.h >= MIN_CROP
        cropRatioSelect.style.display = state.editing && state.tool === "crop" ? "" : "none"
        cropRatioSelect.disabled = state.busy
        cropOk.style.display = cropActive ? "inline-flex" : "none"
        cropCancel.style.display = cropActive ? "inline-flex" : "none"
        cropOk.disabled = state.busy
        cropCancel.disabled = state.busy
        brushBtn.classList.toggle("active", state.tool === "brush")
        dashedBtn.classList.toggle("active", state.dashed)
        editBtn.style.display = state.editing ? "none" : "inline-flex"
        for (var i = 0; i < swatches.length; i++) {
          swatches[i].classList.toggle("active", swatches[i].getAttribute("title") === state.color)
        }
        shapeSelect.style.display = state.editing ? "" : "none"
        if (!state.editing) {
          shapeSelect.style.display = "none"
          colorGroup.style.display = "none"
          widthSelect.style.display = "none"
          dashedBtn.style.display = "none"
          undoBtn.style.display = "none"
          redoBtn.style.display = "none"
          resetBtn.style.display = "none"
          saveBtn.style.display = "none"
          cancelBtn.style.display = "none"
          editBtn.style.display = "inline-flex"
        } else {
          shapeSelect.style.display = ""
          colorGroup.style.display = ""
          widthSelect.style.display = ""
          dashedBtn.style.display = ""
          undoBtn.style.display = ""
          redoBtn.style.display = ""
          resetBtn.style.display = ""
          saveBtn.style.display = ""
          cancelBtn.style.display = ""
          editBtn.style.display = "none"
        }
      }

      function setTool(tool) {
        if (!state.editing || state.loading || state.busy) return
        state.tool = tool
        state.cropDrag = null
        state.draft = null
        if (tool !== "crop") state.cropRect = null
        if (tool !== "shape" && tool !== "brush") {
          state.polygonPts = []
        }
        updateButtons()
        redrawOverlay()
        if (overlayCanvas) {
          overlayCanvas.classList.toggle("qie-cursor-brush", tool === "brush")
          overlayCanvas.classList.toggle("qie-cursor-crop", tool === "crop")
          overlayCanvas.classList.toggle("qie-cursor-shape", tool === "shape")
        }
      }

      function setColor(color, swatch) {
        state.color = color
        customColor.value = color
        updateButtons()
      }

      // ---------------- stage / canvases ----------------
      function ensureStage() {
        if (stage) return
        stage = el("div", { class: "qie-stage" })
        baseCanvas = el("canvas", { class: "qie-base" })
        overlayCanvas = el("canvas", { class: "qie-overlay" })
        stage.appendChild(baseCanvas)
        stage.appendChild(overlayCanvas)

        overlayCanvas.addEventListener("pointerdown", onPointerDown)
        overlayCanvas.addEventListener("pointermove", onPointerMove)
        overlayCanvas.addEventListener("pointerup", onPointerUp)
        overlayCanvas.addEventListener("pointercancel", onPointerCancel)
        overlayCanvas.addEventListener("dblclick", onDoubleClick)
      }

      function fitStage() {
        if (!stage || !state.ready) return
        var availW = Math.max(220, window.innerWidth - 96)
        var availH = Math.max(180, window.innerHeight - 190)
        var scale = Math.min(1, availW / state.dims.w, availH / state.dims.h)
        var w = Math.max(1, Math.floor(state.dims.w * scale))
        var h = Math.max(1, Math.floor(state.dims.h * scale))
        stage.style.width = w + "px"
        stage.style.height = h + "px"
      }

      function canvasPoint(event) {
        if (!overlayCanvas) return { x: 0, y: 0 }
        var rect = overlayCanvas.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) return { x: 0, y: 0 }
        var x = (event.clientX - rect.left) * state.dims.w / rect.width
        var y = (event.clientY - rect.top) * state.dims.h / rect.height
        return {
          x: clamp(x, 0, state.dims.w),
          y: clamp(y, 0, state.dims.h)
        }
      }

      // ---------------- base rendering ----------------
      function computeDims() {
        var w = state.source ? state.source.width : 1
        var h = state.source ? state.source.height : 1
        for (var i = 0; i < state.baseOps.length; i++) {
          var op = state.baseOps[i]
          if (op.type === "rotate90") {
            var t = w; w = h; h = t
          } else if (op.type === "crop") {
            w = Math.max(1, Math.round(op.rect.w))
            h = Math.max(1, Math.round(op.rect.h))
          }
        }
        return { w: w, h: h }
      }

      function rebuildBase() {
        if (!state.source) return
        var dims = computeDims()
        state.dims = dims
        if (!baseCanvas) ensureStage()
        baseCanvas.width = dims.w
        baseCanvas.height = dims.h
        overlayCanvas.width = dims.w
        overlayCanvas.height = dims.h

        var bctx = baseCanvas.getContext("2d")
        var current = state.source
        for (var i = 0; i < state.baseOps.length; i++) {
          var op = state.baseOps[i]
          var next = document.createElement("canvas")
          if (op.type === "rotate90") {
            next.width = current.height
            next.height = current.width
            var rctx = next.getContext("2d")
            rctx.save()
            if (op.dir === 1) {
              rctx.translate(next.width, 0)
              rctx.rotate(Math.PI / 2)
            } else {
              rctx.translate(0, next.height)
              rctx.rotate(-Math.PI / 2)
            }
            rctx.drawImage(current, 0, 0)
            rctx.restore()
          } else if (op.type === "crop") {
            var r = op.rect
            next.width = Math.max(1, Math.round(r.w))
            next.height = Math.max(1, Math.round(r.h))
            var cctx = next.getContext("2d")
            cctx.drawImage(current, r.x, r.y, r.w, r.h, 0, 0, next.width, next.height)
          }
          if (current !== state.source) {
            current.width = 0
            current.height = 0
          }
          current = next
        }
        bctx.clearRect(0, 0, dims.w, dims.h)
        bctx.drawImage(current, 0, 0)
        if (current !== state.source) {
          current.width = 0
          current.height = 0
        }
        fitStage()
        redrawOverlay()
      }

      // ---------------- overlay rendering ----------------
      function redrawOverlay() {
        if (!overlayCanvas) return
        var ctx = overlayCanvas.getContext("2d")
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        for (var i = 0; i < state.annotations.length; i++) {
          drawCommand(ctx, state.annotations[i])
        }
        drawDraft(ctx)
        if (state.tool === "crop" && state.cropRect) {
          drawCropUI(ctx, state.cropRect)
        }
      }

      function drawDraft(ctx) {
        if (state.tool === "polygon" || state.tool === "shape" || state.tool === "brush") {
          // handled below
        }
        if (state.polygonPts.length > 0) {
          var poly = {
            kind: "polygon",
            points: state.polygonPts.concat(state.pointer.x, state.pointer.y),
            color: state.color,
            width: state.width,
            dashed: state.dashed
          }
          if (state.polygonPts.length >= 4) {
            var closePoly = {
              kind: "polygon",
              points: state.polygonPts.concat(state.pointer.x, state.pointer.y),
              color: state.color,
              width: state.width,
              dashed: state.dashed
            }
            ctx.save()
            ctx.globalAlpha = 0.45
            drawCommand(ctx, closePoly)
            ctx.restore()
          } else {
            ctx.save()
            ctx.globalAlpha = 0.6
            drawCommand(ctx, poly)
            ctx.restore()
          }
        } else if (state.draft) {
          ctx.save()
          ctx.globalAlpha = 0.75
          drawCommand(ctx, state.draft)
          ctx.restore()
        }
      }

      function drawCropUI(ctx, r) {
        if (!r || r.w < 1 || r.h < 1) return
        ctx.save()
        ctx.fillStyle = "rgba(0,0,0,0.45)"
        ctx.beginPath()
        ctx.rect(0, 0, state.dims.w, state.dims.h)
        ctx.rect(r.x, r.y, r.w, r.h)
        ctx.fill("evenodd")
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = Math.max(1, state.width / 2)
        ctx.setLineDash([8, 5])
        ctx.strokeRect(r.x, r.y, r.w, r.h)
        ctx.setLineDash([])
        var handleSize = Math.max(6, 8 * state.dims.w / (stage.clientWidth || 1))
        ctx.fillStyle = "#ffffff"
        for (var i = 0; i < HANDLE.length; i++) {
          var p = cropHandlePoint(r, HANDLE[i])
          ctx.fillRect(p.x - handleSize / 2, p.y - handleSize / 2, handleSize, handleSize)
        }
        ctx.restore()
      }

      function cropHandlePoint(r, handle) {
        var mx = r.x + r.w / 2
        var my = r.y + r.h / 2
        if (handle.indexOf("w") >= 0) var x = r.x
        else if (handle.indexOf("e") >= 0) var x = r.x + r.w
        else var x = mx
        if (handle.indexOf("n") >= 0) var y = r.y
        else if (handle.indexOf("s") >= 0) var y = r.y + r.h
        else var y = my
        return { x: x, y: y }
      }

      function cropHandleAt(p) {
        if (!state.cropRect) return null
        var threshold = Math.max(8, 10 * state.dims.w / (stage.clientWidth || 1))
        for (var i = 0; i < HANDLE.length; i++) {
          var hp = cropHandlePoint(state.cropRect, HANDLE[i])
          if (Math.abs(p.x - hp.x) <= threshold && Math.abs(p.y - hp.y) <= threshold) return HANDLE[i]
        }
        return null
      }

      // ---------------- history / operations ----------------
      function pushHistory(entry) {
        state.history.push(entry)
        if (state.history.length > MAX_HISTORY) state.history.shift()
      }

      function markDirty() {
        state.dirty = true
        updateButtons()
      }

      function applyRotation(dir) {
        if (!state.ready || state.editing === false || state.busy) return
        state.cropRect = null
        state.cropDrag = null
        state.draft = null
        state.polygonPts = []
        var op = { type: "rotate90", dir: dir }
        var oldW = state.dims.w
        var oldH = state.dims.h
        var prevAnnotations = state.annotations.map(cloneCommand)
        state.baseOps.push(op)
        transformAnnotationsForOp(op, oldW, oldH)
        pushHistory({ kind: "base", op: op, prevAnnotations: prevAnnotations })
        state.redoStack.length = 0
        rebuildBase()
        markDirty()
      }

      function applyCrop(rect) {
        if (!state.ready || !rect || rect.w < MIN_CROP || rect.h < MIN_CROP) return
        var op = { type: "crop", rect: cloneRect(rect) }
        var prevAnnotations = state.annotations.map(cloneCommand)
        state.baseOps.push(op)
        transformAnnotationsForOp(op, state.dims.w, state.dims.h)
        pushHistory({ kind: "base", op: op, prevAnnotations: prevAnnotations })
        state.redoStack.length = 0
        state.cropRect = null
        state.cropDrag = null
        state.tool = "brush"
        if (overlayCanvas) {
          overlayCanvas.classList.remove("qie-cursor-crop")
          overlayCanvas.classList.add("qie-cursor-brush")
        }
        rebuildBase()
        markDirty()
      }

      // Transform vector commands when a base op is applied. Crop also drops
      // commands that ended up entirely outside the new canvas.
      function transformAnnotationsForOp(op, oldW, oldH) {
        var next = []
        for (var i = 0; i < state.annotations.length; i++) {
          var cmd = state.annotations[i]
          if (op.type === "rotate90") {
            for (var j = 0; j < cmd.points.length; j += 2) {
              var x = cmd.points[j]
              var y = cmd.points[j + 1]
              if (op.dir === 1) {
                cmd.points[j] = oldH - 1 - y
                cmd.points[j + 1] = x
              } else {
                cmd.points[j] = y
                cmd.points[j + 1] = oldW - 1 - x
              }
            }
            next.push(cmd)
          } else if (op.type === "crop") {
            for (var k = 0; k < cmd.points.length; k += 2) {
              cmd.points[k] -= op.rect.x
              cmd.points[k + 1] -= op.rect.y
            }
            var b = commandBounds(cmd)
            if (b.x1 >= 0 && b.y1 >= 0 && b.x0 <= op.rect.w && b.y0 <= op.rect.h) next.push(cmd)
          }
        }
        state.annotations = next
      }

      function undo() {
        var entry = state.history.pop()
        if (!entry || state.busy) return
        state.redoStack.push(entry)
        if (entry.kind === "vector") {
          state.annotations.pop()
          redrawOverlay()
        } else if (entry.kind === "base") {
          state.baseOps.pop()
          state.annotations = entry.prevAnnotations.map(cloneCommand)
          rebuildBase()
        }
        state.dirty = state.history.length > 0 || state.annotations.length > 0 || state.baseOps.length > 0
        state.draft = null
        state.polygonPts = []
        updateButtons()
      }

      function redo() {
        var entry = state.redoStack.pop()
        if (!entry || state.busy) return
        pushHistory(entry)
        if (entry.kind === "vector") {
          state.annotations.push(entry.command)
          redrawOverlay()
        } else if (entry.kind === "base") {
          state.baseOps.push(entry.op)
          var oldW = state.dims.w
          var oldH = state.dims.h
          transformAnnotationsForOp(entry.op, oldW, oldH)
          rebuildBase()
        }
        state.dirty = true
        updateButtons()
      }

      function commitCommand(cmd) {
        if (!cmd || !cmd.points || cmd.points.length < 2) return
        var stored = cloneCommand(cmd)
        state.annotations.push(stored)
        pushHistory({ kind: "vector", command: stored })
        state.redoStack.length = 0
        markDirty()
        redrawOverlay()
      }

      // ---------------- pointer interaction ----------------
      function onPointerDown(event) {
        if (!state.ready || !state.editing || state.loading || state.busy) return
        event.preventDefault()
        overlayCanvas.setPointerCapture && overlayCanvas.setPointerCapture(event.pointerId)
        var p = canvasPoint(event)
        state.pointer = p

        if (state.tool === "crop") {
          var handle = cropHandleAt(p)
          if (handle) {
            state.cropDrag = { mode: "handle", handle: handle, startX: p.x, startY: p.y, orig: cloneRect(state.cropRect) }
          } else {
            state.cropDrag = { mode: "new", startX: p.x, startY: p.y, ratio: cropRatioToNumber(cropRatio) }
            state.cropRect = { x: p.x, y: p.y, w: 0, h: 0 }
          }
          updateButtons()
          redrawOverlay()
          return
        }

        if (state.tool === "shape" && state.shapeKind === "polygon") {
          var first = state.polygonPts.length >= 2 ? { x: state.polygonPts[0], y: state.polygonPts[1] } : null
          if (first && state.polygonPts.length >= 6 && distance(p, first) <= clickThreshold()) {
            commitPolygon(state.polygonPts)
            return
          }
          state.polygonPts.push(p.x, p.y)
          redrawOverlay()
          return
        }

        if (state.tool === "shape" && state.shapeKind !== "polygon") state.polygonPts = []
        var kind = state.tool === "brush" ? "stroke" : state.shapeKind
        state.draft = {
          kind: kind,
          points: [p.x, p.y, p.x, p.y],
          color: state.color,
          width: state.width,
          dashed: state.tool === "shape" && state.dashed
        }
        redrawOverlay()
      }

      function onPointerMove(event) {
        if (!state.ready || !state.editing || state.loading) return
        var p = canvasPoint(event)
        state.pointer = p

        if (state.cropDrag && state.tool === "crop") {
          updateCropDrag(p)
          redrawOverlay()
          return
        }

        if (state.draft) {
          if (state.draft.kind === "stroke") {
            var pts = state.draft.points
            var lastX = pts[pts.length - 2]
            var lastY = pts[pts.length - 1]
            if (distance({ x: lastX, y: lastY }, p) >= Math.max(0.75, state.width / 3)) {
              pts.push(p.x, p.y)
            }
          } else {
            state.draft.points[2] = p.x
            state.draft.points[3] = p.y
          }
          redrawOverlay()
        }
      }

      function onPointerUp(event) {
        if (state.cropDrag && state.tool === "crop") {
          updateCropDrag(canvasPoint(event))
          var rect = state.cropRect
          if (state.cropDrag.mode === "new" && rect && rect.w < MIN_CROP && rect.h < MIN_CROP) {
            state.cropRect = null
          }
          state.cropDrag = null
          redrawOverlay()
          return
        }
        if (state.draft) {
          var cmd = state.draft
          state.draft = null
          if (cmd.kind === "stroke") {
            if (cmd.points.length >= 4) commitCommand(cmd)
          } else {
            var dx = Math.abs(cmd.points[2] - cmd.points[0])
            var dy = Math.abs(cmd.points[3] - cmd.points[1])
            if (dx >= 4 || dy >= 4) commitCommand(cmd)
          }
          redrawOverlay()
        }
      }

      function onPointerCancel() {
        state.draft = null
        state.cropDrag = null
        if (state.tool === "crop" && state.cropRect && state.cropRect.w < MIN_CROP) state.cropRect = null
        redrawOverlay()
      }

      function onDoubleClick(event) {
        if (!state.ready || !state.editing) return
        if (state.tool !== "shape" || state.shapeKind !== "polygon") return
        if (state.polygonPts.length < 6) return
        var pts = state.polygonPts.slice()
        // The second click of a dblclick may have appended a duplicate point.
        var n = pts.length
        if (n >= 6) {
          var p0 = { x: pts[n - 4], y: pts[n - 3] }
          var p1 = { x: pts[n - 2], y: pts[n - 1] }
          if (distance(p0, p1) <= clickThreshold()) pts.length = n - 2
        }
        commitPolygon(pts)
      }

      function cropRatioToNumber(value) {
        if (value === "1:1") return 1
        if (value === "4:3") return 4 / 3
        if (value === "16:9") return 16 / 9
        return 0
      }

      function updateCropDrag(p) {
        var d = state.cropDrag
        if (!d) return
        var w = state.dims.w
        var h = state.dims.h
        if (d.mode === "new") {
          var x0 = d.startX
          var y0 = d.startY
          var x1 = clamp(p.x, 0, w)
          var y1 = clamp(p.y, 0, h)
          var dx = x1 - x0
          var dy = y1 - y0
          var ratio = d.ratio
          if (ratio && dx !== 0 && dy !== 0) {
            var rw = Math.abs(dx)
            var rh = Math.abs(dy)
            if (rw / rh > ratio) rw = rh * ratio
            else rh = rw / ratio
            x1 = x0 + (dx < 0 ? -rw : rw)
            y1 = y0 + (dy < 0 ? -rh : rh)
          }
          state.cropRect = rectFromPoints(x0, y0, x1, y1)
          updateButtons()
          return
        }
        var orig = d.orig
        var dx = p.x - d.startX
        var dy = p.y - d.startY
        var r = cloneRect(orig)
        var handle = d.handle
        if (handle.indexOf("e") >= 0) r.w = clamp(orig.w + dx, MIN_CROP, w - orig.x)
        if (handle.indexOf("s") >= 0) r.h = clamp(orig.h + dy, MIN_CROP, h - orig.y)
        if (handle.indexOf("w") >= 0) {
          var maxX = orig.x + orig.w - MIN_CROP
          var nx = clamp(orig.x + dx, 0, maxX)
          r.x = nx
          r.w = orig.w + (orig.x - nx)
        }
        if (handle.indexOf("n") >= 0) {
          var maxY = orig.y + orig.h - MIN_CROP
          var ny = clamp(orig.y + dy, 0, maxY)
          r.y = ny
          r.h = orig.h + (orig.y - ny)
        }
        state.cropRect = r
        updateButtons()
      }

      function clickThreshold() {
        return Math.max(8, 10 * state.dims.w / (stage.clientWidth || 1))
      }

      function distance(a, b) {
        var dx = a.x - b.x
        var dy = a.y - b.y
        return Math.sqrt(dx * dx + dy * dy)
      }

      function commitPolygon(pts) {
        if (pts.length < 6) return
        commitCommand({
          kind: "polygon",
          points: pts.slice(),
          color: state.color,
          width: state.width,
          dashed: state.dashed
        })
        state.polygonPts = []
      }

      // ---------------- save / reset / cancel ----------------
      function toBlob(canvas, type, quality) {
        return new Promise(function (resolve, reject) {
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob)
            else reject(new Error("图片导出失败"))
          }, type, quality)
        })
      }

      function encodeComposite(scale, type, quality) {
        var w = Math.max(1, Math.round(state.dims.w * scale))
        var h = Math.max(1, Math.round(state.dims.h * scale))
        var canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        var ctx = canvas.getContext("2d")
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = "high"
        ctx.drawImage(baseCanvas, 0, 0, w, h)
        ctx.drawImage(overlayCanvas, 0, 0, w, h)
        return toBlob(canvas, type, quality).finally(function () {
          canvas.width = 0
          canvas.height = 0
        })
      }

      function isGifFile(file) {
        var type = file && file.type ? String(file.type).toLowerCase() : ""
        return type === "image/gif" || /\.gif$/i.test(String((file && file.name) || ""))
      }

      function outputTypeFor(file) {
        var type = file && file.type ? String(file.type).toLowerCase() : ""
        if (type !== "image/jpeg" && type !== "image/webp" && type !== "image/png" && type !== "image/gif") {
          var fromName = fileNameToMime(file && file.name)
          if (fromName) type = fromName
        }
        if (type === "image/jpeg") return { type: "image/jpeg", ext: "jpg", quality: true }
        if (type === "image/webp") return { type: "image/webp", ext: "webp", quality: true }
        return { type: "image/png", ext: "png", quality: false }
      }

      async function exportBlob() {
        var out = outputTypeFor(attachment.file)
        var qualities = out.quality ? [0.92, 0.85, 0.78, 0.70, 0.60, 0.50] : [undefined]
        var blob = null
        var qi = 0
        while (qi < qualities.length) {
          blob = await encodeComposite(1, out.type, qualities[qi])
          if (blob.size <= MAX_BYTES) return blob
          qi++
        }
        var scale = Math.min(0.9, Math.sqrt(MAX_BYTES / Math.max(1, blob.size)) * 0.95)
        var guard = 0
        while (blob && blob.size > MAX_BYTES && guard < 12) {
          blob = await encodeComposite(scale, out.type, out.quality ? 0.82 : undefined)
          scale *= Math.min(0.85, Math.sqrt(MAX_BYTES / Math.max(1, blob.size)) * 0.95)
          guard++
        }
        if (!blob || blob.size > MAX_BYTES) throw new Error("无法把图片压缩到 4.5 MiB 以下")
        return blob
      }

      async function save() {
        if (!state.ready || !state.editing || state.busy) return
        if (!state.dirty) {
          setStatus("图片没有修改", false)
          return
        }
        state.busy = true
        updateButtons()
        setStatus("正在导出并替换…", false)
        try {
          var blob = await exportBlob()
          if (disposed) return
          var out = outputTypeFor(attachment.file)
          var nextFile = new File([blob], editedFileName(attachment.file.name, out.type), {
            type: out.type,
            lastModified: Date.now()
          })
          var nextUrl = URL.createObjectURL(nextFile)
          var oldUrl = attachment.previewUrl

          attachment.file = nextFile
          attachment.previewUrl = nextUrl

          if (conversation.createdImageUrls && typeof conversation.createdImageUrls.add === "function") {
            conversation.createdImageUrls.add(nextUrl)
          }

          var shell = findShellForImage(conversation, attachment.id)
          if (shell && Array.isArray(shell.imageIds)) {
            shell.imageIds = shell.imageIds.slice()
            if (typeof shell.publish === "function") {
              try { shell.publish() } catch (err) {}
            }
          }

          if (img && img.src !== nextUrl) img.src = nextUrl
          state.dirty = false
          state.busy = false
          updateButtons()
          exitEditing(true)

          if (oldUrl && oldUrl !== nextUrl && typeof requestAnimationFrame === "function") {
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                try { URL.revokeObjectURL(oldUrl) } catch (err) {}
              })
            })
          }
        } catch (err) {
          if (disposed) return
          state.busy = false
          updateButtons()
          setStatus(String((err && err.message) || err), true)
        }
      }

      async function resetEditing() {
        if (!state.ready || !state.editing || state.busy) return
        state.busy = true
        updateButtons()
        setStatus("正在重置为原图…", false)
        try {
          var decoded = await decodeToCanvas(attachment.file)
          if (disposed) return
          releaseSourceCanvas()
          state.source = decoded.canvas
          state.dims = { w: decoded.canvas.width, h: decoded.canvas.height }
          state.baseOps = []
          state.annotations = []
          state.history = []
          state.redoStack = []
          state.cropRect = null
          state.cropDrag = null
          state.draft = null
          state.polygonPts = []
          state.dirty = false
          rebuildBase()
          fitStage()
          state.busy = false
          updateButtons()
          setStatus(decoded.normalized ? "已重置，大图已缩放至 4096px / 16MP" : "已重置为原图", false)
        } catch (err) {
          if (disposed) return
          state.busy = false
          updateButtons()
          setStatus(String((err && err.message) || err), true)
        }
      }

      function releaseSourceCanvas() {
        if (state.source && state.source.width) {
          state.source.width = 0
          state.source.height = 0
        }
        state.source = null
      }

      function cancelEditing() {
        if (state.busy) return
        state.draft = null
        state.cropDrag = null
        state.cropRect = null
        state.polygonPts = []
        if (img && attachment.previewUrl) img.src = attachment.previewUrl
        exitEditing(false)
      }

      function exitEditing(saved) {
        if (!state.editing) return
        state.editing = false
        state.busy = false
        state.ready = false
        state.loading = false
        if (stage && stage.parentNode) stage.parentNode.removeChild(stage)
        releaseSourceCanvas()
        if (baseCanvas) { baseCanvas.width = 0; baseCanvas.height = 0 }
        if (overlayCanvas) { overlayCanvas.width = 0; overlayCanvas.height = 0 }
        if (img) img.style.display = ""
        updateButtons()
        setStatus(saved ? "已保存并替换待发送图片" : "已取消编辑，待发送图片保持原样", false)
      }

      async function enterEditing() {
        if (disposed || state.editing) return
        state.editing = true
        state.loading = true
        state.ready = false
        state.busy = false
        updateButtons()
        setStatus("正在加载图片…", false)
        if (img) img.style.display = "none"
        try {
          var decoded = await decodeToCanvas(attachment.file)
          if (disposed || !state.editing) return
          releaseSourceCanvas()
          state.source = decoded.canvas
          state.dims = { w: decoded.canvas.width, h: decoded.canvas.height }
          state.baseOps = []
          state.annotations = []
          state.history = []
          state.redoStack = []
          state.cropRect = null
          state.cropDrag = null
          state.draft = null
          state.polygonPts = []
          state.dirty = false
          state.loading = false
          state.ready = true
          ensureStage()
          lightbox.appendChild(stage)
          rebuildBase()
          fitStage()
          var gif = isGifFile(attachment.file)
          var intro = gif
            ? (decoded.normalized
              ? "GIF 将被转为静态 PNG；图片已缩放至 4096px / 16MP 以内（原文件不受影响）"
              : "GIF 将被转为静态 PNG 首帧")
            : (decoded.normalized
              ? "图片已缩放至 4096px / 16MP 以内（原文件不受影响）"
              : "可旋转、裁剪、绘制或圈重点")
          updateButtons()
          setStatus(intro, false, gif)
        } catch (err) {
          if (disposed) return
          state.loading = false
          state.ready = false
          state.editing = false
          if (img) img.style.display = ""
          if (stage && stage.parentNode) stage.parentNode.removeChild(stage)
          updateButtons()
          setStatus("图片加载失败：" + String((err && err.message) || err), true)
        }
      }

      function findShellForImage(conversationService, attachmentId) {
        var input = conversationService && conversationService.input
        if (!input || !input.shells || typeof input.shells.values !== "function") return null
        var values = input.shells.values()
        var next = values.next()
        while (!next.done) {
          var shell = next.value
          try {
            var ids = shell && shell.snapshot && shell.snapshot.imageIds
            if (Array.isArray(ids) && ids.indexOf(attachmentId) >= 0) return shell
          } catch (err) {}
          next = values.next()
        }
        return null
      }

      function onWindowResize() {
        fitStage()
        redrawOverlay()
      }

      function onKeyDown(event) {
        if (disposed || !state.editing) return
        if (event.key === "Escape") {
          if (state.polygonPts.length > 0) {
            state.polygonPts = []
            redrawOverlay()
            event.preventDefault()
            event.stopImmediatePropagation()
          } else if (state.cropRect) {
            state.cropRect = null
            state.cropDrag = null
            redrawOverlay()
            updateButtons()
            event.preventDefault()
            event.stopImmediatePropagation()
          }
          return
        }
        if (event.key === "Enter" && state.tool === "shape" && state.shapeKind === "polygon") {
          if (state.polygonPts.length >= 6) commitPolygon(state.polygonPts)
        }
      }

      function dispose() {
        if (disposed) return
        disposed = true
        if (statusTimer) clearTimeout(statusTimer)
        window.removeEventListener("resize", onWindowResize)
        document.removeEventListener("keydown", onKeyDown)
        state.draft = null
        state.cropDrag = null
        if (stage && stage.parentNode) stage.parentNode.removeChild(stage)
        if (img) img.style.display = ""
        if (baseCanvas) { baseCanvas.width = 0; baseCanvas.height = 0 }
        if (overlayCanvas) { overlayCanvas.width = 0; overlayCanvas.height = 0 }
        if (state.source && state.source.width) { state.source.width = 0; state.source.height = 0 }
        if (root && root.parentNode) root.parentNode.removeChild(root)
      }

      // ---------------- mount ----------------
      function mount() {
        lightbox.appendChild(root)
        window.addEventListener("resize", onWindowResize)
        document.addEventListener("keydown", onKeyDown)
        updateButtons()
        enterEditing()
      }

      return {
        mount: mount,
        dispose: dispose,
        lightbox: lightbox
      }
    }

    // ------------------------------------------------------------------
    // Lightbox detection + editor registry
    // ------------------------------------------------------------------
    function findDraftByPreviewUrl(conversation, src) {
      if (!conversation || !conversation.draftAttachments || typeof conversation.draftAttachments.values !== "function") {
        return undefined
      }
      var values = conversation.draftAttachments.values()
      var next = values.next()
      while (!next.done) {
        var attachment = next.value
        if (attachment && attachment.previewUrl === src) return attachment
        next = values.next()
      }
      return undefined
    }

    function isDraftImageLightbox(node) {
      if (!node || node.nodeType !== 1) return false
      if (node.getAttribute("role") !== "dialog" || node.getAttribute("aria-modal") !== "true") return false
      var children = Array.prototype.slice.call(node.children || [])
      // Official ImageLightbox structure: [mask div, img, close button]
      if (children.length < 3) return false
      if (children[0].tagName !== "DIV") return false
      if (children[1].tagName !== "IMG") return false
      if (children[2].tagName !== "BUTTON") return false
      var src = children[1].getAttribute("src") || ""
      return /^blob:/.test(src)
    }

    function attachToLightbox(conversation, lightbox) {
      var img = lightbox.children[1]
      var attachment = findDraftByPreviewUrl(conversation, img.getAttribute("src") || "")
      if (!attachment) return null
      var editor = createEditor(conversation, lightbox, img, attachment)
      editor.mount()
      return editor
    }

    function createWatcher(ctx) {
      var conversation = ctx.get("conversation")
      if (!conversation || !conversation.draftAttachments || !conversation.input) {
        console.warn("[dsh-quick-image-editor] conversation service unavailable; editor disabled")
        return null
      }

      var editors = new Map()
      var scanScheduled = false
      var disposed = false

      function scan() {
        scanScheduled = false
        if (disposed) return

        // Attach to any newly seen draft-image lightbox.
        var dialogs = document.querySelectorAll('div[role="dialog"][aria-modal="true"]')
        for (var i = 0; i < dialogs.length; i++) {
          var dialog = dialogs[i]
          if (editors.has(dialog)) continue
          if (!isDraftImageLightbox(dialog)) continue
          var editor = attachToLightbox(conversation, dialog)
          if (editor) editors.set(dialog, editor)
        }

        // Detach editors whose lightbox left the DOM.
        var removed = []
        editors.forEach(function (editor, dialog) {
          if (!document.contains(dialog)) {
            editor.dispose()
            removed.push(dialog)
          }
        })
        for (var j = 0; j < removed.length; j++) editors.delete(removed[j])
      }

      function scheduleScan() {
        if (scanScheduled || disposed) return
        scanScheduled = true
        if (typeof queueMicrotask === "function") queueMicrotask(scan)
        else setTimeout(scan, 0)
      }

      if (!document.body) return null
      var observer = new MutationObserver(scheduleScan)
      observer.observe(document.body, { childList: true, subtree: true })

      function dispose() {
        if (disposed) return
        disposed = true
        observer.disconnect()
        editors.forEach(function (editor) { editor.dispose() })
        editors.clear()
      }

      scan()
      return { dispose: dispose }
    }

    // ------------------------------------------------------------------
    // Plugin entry
    // ------------------------------------------------------------------
    function apply(ctx) {
      var style = document.createElement("style")
      style.dataset.plugin = "dsh-quick-image-editor"
      style.textContent = QIE_CSS
      document.head.appendChild(style)

      var watcher = createWatcher(ctx)

      ctx.effect(function () {
        return function () {
          if (watcher) watcher.dispose()
          style.remove()
        }
      })
    }

    exports.inject = ["conversation"]
    exports.apply = apply
    exports.name = "dsh-quick-image-editor"
    return module.exports
  }
})
