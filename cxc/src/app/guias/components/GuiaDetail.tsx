"use client";

import { useRef, useState } from "react";
import { Toast } from "@/components/ui";
import type { Guia } from "./types";
import DespachoForm from "./DespachoForm";
import PrintDocument from "./PrintDocument";
import { isCanvasClear } from "./canvasUtils";

interface GuiaDetailProps {
  guia: Guia;
  role: string | null;
  bPlaca: string;
  setBPlaca: (v: string) => void;
  bReceptor: string;
  setBReceptor: (v: string) => void;
  bCedula: string;
  setBCedula: (v: string) => void;
  bSaving: boolean;
  showPostDespacho: boolean;
  setShowPostDespacho: (v: boolean) => void;
  toast: string | null;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onConfirmarDespacho: (
    bPlaca: string,
    bReceptor: string,
    bCedula: string,
    firma_base64: string,
    firma_entregador_base64: string,
  ) => void;
  showToast: (msg: string) => void;
}

export default function GuiaDetail({
  guia: g,
  role,
  bPlaca,
  setBPlaca,
  bReceptor,
  setBReceptor,
  bCedula,
  setBCedula,
  bSaving,
  showPostDespacho,
  setShowPostDespacho,
  toast,
  onBack,
  onEdit,
  onDelete,
  onConfirmarDespacho,
  showToast,
}: GuiaDetailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasEntregadorRef = useRef<HTMLCanvasElement>(null);

  const isDispatched = !!g.placa;
  const canComplete = (role === "bodega" || role === "admin") && !isDispatched;
  const canEdit = role === "admin" || role === "secretaria" || (role === "bodega" && !isDispatched);
  const canDelete = role === "admin" || role === "secretaria";

  const canQuickDispatch = (role === "secretaria" || role === "admin") && g.estado === "Pendiente Bodega";
  const [showQuickDispatch, setShowQuickDispatch] = useState(false);
  const [quickDispatching, setQuickDispatching] = useState(false);

  const guiaItems = g.guia_items || [];
  const totalBultos = guiaItems.reduce((s: number, i: { bultos?: number }) => s + (i.bultos || 0), 0);

  async function handleQuickDispatch() {
    setQuickDispatching(true);
    try {
      const res = await fetch(`/api/guias/${g.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "Completada" }),
      });
      if (res.ok) {
        showToast("Guía marcada como despachada");
        setShowQuickDispatch(false);
        onBack();
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Error al despachar");
      }
    } catch { showToast("Error de conexión"); }
    setQuickDispatching(false);
  }

  function handleConfirmar() {
    if (guiaItems.length === 0 || totalBultos === 0) {
      showToast("No se puede despachar una guía sin items");
      return;
    }
    if (!bPlaca.trim()) {
      showToast("Ingresa la placa del vehículo");
      return;
    }
    if (!bReceptor.trim()) {
      showToast("Ingresa el nombre del receptor");
      return;
    }
    if (!bCedula.trim()) {
      showToast("Ingresa la cédula del receptor");
      return;
    }
    if (isCanvasClear(canvasRef.current)) {
      showToast("Se requiere la firma del receptor");
      return;
    }
    if (isCanvasClear(canvasEntregadorRef.current)) {
      showToast("Se requiere la firma del entregador");
      return;
    }
    const firma_base64 = canvasRef.current?.toDataURL() || "";
    const firma_entregador_base64 = canvasEntregadorRef.current?.toDataURL() || "";
    onConfirmarDespacho(bPlaca, bReceptor, bCedula, firma_base64, firma_entregador_base64);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex flex-wrap gap-4 mb-8 no-print">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-black transition">
          ← Volver
        </button>
        {canEdit && (
          <button
            onClick={() => onEdit(g.id)}
            className="text-sm text-gray-500 hover:text-black transition"
          >
            Editar
          </button>
        )}
        <button
          onClick={() => window.print()}
          className="text-sm bg-black text-white px-6 py-2.5 rounded-full font-medium hover:bg-gray-800 transition"
        >
          Imprimir
        </button>
        {canQuickDispatch && (
          <button onClick={() => setShowQuickDispatch(true)}
            className="text-sm bg-emerald-600 text-white px-6 py-2.5 rounded-full font-medium hover:bg-emerald-700 transition">
            Marcar como despachada
          </button>
        )}
      </div>

      {/* Quick dispatch confirmation modal */}
      {showQuickDispatch && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 no-print" onClick={() => setShowQuickDispatch(false)}>
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-medium mb-1">¿Confirmar despacho de Guía #{g.numero}?</p>
            <p className="text-sm text-gray-500 mb-1">{guiaItems.length} destinatarios · {totalBultos} bultos</p>
            <p className="text-xs text-gray-400 mb-5">Esta acción no requiere firma del transportista.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowQuickDispatch(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-black transition">Cancelar</button>
              <button onClick={handleQuickDispatch} disabled={quickDispatching}
                className="px-5 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50">
                {quickDispatching ? "Despachando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {canComplete && (
        <DespachoForm
          bPlaca={bPlaca}
          setBPlaca={setBPlaca}
          bReceptor={bReceptor}
          setBReceptor={setBReceptor}
          bCedula={bCedula}
          setBCedula={setBCedula}
          bSaving={bSaving}
          canvasRef={canvasRef}
          canvasEntregadorRef={canvasEntregadorRef}
          onConfirmar={handleConfirmar}
        />
      )}

      {showPostDespacho && (
        <div className="no-print mb-8 border border-green-200 bg-green-50 rounded-2xl p-6 text-center">
          <p className="text-sm font-medium text-green-800 mb-4">Despacho confirmado</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => window.print()}
              className="bg-black text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition"
            >
              Imprimir
            </button>
            <button
              onClick={() => setShowPostDespacho(false)}
              className="border border-gray-300 px-6 py-2.5 rounded-full text-sm hover:border-gray-400 transition"
            >
              Omitir
            </button>
          </div>
        </div>
      )}

      <PrintDocument guia={g} />

      {canDelete && (
        <div className="no-print mt-6">
          <button
            onClick={() => onDelete(g.id)}
            className="text-xs text-gray-400 hover:text-red-500 transition"
          >
            Eliminar guía
          </button>
        </div>
      )}

      <Toast message={toast} />
    </div>
  );
}
