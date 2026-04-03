"use client";

import { useRef, useEffect } from "react";
import { setupCanvas, clearCanvasEl, undoLastStroke } from "./canvasUtils";

interface SignatureCanvasProps {
  label: string;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

export default function SignatureCanvas({ label, canvasRef }: SignatureCanvasProps) {
  const isDrawingRef = useRef(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const cleanup = setupCanvas(canvasRef.current, isDrawingRef);
    return cleanup;
  }, [canvasRef]);

  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-gray-400 mb-2 block">
        {label}
      </label>
      <canvas
        ref={canvasRef}
        className="w-full border border-gray-200 rounded-xl bg-white touch-none"
        style={{ height: 150 }}
      />
      <div className="flex gap-4 mt-1.5">
        <button
          type="button"
          onClick={() => undoLastStroke(canvasRef.current)}
          className="text-xs text-gray-400 hover:text-black transition"
        >
          Deshacer trazo
        </button>
        <button
          type="button"
          onClick={() => clearCanvasEl(canvasRef.current)}
          className="text-xs text-gray-400 hover:text-black transition"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
