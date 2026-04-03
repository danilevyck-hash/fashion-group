"use client";

import { useRef, useEffect } from "react";
import { setupCanvas, clearCanvasEl, undoLastStroke, isCanvasClear } from "./canvasUtils";

interface SignatureCanvasProps {
  label: string;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  initialImage?: string | null;
  onChange?: (dataUrl: string | null) => void;
}

export default function SignatureCanvas({ label, canvasRef, initialImage, onChange }: SignatureCanvasProps) {
  const isDrawingRef = useRef(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const cleanup = setupCanvas(canvas, isDrawingRef);

    // Restore initial image if provided and canvas is fresh
    if (initialImage && !initialized.current) {
      initialized.current = true;
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
      };
      img.src = initialImage;
    }

    // Listen for drawing events to persist signature
    if (onChange) {
      const save = () => {
        if (!isDrawingRef.current) {
          const dataUrl = isCanvasClear(canvas) ? null : canvas.toDataURL();
          onChange(dataUrl);
        }
      };
      canvas.addEventListener("mouseup", save);
      canvas.addEventListener("touchend", save);
      return () => {
        canvas.removeEventListener("mouseup", save);
        canvas.removeEventListener("touchend", save);
        cleanup();
      };
    }

    return cleanup;
  }, [canvasRef]);

  function handleUndo() {
    undoLastStroke(canvasRef.current);
    if (onChange && canvasRef.current) {
      onChange(isCanvasClear(canvasRef.current) ? null : canvasRef.current.toDataURL());
    }
  }

  function handleClear() {
    clearCanvasEl(canvasRef.current);
    if (onChange) onChange(null);
  }

  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-gray-400 mb-2 block">
        {label}
      </label>
      <canvas
        ref={canvasRef}
        className="w-full border border-gray-200 rounded-lg bg-white touch-none"
        style={{ height: 100 }}
      />
      <div className="flex gap-4 mt-1.5">
        <button
          type="button"
          onClick={handleUndo}
          className="text-xs text-gray-400 hover:text-black transition"
        >
          Deshacer trazo
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-gray-400 hover:text-black transition"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
