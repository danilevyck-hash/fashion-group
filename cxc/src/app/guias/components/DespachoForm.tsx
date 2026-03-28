"use client";

import { useRef, useEffect } from "react";
import { setupCanvas, isCanvasClear, clearCanvasEl } from "./canvasUtils";

interface DespachoFormProps {
  bPlaca: string;
  setBPlaca: (v: string) => void;
  bReceptor: string;
  setBReceptor: (v: string) => void;
  bCedula: string;
  setBCedula: (v: string) => void;
  bSaving: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  canvasEntregadorRef: React.RefObject<HTMLCanvasElement>;
  onConfirmar: () => void;
}

export default function DespachoForm({
  bPlaca,
  setBPlaca,
  bReceptor,
  setBReceptor,
  bCedula,
  setBCedula,
  bSaving,
  canvasRef,
  canvasEntregadorRef,
  onConfirmar,
}: DespachoFormProps) {
  const isDrawingRef = useRef(false);
  const isDrawingEntregadorRef = useRef(false);

  useEffect(() => {
    const cleanups: (() => void)[] = [];
    if (canvasRef.current) cleanups.push(setupCanvas(canvasRef.current, isDrawingRef));
    if (canvasEntregadorRef.current)
      cleanups.push(setupCanvas(canvasEntregadorRef.current, isDrawingEntregadorRef));
    return () => cleanups.forEach((fn) => fn());
  }, [canvasRef, canvasEntregadorRef]);

  return (
    <div className="no-print mb-8 border border-amber-200 bg-amber-50 rounded-2xl p-6">
      <h2 className="text-sm font-medium mb-4">Completar despacho — Bodega</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            Placa / Vehículo *
          </label>
          <input
            type="text"
            value={bPlaca}
            onChange={(e) => setBPlaca(e.target.value)}
            className="w-full border-b border-gray-300 py-2 text-sm outline-none focus:border-black transition bg-transparent"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            Nombre del receptor *
          </label>
          <input
            type="text"
            value={bReceptor}
            onChange={(e) => setBReceptor(e.target.value)}
            className="w-full border-b border-gray-300 py-2 text-sm outline-none focus:border-black transition bg-transparent"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-1 block">
            Cédula del receptor *
          </label>
          <input
            type="text"
            value={bCedula}
            onChange={(e) => setBCedula(e.target.value)}
            className="w-full border-b border-gray-300 py-2 text-sm outline-none focus:border-black transition bg-transparent"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-2 block">
            Firma del receptor *
          </label>
          <div className="relative inline-block">
            <canvas
              ref={canvasRef}
              width={300}
              height={150}
              className="border border-gray-300 rounded bg-white touch-none"
            />
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-300 text-sm pointer-events-none">
              Firme aquí
            </span>
          </div>
          <div>
            <button
              onClick={() => clearCanvasEl(canvasRef.current)}
              className="text-xs text-gray-400 hover:text-black transition mt-1"
            >
              Limpiar firma
            </button>
          </div>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-[0.05em] text-gray-400 mb-2 block">
            Firma del entregador (quien entrega) *
          </label>
          <div className="relative inline-block">
            <canvas
              ref={canvasEntregadorRef}
              width={300}
              height={150}
              className="border border-gray-300 rounded bg-white touch-none"
            />
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-300 text-sm pointer-events-none">
              Firme aquí
            </span>
          </div>
          <div>
            <button
              onClick={() => clearCanvasEl(canvasEntregadorRef.current)}
              className="text-xs text-gray-400 hover:text-black transition mt-1"
            >
              Limpiar firma
            </button>
          </div>
        </div>
      </div>
      <button
        onClick={onConfirmar}
        disabled={bSaving}
        className="bg-black text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40 w-full sm:w-auto"
      >
        {bSaving ? "Guardando..." : "Confirmar despacho"}
      </button>
    </div>
  );
}

export { isCanvasClear };
