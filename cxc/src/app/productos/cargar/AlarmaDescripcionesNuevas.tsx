"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { marcasCandidatasDeEmpresa } from "@/lib/depurador/tienda";

// Alarma bloqueante de descripciones NUEVAS (no catalogadas), compartida por el
// Depurador y Facturas Tienda. Lista cada descripción con su marca y, para
// admin/secretaria, permite aprobarla y agregarla al catálogo desde la app
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
}

interface Props {
  items: DescripcionNueva[];
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

export default function AlarmaDescripcionesNuevas({ items, onAprobada, onClose }: Props) {
  useBodyScrollLock(true);
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // Rol desde sessionStorage SOLO en efecto (nunca en useState(() => ...) — regla SSR).
  useEffect(() => {
    setMounted(true);
    setRole(sessionStorage.getItem("cxc_role") || "");
  }, []);

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
        body: JSON.stringify({ marca: confirm.marcaElegida, descripcion: confirm.item.desc }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setConfirm((c) => (c ? { ...c, enviando: false, error: d?.error || "No se pudo aprobar. Intenta de nuevo." } : c));
        return;
      }
      const { marcaElegida, item } = confirm;
      setConfirm(null);
      onAprobada(marcaElegida, item.desc);
    } catch {
      setConfirm((c) => (c ? { ...c, enviando: false, error: "No se pudo aprobar. Revisa tu conexión e intenta de nuevo." } : c));
    }
  };

  return createPortal(
    <div className="fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border-4 border-red-500 bg-white p-6">
        <div className="mb-2 text-center text-5xl">⚠️</div>
        <h2 className="text-center text-xl font-bold text-red-700">
          {items.length} descripción(es) NUEVA(S) detectada(s)
        </h2>
        {puedeAprobar ? (
          <p className="mt-2 text-center text-sm text-stone-600">
            Estas descripciones <b>NO están en el catálogo</b> de su marca y <b>bloquean la descarga</b>.
            Puedes aprobarlas aquí mismo para agregarlas al catálogo — avísale a Daniel antes de aprobar.
          </p>
        ) : (
          <p className="mt-2 text-center text-sm text-stone-600">
            Estas descripciones <b>NO están en el catálogo</b> de su marca. <b>No se puede descargar</b> la
            plantilla hasta que Daniel las apruebe y se agreguen al catálogo. Toma una captura de pantalla
            y envíasela a Daniel.
          </p>
        )}
        <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-red-200 bg-red-50 p-3">
          {items.map((o, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1 text-[13px] text-stone-800">
              <div className="min-w-0">
                <span className="font-semibold text-red-800">{o.marca}</span> → {o.desc}
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
        <div className="fade-in fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6">
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
