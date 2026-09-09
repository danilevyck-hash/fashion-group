"use client";

// ─────────────────────────────────────────────────────────────────────────────
// NOVEDADES — TERCERA PESTAÑA de Usuarios (9-sep-2026).
//
// Daniel tiene que poder **ver la lista** de avisos y **saber cuántas personas
// ya la vieron**. Va acá y NO en un módulo nuevo: Usuarios ya es la pantalla
// admin-only donde se mira quién es quién y quién entró.
//
// 🔴 SOLO LEE. Los textos se escriben en `src/lib/novedades/lista.ts`, que es un
// archivo del repo a propósito: un aviso para una persona lo escribe una
// persona, y pasa por revisión como cualquier otro cambio. Acá no hay
// formulario.
//
// ⚠️ Mientras la DDL `20261024120000` no corra no hay a quién contar, y la
// pantalla lo DICE en vez de mostrar «0 personas» como si fuera un dato.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { SkeletonTable } from "@/components/ui";
import { fmtDate } from "@/lib/format";

interface FilaNovedad {
  id: string;
  modulo: string;
  moduloLabel: string;
  fecha: string;
  texto: string;
  vigente: boolean;
  vieron: string[];
}

export default function NovedadesTab() {
  const [filas, setFilas] = useState<FilaNovedad[] | null>(null);
  const [tablaLista, setTablaLista] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/novedades/resumen");
        const j = await r.json();
        if (!vivo) return;
        setFilas(Array.isArray(j?.novedades) ? j.novedades : []);
        setTablaLista(j?.tablaLista !== false);
      } catch {
        if (vivo) setFilas([]);
      }
    })();
    return () => { vivo = false; };
  }, []);

  if (filas === null) return <SkeletonTable rows={4} cols={3} />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Lo que cada persona ve al entrar a su módulo. Se muestran hasta tres a la
        vez, las más nuevas, y cada una se va sola a los 30 días.
      </p>

      {!tablaLista && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Todavía no se puede contar quién los leyó: falta correr el cambio de
          base. Los avisos salen igual y se cierran igual.
        </div>
      )}

      <ul className="space-y-2">
        {filas.map((n) => (
          <li key={n.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{n.moduloLabel}</span>
              <span className="text-xs text-gray-400">{fmtDate(n.fecha)}</span>
              {!n.vigente && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                  Ya no se muestra
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-700">{n.texto}</p>
            <p className="mt-2 text-sm text-gray-500">
              {!tablaLista
                ? "—"
                : n.vieron.length === 0
                  ? "Todavía no la ha leído nadie"
                  : `${n.vieron.length} ${n.vieron.length === 1 ? "persona la leyó" : "personas la leyeron"}: ${n.vieron.join(", ")}`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
