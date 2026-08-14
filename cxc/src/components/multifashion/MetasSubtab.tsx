"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Multifashion › METAS — la pestaña.
//
// Daniel: *"si armalo, en multifashion, y que sea configurable para el futuro
// hacer otras metas grupales y por vendedora (incluyendo a la gerente jennifer
// que comisiona por tienda y ventas personales)"*.
//
// Lo primero que se ve es CÓMO VAN (`MetaAvanceCard`); crear y cambiar quedan
// detrás de un botón, porque una meta se arma una vez y se mira todos los días.
//
// ⚠️ MIENTRAS LA DDL NO CORRA, la pestaña se dibuja igual y dice qué falta —
// no un error rojo, que se leería como que algo se rompió.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Plus, Target } from "lucide-react";
import { fmtMoney } from "@/lib/ventas/format";
import { MetaAvanceCard } from "./MetaAvanceCard";
import { MetaFormModal, type MetaGuardar } from "./MetaFormModal";
import type { VendedoraAgrupada } from "@/lib/multifashion/metas-clave";
import type { MetaConAvance } from "@/lib/multifashion/metas-lectura";

interface Respuesta {
  instalado: boolean;
  hoy?: string;
  puedeEditar?: boolean;
  metas: MetaConAvance[];
  vendedoras: VendedoraAgrupada[];
  aviso?: string;
}

const FMT_CORTA = new Intl.DateTimeFormat("es-PA", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const fechaCorta = (iso: string) => FMT_CORTA.format(new Date(`${iso}T12:00:00Z`));

const fetcher = async (url: string): Promise<Respuesta> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Respuesta;
};

export function MetasSubtab() {
  const { data, error, isLoading, mutate } = useSWR<Respuesta>(
    "multifashion-metas",
    () => fetcher("/api/multifashion/metas"),
    { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true },
  );

  const [abierto, setAbierto] = useState(false);
  const [abiertaHistoria, setAbiertaHistoria] = useState<string | null>(null);
  const [editando, setEditando] = useState<MetaConAvance | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const abrirNueva = () => {
    setEditando(null);
    setAviso(null);
    setAbierto(true);
  };

  const abrirEdicion = (meta: MetaConAvance) => {
    setEditando(meta);
    setAviso(null);
    setAbierto(true);
  };

  const enviar = async (metodo: "POST" | "PUT" | "DELETE", cuerpo: unknown) => {
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/multifashion/metas", {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; aviso?: string };
      if (!res.ok) {
        setAviso(json.error ?? json.aviso ?? "No se pudo guardar. Intenta de nuevo en unos segundos.");
        return;
      }
      setAbierto(false);
      setEditando(null);
      await mutate();
    } catch {
      setAviso("No se pudo guardar. Revisa la conexión e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const guardar = (m: MetaGuardar) => enviar(m.id ? "PUT" : "POST", m);
  const retirar = (id: string) => enviar("DELETE", { id });

  // Vivas = las que todavía corren (o aún no empiezan). Terminadas = las que ya
  // cerraron su período. El estado lo decide el SERVIDOR (`avance.estado`), no
  // la pantalla: si lo recalculara acá con el reloj del navegador, una laptop
  // con la fecha corrida movería una meta de sección.
  const { vivas, terminadas } = useMemo(() => {
    const metas = data?.metas ?? [];
    return {
      vivas: metas.filter((m) => m.avance.estado !== "cerrada"),
      // De la más reciente a la más vieja.
      terminadas: metas
        .filter((m) => m.avance.estado === "cerrada")
        .sort((a, b) => b.hasta.localeCompare(a.hasta)),
    };
  }, [data]);

  if (isLoading && !data) {
    return <div className="h-56 w-full animate-pulse rounded-lg border border-gray-200 bg-gray-50" />;
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm text-gray-700">No se pudieron cargar las metas.</p>
        <p className="mt-1 text-xs text-gray-500">Intenta recargar en unos segundos.</p>
      </div>
    );
  }

  if (!data) return null;

  // La DDL todavía no corrió. Se dice en ámbar (algo pendiente), no en rojo
  // (algo roto), y se nombra el archivo para que Daniel sepa qué correr.
  if (!data.instalado) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-5">
        <p className="text-sm font-medium text-amber-900">Las metas todavía no están instaladas.</p>
        <p className="mt-1 text-sm text-amber-800">
          Falta correr el archivo{" "}
          <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
            20260813170000_multifashion_metas.sql
          </code>{" "}
          en Supabase. Todo lo demás de Multifashion funciona igual.
        </p>
      </div>
    );
  }

  const puedeEditar = data.puedeEditar === true;

  return (
    <div className="w-full">
      {aviso && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {aviso}
        </div>
      )}

      {data.metas.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <Target className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm font-medium text-gray-800">Todavía no hay ninguna meta</p>
          <p className="mt-1 text-xs text-gray-500">
            Una meta es un monto a alcanzar entre dos fechas. Al crearla, acá se ve cuánto
            llevan, cuánto falta y si el ritmo alcanza.
          </p>
          {puedeEditar && (
            <button
              type="button"
              onClick={abrirNueva}
              className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-black px-4 text-sm font-medium text-white transition active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" /> Crear la primera meta
            </button>
          )}
        </div>
      ) : (
        <>
          {puedeEditar && (
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={abrirNueva}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition active:scale-[0.97] hover:border-gray-400"
              >
                <Plus className="h-4 w-4" /> Nueva meta
              </button>
            </div>
          )}
          {/* Las metas VIVAS mandan la pantalla. */}
          <div className="space-y-4">
            {vivas.map((meta) => (
              <MetaAvanceCard
                key={meta.id}
                meta={meta}
                puedeEditar={puedeEditar}
                onEditar={abrirEdicion}
              />
            ))}
            {vivas.length === 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
                <p className="text-sm text-gray-700">No hay ninguna meta andando ahora.</p>
              </div>
            )}
          </div>

          {/* ── Historia ─────────────────────────────────────────────────────
              Daniel: *"pero que esté ordenado y no tenga mucho protagonismo"*.
              Las terminadas se ven y se pueden abrir, pero NO son tarjetas
              grandes: una línea cada una, de la más reciente a la más vieja,
              debajo de todo. La meta viva es la que manda la pantalla. */}
          {terminadas.length > 0 && (
            <section className="mt-8">
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                Metas que ya terminaron
              </h4>
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
                {terminadas.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setAbiertaHistoria(abiertaHistoria === m.id ? null : m.id)}
                      className="flex min-h-[44px] w-full flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-left transition hover:bg-gray-50"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm text-gray-800">{m.nombre}</span>
                        <span className="block text-xs text-gray-500">
                          {fechaCorta(m.desde)} – {fechaCorta(m.hasta)}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-sm tabular-nums text-gray-700">
                        {fmtMoney(m.avance.vendido)}
                        <span
                          className={`ml-2 text-xs font-medium ${
                            m.avance.cumplida ? "text-emerald-700" : "text-gray-500"
                          }`}
                        >
                          {m.avance.cumplida ? "cumplida" : "no se alcanzó"}
                        </span>
                      </span>
                    </button>
                    {abiertaHistoria === m.id && (
                      <div className="border-t border-gray-100 bg-gray-50/70 p-3">
                        <MetaAvanceCard
                          meta={m}
                          puedeEditar={puedeEditar}
                          onEditar={abrirEdicion}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {abierto && (
        <MetaFormModal
          meta={editando}
          vendedoras={data.vendedoras ?? []}
          guardando={guardando}
          onGuardar={guardar}
          onRetirar={retirar}
          onCerrar={() => {
            setAbierto(false);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}
