"use client";

import { useRef, useState } from "react";
import { fmt, fmtDate } from "@/lib/format";
import { RItem, LocalFoto } from "./types";
import { AccordionContent, FotoLightbox } from "@/components/ui";
import { Ayuda } from "@/components/shared/Ayuda";
import { EMPRESAS_MAP, empresaDesdeIA, reclamoTaxes, esActiveShoes, impLabel, itbmsLabel } from "./constants";
import { empresasParaElegir } from "@/lib/reclamos/empresas-con-reclamos";
import FacturaPdfUploader, { type FacturaIAData } from "./FacturaPdfUploader";
import FacturasChips from "./FacturasChips";
import ItemsEditor from "./ItemsEditor";
import RenglonesDesdeFactura from "./RenglonesDesdeFactura";
import { itemsAGuardar, resumenRenglones, type LineaFactura } from "@/lib/reclamos/lineas-factura";
import { FALTA_PDF } from "@/lib/reclamos/validate";

interface Props {
  /** Banner de restaurar borrador (lo arma el padre). */
  draftBanner?: React.ReactNode;
  fEmpresa: string;
  setFEmpresa: (v: string) => void;
  fFacturas: string[];
  setFFacturas: (v: string[]) => void;
  fFechaFactura: string;
  setFFechaFactura: (v: string) => void;
  fPedido: string;
  setFPedido: (v: string) => void;
  fNotas: string;
  setFNotas: (v: string) => void;
  /** Renglones tecleados a mano (el camino de siempre). */
  fItems: RItem[];
  setFItems: React.Dispatch<React.SetStateAction<RItem[]>>;
  /** Las líneas que el lector sacó del PDF. */
  fLineas: LineaFactura[];
  setFLineas: (v: LineaFactura[]) => void;
  /** Las líneas marcadas para reclamar, por índice. */
  fSeleccion: Record<number, RItem>;
  setFSeleccion: React.Dispatch<React.SetStateAction<Record<number, RItem>>>;
  facturaPdfPath: string | null;
  setFacturaPdfPath: (v: string | null) => void;
  savedReclamoId: string | null;
  savedNroReclamo: string;
  pendingFotos: LocalFoto[];
  onAddFoto: (files: File[]) => void;
  onRemoveFoto: (lf: LocalFoto) => void;
  onRetryFotos: () => void;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
  onViewSaved: () => void;
  onResetAndCreateAnother: () => void;
  isEditing?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// NUEVO RECLAMO — UNA SOLA PANTALLA QUE SE ABRE EN ORDEN (10/11-sep-2026).
//
// 1. El PDF de la factura, OBLIGATORIO y primero (Daniel: *«PDF obligatorio»*).
//    El lector llena proveedor, número, fecha de factura, orden de compra y, si
//    el PDF lo trae, la empresa facturada (se confirma en el desplegable, sin
//    bloquear). Y saca los RENGLONES.
// 2. ¿Qué reclamas? Se busca en la factura y se marca (RenglonesDesdeFactura).
//    Si el lector no sacó líneas, la tabla de siempre (ItemsEditor) con
//    «Repetir el anterior».
// 3. Fotos, como estaban (Daniel: *«dejar como está»*). Notas.
//
// Se fueron «Paso 1 de 4» y «Mostrar todos los campos»: era una sola pantalla
// diciendo que eran cuatro. Los motivos son la lista cerrada de siempre.
// ─────────────────────────────────────────────────────────────────────────────
export default function ReclamoForm({
  fEmpresa, setFEmpresa, fFacturas, setFFacturas, fFechaFactura, setFFechaFactura,
  fPedido, setFPedido, fNotas, setFNotas, fItems, setFItems, fLineas, setFLineas, fSeleccion, setFSeleccion,
  facturaPdfPath, setFacturaPdfPath,
  savedReclamoId, savedNroReclamo, pendingFotos, onAddFoto, onRemoveFoto, onRetryFotos,
  saving, error, onSave, onCancel, onViewSaved, onResetAndCreateAnother,
  isEditing, draftBanner,
}: Props) {
  const formFotoRef = useRef<HTMLInputElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [leida, setLeida] = useState<FacturaIAData | null>(null);
  const [aMano, setAMano] = useState(false);
  const fotosError = pendingFotos.some((f) => f.status === "error");
  const empInfo = fEmpresa ? EMPRESAS_MAP[fEmpresa] : null;
  const hayPdf = !!facturaPdfPath || !!isEditing;
  const hayLineas = fLineas.length > 0;
  const itemsFinales = itemsAGuardar(fSeleccion, fItems, hayLineas);
  const resumen = resumenRenglones(itemsFinales);
  const fTax = reclamoTaxes(fEmpresa, resumen.subtotal);
  const faltaPdf = !hayPdf;

  // Lo que leyó el lector va a la cabecera (campos editables) y a la lista de
  // renglones; NO marca ningún renglón: eso lo hace Andrea.
  function aplicarIA(data: FacturaIAData) {
    setLeida(data);
    const emp = empresaDesdeIA(data.proveedor, data.marca, data.empresa_facturada);
    if (emp) setFEmpresa(emp);
    if (data.nro_factura) setFFacturas([data.nro_factura]);
    if (data.fecha_factura) setFFechaFactura(data.fecha_factura);
    if (data.nro_orden_compra) setFPedido(data.nro_orden_compra);
    setFLineas(data.lineas);
    setFSeleccion({});
  }

  const leidaTexto = leida
    ? [leida.proveedor, leida.nro_factura ? `factura ${leida.nro_factura}` : null, leida.fecha_factura ? fmtDate(leida.fecha_factura) : null, leida.nro_orden_compra ? `OC ${leida.nro_orden_compra}` : null, `${leida.lineas.length} renglón${leida.lineas.length === 1 ? "" : "es"}`].filter(Boolean).join(" · ")
    : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 -mt-2 mb-2">
        <button onClick={onCancel} className="hover:text-black transition inline-flex items-center min-h-[44px] px-2 -ml-2">Reclamos</button>
        <span className="text-gray-300">/</span>
        <span className="text-gray-600 font-medium">Nuevo Reclamo</span>
      </nav>
      {draftBanner}
      <h1 className="sr-only">Nuevo Reclamo</h1>

      {/* ── 1. La factura (PDF), obligatoria y primero ── */}
      <div className="mb-10">
        <div className="flex items-center gap-1 mb-3">
          <div className="text-sm font-semibold text-gray-900">Factura del proveedor (PDF) *</div>
          <Ayuda titulo="Qué hace la IA" className="-my-2">
            <p>
              Sube el PDF y la IA rellena proveedor, marca, factura, fecha y pedido, y saca los renglones de la factura para que marques cuáles reclamas. Revisa y corrige.
            </p>
          </Ayuda>
        </div>
        <div className="max-w-xl">
          <FacturaPdfUploader onUploaded={setFacturaPdfPath} onExtracted={aplicarIA} />
        </div>
        {leidaTexto && <p className="text-sm text-gray-500 mt-2">Leída: {leidaTexto}</p>}
      </div>

      <AccordionContent open={hayPdf} duration={200}>
        {/* ── 2. La cabecera, ya llena: se confirma ── */}
        <div className="mb-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-12 gap-y-5">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Empresa *</label>
              <select value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)} className="border-b border-gray-200 py-3 xl:py-1.5 text-base xl:text-sm text-black outline-none bg-transparent">
                <option value="">Seleccionar...</option>
                {empresasParaElegir(fEmpresa).map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              {empInfo && <p className="text-xs text-gray-400 mt-1">Proveedor: {empInfo.proveedor} | Marca: {empInfo.marca}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Fecha de factura *</label>
              <input type="date" value={fFechaFactura} onChange={(e) => setFFechaFactura(e.target.value)} className="border-b border-gray-200 py-3 xl:py-1.5 text-base xl:text-sm text-black outline-none" />
            </div>
            {!esActiveShoes(fEmpresa) && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">N° Pedido *</label>
                <input type="text" value={fPedido} onChange={(e) => setFPedido(e.target.value)} placeholder="Ej. 10059874" className="border-b border-gray-200 py-3 xl:py-1.5 text-base xl:text-sm text-black outline-none" />
              </div>
            )}
            <div className="sm:col-span-3">
              <FacturasChips facturas={fFacturas} onChange={setFFacturas} />
            </div>
          </div>
        </div>

        {/* ── 3. Los renglones ── */}
        <div className="mb-10">
          {hayLineas ? (
            <>
              <RenglonesDesdeFactura lineas={fLineas} seleccion={fSeleccion} setSeleccion={setFSeleccion} />
              <div className="mt-4">
                {aMano ? (
                  <ItemsEditor items={fItems} setItems={setFItems} titulo="Renglones que no están en la factura" />
                ) : (
                  <button type="button" onClick={() => setAMano(true)} className="text-sm text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] px-2 -mx-2">¿No está en la factura? Agregar un renglón a mano</button>
                )}
              </div>
            </>
          ) : (
            <ItemsEditor items={fItems} setItems={setFItems} />
          )}
          <div className="mt-6 text-right text-sm space-y-1">
            <div className="text-gray-500">{resumen.renglones} renglón{resumen.renglones === 1 ? "" : "es"} · {resumen.piezas} pieza{resumen.piezas === 1 ? "" : "s"}</div>
            <div>Subtotal: <span className="tabular-nums font-medium">${fmt(resumen.subtotal)}</span></div>
            <div className="text-gray-400">Importación ({impLabel(fEmpresa)}): ${fmt(fTax.importacion)}</div>
            {fTax.hasItbms && <div className="text-gray-400">ITBMS ({itbmsLabel(fEmpresa)} s/imp.): ${fmt(fTax.itbms)}</div>}
            <div className="text-lg font-semibold">Total: ${fmt(fTax.total)}</div>
          </div>
        </div>

        {/* ── 4. Fotos (como estaban) ── */}
        <div className="mb-10">
          <div className="flex items-center gap-1 mb-3">
            <div className="text-sm font-semibold text-gray-900">Fotos <span className="font-normal text-gray-400">(opcional)</span></div>
            <Ayuda titulo="Cuándo se guardan" className="-my-2">
              <p>Adjunta las fotos ahora; se guardan junto con el reclamo en un solo paso.</p>
            </Ayuda>
          </div>

          {pendingFotos.length > 0 && (
            <div className="flex flex-wrap gap-4 mb-3">
              {pendingFotos.map((f) => {
                const src = f.uploaded?.url || f.previewUrl;
                return (
                  <div key={f.localId} className="relative">
                    <img src={src} alt="" onClick={() => setLightboxSrc(src)} className={`w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg border cursor-pointer ${f.status === "error" ? "border-red-400" : "border-gray-200"}`} />
                    {f.status === "uploading" && (
                      <div className="absolute inset-0 rounded-lg bg-white/70 flex items-center justify-center">
                        <span className="w-5 h-5 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
                      </div>
                    )}
                    {f.status === "done" && (
                      <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 bg-green-600 rounded-full flex items-center justify-center border-2 border-white">
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
                      </div>
                    )}
                    {f.status === "error" && (
                      <div className="absolute inset-0 rounded-lg bg-red-50/80 flex items-center justify-center pointer-events-none">
                        <span className="text-red-600 text-xs font-semibold">Falló</span>
                      </div>
                    )}
                    <button type="button" aria-label="Quitar foto" title="Quitar foto" onClick={() => onRemoveFoto(f)} className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-black text-white rounded-full text-xs flex items-center justify-center after:absolute after:-inset-2.5 after:rounded-full after:content-['']">×</button>
                  </div>
                );
              })}
            </div>
          )}

          {fotosError && (
            <div className="mb-3 text-xs">
              <p className="text-red-600 font-medium">Algunas fotos no se subieron:</p>
              <ul className="mt-1 space-y-0.5">
                {pendingFotos.filter((f) => f.status === "error").map((f) => (
                  <li key={f.localId} className="text-red-500">• {f.file.name}: {f.error}</li>
                ))}
              </ul>
              {savedReclamoId && (
                <button type="button" onClick={onRetryFotos} disabled={saving} className="mt-2 inline-flex items-center justify-center gap-1 font-medium border border-red-300 text-red-600 rounded-full px-3 min-h-[44px] hover:bg-red-50 disabled:opacity-50">
                  {saving ? "Reintentando…" : "Reintentar fotos"}
                </button>
              )}
            </div>
          )}

          {!savedReclamoId && (pendingFotos.length < 5 ? (
            <>
              <input ref={formFotoRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) onAddFoto(files); if (formFotoRef.current) formFotoRef.current.value = ""; }} />
              <button
                type="button"
                onClick={() => formFotoRef.current?.click()}
                disabled={saving}
                className="w-full sm:w-auto border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-lg px-6 py-4 sm:py-3 flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition active:bg-gray-50 min-h-[44px] disabled:opacity-50"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                <span className="text-sm font-medium">Agregar fotos</span>
                <span className="text-xs text-gray-300">({pendingFotos.length} de 5)</span>
              </button>
            </>
          ) : (
            <p className="text-xs text-gray-400">Ya están las 5 fotos que caben en un reclamo.</p>
          ))}
        </div>

        {/* ── Notas ── */}
        <div className="mb-10">
          <div className="text-sm font-semibold text-gray-900 mb-3">Notas <span className="font-normal text-gray-400">(opcional)</span></div>
          <div className="max-w-2xl">
            <textarea value={fNotas} onChange={(e) => setFNotas(e.target.value)} rows={2} placeholder="Algo más que el proveedor deba saber…" className="w-full border-b border-gray-200 py-3 xl:py-1.5 text-base xl:text-sm text-black outline-none resize-none" />
          </div>
        </div>
      </AccordionContent>

      {/* ── Acciones ── */}
      {savedReclamoId ? (
        <div className="mt-8 border-t border-gray-200 pt-6">
          <div className={`flex items-center gap-3 mb-6 p-4 rounded-lg ${saving ? "bg-gray-50" : fotosError ? "bg-amber-50" : "bg-green-50"}`}>
            {saving ? (
              <span className="w-5 h-5 border-2 border-gray-300 border-t-black rounded-full animate-spin flex-shrink-0" />
            ) : fotosError ? (
              <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold leading-none">!</div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </div>
            )}
            <div>
              <p className="text-sm font-medium">
                {saving ? "Guardando reclamo y fotos…" : fotosError ? `${savedNroReclamo} guardado · faltan fotos` : pendingFotos.length > 0 ? `${savedNroReclamo} guardado con sus fotos` : `${savedNroReclamo} guardado`}
              </p>
              <p className="text-xs text-gray-500">
                {saving ? "No cierres esta pantalla." : fotosError ? "El reclamo quedó guardado, pero algunas fotos no subieron. Reintenta arriba." : pendingFotos.length > 0 ? "Reclamo y fotos subidos correctamente." : "Reclamo guardado. Puedes agregar fotos desde el reclamo."}
              </p>
            </div>
          </div>
          <button onClick={onViewSaved} disabled={saving} className="bg-black text-white px-6 rounded-md text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 inline-flex items-center justify-center min-h-[44px]">Ver reclamo →</button>
          <button onClick={onResetAndCreateAnother} disabled={saving} className="text-sm text-gray-400 hover:text-black transition ml-2 disabled:opacity-50 inline-flex items-center justify-center min-h-[44px] px-2">Crear otro reclamo</button>
        </div>
      ) : (
        <div className="mt-8">
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
            <button onClick={onSave} disabled={saving || faltaPdf} className="flex-1 sm:flex-none bg-black text-white px-6 py-3 sm:py-2.5 rounded-md text-base sm:text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-50 min-h-[44px]">
              {saving ? "Guardando…" : "Guardar reclamo"}
            </button>
            <button onClick={onCancel} className="text-sm text-gray-400 hover:text-black transition inline-flex items-center justify-center min-h-[44px] px-2">Cancelar</button>
            {faltaPdf && <span className="text-sm text-gray-500">{FALTA_PDF}</span>}
          </div>
        </div>
      )}

      <FotoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
  );
}
