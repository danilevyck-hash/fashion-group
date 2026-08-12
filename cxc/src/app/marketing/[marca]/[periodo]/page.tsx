"use client";

// ============================================================================
// NIVEL 3 — la página de UN PERÍODO de una marca (12-ago-2026).
//
//   /marketing/calvin-klein/periodo-2026   → el abierto: Cerrar + Bajar ZIP
//   /marketing/calvin-klein/mid-2026       → un cerrado: ZIP + Excel
//   /marketing/calvin-klein/actual         → alias permanente del abierto
//
// El detalle lo dibuja DetallePeriodoView; acá vive el cableado: resolver el
// slug del período, la búsqueda (server-side, como siempre), el overlay del
// proyecto (?proyecto=<id>, con push — Atrás lo cierra) y Registrar gasto.
//
// 🔑 LA VUELTA ATRÁS depende de cuántos períodos tiene la marca: con varios,
// "‹ Calvin Klein" lleva al nivel 2; con UNO solo, el nivel 2 no existe como
// pantalla (redirige acá), así que el enlace dice "‹ Marketing" y va al
// inicio — sin eso, volver rebotaría a esta misma página.
// ============================================================================

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useAuth } from "@/lib/hooks/useAuth";
import { seccionPorSlug } from "@/lib/marketing/lista-por-periodo";
import RegistrarGastoModal from "../../components/RegistrarGastoModal";
import ProyectoOverlay from "../../components/ProyectoOverlay";
import DetallePeriodoView from "../../components/DetallePeriodoView";
import {
  useMarcaPeriodos,
  useMarcasCatalogo,
} from "../../components/useMarcaPeriodos";

export default function PeriodoPageWrapper({
  params,
}: {
  params: { marca: string; periodo: string };
}) {
  return (
    <Suspense>
      <PeriodoPage marcaSlug={params.marca} periodoSlug={params.periodo} />
    </Suspense>
  );
}

function PeriodoPage({
  marcaSlug,
  periodoSlug,
}: {
  marcaSlug: string;
  periodoSlug: string;
}) {
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
  const marcas = useMarcasCatalogo();
  const { datos, loading, error, recargar } = useMarcaPeriodos(
    marcaSlug,
    busquedaDebounced,
    refreshKey,
  );

  const proyectoParam = searchParams.get("proyecto");
  const rutaPeriodo = `/marketing/${marcaSlug}/${periodoSlug}`;

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  if (!authChecked) return null;

  const marca = datos?.marca ?? null;
  const secciones = datos?.secciones ?? null;

  // La marca de ESTA página, resuelta contra el catálogo: "Registrar gasto"
  // la recibe preseleccionada y no la vuelve a preguntar. Los buckets
  // (multifashion / sin-marca) no están en el catálogo → null → el modal
  // pregunta como siempre.
  const marcaInicialModal =
    marcas.find(
      (m) => (m.codigo ?? "").trim().toUpperCase() === (marca?.key ?? ""),
    ) ?? null;
  const seccion = secciones ? seccionPorSlug(secciones, periodoSlug) : null;
  // Con UN solo período el nivel 2 redirige acá: volver tiene que ir al
  // inicio, no rebotar contra el redirect.
  const haySeleccionDePeriodos = (secciones?.length ?? 0) > 1;
  const volverLabel = haySeleccionDePeriodos && marca ? marca.nombre : "Marketing";
  const volverHref = haySeleccionDePeriodos
    ? `/marketing/${marcaSlug}`
    : "/marketing";

  const breadcrumbs =
    marca && seccion
      ? [
          ...(haySeleccionDePeriodos
            ? [
                {
                  label: marca.nombre,
                  onClick: () => router.push(`/marketing/${marcaSlug}`),
                },
              ]
            : [{ label: marca.nombre }]),
          { label: seccion.nombre },
        ]
      : marca
        ? [{ label: marca.nombre }]
        : [];

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
            texto="No se pudo cargar el período. Revisa tu conexión e intenta de nuevo."
            onVolver={() => router.push("/marketing")}
          />
        ) : !marca ? (
          <AvisoVolver
            texto="Esa marca no existe en Marketing."
            onVolver={() => router.push("/marketing")}
          />
        ) : !seccion ? (
          <AvisoVolver
            texto={`${marca.nombre} no tiene un período con ese nombre.`}
            onVolver={() => router.push(volverHref)}
          />
        ) : (
          <>
            <DetallePeriodoView
              marca={marca}
              seccion={seccion}
              esBucket={false}
              bloqueResumen={datos.bloque_resumen}
              proyectos={datos.proyectos}
              loading={loading}
              busqueda={busqueda}
              onBusqueda={setBusqueda}
              buscando={busquedaDebounced.length > 0}
              volverLabel={volverLabel}
              onVolver={() => router.push(volverHref)}
              onAbrirProyecto={(id) =>
                // Drill-down con push: el overlay es "otra página" y Atrás lo
                // cierra (espejo del breadcrumb) — convención del sistema.
                router.push(`${rutaPeriodo}?proyecto=${id}`)
              }
              onRegistrarGasto={() => setRegistrandoGasto(true)}
              recargar={recargar}
            />
            {proyectoParam && (
              <ProyectoOverlay
                proyectoId={proyectoParam}
                onClose={() => router.push(rutaPeriodo)}
                onChange={() => setRefreshKey((k) => k + 1)}
              />
            )}
          </>
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
        Volver
      </button>
    </div>
  );
}
