// ── Responsive signature canvas with undo support ──

interface StrokePoint { x: number; y: number }

interface CanvasState {
  strokes: StrokePoint[][];
  currentStroke: StrokePoint[];
  isDrawing: boolean;
  cleanup: () => void;
}

const canvasStates = new WeakMap<HTMLCanvasElement, CanvasState>();

function getScaledPos(canvas: HTMLCanvasElement, e: MouseEvent | TouchEvent): StrokePoint {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  if ("touches" in e && e.touches.length > 0) {
    return {
      x: (e.touches[0].clientX - rect.left) * scaleX,
      y: (e.touches[0].clientY - rect.top) * scaleY,
    };
  }
  const me = e as MouseEvent;
  return {
    x: (me.clientX - rect.left) * scaleX,
    y: (me.clientY - rect.top) * scaleY,
  };
}

function redraw(canvas: HTMLCanvasElement, state: CanvasState) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of state.strokes) {
    if (stroke.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i].x, stroke[i].y);
    }
    ctx.stroke();
  }
}

function resizeCanvas(canvas: HTMLCanvasElement) {
  const state = canvasStates.get(canvas);
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const oldWidth = canvas.width;
  const oldHeight = canvas.height;
  const newWidth = rect.width * dpr;
  const newHeight = rect.height * dpr;
  if (Math.abs(oldWidth - newWidth) < 1 && Math.abs(oldHeight - newHeight) < 1) return;

  // Scale existing strokes to new dimensions
  if (state && oldWidth > 0 && oldHeight > 0) {
    const sx = newWidth / oldWidth;
    const sy = newHeight / oldHeight;
    for (const stroke of state.strokes) {
      for (const pt of stroke) {
        pt.x *= sx;
        pt.y *= sy;
      }
    }
  }

  canvas.width = newWidth;
  canvas.height = newHeight;
  if (state) redraw(canvas, state);
}

export function setupCanvas(
  canvas: HTMLCanvasElement,
  _isDrawingRef: React.MutableRefObject<boolean>,
): () => void {
  const state: CanvasState = {
    strokes: [],
    currentStroke: [],
    isDrawing: false,
    cleanup: () => {},
  };
  canvasStates.set(canvas, state);

  // Initial size
  resizeCanvas(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  function startDraw(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    state.isDrawing = true;
    _isDrawingRef.current = true;
    const pos = getScaledPos(canvas, e);
    state.currentStroke = [pos];
  }

  function draw(e: MouseEvent | TouchEvent) {
    if (!state.isDrawing) return;
    e.preventDefault();
    const pos = getScaledPos(canvas, e);
    state.currentStroke.push(pos);

    // Draw current stroke incrementally
    const c = state.currentStroke;
    if (c.length < 2) return;
    ctx!.strokeStyle = "#000";
    ctx!.lineWidth = 2.5;
    ctx!.lineCap = "round";
    ctx!.lineJoin = "round";
    ctx!.beginPath();
    ctx!.moveTo(c[c.length - 2].x, c[c.length - 2].y);
    ctx!.lineTo(c[c.length - 1].x, c[c.length - 1].y);
    ctx!.stroke();
  }

  function stopDraw() {
    if (!state.isDrawing) return;
    state.isDrawing = false;
    _isDrawingRef.current = false;
    if (state.currentStroke.length > 1) {
      state.strokes.push([...state.currentStroke]);
    }
    state.currentStroke = [];
  }

  const onResize = () => resizeCanvas(canvas);

  canvas.addEventListener("mousedown", startDraw);
  canvas.addEventListener("mousemove", draw);
  canvas.addEventListener("mouseup", stopDraw);
  canvas.addEventListener("mouseleave", stopDraw);
  canvas.addEventListener("touchstart", startDraw, { passive: false });
  canvas.addEventListener("touchmove", draw, { passive: false });
  canvas.addEventListener("touchend", stopDraw);
  window.addEventListener("resize", onResize);

  state.cleanup = () => {
    canvas.removeEventListener("mousedown", startDraw);
    canvas.removeEventListener("mousemove", draw);
    canvas.removeEventListener("mouseup", stopDraw);
    canvas.removeEventListener("mouseleave", stopDraw);
    canvas.removeEventListener("touchstart", startDraw);
    canvas.removeEventListener("touchmove", draw);
    canvas.removeEventListener("touchend", stopDraw);
    window.removeEventListener("resize", onResize);
  };

  return state.cleanup;
}

export function undoLastStroke(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const state = canvasStates.get(canvas);
  if (!state || state.strokes.length === 0) return;
  state.strokes.pop();
  redraw(canvas, state);
}

export function isCanvasClear(canvas: HTMLCanvasElement | null): boolean {
  if (!canvas) return true;
  const state = canvasStates.get(canvas);
  if (state) return state.strokes.length === 0;
  // Fallback: pixel check
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return false;
  }
  return true;
}

export function clearCanvasEl(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const state = canvasStates.get(canvas);
  if (state) {
    state.strokes = [];
    state.currentStroke = [];
  }
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}
