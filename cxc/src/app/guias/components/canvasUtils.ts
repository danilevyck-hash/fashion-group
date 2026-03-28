export function setupCanvas(
  canvas: HTMLCanvasElement,
  isDrawingRef: React.MutableRefObject<boolean>,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";

  function getPos(e: MouseEvent | TouchEvent) {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top };
  }

  function startDraw(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    isDrawingRef.current = true;
    const pos = getPos(e);
    ctx!.beginPath();
    ctx!.moveTo(pos.x, pos.y);
  }
  function draw(e: MouseEvent | TouchEvent) {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    ctx!.lineTo(pos.x, pos.y);
    ctx!.stroke();
  }
  function stopDraw() {
    isDrawingRef.current = false;
  }

  canvas.addEventListener("mousedown", startDraw);
  canvas.addEventListener("mousemove", draw);
  canvas.addEventListener("mouseup", stopDraw);
  canvas.addEventListener("mouseleave", stopDraw);
  canvas.addEventListener("touchstart", startDraw, { passive: false });
  canvas.addEventListener("touchmove", draw, { passive: false });
  canvas.addEventListener("touchend", stopDraw);

  return () => {
    canvas.removeEventListener("mousedown", startDraw);
    canvas.removeEventListener("mousemove", draw);
    canvas.removeEventListener("mouseup", stopDraw);
    canvas.removeEventListener("mouseleave", stopDraw);
    canvas.removeEventListener("touchstart", startDraw);
    canvas.removeEventListener("touchmove", draw);
    canvas.removeEventListener("touchend", stopDraw);
  };
}

export function isCanvasClear(canvas: HTMLCanvasElement | null): boolean {
  if (!canvas) return true;
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
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}
