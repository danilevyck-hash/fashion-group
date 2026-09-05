"use client";

// Alta / edición de un RECORDATORIO, en ventana centrada.
//
// Daniel, textual (24-ago-2026): *"quisiera poner ahí en el calendario «recordar
// cobrar» y pongo la fecha así telegram me recuerda"*. O sea que lo mínimo —y lo
// único obligatorio— es **fecha + texto**. El cliente y la repetición son
// opcionales por decisión suya explícita ("no debería de ser obligatorio" /
// "puede ser, no siempre").
//
// Mismo patrón de la casa que `ChequeFormModal`, con el que comparte pantalla:
// `ModalOverlay` (que ya trae `fixed inset-0` + `useBodyScrollLock`), cierre con
// `useFormGuard` —si ya escribiste algo, el clic fuera y el Escape no te lo
// borran— y NO es un `<form>`: sin submit implícito, un Enter perdido no puede
// guardar ni cerrar.
//
// ⚠️ **SIN `autoFocus`.** En iPhone levantaría el teclado sobre un formulario
// que se acaba de abrir, y en el selector de cliente el foco lo convierte en un
// buscador vacío que hace ver el nombre guardado como BORRADO (el susto que ya
// costó una vuelta en Cheques, ver `useAutofocusPrimerCampo`).

import { useCallback, useEffect, useRef, useState } from "react";
import { ModalOverlay } from "@/components/ui";
import ClientePicker from "@/components/ClientePicker";
import type { ClienteHit } from "@/lib/hooks/useBusquedaClientes";
import { useFormGuard } from "@/lib/hooks/useModalDismiss";
// Los "más usados" salen de `/api/cheques/frecuencias`, el MISMO endpoint que
// alimenta los chips del formulario de cheque: es el mismo módulo y la misma
// gente. Estrenar una segunda lista de clientes frecuentes acá habría sido una
// segunda consulta contra una base en compute Micro para responder lo mismo.
import {
  DESTINOS,
  ETIQUETA_DESTINO,
  ETIQUETA_REPETICION,
  FALTA_FECHA_PASADA,
  REPETICIONES,
  faltaParaGuardar,
  mensajeDeFalta,
  type Destino,
  type Repeticion,
} from "@/lib/recordatorios/recordatorio";

export interface RecordatorioFormValues {
  fecha: string;
  texto: string;
  cliente: string;
  /** Código D-XXX. "" = sin vincular, que es un estado legítimo. */
  cliente_codigo: string;
  repeticion: Repeticion;
  /** Fecha de fin de una repetición. "" = corre hasta que se borre. */
  hasta: string;
  /** A quién le llega. Solo los admin lo eligen. */
  destino: Destino;
}

/** `hoy` es la fecha de PANAMÁ, del servidor. Nunca `new Date()` acá: el
 *  navegador puede estar en otra zona y proponer un día que ya pasó. */
export function recordatorioVacio(hoy: string, fecha?: string): RecordatorioFormValues {
  return {
    fecha: fecha || hoy,
    texto: "",
    cliente: "",
    cliente_codigo: "",
    repeticion: "una_vez",
    hasta: "",
    destino: "equipo",
  };
}

interface Props {
  open: boolean;
  /** null = alta. Con id = edición. Desde el 5-sep-2026 esta ventana solo EDITA:
   *  el alta vive en el renglón de arriba (`LineaNueva`). */
  editingId: string | null;
  initial: RecordatorioFormValues;
  /** HOY en fecha de Panamá. */
  hoy: string;
  /** Solo los admin eligen a quién le llega. */
  puedeElegirDestino: boolean;
  onClose: () => void;
  onSave: (v: RecordatorioFormValues) => void;
  onDelete?: () => void;
  saving: boolean;
  isOnline: boolean;
  error: string | null;
}

// Mismo alto táctil que el formulario de cheque, y por el mismo criterio: se
// suelta por TIPO DE PUNTERO, no por ancho (un iPad horizontal es más ancho que
// muchas laptops y se usa con el dedo).
const CTRL =
  "w-full border-b border-gray-200 py-3 text-base sm:text-sm outline-none bg-transparent " +
  "focus:border-black transition min-h-[44px] md:[@media(pointer:fine)]:py-2 md:[@media(pointer:fine)]:min-h-0";

function Campo({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs uppercase tracking-[0.05em] text-gray-400">
        {label} {hint && <span className="normal-case tracking-normal text-gray-300">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export default function RecordatorioFormModal({
  open,
  editingId,
  initial,
  hoy,
  puedeElegirDestino,
  onClose,
  onSave,
  onDelete,
  saving,
  isOnline,
  error,
}: Props) {
  const [v, setV] = useState<RecordatorioFormValues>(initial);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [topClientes, setTopClientes] = useState<ClienteHit[]>([]);

  // Depende SOLO de `open`: `initial` es un objeto nuevo en cada render del
  // padre y ponerlo en las deps pisaría lo que la persona está escribiendo.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  useEffect(() => {
    if (!open) return;
    setV(initialRef.current);
    setConfirmarBorrar(false);
  }, [open]);

  // Los chips de "más usados". Si falla, quedan vacíos y el buscador del
  // selector sigue funcionando igual — nunca traba el guardado.
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    fetch("/api/cheques/frecuencias", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { clientes?: ClienteHit[] } | null) => {
        if (!cancel && d && Array.isArray(d.clientes)) setTopClientes(d.clientes);
      })
      .catch(() => { /* sin chips; el buscador sigue funcionando */ });
    return () => { cancel = true; };
  }, [open]);

  const cerrar = useCallback(() => {
    if (!saving) onClose();
  }, [saving, onClose]);
  const { panelRef, intentarCerrar } = useFormGuard(open, cerrar, !saving);

  if (!open) return null;

  const set = <K extends keyof RecordatorioFormValues>(k: K, val: RecordatorioFormValues[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  // El botón se APAGA y dice qué falta — el patrón de la casa (Guías, Pedidos).
  // Un toast por cada cosa que falta obliga a tocar el botón una vez por campo.
  //
  // 🔴 EDITAR NO EXIGE MOVER LA FECHA. La regla nueva es «no se guarda para un
  // día que ya pasó» (el aviso sale a las 9:00), pero un recordatorio que se
  // REPITE tiene su `fecha` en el día que ARRANCÓ, casi siempre en el pasado:
  // aplicarle la regla dejaría imposible corregirle el texto. Igual que en el
  // servidor, el freno solo mira la fecha cuando CAMBIÓ.
  const cambioLaFecha = v.fecha !== initial.fecha;
  const falta = faltaParaGuardar(
    { fecha: v.fecha, texto: v.texto, hasta: v.repeticion !== "una_vez" ? v.hasta : null },
    hoy,
  ).filter((f) => f !== FALTA_FECHA_PASADA || cambioLaFecha);
  const puedeGuardar = falta.length === 0 && !saving && isOnline;

  return (
    <ModalOverlay onBackdropClick={intentarCerrar}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={editingId ? "Editar recordatorio" : "Nuevo recordatorio"}
        className="bg-white sm:rounded-lg rounded-t-2xl w-full max-w-lg mx-0 sm:mx-4 border border-gray-200 max-h-[92vh] sm:max-h-[85vh] flex flex-col"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-base font-medium">
            {editingId ? "Editar recordatorio" : "Nuevo recordatorio"}
          </h2>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-black transition min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <Campo label="Qué hay que recordar">
            <textarea
              aria-label="Qué hay que recordar"
              value={v.texto}
              onChange={(e) => set("texto", e.target.value)}
              rows={2}
              placeholder="Recordar cobrar"
              className={`${CTRL} resize-none`}
            />
          </Campo>

          <Campo label="Fecha">
            <input
              type="date"
              aria-label="Fecha"
              value={v.fecha}
              onChange={(e) => set("fecha", e.target.value)}
              className={CTRL}
            />
          </Campo>

          {/* 🔴 OPCIONAL, y se dice con todas las letras: Daniel fue explícito
              en que atarlo a un cliente "no debería de ser obligatorio". Sin el
              rótulo, un campo de cliente con el selector de siempre se lee como
              un campo que hay que llenar. */}
          <Campo label="Cliente" hint="— si aplica, no es obligatorio">
            <ClientePicker
              id="recordatorio-cliente"
              value={v.cliente}
              codigo={v.cliente_codigo}
              topClientes={topClientes}
              onChange={(nombre, codigo) => {
                set("cliente", nombre);
                set("cliente_codigo", codigo);
              }}
              inputClassName={CTRL}
            />
          </Campo>

          <Campo label="¿Se repite?">
            <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Se repite">
              {REPETICIONES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={v.repeticion === r}
                  onClick={() => set("repeticion", r)}
                  className={`text-sm px-4 min-h-[44px] inline-flex items-center rounded-full border transition ${
                    v.repeticion === r
                      ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                      : "border-gray-200 text-gray-500 hover:border-gray-400 hover:text-black"
                  }`}
                >
                  {ETIQUETA_REPETICION[r]}
                </button>
              ))}
            </div>
            {v.repeticion !== "una_vez" && (
              <p className="text-xs text-gray-400 mt-1">
                {v.repeticion === "cada_dia"
                  ? "Vuelve todos los días, a partir de esa fecha."
                  : v.repeticion === "semanal"
                    ? "Vuelve cada semana, el mismo día, a partir de esa fecha."
                    : "Vuelve cada mes, el mismo día. Si el mes no tiene ese día, cae en el último."}
              </p>
            )}
          </Campo>

          {/* El «hasta» solo existe con una repetición: sin ella no significa
              nada y el servidor lo descartaría igual. */}
          {v.repeticion !== "una_vez" && (
            <Campo label="Hasta" hint="— opcional; sin fecha, corre hasta que lo borres">
              <input
                type="date"
                aria-label="Hasta"
                value={v.hasta}
                min={v.fecha}
                onChange={(e) => set("hasta", e.target.value)}
                className={CTRL}
              />
            </Campo>
          )}

          {/* 🔴 Solo los admin. Lo que escribe una secretaria va SIEMPRE al
              equipo, y eso lo fuerza el servidor — acá solo se esconde. */}
          {puedeElegirDestino && (
            <Campo label="A quién le llega">
              <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="A quién le llega">
                {DESTINOS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={v.destino === d}
                    onClick={() => set("destino", d)}
                    className={`text-sm px-4 min-h-[44px] inline-flex items-center rounded-full border transition ${
                      v.destino === d
                        ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                        : "border-gray-200 text-gray-500 hover:border-gray-400 hover:text-black"
                    }`}
                  >
                    {ETIQUETA_DESTINO[d]}
                  </button>
                ))}
              </div>
            </Campo>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        <footer
          className="border-t border-gray-200 px-5 py-3 bg-white flex items-center gap-4 flex-shrink-0"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => onSave(v)}
              disabled={!puedeGuardar}
              title={!isOnline ? "Sin conexión" : undefined}
              className="bg-black text-white px-6 min-h-[44px] inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-gray-800 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {!isOnline ? "Sin conexión" : saving ? "Guardando..." : "Guardar recordatorio"}
            </button>
          </div>
          <button
            type="button"
            onClick={cerrar}
            className="text-sm text-gray-400 hover:text-black transition min-h-[44px] min-w-[44px] px-2 -mx-2 inline-flex items-center justify-center"
          >
            Cancelar
          </button>
          {editingId && onDelete && (
            <div className="ml-auto">
              {!confirmarBorrar ? (
                <button
                  type="button"
                  onClick={() => setConfirmarBorrar(true)}
                  className="text-sm text-gray-400 hover:text-red-600 transition min-h-[44px] px-2 inline-flex items-center"
                >
                  Eliminar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onDelete}
                  className="text-sm text-white bg-red-600 hover:bg-red-700 transition min-h-[44px] px-4 rounded-md inline-flex items-center"
                >
                  Sí, eliminar
                </button>
              )}
            </div>
          )}
        </footer>

        {/* El "Falta:" va DEBAJO del botón apagado, no en un toast: enterarse de
            lo que falta después de tocar es lo que este patrón vino a evitar. */}
        {falta.length > 0 && (
          <p className="px-5 pb-3 -mt-1 text-xs text-amber-700 bg-white">{mensajeDeFalta(falta)}</p>
        )}
      </div>
    </ModalOverlay>
  );
}
