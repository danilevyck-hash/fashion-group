"use client";

import { useEffect, useMemo, useState } from "react";
import { mutate } from "swr";
import { norm } from "@/lib/depurador/logic";
import { fmtDate } from "@/lib/format";
import { CATALOGO_DESCRIPCIONES_KEY } from "@/lib/hooks/useCatalogoDescripciones";

// Vista SOLO admin: catálogo completo de descripciones del Depurador (tabla
// depurador_descripciones), con origen, quién aprobó y cuándo, y toggle
// Activa/Inactiva. Desactivar NO borra — el histórico queda.

interface DescRow {
  id: string;
  marca: string;
  descripcion: string;
  activa: boolean;
  origen: "seed" | "aprobada";
  aprobada_por: string | null;
  aprobada_at: string | null;
  created_at: string;
}

export default function CatalogoDescripcionesAdmin() {
  const [rows, setRows] = useState<DescRow[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setFallo(false);
    fetch("/api/productos/cargar/descripciones?admin=1")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch"))))
      .then((d: { rows: DescRow[] }) => { if (alive) setRows(d.rows ?? []); })
      .catch(() => { if (alive) { setRows(null); setFallo(true); } });
    return () => { alive = false; };
  }, [reloadKey]);

  const grupos = useMemo(() => {
    if (!rows) return [] as { marca: string; items: DescRow[] }[];
    const s = norm(q);
    const filtered = s
      ? rows.filter((r) => norm(r.marca).includes(s) || norm(r.descripcion).includes(s))
      : rows;
    const byMarca = new Map<string, DescRow[]>();
    for (const r of filtered) {
      if (!byMarca.has(r.marca)) byMarca.set(r.marca, []);
      byMarca.get(r.marca)!.push(r);
    }
    return [...byMarca.entries()].map(([marca, items]) => ({ marca, items }));
  }, [rows, q]);

  const toggle = async (row: DescRow) => {
    if (busyId) return;
    setBusyId(row.id);
    setError("");
    try {
      const res = await fetch(`/api/productos/cargar/descripciones/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: !row.activa }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setError(d?.error || "No se pudo actualizar. Intenta de nuevo.");
        return;
      }
      setRows((prev) => prev ? prev.map((r) => (r.id === row.id ? { ...r, activa: !row.activa } : r)) : prev);
      // Refresca el catálogo compartido (Depurador / Facturas Tienda / fórmulas).
      void mutate(CATALOGO_DESCRIPCIONES_KEY);
    } catch {
      setError("No se pudo actualizar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setBusyId(null);
    }
  };

  const total = rows?.length ?? 0;
  const activas = rows?.filter((r) => r.activa).length ?? 0;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-10">
      <div className="mb-4 border-b-2 border-stone-900 pb-3">
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-stone-900">Catálogo de descripciones</h2>
        <p className="mt-1 text-sm text-stone-500">
          La fuente de verdad del Depurador y Facturas Tienda. Desactivar no borra: la descripción
          deja de valer en el catálogo pero el histórico queda.
        </p>
      </div>

      {rows === null && !fallo && (
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
          Cargando catálogo de descripciones…
        </div>
      )}
      {fallo && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>No se pudo cargar el catálogo de descripciones. Intenta de nuevo.</span>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-md border border-red-300 bg-white px-3 py-1 text-[13px] font-semibold text-red-700 transition hover:bg-red-100 active:scale-[0.97]"
          >
            Reintentar
          </button>
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</div>
      )}

      {rows !== null && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar marca o descripción…"
              className="min-h-[44px] w-full max-w-xs rounded-md border border-stone-300 bg-white px-3 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
            <span className="text-[13px] text-stone-500">
              <b className="font-semibold text-stone-900">{activas}</b> activas de{" "}
              <b className="font-semibold text-stone-900">{total}</b>
            </span>
          </div>

          {grupos.length === 0 && (
            <p className="py-8 text-center text-sm text-stone-400">Ninguna descripción coincide con &quot;{q}&quot;.</p>
          )}

          {grupos.map((g) => (
            <div key={g.marca} className="mb-4 overflow-hidden rounded-lg border border-stone-200 bg-white">
              <div className="border-b border-stone-200 bg-stone-50 px-3.5 py-2 text-[13px] font-bold text-stone-900">
                {g.marca}
                <span className="ml-2 text-[11px] font-normal text-stone-400">
                  ({g.items.filter((r) => r.activa).length} activas de {g.items.length})
                </span>
              </div>
              {g.items.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-3.5 py-1.5 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className={`text-[13px] ${r.activa ? "text-stone-900" : "text-stone-400 line-through"}`}>
                      {r.descripcion}
                    </span>
                    {r.origen === "aprobada" ? (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        Aprobada
                        {r.aprobada_por ? ` por ${r.aprobada_por}` : ""}
                        {r.aprobada_at ? ` · ${fmtDate(r.aprobada_at.slice(0, 10))}` : ""}
                      </span>
                    ) : (
                      <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">
                        Catálogo original
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(r)}
                    disabled={busyId === r.id}
                    className={`inline-flex min-h-[44px] items-center justify-center rounded-md border px-2.5 text-[12px] font-semibold transition active:scale-[0.97] disabled:opacity-50 ${
                      r.activa
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300"
                        : "border-stone-300 bg-white text-stone-500 hover:border-stone-400"
                    }`}
                  >
                    {busyId === r.id ? "…" : r.activa ? "Activa" : "Inactiva"}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
