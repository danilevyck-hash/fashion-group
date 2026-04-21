"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { ConfirmModal, ConfirmDeleteModal } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import type { AnuladoItem } from "@/lib/marketing/types";

type FiltroTipo = "todos" | "proyecto" | "factura" | "cobranza";

const TIPO_LABEL: Record<AnuladoItem["tipo"], string> = {
  proyecto: "Proyecto",
  factura: "Factura",
  cobranza: "Cobranza",
};

const TIPO_BADGE: Record<AnuladoItem["tipo"], string> = {
  proyecto: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  factura: "bg-blue-50 text-blue-700 border-blue-200",
  cobranza: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

interface PreviewLimpieza {
  conteo: { proyectos: number; facturas: number; cobranzas: number };
  total: number;
  anios: number;
}

interface PapeleraListaProps {
  esAdmin: boolean;
}

export function PapeleraLista({ esAdmin }: PapeleraListaProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<AnuladoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroTipo>("todos");

  // Restaurar
  const [restaurando, setRestaurando] = useState<string | null>(null); // id en progreso
  const [confirmRestaurar, setConfirmRestaurar] = useState<AnuladoItem | null>(
    null
  );

  // Limpieza anual (admin-only)
  const [preview, setPreview] = useState<PreviewLimpieza | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmLimpieza, setConfirmLimpieza] = useState(false);
  const [ejecutandoLimpieza, setEjecutandoLimpieza] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marketing/papelera", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { items: AnuladoItem[] };
      setItems(json.items ?? []);
    } catch (err) {
      console.error("Error cargando papelera:", err);
      toast("No se pudo cargar la papelera. Intenta de nuevo.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const cargarPreview = useCallback(async () => {
    if (!esAdmin) return;
    setLoadingPreview(true);
    try {
      const res = await fetch("/api/marketing/papelera/limpieza", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as PreviewLimpieza;
      setPreview(json);
    } catch (err) {
      console.error("Error cargando preview limpieza:", err);
    } finally {
      setLoadingPreview(false);
    }
  }, [esAdmin]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    void cargarPreview();
  }, [cargarPreview]);

  const itemsFiltrados = useMemo(() => {
    if (filtro === "todos") return items;
    return items.filter((x) => x.tipo === filtro);
  }, [items, filtro]);

  async function doRestaurar(item: AnuladoItem) {
    setRestaurando(item.id);
    try {
      const res = await fetch("/api/marketing/papelera/restaurar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: item.tipo, id: item.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast(`${TIPO_LABEL[item.tipo]} restaurada`, "success");
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      void cargarPreview();
    } catch (err) {
      console.error("Error restaurando:", err);
      const msg = err instanceof Error ? err.message : "No se pudo restaurar";
      toast(msg, "error");
    } finally {
      setRestaurando(null);
      setConfirmRestaurar(null);
    }
  }

  async function doLimpieza() {
    setEjecutandoLimpieza(true);
    try {
      const res = await fetch("/api/marketing/papelera/limpieza", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { total: number };
      toast(
        `Limpieza terminada. Se eliminaron ${json.total} registros.`,
        "success"
      );
      await cargar();
      await cargarPreview();
    } catch (err) {
      console.error("Error en limpieza:", err);
      const msg =
        err instanceof Error ? err.message : "No se pudo hacer la limpieza";
      toast(msg, "error");
    } finally {
      setEjecutandoLimpieza(false);
      setConfirmLimpieza(false);
    }
  }

  const contadoresPorTipo = useMemo(() => {
    const c: Record<FiltroTipo, number> = {
      todos: items.length,
      proyecto: 0,
      factura: 0,
      cobranza: 0,
    };
    for (const it of items) c[it.tipo] += 1;
    return c;
  }, [items]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Papelera</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Registros anulados. Puedes restaurarlos o dejar que la limpieza anual los elimine.
        </p>
      </div>
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(["todos", "proyecto", "factura", "cobranza"] as FiltroTipo[]).map(
          (f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-md text-sm border transition-all active:scale-[0.97] ${
                filtro === f
                  ? "bg-black text-white border-black"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {f === "todos"
                ? "Todos"
                : f === "proyecto"
                  ? "Proyectos"
                  : f === "factura"
                    ? "Facturas"
                    : "Cobranzas"}{" "}
              <span
                className={`ml-1 text-xs ${filtro === f ? "text-white/70" : "text-gray-400"}`}
              >
                {contadoresPorTipo[f]}
              </span>
            </button>
          )
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="rounded-lg border border-gray-200 p-6 text-sm text-gray-500">
          Cargando papelera...
        </div>
      ) : itemsFiltrados.length === 0 ? (
        <div className="rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-600">La papelera está vacía.</p>
          <p className="text-xs text-gray-400 mt-1">
            Los registros anulados aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left font-medium px-4 py-2 w-24">Tipo</th>
                <th className="text-left font-medium px-4 py-2">Nombre</th>
                <th className="text-left font-medium px-4 py-2 w-32">
                  Anulado
                </th>
                <th className="text-left font-medium px-4 py-2">Motivo</th>
                <th className="text-right font-medium px-4 py-2 w-32">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody>
              {itemsFiltrados.map((item) => (
                <tr
                  key={`${item.tipo}-${item.id}`}
                  className="border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border text-xs px-2 py-0.5 font-medium ${TIPO_BADGE[item.tipo]}`}
                    >
                      {TIPO_LABEL[item.tipo]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900">{item.nombre}</td>
                  <td
                    className="px-4 py-3 text-gray-600 tabular-nums"
                    title={item.anulado_en}
                  >
                    {fmtDate(item.anulado_en.slice(0, 10))}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.anulado_motivo || (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setConfirmRestaurar(item)}
                      disabled={restaurando === item.id}
                      className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 bg-white hover:bg-gray-50 active:scale-[0.97] disabled:opacity-50"
                    >
                      {restaurando === item.id ? "Restaurando..." : "Restaurar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Limpieza anual (admin-only) */}
      {esAdmin && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50/40 p-4">
          <h3 className="text-sm font-medium text-red-900 mb-1">
            Limpieza anual (definitiva)
          </h3>
          <p className="text-xs text-red-700/80 mb-3">
            Elimina de forma permanente los registros anulados hace más de 5
            años (período de revisión DGI). Esta acción no se puede deshacer.
          </p>
          {loadingPreview ? (
            <p className="text-xs text-gray-500">Calculando...</p>
          ) : preview && preview.total === 0 ? (
            <p className="text-xs text-gray-500">
              No hay registros con más de 5 años para eliminar.
            </p>
          ) : preview ? (
            <>
              <p className="text-xs text-red-800 mb-3">
                Se eliminarán{" "}
                <strong className="tabular-nums">{preview.total}</strong>{" "}
                registros:{" "}
                <span className="tabular-nums">
                  {preview.conteo.proyectos} proyectos,{" "}
                  {preview.conteo.facturas} facturas,{" "}
                  {preview.conteo.cobranzas} cobranzas
                </span>
                .
              </p>
              <button
                onClick={() => setConfirmLimpieza(true)}
                className="px-4 py-2 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97]"
              >
                Ejecutar limpieza anual
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* Modal restaurar (no destructivo) */}
      <ConfirmModal
        open={Boolean(confirmRestaurar)}
        title="Restaurar registro"
        message={
          confirmRestaurar
            ? `Se restaurará ${TIPO_LABEL[confirmRestaurar.tipo].toLowerCase()} "${confirmRestaurar.nombre}" y volverá al módulo.`
            : ""
        }
        confirmLabel="Restaurar"
        onClose={() => setConfirmRestaurar(null)}
        onConfirm={() => {
          if (confirmRestaurar) void doRestaurar(confirmRestaurar);
        }}
        loading={Boolean(restaurando)}
      />

      {/* Modal limpieza (destructivo con delay) */}
      <ConfirmDeleteModal
        open={confirmLimpieza}
        title="Limpieza anual definitiva"
        description={
          preview
            ? `Vas a eliminar permanentemente ${preview.total} registros anulados hace más de 5 años. Esta acción no se puede deshacer.`
            : "Eliminar registros anulados permanentemente."
        }
        onCancel={() => setConfirmLimpieza(false)}
        onConfirm={doLimpieza}
        loading={ejecutandoLimpieza}
      />
    </div>
  );
}

export default PapeleraLista;
