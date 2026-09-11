"use client";

import { useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { fmt, fmtDate } from "@/lib/format";
import { hoyPanama } from "@/lib/fecha-panama";
import { Toast, ConfirmDeleteModal, FotoLightbox, ScrollableTable } from "@/components/ui";
import { Reclamo, RItem, Contacto } from "./types";
import { GENEROS, generoLabel, DEFAULT_MOTIVOS, emptyItem, calcSub, empresaDesdeIA, reclamoTaxes, esActiveShoes, impLabel, itbmsLabel, esPendiente } from "./constants";
import { empresasParaElegir } from "@/lib/reclamos/empresas-con-reclamos";
import FotoBadge from "./FotoBadge";
import FacturaPdfUploader, { type FacturaIAData } from "./FacturaPdfUploader";
import FacturasChips from "./FacturasChips";
import { facturasEnPantalla } from "@/lib/reclamos/facturas";
import { diasDesde } from "@/lib/reclamos/dias";
import { textoReclamado, estaReclamado } from "@/lib/reclamos/reclamado";
import { FALTA_FECHA_FACTURA } from "@/lib/reclamos/orden";
import { filaRepetida } from "@/lib/reclamos/lineas-factura";
import { motivoEnPantalla, notaEnPantalla } from "@/lib/reclamos/texto";
import EnviarProveedorModal from "./EnviarProveedorModal";
import OverflowMenu from "@/components/ui/OverflowMenu";
import DesplegableFlotante from "@/components/ui/DesplegableFlotante";

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
  editFacturas: string[];
  setEditFacturas: (v: string[]) => void;
  editPedido: string;
  setEditPedido: (v: string) => void;
  editFechaFactura: string;
  setEditFechaFactura: (v: string) => void;
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
  onBack: () => void;
  onBackToEmpresa?: () => void;
  onBackToReclamos?: () => void;
  onAddNota: () => void;
  onChangeEstado: (e: string) => void;
  onDeleteReclamo: (id: string) => void;
  onSaveEdit: () => void;
  onUploadFoto: (files: File[]) => void;
  uploadingFoto?: boolean;
  onDeleteFoto: (fotoId: string, path: string) => void;
  onAddSettlement: (rows: { monto: number; nota_credito: string; fecha: string }[]) => void;
  onRemoveSettlement: (sid: string) => void;
  /** Recarga la lista (después de una descarga, para que diga «Reclamado»). */
  onReload?: () => void;
  showToast: (msg: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL RECLAMO, ADENTRO (rediseño del 10/11-sep-2026).
//
// Lo que cambió: la ficha dice FECHA DE FACTURA (la que mide los días; si falta
// lo dice en rojo y Editar la pide), CREADO EL (la fecha de creación se ve
// aquí, no en la tabla) y RECLAMADO («Reclamado 17 jul 2026» o «Sin reclamar»).
// Las facturas van separadas por «·» y en edición son chips. «En proceso» se
// fue de la pantalla (0 usos en 3 meses): un reclamo está por cobrar o cobrado.
// Quitar una nota de crédito PREGUNTA antes (es plata cobrada). Los motivos son
// la lista cerrada de siempre. Las fotos y el comprobante llegan FIRMADOS del
// servidor (el bucket es privado desde el 11-sep-2026).
// ─────────────────────────────────────────────────────────────────────────────
export default function ReclamoDetail({
  current, role, nota, setNota, editMode, setEditMode,
  editEmpresa, setEditEmpresa, editFacturas, setEditFacturas, editPedido, setEditPedido,
  editFechaFactura, setEditFechaFactura, editNotas, setEditNotas,
  editFacturaPdfPath, setEditFacturaPdfPath,
  editItems, setEditItems, editSaving,
  onStartEdit, toast, onBack, onBackToEmpresa, onBackToReclamos,
  onAddNota, onChangeEstado,
  onDeleteReclamo, onSaveEdit, onUploadFoto, uploadingFoto, onDeleteFoto,
  onAddSettlement, onRemoveSettlement, onReload,
  showToast,
  contacto,
}: Props) {
  const fotoRef = useRef<HTMLInputElement>(null);
  const [deleteFotoTarget, setDeleteFotoTarget] = useState<{ id: string; path: string } | null>(null);
  const [quitarNc, setQuitarNc] = useState<{ id: string; monto: number } | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [facturaBusy, setFacturaBusy] = useState(false);
  const [correoOpen, setCorreoOpen] = useState(false);
  const [descargaOpen, setDescargaOpen] = useState(false);
  const descargaRef = useRef<HTMLButtonElement>(null);

  // La IA rellena la cabecera en edición (campos editables); NO toca los ítems.
  function aplicarIA(data: FacturaIAData) {
    const emp = empresaDesdeIA(data.proveedor, data.marca, data.empresa_facturada);
    if (emp) setEditEmpresa(emp);
    if (data.nro_factura) setEditFacturas([data.nro_factura]);
    if (data.fecha_factura) setEditFechaFactura(data.fecha_factura);
    if (data.nro_orden_compra) setEditPedido(data.nro_orden_compra);
  }

  // 🔴 LA FACTURA DEL PROVEEDOR SE BAJA DE UN TOQUE (mockup 11-sep-2026). Antes
  // solo se podía «Ver» en el navegador y bajarla era otro paso. La URL ya
  // viene FIRMADA del servidor (bucket privado, vida corta): acá no se firma
  // nada ni se arma una ruta nueva.
  async function descargarFactura() {
    const url = current.factura_pdf_url;
    if (!url || facturaBusy) return;
    setFacturaBusy(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("No se pudo bajar la factura. Intenta de nuevo.");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${current.nro_reclamo}-factura.pdf`;
      a.click();
      URL.revokeObjectURL(href);
      showToast("Factura descargada");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo bajar la factura. Intenta de nuevo.");
    } finally {
      setFacturaBusy(false);
    }
  }

  async function descargar(tipo: "excel" | "pdf") {
    const busy = tipo === "excel" ? excelBusy : pdfBusy;
    if (busy) return;
    (tipo === "excel" ? setExcelBusy : setPdfBusy)(true);
    try {
      const res = await fetch(`/api/reclamos/proveedor/${encodeURIComponent(current.empresa)}/${tipo === "excel" ? "export-zip" : "export-pdf"}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reclamo_ids: [current.id] }),
      });
      if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err?.error || "No se pudo armar el archivo. Intenta de nuevo."); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reclamo-${current.nro_reclamo}-${hoyPanama()}.${tipo === "excel" ? "xlsx" : "pdf"}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`${tipo === "excel" ? "Excel" : "PDF"} descargado`);
      onReload?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo armar el archivo. Intenta de nuevo.");
    } finally {
      (tipo === "excel" ? setExcelBusy : setPdfBusy)(false);
    }
  }

  const items = current.reclamo_items ?? [];
  const seg = current.reclamo_seguimiento ?? [];
  const fotos = current.reclamo_fotos ?? [];
  const sub = calcSub(items);
  const totalsSub = editMode ? calcSub(editItems) : sub;
  const totalsEmpresa = editMode ? editEmpresa : current.empresa;
  const totalsTax = reclamoTaxes(totalsEmpresa, totalsSub);
  const dias = diasDesde(current.fecha_factura, hoyPanama());
  const pendiente = esPendiente(current);
  // Las columnas vacías no se dibujan (Género, Factura y PO cuando ninguna fila las trae).
  const conGenero = items.some((i) => !!i.genero);
  const conFactura = items.some((i) => !!i.nro_factura);
  const conPO = items.some((i) => !!i.nro_orden_compra);

  // Comprobante del reclamo (foto o PDF + nota opcional). La URL viene firmada
  // del servidor (bucket privado). Foto → lightbox; PDF → se abre en otra pestaña.
  const comprobanteEsPdf = /\.pdf(\?|$)/i.test(current.comprobante_path || current.comprobante_url || "");
  const comprobanteCard = current.comprobante_url ? (
    <div className="mb-3 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      {comprobanteEsPdf ? (
        <a href={current.comprobante_url} target="_blank" rel="noopener noreferrer" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-white text-red-600" title="Ver comprobante (PDF)">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
        </a>
      ) : (
        <button type="button" onClick={() => setLightboxSrc(current.comprobante_url!)} className="shrink-0" title="Ver comprobante">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.comprobante_url} alt="Comprobante" className="h-16 w-16 rounded-md border border-amber-200 object-cover" />
        </button>
      )}
      <div className="min-w-0">
        <div className="text-xs font-semibold text-amber-800">Comprobante de pago{comprobanteEsPdf ? " (PDF)" : ""}</div>
        {current.comprobante_nota
          ? <p className="mt-0.5 text-sm text-gray-600 whitespace-pre-wrap break-words">{current.comprobante_nota}</p>
          : <p className="mt-0.5 text-xs text-gray-400 italic">Sin nota</p>}
      </div>
    </div>
  ) : null;

  // ── Recuperación / notas de crédito ──
  const settlements = (current.reclamo_settlements ?? []).filter((s) => !s.deleted);
  const recuperado = settlements.reduce((s, x) => s + (Number(x.monto) || 0), 0);
  const reclamado = current.monto_reclamado_snapshot ?? reclamoTaxes(current.empresa, sub).total;
  const deltaRec = reclamado - recuperado;
  const pctRec = reclamado > 0 ? (recuperado / reclamado) * 100 : 0;
  const [ncOpen, setNcOpen] = useState(false);
  const [ncMonto, setNcMonto] = useState("");
  const [ncNum, setNcNum] = useState("");
  const [ncFecha, setNcFecha] = useState(() => hoyPanama());
  function submitNc() {
    const m = Number(ncMonto);
    if (!Number.isFinite(m) || m <= 0) { showToast("Escribe un monto recuperado mayor a 0."); return; }
    if (!ncFecha) { showToast("Falta la fecha."); return; }
    onAddSettlement([{ monto: m, nota_credito: ncNum.trim(), fecha: ncFecha }]);
    setNcOpen(false); setNcMonto(""); setNcNum("");
  }

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
        module="Reclamos"
        breadcrumbs={[
          { label: current.empresa, onClick: onBackToEmpresa ?? onBack },
          { label: current.nro_reclamo || "Reclamo" },
        ]}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
      <div className="-mt-2 mb-2 flex items-center flex-wrap">
        <button onClick={onBackToEmpresa ?? onBack} className="text-sm text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] px-2 -ml-2">← {current.empresa}</button>
        {onBackToReclamos && (
          <>
            <span className="text-gray-300">·</span>
            <button onClick={onBackToReclamos} className="text-sm text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] px-2">Todos los reclamos</button>
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
                <select value={editEmpresa} onChange={(e) => setEditEmpresa(e.target.value)} className="border-b border-gray-200 py-2.5 sm:py-1.5 text-base sm:text-sm outline-none bg-transparent min-h-[44px] xl:min-h-0">
                  {empresasParaElegir(editEmpresa).map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">Fecha de factura *</span>
                <input type="date" value={editFechaFactura} onChange={(e) => setEditFechaFactura(e.target.value)} className="border-b border-gray-200 py-2.5 sm:py-1.5 text-base sm:text-sm outline-none min-h-[44px] xl:min-h-0" />
              </label>
              <div className="sm:col-span-2">
                <FacturasChips facturas={editFacturas} onChange={setEditFacturas} />
              </div>
              {!esActiveShoes(editEmpresa) && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500">N° Pedido *</span>
                  <input type="text" value={editPedido} onChange={(e) => setEditPedido(e.target.value)} className="border-b border-gray-200 py-2.5 sm:py-1.5 text-base sm:text-sm outline-none min-h-[44px] xl:min-h-0" />
                </label>
              )}
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs text-gray-500">Notas</span>
                <textarea
                  value={editNotas}
                  onChange={(e) => { setEditNotas(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
                  rows={3}
                  className="rounded-md border border-gray-200 px-3 py-2 text-base sm:text-sm outline-none focus:border-black transition resize-y overflow-auto"
                  style={{ minHeight: "4.5rem", maxHeight: "12rem" }}
                />
              </label>
              <div className="sm:col-span-2 flex flex-col gap-1">
                <span className="text-xs text-gray-500">Factura (PDF)</span>
                <FacturaPdfUploader pdfUrl={current.factura_pdf_url} onUploaded={setEditFacturaPdfPath} onExtracted={aplicarIA} />
              </div>
            </div>
          ) : (
            /* Cabecera en UNA línea (mockup 11-sep-2026): factura · fecha de la
               factura · proveedor · marca · días; la orden de compra y «creado el»
               solo si aportan algo. */
            <p className="text-sm text-gray-500 mt-1 leading-relaxed" data-medir="reclamo-cabecera">
              Factura{facturasEnPantalla(current.nro_factura).includes("·") ? "s" : ""} <span className="text-gray-900 font-medium tabular-nums">{facturasEnPantalla(current.nro_factura) || "—"}</span>
              {" · "}
              {current.fecha_factura
                ? <span className="text-gray-900">{fmtDate(current.fecha_factura)}</span>
                : <span className="text-red-600">{FALTA_FECHA_FACTURA}</span>}
              {" · "}{current.proveedor || "—"}{current.marca ? ` · ${current.marca}` : ""}
              {dias !== null && <> · <span className="text-gray-900 font-medium tabular-nums">{dias} día{dias === 1 ? "" : "s"}</span></>}
              {!esActiveShoes(current.empresa) && current.nro_orden_compra && <> · OC {current.nro_orden_compra}</>}
              {current.created_at && <> · creado el {fmtDate(current.created_at.slice(0, 10))}</>}
            </p>
          )}
          {/* 🩸 El botón suelto «Ver factura» se RETIRÓ (mockup 11-sep-2026): la
              factura del proveedor vive ahora dentro de «Descargar», que la baja
              de un toque en vez de solo mostrarla. Era un botón más compitiendo
              con la fila de acciones para hacer MENOS. El visor de PDF no se
              perdió: sigue en `FacturaPdfUploader`, en la pantalla de edición. */}
        </div>
        {/* UN chip con lo único que importa: sin reclamar · reclamado · pagado. */}
        {editMode ? (
          <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">Editando</span>
        ) : (
          <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border ${!pendiente ? "bg-green-50 text-green-700 border-green-200" : estaReclamado(current) ? "bg-gray-100 text-gray-600 border-gray-200" : "bg-red-50 text-red-600 border-red-100 font-medium"}`}>
            {!pendiente ? "Pagado" : textoReclamado(current)}
          </span>
        )}
      </div>

      {/* UNA fila de botones (mockup 11-sep-2026): lo diario a la izquierda —
          Correo (principal), Descargar (Excel o PDF), «···» con Editar y
          Eliminar— y «Marcar como pagado» apartado a la derecha, que se usa
          pocas veces. En edición se vuelve Guardar / Cancelar. */}
      {editMode ? (
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <button onClick={onSaveEdit} disabled={editSaving} className="bg-black text-white px-6 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50 inline-flex items-center justify-center min-h-[44px]">
            {editSaving ? "Guardando…" : "Guardar"}
          </button>
          <button onClick={() => setEditMode(false)} disabled={editSaving} className="text-sm text-gray-400 hover:text-black transition disabled:opacity-50 inline-flex items-center justify-center min-h-[44px] px-2">Cancelar</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-6 flex-wrap pb-1">
          {pendiente && (
            <button onClick={() => setCorreoOpen(true)} className="bg-black text-white px-5 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all inline-flex items-center justify-center min-h-[44px]">Correo</button>
          )}
          <button ref={descargaRef} onClick={() => setDescargaOpen((v) => !v)} disabled={excelBusy || pdfBusy || facturaBusy} aria-haspopup="menu" aria-expanded={descargaOpen} className="text-sm border border-gray-200 px-4 rounded-md text-gray-600 hover:text-black hover:border-gray-400 transition inline-flex items-center justify-center gap-1 min-h-[44px] disabled:opacity-40">
            {excelBusy ? "Armando el Excel…" : pdfBusy ? "Armando el PDF…" : facturaBusy ? "Bajando la factura…" : "Descargar"} <span aria-hidden className="text-gray-400">⌄</span>
          </button>
          <DesplegableFlotante abierto={descargaOpen} anclaRef={descargaRef} onCerrar={() => setDescargaOpen(false)} role="menu" marca="reclamo-descargar" className="rounded-md border border-gray-200 bg-white shadow-lg py-1 min-w-[180px]">
            <button role="menuitem" onClick={() => { setDescargaOpen(false); void descargar("excel"); }} className="block w-full text-left text-sm px-4 min-h-[44px] hover:bg-gray-50">Descargar en Excel</button>
            <button role="menuitem" onClick={() => { setDescargaOpen(false); void descargar("pdf"); }} className="block w-full text-left text-sm px-4 min-h-[44px] hover:bg-gray-50">Descargar en PDF</button>
            {/* Solo si existe: no se ofrece bajar un archivo que nadie subió. */}
            {current.factura_pdf_url && (
              <button role="menuitem" onClick={() => { setDescargaOpen(false); void descargarFactura(); }} className="block w-full text-left text-sm px-4 min-h-[44px] hover:bg-gray-50">
                Factura del proveedor <span className="text-gray-400">PDF original</span>
              </button>
            )}
          </DesplegableFlotante>
          <OverflowMenu
            ariaLabel={`Más opciones del reclamo ${current.nro_reclamo}`}
            items={[
              { label: "Editar", onClick: onStartEdit },
              ...(role === "admin" ? [{ label: "Eliminar", onClick: () => onDeleteReclamo(current.id), destructive: true }] : []),
            ]}
          />
          {pendiente ? (
            <button onClick={() => onChangeEstado("Pagado")} className="ml-auto border border-gray-300 text-gray-700 px-4 rounded-md text-sm font-medium hover:bg-gray-50 active:scale-[0.97] transition-all inline-flex items-center justify-center gap-2 min-h-[44px]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Marcar como pagado
            </button>
          ) : (
            <button onClick={() => onChangeEstado("Creado")} className="ml-auto text-xs text-gray-400 hover:text-gray-700 transition inline-flex items-center justify-center min-h-[44px] px-2" title="Si fue un error: vuelve a la lista de por cobrar">← Volver a por cobrar</button>
          )}
        </div>
      )}

      {!editMode && comprobanteCard}

      {/* Recuperación / notas de crédito */}
      {(!pendiente || settlements.length > 0) && (
        <div className="mb-8 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-gray-700">Recuperación</div>
            <span className="text-xs font-medium text-emerald-700 tabular-nums">{pctRec.toFixed(0)}% recuperado</span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center"><div className="text-xs text-gray-500">Reclamado</div><div className="text-sm font-semibold tabular-nums mt-1">${fmt(reclamado)}</div></div>
            <div className="text-center"><div className="text-xs text-gray-500">Recuperado</div><div className="text-sm font-semibold tabular-nums mt-1 text-emerald-700">${fmt(recuperado)}</div></div>
            <div className="text-center"><div className="text-xs text-gray-500">{deltaRec >= 0 ? "Pendiente" : "A favor"}</div><div className={`text-sm font-semibold tabular-nums mt-1 ${deltaRec > 0 ? "text-amber-600" : "text-gray-500"}`}>${fmt(Math.abs(deltaRec))}</div></div>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden mb-4">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pctRec))}%` }} />
          </div>
          {settlements.length > 0 && (
            <ul className="divide-y divide-gray-100 mb-3">
              {settlements.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <span className="tabular-nums font-medium">${fmt(s.monto)}</span>
                    {s.nota_credito && <span className="text-gray-500"> · nota de crédito {s.nota_credito}</span>}
                    <span className="text-gray-400"> · {fmtDate(s.fecha)}</span>
                  </div>
                  {/* Quitar PREGUNTA antes: es plata cobrada. */}
                  <button onClick={() => setQuitarNc({ id: s.id, monto: Number(s.monto) || 0 })} className="text-xs text-gray-400 hover:text-red-600 transition shrink-0 ml-1 inline-flex items-center justify-center min-h-[44px] px-2 -my-2">Quitar</button>
                </li>
              ))}
            </ul>
          )}
          {ncOpen ? (
            <div className="rounded-md border border-gray-200 p-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500">Monto recuperado *</span>
                  <input type="number" inputMode="decimal" min="0" step="0.01" value={ncMonto} onChange={(e) => setNcMonto(e.target.value)} placeholder="0.00" className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-base sm:text-sm tabular-nums outline-none focus:border-black transition min-h-[44px]" />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Fecha *</span>
                  <input type="date" value={ncFecha} onChange={(e) => setNcFecha(e.target.value)} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]" />
                </label>
                <label className="col-span-2 block">
                  <span className="text-xs text-gray-500">N° nota de crédito (opcional)</span>
                  <input type="text" value={ncNum} onChange={(e) => setNcNum(e.target.value)} placeholder="Ej. 4020000422" className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-base sm:text-sm outline-none focus:border-black transition min-h-[44px]" />
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => { setNcOpen(false); setNcMonto(""); setNcNum(""); }} className="flex-1 rounded-md border border-gray-200 text-sm hover:bg-gray-50 transition inline-flex items-center justify-center min-h-[44px]">Cancelar</button>
                <button onClick={submitNc} className="flex-1 rounded-md bg-black text-sm text-white active:scale-[0.97] transition inline-flex items-center justify-center min-h-[44px]">Guardar la nota de crédito</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setNcOpen(true)} className="text-xs font-medium text-blue-600 hover:underline inline-flex items-center min-h-[44px] px-2 -mx-2 -mb-2">+ Agregar nota de crédito</button>
          )}
        </div>
      )}

      {/* Renglones — UNA sola tabla: editable in-place cuando editMode, read-only si no */}
      {(editMode || items.length > 0) && (
        <div className="mb-8">
          <div className="text-sm font-semibold text-gray-700 mb-3">Renglones</div>
          {editMode ? (
            <>
              <ScrollableTable minWidth={700} className="mb-4">
                <table className="w-full text-sm [&_td]:py-3 [&_th]:pb-3 [&_th]:px-5 [&_td]:px-5 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide font-medium text-gray-500">
                      <th className="pb-2 font-medium text-left">Estilo *</th>
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
                            {GENEROS.map((g) => <option key={g} value={g}>{generoLabel(g)}</option>)}
                          </select>
                        </td>
                        <td className="py-2 pr-1"><input type="number" min={0} value={item.cantidad} onChange={(e) => updateEditItem(idx, "cantidad", parseInt(e.target.value) || 0)} className="w-full border-b border-gray-200 py-1 text-sm outline-none text-right" /></td>
                        <td className="py-2 pr-1"><input type="number" step="0.50" min={0} value={item.precio_unitario} onChange={(e) => updateEditItem(idx, "precio_unitario", parseFloat(e.target.value) || 0)} className="w-full border-b border-gray-200 py-1 text-sm outline-none text-right" /></td>
                        <td className="py-2 pr-1">
                          <select value={item.motivo} onChange={(e) => updateEditItem(idx, "motivo", e.target.value)} className="w-full border-b border-gray-200 py-1 text-sm outline-none bg-transparent">
                            <option value="">--</option>
                            {DEFAULT_MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                            {item.motivo && !DEFAULT_MOTIVOS.includes(item.motivo) && <option value={item.motivo}>{item.motivo}</option>}
                          </select>
                        </td>
                        <td className="py-2 text-right tabular-nums text-gray-500 text-xs">${fmt((Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0))}</td>
                        <td className="py-2 text-center">{editItems.length > 1 && <button aria-label="Quitar renglón" title="Quitar renglón" onClick={() => setEditItems((p) => p.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-black text-sm inline-flex items-center justify-center min-w-[44px] min-h-[44px]">×</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
              <div className="flex flex-wrap items-center gap-x-4">
                <button onClick={() => setEditItems((p) => [...p, emptyItem()])} className="text-sm text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] px-2 -mx-2">+ Agregar renglón</button>
                <button onClick={() => setEditItems((p) => (p.length ? [...p, filaRepetida(p[p.length - 1])] : [emptyItem()]))} className="text-sm text-gray-700 hover:text-black transition inline-flex items-center min-h-[44px] px-2 -mx-2 font-medium">Repetir el anterior</button>
              </div>
            </>
          ) : (
            /* Medido (30-jul-2026): por debajo de `lg` la tabla de 10 columnas
               dejaba fuera PRECIO y SUBTOTAL; tarjetas hasta lg, tabla de ahí. */
            <div data-medir="reclamo-items">
              <ul className="lg:hidden space-y-2" data-vista="tarjetas">
                {items.map((item, i) => {
                  const cant = Number(item.cantidad) || 0;
                  const precio = Number(item.precio_unitario) || 0;
                  return (
                    <li key={i} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{item.referencia}</div>
                          {item.descripcion && <div className="text-xs text-gray-500 truncate">{item.descripcion}</div>}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs text-gray-400">Subtotal</div>
                          <div className="font-medium tabular-nums">${fmt(cant * precio)}</div>
                        </div>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <div className="flex justify-between gap-2"><dt className="text-gray-400">Cant.</dt><dd className="tabular-nums">{cant}</dd></div>
                        <div className="flex justify-between gap-2"><dt className="text-gray-400">Precio</dt><dd className="tabular-nums">${fmt(item.precio_unitario)}</dd></div>
                        <div className="flex justify-between gap-2"><dt className="text-gray-400">Talla</dt><dd className="text-gray-600 truncate">{item.talla || "—"}</dd></div>
                        {item.genero && <div className="flex justify-between gap-2"><dt className="text-gray-400">Género</dt><dd className="text-gray-600 truncate">{generoLabel(item.genero)}</dd></div>}
                        {item.motivo && <div className="col-span-2 flex justify-between gap-2"><dt className="text-gray-400 shrink-0">Motivo</dt><dd className="text-gray-600 text-right">{motivoEnPantalla(item.motivo)}</dd></div>}
                        {item.nro_factura && <div className="flex justify-between gap-2"><dt className="text-gray-400">Factura</dt><dd className="text-gray-600 truncate">{item.nro_factura}</dd></div>}
                        {item.nro_orden_compra && <div className="flex justify-between gap-2"><dt className="text-gray-400">PO</dt><dd className="text-gray-600 truncate">{item.nro_orden_compra}</dd></div>}
                      </dl>
                    </li>
                  );
                })}
              </ul>
              <div className="hidden lg:block" data-vista="tabla">
                <ScrollableTable minWidth={700}>
                  <table className="w-full text-sm [&_td]:py-3 [&_th]:pb-3">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="border-b border-gray-200 text-xs uppercase tracking-wide font-medium text-gray-500">
                        <th className="text-left pb-2 font-medium">Estilo</th>
                        <th className="text-left pb-2 font-medium">Descripción</th>
                        <th className="text-left pb-2 font-medium">Talla</th>
                        {conGenero && <th className="text-left pb-2 font-medium">Género</th>}
                        <th className="text-right pb-2 font-medium">Cant.</th>
                        <th className="text-right pb-2 font-medium">Precio</th>
                        <th className="text-right pb-2 font-medium">Subtotal</th>
                        <th className="text-left pb-2 font-medium">Motivo</th>
                        {conFactura && <th className="text-left pb-2 font-medium">Factura</th>}
                        {conPO && <th className="text-left pb-2 font-medium">PO</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={i} className="border-b border-gray-200">
                          <td className="py-2 tabular-nums">{item.referencia}</td>
                          <td className="py-2 text-gray-500">{item.descripcion}</td>
                          <td className="py-2 text-gray-500">{item.talla || "—"}</td>
                          {conGenero && <td className="py-2 text-gray-500">{generoLabel(item.genero) || "—"}</td>}
                          <td className="py-2 text-right tabular-nums">{Number(item.cantidad) || 0}</td>
                          <td className="py-2 text-right tabular-nums">${fmt(item.precio_unitario)}</td>
                          <td className="py-2 text-right tabular-nums font-medium">${fmt((Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0))}</td>
                          <td className="py-2 text-gray-500">{motivoEnPantalla(item.motivo)}</td>
                          {conFactura && <td className="py-2 text-gray-500">{item.nro_factura}</td>}
                          {conPO && <td className="py-2 text-gray-500">{item.nro_orden_compra}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableTable>
              </div>
            </div>
          )}

          {/* Los totales ABAJO, a la derecha, uno debajo del otro — como el pie
              de la factura del proveedor (Daniel: *«no es mejor ponerlo abajo tal
              cual como viene en la factura en ese orden»*). En edición se
              recalculan en vivo desde los renglones editados. */}
          <table className="ml-auto mt-4 text-sm" data-medir="reclamo-totales">
            <caption className="sr-only">Totales</caption>
            <tbody>
              <tr><td className="text-gray-500 pr-6 py-0.5">Subtotal</td><td className="text-right tabular-nums py-0.5">{fmt(totalsSub)}</td></tr>
              <tr><td className="text-gray-500 pr-6 py-0.5">Importación {impLabel(totalsEmpresa)}</td><td className="text-right tabular-nums py-0.5">{fmt(totalsTax.importacion)}</td></tr>
              {totalsTax.hasItbms && <tr><td className="text-gray-500 pr-6 py-0.5">ITBMS ({itbmsLabel(totalsEmpresa)})</td><td className="text-right tabular-nums py-0.5">{fmt(totalsTax.itbms)}</td></tr>}
              <tr className="border-t border-gray-300"><td className="font-semibold pr-6 pt-1.5">Total</td><td className="text-right tabular-nums font-semibold pt-1.5">${fmt(totalsTax.total)}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Fotos — llegan firmadas del servidor (bucket privado). */}
      <div className="mb-8">
        <div className="text-sm font-semibold text-gray-700 mb-3">Fotos</div>
        {fotos.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 mb-3" style={{ scrollSnapType: "x mandatory" }}>
            {fotos.filter((f) => !!f.url).map((f) => (
              <div key={f.id} className="relative flex-shrink-0 cursor-pointer" style={{ scrollSnapAlign: "start" }} onClick={() => setLightboxSrc(f.url)}>
                <img src={f.url} alt="" className="w-24 h-24 sm:w-28 sm:h-28 object-cover rounded-lg border border-gray-200" />
                <button aria-label="Eliminar foto" title="Eliminar foto" onClick={(e) => { e.stopPropagation(); setDeleteFotoTarget({ id: f.id, path: f.storage_path }); }} className="absolute -top-1.5 -right-1.5 w-7 h-7 bg-black text-white rounded-full text-xs flex items-center justify-center after:absolute after:-inset-2 after:rounded-full after:content-['']">×</button>
              </div>
            ))}
          </div>
        )}
        {fotos.length < 5 ? (
          <>
            <input ref={fotoRef} type="file" accept="image/*" multiple className="hidden" disabled={uploadingFoto} onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) onUploadFoto(files); if (fotoRef.current) fotoRef.current.value = ""; }} />
            <button onClick={() => fotoRef.current?.click()} disabled={uploadingFoto} className="w-full sm:w-auto border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-lg px-6 py-4 sm:py-3 flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition active:bg-gray-50 min-h-[44px] disabled:opacity-50">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span className="text-sm font-medium">{uploadingFoto ? "Subiendo…" : "Agregar fotos"}</span>
              <span className="text-xs text-gray-300">({fotos.length} de 5)</span>
            </button>
          </>
        ) : (
          <p className="text-xs text-gray-400">Ya están las 5 fotos que caben en un reclamo.</p>
        )}
      </div>

      {!editMode && current.notas && <p className="text-sm text-gray-400 mb-6">Notas: {current.notas}</p>}

      {/* Seguimiento */}
      <div className="mb-8">
        <div className="text-sm font-semibold text-gray-700 mb-3">Seguimiento</div>
        <div className="flex gap-2 mb-3">
          <input type="text" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Agregar nota..." className="flex-1 border-b border-gray-200 py-3 sm:py-1.5 text-base sm:text-sm outline-none min-h-[44px] xl:min-h-0" />
          <button onClick={onAddNota} disabled={!nota.trim()} className="text-sm bg-black text-white px-4 rounded-full hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50 inline-flex items-center justify-center min-h-[44px] shrink-0">Agregar</button>
        </div>
        {seg.map((s) => {
          const leida = notaEnPantalla(s.nota, s.autor);
          return (
            <div key={s.id} className="border-b border-gray-50 py-2">
              <p className="text-sm">{leida.texto}</p>
              <p className="text-xs text-gray-400 mt-0.5">{fmtDate(s.created_at.slice(0, 10))}, {new Date(s.created_at).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit" })}{leida.autor ? ` — ${leida.autor}` : ""}</p>
            </div>
          );
        })}
      </div>

      <ConfirmDeleteModal
        open={!!deleteFotoTarget}
        title="¿Eliminar esta foto?"
        description="Se elimina la foto de evidencia del reclamo."
        onConfirm={() => { if (deleteFotoTarget) { onDeleteFoto(deleteFotoTarget.id, deleteFotoTarget.path); setDeleteFotoTarget(null); } }}
        onCancel={() => setDeleteFotoTarget(null)}
      />
      <ConfirmDeleteModal
        open={!!quitarNc}
        title="¿Quitar esta nota de crédito?"
        description={`Se quita el registro de $${fmt(quitarNc?.monto ?? 0)} recuperado. Si te equivocas, vuelve a agregarla.`}
        confirmLabel="Quitar"
        loadingLabel="Quitando…"
        onConfirm={() => { if (quitarNc) { onRemoveSettlement(quitarNc.id); setQuitarNc(null); } }}
        onCancel={() => setQuitarNc(null)}
      />

      <FotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      <EnviarProveedorModal
        open={correoOpen}
        empresa={current.empresa}
        reclamoIds={[current.id]}
        defaultTo={contacto?.correo || ""}
        contactoNombre={contacto?.nombre_contacto || contacto?.nombre}
        count={1}
        defaultSubject={`Reclamo ${current.nro_reclamo} — ${current.empresa}`}
        onClose={() => setCorreoOpen(false)}
        onSent={(msg) => { showToast(msg); setCorreoOpen(false); onReload?.(); }}
      />

      <Toast message={toast} />
      </div>
    </div>
  );
}
