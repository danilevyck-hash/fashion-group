"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 UN SOLO SELECTOR DE PERÍODO PARA TODO EL MÓDULO (24-sep-2026).
 *
 *     ‹  16 – 30 sep 2026  ›   📅
 *
 * Las flechas saltan de QUINCENA y el 📅 abre el calendario de siempre para un
 * día o un rango. Sin chips «Hoy» y «Ayer»: la quincena es lo que se mira.
 *
 * 🩸 Antes eran CUATRO controles con TRES memorias: Asistencia (calendario + 4
 * atajos, llave `asistencia_reporte`), Aprobaciones (el mismo calendario con
 * llave PROPIA `asistencia_aprobaciones` — cambiar el período en una pestaña no
 * cambiaba el de la otra), la Planilla (4 botones de quincena) y Préstamos ›
 * Movimientos (una lista de 24 quincenas).
 *
 * 🔴 UNA SOLA FUENTE: `?desde=&hasta=` en la dirección, con `replace` (es un
 * filtro del mismo nivel), y UNA sola memoria por dispositivo. La regla vive en
 * `lib/asistencia/pantalla-2026-09.ts`; acá solo se dibuja.
 * ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import RangoFechas from "@/components/ui/RangoFechas";
import { hoyPanama } from "@/lib/fecha-panama";
import {
  PARAM_DESDE, PARAM_HASTA, RECORDAR_PERIODO,
  haySiguienteQuincena, pasoDeQuincena, periodoCompartidoInicial, periodoValido,
  rotuloDelPeriodo, type Periodo,
} from "@/lib/asistencia/pantalla-2026-09";

/** El último período de este dispositivo, o `null`. */
export function periodoRecordado(): Periodo | null {
  try {
    const raw = localStorage.getItem(`fg_last_${RECORDAR_PERIODO}`) ?? "";
    const [d, h] = raw.split("|");
    return periodoValido({ desde: d, hasta: h }) ? { desde: d, hasta: h } : null;
  } catch {
    return null;
  }
}

function recordarPeriodo(desde: string, hasta: string): void {
  try { localStorage.setItem(`fg_last_${RECORDAR_PERIODO}`, `${desde}|${hasta}`); } catch { /* modo privado */ }
}

/**
 * El período que miran las cuatro pestañas. **La misma clave en todas**, así que
 * cambiarlo en una lo cambia en las otras sin ningún aviso entre componentes.
 *
 * 🩸 LAS DOS FECHAS SE ESCRIBEN JUNTAS, EN UNA SOLA VUELTA. Escribirlas con dos
 * `useUrlState` seguidos **pierde una**: cada setter arma la dirección nueva a
 * partir de la que había AL PINTAR, así que el segundo pisa al primero y la
 * dirección queda con el `desde` viejo y el `hasta` nuevo — un rango al revés.
 * Se vio en el candado: pedir la quincena anterior dejaba
 * `desde=2026-09-16&hasta=2026-09-15`. Por eso acá se arma UNA dirección con las
 * dos y se llama al router una sola vez.
 *
 * 🔑 `replace`, nunca `push`: el período es un FILTRO del mismo nivel y el Atrás
 * del navegador no tiene que ciclar por cada cambio de fechas.
 */
export function usePeriodoAsistencia(): {
  desde: string;
  hasta: string;
  hoy: string;
  elegir: (desde: string, hasta: string) => void;
} {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hoy = useMemo(() => hoyPanama(), []);
  // 🔴 La memoria se lee UNA vez al montar: releerla en cada render pelearía con
  // lo que la persona acaba de elegir.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recordado = useMemo(() => periodoRecordado(), []);

  const enLaUrl = {
    desde: sp?.get(PARAM_DESDE) ?? "",
    hasta: sp?.get(PARAM_HASTA) ?? "",
  };
  const base = periodoCompartidoInicial({ url: enLaUrl, recordado, hoy });

  // El valor optimista: la dirección del router de Next se escribe un tick
  // después, y sin esto la barra se sentiría con un toque de retraso. Se suelta
  // en cuanto la dirección alcanza (o cuando alguien usa el Atrás).
  const [optimista, setOptimista] = useState<Periodo | null>(null);
  useEffect(() => {
    if (!optimista) return;
    if (enLaUrl.desde === optimista.desde && enLaUrl.hasta === optimista.hasta) setOptimista(null);
  }, [enLaUrl.desde, enLaUrl.hasta, optimista]);

  const escribir = useCallback((d: string, h: string) => {
    const params = new URLSearchParams(sp?.toString() ?? "");
    params.set(PARAM_DESDE, d);
    params.set(PARAM_HASTA, h);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, sp]);

  const elegir = useCallback((d: string, h: string) => {
    setOptimista({ desde: d, hasta: h });
    recordarPeriodo(d, h);
    escribir(d, h);
  }, [escribir]);

  // 🔴 La dirección queda escrita UNA vez, para que el período sobreviva al
  // cambio de pestaña y al Atrás aunque nadie haya tocado el selector. Con la
  // dirección ya completa no corre: lo que trae el enlace manda.
  useEffect(() => {
    if (periodoValido(enLaUrl)) return;
    escribir(base.desde, base.hasta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elegido = optimista ?? base;
  return { desde: elegido.desde, hasta: elegido.hasta, hoy, elegir };
}

export default function SelectorPeriodo({
  desde, hasta, hoy, onElegir, conCalendario = true, className = "",
}: {
  desde: string;
  hasta: string;
  hoy: string;
  onElegir: (desde: string, hasta: string) => void;
  /** `false` en la Planilla: ahí solo se pagan quincenas, nunca un rango libre. */
  conCalendario?: boolean;
  className?: string;
}) {
  const puedeAdelante = haySiguienteQuincena(desde, hoy);
  const ir = (d: -1 | 1) => {
    const p = pasoDeQuincena(desde, d);
    onElegir(p.desde, p.hasta);
  };
  return (
    <div className={`flex shrink-0 items-center gap-2 ${className}`}>
      <div className="flex items-center rounded-md border border-gray-300 bg-white">
        <button
          type="button"
          onClick={() => ir(-1)}
          aria-label="Quincena anterior"
          className="flex h-11 w-9 items-center justify-center text-gray-500 transition hover:text-black active:scale-[0.97]"
        >
          ‹
        </button>
        <span className="min-w-[132px] px-1 text-center text-sm font-medium tabular-nums text-gray-900">
          {rotuloDelPeriodo(desde, hasta)}
        </span>
        <button
          type="button"
          onClick={() => ir(1)}
          disabled={!puedeAdelante}
          aria-label="Quincena siguiente"
          className="flex h-11 w-9 items-center justify-center text-gray-500 transition hover:text-black active:scale-[0.97] disabled:opacity-25"
        >
          ›
        </button>
      </div>
      {conCalendario && (
        <RangoFechas
          desde={desde}
          hasta={hasta}
          label={null}
          iconoSolo
          onChange={onElegir}
        />
      )}
    </div>
  );
}
