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
import { CalendarDays } from "lucide-react";
// 🔴 DEL MÓDULO PURO, NUNCA de `./CalendarioRango`: un import estático a ese
// archivo trae `react-day-picker` al bundle inicial y anula el `dynamic()`.
import { aIso, deIso } from "./rango-fechas-iso";
import { vidrioSobre, conVidrio, CLASE_VIDRIO, RADIO_VIDRIO } from "@/lib/ui/vidrio";
import {
  CALENDARIO_SIMPLE_2026_10, GUIA_PRIMER_DIA, GUIA_ULTIMO_DIA, ATAJOS_FECHA, rangoDeAtajoFecha,
  etiquetaRangoCorta, ROTULO_BOTON_RANGO,
} from "@/lib/ui/calendario-simple";
import { hoyPanama } from "@/lib/fecha-panama";

const CalendarioRango = dynamic(() => import("./CalendarioRango"), {
  ssr: false,
  loading: () => <div className="h-[320px] w-[300px] animate-pulse rounded-lg bg-gray-50" />,
});

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * 🔴 EL ANCHO DEL PANEL SE ARMA CON SUS PARTES, NO CON UN NÚMERO (25-sep-2026).
 *
 * 🩸 MEDIDO en Chromium (390, 768, 1024 y 1440 de ancho): el panel pedía
 * `308 + 24 = 332` px, pero Tailwind pone `box-sizing: border-box`, así que de
 * esos 332 el borde se come 2 y el `p-3` otros 24 — **quedaban 306 px de
 * contenido para una grilla que mide 308**. Y las celdas del calendario NO se
 * encogen (son `<td>` de 44 px fijos dentro de una tabla), así que la columna
 * del DOMINGO se sale del panel. Con la barra de scroll clásica —la de Windows,
 * que es lo que hay en la oficina, y la de macOS con «mostrar siempre»— se van
 * otros ~15 px: **17 px de los 44 de la última columna**, que es exactamente lo
 * que Daniel fotografió («DO» y los días 6, 13, 20, 27 y 4 medio tapados).
 *
 * 🔴 Por eso ahora se suma cada parte por su nombre y hay candado que lo mide
 * (`asistencia/fila-de-mandos.test.tsx`): 7 columnas + el padding + el borde +
 * el lugar de la barra de scroll. Un número suelto se vuelve a quedar corto en
 * cuanto alguien cambie un padding.
 *
 * 🔴 UN SOLO MES (4-sep-2026). Eran dos, y el panel medía 660: pedido de
 * Daniel. Con uno entra en cualquier pantalla y no hay que decidir en cuál de
 * los dos meses tocar.
 */
/** Blanco táctil de cada día (`calendar.tsx` › `day: h-11 w-11`). */
export const ANCHO_DIA_CALENDARIO = 44;
/** Lunes a domingo. */
export const COLUMNAS_CALENDARIO = 7;
/** El `p-3` del panel, a los dos lados. */
const PADDING_PANEL = 12 * 2;
/** El `border` del panel, a los dos lados. */
const BORDE_PANEL = 1 * 2;
/**
 * El lugar de la barra de scroll vertical. El panel es `overflow-y-auto` (y por
 * la regla de CSS eso vuelve `auto` también el horizontal), así que en cuanto el
 * mes no entra a lo alto la barra aparece y se come ancho. Con barras
 * superpuestas —macOS por omisión— sobran estos píxeles; con las clásicas, son
 * los que salvan la columna del domingo.
 */
const BARRA_DE_SCROLL = 16;
export const ANCHO_CALENDARIO =
  ANCHO_DIA_CALENDARIO * COLUMNAS_CALENDARIO + PADDING_PANEL + BORDE_PANEL + BARRA_DE_SCROLL;
/** 6 semanas + encabezado + el título: alcanza sin scroll para cualquier mes. */
const ALTO_CALENDARIO = 420;
/** CALENDARIO_SIMPLE_2026_10: la guía y los atajos van encima del mes. */
export const ALTO_GUIA_Y_ATAJOS = 120;

/**
 * 🔴 CALENDARIO_SIMPLE_2026_10 — los atajos de un toque. Se aplican y cierran
 * al instante, como el segundo toque del calendario. Los usa también
 * `CampoFecha` (solo Hoy y Ayer, que son días sueltos).
 */
export function Atajos({ claves, onElegir, enRango }: {
  claves?: readonly string[];
  onElegir: (desde: string, hasta: string) => void;
  /** El atajo cae dentro de los límites del campo (min/max). */
  enRango?: (desde: string, hasta: string) => boolean;
}) {
  const hoy = hoyPanama();
  return (
    // 🔴 UNA fila (Daniel, 5-oct-2026). Si un día no entra, se desliza ESTA fila,
    // nunca la página.
    <div className="flex flex-nowrap gap-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none]" data-atajos-calendario>
      {ATAJOS_FECHA.filter((a) => !claves || claves.includes(a.clave)).map((a) => {
        const r = rangoDeAtajoFecha(a.clave, hoy);
        if (enRango && !enRango(r.desde, r.hasta)) return null;
        return (
          <button
            key={a.clave}
            type="button"
            onClick={() => onElegir(r.desde, r.hasta)}
            className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full bg-gray-100 px-2 text-sm sm:px-2.5 text-gray-700 transition hover:bg-gray-200 active:scale-[0.97] lg:min-h-9"
          >
            {a.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/** «28 oct – 10 nov 2026 · 14 días». El año se dice UNA vez si es el mismo. */
export function etiquetaRango(desde: string, hasta: string): string {
  if (!desde || !hasta) return "Seleccionar período";
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
  /**
   * Lo que dice el botón cuando está vacío. «Seleccionar período» de siempre; la
   * Planilla lo llama «Otro rango» porque la quincena se elige con dos botones
   * y el calendario queda para lo que no es una quincena (10-sep-2026).
   */
  textoVacio?: string;
  /**
   * 🔴 SOLO EL ÍCONO 📅, sin el rango escrito al lado (24-sep-2026). Lo pide el
   * selector único de Asistencia: ahí el período ya se lee en la barra
   * «‹ 16 – 30 sep 2026 ›» y repetirlo en el botón sería decir la misma fecha
   * dos veces. El calendario que abre es EXACTAMENTE el mismo.
   */
  iconoSolo?: boolean;
  /**
   * `false` = no pintar en gris los días sin marcaciones del RELOJ. Lo apagan
   * Multifashion y Comisiones: ahí el gris de Asistencia no dice nada y se leía
   * como días que no se pueden elegir. Solo con CALENDARIO_SIMPLE_2026_10.
   */
  diasDeAsistencia?: boolean;
  /**
   * 🔴 CALENDARIO_SIMPLE_2026_10 — el botón «Rango de fechas» de la barra, al
   * lado del selector de meses (Multifashion y Comisiones). Vacío dice «Rango de
   * fechas»; con un rango dice «15–30 sep» y su ✕ llama a esto (vuelve al mes).
   */
  onQuitar?: () => void;
  /** Con `onQuitar`: el botón se dibuja como el de la barra. */
  enBarra?: boolean;
}

export default function RangoFechas({
  desde, hasta, onChange, recordarComo, label = "Período", vacio = false, textoVacio = "Seleccionar período",
  inline = false, accion, sugerido = null, iconoSolo = false, diasDeAsistencia = true,
  onQuitar, enBarra = false,
}: Props) {
  const conGris = !CALENDARIO_SIMPLE_2026_10 || diasDeAsistencia;
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
    if ((!abierto && !inline) || !conGris) return;
    const base = deIso(desde || aIso(new Date()));
    const ini = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    const fin = new Date(base.getFullYear(), base.getMonth() + 2, 0);
    void pedirDatos(aIso(ini), aIso(fin));
  }, [abierto, inline, desde, pedirDatos, conGris]);

  const aplicar = useCallback((d: string, h: string) => {
    onChange(d, h);
    if (recordarComo) {
      try { localStorage.setItem(`fg_last_${recordarComo}`, `${d}|${h}`); } catch { /* modo privado */ }
    }
    setAbierto(false);
    setAncla(null);
  }, [onChange, recordarComo]);


  // 🔴 DICE CUÁL DE LAS DOS FECHAS SE ESTÁ ELIGIENDO. Con el rango a medias, el
  // encabezado es lo único que distingue «ya se eligió el inicio» de «no pasó
  // nada».
  const titulo = CALENDARIO_SIMPLE_2026_10 && !inline
    ? (ancla ? GUIA_ULTIMO_DIA : GUIA_PRIMER_DIA)
    : ancla
    ? `${etiquetaRango(ancla, ancla).split(" · ")[0]} — ahora selecciona el último día`
    : vacio
      ? "Selecciona el primer día"
      : etiquetaRango(desde, hasta);

  const cuerpo = () => (
    <CalendarioRango
      desde={desde} hasta={hasta} diasConDatos={datos} vacio={vacio} sugerido={sugerido}
      onRango={aplicar} onAncla={setAncla}
      onMesVisible={(i, f) => { if (conGris) void pedirDatos(i, f); }}
    />
  );

  const boton = enBarra ? (
    <span className="inline-flex shrink-0 items-center" data-boton-rango>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="dialog"
        className={`inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap px-2.5 text-sm sm:px-3 transition active:scale-[0.97] ${
          vacio
            ? "rounded-md border border-gray-300 bg-white text-gray-700 hover:border-black hover:text-black"
            : `${onQuitar ? "rounded-l-md" : "rounded-md"} bg-gray-900 font-medium text-white`
        }`}
      >
        {/* En el celular: «Rango» y, con un rango, sin ícono — así entra en la
            misma línea que ‹ Octubre 2026 ›. */}
        <CalendarDays aria-hidden className={`h-4 w-4 shrink-0 ${vacio ? "text-gray-500" : "hidden text-white sm:block"}`} />
        {vacio ? (
          <><span className="sm:hidden">Rango</span><span className="hidden sm:inline">{ROTULO_BOTON_RANGO}</span></>
        ) : etiquetaRangoCorta(desde, hasta)}
      </button>
      {!vacio && onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          aria-label="Quitar el rango y volver al mes"
          className="inline-flex min-h-[44px] w-8 items-center justify-center rounded-r-md bg-gray-900 sm:w-9 text-white/80 transition hover:text-white active:scale-[0.97]"
        >
          ✕
        </button>
      )}
    </span>
  ) : iconoSolo ? (
    <button
      type="button"
      onClick={() => setAbierto((v) => !v)}
      aria-label="Seleccionar un día o un rango"
      title="Seleccionar un día o un rango"
      className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-300 text-base transition hover:border-black active:scale-[0.97]"
    >
      <CalendarDays aria-hidden className="h-4 w-4 text-gray-600" />
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setAbierto((v) => !v)}
      className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-gray-200 px-3 text-left text-sm transition hover:border-gray-400"
    >
      <CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-gray-500" />
      <span className={vacio ? "text-gray-500" : "text-gray-900"}>
        {vacio ? textoVacio : etiquetaRango(desde, hasta)}
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
    <div className={iconoSolo || enBarra ? "shrink-0" : "min-w-[240px]"}>
      {label && !iconoSolo && !enBarra && (
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
          // 🩸 Bajo `lg` el ancla está oculta y abre la hoja de abajo: sin esto
          // salían DOS calendarios a la vez (2-oct-2026, Comisiones a 390 px).
          abierto={abierto && !!anclaRef.current?.offsetParent}
          anclaRef={anclaRef}
          onCerrar={() => { setAbierto(false); setAncla(null); }}
          // CALENDARIO_SIMPLE_2026_10: +48 para que los cinco atajos entren en una fila.
          ancho={ANCHO_CALENDARIO + (CALENDARIO_SIMPLE_2026_10 ? 48 : 0)}
          altoDeseado={ALTO_CALENDARIO + (CALENDARIO_SIMPLE_2026_10 ? ALTO_GUIA_Y_ATAJOS : 0)}
          className={vidrioSobre("rounded-xl border border-gray-200 bg-white p-3 shadow-lg")}
        >
          {/* El título solo mientras se está eligiendo: cerrado, el botón ya lo
              dice y repetirlo era ruido (se veía duplicado en la captura). */}
          {(ancla || CALENDARIO_SIMPLE_2026_10) && <p className="px-1 pb-2 text-sm font-medium text-gray-900" data-guia-calendario>{titulo}</p>}
          {CALENDARIO_SIMPLE_2026_10 && <Atajos onElegir={aplicar} />}
          {/* 🔴 CENTRADO Y CON SU PROPIO DESLIZAMIENTO (25-sep-2026): con el
              ancho ya calculado el mes entra entero, y si algún día una pantalla
              angosta lo apretara, se desliza ESTA caja y no se recorta una
              columna en silencio. Es lo mismo que ya hacía el modo en línea. */}
          <div className="flex justify-center overflow-x-auto">{cuerpo()}</div>
        </DesplegableFlotante>
      </div>

      {/* MÓVIL: hoja a pantalla completa, un mes y scroll vertical. */}
      <div className="lg:hidden">{boton}</div>
      {abierto && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setAbierto(false); setAncla(null); }} />
          <div className={conVidrio("absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl bg-white shadow-xl", `absolute inset-x-2 bottom-2 flex max-h-[88vh] flex-col ${CLASE_VIDRIO} ${RADIO_VIDRIO}`)}>
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="text-sm font-medium text-gray-900" data-guia-calendario>{titulo}</span>
              <button
                type="button"
                onClick={() => { setAbierto(false); setAncla(null); }}
                aria-label="Cerrar"
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-50"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-8 pt-2">
              {CALENDARIO_SIMPLE_2026_10 && <Atajos onElegir={aplicar} />}
              {CALENDARIO_SIMPLE_2026_10 ? <div className="flex justify-center">{cuerpo()}</div> : cuerpo()}
            </div>
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
