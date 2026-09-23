"use client";

// ============================================================================
// LA VISTA DE UNA TIENDA (22-sep-2026).
//
// Daniel: *«debería estar organizado: ver por cliente, busco el cliente o
// proyecto y ver adentro la info (por marca etc.)»*.
//
//   AHORA:    Marca → Período → Proyecto → el gasto (tres saltos).
//   DESPUÉS:  se busca la tienda en ⌘K y adentro está TODO lo suyo, por marca.
//
// 🔴 EL TOTAL ES SOLO DE LO REPORTADO. Lo apagado se ve en gris, con su
// rótulo «No se reporta», y no suma. La regla vive en `periodo-estado.ts`.
// 🔴 La tienda se resuelve por CÓDIGO; el nombre solo se dibuja.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { ScrollableTable } from "@/components/ui";
import { useAuth } from "@/lib/hooks/useAuth";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import { TIENDA_GENERAL } from "@/lib/marketing/gasto";
import {
  esCodigoGeneral,
  rotuloDeFila,
  rotuloDelPeriodo,
  type GrupoPorMarca,
} from "@/lib/marketing/vista-tienda";
import type { TotalesDelPeriodo } from "@/lib/marketing/periodo-estado";
import RegistrarGastoModal from "../../components/RegistrarGastoModal";
import FotosSection from "../../components/FotosSection";
import { useMarcasCatalogo } from "../../components/useMarcaPeriodos";

interface Datos {
  codigo: string | null;
  nombre: string;
  enElDirectorio: boolean | null;
  grupos: GrupoPorMarca[];
  totales: TotalesDelPeriodo;
  fotos: number;
  sinMigracion: boolean;
}

export default function VistaTienda({ codigo }: { codigo: string }) {
  const router = useRouter();
  const { authChecked } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria"],
  });
  const marcas = useMarcasCatalogo();

  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/marketing/tienda/${encodeURIComponent(codigo)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("No se pudo cargar la tienda.");
      setDatos((await res.json()) as Datos);
    } catch (err) {
      setDatos(null);
      setError(err instanceof Error ? err.message : "No se pudo cargar la tienda.");
    } finally {
      setCargando(false);
    }
  }, [codigo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!authChecked) return null;

  const esGeneral = esCodigoGeneral(codigo);
  const titulo = datos?.nombre ?? (esGeneral ? TIENDA_GENERAL : codigo.toUpperCase());

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Marketing" breadcrumbs={[{ label: titulo }]} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <button
          type="button"
          onClick={() => router.push("/marketing")}
          className="text-sm text-gray-600 hover:text-black transition inline-flex items-center gap-1 min-h-[44px] -my-1"
        >
          ‹ Marketing
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-gray-900 break-words">{titulo}</h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {esGeneral
                ? "Los gastos que no son de ninguna tienda."
                : datos?.enElDirectorio === false
                  ? `${codigo.toUpperCase()} — este código ya no está en el directorio`
                  : codigo.toUpperCase()}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRegistrando(true)}
            className="rounded-md bg-black text-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition shrink-0"
          >
            ＋ Gasto
          </button>
        </div>

        {cargando && !datos ? (
          <div className="space-y-3">
            <div className="h-20 rounded-lg bg-gray-100 animate-pulse" />
            <div className="h-40 rounded-lg bg-gray-100 animate-pulse" />
          </div>
        ) : error ? (
          <Aviso texto={error} />
        ) : !datos ? null : datos.sinMigracion ? (
          <Aviso texto="Esta pantalla necesita las columnas nuevas de Marketing. Mientras tanto, los gastos se ven como siempre desde cada marca." />
        ) : (
          <>
            <ResumenDeLaTienda totales={datos.totales} marcas={datos.grupos.length} />

            {datos.grupos.length === 0 ? (
              <Aviso texto="Todavía no hay gastos cargados a esta tienda." />
            ) : (
              datos.grupos.map((g) => <TablaDeMarca key={g.marcaCodigo} grupo={g} />)
            )}

            {!esGeneral && datos.codigo && (
              <FotosSection tiendaCodigo={datos.codigo} />
            )}
          </>
        )}

        {registrando && (
          /* 🔗 La puerta «＋ Gasto» es la de la pieza (A). Cuando acepte
             `tiendaCodigo`, se le pasa `datos.codigo` y el formulario abre
             con ESTA tienda puesta; hoy abre preguntando como siempre. */
          <RegistrarGastoModal
            marcas={marcas}
            onClose={() => setRegistrando(false)}
            onSaved={() => {
              setRegistrando(false);
              cargar();
            }}
          />
        )}
      </main>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
      {texto}
    </div>
  );
}

/** Lo de arriba: el total que se le reporta a las marcas, y lo que no suma. */
function ResumenDeLaTienda({
  totales,
  marcas,
}: {
  totales: TotalesDelPeriodo;
  marcas: number;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Gasto que se reporta
          </div>
          <div className="text-2xl font-semibold text-gray-900 tabular-nums mt-1">
            {formatearMonto(totales.reportado)}
          </div>
          <div className="text-[12px] text-gray-500 mt-0.5">
            {totales.cantidadReportada}{" "}
            {totales.cantidadReportada === 1 ? "gasto" : "gastos"} en {marcas}{" "}
            {marcas === 1 ? "marca" : "marcas"}
          </div>
        </div>
        {totales.cantidadNoReportada > 0 && (
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              No se reporta
            </div>
            <div className="text-lg font-semibold text-gray-400 tabular-nums mt-1">
              {formatearMonto(totales.noReportado)}
            </div>
            <div className="text-[12px] text-gray-400 mt-0.5">
              {totales.cantidadNoReportada}{" "}
              {totales.cantidadNoReportada === 1 ? "gasto" : "gastos"} — no suma arriba
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function TablaDeMarca({ grupo }: { grupo: GrupoPorMarca }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="text-base font-semibold text-gray-900">{grupo.marcaNombre}</h2>
        <div className="text-sm font-semibold text-gray-900 tabular-nums">
          {formatearMonto(grupo.totales.reportado)}
          {grupo.totales.cantidadNoReportada > 0 && (
            <span className="text-gray-400 font-normal">
              {" "}
              · {formatearMonto(grupo.totales.noReportado)} sin reportar
            </span>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <ScrollableTable minWidth={720}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[12px] uppercase tracking-wider text-gray-500">
                <th className="px-3 py-2 font-semibold">Tipo</th>
                <th className="px-3 py-2 font-semibold">Proveedor</th>
                <th className="px-3 py-2 font-semibold">Detalle</th>
                <th className="px-3 py-2 font-semibold">Fecha</th>
                <th className="px-3 py-2 font-semibold">Período</th>
                <th className="px-3 py-2 font-semibold text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {grupo.filas.map((f) => (
                <tr key={f.id} className={f.seReporta ? "" : "text-gray-400"}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {rotuloDeFila(f)}
                    {!f.seReporta && (
                      <span className="ml-2 rounded-md bg-gray-100 text-gray-500 text-[12px] px-1.5 py-0.5">
                        No se reporta
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{f.proveedor || "—"}</td>
                  <td className="px-3 py-2">{f.detalle || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {f.fecha ? formatearFecha(f.fecha) : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{rotuloDelPeriodo(f)}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {formatearMonto(f.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      </div>
    </section>
  );
}
