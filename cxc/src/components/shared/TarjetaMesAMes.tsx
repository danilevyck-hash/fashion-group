"use client";

// La tarjeta «mes a mes» de mantener presionado en Ventas (ver
// `lib/ventas/mes-a-mes.ts`). Los montos van con `montoDeLaTabla`, el mismo
// formato de la tabla, para que nada difiera de lo que está en pantalla.

import { TarjetaResumen } from "@/components/shared/GestosIphone";
import { MESES_LARGOS } from "@/lib/comisiones/periodo";
import { montoDeLaTabla } from "@/lib/ventas/celular";
import { cambioDelMes, marcaDelMesEnCurso, type MesDeLaTarjeta } from "@/lib/ventas/mes-a-mes";

const TONO = { up: "text-emerald-700", dn: "text-red-700", fl: "text-gray-500" } as const;

function Valor({ actual, previo }: { actual: number; previo: number | null }) {
  const c = cambioDelMes(actual, previo);
  return (
    <span className="inline-flex items-baseline gap-2">
      <span>{montoDeLaTabla(actual)}</span>
      <span className={`w-[62px] text-right text-[13px] ${TONO[c.tono]}`}>{c.texto}</span>
    </span>
  );
}

export function TarjetaMesAMes({
  titulo,
  anio,
  meses,
  total,
  corte,
  cargando = false,
  error = null,
  onAbrir,
  onCerrar,
}: {
  titulo: string;
  anio: number;
  meses: MesDeLaTarjeta[];
  total: { actual: number; previo: number | null } | null;
  /** YYYY-MM-DD del corte del mes en curso (o null). */
  corte: string | null;
  cargando?: boolean;
  error?: string | null;
  onAbrir?: () => void;
  onCerrar: () => void;
}) {
  const filas = cargando
    ? [{ rotulo: "Cargando…", valor: "" }]
    : error
      ? [{ rotulo: error, valor: "" }]
      : meses.map((m) => {
          return {
            rotulo: MESES_LARGOS[m.mes - 1],
            nota: marcaDelMesEnCurso(m.mes, anio, corte) ?? undefined,
            valor: <Valor actual={m.actual} previo={m.previo} />,
          };
        });
  return (
    <TarjetaResumen
      titulo={titulo}
      subtitulo={`Ventas ${anio} · contra el mismo mes de ${anio - 1}`}
      filas={filas}
      pie={!cargando && !error && total ? { rotulo: `Total ${anio}`, valor: <Valor actual={total.actual} previo={total.previo} /> } : undefined}
      onAbrir={onAbrir}
      onCerrar={onCerrar}
    />
  );
}
