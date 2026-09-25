"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { FotoUploader } from "@/components/marketing";
import type { MkAdjunto } from "@/lib/marketing/types";
import type { UploadResult } from "@/components/marketing";
import { FotoLightbox } from "@/components/ui";
import UndoToast from "@/components/UndoToast";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import { MARKETING_CELULAR } from "@/lib/marketing/celular";
import {
  MARKETING_FOTOS_CON_PERIODO,
  PREGUNTA_DE_LA_MARCA,
  avisoSinFotosDelPeriodo,
  fotosDelPeriodo,
  necesitaElegirMarca,
  type MarcaAbiertaDeLaTienda,
} from "@/lib/marketing/fotos-periodo";
import { PERIODO_ABIERTO, PERIODO_TODOS, ROTULO_ABIERTO } from "@/lib/marketing/periodo-manda";
import { subirAdjunto } from "./uploadHelpers";
import { Ayuda } from "@/components/shared/Ayuda";

// ============================================================================
// 🔴 LAS FOTOS CUELGAN DE LA TIENDA (22-sep-2026), no del proyecto.
//
// Daniel: las fotos se pegan a la TIENDA. La columna es
// `mk_adjuntos.tienda_codigo`, y la migración `20261216120000` la copió del
// proyecto (medido: 60 de 60 fotos quedaron con su tienda).
//
// Esta sección sirve a las DOS puertas mientras dure la transición:
//   · con `tiendaCodigo` → lee `/api/marketing/tienda/<código>/fotos`;
//   · con `proyectoId`   → lo de siempre, sin un solo cambio.
// Sin la columna, la ruta de la tienda contesta lista vacía: falla ABIERTA.
//
// 🔴 Y SIGUEN AL PERÍODO (24-sep-2026). Daniel: *«cuando me meto al período
// abierto, veo las fotos del período viejo»*. La cuadrícula filtra con el
// MISMO chip que la lista de gastos (`periodo`, de `periodo-manda.ts`): la
// foto trae su período del servidor y acá solo se parte (`fotos-periodo.ts`,
// puro). Sin `periodo` —la puerta del proyecto, o el interruptor apagado— se
// ven todas, como hoy.
//
// 🔴 Y LA MARCA SE ELIGE CON UN TOQUE CUANDO HAY MÁS DE UNA (24-sep-2026).
// Daniel: *«las fotos deben ir a la tienda del período abierto; un período
// cerrado, nada debe entrar ni salir»*. Los períodos son POR MARCA y una
// tienda puede tener DOS abiertos a la vez (medido: Outlet Duty Free N3 tiene
// Calvin y Tommy). Con UNA sola no se pregunta nada; con dos o más salen los
// nombres —botones de 44 px en el celular, un desplegable en la computadora—
// y 🔴 NINGUNO viene puesto: hasta que se toque uno, el selector de archivo no
// se abre. El SERVIDOR lo vuelve a validar, así que esto es comodidad, no la
// regla.
// ============================================================================

interface FotosSectionProps {
  /** La puerta vieja: las fotos de un proyecto. */
  proyectoId?: string;
  /** La puerta nueva: las fotos de una TIENDA, por su código (D-25). */
  tiendaCodigo?: string;
  /** El chip de arriba: `abierto`, el id de un cierre, o `todos`. */
  periodo?: string;
  readonly?: boolean;
}

export default function FotosSection({
  proyectoId,
  tiendaCodigo,
  periodo,
  readonly = false,
}: FotosSectionProps) {
  const { toast } = useToast();
  const [todasLasFotos, setFotos] = useState<MkAdjunto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [fotosConError, setFotosConError] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);
  // 🔴 13b — LA × SOLO AL TOCAR «EDITAR» (24-sep-2026). Daniel eligió la
  // opción b: la cuadrícula queda limpia y la × de borrar aparece al tocar
  // «Editar» arriba, como en Fotos del iPhone. 🩸 Hoy la × mide 44×44 encima
  // de una miniatura de 112×112 —el 15 % del área— y con el dedo la diferencia
  // entre abrir la foto y pedir borrarla son milímetros.
  // ⚠️ Solo en el celular: en la computadora hay hover y la × sigue igual.
  const [editandoFotos, setEditandoFotos] = useState(false);
  // Las marcas con período ABIERTO de esta tienda, y la que se eligió. Nada
  // viene puesto: elegir es un acto, nunca un default.
  const [marcas, setMarcas] = useState<MarcaAbiertaDeLaTienda[]>([]);
  const [marcaElegida, setMarcaElegida] = useState<string>("");
  // Borrar foto usa el patrón universal de "deshacer 5s": se quita de la UI al
  // instante y el DELETE real (foto + Storage) corre tras la ventana de undo.
  const { pendingUndo, scheduleAction, undoAction } = useUndoAction();
  // Token monotónico para descartar respuestas obsoletas de cargar().
  const reqIdRef = useRef(0);

  const cargar = useCallback(async () => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);
    setErrorCarga(null);
    try {
      const res = await fetch(
        tiendaCodigo
          ? `/api/marketing/tienda/${encodeURIComponent(tiendaCodigo)}/fotos`
          : `/api/marketing/proyectos/${proyectoId}/fotos`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `HTTP ${res.status}: ${body.slice(0, 120)}`,
        );
      }
      const raw = (await res.json()) as unknown;
      if (!Array.isArray(raw)) {
        throw new Error("Respuesta inesperada del servidor");
      }
      // Subidas múltiples en paralelo disparan varios cargar() a la vez. Solo
      // el más reciente debe aplicar su resultado: si esta respuesta ya no es
      // la última, descartarla para que ninguna foto recién subida quede
      // pisada por una respuesta vieja que llegó tarde.
      if (myReqId !== reqIdRef.current) return;
      setFotos(raw as MkAdjunto[]);
    } catch (err) {
      if (myReqId !== reqIdRef.current) return;
      const msg =
        err instanceof Error ? err.message : "Error al cargar fotos";
      setErrorCarga(msg);
      toast(`No se pudieron cargar las fotos: ${msg}`, "error");
    } finally {
      if (myReqId === reqIdRef.current) setLoading(false);
    }
  }, [proyectoId, tiendaCodigo, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // 🔴 Falla ABIERTA: si esto no contesta, la lista queda vacía, no se pregunta
  // nada y el servidor sella con lo que corresponda (o con nada).
  useEffect(() => {
    if (!MARKETING_FOTOS_CON_PERIODO || !tiendaCodigo || readonly) return;
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/marketing/tienda/${encodeURIComponent(tiendaCodigo)}/fotos/marcas`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const body = (await res.json()) as { marcas?: MarcaAbiertaDeLaTienda[] };
        if (!vivo || !Array.isArray(body?.marcas)) return;
        setMarcas(body.marcas);
      } catch {
        // Silencio a propósito: sin marcas no se pregunta y todo sigue igual.
      }
    })();
    return () => {
      vivo = false;
    };
  }, [tiendaCodigo, readonly]);

  // 🔴 Lo que se VE es lo del chip. El período solo manda en la puerta de la
  // tienda: la del proyecto no tiene chips y sigue mostrando todo.
  const clavePeriodo = tiendaCodigo && periodo ? periodo : PERIODO_TODOS;
  const fotos = useMemo(
    () => fotosDelPeriodo(todasLasFotos as Array<MkAdjunto & { periodo?: null }>, clavePeriodo),
    [todasLasFotos, clavePeriodo],
  );
  // Subir estando parado en un cierre: la foto nace en «Abierto» y no se vería.
  const enUnCierre =
    MARKETING_FOTOS_CON_PERIODO &&
    !!tiendaCodigo &&
    clavePeriodo !== PERIODO_TODOS &&
    clavePeriodo !== PERIODO_ABIERTO;

  const hayQueElegirMarca = necesitaElegirMarca(marcas);
  const marcaDelToque = marcas.find((m) => m.periodoId === marcaElegida) ?? null;

  const handleUpload = async (file: File): Promise<UploadResult> => {
    const adj = await subirAdjunto({
      file,
      proyectoId,
      tiendaCodigo,
      periodoId: hayQueElegirMarca ? marcaElegida : undefined,
      tipo: "foto_proyecto",
    });
    // Re-fetch del servidor en lugar de optimistic state update.
    // La signed URL recién firmada puede no estar propagada en CDN — al
    // recargar lista, el endpoint vuelve a firmar con archivo ya disponible.
    await cargar();
    const aDonde = marcaDelToque
      ? `Foto subida · va a ${marcaDelToque.nombre}`
      : enUnCierre
        ? `Foto subida · está en «${ROTULO_ABIERTO}»`
        : "Foto subida";
    toast(aDonde, "success");
    return {
      url: adj.url,
      nombreOriginal: adj.nombre_original ?? file.name,
      sizeBytes: adj.size_bytes ?? file.size,
    };
  };

  const solicitarEliminar = (foto: MkAdjunto) => {
    // Snapshot para revertir si el usuario deshace o el DELETE falla.
    const snapshot = todasLasFotos;
    scheduleAction({
      id: foto.id,
      message: "Foto eliminada",
      onOptimistic: () => setFotos((prev) => prev.filter((f) => f.id !== foto.id)),
      onRevert: () => setFotos(snapshot),
      execute: async () => {
        try {
          const res = await fetch(`/api/marketing/adjuntos/${foto.id}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(err?.error ?? "No se pudo eliminar la foto");
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Error al eliminar";
          toast(msg, "error");
          throw err; // el hook revierte la UI al fallar execute
        }
      },
    });
  };

  const hayFotos = fotos.length > 0;
  // 🔴 Con dos o más marcas abiertas, primero se elige y después se abre el
  // selector de archivo. Ninguna viene puesta.
  const faltaElegirLaMarca = hayQueElegirMarca && !marcaDelToque;
  const preguntaDeLaMarca = hayQueElegirMarca ? (
    <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
      <p className="text-sm font-medium text-gray-900">{PREGUNTA_DE_LA_MARCA}</p>
      {/* Celular: botones de 44 px, uno por marca. */}
      <div className="flex flex-wrap gap-2 sm:hidden">
        {marcas.map((m) => (
          <button
            key={m.periodoId}
            type="button"
            onClick={() => setMarcaElegida(m.periodoId)}
            aria-pressed={marcaElegida === m.periodoId}
            className={`min-h-[44px] rounded-md border px-3 text-sm active:scale-[0.97] ${
              marcaElegida === m.periodoId
                ? "border-black bg-black text-white"
                : "border-gray-300 bg-white text-gray-800"
            }`}
          >
            {m.nombre}
          </button>
        ))}
      </div>
      {/* Computadora: un desplegable, sin nada preseleccionado. */}
      <select
        value={marcaElegida}
        onChange={(e) => setMarcaElegida(e.target.value)}
        aria-label={PREGUNTA_DE_LA_MARCA}
        className="hidden sm:block w-full max-w-xs rounded-md border border-gray-300 px-2 py-2 text-sm"
      >
        <option value="">Elige la marca…</option>
        {marcas.map((m) => (
          <option key={m.periodoId} value={m.periodoId}>
            {m.nombre}
          </option>
        ))}
      </select>
      {faltaElegirLaMarca && (
        <p className="text-xs text-gray-500">
          Elige la marca y aparece el botón para subir la foto.
        </p>
      )}
    </div>
  ) : null;

  // Navegación del lightbox con flechas ‹ › y teclas ← → (igual que la galería
  // pública). Solo se navega entre fotos visualizables (no HEIC ni con error).
  const esHeic = (f: MkAdjunto): boolean => {
    const urlLower = (f.url ?? "").toLowerCase();
    const nombreLower = (f.nombre_original ?? "").toLowerCase();
    return (
      nombreLower.endsWith(".heic") ||
      urlLower.includes(".heic") ||
      urlLower.startsWith("data:image/heic")
    );
  };
  const urlsNavegables = fotos
    .filter((f) => !esHeic(f) && !fotosConError.has(f.id))
    .map((f) => f.url);
  const idxLightbox = lightbox ? urlsNavegables.indexOf(lightbox) : -1;
  const irAFoto = (delta: number) => {
    if (idxLightbox < 0 || urlsNavegables.length === 0) return;
    const n =
      (idxLightbox + delta + urlsNavegables.length) % urlsNavegables.length;
    setLightbox(urlsNavegables[n]);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1">
        <h2 className="text-base font-semibold text-gray-900">
          {tiendaCodigo ? "Fotos de la tienda" : "Fotos del proyecto"}
        </h2>
        {/* Para qué sirven las fotos: se aprende una vez → ⓘ. */}
        <Ayuda titulo="Para qué sirven" className="-my-2">
          <p>Respaldo visual que se adjunta a la cobranza a la marca.</p>
        </Ayuda>
        {MARKETING_CELULAR && !readonly && fotos.length > 0 && (
          <button
            type="button"
            onClick={() => setEditandoFotos((v) => !v)}
            className="sm:hidden ml-auto min-h-[44px] px-2 text-[17px] text-blue-600 active:opacity-60"
          >
            {editandoFotos ? "Listo" : "Editar"}
          </button>
        )}
      </div>

      {errorCarga && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {errorCarga}
        </div>
      )}
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="aspect-square rounded-md bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      ) : hayFotos ? (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {fotos.map((f) => {
              const conError = fotosConError.has(f.id);
              const esHeicFoto = esHeic(f);
              // Fotos legacy pueden venir como data URL (data:image/...).
              // El <img> las renderiza nativamente; solo cae al fallback si
              // el onError se dispara (data corrupta).
              return (
              <div
                key={f.id}
                className="relative aspect-square rounded-md border border-gray-200 overflow-hidden bg-gray-50 group"
              >
                {conError || esHeicFoto ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-full flex flex-col items-center justify-center text-center p-2 text-xs text-gray-500 hover:bg-gray-100"
                    title={f.nombre_original ?? ""}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span className="mt-1 truncate max-w-full">
                      {esHeicFoto ? "HEIC" : "Ver"}
                    </span>
                    <span className="truncate max-w-full text-gray-400">
                      {(f.nombre_original ?? "").slice(0, 18)}
                    </span>
                  </a>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={f.url}
                    alt={f.nombre_original ?? (tiendaCodigo ? "Foto de la tienda" : "Foto del proyecto")}
                    className="w-full h-full object-cover cursor-zoom-in"
                    loading="lazy"
                    onClick={() => setLightbox(f.url)}
                    onError={() => {
                      setFotosConError((prev) => {
                        const next = new Set(prev);
                        next.add(f.id);
                        return next;
                      });
                    }}
                  />
                )}
                {!readonly && (
                  <button
                    type="button"
                    onClick={() => solicitarEliminar(f)}
                    aria-label="Eliminar foto"
                    /* En pantalla táctil no existe el hover: con `opacity-0` la
                       X era INVISIBLE en el iPhone y el primer toque abría la
                       foto grande — no había forma de borrar una foto subida
                       por error desde el celular. Se muestra siempre en móvil y
                       se conserva el revelado por hover en escritorio, igual
                       que Editar/Anular/Eliminar en FacturasSection. */
                    className={`absolute top-1 right-1 bg-white/90 rounded-full w-11 h-11 flex items-center justify-center text-red-600 shadow-sm transition sm:opacity-0 sm:pointer-events-auto sm:group-hover:opacity-100 sm:focus-within:opacity-100 focus-visible:opacity-100 ${
                      MARKETING_CELULAR && !editandoFotos
                        ? "opacity-0 pointer-events-none"
                        : "opacity-100"
                    }`}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
              );
            })}
          </div>
          {!readonly && preguntaDeLaMarca}
          {!readonly && !faltaElegirLaMarca && (
            <FotoUploader
              onUpload={handleUpload}
              accept="image/*"
              maxSizeMb={10}
              multiple
              compact
            />
          )}
        </>
      ) : readonly ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          {avisoSinFotosDelPeriodo(clavePeriodo, !!tiendaCodigo)}
        </div>
      ) : (
        <>
          {preguntaDeLaMarca}
          {!faltaElegirLaMarca && (
            <FotoUploader
              onUpload={handleUpload}
              label={tiendaCodigo ? "Sube fotos de la tienda" : "Sube fotos del proyecto"}
              accept="image/*"
              maxSizeMb={10}
              multiple
            />
          )}
        </>
      )}

      {pendingUndo && (
        <UndoToast
          message={pendingUndo.message}
          startedAt={pendingUndo.startedAt}
          onUndo={undoAction}
        />
      )}

      <FotoLightbox
        src={lightbox}
        onClose={() => setLightbox(null)}
        onPrev={urlsNavegables.length > 1 ? () => irAFoto(-1) : undefined}
        onNext={urlsNavegables.length > 1 ? () => irAFoto(1) : undefined}
      />
    </section>
  );
}
