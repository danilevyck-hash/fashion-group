"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastSystem";
import { EstadoBadge, MarcaBadge } from "@/components/marketing";
import { ConfirmModal } from "@/components/ui";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import type {
  FacturaConAdjuntos,
  MarcaPorcentajeInput,
  MkMarca,
  ProyectoConMarcas,
} from "@/lib/marketing/types";
import FacturasSection from "./FacturasSection";
import FotosSection from "./FotosSection";

interface ProyectoDetailProps {
  proyectoId: string;
}

type Tab = "facturas" | "fotos" | "cobranzas";

function esMarcaConocida(c: string): c is "TH" | "CK" | "RBK" {
  return c === "TH" || c === "CK" || c === "RBK";
}

export default function ProyectoDetail({ proyectoId }: ProyectoDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [proyecto, setProyecto] = useState<ProyectoConMarcas | null>(null);
  const [marcasCatalogo, setMarcasCatalogo] = useState<MkMarca[]>([]);
  const [facturasResumen, setFacturasResumen] = useState<FacturaConAdjuntos[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("facturas");

  // Modals
  const [showCerrar, setShowCerrar] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [showAnular, setShowAnular] = useState(false);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [editarMarcas, setEditarMarcas] = useState(false);
  const [marcasEdit, setMarcasEdit] = useState<MarcaPorcentajeInput[]>([]);
  const [guardandoMarcas, setGuardandoMarcas] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, mRes, fRes] = await Promise.all([
        fetch(`/api/marketing/proyectos/${proyectoId}`),
        fetch("/api/marketing/marcas"),
        fetch(`/api/marketing/proyectos/${proyectoId}/facturas`),
      ]);
      if (!pRes.ok) {
        const err = await pRes.json().catch(() => null);
        throw new Error(err?.error ?? "Proyecto no encontrado");
      }
      const p = (await pRes.json()) as ProyectoConMarcas;
      setProyecto(p);
      if (mRes.ok) {
        setMarcasCatalogo((await mRes.json()) as MkMarca[]);
      }
      if (fRes.ok) {
        setFacturasResumen((await fRes.json()) as FacturaConAdjuntos[]);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al cargar el proyecto";
      toast(msg, "error");
      router.push("/marketing");
    } finally {
      setLoading(false);
    }
  }, [proyectoId, toast, router]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totales = useMemo(() => {
    const vigentes = facturasResumen.filter((f) => !f.anulado_en);
    const totalFacturado = vigentes.reduce((acc, f) => acc + f.total, 0);
    const subtotalFacturado = vigentes.reduce((acc, f) => acc + f.subtotal, 0);
    return {
      totalFacturado: Number(totalFacturado.toFixed(2)),
      subtotalFacturado: Number(subtotalFacturado.toFixed(2)),
      conteoVigentes: vigentes.length,
    };
  }, [facturasResumen]);

  const desglosePorMarca = useMemo(() => {
    if (!proyecto) return [];
    return proyecto.marcas.map((m) => {
      const cobrable = Number(
        ((totales.subtotalFacturado * m.porcentaje) / 100).toFixed(2),
      );
      return { ...m, cobrable };
    });
  }, [proyecto, totales.subtotalFacturado]);

  const handleCerrar = async () => {
    if (!proyecto) return;
    setCerrando(true);
    try {
      const res = await fetch(
        `/api/marketing/proyectos/${proyecto.id}/cerrar`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo cerrar el proyecto");
      }
      toast("Proyecto cerrado", "success");
      setShowCerrar(false);
      cargar();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cerrar";
      toast(msg, "error");
    } finally {
      setCerrando(false);
    }
  };

  const handleAnular = async () => {
    if (!proyecto || !anularMotivo.trim()) return;
    setAnulando(true);
    try {
      const res = await fetch(
        `/api/marketing/proyectos/${proyecto.id}/anular`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ motivo: anularMotivo.trim() }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo anular");
      }
      toast("Proyecto anulado", "success");
      router.push("/marketing");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al anular";
      toast(msg, "error");
    } finally {
      setAnulando(false);
    }
  };

  const abrirEditarMarcas = () => {
    if (!proyecto) return;
    setMarcasEdit(
      proyecto.marcas.map((m) => ({
        marcaId: m.marca.id,
        porcentaje: m.porcentaje,
      })),
    );
    setEditarMarcas(true);
  };

  const handleGuardarMarcas = async () => {
    if (!proyecto) return;
    const suma = marcasEdit.reduce((acc, m) => acc + Number(m.porcentaje), 0);
    if (Math.abs(suma - 100) > 0.01) {
      toast(`La suma debe ser 100% (actual: ${suma}%)`, "error");
      return;
    }
    setGuardandoMarcas(true);
    try {
      const res = await fetch(
        `/api/marketing/proyectos/${proyecto.id}/marcas`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marcas: marcasEdit }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "No se pudo actualizar");
      }
      toast("Marcas actualizadas", "success");
      setEditarMarcas(false);
      cargar();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al actualizar";
      toast(msg, "error");
    } finally {
      setGuardandoMarcas(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
        <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!proyecto) return null;

  const anulado = !!proyecto.anulado_en;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-gray-900 truncate">
              {proyecto.tienda}
            </div>
            {proyecto.nombre && (
              <div className="text-sm text-gray-500 truncate">
                {proyecto.nombre}
              </div>
            )}
            <div className="text-xs text-gray-400 mt-1">
              Inicio: {formatearFecha(proyecto.fecha_inicio)}
              {proyecto.fecha_cierre
                ? ` · Cerrado: ${formatearFecha(proyecto.fecha_cierre)}`
                : ""}
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            <EstadoBadge tipo="proyecto" estado={proyecto.estado} size="md" />
            {anulado && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-700 font-medium">
                Anulado
              </span>
            )}
          </div>
        </div>

        {/* Marcas */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-2">
            {proyecto.marcas.map((m) => (
              <div
                key={m.marca.id}
                className="inline-flex items-center gap-1.5"
              >
                {esMarcaConocida(m.marca.codigo) ? (
                  <MarcaBadge codigo={m.marca.codigo} />
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                    {m.marca.nombre}
                  </span>
                )}
                <span className="text-xs text-gray-600 tabular-nums font-medium">
                  {m.porcentaje}%
                </span>
              </div>
            ))}
          </div>
          {!anulado && proyecto.estado !== "cobrado" && (
            <button
              type="button"
              onClick={abrirEditarMarcas}
              className="text-xs text-gray-500 hover:text-black transition"
            >
              Editar %
            </button>
          )}
        </div>

        {proyecto.notas && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="text-xs text-gray-400 mb-0.5">Notas</div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              {proyecto.notas}
            </div>
          </div>
        )}

        {/* Totales */}
        <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-gray-100">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">
              Facturas
            </div>
            <div className="text-sm font-semibold tabular-nums text-gray-900">
              {totales.conteoVigentes}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">
              Subtotal
            </div>
            <div className="text-sm font-semibold font-mono tabular-nums text-gray-900">
              {formatearMonto(totales.subtotalFacturado)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">
              Total facturado
            </div>
            <div className="text-sm font-semibold font-mono tabular-nums text-gray-900">
              {formatearMonto(totales.totalFacturado)}
            </div>
          </div>
        </div>

        {/* Desglose cobrable por marca */}
        {!anulado && totales.subtotalFacturado > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">
              Cobrable por marca (sobre subtotal)
            </div>
            <div className="space-y-1.5">
              {desglosePorMarca.map((d) => (
                <div
                  key={d.marca.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="text-gray-700">
                    {d.marca.nombre}{" "}
                    <span className="text-gray-400 tabular-nums">
                      ({d.porcentaje}%)
                    </span>
                  </div>
                  <div className="font-mono tabular-nums text-gray-900">
                    {formatearMonto(d.cobrable)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Acciones principales */}
        {!anulado && (
          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
            {proyecto.estado !== "cobrado" && (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/marketing/cobranzas/nueva?proyecto=${proyecto.id}`,
                  )
                }
                className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition"
              >
                Crear cobranza
              </button>
            )}
            {proyecto.estado !== "cobrado" && (
              <button
                type="button"
                onClick={() => setShowCerrar(true)}
                className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-2 text-sm hover:bg-gray-50 transition"
              >
                Cerrar proyecto
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAnular(true)}
              className="rounded-md border border-red-200 bg-white text-red-700 px-3 py-2 text-sm hover:bg-red-50 transition ml-auto"
            >
              Anular
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {(["facturas", "fotos", "cobranzas"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm transition relative ${
              tab === t
                ? "text-gray-900 font-semibold"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "facturas"
              ? "Facturas"
              : t === "fotos"
                ? "Fotos"
                : "Cobranzas"}
            {tab === t && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-fuchsia-500" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "facturas" && (
        <FacturasSection proyecto={proyecto} onChange={cargar} />
      )}
      {tab === "fotos" && <FotosSection proyectoId={proyecto.id} />}
      {tab === "cobranzas" && (
        <section className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
          <div className="text-sm font-medium text-gray-700 mb-1">
            Cobranzas del proyecto
          </div>
          <div className="text-xs text-gray-500 mb-4">
            Consulta o crea cobranzas desde la sección dedicada.
          </div>
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={() =>
                router.push(`/marketing/cobranzas?proyecto=${proyecto.id}`)
              }
              className="rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-2 text-sm hover:bg-gray-50 transition"
            >
              Ver cobranzas
            </button>
            {!anulado && proyecto.estado !== "cobrado" && (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/marketing/cobranzas/nueva?proyecto=${proyecto.id}`,
                  )
                }
                className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition"
              >
                Nueva cobranza
              </button>
            )}
          </div>
        </section>
      )}

      {/* Modal cerrar proyecto */}
      <ConfirmModal
        open={showCerrar}
        onClose={() => !cerrando && setShowCerrar(false)}
        onConfirm={handleCerrar}
        title="Cerrar proyecto"
        message="Se marcará como cobrado y se fijará la fecha de cierre al día de hoy. Podrás seguir viéndolo pero ya no se recomienda agregar facturas."
        confirmLabel="Cerrar proyecto"
        loading={cerrando}
      />

      {/* Modal anular */}
      {showAnular && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => !anulando && setShowAnular(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-sm w-full mx-0 sm:mx-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1">Anular proyecto</h3>
            <p className="text-sm text-gray-500 mb-4">
              Se marcará como anulado. Podrás restaurarlo desde Papelera.
            </p>
            <label
              htmlFor="motivo-anular-proyecto"
              className="block text-sm text-gray-600 mb-1"
            >
              Motivo<span className="text-red-500 ml-0.5">*</span>
            </label>
            <textarea
              id="motivo-anular-proyecto"
              rows={3}
              value={anularMotivo}
              onChange={(e) => setAnularMotivo(e.target.value)}
              placeholder="Explica por qué se anula"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none mb-4"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleAnular}
                disabled={anulando || anularMotivo.trim().length === 0}
                className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] disabled:opacity-50 transition"
              >
                {anulando ? "Anulando…" : "Anular proyecto"}
              </button>
              <button
                type="button"
                onClick={() => setShowAnular(false)}
                disabled={anulando}
                className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar % marcas */}
      {editarMarcas && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => !guardandoMarcas && setEditarMarcas(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white sm:rounded-lg rounded-t-2xl p-6 max-w-md w-full mx-0 sm:mx-4 border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-1">
              Editar reparto por marca
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              La suma debe ser exactamente 100%.
            </p>
            <EditarMarcasForm
              valor={marcasEdit}
              catalogo={marcasCatalogo}
              onChange={setMarcasEdit}
            />
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={handleGuardarMarcas}
                disabled={guardandoMarcas}
                className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium bg-black text-white hover:bg-gray-800 active:scale-[0.97] disabled:opacity-50 transition"
              >
                {guardandoMarcas ? "Guardando…" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => setEditarMarcas(false)}
                disabled={guardandoMarcas}
                className="flex-1 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-md text-sm hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Editor inline de marcas del proyecto
// --------------------------------------------------------------------------
function EditarMarcasForm({
  valor,
  catalogo,
  onChange,
}: {
  valor: MarcaPorcentajeInput[];
  catalogo: MkMarca[];
  onChange: (v: MarcaPorcentajeInput[]) => void;
}) {
  const suma = valor.reduce((acc, f) => acc + Number(f.porcentaje || 0), 0);
  const sumaOk = Math.abs(suma - 100) < 0.01;

  const setFila = (idx: number, patch: Partial<MarcaPorcentajeInput>) => {
    onChange(valor.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };
  const agregar = () => {
    const usadas = new Set(valor.map((f) => f.marcaId));
    const disponible = catalogo.find((m) => !usadas.has(m.id));
    onChange([
      ...valor,
      { marcaId: disponible?.id ?? catalogo[0]?.id ?? "", porcentaje: 0 },
    ]);
  };
  const quitar = (idx: number) => {
    if (valor.length === 1) return;
    onChange(valor.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div
        className={`text-xs font-medium tabular-nums mb-2 ${
          sumaOk ? "text-emerald-700" : "text-red-600"
        }`}
      >
        Suma: {suma}% {sumaOk ? "✓" : "— debe ser 100%"}
      </div>
      <div className="space-y-2">
        {valor.map((f, idx) => (
          <div key={idx} className="flex items-end gap-2">
            <div className="flex-1">
              <select
                value={f.marcaId}
                onChange={(e) => setFila(idx, { marcaId: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none bg-white"
              >
                {catalogo.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={f.porcentaje}
                onChange={(e) =>
                  setFila(idx, {
                    porcentaje: Number(e.target.value) || 0,
                  })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-black focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => quitar(idx)}
              disabled={valor.length === 1}
              aria-label="Quitar marca"
              className="rounded-md border border-gray-300 bg-white text-gray-600 w-10 h-10 flex items-center justify-center hover:bg-gray-50 disabled:opacity-40"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={agregar}
        disabled={valor.length >= catalogo.length}
        className="mt-3 text-sm text-gray-700 hover:text-black disabled:opacity-40"
      >
        + Agregar marca
      </button>
    </div>
  );
}
