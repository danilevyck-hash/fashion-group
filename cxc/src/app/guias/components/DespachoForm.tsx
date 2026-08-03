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
  bNumeroGuiaTransp: string;
  setBNumeroGuiaTransp: (v: string) => void;
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
  bChofer, setBChofer, bNumeroGuiaTransp, setBNumeroGuiaTransp,
  bSaving, onConfirmar, showToast,
  pendingFirma1, pendingFirma2, onFirma1Change, onFirma2Change,
}: DespachoFormProps) {
  const canvas1Ref = useRef<HTMLCanvasElement>(null);
  const canvas2Ref = useRef<HTMLCanvasElement>(null);

  // Warn before leaving if user has filled any field
  const isDirty = useMemo(() =>
    !!(bPlaca || bReceptor || bCedula || bChofer || bNumeroGuiaTransp || pendingFirma1 || pendingFirma2),
    [bPlaca, bReceptor, bCedula, bChofer, bNumeroGuiaTransp, pendingFirma1, pendingFirma2]
  );
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (isDirty && !bSaving) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, bSaving]);

  function handleConfirmar() {
    // 🩸 La placa era obligatoria SIEMPRE, y eso trababa la entrega directa.
    // Medido el 3-ago-2026 sobre las 172 guías vivas: **entrega directa 78%
    // sin despachar** (37 de 47) contra 85% despachadas en transportista. La
    // mercancía salía físicamente y la guía quedaba en "pendiente" para
    // siempre — por eso Daniel dejó de recibir el aviso de Telegram, que solo
    // sale al pasar a "Completada". Pedirle placa de vehículo a una entrega
    // que hace la propia gente de la casa no aporta nada y frena el cierre.
    // Daniel, textual: *"entrega directa no es necesario placa"*.
    // En transportista externo SIGUE siendo obligatoria: ahí sí importa saber
    // en qué vehículo se fue la mercancía de un tercero.
    if (tipoDespacho === "externo" && !bPlaca.trim()) {
      return showToast("Ingresa la placa del vehiculo");
    }
    if (tipoDespacho === "externo") {
      if (!bNumeroGuiaTransp.trim()) return showToast("Falta el N° de guía del transportista");
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

      {/* Toggle tipo despacho — py-2 dejaba las dos mitades en 36 px de alto. */}
      <div className="flex rounded-lg bg-gray-100 p-0.5 mb-6">
        <button type="button" onClick={() => setTipoDespacho("externo")}
          className={`flex-1 text-sm px-4 rounded-md transition font-medium inline-flex items-center justify-center min-h-[44px] ${tipoDespacho === "externo" ? "bg-white text-black border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}>
          Transportista externo
        </button>
        <button type="button" onClick={() => setTipoDespacho("directo")}
          className={`flex-1 text-sm px-4 rounded-md transition font-medium inline-flex items-center justify-center min-h-[44px] ${tipoDespacho === "directo" ? "bg-white text-black border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}>
          Entrega directa
        </button>
      </div>

      {/* Campos del receptor: medían 313×43 y con text-sm (14px) Safari hacía
          zoom al enfocar. text-base en móvil lo evita; min-h-[44px] cierra el
          milímetro que faltaba de área táctil. */}
      {tipoDespacho === "externo" ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">Placa del vehiculo *</label>
            <input type="text" value={bPlaca} onChange={(e) => setBPlaca(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">N° guía del transportista *</label>
            <input type="text" value={bNumeroGuiaTransp} onChange={(e) => setBNumeroGuiaTransp(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">Nombre del receptor *</label>
            <input type="text" value={bReceptor} onChange={(e) => setBReceptor(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">Cedula del receptor *</label>
            <input type="text" value={bCedula} onChange={(e) => setBCedula(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div>
            {/* Opcional en entrega directa: el campo se queda por si la quieren
                anotar, pero ya no traba el despacho. Ver handleConfirmar. */}
            <label className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">
              Placa del vehiculo <span className="normal-case text-gray-400">(opcional)</span>
            </label>
            <input type="text" value={bPlaca} onChange={(e) => setBPlaca(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">Chofer *</label>
            <input type="text" value={bChofer} onChange={(e) => setBChofer(e.target.value)} placeholder="Nombre del chofer"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">Cliente receptor *</label>
            <input type="text" value={bReceptor} onChange={(e) => setBReceptor(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-gray-400 mb-1 block">Cedula del cliente *</label>
            <input type="text" value={bCedula} onChange={(e) => setBCedula(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]" />
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
        className="bg-black text-white px-8 py-3 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40 w-full sm:w-auto">
        {bSaving ? "Guardando..." : "Confirmar despacho"}
      </button>
    </div>
  );
}

export { isCanvasClear };
