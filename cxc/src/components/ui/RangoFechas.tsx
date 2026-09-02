"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL ÚNICO SELECTOR DE RANGO DE FECHAS DE ASISTENCIA Y BOSTON.
//
// Cerrado dice el rango REAL y cuántos días son:
//     📅  28 oct – 10 nov 2026 · 14 días
//
// ⚠️ TEXTOS EN ESPAÑOL LATINOAMERICANO NEUTRO, tuteo: «elige», «toca»,
// «escribe» — nunca las formas rioplatenses. Daniel, textual: *«no soy
// argentino, ni a mi ni en el sistema pongas palabras argentinos, somos
// latinoamericanos normal»*. Hay barrido estático que lo sostiene.
//
// 🔴 SIN PRESETS, Y ES UNA DECISIÓN, NO UN RECORTE. Tenía cuatro atajos
// —«Quincena en curso», «Quincena anterior», «Últimos 15 días», «Este mes»—
// calculados como del 1 al 15 y del 16 a fin de mes. Daniel: su corte de
// quincena es VARIABLE (a veces del 28 al 10). O sea que el atajo más usado
// daba el período equivocado casi siempre, y con la confianza de un botón que
// dice «Quincena en curso». **Un preset que miente es peor que no tenerlo.**
// Lo que queda es el calendario, que no puede mentir: dice los días que dice.
//
// 🔑 Y RECUERDA EL ÚLTIMO RANGO (`useLastUsed`, por dispositivo). Es lo que
// reemplaza al atajo: el segundo día ya abre donde lo dejaste.
//
// 🩸 EL CALENDARIO SE BAJA AL ABRIRLO, no al pintar la pantalla. `dynamic()`
// con `ssr:false` sobre `CalendarioRango`, que es quien importa
// `react-day-picker` y `date-fns`. Mismo criterio que el Excel del Reporte.
//
// ── 🔴 DOS MODOS, Y EL DESPLEGABLE SIGUE SIENDO EL DE SIEMPRE ────────────────
//
// `inline` (4-sep-2026) pone el calendario A LA VISTA, sin nada que abrir: un
// mes —el mismo en teléfono y en escritorio— y abajo el resumen del rango con
// el botón que sigue. Lo pide la Planilla, donde elegir el
// período **es** el primer paso — Daniel, textual: *«que sea user friendly como
// el de copa airlines… su fecha de salida sería la fecha que termina la
// quincena»*, y sobre el desplegable: *«no veo lo de poner las fechas, sigue
// igual pero no cortado»*. Ensanchar el panel no alcanzaba: seguía siendo un
// menucito que hay que descubrir.
//
// 🔴 ES UNA PROP NUEVA, NO UN CAMBIO DE DEFAULT. El modo desplegable lo usan
// Reporte, Aprobaciones, Justificaciones, Vacaciones y la planilla de Boston:
// cambiarles la forma por debajo habría sido un rediseño de cinco pantallas que
// nadie pidió.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
// 🔴 EL DESPLEGABLE DE LA CASA, no Radix Popover.
//
// 🩸 MEDIDO: con `@radix-ui/react-popover` importado estáticamente, /asistencia
// pasaba de 210 a 244 kB de First Load y /boston de 191 a 226 — +34 kB para
// todo el que abre la pantalla, abra o no el calendario. Y el repo YA tiene
// resuelto flotar un panel anclado a un control: `DesplegableFlotante`, que
// usan otros seis. Meter una segunda forma habría costado peso y una
// inconsistencia a la vez.
import DesplegableFlotante from "./DesplegableFlotante";
// 🔴 DEL MÓDULO PURO, NUNCA de `./CalendarioRango`: un import estático a ese
// archivo trae `react-day-picker` al bundle inicial y anula el `dynamic()`.
import { aIso, deIso } from "./rango-fechas-iso";

const CalendarioRango = dynamic(() => import("./CalendarioRango"), {
  ssr: false,
  loading: () => <div className="h-[320px] w-[300px] animate-pulse rounded-lg bg-gray-50" />,
});

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * 7 columnas × 44 px = 308, más el padding del panel.
 *
 * 🔴 UN SOLO MES (4-sep-2026). Eran dos, y el panel medía 660: pedido de
 * Daniel. Con uno entra en cualquier pantalla y no hay que decidir en cuál de
 * los dos meses tocar.
 */
const ANCHO_CALENDARIO = 308 + 24;
/** 6 semanas + encabezado + el título: alcanza sin scroll para cualquier mes. */
const ALTO_CALENDARIO = 420;

/** «28 oct – 10 nov 2026 · 14 días». El año se dice UNA vez si es el mismo. */
export function etiquetaRango(desde: string, hasta: string): string {
  if (!desde || !hasta) return "Elige el período";
  const [a1, m1, d1] = desde.split("-").map(Number);
  const [a2, m2, d2] = hasta.split("-").map(Number);
  const dias = Math.round((deIso(hasta).getTime() - deIso(desde).getTime()) / 86_400_000) + 1;
  const cuenta = `${dias} ${dias === 1 ? "día" : "días"}`;
  if (desde === hasta) return `${d1} ${MESES[m1 - 1]} ${a1} · ${cuenta}`;
  const izq = a1 === a2 ? `${d1} ${MESES[m1 - 1]}` : `${d1} ${MESES[m1 - 1]} ${a1}`;
  return `${izq} – ${d2} ${MESES[m2 - 1]} ${a2} · ${cuenta}`;
}

interface Props {
  desde: string;
  hasta: string;
  onChange: (desde: string, hasta: string) => void;
  /** Se guarda el último rango bajo esta llave (`fg_last_<key>`). */
  recordarComo?: string;
  label?: string | null;
  /**
   * 🔴 `true` = todavía NADIE eligió, así que el botón NO muestra un rango.
   *
   * Lo usan las dos planillas. Daniel: *«la quincena se paga según el rango de
   * fecha seleccionado»* — mostrar «1 sep – 15 sep» sin que nadie lo haya
   * pedido es afirmar un período de pago. El calendario igual ABRE en ese mes,
   * que es una ayuda; lo que no hace es decir que ya está elegido.
   */
  vacio?: boolean;
  /**
   * 🔴 El calendario ABIERTO EN LÍNEA, sin botón que tocar. Ver la nota de
   * arriba: `false` deja el desplegable de siempre, que es lo que usan las
   * otras cinco pantallas.
   */
  inline?: boolean;
  /**
   * Lo que va al lado del resumen, en el pie del calendario inline — el
   * «Generar» de la Planilla. Vive AFUERA porque la acción no es del control:
   * el control elige fechas, no genera planillas.
   */
  accion?: ReactNode;
  /**
   * El día que la pantalla RECOMIENDA como inicio. Se marca con un aro y nada
   * más: es una sugerencia, y quien paga decide.
   */
  sugerido?: string | null;
}

export default function RangoFechas({
  desde, hasta, onChange, recordarComo, label = "Período", vacio = false,
  inline = false, accion, sugerido = null,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [ancla, setAncla] = useState<string | null>(null);
  const [datos, setDatos] = useState<Set<string> | null>(null);
  const anclaRef = useRef<HTMLDivElement>(null);

  // 🔴 El candado del scroll es del MODAL. En línea no hay modal: trabar el
  // cuerpo de la página mientras el calendario está a la vista dejaría la
  // pantalla sin poder bajar hasta la tabla.
  useBodyScrollLock(abierto && !inline);

  // Escape cierra, como el resto de los modales de la casa.
  useEffect(() => {
    if (!abierto) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { setAbierto(false); setAncla(null); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [abierto]);

  /** Qué días tienen marcaciones en la ventana visible. Falla en silencio: sin
   *  esto el calendario funciona igual, solo que sin el gris. */
  const pedirDatos = useCallback(async (ini: string, fin: string) => {
    try {
      const r = await fetch(`/api/asistencia/dias-con-datos?desde=${ini}&hasta=${fin}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { dias?: string[] };
      setDatos(new Set(j.dias ?? []));
    } catch { /* el gris es una ayuda, no un requisito */ }
  }, []);

  useEffect(() => {
    // En línea el calendario ya está a la vista: sus días se piden al pintar.
    if (!abierto && !inline) return;
    const base = deIso(desde || aIso(new Date()));
    const ini = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    const fin = new Date(base.getFullYear(), base.getMonth() + 2, 0);
    void pedirDatos(aIso(ini), aIso(fin));
  }, [abierto, inline, desde, pedirDatos]);

  const aplicar = useCallback((d: string, h: string) => {
    onChange(d, h);
    if (recordarComo) {
      try { localStorage.setItem(`fg_last_${recordarComo}`, `${d}|${h}`); } catch { /* modo privado */ }
    }
    setAbierto(false);
  }, [onChange, recordarComo]);


  // 🔴 DICE CUÁL DE LAS DOS FECHAS SE ESTÁ ELIGIENDO. Con el rango a medias, el
  // encabezado es lo único que distingue «ya se eligió el inicio» de «no pasó
  // nada».
  const titulo = ancla
    ? `${etiquetaRango(ancla, ancla).split(" · ")[0]} — ahora elige el último día`
    : vacio
      ? "Elige el primer día"
      : etiquetaRango(desde, hasta);

  const cuerpo = () => (
    <CalendarioRango
      desde={desde} hasta={hasta} diasConDatos={datos} vacio={vacio} sugerido={sugerido}
      onRango={aplicar} onAncla={setAncla}
      onMesVisible={(i, f) => void pedirDatos(i, f)}
    />
  );

  const boton = (
    <button
      type="button"
      onClick={() => setAbierto((v) => !v)}
      className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-gray-200 px-3 text-left text-sm transition hover:border-gray-400"
    >
      <span aria-hidden className="text-base leading-none">📅</span>
      <span className={vacio ? "text-gray-500" : "text-gray-900"}>
        {vacio ? "Elige el período" : etiquetaRango(desde, hasta)}
      </span>
    </button>
  );

  // ── 🔴 MODO EN LÍNEA: el calendario A LA VISTA ─────────────────────────────
  //
  // Un mes y abajo UNA línea: el rango que se está por pedir y el botón que
  // sigue.
  //
  //     28 oct – 10 nov 2026 · 14 días                        [ Generar ]
  //
  // 🔴 UNA SOLA instancia y UN SOLO mes, en teléfono y en escritorio. Antes
  // eran dos vistas (`hidden lg:flex` + `lg:hidden`) con dos calendarios
  // montados a la vez: además de pesar el doble, dejaba dos máquinas de toques
  // vivas para la misma elección.
  if (inline) {
    return (
      <div>
        {label && (
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">{label}</label>
        )}
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          {/* `overflow-x-auto` para el teléfono angosto: 7 × 44 px = 308, y en
              una pantalla de 320 el padding ya no entra. */}
          <div className="flex justify-center overflow-x-auto">{cuerpo()}</div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
            <span className={`text-sm ${vacio && !ancla ? "text-gray-500" : "font-medium text-gray-900"}`}>
              {titulo}
            </span>
            {accion}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-[240px]">
      {label && (
        <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">{label}</label>
      )}

      {/* DESKTOP: anclado al control. */}
      <div className="hidden lg:block" ref={anclaRef}>
        {boton}
        {/* 🩸 EL `ancho` NO ES OPCIONAL AQUÍ, y no darlo fue un bug de verdad:
            sin él `DesplegableFlotante` toma el ancho del ANCLA (~330 px, el del
            botón) y se cortaban SÁBADO y DOMINGO —la grilla mostraba LU MA MI
            JU VI y nada más—. Un calendario son 7 columnas × 44 px = 308 px más
            el padding. `altoDeseado` por el mismo motivo: sin él el panel se
            recorta a lo alto y las últimas semanas quedan abajo del corte. */}
        <DesplegableFlotante
          abierto={abierto}
          anclaRef={anclaRef}
          onCerrar={() => { setAbierto(false); setAncla(null); }}
          ancho={ANCHO_CALENDARIO}
          altoDeseado={ALTO_CALENDARIO}
          className="rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
        >
          {/* El título solo mientras se está eligiendo: cerrado, el botón ya lo
              dice y repetirlo era ruido (se veía duplicado en la captura). */}
          {ancla && <p className="px-1 pb-2 text-sm font-medium text-gray-900">{titulo}</p>}
          {cuerpo()}
        </DesplegableFlotante>
      </div>

      {/* MÓVIL: hoja a pantalla completa, un mes y scroll vertical. */}
      <div className="lg:hidden">{boton}</div>
      {abierto && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setAbierto(false); setAncla(null); }} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="text-sm font-medium text-gray-900">{titulo}</span>
              <button
                type="button"
                onClick={() => { setAbierto(false); setAncla(null); }}
                aria-label="Cerrar"
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-50"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-8 pt-2">{cuerpo()}</div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** El último rango guardado, o `null`. Lo leen las pantallas al montar. */
export function ultimoRango(key: string): { desde: string; hasta: string } | null {
  try {
    const v = localStorage.getItem(`fg_last_${key}`);
    if (!v) return null;
    const [d, h] = v.split("|");
    return /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(h ?? "")
      ? { desde: d, hasta: h }
      : null;
  } catch { return null; }
}
