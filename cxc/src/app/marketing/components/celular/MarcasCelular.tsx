"use client";

// ============================================================================
// 5b · LA PORTADA › MARCAS, EN EL CELULAR (24-sep-2026).
//
//   ‹ Marketing                                                           ＋
//   Marcas
//   Período 2026 · abierto hace 44 días
//   ┌──────────────────────────────────────────┐
//   │ Calvin Klein                  13 gastos  │  $27,320.81
//   │ Tommy Hilfiger    17 gastos · 2 sin foto │  $22,571.23
//   │ Joybees                         1 gasto  │   $1,540.00
//   │ Karl Lagerfeld    sin gasto este período │           —
//   └──────────────────────────────────────────┘
//   CERRADOS · 1
//
// 🔴 ACÁ NO VA NINGÚN NÚMERO GRANDE. Daniel eligió 5b: la lista y nada más.
// Sumar Tommy + Calvin + Joybees sería un TOTAL ENTRE MARCAS, y el módulo no
// suma entre marcas en ninguna otra pantalla (`MARCAS_SIN_TOTAL`). Hay candado
// que barre esta pantalla buscando esa suma.
//
// 🩸 NINGÚN NÚMERO SE CALCULA ACÁ: las filas abiertas, las cerradas y sus
// grupos son EXACTAMENTE los que ya armó `PortadaAbiertosCerrados` con
// `portada-rediseno.ts` y `cerrados-por-periodo.ts`.
// ============================================================================

import { useRouter } from "next/navigation";
import { formatearFecha } from "@/lib/marketing/normalizar";
import { montoCelular, subtituloMarcaCelular } from "@/lib/marketing/celular";
import { textoDiasAbierto, type FilaAbierta } from "@/lib/marketing/portada-rediseno";
import { marcasDelGrupo, type GrupoCerrado } from "@/lib/marketing/cerrados-por-periodo";
import {
  FilaCelular,
  GrupoCelular,
  PantallaCelular,
  RotuloDeGrupo,
  TituloCelular,
  VacioCelular,
} from "./PiezasCelular";

interface Props {
  abiertas: ReadonlyArray<FilaAbierta>;
  grupos: ReadonlyArray<GrupoCerrado>;
  cargando: boolean;
  escribe: boolean;
  onRegistrarGasto: () => void;
  onSelectBloque: (key: string) => void;
  onSelectCerrado: (bloqueKey: string, periodoId: string) => void;
  /** A dónde vuelve «‹ Marketing». */
  hrefVolver: string;
}

/** La línea gris de arriba: el período que está abierto y desde cuándo. */
function subtituloDeLaPantalla(abiertas: ReadonlyArray<FilaAbierta>): string {
  const conPeriodo = abiertas.find((f) => f.periodoNombre) ?? null;
  if (!conPeriodo) return "Sin período abierto";
  const dias = textoDiasAbierto(conPeriodo.diasAbierto);
  return dias ? `${conPeriodo.periodoNombre} · ${dias}` : conPeriodo.periodoNombre;
}

export default function MarcasCelular({
  abiertas,
  grupos,
  cargando,
  escribe,
  onRegistrarGasto,
  onSelectBloque,
  onSelectCerrado,
  hrefVolver,
}: Props) {
  const router = useRouter();
  // Las que tienen plata arriba, de mayor a menor; las que no, al final en
  // gris. Es el mismo conjunto de filas, solo ordenado.
  const conGasto = abiertas.filter((f) => f.cantidadReportada > 0);
  const sinGasto = abiertas.filter((f) => f.cantidadReportada === 0);

  return (
    <PantallaCelular>
      <div className="px-2 pt-1">
        <button
          type="button"
          onClick={() => router.push(hrefVolver)}
          className="min-h-[44px] px-2 text-[17px] text-blue-600 active:opacity-60"
        >
          ‹ Marketing
        </button>
      </div>

      <TituloCelular
        titulo="Marcas"
        detalle={subtituloDeLaPantalla(abiertas)}
        accion={
          escribe ? (
            <button
              type="button"
              onClick={onRegistrarGasto}
              aria-label="Registrar un gasto"
              className="grid h-11 w-11 place-items-center rounded-full text-[30px] font-light leading-none text-blue-600 active:opacity-60"
            >
              ＋
            </button>
          ) : undefined
        }
      />

      {cargando ? (
        <div className="mx-4 mt-4 h-48 animate-pulse rounded-2xl bg-white" />
      ) : abiertas.length === 0 ? (
        <VacioCelular>Todavía no hay marcas con período abierto.</VacioCelular>
      ) : (
        <GrupoCelular className="mt-4">
          {[...conGasto, ...sinGasto].map((f) => (
            <FilaCelular
              key={f.key}
              data-fila="marca"
              titulo={f.nombre}
              detalle={subtituloMarcaCelular({
                gastos: f.cantidadReportada,
                sinFoto: 0,
              })}
              monto={f.cantidadReportada > 0 ? montoCelular(f.reportado) : "—"}
              tono={f.cantidadReportada > 0 ? "normal" : "apagado"}
              onClick={() => onSelectBloque(f.key)}
              ariaLabel={`Abrir ${f.nombre}`}
            />
          ))}
        </GrupoCelular>
      )}

      {grupos.length > 0 && (
        <>
          <RotuloDeGrupo>Cerrados · {grupos.length}</RotuloDeGrupo>
          <GrupoCelular className="mt-0">
            {grupos.map((g) => (
              <FilaCelular
                key={g.id}
                data-fila="cerrado"
                titulo={g.nombre}
                detalle={[
                  g.cerradoEn ? `cerrado el ${formatearFecha(g.cerradoEn)}` : "",
                  marcasDelGrupo(g),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                monto="›"
                onClick={() => onSelectCerrado(g.marcas[0]?.bloqueKey ?? "", g.id)}
                ariaLabel={`Abrir ${g.nombre}`}
              />
            ))}
          </GrupoCelular>
        </>
      )}
    </PantallaCelular>
  );
}
