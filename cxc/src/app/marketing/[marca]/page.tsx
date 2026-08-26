"use client";

// ============================================================================
// NIVEL 2 — la página de UNA marca: SUS PERÍODOS (12-ago-2026).
//
//   /marketing/calvin-klein
//     ABIERTO   Período 2026   $5,840.00   [Bajar ZIP]  ›
//     CERRADO   mid 2026       $46,462.14  [ZIP]        ›
//
// 🔑 Cada fila lleva su descarga AHÍ (pedido explícito de Daniel). El
// [Cerrar] NO está acá: vive en el nivel 3 — una acción seria merece la
// página del período, no un botón al paso.
//
// 🔑 CON UN SOLO PERÍODO SE SALTA DIRECTO AL NIVEL 3 (aprobado por Daniel:
// *"si"*): una lista de un renglón no aporta nada. El salto usa
// router.replace, así el botón Atrás vuelve a /marketing y no rebota.
//
// 🔑 MULTIFASHION Y "SIN MARCA" NO TIENEN PERÍODOS: esta página ES su
// detalle (todo su gasto + su Bajar ZIP), con una sección sintetizada.
//
// El segmento [marca] acepta el slug del nombre (`calvin-klein`) y el código
// (`ck`) — ver lib/marketing/slugs.ts. Un valor desconocido no adivina: dice
// que la marca no existe y ofrece volver.
// ============================================================================

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { formatearMonto } from "@/lib/marketing/normalizar";
import type { SeccionPeriodo } from "@/lib/marketing/lista-por-periodo";
import RegistrarGastoModal from "../components/RegistrarGastoModal";
import ProyectoOverlay from "../components/ProyectoOverlay";
import DetallePeriodoView from "../components/DetallePeriodoView";
import { ChipEstado, FilaNivel, ListaCard } from "../components/FilaNivel";
import { useDescargasPeriodo } from "../components/useDescargasPeriodo";
import {
  useMarcaPeriodos,
  useMarcasCatalogo,
} from "../components/useMarcaPeriodos";

export default function MarcaPageWrapper({
  params,
}: {
  params: { marca: string };
}) {
  return (
    <Suspense>
      <MarcaPage marcaSlug={params.marca} />
    </Suspense>
  );
}

function MarcaPage({ marcaSlug }: { marcaSlug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authChecked } = useAuth({
    moduleKey: "marketing",
    allowedRoles: ["admin", "secretaria"],
  });

  const [busqueda, setBusqueda] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [registrandoGasto, setRegistrandoGasto] = useState(false);
  const { bajando, bajarZipMarca } = useDescargasPeriodo();
  const marcas = useMarcasCatalogo();
  const { datos, loading, error, recargar } = useMarcaPeriodos(
    marcaSlug,
    busquedaDebounced,
    refreshKey,
  );

  // El overlay del proyecto (solo lo usa el modo detalle de los buckets, y
  // los enlaces viejos /marketing?bloque=…&proyecto=… que redirigen acá).
  const proyectoParam = searchParams.get("proyecto");

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  // 🔑 UN SOLO PERÍODO → directo al nivel 3, con replace: Atrás vuelve a
  // /marketing en un paso, sin rebotar por esta lista de un renglón.
  const secciones = datos?.secciones ?? null;
  useEffect(() => {
    if (!secciones || secciones.length !== 1 || !datos?.marca) return;
    const qs = proyectoParam ? `?proyecto=${encodeURIComponent(proyectoParam)}` : "";
    router.replace(`/marketing/${marcaSlug}/${secciones[0].slug}${qs}`);
  }, [secciones, datos?.marca, marcaSlug, proyectoParam, router]);

  if (!authChecked) return null;

  const marca = datos?.marca ?? null;
  const esBucket = !!datos && !datos.particion && !!marca;
  const saltando = !!secciones && secciones.length === 1;

  // La marca de ESTA página, resuelta contra el catálogo, para que "Registrar
  // gasto" no la vuelva a preguntar (renglón fijo con "Cambiar"). `marca.key`
  // es el código (TH, CK…); los buckets (multifashion / sin-marca) no están en
  // el catálogo → null → el modal pregunta como siempre.
  const marcaInicialModal =
    marcas.find(
      (m) => (m.codigo ?? "").trim().toUpperCase() === (marca?.key ?? ""),
    ) ?? null;

  // Sección sintetizada para los buckets sin período (Multifashion / sin
  // marca): SU detalle con su gasto histórico. Los números vienen del
  // agregador (bloque_resumen); acá no se suma nada.
  const seccionBucket: SeccionPeriodo | null =
    esBucket && datos?.bloque_resumen
      ? {
          key: "abierto",
          slug: "actual",
          id: null,
          nombre: marca!.nombre,
          estado: "abierto",
          cerradoEn: null,
          total: datos.bloque_resumen.total,
          docs: {
            facturas: datos.bloque_resumen.facturas.count,
            muebles: datos.bloque_resumen.muebles.count,
          },
          montos: {
            facturas: datos.bloque_resumen.facturas.total,
            muebles: datos.bloque_resumen.muebles.total,
          },
          puedeCerrar: false,
          proyectos: (datos.proyectos ?? []).map((p) => ({
            id: String(p.id),
            monto: p.gasto_real ?? p.por_cobrar_total ?? 0,
            facturas: p.facturas_count,
            entregas: p.entregas_count ?? 0,
          })),
          general: null,
        }
      : null;

  const breadcrumbs = marca ? [{ label: marca.nombre }] : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader module="Marketing" breadcrumbs={breadcrumbs} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {loading && !datos ? (
          <div className="space-y-3">
            <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
            <div className="h-40 rounded-lg bg-gray-100 animate-pulse" />
          </div>
        ) : error || !datos ? (
          <AvisoVolver
            texto="No se pudo cargar la marca. Revisa tu conexión e intenta de nuevo."
            onVolver={() => router.push("/marketing")}
          />
        ) : !marca ? (
          <AvisoVolver
            texto="Esa marca no existe en Marketing."
            onVolver={() => router.push("/marketing")}
          />
        ) : esBucket && seccionBucket ? (
          <>
            <DetallePeriodoView
              marca={marca}
              seccion={seccionBucket}
              esBucket
              bloqueResumen={datos.bloque_resumen}
              proyectos={datos.proyectos}
              loading={loading}
              busqueda={busqueda}
              onBusqueda={setBusqueda}
              buscando={busquedaDebounced.length > 0}
              volverLabel="Marketing"
              onVolver={() => router.push("/marketing")}
              onAbrirProyecto={(id) =>
                router.push(`/marketing/${marcaSlug}?proyecto=${id}`)
              }
              onRegistrarGasto={() => setRegistrandoGasto(true)}
              recargar={recargar}
            />
            {proyectoParam && (
              <ProyectoOverlay
                proyectoId={proyectoParam}
                onClose={() => router.push(`/marketing/${marcaSlug}`)}
                onChange={() => setRefreshKey((k) => k + 1)}
              />
            )}
          </>
        ) : saltando ? (
          // El replace al único período ya está en camino: no dibujar una
          // lista que va a desaparecer en el mismo frame.
          <div className="h-40 rounded-lg bg-gray-100 animate-pulse" />
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => router.push("/marketing")}
              className="text-sm text-gray-600 hover:text-black transition inline-flex items-center gap-1 min-h-[44px] -my-1"
            >
              ‹ Marketing
            </button>
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-xl font-semibold text-gray-900">
                {marca.nombre}
              </h1>
              <button
                type="button"
                onClick={() => setRegistrandoGasto(true)}
                className="rounded-md bg-black text-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition shrink-0"
              >
                + Registrar gasto
              </button>
            </div>

            {/* SUS PERÍODOS: el abierto primero, los cerrados del más nuevo
                al más viejo. Cada fila con su descarga; Cerrar vive adentro. */}
            <ListaCard>
              {(secciones ?? []).map((s) => {
                const hayGasto = s.docs.facturas > 0 || s.docs.muebles > 0;
                const abierto = s.estado === "abierto";
                const etiqueta = `${marca.nombre} · ${s.nombre} · ${formatearMonto(s.total)}`;
                const zipClave = `${marca.key}:${abierto || !s.id ? "abierto" : s.id}`;
                const conZip = hayGasto && (abierto || !!s.id);
                return (
                  <FilaNivel
                    key={s.key}
                    chip={<ChipEstado estado={s.estado} />}
                    titulo={s.nombre}
                    monto={
                      hayGasto ? (
                        formatearMonto(s.total)
                      ) : (
                        <span className="text-gray-300 text-sm">—</span>
                      )
                    }
                    acciones={
                      conZip && (
                        <button
                          type="button"
                          onClick={() =>
                            bajarZipMarca(
                              marca.key,
                              etiqueta,
                              abierto ? undefined : s.id,
                            )
                          }
                          disabled={bajando === zipClave}
                          title={`Bajar el ZIP de ${etiqueta}`}
                          className="rounded-md border border-gray-200 bg-white px-2.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-xs text-gray-600 hover:text-gray-900 hover:border-gray-400 active:scale-[0.97] transition disabled:opacity-40"
                        >
                          {bajando === zipClave ? "Armando…" : "ZIP"}
                        </button>
                      )
                    }
                    onClick={() =>
                      router.push(`/marketing/${marcaSlug}/${s.slug}`)
                    }
                    ariaLabel={`Abrir ${s.nombre}`}
                  />
                );
              })}
            </ListaCard>
          </div>
        )}
      </main>

      {registrandoGasto && (
        <RegistrarGastoModal
          marcas={marcas}
          marcaInicial={marcaInicialModal}
          onClose={() => setRegistrandoGasto(false)}
          onSaved={() => {
            setRegistrandoGasto(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function AvisoVolver({
  texto,
  onVolver,
}: {
  texto: string;
  onVolver: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
      <p className="text-sm text-gray-600">{texto}</p>
      <button
        type="button"
        onClick={onVolver}
        className="mt-3 rounded-md border border-gray-300 bg-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm hover:border-gray-500 active:scale-[0.97] transition"
      >
        Volver a Marketing
      </button>
    </div>
  );
}
