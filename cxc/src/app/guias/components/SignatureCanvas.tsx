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
      <label className="text-xs uppercase tracking-wide text-gray-400 mb-2 block">
        {label}
      </label>
      <canvas
        ref={canvasRef}
        className="w-full border border-gray-200 rounded-lg bg-white touch-none"
        style={{ height: 150 }}
      />
      {/* Estos dos botones medían 93.6×18 y 45.2×18 en iPhone — los blancos más
          chicos del despacho, y justo los que se tocan con el dedo sucio de la
          bodega tras firmar mal. Ahora 44 px de alto; el -mx-2 del contenedor
          compensa el padding lateral para que "Deshacer trazo" siga alineado con
          el borde izquierdo del canvas, y el mt-0 absorbe el alto extra. */}
      <div className="flex gap-2 -mx-2 mt-0">
        <button
          type="button"
          onClick={handleUndo}
          className="text-xs text-gray-400 hover:text-black transition inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2"
        >
          Deshacer trazo
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-gray-400 hover:text-black transition inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
