"use client";

// Alta / edición de un cheque, en VENTANA CENTRADA.
//
// Qué reportó Daniel y qué se arregló acá:
//
//   > "no me deja escribir el nombre del cliente, deberia de ser como guias"
//   > "no me gusta el formulario como se ve asi a la derecha, deberia verse normal"
//   > "al poner clic en n chequees, me deja poner un digito cada clic, esta raro"
//
// 1. **Lo del dígito por clic era robo de foco**, y no era de Cheques sino del
//    `Drawer` compartido. Está contado en `useAutofocusPrimerCampo.ts`. Este
//    formulario ya no usa Drawer, pero usa el MISMO hook, así que hereda el
//    arreglo en vez de repetirlo.
// 2. **"A la derecha" era un panel lateral.** Ahora es una ventana centrada
//    sobre `ModalOverlay`, como el resto de la app. En móvil ese mismo patrón
//    cae solo en hoja inferior (`items-end sm:items-center`).
// 3. **El cliente es el selector compartido de Guías** (`ClientePicker`), con
//    sus "más usados", su búsqueda contra el directorio y su opción "Otro".
//
// El formulario NO es un `<form>` a propósito: sin submit implícito, un Enter
// perdido no puede guardar ni cerrar. Guardar es siempre el botón.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModalOverlay } from "@/components/ui";
import ClientePicker from "@/components/ClientePicker";
import SearchableSelect from "@/components/ui/SearchableSelect";
import type { ClienteHit } from "@/lib/hooks/useBusquedaClientes";
import { useFormGuard } from "@/lib/hooks/useModalDismiss";
import { useAutofocusPrimerCampo } from "@/lib/hooks/useAutofocusPrimerCampo";
import { useDraftAutoSave } from "@/lib/hooks/useDraftAutoSave";
import { ALL_COMPANIES } from "@/lib/companies";
import { LS_CHEQUE_VENDEDORES, VENDEDORES_POR_DEFECTO } from "@/lib/cheques-vendedores";

export interface ChequeFormValues {
  cliente: string;
  empresa: string;
  numero_cheque: string;
  monto: string;
  fecha_deposito: string;
  notas: string;
  vendedor: string;
  /** Código D-XXX del cliente elegido. "" = sin vincular (la opción "Otro"),
   *  que es un estado legítimo y se conserva tal cual. */
  cliente_codigo: string;
}

interface Props {
  open: boolean;
  /** null = alta. Con id = edición (el borrador no aplica). */
  editingId: string | null;
  /** Valores con los que abrir. Se copian al estado interno al abrir. */
  initial: ChequeFormValues;
  onClose: () => void;
  onSave: (values: ChequeFormValues) => void;
  saving: boolean;
  isOnline: boolean;
  /** Error del servidor, ya en castellano. */
  error: string | null;
}

function hoyStr() {
  return new Date().toISOString().slice(0, 10);
}

export function chequeFormVacio(): ChequeFormValues {
  return { cliente: "", empresa: "", numero_cheque: "", monto: "", fecha_deposito: hoyStr(), notas: "", vendedor: "", cliente_codigo: "" };
}

/** Nombres guardados en el navegador por la versión vieja (pre-base). */
function vendedoresLocales(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_CHEQUE_VENDEDORES);
    return raw ? (JSON.parse(raw) as string[]).filter((v) => typeof v === "string" && v.trim()) : [];
  } catch {
    return [];
  }
}

function guardarVendedorLocal(nombre: string): void {
  try {
    const actuales = vendedoresLocales();
    if (!actuales.some((v) => v.toUpperCase() === nombre.toUpperCase())) {
      localStorage.setItem(LS_CHEQUE_VENDEDORES, JSON.stringify([...actuales, nombre]));
    }
  } catch {
    /* modo privado / sin storage: el vendedor vale para esta sesión y ya */
  }
}

// Alto táctil que se suelta por TIPO DE PUNTERO, no por ancho — mismo criterio
// que #328 en Guías: un iPad horizontal es más ancho que muchas laptops pero se
// usa con el dedo, así que soltar los 44 px en `md:` los dejaba en 34 justo ahí.
const CTRL_BASE =
  "w-full border-b py-3 text-base sm:text-sm outline-none bg-transparent focus:border-black transition min-h-[44px] " +
  "md:[@media(pointer:fine)]:py-2 md:[@media(pointer:fine)]:min-h-0";

function ctrl(err: boolean): string {
  return `${CTRL_BASE} ${err ? "border-red-400" : "border-gray-200"}`;
}

function Campo({
  label,
  requerido = false,
  error,
  anchoCompleto = false,
  children,
}: {
  label: string;
  requerido?: boolean;
  error?: boolean;
  anchoCompleto?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${anchoCompleto ? "lg:col-span-2" : ""}`}>
      <label className="text-xs uppercase tracking-[0.05em] text-gray-400">
        {label} {requerido && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-0.5">Campo obligatorio</p>}
    </div>
  );
}

export default function ChequeFormModal({
  open, editingId, initial, onClose, onSave, saving, isOnline, error,
}: Props) {
  const [v, setV] = useState<ChequeFormValues>(initial);
  // Código del cliente elegido. Desde el 8-ago-2026 SÍ se guarda
  // (`cheques.cliente_codigo`), así que el distintivo del selector se enciende:
  // el vínculo ya existe de verdad. El texto de `cliente` se sigue conservando
  // como display — mismo patrón que mk_proyectos.tienda + tienda_codigo.
  const [clienteCodigo, setClienteCodigo] = useState(initial.cliente_codigo ?? "");
  const [tocado, setTocado] = useState<Record<string, boolean>>({});
  const [agregandoVendedor, setAgregandoVendedor] = useState(false);
  const [nuevoVendedor, setNuevoVendedor] = useState("");

  const set = useCallback(<K extends keyof ChequeFormValues>(k: K, val: ChequeFormValues[K]) => {
    setV((prev) => ({ ...prev, [k]: val }));
  }, []);

  // Al abrir: copiar los valores de entrada y limpiar lo que es de la sesión
  // anterior. Depende SOLO de `open` — `initial` es un objeto nuevo en cada
  // render del padre y ponerlo acá pisaría lo que el usuario está escribiendo.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  useEffect(() => {
    if (!open) return;
    setV(initialRef.current);
    // Al EDITAR se conserva el vínculo que trae el cheque; al dar de alta viene
    // vacío. Resetearlo a "" siempre habría desvinculado en silencio cualquier
    // cheque que se abriera a editar y se volviera a guardar.
    setClienteCodigo(initialRef.current.cliente_codigo ?? "");
    setTocado({});
    setAgregandoVendedor(false);
    setNuevoVendedor("");
  }, [open]);

  const cerrar = useCallback(() => { if (!saving) onClose(); }, [saving, onClose]);
  const { panelRef, intentarCerrar } = useFormGuard(open, cerrar, !saving);
  // Enfoca el primer CAMPO (el cliente), nunca el ✕.
  //
  // Solo al dar de ALTA. Al editar no se enfoca nada, y no es un detalle: el
  // selector de cliente, al recibir el foco, se convierte en un buscador vacío
  // y deja el nombre guardado como texto gris de fondo. Autoenfocarlo al abrir
  // "Editar cheque" hacía que el cliente se viera BORRADO — justo el susto que
  // no puede dar una pantalla de edición. Además, en iPhone, levantaba el
  // teclado sobre un formulario que ya está lleno.
  useAutofocusPrimerCampo(open && !editingId, panelRef, 60);

  // ── Vendedores: la base manda; el navegador es el respaldo ────────────────
  const [vendedores, setVendedores] = useState<string[]>(VENDEDORES_POR_DEFECTO);
  const [vendedoresEnBase, setVendedoresEnBase] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    fetch("/api/cheques/vendedores", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { vendedores?: string[]; fuente?: string } | null) => {
        if (cancel || !d || !Array.isArray(d.vendedores)) return;
        setVendedoresEnBase(d.fuente === "db");
        setVendedores(d.vendedores);
      })
      .catch(() => { /* sin red: quedan los de siempre + los del navegador */ });
    return () => { cancel = true; };
  }, [open]);

  // Lo que se ofrece = base ∪ navegador ∪ el vendedor YA GUARDADO en este
  // cheque. Lo último es lo que hace que un cheque viejo se pueda editar y
  // guardar sin perder quién lo entregó, aunque ese nombre ya no esté en la
  // lista.
  const opcionesVendedor = useMemo(() => {
    const vistos = new Set<string>();
    const salida: string[] = [];
    for (const n of [...vendedores, ...vendedoresLocales(), v.vendedor]) {
      const limpio = (n || "").trim();
      if (!limpio) continue;
      const clave = limpio.toUpperCase();
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      salida.push(limpio);
    }
    return salida;
  }, [vendedores, v.vendedor]);

  async function agregarVendedor() {
    const nombre = nuevoVendedor.trim();
    setNuevoVendedor("");
    setAgregandoVendedor(false);
    if (!nombre) return;
    set("vendedor", nombre);
    setVendedores((prev) => (prev.some((p) => p.toUpperCase() === nombre.toUpperCase()) ? prev : [...prev, nombre]));
    try {
      const res = await fetch("/api/cheques/vendedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      // 503 = la lista compartida todavía no está activa (falta correr el DDL).
      // No es un error para el usuario: se guarda en el navegador como hasta
      // hoy y el vendedor queda utilizable igual.
      if (!res.ok) guardarVendedorLocal(nombre);
    } catch {
      guardarVendedorLocal(nombre);
    }
  }

  // ── Clientes más usados (frecuencia sacada de la tabla `cheques`) ──────────
  const [clientesTop, setClientesTop] = useState<ClienteHit[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    fetch("/api/cheques/frecuencias", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { clientes?: ClienteHit[] } | null) => {
        if (!cancel && d && Array.isArray(d.clientes)) setClientesTop(d.clientes);
      })
      .catch(() => { /* sin chips; el buscador sigue funcionando */ });
    return () => { cancel = true; };
  }, [open]);

  // ── Borrador (solo en alta) ───────────────────────────────────────────────
  const datosBorrador = useMemo(
    () => ({ cliente: v.cliente, empresa: v.empresa, numero: v.numero_cheque, monto: v.monto, fecha: v.fecha_deposito }),
    [v.cliente, v.empresa, v.numero_cheque, v.monto, v.fecha_deposito],
  );
  const borradorVacio = useCallback(
    (d: typeof datosBorrador) => !d.cliente && !d.empresa && !d.numero && !d.monto,
    [],
  );
  const { draft, hasDraft, clearDraft, draftTimeAgo } = useDraftAutoSave("cheque", datosBorrador, borradorVacio);

  function restaurarBorrador() {
    if (!draft) return;
    setV((prev) => ({
      ...prev,
      cliente: draft.cliente || "",
      empresa: draft.empresa || "",
      numero_cheque: draft.numero || "",
      monto: draft.monto || "",
      fecha_deposito: draft.fecha || hoyStr(),
    }));
    clearDraft();
  }

  const marcar = (campo: string) => setTocado((p) => ({ ...p, [campo]: true }));
  const err = (campo: string, valor: string) => Boolean(tocado[campo]) && !valor.trim();

  if (!open) return null;

  return (
    <ModalOverlay onBackdropClick={intentarCerrar}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={editingId ? "Editar cheque" : "Nuevo cheque"}
        // Ancho medido, no elegido a ojo: la barra lateral se come 224 px desde los
        // 768 px, así que el área útil del iPad horizontal (1024) son 800 px. Con
        // `max-w-3xl` (768) el cuadro ocupaba 768 de esos 800 y quedaba pegado a
        // los bordes; con `2xl` (672) respira 64 px por lado y las 2 columnas
        // siguen entrando cómodas.
        className="bg-white sm:rounded-lg rounded-t-2xl w-full max-w-xl lg:max-w-2xl mx-0 sm:mx-4 border border-gray-200 max-h-[92vh] sm:max-h-[85vh] flex flex-col"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-base font-medium">{editingId ? "Editar Cheque" : "Nuevo Cheque"}</h2>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-black transition min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {hasDraft && !editingId && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-amber-800">Tienes un borrador guardado de {draftTimeAgo}. ¿Restaurar?</p>
              <div className="flex items-center gap-3 flex-shrink-0">
                <button type="button" onClick={restaurarBorrador} className="bg-black text-white text-sm px-4 min-h-[44px] inline-flex items-center rounded-md hover:bg-gray-800 transition">Restaurar</button>
                <button type="button" onClick={clearDraft} className="text-sm text-amber-700 hover:text-amber-900 transition min-h-[44px] px-2 inline-flex items-center">Descartar</button>
              </div>
            </div>
          )}

          {/* 2 columnas recién en `lg`: en iPad vertical (768) no hay ancho para
              dos campos y quedarían apretados, igual que en Guías. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
            <Campo label="Cliente" requerido error={err("cliente", v.cliente)} anchoCompleto>
              <ClientePicker
                id="cheque-cliente"
                value={v.cliente}
                codigo={clienteCodigo}
                topClientes={clientesTop}
                hasError={err("cliente", v.cliente)}
                onChange={(nombre, codigo) => {
                  set("cliente", nombre);
                  setClienteCodigo(codigo);
                  marcar("cliente");
                }}
                inputClassName={ctrl(err("cliente", v.cliente))}
              />
            </Campo>

            <Campo label="Empresa" requerido error={err("empresa", v.empresa)}>
              <SearchableSelect
                value={v.empresa}
                onChange={(x) => set("empresa", x)}
                options={ALL_COMPANIES.map((c) => ({ value: c.key, label: c.name }))}
                placeholder="Seleccionar..."
                ariaLabel="Empresa"
                onBlur={() => marcar("empresa")}
                className={ctrl(err("empresa", v.empresa))}
              />
            </Campo>

            <Campo label="N° Cheque" requerido error={err("numero", v.numero_cheque)}>
              <input
                type="text"
                inputMode="numeric"
                aria-label="N° Cheque"
                value={v.numero_cheque}
                onChange={(e) => set("numero_cheque", e.target.value)}
                onBlur={() => marcar("numero")}
                className={ctrl(err("numero", v.numero_cheque))}
              />
            </Campo>

            <Campo label="Monto" requerido error={err("monto", v.monto)}>
              <input
                type="number"
                step="0.01"
                aria-label="Monto"
                value={v.monto}
                onChange={(e) => set("monto", e.target.value)}
                onBlur={() => marcar("monto")}
                className={ctrl(err("monto", v.monto))}
              />
            </Campo>

            <Campo label="Fecha Depósito" requerido error={err("fecha", v.fecha_deposito)}>
              <input
                type="date"
                aria-label="Fecha Depósito"
                value={v.fecha_deposito}
                onChange={(e) => set("fecha_deposito", e.target.value)}
                onBlur={() => marcar("fecha")}
                className={ctrl(err("fecha", v.fecha_deposito))}
              />
            </Campo>

            <Campo label="Vendedor" requerido error={err("vendedor", v.vendedor)}>
              {!agregandoVendedor ? (
                <SearchableSelect
                  value={v.vendedor}
                  onChange={(x) => set("vendedor", x)}
                  options={opcionesVendedor.map((n) => ({ value: n, label: n }))}
                  placeholder="Seleccionar vendedor"
                  ariaLabel="Vendedor"
                  onBlur={() => marcar("vendedor")}
                  actionLabel="+ Agregar vendedor"
                  onAction={() => setAgregandoVendedor(true)}
                  className={ctrl(err("vendedor", v.vendedor))}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    aria-label="Nombre del vendedor"
                    value={nuevoVendedor}
                    onChange={(e) => setNuevoVendedor(e.target.value)}
                    placeholder="Nombre del vendedor"
                    className={`${ctrl(false)} flex-1`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); agregarVendedor(); }
                      else if (e.key === "Escape") { e.stopPropagation(); setNuevoVendedor(""); setAgregandoVendedor(false); }
                    }}
                  />
                  <button type="button" onClick={agregarVendedor} className="text-xs text-black font-medium hover:text-gray-600 transition min-h-[44px] min-w-[44px] px-2 inline-flex items-center justify-center">Agregar</button>
                  <button type="button" onClick={() => { setNuevoVendedor(""); setAgregandoVendedor(false); }} className="text-xs text-gray-400 hover:text-black transition min-h-[44px] min-w-[44px] px-1 inline-flex items-center justify-center">Cancelar</button>
                </div>
              )}
              {/* El aviso solo aparece cuando el usuario está AGREGANDO, que es
                  el momento en que importa: ahí decide sabiendo si el vendedor
                  lo van a ver los demás o se queda en su teléfono. Puesto fijo
                  bajo el campo era un cartel permanente en medio del
                  formulario, y además desaparece solo en cuanto corra el DDL. */}
              {agregandoVendedor && !vendedoresEnBase && (
                <p className="text-xs text-gray-400 mt-0.5">Por ahora esta lista se guarda solo en este dispositivo.</p>
              )}
            </Campo>

            <Campo label="Notas" anchoCompleto>
              <textarea
                aria-label="Notas"
                value={v.notas}
                onChange={(e) => set("notas", e.target.value)}
                rows={2}
                className={`${ctrl(false)} resize-none`}
              />
            </Campo>
          </div>

          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
        </div>

        <footer
          className="border-t border-gray-200 px-5 py-3 bg-white flex items-center gap-4 flex-shrink-0"
          // Sin esto, en iPhone con barra de gestos los botones quedan pegados
          // al borde de abajo.
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => onSave({ ...v, cliente_codigo: clienteCodigo })}
            disabled={saving || !isOnline}
            title={!isOnline ? "Sin conexión" : undefined}
            className="bg-black text-white px-6 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {!isOnline ? "Sin conexión" : saving ? "Guardando..." : "Guardar Cheque"}
          </button>
          <button
            type="button"
            onClick={cerrar}
            className="text-sm text-gray-400 hover:text-black transition min-h-[44px] min-w-[44px] px-2 -mx-2 inline-flex items-center justify-center"
          >
            Cancelar
          </button>
        </footer>
      </div>
    </ModalOverlay>
  );
}
