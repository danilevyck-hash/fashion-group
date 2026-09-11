"use client";

// ============================================================================
// LOS PROYECTOS ELIMINADOS, Y CÓMO DEVOLVERLOS (11-sep-2026).
//
// 🩸 UN PROYECTO ELIMINADO NO SE RECUPERABA DESDE NINGUNA PANTALLA. `anular` es
// soft delete —la fila se queda con su `anulado_en` y su motivo— pero
// `proyectos-lista` filtra `.is("anulado_en", null)` y la pantalla «Anulados»
// se retiró: la ÚNICA puerta a `papelera/restaurar` era el aviso «Deshacer»
// guardado en `useState`, o sea que bastaba recargar con F5 —o cerrar la
// pestaña— para perder el proyecto para siempre.
//
// Daniel, textual: *«a) una lista "Eliminados" con "Restaurar", como en
// Guías»*.
//
// 🔑 ES EL MISMO PATRÓN QUE «FACTURAS ANULADAS» (`FacturasSection`), que existe
// desde el 11-ago por la misma razón: plegado, tenue, sin sumar en ningún total
// y con su motivo a la vista.
//
// 🔴 SI NO HAY NINGUNO, NO APARECE. Nada de un «Eliminados (0)»: la regla de la
// casa es callar cuando no hay nada que decir. Medido el 11-sep-2026: **0
// proyectos anulados** en toda la base.
//
// ⚠️ NO CAMBIA LO QUE SE GUARDA: restaurar es el MISMO `POST
// /api/marketing/papelera/restaurar` que ya usaba el «Deshacer».
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { formatearFecha } from "@/lib/marketing/normalizar";

interface ProyectoAnulado {
  id: string;
  nombre: string | null;
  tienda: string | null;
  anulado_en: string | null;
  anulado_motivo: string | null;
}

interface Props {
  /** El bloque de la marca (`TH`, `ck`, `multifashion`…). */
  bloque: string;
  /** Recargar la lista de arriba cuando uno vuelve. */
  onRestaurado: () => void;
}

export default function ProyectosEliminados({ bloque, onRestaurado }: Props) {
  const { toast } = useToast();
  const [lista, setLista] = useState<ProyectoAnulado[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [restaurando, setRestaurando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/marketing/proyectos-anulados?bloque=${encodeURIComponent(bloque)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const datos = (await res.json()) as ProyectoAnulado[];
      setLista(Array.isArray(datos) ? datos : []);
    } catch {
      // Falla ABIERTA: sin esta lista la pantalla es exactamente la de antes.
    }
  }, [bloque]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const restaurar = async (p: ProyectoAnulado) => {
    setRestaurando(p.id);
    try {
      const res = await fetch("/api/marketing/papelera/restaurar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "proyecto", id: p.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo devolver el proyecto");
      }
      toast("Listo, el proyecto volvió", "success");
      await cargar();
      onRestaurado();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "No se pudo devolver el proyecto",
        "error",
      );
    } finally {
      setRestaurando(null);
    }
  };

  if (lista.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="w-full flex items-center justify-between gap-3 px-4 min-h-[44px] py-2 text-left"
      >
        <span className="text-sm text-gray-600">
          Eliminados ({lista.length})
          <span className="text-gray-400"> · no cuentan como gasto</span>
        </span>
        <span className="text-xs text-gray-500 shrink-0">{abierto ? "Ocultar" : "Ver"}</span>
      </button>

      {abierto && (
        <ul className="px-4 pb-4 divide-y divide-gray-200">
          {lista.map((p) => (
            <li key={p.id} className="py-3">
              <div className="text-sm text-gray-900 break-words">
                {p.tienda || p.nombre || "Sin nombre"}
              </div>
              <div className="text-[12px] text-gray-500">
                Eliminado {p.anulado_en ? formatearFecha(p.anulado_en) : "sin fecha"}
                {p.anulado_motivo ? ` · ${p.anulado_motivo}` : ""}
              </div>
              <button
                type="button"
                onClick={() => restaurar(p)}
                disabled={restaurando === p.id}
                className="text-xs text-gray-700 hover:text-black underline underline-offset-2 min-h-[44px] inline-flex items-center disabled:opacity-50"
              >
                {restaurando === p.id ? "Devolviendo…" : "Restaurar"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
