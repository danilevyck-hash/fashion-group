"use client";

import { useRef, useEffect, useMemo } from "react";
import { isCanvasClear } from "./canvasUtils";
import SignatureCanvas from "./SignatureCanvas";

type TipoDespacho = "externo" | "directo";

interface DespachoFormProps {
  tipoDespacho: TipoDespacho;
  setTipoDespacho: (v: TipoDespacho) => void;
  bPlaca: string;
  setBPlaca: (v: string) => void;
  bReceptor: string;
  setBReceptor: (v: string) => void;
  bCedula: string;
  setBCedula: (v: string) => void;
  bChofer: string;
  setBChofer: (v: string) => void;
  bSaving: boolean;
  onConfirmar: (firma1: string, firma2: string) => void;
  showToast: (msg: string) => void;
  pendingFirma1?: string | null;
  pendingFirma2?: string | null;
  onFirma1Change?: (v: string | null) => void;
  onFirma2Change?: (v: string | null) => void;
}

export default function DespachoForm({
  tipoDespacho, setTipoDespacho,
  bPlaca, setBPlaca, bReceptor, setBReceptor, bCedula, setBCedula,
  bChofer, setBChofer, bSaving, onConfirmar, showToast,
  pendingFirma1, pendingFirma2, onFirma1Change, onFirma2Change,
}: DespachoFormProps) {
  const canvas1Ref = useRef<HTMLCanvasElement>(null);
  const canvas2Ref = useRef<HTMLCanvasElement>(null);

  // Warn before leaving if user has filled any field
  const isDirty = useMemo(() =>
    !!(bPlaca || bReceptor || bCedula || bChofer || pendingFirma1 || pendingFirma2),
    [bPlaca, bReceptor, bCedula, bChofer, pendingFirma1, pendingFirma2]
  );
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (isDirty && !bSaving) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, bSaving]);

  function handleConfirmar() {
    if (tipoDespacho === "externo") {
      if (!bPlaca.trim()) return showToast("Ingresa la placa del vehiculo");
      if (!bReceptor.trim()) return showToast("Ingresa el nombre del transportista/receptor");
      if (!bCedula.trim()) return showToast("Ingresa la cedula del receptor");
    } else {
      if (!bChofer.trim()) return showToast("Ingresa el nombre del chofer");
      if (!bReceptor.trim()) return showToast("Ingresa el nombre del cliente receptor");
      if (!bCedula.trim()) return showToast("Ingresa la cedula del cliente");
    }
    // Check canvas OR persisted signature
    const has1 = !isCanvasClear(canvas1Ref.current) || !!pendingFirma1;
    const has2 = !isCanvasClear(canvas2Ref.current) || !!pendingFirma2;
    if (!has1) {
      return showToast(tipoDespacho === "externo" ? "Se requiere la firma del transportista" : "Se requiere la firma del chofer");
    }
    if (!has2) {
      return showToast(tipoDespacho === "externo" ? "Se requiere la firma del entregador" : "Se requiere la firma del cliente");
    }
    // Prefer fresh canvas data, fall back to persisted
    const firma1 = !isCanvasClear(canvas1Ref.current) ? (canvas1Ref.current?.toDataURL() || "") : (pendingFirma1 || "");
    const firma2 = !isCanvasClear(canvas2Ref.current) ? (canvas2Ref.current?.toDataURL() || "") : (pendingFirma2 || "");
    onConfirmar(firma1, firma2);
  }

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-medium text-gray-900">Despachar</h3>
      </div>

      {/* Toggle tipo despacho */}
      <div className="flex rounded-lg bg-gray-100 p-0.5 mb-6">
        <button type="button" onClick={() => setTipoDespacho("externo")}
          className={`flex-1 text-sm py-2 px-4 rounded-md transition font-medium ${tipoDespacho === "externo" ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          Transportista externo
        </button>
        <button type="button" onClick={() => setTipoDespacho("directo")}
          className={`flex-1 text-sm py-2 px-4 rounded-md transition font-medium ${tipoDespacho === "directo" ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          Entrega directa
        </button>
      </div>

      {/* Fields */}
      {tipoDespacho === "externo" ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-gray-400 mb-1 block">Placa del vehiculo *</label>
            <input type="text" value={bPlaca} onChange={(e) => setBPlaca(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-black transition" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-gray-400 mb-1 block">Nombre del receptor *</label>
            <input type="text" value={bReceptor} onChange={(e) => setBReceptor(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-black transition" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-gray-400 mb-1 block">Cedula del receptor *</label>
            <input type="text" value={bCedula} onChange={(e) => setBCedula(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-black transition" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-gray-400 mb-1 block">Chofer *</label>
            <input type="text" value={bChofer} onChange={(e) => setBChofer(e.target.value)} placeholder="Nombre del chofer"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-black transition" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-gray-400 mb-1 block">Cliente receptor *</label>
            <input type="text" value={bReceptor} onChange={(e) => setBReceptor(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-black transition" />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-gray-400 mb-1 block">Cedula del cliente *</label>
            <input type="text" value={bCedula} onChange={(e) => setBCedula(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-black transition" />
          </div>
        </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
        <SignatureCanvas
          label={tipoDespacho === "externo" ? "Firma del transportista *" : "Firma del chofer *"}
          canvasRef={canvas1Ref}
          initialImage={pendingFirma1}
          onChange={onFirma1Change}
        />
        <SignatureCanvas
          label={tipoDespacho === "externo" ? "Firma del entregador *" : "Firma del cliente *"}
          canvasRef={canvas2Ref}
          initialImage={pendingFirma2}
          onChange={onFirma2Change}
        />
      </div>

      {/* Confirm */}
      <button onClick={handleConfirmar} disabled={bSaving}
        className="bg-black text-white px-8 py-3 rounded-md text-sm font-medium hover:bg-gray-800 transition disabled:opacity-40 w-full sm:w-auto">
        {bSaving ? "Guardando..." : "Confirmar despacho"}
      </button>
    </div>
  );
}

export { isCanvasClear };
