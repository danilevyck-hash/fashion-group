"use client";

import { useRef, useState, useMemo } from "react";
import AppHeader from "@/components/AppHeader";
import { fmt, fmtDate } from "@/lib/format";
import { Toast, StatusBadge, ConfirmDeleteModal, FotoLightbox, ScrollableTable, PdfLightbox } from "@/components/ui";
import { Reclamo, RItem, Contacto } from "./types";
import { EMPRESAS, GENEROS, DEFAULT_MOTIVOS, emptyItem, daysSince, calcSub, loadCustomMotivos, saveCustomMotivo, empresaDesdeIA, TASA_IMPORTACION, TASA_ITBMS, FACTOR_TOTAL, estadoLabel } from "./constants";
import { useSmartSuggestions, type SmartSuggestion } from "@/lib/hooks/useSmartSuggestions";
import SuggestionCard from "@/components/SuggestionCard";
import FotoBadge from "./FotoBadge";
import FacturaPdfUploader, { type FacturaIAData } from "./FacturaPdfUploader";

interface Props {
  current: Reclamo;
  role: string;
  contacto?: Contacto | null;
  nota: string;
  setNota: (v: string) => void;
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  editEmpresa: string;
  setEditEmpresa: (v: string) => void;
  editFactura: string;
  setEditFactura: (v: string) => void;
  editPedido: string;
  setEditPedido: (v: string) => void;
  editFecha: string;
  setEditFecha: (v: string) => void;
  editNotas: string;
  setEditNotas: (v: string) => void;
  editFacturaPdfPath: string | null;
  setEditFacturaPdfPath: (v: string | null) => void;
  editItems: RItem[];
  setEditItems: React.Dispatch<React.SetStateAction<RItem[]>>;
  editSaving: boolean;
  /** Entra a modo edición poblando los campos (lo maneja el contenedor). */
  onStartEdit: () => void;
  toast: string | null;
  customMotivos: string[];
  setCustomMotivos: React.Dispatch<React.SetStateAction<string[]>>;
  addingEditMotivo: number | null;
  setAddingEditMotivo: (v: number | null) => void;
  newMotivoText: string;
  setNewMotivoText: (v: string) => void;
  onBack: () => void;
  onBackToEmpresa?: () => void;
  onBackToReclamos?: () => void;
  onAddNota: () => void;
  onChangeEstado: (e: string) => void;
  onDeleteReclamo: (id: string) => void;
  onSaveEdit: () => void;
  onUploadFoto: (file: File) => void;
  onDeleteFoto: (fotoId: string, path: string) => void;
  onAddSettlement: (rows: { monto: number; nota_credito: string; fecha: string }[]) => void;
  onRemoveSettlement: (sid: string) => void;
  showToast: (msg: string) => void;
}

const SUPA_URL = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_SUPABASE_URL || "") : "";

export default function ReclamoDetail({
  current, role, nota, setNota, editMode, setEditMode,
  editEmpresa, setEditEmpresa, editFactura, setEditFactura, editPedido, setEditPedido,
  editFecha, setEditFecha, editNotas, setEditNotas,
  editFacturaPdfPath, setEditFacturaPdfPath,
  editItems, setEditItems, editSaving,
  onStartEdit, toast,
  customMotivos, setCustomMotivos, addingEditMotivo, setAddingEditMotivo,
  newMotivoText, setNewMotivoText, onBack, onBackToEmpresa, onBackToReclamos,
  onAddNota, onChangeEstado,
  onDeleteReclamo, onSaveEdit, onUploadFoto, onDeleteFoto,
  onAddSettlement, onRemoveSettlement,
  showToast,
}: Props) {
  const fotoRef = useRef<HTMLInputElement>(null);
  const MOTIVOS = [...DEFAULT_MOTIVOS, ...customMotivos];
  const [deleteFotoTarget, setDeleteFotoTarget] = useState<{ id: string; path: string } | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [facturaLightbox, setFacturaLightbox] = useState<string | null>(null);

  // La IA rellena la cabecera en edición (campos editables); NO toca los ítems.
  function aplicarIA(data: FacturaIAData) {
    const emp = empresaDesdeIA(data.proveedor, data.marca);
    if (emp) setEditEmpresa(emp);
    if (data.nro_factura) setEditFactura(data.nro_factura);
    if (data.fecha_factura) setEditFecha(data.fecha_factura);
    if (data.nro_orden_compra) setEditPedido(data.nro_orden_compra);
  }

  async function downloadZip() {
    if (zipBusy) return;
    setZipBusy(true);
    try {
      const res = await fetch(`/api/reclamos/proveedor/${encodeURIComponent(current.empresa)}/export-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reclamo_ids: [current.id] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Error al generar el ZIP.");
      }
      const omitidas = Number(res.headers.get("X-Fotos-Omitidas") || "0");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reclamo-${current.nro_reclamo}-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(omitidas > 0 ? `ZIP descargado. ${omitidas} foto${omitidas === 1 ? "" : "s"} no se pudo incluir.` : "ZIP descargado");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al generar el ZIP");
    } finally {
      setZipBusy(false);
    }
  }

  const items = current.reclamo_items ?? [];
  const seg = current.reclamo_seguimiento ?? [];
  const fotos = current.reclamo_fotos ?? [];
  const sub = calcSub(items);
  // Totales: en modo edición se recalculan EN VIVO desde editItems mientras el
  // usuario cambia cantidades/precios; en modo ver, desde los ítems guardados.
  // La lógica fiscal (importación 10% / ITBMS / FACTOR_TOTAL) no cambia, solo la fuente.
  const totalsSub = editMode ? calcSub(editItems) : sub;
  const days = daysSince(current.fecha_reclamo);

  // ── Settlement (recuperación / notas de crédito) ──
  const settlements = (current.reclamo_settlements ?? []).filter((s) => !s.deleted);
  const recuperado = settlements.reduce((s, x) => s + (Number(x.monto) || 0), 0);
  // Reclamado: snapshot congelado al marcar Pagado; si aún no, el vivo.
  const reclamado = current.monto_reclamado_snapshot ?? sub * FACTOR_TOTAL;
  const deltaRec = reclamado - recuperado;
  const pctRec = reclamado > 0 ? (recuperado / reclamado) * 100 : 0;
  const [ncOpen, setNcOpen] = useState(false);
  const [ncMonto, setNcMonto] = useState("");
  const [ncNum, setNcNum] = useState("");
  const [ncFecha, setNcFecha] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(new Date()),
  );
  function submitNc() {
    const m = Number(ncMonto);
    if (!Number.isFinite(m) || m <= 0) { showToast("Escribe un monto recuperado mayor a 0."); return; }
    if (!ncFecha) { showToast("Falta la fecha."); return; }
    onAddSettlement([{ monto: m, nota_credito: ncNum.trim(), fecha: ncFecha }]);
    setNcOpen(false); setNcMonto(""); setNcNum("");
  }

  // ── Smart suggestion: escalation ──
  const reclamoSuggestions = useMemo<SmartSuggestion[]>(() => {
    if (days <= 45 || current.estado !== "Creado") return [];
    return [{
      id: `reclamo-escalate-${current.id}`,
      message: `Este reclamo lleva ${days} días abierto. Si el proveedor ya lo acreditó, márcalo como Pagado.`,
      actionLabel: "Marcar como Pagado",
      onAction: () => onChangeEstado("Pagado"),
    }];
  }, [current.id, current.estado, days, onChangeEstado]);

  const { suggestion: reclamoSuggestion, dismiss: dismissReclamo } = useSmartSuggestions(reclamoSuggestions);

  function updateEditItem(idx: number, field: string, val: string | number) {
    setEditItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const u = { ...item, [field]: val };
      u.subtotal = (Number(u.cantidad) || 0) * (Number(u.precio_unitario) || 0);
      return u;
    }));
  }

  return (
    <div>
      <AppHeader
        module="Reclamos a Proveedores"
        breadcrumbs={[
          { label: current.empresa, onClick: onBackToEmpresa ?? onBack },
          { label: current.nro_reclamo || "Reclamo" },
        ]}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
      <div className="mb-4">
        <button onClick={onBackToEmpresa ?? onBack} className="text-sm text-gray-400 hover:text-black transition">← {current.empresa}</button>
        {onBackToReclamos && (
          <>
            <span className="text-gray-300 mx-2">·</span>
            <button onClick={onBackToReclamos} className="text-sm text-gray-400 hover:text-black transition">Todos los reclamos</button>
          </>
        )}
      </div>

      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-[21px] font-medium tracking-tight flex items-center gap-2">
            {current.nro_reclamo}
            <FotoBadge count={fotos.length} />
          </h1>
          {editMode ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mt-3 max-w-2xl">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">Empresa *</span>
                <select value={editEmpresa} onChange={(e) => setEditEmpresa(e.target.value)} className="border-b border-gray-200 py-1.5 text-sm outline-none bg-transparent">
                  {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">N° Factura *</span>
                <input type="text" value={editFactura} onChange={(e) => setEditFactura(e.target.value)} className="border-b border-gray-200 py-1.5 text-sm outline-none" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">N° Pedido *</span>
                <input type="text" value={editPedido} onChange={(e) => setEditPedido(e.target.value)} className="border-b border-gray-200 py-1.5 text-sm outline-none" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">Fecha *</span>
                <input type="date" value={editFecha} onChange={(e) => setEditFecha(e.target.value)} className="border-b border-gray-200 py-1.5 text-sm outline-none" />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs text-gray-500">Notas</span>
                <textarea
                  value={editNotas}
                  onChange={(e) => {
                    setEditNotas(e.target.value);
                    // Auto-grow: ajusta el alto al contenido (con tope por maxHeight + scroll).
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  rows={3}
                  className="rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black transition resize-y overflow-auto"
                  style={{ minHeight: "4.5rem", maxHeight: "12rem" }}
                />
              </label>
              <div className="sm:col-span-2 flex flex-col gap-1">
                <span className="text-xs text-gray-500">Factura (PDF) — autocompletar</span>
                <FacturaPdfUploader
                  pdfUrl={current.factura_pdf_url}
                  onUploaded={setEditFacturaPdfPath}
                  onExtracted={aplicarIA}
                />
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mt-1">{current.empresa} · {current.marca}</p>
              <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 max-w-xl">
                <div>
                  <dt className="text-xs text-gray-500">Factura</dt>
                  <dd className="text-sm text-gray-900 tabular-nums">{current.nro_factura || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Pedido</dt>
                  <dd className="text-sm text-gray-900 tabular-nums">{current.nro_orden_compra || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Fecha</dt>
                  <dd className="text-sm text-gray-900">{fmtDate(current.fecha_reclamo)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Proveedor</dt>
                  <dd className="text-sm text-gray-900">{current.proveedor || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Antigüedad</dt>
                  <dd className="text-sm text-gray-900">{days} días</dd>
                </div>
              </dl>
              {current.factura_pdf_url && (
                <button
                  type="button"
                  onClick={() => setFacturaLightbox(current.factura_pdf_url ?? null)}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-black border border-gray-200 rounded px-2.5 py-1.5 active:scale-[0.97] transition"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                  Ver factura
                </button>
              )}
            </>
          )}
        </div>
        {/* UN solo indicador de estado: el pill (solo en modo ver). En edición,
            un rótulo mínimo sin acciones — el estado no se edita aquí. */}
        {editMode ? (
          <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">Editando · {estadoLabel(current.estado)}</span>
        ) : (
          <StatusBadge estado={current.estado} />
        )}
      </div>

      {!editMode && reclamoSuggestion && <SuggestionCard suggestion={reclamoSuggestion} onDismiss={dismissReclamo} />}

      {/* Action bar — en edición se vuelve Guardar / Cancelar (edición in-place) */}
      {editMode ? (
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <button onClick={onSaveEdit} disabled={editSaving} className="bg-black text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50">
            {editSaving ? "Guardando…" : "Guardar"}
          </button>
          <button onClick={() => setEditMode(false)} disabled={editSaving} className="text-sm text-gray-400 hover:text-black transition disabled:opacity-50">Cancelar</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-6 flex-wrap overflow-x-auto pb-1">
          <button onClick={onStartEdit} className="text-xs border border-gray-200 px-3 py-2.5 sm:py-1.5 rounded-full text-gray-500 hover:text-black hover:border-gray-400 active:bg-gray-100 transition-all flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
            Editar
          </button>
          <button onClick={downloadZip} disabled={zipBusy} title="Descargar el ZIP de este reclamo (Excel + fotos comprimidas) para adjuntarlo a un correo" className="text-xs border border-gray-200 px-3 py-2.5 sm:py-1.5 rounded-full text-gray-500 hover:text-black hover:border-gray-400 transition flex items-center gap-1 disabled:opacity-40">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            {zipBusy ? "Generando ZIP…" : "Descargar ZIP"}
          </button>
          {role === "admin" && (
            <button onClick={() => onDeleteReclamo(current.id)} className="text-xs text-red-400 hover:text-red-600 transition ml-auto flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
              Eliminar
            </button>
          )}
        </div>
      )}

      {/* Acción de estado — pipeline de 2 estados: Creado → Pagado (vía settlement) */}
      {!editMode && current.estado === "Creado" && (
        <div className="mb-6">
          <button onClick={() => onChangeEstado("Pagado")} className="bg-black text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            Marcar como Pagado
          </button>
        </div>
      )}
      {!editMode && current.estado === "Pagado" && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <span className="inline-flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 px-4 py-2.5 rounded-md text-sm font-medium">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Ciclo completado — Pagado
          </span>
          <button onClick={() => onChangeEstado("Creado")} className="text-xs text-gray-400 hover:text-gray-700 transition" title="Corrección: regresar a Creado">← Volver a Creado</button>
        </div>
      )}

      {/* El stepper "Creado -> Pagado ?" se elimino: el pill de estado (arriba) es
          el UNICO indicador de estado. Aqui solo queda la metadata de ultimo cambio. */}
      {!editMode && (
        <p className="text-xs text-gray-400 mb-2">
          Último cambio: {(() => {
            const latestSeg = seg.length > 0 ? seg[0]?.created_at : null;
            const raw = current.updated_at || latestSeg || current.created_at;
            const d = raw ? new Date(raw) : null;
            if (!d) return "\u2014";
            return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
          })()}
        </p>
      )}

      {/* Totals — en edición se recalculan en vivo desde los ítems editados */}
      <div className="flex items-center justify-between mb-2 mt-6">
        <div className="text-sm font-semibold text-gray-700">Totales</div>
        {editMode && <span className="text-xs text-gray-400">Actualizando en vivo</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <div className="border border-gray-200 rounded-xl p-4 text-center"><div className="text-xs text-gray-500">Subtotal</div><div className="text-[17px] font-semibold tabular-nums mt-1.5">${fmt(totalsSub)}</div></div>
        <div className="border border-gray-200 rounded-xl p-4 text-center"><div className="text-xs text-gray-500">Imp. importación (10%)</div><div className="text-[17px] font-semibold tabular-nums mt-1.5">${fmt(totalsSub * TASA_IMPORTACION)}</div></div>
        <div className="border border-gray-200 rounded-xl p-4 text-center"><div className="text-xs text-gray-500">ITBMS (7%)</div><div className="text-[17px] font-semibold tabular-nums mt-1.5">${fmt(totalsSub * TASA_ITBMS)}</div></div>
        <div className="bg-gray-900 rounded-xl p-4 text-center"><div className="text-xs text-white/70">Total</div><div className="text-[19px] font-semibold tabular-nums mt-1.5 text-white">${fmt(totalsSub * FACTOR_TOTAL)}</div></div>
      </div>

      {/* Settlement — recuperación / notas de crédito */}
      {(current.estado === "Pagado" || settlements.length > 0) && (
        <div className="mb-8 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-gray-700">Recuperación</div>
            <span className="text-xs font-medium text-emerald-700 tabular-nums">{pctRec.toFixed(0)}% recuperado</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center">
              <div className="text-xs text-gray-500">Reclamado</div>
              <div className="text-sm font-semibold tabular-nums mt-1">${fmt(reclamado)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Recuperado</div>
              <div className="text-sm font-semibold tabular-nums mt-1 text-emerald-700">${fmt(recuperado)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">{deltaRec >= 0 ? "Pendiente" : "A favor"}</div>
              <div className={`text-sm font-semibold tabular-nums mt-1 ${deltaRec > 0 ? "text-amber-600" : "text-gray-500"}`}>${fmt(Math.abs(deltaRec))}</div>
            </div>
          </div>

          {/* Barra de progreso recuperado */}
          <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden mb-4">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pctRec))}%` }} />
          </div>

          {/* Lista de notas de crédito */}
          {settlements.length > 0 ? (
            <ul className="divide-y divide-gray-100 mb-3">
              {settlements.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <span className="tabular-nums font-medium">${fmt(s.monto)}</span>
                    {s.nota_credito && <span className="text-gray-500"> · NC {s.nota_credito}</span>}
                    <span className="text-gray-400"> · {fmtDate(s.fecha)}</span>
                  </div>
                  <button
                    onClick={() => onRemoveSettlement(s.id)}
                    className="text-xs text-gray-400 hover:text-red-600 transition shrink-0 ml-3"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400 mb-3">Sin notas de crédito registradas.</p>
          )}

          {/* Agregar NC (settlement fraccionado) */}
          {ncOpen ? (
            <div className="rounded-md border border-gray-200 p-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500">Monto recuperado *</span>
                  <input type="number" inputMode="decimal" min="0" step="0.01" value={ncMonto}
                    onChange={(e) => setNcMonto(e.target.value)} placeholder="0.00"
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm tabular-nums outline-none focus:border-black transition" />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Fecha *</span>
                  <input type="date" value={ncFecha} onChange={(e) => setNcFecha(e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black transition" />
                </label>
                <label className="col-span-2 block">
                  <span className="text-xs text-gray-500">N° nota de crédito (opcional)</span>
                  <input type="text" value={ncNum} onChange={(e) => setNcNum(e.target.value)} placeholder="Ej. 4020000422"
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black transition" />
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => { setNcOpen(false); setNcMonto(""); setNcNum(""); }}
                  className="flex-1 rounded-md border border-gray-200 py-2 text-sm hover:bg-gray-50 transition">Cancelar</button>
                <button onClick={submitNc}
                  className="flex-1 rounded-md bg-black py-2 text-sm text-white active:scale-[0.97] transition">Guardar NC</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setNcOpen(true)} className="text-xs font-medium text-blue-600 hover:underline">
              + Agregar nota de crédito
            </button>
          )}
        </div>
      )}

      {/* Items table — UNA sola tabla: editable in-place cuando editMode, read-only si no */}
      {(editMode || items.length > 0) && (
        <div className="mb-8">
          <div className="text-sm font-semibold text-gray-700 mb-3">Ítems</div>
          {editMode ? (
            <>
              <ScrollableTable minWidth={700} className="mb-4">
                <table className="w-full text-sm [&_td]:py-3 [&_th]:pb-3 [&_th]:px-3.5 [&_td]:px-3.5 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide font-medium text-gray-500">
                      <th className="pb-2 font-medium text-left">Código *</th>
                      <th className="pb-2 font-medium text-left">Descripción *</th>
                      <th className="pb-2 font-medium text-left" style={{ minWidth: 70 }}>Talla *</th>
                      <th className="pb-2 font-medium text-left" style={{ minWidth: 90 }}>Género *</th>
                      <th className="pb-2 font-medium text-right" style={{ minWidth: 60 }}>Cant. *</th>
                      <th className="pb-2 font-medium text-right" style={{ minWidth: 80 }}>Precio U. *</th>
                      <th className="pb-2 font-medium text-left">Motivo *</th>
                      <th className="pb-2 font-medium text-right" style={{ minWidth: 80 }}>Subtotal</th>
                      <th className="pb-2 w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-200">
                        <td className="py-2 pr-1"><input type="text" value={item.referencia} onChange={(e) => updateEditItem(idx, "referencia", e.target.value)} className="w-full border-b border-gray-200 py-1 text-sm outline-none" /></td>
                        <td className="py-2 pr-1"><input type="text" value={item.descripcion} onChange={(e) => updateEditItem(idx, "descripcion", e.target.value)} className="w-full border-b border-gray-200 py-1 text-sm outline-none" /></td>
                        <td className="py-2 pr-1"><input type="text" value={item.talla} onChange={(e) => updateEditItem(idx, "talla", e.target.value)} className="w-full border-b border-gray-200 py-1 text-sm outline-none" style={{ minWidth: 50 }} /></td>
                        <td className="py-2 pr-1">
                          <select value={item.genero || ""} onChange={(e) => updateEditItem(idx, "genero", e.target.value)} className={`w-full border-b border-gray-200 py-1 text-sm outline-none bg-transparent ${item.genero ? "text-black" : "text-gray-400"}`} style={{ minWidth: 80 }}>
                            <option value="">Género…</option>
                            {GENEROS.map((g) => <option key={g} value={g}>{g}</option>)}
                          </select>
                        </td>
                        <td className="py-2 pr-1"><input type="number" min={0} value={item.cantidad} onChange={(e) => updateEditItem(idx, "cantidad", parseInt(e.target.value) || 0)} className="w-full border-b border-gray-200 py-1 text-sm outline-none text-right" /></td>
                        <td className="py-2 pr-1"><input type="number" step="0.50" min={0} value={item.precio_unitario} onChange={(e) => updateEditItem(idx, "precio_unitario", parseFloat(e.target.value) || 0)} className="w-full border-b border-gray-200 py-1 text-sm outline-none text-right" /></td>
                        <td className="py-2 pr-1">
                          {addingEditMotivo === idx ? (
                            <div className="flex items-center gap-1">
                              <input type="text" value={newMotivoText} onChange={(e) => setNewMotivoText(e.target.value)} placeholder="Nuevo motivo..." className="w-full border-b border-gray-200 py-1 text-sm outline-none" autoFocus
                                onKeyDown={(e) => { if (e.key === "Enter" && newMotivoText.trim()) { saveCustomMotivo(newMotivoText.trim()); setCustomMotivos(loadCustomMotivos()); updateEditItem(idx, "motivo", newMotivoText.trim()); setNewMotivoText(""); setAddingEditMotivo(null); } }} />
                              <button onClick={() => { if (newMotivoText.trim()) { saveCustomMotivo(newMotivoText.trim()); setCustomMotivos(loadCustomMotivos()); updateEditItem(idx, "motivo", newMotivoText.trim()); } setNewMotivoText(""); setAddingEditMotivo(null); }} className="text-xs text-gray-400 hover:text-black py-2 px-3">OK</button>
                              <button onClick={() => { setNewMotivoText(""); setAddingEditMotivo(null); }} className="text-xs text-gray-300 hover:text-black py-2 px-3">x</button>
                            </div>
                          ) : (
                            <select value={item.motivo} onChange={(e) => { if (e.target.value === "__add__") { setAddingEditMotivo(idx); setNewMotivoText(""); } else updateEditItem(idx, "motivo", e.target.value); }} className="w-full border-b border-gray-200 py-1 text-sm outline-none bg-transparent">
                              <option value="">--</option>
                              {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                              <option value="__add__">+ Agregar motivo</option>
                            </select>
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums text-gray-500 text-xs">${fmt((Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0))}</td>
                        <td className="py-2 text-center">{editItems.length > 1 && <button onClick={() => setEditItems((p) => p.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-black text-sm">×</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
              <button onClick={() => setEditItems((p) => [...p, emptyItem()])} className="text-sm text-gray-400 hover:text-black transition">+ Agregar fila</button>
            </>
          ) : (
            <ScrollableTable minWidth={700}>
              <table className="w-full text-sm [&_td]:py-3 [&_th]:pb-3">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide font-medium text-gray-500">
                    <th className="text-left pb-2 font-medium">Código</th>
                    <th className="text-left pb-2 font-medium">Descripción</th>
                    <th className="text-left pb-2 font-medium">Talla</th>
                    <th className="text-left pb-2 font-medium">Género</th>
                    <th className="text-right pb-2 font-medium">Cant.</th>
                    <th className="text-right pb-2 font-medium">Precio</th>
                    <th className="text-right pb-2 font-medium">Subtotal</th>
                    <th className="text-left pb-2 font-medium">Motivo</th>
                    <th className="text-left pb-2 font-medium">Factura</th>
                    <th className="text-left pb-2 font-medium">PO</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="py-2">{item.referencia}</td>
                      <td className="py-2 text-gray-500">{item.descripcion}</td>
                      <td className="py-2 text-gray-500">{item.talla}</td>
                      <td className="py-2 text-gray-500 text-xs">{item.genero || "—"}</td>
                      <td className="py-2 text-right tabular-nums">{Number(item.cantidad) || 0}</td>
                      <td className="py-2 text-right tabular-nums">${fmt(item.precio_unitario)}</td>
                      <td className="py-2 text-right tabular-nums font-medium">${fmt((Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0))}</td>
                      <td className="py-2 text-gray-500 text-xs">{item.motivo}</td>
                      <td className="py-2 text-gray-500 text-xs">{item.nro_factura}</td>
                      <td className="py-2 text-gray-500 text-xs">{item.nro_orden_compra}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          )}
        </div>
      )}

      {/* Evidencia fotográfica */}
      <div className="mb-8">
        <div className="text-sm font-semibold text-gray-700 mb-1">Evidencia fotográfica</div>
        <p className="text-xs text-gray-400 mb-3">Adjunta fotos para agilizar la resolución</p>

        {/* Thumbnail row — horizontal scroll on mobile */}
        {fotos.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 mb-3" style={{ scrollSnapType: "x mandatory" }}>
            {fotos.map((f) => {
              const src = f.url || `${SUPA_URL}/storage/v1/object/public/reclamo-fotos/${f.storage_path}`;
              return (
                <div key={f.id} className="relative flex-shrink-0 cursor-pointer" style={{ scrollSnapAlign: "start" }} onClick={() => setLightboxSrc(src)}>
                  <img src={src} alt="" className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-lg border border-gray-200" />
                  <button onClick={(e) => { e.stopPropagation(); setDeleteFotoTarget({ id: f.id, path: f.storage_path }); }} className="absolute -top-1.5 -right-1.5 w-7 h-7 bg-black text-white rounded-full text-xs flex items-center justify-center">×</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Upload area */}
        {fotos.length < 5 && (
          <>
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadFoto(f); if (fotoRef.current) fotoRef.current.value = ""; }} />
            <button
              onClick={() => fotoRef.current?.click()}
              className="w-full sm:w-auto border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-lg px-6 py-4 sm:py-3 flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition active:bg-gray-50 min-h-[44px]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span className="text-sm font-medium">Adjuntar fotos</span>
              <span className="text-xs text-gray-300 hidden sm:inline">({fotos.length}/5)</span>
            </button>
          </>
        )}
        {fotos.length === 0 && (
          <p className="text-xs text-gray-300 mt-2 italic">Sin fotos adjuntas</p>
        )}
      </div>

      {!editMode && current.notas && <p className="text-sm text-gray-400 mb-6">Notas: {current.notas}</p>}

      {/* Seguimiento */}
      <div className="mb-8">
        <div className="text-sm font-semibold text-gray-700 mb-3">Seguimiento</div>
        <div className="flex gap-2 mb-3">
          <input type="text" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Agregar nota..." className="flex-1 border-b border-gray-200 py-3 sm:py-1.5 text-base sm:text-sm outline-none" />
          <button onClick={onAddNota} disabled={!nota.trim()} className="text-sm bg-black text-white px-4 py-1.5 rounded-full hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50">Agregar</button>
        </div>
        {seg.map((s) => (
          <div key={s.id} className="border-b border-gray-50 py-2">
            <p className="text-sm">{s.nota}</p>
            <p className="text-xs text-gray-400 mt-0.5">{fmtDate(s.created_at.slice(0, 10))} {new Date(s.created_at).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" })} — {s.autor}</p>
          </div>
        ))}
      </div>

      {/* El borrado del reclamo usa el ÚNICO modal del contenedor (ReclamosClient),
          abierto vía onDeleteReclamo. Aquí solo queda el de la foto. */}
      <ConfirmDeleteModal
        open={!!deleteFotoTarget}
        title="¿Eliminar esta foto?"
        description="Se eliminará la foto de evidencia del reclamo. Esta acción no se puede deshacer."
        onConfirm={() => { if (deleteFotoTarget) { onDeleteFoto(deleteFotoTarget.id, deleteFotoTarget.path); setDeleteFotoTarget(null); } }}
        onCancel={() => setDeleteFotoTarget(null)}
      />

      <FotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      <PdfLightbox src={facturaLightbox} titulo="Factura" onClose={() => setFacturaLightbox(null)} />


      <Toast message={toast} />
      </div>
    </div>
  );
}
