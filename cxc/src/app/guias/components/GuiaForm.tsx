"use client";

// Formulario de guía (crear y editar).
//
// Rediseño jul-2026 — "quiero al crear guía que sea super minimalista … se ve
// trabado y no se ve bien". Lo que cambió, y por qué:
//
//  1. **En el iPhone ya no hay tabla.** El detalle del envío era una tabla de 7
//     columnas con `minWidth={800}` dentro de una pantalla de 390 px: para
//     llegar a "Bultos" había que arrastrar ~410 px de lado. Eso es lo "trabado".
//     Ahora en móvil cada envío es una TARJETA con los campos apilados a lo
//     ancho, y la tabla densa queda solo en escritorio (patrón dual que el
//     módulo ya usaba en GuiasList).
//
// Ajuste de iPad (jul-2026) — "sobre guia, tambien haslo modo ipad". El corte
// tarjeta/tabla estaba en `md:` (768 px), que es EXACTAMENTE el ancho de un iPad
// vertical: el iPad caía del lado de la tabla. Medido en producción, con la barra
// lateral (`md:` en adelante) comiéndose 224 px del ancho:
//
//   768×1024  →  tabla, quedaban 496 px útiles para 720 de tabla → 224 px de
//                arrastre horizontal DENTRO de la tabla (el cuerpo de la página
//                nunca scrolleó de lado: lo contiene el ScrollableTable)
//   834×1194  →  tabla, 158 px de arrastre
//   1024+     →  tabla sin arrastre, pero con los campos en 34 px de alto
//
// Decisión: **el corte pasa a `lg:` (1024 px)**. En vertical el iPad no tiene
// ancho para 7 columnas —496-562 px útiles dan ~90 px por campo— así que va a
// tarjetas, igual que el iPhone; en horizontal sí sobra (752-1094 px) y se queda
// la tabla. Lo táctil se resuelve aparte, por tipo de puntero — ver CTRL_BASE.
//  2. **Cliente cerrado contra el directorio, con "Otro" explícito** (ver
//     ClientePicker.tsx). Escribir a mano dejó de ser un accidente.
//  3. **Empresa cerrada: las 8 del grupo, en un `<select>` nativo.** El
//     combobox escribible se fue. En iOS un `<select>` abre la rueda del
//     sistema: 44 px garantizados por el sistema operativo y cero componente
//     propio que mantener. Las guías viejas con texto sucio conservan su valor
//     como opción "(como estaba)" — ver `opcionesEmpresa`.
//  4. **El rojo prematuro se murió.** Un campo se marca como "tocado" cuando el
//     usuario lo CAMBIA, nunca al salir de él. Mirar el desplegable de empresa y
//     cerrarlo ya no deja el borde rojo con "Campo obligatorio" debajo.
//  5. **Las marcas de error van por fila (`uid`), no por posición.** Borrar una
//     fila ya no deja el rojo pegado a la de al lado.
//  6. Un solo par label/campo (`Campo` + `ctrl`) para todo el formulario, en vez
//     de las mismas clases repetidas a mano en 6 lugares con string-replace.
//
// Test manual de regresión — correr tras tocar GuiaForm o saveGuia:
//   1. Abrir una guía existente (ej GT-042) en edición
//   2. Click "+ Agregar envío" tres veces seguidas
//   3. NO debe redirigir al listado /guias ni limpiar el form
//   4. El auto-save silencioso dispara cada 1.5s sin perder el contexto
//   5. Click "Guardar" final sí debe redirigir al listado

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { GuiaItem, ModoEntrega, Transportista } from "./types";
import AddNewInline from "./AddNewInline";
import ClientePicker from "./ClientePicker";
import { ScrollableTable } from "@/components/ui";
import { EMPRESAS_CANONICAS, claveCampo, opcionesEmpresa } from "./guia-form-logic";

interface GuiaFormProps {
  editingId: string | null;
  formNumero: number;
  fecha: string;
  setFecha: (v: string) => void;
  modoEntrega: ModoEntrega;
  setModoEntrega: (v: ModoEntrega) => void;
  transportistaId: string | null;
  setTransportistaId: (v: string | null) => void;
  entregadoPor: string;
  setEntregadoPor: (v: string) => void;
  observaciones: string;
  setObservaciones: (v: string) => void;
  numeroGuiaTransp: string;
  setNumeroGuiaTransp: (v: string) => void;
  items: GuiaItem[];
  transportistas: Transportista[];
  direcciones: string[];
  validationErrors: Set<string>;
  error: string | null;
  saving: boolean;
  onAddDireccion: (v: string) => void;
  onUpdateItem: (idx: number, field: keyof GuiaItem, value: string | number) => void;
  onUpdateItemFields: (idx: number, partial: Partial<GuiaItem>) => void;
  onAddRow: () => void;
  onRemoveRow: (idx: number) => void;
  onRestoreRow: (idx: number, fila: GuiaItem) => void;
  onSave: (opts?: { silent?: boolean }) => void;
  onCancel: () => void;
}

// ── Primitivas del formulario ────────────────────────────────────────────────
// Un solo lugar para el aspecto de labels y campos. En móvil el campo mide 44 px
// y usa text-base (con 14px Safari hace zoom al enfocar); en escritorio vuelve a
// la densidad de siempre.
//
// El alto TÁCTIL no se suelta por ANCHO, sino por TIPO DE PUNTERO. Un iPad en
// horizontal mide 1024-1366 px —más que muchas laptops— pero se sigue usando con
// el dedo, y soltar los 44 px en `md:` dejaba los campos en 34 px justo ahí
// (medido: 22 controles por debajo de 44 en los 6 tamaños de iPad).
// `(pointer: fine)` = hay mouse o trackpad → densidad de escritorio; en un iPad
// (pointer: coarse) los 44 px se conservan en las dos orientaciones. El 1440 con
// mouse que Daniel ya aprobó no cambia ni un píxel.
//
// Ojo: las clases van ESCRITAS COMPLETAS y nunca interpoladas — Tailwind escanea
// el texto del archivo, así que un `${VARIANTE}py-1.5` no generaría nada.

const CTRL_BASE =
  "w-full border-b bg-transparent outline-none transition focus:border-black " +
  "text-base md:text-sm " +
  "py-2.5 min-h-[44px] " +
  "md:[@media(pointer:fine)]:py-1.5 md:[@media(pointer:fine)]:min-h-0";

function ctrl(error: boolean, extra = ""): string {
  return `${CTRL_BASE} ${error ? "border-red-400" : "border-gray-200"} ${extra}`;
}

const LABEL = "text-xs uppercase tracking-[0.05em] text-gray-400 mb-1 flex items-center gap-1.5";

function Campo({
  label,
  requerido = false,
  nota,
  accion,
  htmlFor,
  children,
}: {
  label: string;
  requerido?: boolean;
  nota?: string;
  accion?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      {/* `accion` va FUERA del <label>: un botón adentro de un label activa
          también el campo asociado (tocar "＋" abría el select). */}
      <div className={LABEL}>
        <label htmlFor={htmlFor}>
          {label}
          {requerido && <span className="text-red-500"> *</span>}
        </label>
        {nota && <span className="text-gray-300 normal-case tracking-normal">{nota}</span>}
        {accion}
      </div>
      {children}
    </div>
  );
}

/**
 * Los dos layouts (tarjeta móvil y tabla de escritorio) se renderizan a la vez;
 * uno lo esconde el CSS. Por eso el `id` lleva el layout: dos elementos con el
 * MISMO id son HTML inválido y, peor, el `htmlFor` del label termina apuntando
 * al campo del otro layout (tocar la etiqueta enfocaría un campo invisible).
 */
type Layout = "m" | "d";
function idCampo(item: Pick<GuiaItem, "uid">, campo: string, layout: Layout): string {
  return `${campo}-${item.uid}-${layout}`;
}

function ErrorCampo({ children = "Campo obligatorio" }: { children?: ReactNode }) {
  return <p className="text-red-500 text-xs mt-0.5">{children}</p>;
}

export default function GuiaForm({
  editingId, formNumero, fecha, setFecha,
  modoEntrega, setModoEntrega, transportistaId, setTransportistaId,
  entregadoPor, setEntregadoPor, observaciones, setObservaciones,
  numeroGuiaTransp, setNumeroGuiaTransp,
  items, transportistas, direcciones,
  validationErrors, error, saving,
  onAddDireccion,
  onUpdateItem, onUpdateItemFields, onAddRow, onRemoveRow, onRestoreRow, onSave, onCancel,
}: GuiaFormProps) {
  const totalBultos = items.reduce((s, i) => s + (i.bultos || 0), 0);

  // ── "Tocado" = el usuario CAMBIÓ el campo ──────────────────────────────────
  // Antes se marcaba en el onBlur, así que mirar un desplegable y cerrarlo
  // dejaba el campo en rojo sin haber escrito nada. Un campo no puede quedar en
  // error por haberlo mirado. Al guardar, `validationErrors` pinta todo lo que
  // falte igual, así que nada se escapa.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  function marcarTocado(clave: string) {
    setTouched((prev) => (prev.has(clave) ? prev : new Set(prev).add(clave)));
  }
  function hayError(clave: string, valor: string): boolean {
    return validationErrors.has(clave) || (touched.has(clave) && !valor.trim());
  }

  // Dynamic "Despachado por" list (persisted in localStorage)
  const DEFAULT_ENTREGADORES = ["Julio", "Rodrigo"];
  const [entregadores, setEntregadores] = useState(DEFAULT_ENTREGADORES);
  const [entregadoPorOtro, setEntregadoPorOtro] = useState("");
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("fg_entregadores") || "[]") as string[];
      const merged = [...DEFAULT_ENTREGADORES];
      for (const s of stored) { if (s && !merged.includes(s)) merged.push(s); }
      setEntregadores(merged);
    } catch { /* */ }
  }, []);
  function addEntregador(name: string) {
    if (!name.trim()) return;
    const n = name.trim();
    const updated = [...entregadores, n];
    setEntregadores(updated);
    const custom = updated.filter(s => !DEFAULT_ENTREGADORES.includes(s));
    localStorage.setItem("fg_entregadores", JSON.stringify(custom));
    setEntregadoPor(n);
    setEntregadoPorOtro("");
  }

  // "Más usados arriba": clientes (por cliente_codigo) y orden de las 8 empresas
  // canónicas, ambos por frecuencia de uso en guías. Aditivo y best-effort.
  const [clientesTop, setClientesTop] = useState<{ codigo: string; nombre: string }[]>([]);
  const [empresaOptions, setEmpresaOptions] = useState<string[]>([]);
  useEffect(() => {
    let cancel = false;
    fetch("/api/guias/frecuencias", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancel || !d) return;
        if (Array.isArray(d.clientes)) setClientesTop(d.clientes);
        if (Array.isArray(d.empresas)) setEmpresaOptions(d.empresas);
      })
      .catch(() => { /* offline: cae a las 8 canónicas en su orden de siempre */ });
    return () => { cancel = true; };
  }, []);
  const empresaOpts = empresaOptions.length > 0 ? empresaOptions : EMPRESAS_CANONICAS;

  // Undo delete row — vuelve la fila ENTERA (incluido cliente_codigo) a SU lugar.
  const [undoRow, setUndoRow] = useState<{ idx: number; item: GuiaItem; timer: ReturnType<typeof setTimeout> } | null>(null);
  function handleRemoveRow(idx: number) {
    const removed = items[idx];
    onRemoveRow(idx);
    if (undoRow) clearTimeout(undoRow.timer);
    const timer = setTimeout(() => setUndoRow(null), 5000);
    setUndoRow({ idx, item: removed, timer });
  }
  function handleUndoRemove() {
    if (!undoRow) return;
    clearTimeout(undoRow.timer);
    onRestoreRow(undoRow.idx, undoRow.item);
    setUndoRow(null);
  }

  // Track unsaved changes
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const changeCount = useRef(0);

  // Mark dirty on any change
  useEffect(() => {
    changeCount.current++;
    if (changeCount.current > 1) setDirty(true);
  }, [fecha, modoEntrega, transportistaId, entregadoPor, observaciones, numeroGuiaTransp, items]);

  // Auto-save with debounce (only when editing existing guía)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveInFlight = useRef(false);
  useEffect(() => {
    if (!editingId || !dirty || saving || autoSaveInFlight.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const hasItems = items.some(i => i.cliente && i.direccion && i.empresa && i.facturas && i.bultos > 0);
      const hasModo = modoEntrega === "entrega_directa" || (modoEntrega === "transportista" && !!transportistaId);
      const hasHeader = fecha.trim() && hasModo && entregadoPor.trim();
      if (hasItems && hasHeader && !autoSaveInFlight.current) {
        autoSaveInFlight.current = true;
        try { handleSave({ silent: true }); } finally { autoSaveInFlight.current = false; }
      }
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, dirty, editingId, saving]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (dirty && !saving) { e.preventDefault(); e.returnValue = ""; }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, saving]);

  function handleSave(opts?: { silent?: boolean }) {
    onSave(opts);
    setDirty(false);
    setLastSaved(new Date().toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" }));
  }

  const saveStatus = saving ? "saving" : dirty ? "dirty" : lastSaved ? "saved" : null;

  function SaveButton({ size = "normal" }: { size?: "normal" | "small" }) {
    const cls = size === "small"
      ? "bg-black text-white px-4 rounded-md text-xs font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40 inline-flex items-center justify-center min-h-[44px] shrink-0"
      : "bg-black text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40 inline-flex items-center justify-center min-h-[44px]";
    return (
      <button type="button" onClick={() => handleSave()} disabled={saving || !items.some(i => i.cliente)} className={cls}>
        {saving ? "Guardando..." : editingId ? "Guardar Cambios" : "Guardar Guía"}
      </button>
    );
  }

  function StatusBadge() {
    if (saveStatus === "saving") return <span className="text-sm text-gray-400">Guardando...</span>;
    if (saveStatus === "dirty") return <span className="text-sm text-orange-500">Sin guardar</span>;
    if (saveStatus === "saved") return <span className="text-sm text-green-600 animate-save-flash">Listo, guardado {lastSaved}</span>;
    return null;
  }

  const transportistaError =
    validationErrors.has("transportista") ||
    (touched.has("transportista") && modoEntrega === "transportista" && !transportistaId);

  // ── Campos de una fila de envío ────────────────────────────────────────────
  // Se definen UNA vez y los usan los dos layouts (tarjeta en móvil, tabla en
  // escritorio). Si se agrega un campo, aparece en los dos o en ninguno.

  function campoCliente(item: GuiaItem, idx: number, layout: Layout) {
    const clave = claveCampo(item, "cliente");
    const err = hayError(clave, item.cliente);
    return (
      <>
        <ClientePicker
          id={idCampo(item, "cliente", layout)}
          value={item.cliente}
          codigo={item.cliente_codigo || ""}
          topClientes={clientesTop}
          hasError={err}
          onChange={(nombre, codigo) => {
            onUpdateItemFields(idx, { cliente: nombre, cliente_codigo: codigo });
            marcarTocado(clave);
          }}
          inputClassName={ctrl(err)}
        />
        {err && <ErrorCampo />}
      </>
    );
  }

  function campoDireccion(item: GuiaItem, idx: number, layout: Layout) {
    const clave = claveCampo(item, "direccion");
    const err = hayError(clave, item.direccion);
    return (
      <>
        <input
          id={idCampo(item, "direccion", layout)}
          list="direcciones-list"
          type="text"
          value={item.direccion}
          placeholder="Ciudad o destino"
          onChange={(e) => { onUpdateItem(idx, "direccion", e.target.value); marcarTocado(clave); }}
          className={ctrl(err)}
        />
        {err && <ErrorCampo />}
      </>
    );
  }

  function campoEmpresa(item: GuiaItem, idx: number, layout: Layout) {
    const clave = claveCampo(item, "empresa");
    const err = hayError(clave, item.empresa);
    // Cerrado: las 8 del grupo. Si la guía traía un valor sucio, entra a la
    // lista marcado "(como estaba)" para que se pueda abrir y guardar igual.
    const opciones = opcionesEmpresa(item.empresa, empresaOpts);
    return (
      <>
        <select
          id={idCampo(item, "empresa", layout)}
          value={item.empresa}
          onChange={(e) => { onUpdateItem(idx, "empresa", e.target.value); marcarTocado(clave); }}
          className={ctrl(err, "appearance-none")}
        >
          <option value="">Elegir empresa…</option>
          {opciones.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {err && <ErrorCampo />}
      </>
    );
  }

  function campoFacturas(item: GuiaItem, idx: number, layout: Layout) {
    const clave = claveCampo(item, "facturas");
    const err = hayError(clave, item.facturas);
    const sep = validationErrors.has(claveCampo(item, "facturas-separator"));
    const fmt = validationErrors.has(claveCampo(item, "facturas-format"));
    return (
      <>
        <input
          id={idCampo(item, "facturas", layout)}
          type="text"
          inputMode="numeric"
          value={item.facturas}
          placeholder="10234, 10235"
          onChange={(e) => { onUpdateItem(idx, "facturas", e.target.value); marcarTocado(clave); }}
          className={ctrl(err || sep || fmt)}
        />
        {err && <ErrorCampo />}
        {sep && <ErrorCampo>Separar con coma y espacio (ej: FA-001, FA-002)</ErrorCampo>}
        {fmt && !sep && <ErrorCampo>Mín. 4 dígitos por factura</ErrorCampo>}
      </>
    );
  }

  function campoBultos(item: GuiaItem, idx: number, layout: Layout, alineado = false) {
    const clave = claveCampo(item, "bultos");
    const err = validationErrors.has(clave) || (touched.has(clave) && !item.bultos);
    return (
      <>
        <input
          id={idCampo(item, "bultos", layout)}
          type="number"
          min={0}
          inputMode="numeric"
          value={item.bultos || ""}
          placeholder="0"
          onChange={(e) => { onUpdateItem(idx, "bultos", parseInt(e.target.value) || 0); marcarTocado(clave); }}
          className={ctrl(err, `tabular-nums ${alineado ? "text-right" : ""}`)}
        />
        {err && <ErrorCampo />}
      </>
    );
  }

  function botonQuitar(idx: number, layout: Layout) {
    if (items.length <= 1) return null;
    return (
      <button
        type="button"
        // El de escritorio queda oculto para lectores de pantalla: en móvil y en
        // escritorio solo UNO se ve, pero los dos están en el DOM.
        aria-hidden={layout === "d"}
        tabIndex={layout === "d" ? -1 : undefined}
        aria-label={`Quitar envío ${idx + 1}`}
        title="Quitar envío"
        onClick={() => handleRemoveRow(idx)}
        className="text-gray-400 hover:text-red-500 transition text-base inline-flex items-center justify-center min-w-[44px] min-h-[44px] -mr-2"
      >
        ×
      </button>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 mb-6 border-b border-gray-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Volver: era una línea de texto de 18 px de alto. -mx-2 para que el
              "←" siga alineado con el borde izquierdo de la barra. */}
          <button onClick={onCancel} className="text-sm text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] px-2 -mx-2 shrink-0">← Guías</button>
          <span className="text-sm text-gray-300 font-mono shrink-0">GT-{String(formNumero).padStart(3, "0")}</span>
          {/* En 390px el estado no entra junto al botón: vive abajo, en la
              cabecera de "Detalle de Envío". */}
          <span className="hidden sm:block truncate"><StatusBadge /></span>
        </div>
        <SaveButton size="small" />
      </div>

      <h1 className="text-xl font-light tracking-tight mb-6">
        {editingId ? "Editar" : "Nueva"} Guía de Transporte
      </h1>

      {/* Header fields */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.05em] text-gray-400 mb-4">Información General</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
          <Campo label="Fecha" requerido htmlFor="guia-fecha">
            <input
              id="guia-fecha"
              type="date"
              value={fecha}
              onChange={e => { setFecha(e.target.value); marcarTocado("fecha"); }}
              className={ctrl(hayError("fecha", fecha))}
            />
            {hayError("fecha", fecha) && <ErrorCampo />}
          </Campo>

          <Campo label="Modo de entrega" requerido>
            {/* Segmented control modo_entrega — py-2 dejaba 36 px de alto. */}
            <div className="flex rounded-lg bg-gray-100 p-0.5 mb-3">
              <button
                type="button"
                onClick={() => { setModoEntrega("transportista"); marcarTocado("transportista"); }}
                className={`flex-1 text-sm px-3 rounded-md transition font-medium inline-flex items-center justify-center min-h-[44px] ${modoEntrega === "transportista" ? "bg-white text-black border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}>
                Transportista
              </button>
              <button
                type="button"
                onClick={() => { setModoEntrega("entrega_directa"); setTransportistaId(null); }}
                className={`flex-1 text-sm px-3 rounded-md transition font-medium inline-flex items-center justify-center min-h-[44px] ${modoEntrega === "entrega_directa" ? "bg-white text-black border border-gray-200" : "text-gray-500 hover:text-gray-700"}`}>
                Entrega directa
              </button>
            </div>
            {modoEntrega === "transportista" ? (
              <>
                <select
                  value={transportistaId || ""}
                  onChange={e => { setTransportistaId(e.target.value || null); marcarTocado("transportista"); }}
                  className={ctrl(Boolean(transportistaError), "appearance-none")}
                >
                  <option value="">Seleccionar transportista...</option>
                  {transportistas.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
                {transportistaError && <ErrorCampo>Selecciona un transportista</ErrorCampo>}
              </>
            ) : (
              <p className="text-xs text-gray-500 italic">
                Esta guía se entrega directamente, sin transportista externo.
              </p>
            )}
          </Campo>

          <Campo
            label="Despachado por"
            requerido
            htmlFor="guia-entregado-por"
            accion={<AddNewInline placeholder="Nombre" onAdd={addEntregador} etiqueta="Agregar quien despacha" />}
          >
            <select
              id="guia-entregado-por"
              value={entregadoPor}
              onChange={e => { setEntregadoPor(e.target.value); marcarTocado("entregadoPor"); }}
              className={ctrl(hayError("entregadoPor", entregadoPor), "appearance-none")}
            >
              <option value="">Seleccionar...</option>
              {entregadores.map(e => <option key={e} value={e}>{e}</option>)}
              <option value="__other__">Otro...</option>
            </select>
            {entregadoPor === "__other__" && (
              <input type="text" placeholder="Nombre de quien entrega" value={entregadoPorOtro}
                onChange={e => setEntregadoPorOtro(e.target.value)}
                onBlur={() => { if (entregadoPorOtro.trim()) addEntregador(entregadoPorOtro); }}
                className={`${ctrl(false)} mt-3`} />
            )}
          </Campo>

          {/* N° guía del transportista — solo con transportista; opcional al
              crear (obligatorio al despachar). En entrega directa no aplica. */}
          {modoEntrega === "transportista" && (
            <Campo label="N° guía del transportista" nota="(opcional)" htmlFor="guia-numero-transp">
              <input
                id="guia-numero-transp"
                type="text"
                value={numeroGuiaTransp}
                onChange={e => setNumeroGuiaTransp(e.target.value)}
                placeholder="Lo puedes poner ahora o al despachar"
                className={ctrl(false)} />
            </Campo>
          )}
        </div>
      </div>

      {/* Detalle de envío */}
      <div className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-[0.05em] text-gray-400">
            Detalle de Envío
            {/* Una sola instancia para todo el formulario: antes vivía dentro
                del <th> de la tabla, que en móvil no existe. */}
            <AddNewInline placeholder="Ciudad" onAdd={onAddDireccion} etiqueta="Agregar destino" />
          </div>
          <StatusBadge />
        </div>

        <datalist id="direcciones-list">{direcciones.map(d => <option key={d} value={d} />)}</datalist>

        {validationErrors.has("items-empty") && (
          <p className="text-red-500 text-xs mb-3">Agrega al menos un envío con todos los campos completos.</p>
        )}

        {/* ── Móvil y iPad vertical (<lg): una tarjeta por envío ─────────── */}
        <div data-layout="tarjetas" className="lg:hidden space-y-4">
          {items.map((item, idx) => (
            <div key={item.uid ?? idx} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-[0.05em] text-gray-400">Envío {idx + 1}</span>
                {botonQuitar(idx, "m")}
              </div>
              <div className="space-y-4">
                <Campo label="Cliente" requerido htmlFor={idCampo(item, "cliente", "m")}>{campoCliente(item, idx, "m")}</Campo>
                <Campo label="Dirección" requerido htmlFor={idCampo(item, "direccion", "m")}>{campoDireccion(item, idx, "m")}</Campo>
                <Campo label="Empresa" requerido htmlFor={idCampo(item, "empresa", "m")}>{campoEmpresa(item, idx, "m")}</Campo>
                <Campo label="Factura(s)" requerido nota="ej: 10234, 10235" htmlFor={idCampo(item, "facturas", "m")}>{campoFacturas(item, idx, "m")}</Campo>
                <Campo label="Bultos" requerido htmlFor={idCampo(item, "bultos", "m")}>{campoBultos(item, idx, "m")}</Campo>
              </div>
            </div>
          ))}
        </div>

        {/* ── iPad horizontal y escritorio (lg+): la tabla de siempre ─────── */}
        <div data-layout="tabla" className="hidden lg:block">
          <ScrollableTable minWidth={720}>
            <table className="w-full text-sm [&_th]:px-3.5 [&_td]:px-3.5 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-gray-200 text-xs uppercase tracking-[0.05em] text-gray-400">
                  <th className="py-3 font-normal w-8 text-left">#</th>
                  <th className="py-3 font-normal text-left">Cliente <span className="text-red-500">*</span></th>
                  <th className="py-3 font-normal text-left">Dirección <span className="text-red-500">*</span></th>
                  <th className="py-3 font-normal text-left">Empresa <span className="text-red-500">*</span></th>
                  <th className="py-3 font-normal text-left">
                    Factura(s) <span className="text-red-500">*</span>
                    <div className="text-xs text-gray-400 mt-0.5 font-normal normal-case tracking-normal">Ej: 10234, 10235</div>
                  </th>
                  <th className="py-3 font-normal w-20 text-right">Bultos <span className="text-red-500">*</span></th>
                  <th className="py-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.uid ?? idx} className="border-b border-gray-200 align-top">
                    <td className="py-2 text-gray-300">{idx + 1}</td>
                    <td className="py-2">{campoCliente(item, idx, "d")}</td>
                    <td className="py-2">{campoDireccion(item, idx, "d")}</td>
                    <td className="py-2">{campoEmpresa(item, idx, "d")}</td>
                    <td className="py-2">{campoFacturas(item, idx, "d")}</td>
                    <td className="py-2">{campoBultos(item, idx, "d", true)}</td>
                    <td className="py-2 text-center">{botonQuitar(idx, "d")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        </div>

        <div className="mt-1 flex items-center justify-between gap-4">
          {/* Botón de solo texto: medía 21 px de alto. -mx-2 lo deja alineado
              con el borde izquierdo de la tabla pese al padding nuevo. */}
          <button type="button" onClick={onAddRow} className="text-sm text-gray-400 hover:text-black transition inline-flex items-center min-h-[44px] px-2 -mx-2">+ Agregar envío</button>
          <div className="flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-[0.05em] text-gray-400">Total de bultos:</span>
            <span className="text-lg font-semibold tabular-nums">{totalBultos}</span>
          </div>
        </div>
      </div>

      {/* Observaciones */}
      <Campo label="Observaciones" nota="(opcional)" htmlFor="guia-observaciones">
        <textarea
          id="guia-observaciones"
          value={observaciones}
          onChange={e => setObservaciones(e.target.value)}
          rows={2}
          className="w-full border-b border-gray-200 py-2 text-base md:text-sm outline-none focus:border-black transition resize-none" />
      </Campo>

      {error && <p className="text-red-500 text-sm mt-6 mb-4">{error}</p>}
      <div className="flex flex-wrap items-center gap-6 mt-8">
        <SaveButton />
        <button onClick={onCancel} className="text-sm text-gray-400 hover:text-black transition min-h-[44px] px-2">Cancelar</button>
      </div>

      {/* Undo delete row toast */}
      {undoRow && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2.5 rounded-lg border border-gray-700 flex items-center gap-3 z-50 text-sm">
          <span>Envío eliminado</span>
          <button onClick={handleUndoRemove} className="font-medium underline hover:no-underline inline-flex items-center min-h-[44px] px-2 -my-2">Deshacer</button>
        </div>
      )}
    </div>
  );
}
