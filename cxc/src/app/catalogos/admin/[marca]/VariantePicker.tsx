"use client";

// Selector de foto por variantes — compartido por los dos estilos de admin
// (tarjetas de Reebok y filas de Joybees/Tommy).
//
// Botón "Cambiar foto" → tira HORIZONTAL con todas las vistas que el ZIP del
// B2B guardó para ese SKU. La que está puesta lleva ✓. UN CLIC GUARDA: sin
// modal, sin botón Guardar — optimista + toast corto, y si el server falla se
// revierte y se avisa.
//
// Si el SKU no tiene variantes guardadas el botón sale deshabilitado con el
// tooltip "Sube el ZIP del B2B para ver más fotos".

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { vistaActualDeImageUrl, type StorageMarcaKey } from "@/lib/catalogos/variantes-paths";

interface Variante {
  vista: number;
  url: string;
}

export function VariantePicker({
  marca,
  product,
  tieneVariantes,
  onSaved,
  showToast,
  compacto,
}: {
  marca: MarcaUiKey;
  product: { id: string; sku: string | null; name: string; image_url: string | null };
  /** Ya sabemos (lista global) si este SKU tiene fotos del banco. */
  tieneVariantes: boolean;
  onSaved: () => Promise<void>;
  showToast: (msg: string) => void;
  /** Variante visual para las filas densas. */
  compacto?: boolean;
}) {
  const theme = getMarcaTheme(marca)!;
  const [abierto, setAbierto] = useState(false);
  const [variantes, setVariantes] = useState<Variante[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<number | null>(null);
  // Optimista: se pinta el ✓ en la recién elegida mientras el server confirma.
  const [elegidaOptimista, setElegidaOptimista] = useState<number | null>(null);
  // Cuál está puesta según el server (resuelve también las fotos que copió la
  // carga masiva, cuya URL no nombra la variante — ver variantes-server.ts).
  const [actualServer, setActualServer] = useState<number | null>(null);
  const vivo = useRef(true);

  useEffect(() => () => { vivo.current = false; }, []);

  const sku = product.sku || "";
  const vistaActual =
    elegidaOptimista ??
    vistaActualDeImageUrl(product.image_url, marca as StorageMarcaKey, sku) ??
    actualServer;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`${theme.api}/products/variantes?sku=${encodeURIComponent(sku)}`);
      if (!res.ok) throw new Error("No se pudieron cargar las fotos.");
      const { variantes: v, actual } = (await res.json()) as { variantes: Variante[]; actual: number | null };
      if (vivo.current) {
        setVariantes(v);
        setActualServer(actual ?? null);
      }
    } catch (e) {
      if (vivo.current) setError(e instanceof Error ? e.message : "No se pudieron cargar las fotos.");
    } finally {
      if (vivo.current) setCargando(false);
    }
  }, [theme.api, sku]);

  function toggle() {
    const next = !abierto;
    setAbierto(next);
    if (next && variantes === null && !cargando) void cargar();
  }

  async function elegir(vista: number) {
    if (guardando != null || vista === vistaActual) return;
    const previa = elegidaOptimista;
    setElegidaOptimista(vista);
    setGuardando(vista);
    try {
      const res = await fetch(`${theme.api}/products/variantes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, vista }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "No se pudo guardar la foto.");
      }
      showToast("Foto cambiada");
      await onSaved();
    } catch (e) {
      if (vivo.current) setElegidaOptimista(previa);
      showToast(e instanceof Error ? e.message : "No se pudo guardar la foto.");
    } finally {
      if (vivo.current) setGuardando(null);
    }
  }

  const btnBase = compacto
    ? "px-3 py-2 rounded-md text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-[0.97] transition whitespace-nowrap"
    : "w-full py-2 rounded-md text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 active:scale-[0.97] transition";

  if (!tieneVariantes) {
    return (
      <button
        type="button"
        disabled
        title="Sube el ZIP del B2B para ver más fotos"
        className={`${btnBase} opacity-40 cursor-not-allowed`}
      >
        Cambiar foto
      </button>
    );
  }

  return (
    <div className={compacto ? "" : "w-full"}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={abierto}
        className={`${btnBase} ${abierto ? "bg-gray-50" : ""}`}
      >
        {abierto ? "Cerrar fotos" : "Cambiar foto"}
      </button>

      {abierto && (
        <div className="mt-2">
          {cargando && <p className="text-[11px] text-gray-400">Cargando fotos…</p>}
          {error && <p className="text-[11px] text-[#E4002B]">{error}</p>}
          {variantes && variantes.length === 0 && !cargando && (
            <p className="text-[11px] text-gray-400">Este código no tiene más fotos guardadas.</p>
          )}
          {variantes && variantes.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5">
              {variantes.map((v) => {
                const activa = v.vista === vistaActual;
                return (
                  <button
                    key={v.vista}
                    type="button"
                    onClick={() => elegir(v.vista)}
                    disabled={guardando != null}
                    aria-label={`Usar la foto ${v.vista}${activa ? " (actual)" : ""}`}
                    aria-pressed={activa}
                    title={activa ? "Foto actual" : `Usar la foto ${v.vista}`}
                    className={`relative shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 bg-[#F5F0E8] transition active:scale-[0.95] disabled:opacity-60 ${
                      activa ? "border-emerald-500" : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <img src={v.url} alt={`Foto ${v.vista} de ${product.name}`} className="w-full h-full object-contain" loading="lazy" />
                    {activa && (
                      <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                        <svg width="9" height="7" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </span>
                    )}
                    {guardando === v.vista && (
                      <span className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default VariantePicker;
