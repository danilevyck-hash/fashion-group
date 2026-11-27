"use client";

// 🔴 LA TARJETA «MES A MES», UNA SOLA PARA TODO EL SISTEMA (27-nov-2026,
// `GESTOS_IPHONE_2026_11`): Ventas › Resumen y Clientes, Clientes, Multifashion
// › Vendedoras, Comisiones y Consulta de artículos. Cada mes: su barrita
// (proporcional; el mes en curso en gris), la cifra y —si la pantalla compara—
// ▲/▼ contra el mismo mes del año pasado con el MISMO color y umbral que las
// tablas (`cambioDelMes`). Cuentas en `lib/ventas/mes-a-mes.ts`.

import { useEffect, useRef, useState } from "react";
import { CajaAviso, CLASE_AVISO_EN_PILA, EnLaPilaDeAvisos } from "@/components/CajaAviso";
import { TarjetaResumen } from "@/components/shared/GestosIphone";
import { MONTHS } from "@/lib/ventas/format";
import { colorDelTono } from "@/components/celular/Piezas";
import { montoDeLaTabla } from "@/lib/ventas/celular";
import { anchoDeBarras, cambioDelMes, type CambioDelMes, type MesDeLaTarjeta } from "@/lib/ventas/mes-a-mes";


export interface PropsTarjetaMesAMes {
  titulo: string;
  subtitulo?: string;
  meses: MesDeLaTarjeta[];
  total: { actual: number; previo?: number | null } | null;
  /** «Total 2026» por defecto. */
  rotuloTotal?: string;
  anio: number;
  /** Cómo se escribe una cifra (montos sin centavos por defecto; «383 u», «$1,132.36»…). */
  formato?: (n: number) => string;
  /** El % contra el año pasado. `null` = sin flechas (Comisiones). */
  cambio?: Cambio;
  /** El mes en curso (barra gris). */
  mesEnCurso?: number | null;
  /** La línea chica de abajo («Nov va al 26 nov…»). */
  nota?: string | null;
  cargando?: boolean;
  error?: string | null;
  /** Tocar un mes (drill-down). Sin él, tocar la tarjeta hace `onAbrir`. */
  onTocarMes?: (mes: number) => void;
  onAbrir?: () => void;
  onCerrar: () => void;
}

type Cambio = ((actual: number, previo: number | null | undefined) => CambioDelMes) | null;

/** La lista de meses sola (barrita · cifra · %): la tarjeta y la ficha de artículos. */
export function ListaMesAMes({
  meses,
  total,
  rotuloTotal,
  formato = montoDeLaTabla,
  cambio = cambioDelMes,
  mesEnCurso = null,
  onTocarMes,
}: {
  meses: MesDeLaTarjeta[];
  total?: { actual: number; previo?: number | null } | null;
  rotuloTotal?: string;
  formato?: (n: number) => string;
  cambio?: Cambio;
  mesEnCurso?: number | null;
  onTocarMes?: (mes: number) => void;
}) {
  const anchos = anchoDeBarras(meses.map((m) => m.actual));
  const pct = (a: number, p: number | null | undefined) => {
    if (!cambio) return null;
    const c = cambio(a, p);
    return <span className={`w-[64px] shrink-0 text-right text-[13px] ${c.clase ?? colorDelTono(c.tono)}`}>{c.texto}</span>;
  };
  return (
    <>
      <ul data-mes-a-mes className="mt-3 divide-y divide-gray-100">
        {meses.map((m, i) => {
          const fila = (
            <>
              <span className="w-12 shrink-0 text-gray-700">{m.rotulo ?? MONTHS[m.mes - 1]}</span>
              <span className="mr-2 h-2 min-w-0 flex-1">
                <span
                  data-barra-mes={m.mes}
                  className={`block h-2 rounded-full ${m.mes === mesEnCurso ? "bg-gray-400" : "bg-gray-900"}`}
                  style={{ width: `${anchos[i]}%` }}
                />
              </span>
              <span className="shrink-0 text-right tabular-nums text-gray-900">{formato(m.actual)}</span>
              {pct(m.actual, m.previo)}
              {onTocarMes && <span aria-hidden className="w-2 shrink-0 text-gray-300">›</span>}
            </>
          );
          const clase = "flex w-full items-center gap-2 py-1.5 text-left text-[14px]";
          return (
            <li key={`${m.rotulo ?? ""}${m.mes}`}>
              {onTocarMes ? (
                <button type="button" data-tocar-mes={m.mes} className={`${clase} active:bg-gray-50`} onClick={(e) => { e.stopPropagation(); onTocarMes(m.mes); }}>
                  {fila}
                </button>
              ) : (
                <div className={clase}>{fila}</div>
              )}
            </li>
          );
        })}
      </ul>
      {total && (
        <div className="mt-1 flex items-center gap-2 border-t border-gray-200 pt-2 text-[15px] font-semibold">
          <span className="flex-1">{rotuloTotal}</span>
          <span className="tabular-nums">{formato(total.actual)}</span>
          {pct(total.actual, total.previo)}
          {onTocarMes && <span className="w-2 shrink-0" />}
        </div>
      )}
    </>
  );
}

export function TarjetaMesAMes({
  titulo,
  subtitulo,
  meses,
  total,
  rotuloTotal,
  anio,
  formato,
  cambio,
  mesEnCurso = null,
  nota = null,
  cargando = false,
  error = null,
  onTocarMes,
  onAbrir,
  onCerrar,
}: PropsTarjetaMesAMes) {
  useEffect(() => { marcarAvisoMesAMesVisto(); }, []);
  const cuerpo = cargando ? (
    <p data-mes-a-mes-cargando className="py-6 text-center text-[14px] text-gray-500">Cargando…</p>
  ) : error ? (
    <p className="py-6 text-center text-[14px] text-gray-500">{error}</p>
  ) : (
    <>
      <ListaMesAMes
        meses={meses}
        total={total}
        rotuloTotal={rotuloTotal ?? `Total ${anio}`}
        formato={formato}
        cambio={cambio}
        mesEnCurso={mesEnCurso}
        onTocarMes={onTocarMes}
      />
      {nota && <p className="mt-1.5 text-[12px] text-gray-500">{nota}</p>}
    </>
  );
  return <TarjetaResumen titulo={titulo} subtitulo={subtitulo} cuerpo={cuerpo} onAbrir={onTocarMes ? undefined : onAbrir} onCerrar={onCerrar} />;
}

export type EstadoLectura<D> = { status: "cargando" } | { status: "listo"; datos: D } | { status: "error" };

/**
 * Mantener presionado → leer UNA vez por clave (caché en memoria) y abrir la
 * tarjeta con «Cargando…» mientras llega. `url` null = esa fila no tiene tarjeta.
 */
export function useLecturaDeTarjeta<T, D>(url: (item: T) => string | null) {
  const [tarjeta, setTarjeta] = useState<{ item: T; estado: EstadoLectura<D> } | null>(null);
  const leidas = useRef(new Map<string, D>());
  const abrir = (item: T) => {
    const u = url(item);
    if (!u) return;
    const ya = leidas.current.get(u);
    if (ya) { setTarjeta({ item, estado: { status: "listo", datos: ya } }); return; }
    setTarjeta({ item, estado: { status: "cargando" } });
    fetch(u)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as D;
      })
      .then((datos) => {
        leidas.current.set(u, datos);
        setTarjeta((t) => (t && t.item === item ? { item, estado: { status: "listo", datos } } : t));
      })
      .catch(() => setTarjeta((t) => (t && t.item === item ? { item, estado: { status: "error" } } : t)));
  };
  return { tarjeta, abrir, cerrar: () => setTarjeta(null) };
}

export const ERROR_TARJETA = "No se pudo cargar. Intenta de nuevo.";

// 🔴 EL AVISO DE UNA SOLA VEZ (27-nov-2026): el gesto no se ve en la pantalla.
// Sale la primera vez, abajo al centro como todo aviso (`CajaAviso`), y no
// vuelve: se recuerda en el teléfono al mostrarse o al primer uso. Sin
// almacenamiento (modo privado) no sale: mejor callar que repetirlo siempre.
const CLAVE_AVISO = "fg_aviso_mes_a_mes";

const USADO = "fg-mes-a-mes-usado";

export function marcarAvisoMesAMesVisto() {
  try { window.localStorage.setItem(CLAVE_AVISO, "1"); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(USADO));
}

export function AvisoMesAMes() {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(CLAVE_AVISO)) return;
      window.localStorage.setItem(CLAVE_AVISO, "1");
    } catch {
      return;
    }
    setVer(true);
    const ocultar = () => setVer(false);
    const t = window.setTimeout(ocultar, 5000);
    window.addEventListener(USADO, ocultar);
    return () => { window.clearTimeout(t); window.removeEventListener(USADO, ocultar); };
  }, []);
  if (!ver) return null;
  return (
    <EnLaPilaDeAvisos>
      <CajaAviso message="Mantén presionado para ver mes a mes" sinIcono onDismiss={() => setVer(false)} className={CLASE_AVISO_EN_PILA} />
    </EnLaPilaDeAvisos>
  );
}
