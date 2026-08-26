"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { useEscapeClose, useBackdropDismiss, useFormModalDismiss } from "@/lib/hooks/useModalDismiss";
import { marcasCandidatasDeEmpresa } from "@/lib/depurador/tienda";
import { normalizarEspacios } from "@/lib/depurador/veredicto";

// Alarma bloqueante de descripciones NUEVAS, compartida por el Depurador y
// Facturas Tienda. Solo llegan acá las de veredicto "alerta" (ver
// lib/depurador/veredicto.ts): casi-gemelas, mitad nueva o formato raro. Las
// que tienen las dos mitades ya conocidas pasan solas y se cuentan aparte en
// `pasaronSolas` — se dicen en una línea, nunca se descartan en silencio.
//
// Cada fila muestra la descripción, el motivo en una línea corta y, cuando el
// motivo es la casi-gemela, la existente al lado para ver la diferencia de un
// vistazo. Admin/secretaria pueden aprobarla desde la app
// (POST /api/productos/cargar/descripciones/aprobar). Para otros roles queda el
// texto original de captura de pantalla.
//
// Patrón de modal del repo: createPortal + inset-0 + fade-in + useBodyScrollLock.
// Sin autoFocus, sin slide-up.

export interface DescripcionNueva {
  marca: string;
  desc: string;
  /** Presente cuando la marca no es exacta (Facturas Tienda, formatos B/C):
   *  la aprobación pide elegir una marca del catálogo de esa empresa. */
  empresaKey?: string;
  /** Por qué alerta, en una línea corta ("casi igual a", "mitad nueva: …"). */
  motivo?: string;
  /** La gemela del catálogo, cuando el motivo es la casi-gemela. */
  gemela?: string;
}

interface Props {
  items: DescripcionNueva[];
  /** Cuántas descripciones nuevas pasaron solas (las dos mitades ya existen).
   *  Se dice en una línea: nada se descarta en silencio. */
  pasaronSolas?: number;
  /** Aprobación exitosa: el padre actualiza el catálogo en memoria (y en
   *  Facturas Tienda reprocesa) → la alarma se re-evalúa en vivo. */
  onAprobada: (marca: string, descripcion: string) => void;
  onClose: () => void;
}

interface ConfirmState {
  item: DescripcionNueva;
  /** Marca elegida (dropdown solo cuando la marca no es exacta). */
  marcaElegida: string;
  avisado: boolean;
  enviando: boolean;
  error: string;
}

export default function AlarmaDescripcionesNuevas({ items, pasaronSolas = 0, onAprobada, onClose }: Props) {
  useBodyScrollLock(true);
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // Rol desde sessionStorage SOLO en efecto (nunca en useState(() => ...) — regla SSR).
  useEffect(() => {
    setMounted(true);
    setRole(sessionStorage.getItem("cxc_role") || "");
  }, []);

  // Cierre por clic fuera + Escape. Los hooks van ANTES del early return de
  // `mounted` (reglas de hooks). La alarma de atrás se guardea con `!confirm`:
  // con la confirmación abierta, Escape cierra SOLO la de encima.
  const cerrarConfirm = () => setConfirm(null);
  const backdropAlarma = useBackdropDismiss(confirm ? undefined : onClose);
  useEscapeClose(mounted, onClose, !confirm);
  // La confirmación tiene campos (marca + checkbox) → si el usuario ya tocó
  // algo, el clic fuera y Escape no la cierran; sale con Cancelar.
  const { panelRef: confirmPanelRef, backdrop: backdropConfirm } = useFormModalDismiss(
    !!confirm,
    cerrarConfirm,
    !confirm?.enviando,
  );

  if (!mounted) return null;

  const puedeAprobar = role === "admin" || role === "secretaria";

  const abrirConfirmacion = (item: DescripcionNueva) => {
    const candidatas = item.empresaKey ? marcasCandidatasDeEmpresa(item.empresaKey) : [];
    setConfirm({
      item,
      marcaElegida: item.empresaKey ? (candidatas[0] ?? "") : item.marca,
      avisado: false,
      enviando: false,
      error: "",
    });
  };

  const aprobar = async () => {
    if (!confirm || !confirm.avisado || confirm.enviando || !confirm.marcaElegida) return;
    setConfirm({ ...confirm, enviando: true, error: "" });
    try {
      const res = await fetch("/api/productos/cargar/descripciones/aprobar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marca: confirm.marcaElegida, descripcion: normalizarEspacios(confirm.item.desc) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setConfirm((c) => (c ? { ...c, enviando: false, error: d?.error || "No se pudo aprobar. Intenta de nuevo." } : c));
        return;
      }
      const { marcaElegida, item } = confirm;
      setConfirm(null);
      onAprobada(marcaElegida, normalizarEspacios(item.desc));
    } catch {
      setConfirm((c) => (c ? { ...c, enviando: false, error: "No se pudo aprobar. Revisa tu conexión e intenta de nuevo." } : c));
    }
  };

  return createPortal(
    <div {...backdropAlarma} className="fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border-4 border-red-500 bg-white p-6">
        <div className="mb-2 text-center text-5xl">⚠️</div>
        <h2 className="text-center text-xl font-bold text-red-700">
          {items.length} descripción(es) por revisar
        </h2>
        <p className="mt-2 text-center text-sm text-stone-600">
          {puedeAprobar
            ? "Bloquean la descarga. Avísale a Daniel antes de aprobar."
            : "Bloquean la descarga hasta que Daniel las apruebe. Mándale una captura."}
        </p>
        {pasaronSolas > 0 && (
          <p className="mt-2 text-center text-[13px] text-stone-500">
            {pasaronSolas} pasaron solas · las dos mitades ya existen
          </p>
        )}
        <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-red-200 bg-red-50 p-3">
          {items.map((o, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5 text-[13px] text-stone-800">
              <div className="min-w-0">
                <div>
                  <span className="font-semibold text-red-800">{o.marca}</span> → {o.desc}
                </div>
                {o.motivo && (
                  <div className="mt-0.5 text-[12px] text-amber-800">
                    ⚠ {o.motivo}
                    {o.gemela && <b className="ml-1 font-semibold text-stone-900">{o.gemela}</b>}
                  </div>
                )}
              </div>
              {puedeAprobar && (
                <button
                  type="button"
                  onClick={() => abrirConfirmacion(o)}
                  className="shrink-0 rounded-md border border-teal-600 bg-white px-2.5 py-1 text-[12px] font-semibold text-teal-700 transition hover:bg-teal-50 active:scale-[0.97]"
                >
                  Aprobar y agregar al catálogo
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-stone-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-stone-800 active:scale-[0.98]"
        >
          Cerrar
        </button>
      </div>

      {/* Confirmación de aprobación (encima de la alarma) */}
      {confirm && (
        <div {...backdropConfirm} className="fade-in fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
          <div ref={confirmPanelRef} className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6">
            <h3 className="text-center text-lg font-bold text-stone-900">Aprobar descripción</h3>
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              ⚠️ Esta descripción quedará <b>PERMANENTE</b> en el catálogo de{" "}
              <b>{confirm.marcaElegida || "…"}</b>. Avísale a Daniel antes de aprobar.
            </p>
            <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-[13px] text-stone-800">
              {confirm.item.desc}
            </div>
            {confirm.item.empresaKey && (
              <div className="mt-3">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  ¿A qué marca del catálogo pertenece?
                </label>
                <select
                  value={confirm.marcaElegida}
                  onChange={(e) => setConfirm((c) => (c ? { ...c, marcaElegida: e.target.value } : c))}
                  className="w-full rounded-md border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                >
                  {marcasCandidatasDeEmpresa(confirm.item.empresaKey).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-stone-800">
              <input
                type="checkbox"
                checked={confirm.avisado}
                onChange={(e) => setConfirm((c) => (c ? { ...c, avisado: e.target.checked } : c))}
                className="mt-0.5 h-4 w-4 accent-teal-600"
              />
              <span>Ya le avisé a Daniel</span>
            </label>
            {confirm.error && (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
                {confirm.error}
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={confirm.enviando}
                className="flex-1 rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-900 transition hover:border-stone-400 active:scale-[0.98] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={aprobar}
                disabled={!confirm.avisado || confirm.enviando || !confirm.marcaElegida}
                className="flex-1 rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {confirm.enviando ? "Aprobando…" : "Aprobar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
