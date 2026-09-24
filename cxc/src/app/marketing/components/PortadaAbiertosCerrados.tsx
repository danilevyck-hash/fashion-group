"use client";

// ============================================================================
// LA PORTADA DE MARKETING DEL REDISEÑO — Abiertos | Cerrados (22-sep-2026).
//
// Daniel: *«no quiero pipeline, cuando lo cierro es porque lo cobré»* y
// *«Lo cerrado no debería estar como aparte?»*. Dos pestañas y nada más:
//
//   ABIERTOS  — una fila por MARCA: su período abierto, lo REPORTADO como
//               único monto, lo apagado en gris (sin sumar) y desde cuándo
//               está abierto. Tocarla abre la marca (nivel 2).
//   CERRADOS  — una fila por PERÍODO cerrado (no por marca): el NOMBRE que se
//               le puso al cerrar, las marcas, la fecha de cierre y la nota de
//               crédito si la hay. Tocarla abre ese período (nivel 3).
//
// 🔴 UN PERÍODO COMPARTIDO ES UNA SOLA FILA (22-sep-2026). «mid 2026» es de
// PVH —la casa de Tommy y Calvin— y se dibujaba DOS veces, con el contador en
// «Cerrados 2». Daniel: *«doble?»*. Hoy es UNA fila con los DOS montos, cada
// uno con su marca y su propio botón para entrar, y el contador cuenta
// PERÍODOS. 🔴 Los dos montos NO se suman: cada marca recibió su ZIP aparte.
//
// 🔴 MULTIFASHION NO ES UNA MARCA: es una tienda (D-108). No tiene fila entre
// las marcas; se enlaza aparte, en Herramientas, con su plata a la vista.
// ⚠️ Su plata NO se movió de bucket —eso lo decide Daniel—: sigue donde
// estaba, solo dejó de dibujarse como marca.
//
// 🔴 ACÁ NO HAY UN TOTAL DEL GRUPO. Daniel: *«los gastos de las marcas NUNCA
// se suman entre sí»*. Ninguna cifra de esta pantalla suma dos marcas, y hay
// candado que lo barre. El «gastado en el período actual» de la portada de
// antes era exactamente eso, y se fue con el interruptor.
//
// 🩸 NINGÚN NÚMERO SE CALCULA ACÁ. Todo viene de `GET /api/marketing/inicio`
// (el agregador único) y las filas las arma `portada-rediseno.ts`, puro.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import { nombreDeBloque } from "@/lib/marketing/bloques";
import {
  PESTANAS_PORTADA,
  esPestanaPortada,
  filaTiendaMultifashion,
  filasAbiertas,
  filasCerradas,
  textoDiasAbierto,
  type FilaAbierta,
  type PestanaPortada,
  type PeriodoMeta,
} from "@/lib/marketing/portada-rediseno";
import {
  agruparCerradosPorPeriodo,
  esCompartido,
  marcasDelGrupo,
  tituloDelGrupo,
  type GrupoCerrado,
} from "@/lib/marketing/cerrados-por-periodo";
import { MARKETING_CELULAR } from "@/lib/marketing/celular";
import { FilaNivel, ListaCard } from "./FilaNivel";
import MarcasCelular from "./celular/MarcasCelular";
import type { DatosInicio } from "./InicioMarketing";

/** Lo que la ruta manda de más para esta portada. */
export interface DatosPortada extends DatosInicio {
  periodosMeta?: Record<string, PeriodoMeta>;
  hoy?: string;
}

interface Props {
  onSelectBloque: (key: string) => void;
  /** Abre un período cerrado: la marca y el id del período. */
  onSelectCerrado: (bloqueKey: string, periodoId: string) => void;
  onRegistrarGasto: () => void;
  onOpenImpulsadoras?: () => void;
  onOpenInventario?: () => void;
  onOpenReportes?: () => void;
  refreshKey: number;
  /**
   * 🔴 SIN LA TARJETA «HERRAMIENTAS» (23-sep-2026, Tiendas y Marcas): en la
   * portada nueva Multifashion es una TIENDA (vive en la pestaña Tiendas),
   * Mobiliario e Impulsadoras son pestañas y «Reportes» desapareció —por
   * tienda ES la lista de tiendas, por marca ES la página de la marca—. Con
   * el interruptor apagado no se pasa y la tarjeta se dibuja como siempre.
   */
  sinHerramientas?: boolean;
  /** La portada nueva ya tiene su «＋ Gasto» arriba: acá no se repite. */
  sinBotonDeGasto?: boolean;
  /**
   * 🔴 EN EL CELULAR, MARCAS ES UNA LISTA Y NADA MÁS (24-sep-2026, 5b). Con
   * esto puesto la vista de celular se dibuja arriba y la de computadora queda
   * en `hidden sm:block`. Las DOS derivan de las MISMAS `filasAbiertas` y
   * `agruparCerradosPorPeriodo`: ningún número puede diferir.
   */
  celular?: { escribe: boolean; hrefVolver: string } | null;
}

const ROTULO_PESTANA: Record<PestanaPortada, string> = {
  abiertos: "Abiertos",
  cerrados: "Cerrados",
};

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** El subtítulo de una marca abierta: cuántos gastos, desde cuándo, lo apagado. */
function subtituloAbierta(f: FilaAbierta): string {
  if (f.sinMarca) return "Falta decidir a qué marca se le reporta este gasto";
  const partes: string[] = [f.periodoNombre];
  if (f.cantidadReportada > 0) partes.push(plural(f.cantidadReportada, "gasto", "gastos"));
  else partes.push("Sin gasto este período");
  const dias = textoDiasAbierto(f.diasAbierto);
  if (dias) partes.push(dias);
  return partes.join(" · ");
}

/** El subtítulo de un período cerrado: sus marcas, la fecha y la nota. */
function subtituloCerrada(g: GrupoCerrado): string {
  const partes: string[] = [marcasDelGrupo(g)];
  if (g.cerradoEn) partes.push(`Cerrado el ${formatearFecha(g.cerradoEn)}`);
  if (g.notaCredito) partes.push(`Nota de crédito: ${g.notaCredito}`);
  return partes.join(" · ");
}

/**
 * Los montos de un período que comparten DOS marcas o más: uno por marca, con
 * su nombre, y cada uno es la puerta a SU nivel 3.
 *
 * 🔴 ACÁ NO HAY UNA SUMA. No existe el total de la fila: las marcas no se
 * suman entre sí, y por eso tampoco hay un renglón que las junte.
 */
function MontosPorMarca({
  grupo,
  onAbrir,
}: {
  grupo: GrupoCerrado;
  onAbrir: (bloqueKey: string, periodoId: string) => void;
}) {
  return (
    <div className="flex flex-col items-end">
      {grupo.marcas.map((m) => (
        <button
          key={m.bloqueKey}
          type="button"
          onClick={() => onAbrir(m.bloqueKey, grupo.id)}
          aria-label={`Abrir ${grupo.nombre} de ${m.marcaNombre}`}
          className="flex min-h-[44px] min-w-[44px] items-center justify-end gap-2 rounded-md px-2 -mr-2 hover:bg-gray-100 active:scale-[0.97] transition"
        >
          <span className="text-xs font-normal text-gray-500">{m.marcaNombre}</span>
          <span className="tabular-nums">{formatearMonto(m.total)}</span>
          {m.noReportado > 0 && (
            <span className="text-xs font-normal text-gray-500 tabular-nums">
              (no se reporta: {formatearMonto(m.noReportado)})
            </span>
          )}
          <span className="text-gray-400 font-normal">›</span>
        </button>
      ))}
    </div>
  );
}

/** El monto de la fila: lo reportado, y debajo en gris lo que no. */
function MontoConApagado({ reportado, noReportado, cantidadNoReportada }: {
  reportado: number;
  noReportado: number;
  cantidadNoReportada: number;
}) {
  return (
    <div>
      <div>{formatearMonto(reportado)}</div>
      {cantidadNoReportada > 0 && (
        <div className="text-xs font-normal text-gray-500 tabular-nums">
          No se reporta: {formatearMonto(noReportado)}
        </div>
      )}
    </div>
  );
}

export default function PortadaAbiertosCerrados({
  onSelectBloque,
  onSelectCerrado,
  onRegistrarGasto,
  onOpenImpulsadoras,
  onOpenInventario,
  onOpenReportes,
  refreshKey,
  sinHerramientas = false,
  sinBotonDeGasto = false,
  celular = null,
}: Props) {
  const [datos, setDatos] = useState<DatosPortada | null>(null);
  const [loading, setLoading] = useState(true);
  const [recargar, setRecargar] = useState(0);
  // La pestaña vive en la URL (`?estado=cerrados`) y es un filtro del MISMO
  // nivel: `replace`, para que Atrás no cicle entre Abiertos y Cerrados.
  const [pestanaRaw, setPestana] = useUrlState<PestanaPortada>("estado", "abiertos");
  const pestana: PestanaPortada = esPestanaPortada(pestanaRaw) ? pestanaRaw : "abiertos";

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/marketing/inicio", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as DatosPortada;
        if (!cancelado) setDatos(data);
      } catch {
        if (!cancelado) setDatos(null);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [refreshKey, recargar]);

  const meta = useMemo(() => datos?.periodosMeta ?? {}, [datos]);
  const hoy = datos?.hoy ?? "";

  const abiertas = useMemo(
    () =>
      filasAbiertas(
        (datos?.bloques ?? []).map((b) => ({
          ...b,
          nombre: b.nombre || nombreDeBloque(b.key, datos?.marcas ?? []),
        })),
        meta,
        hoy,
      ),
    [datos, meta, hoy],
  );
  const cerradas = useMemo(() => filasCerradas(datos?.cerrados ?? [], meta), [datos, meta]);
  // 🔴 UNA fila por PERÍODO, no por marca: el contador de la pestaña y la
  // lista cuentan y dibujan lo mismo.
  const grupos = useMemo(() => agruparCerradosPorPeriodo(cerradas), [cerradas]);
  const tiendaPropia = useMemo(() => filaTiendaMultifashion(datos?.bloques ?? []), [datos]);

  const mobiliario = datos?.mobiliario;
  const impulsadoras = datos?.impulsadoras;

  const enCelular = MARKETING_CELULAR && celular !== null;

  return (
    <>
      {enCelular && (
        <MarcasCelular
          abiertas={abiertas}
          grupos={grupos}
          cargando={loading && datos === null}
          escribe={celular!.escribe}
          onRegistrarGasto={onRegistrarGasto}
          onSelectBloque={onSelectBloque}
          onSelectCerrado={onSelectCerrado}
          hrefVolver={celular!.hrefVolver}
        />
      )}
    <div className={enCelular ? "hidden sm:block space-y-5" : "space-y-5"}>
      {!sinBotonDeGasto && (
        <div className="flex items-center justify-end gap-4">
          <h1 className="sr-only">Marketing</h1>
          <button
            type="button"
            onClick={onRegistrarGasto}
            className="rounded-md bg-black text-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm active:scale-[0.97] transition shrink-0"
          >
            + Registrar gasto
          </button>
        </div>
      )}

      {/* Las DOS pestañas. Lista cerrada: `PESTANAS_PORTADA`. */}
      <div className="flex items-center gap-1 border-b border-gray-200" role="tablist">
        {PESTANAS_PORTADA.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={pestana === p}
            onClick={() => setPestana(p)}
            className={`inline-flex min-h-[44px] items-center px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              pestana === p
                ? "border-fuchsia-500 text-fuchsia-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {ROTULO_PESTANA[p]}
            {p === "cerrados" && datos && grupos.length > 0 && (
              <span className="ml-1.5 text-xs text-gray-400 tabular-nums">{grupos.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-64 rounded-lg bg-gray-100 animate-pulse" />
        </div>
      ) : !datos ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-600">
            No se pudo cargar la portada. Revisa tu conexión e intenta de nuevo.
          </p>
          <button
            type="button"
            onClick={() => setRecargar((n) => n + 1)}
            className="mt-3 rounded-md border border-gray-300 bg-white px-3 min-h-[44px] inline-flex items-center justify-center text-sm hover:border-gray-500 active:scale-[0.97] transition"
          >
            Intentar de nuevo
          </button>
        </div>
      ) : pestana === "abiertos" ? (
        <ListaCard titulo="Marcas">
          {abiertas.map((f) => (
            <FilaNivel
              key={f.key}
              titulo={f.nombre}
              subtitulo={subtituloAbierta(f)}
              monto={
                f.cantidadReportada === 0 && f.cantidadNoReportada === 0 ? (
                  <span className="text-gray-300 text-sm">—</span>
                ) : (
                  <MontoConApagado
                    reportado={f.reportado}
                    noReportado={f.noReportado}
                    cantidadNoReportada={f.cantidadNoReportada}
                  />
                )
              }
              onClick={() => onSelectBloque(f.key)}
              ariaLabel={`Abrir ${f.nombre}`}
            />
          ))}
        </ListaCard>
      ) : grupos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm text-gray-600">Todavía no hay períodos cerrados.</p>
        </div>
      ) : (
        <ListaCard titulo="Períodos cerrados">
          {grupos.map((g) => {
            const compartido = esCompartido(g);
            const unica = g.marcas[0];
            return (
              <FilaNivel
                key={g.id}
                titulo={tituloDelGrupo(g)}
                subtitulo={subtituloCerrada(g)}
                monto={
                  compartido ? (
                    <MontosPorMarca grupo={g} onAbrir={onSelectCerrado} />
                  ) : (
                    <MontoConApagado
                      reportado={unica.total}
                      noReportado={unica.noReportado}
                      cantidadNoReportada={unica.noReportado > 0 ? 1 : 0}
                    />
                  )
                }
                // Con DOS marcas la fila no tiene un solo destino: se entra por
                // el monto de cada una. Con una, la fila de siempre.
                onClick={
                  compartido ? undefined : () => onSelectCerrado(unica.bloqueKey, g.id)
                }
                ariaLabel={
                  compartido ? undefined : `Abrir ${g.nombre} de ${unica.marcaNombre}`
                }
              />
            );
          })}
        </ListaCard>
      )}

      {datos && !sinHerramientas && (
        <ListaCard titulo="Herramientas">
          {tiendaPropia && (
            <FilaNivel
              titulo={tiendaPropia.nombre}
              subtitulo={`Tienda propia · ${plural(tiendaPropia.cantidad, "gasto", "gastos")} · no se le reporta a ninguna marca`}
              monto={formatearMonto(tiendaPropia.total)}
              onClick={() => onSelectBloque(tiendaPropia.key)}
              ariaLabel={`Abrir ${tiendaPropia.nombre}`}
            />
          )}
          <FilaNivel
            titulo="Mobiliario"
            subtitulo={
              mobiliario
                ? `${plural(mobiliario.entregas, "entrega", "entregas")} · ${formatearMonto(mobiliario.total)} entregados`
                : "Inventario y entregas de muebles"
            }
            onClick={onOpenInventario}
          />
          <FilaNivel
            titulo="Impulsadoras"
            subtitulo={
              impulsadoras && impulsadoras.count !== null
                ? `${plural(impulsadoras.count, "impulsadora", "impulsadoras")}${
                    impulsadoras.montoMensual
                      ? ` · ${formatearMonto(impulsadoras.montoMensual)} al mes`
                      : ""
                  }`
                : "Pagos mensuales de las impulsadoras"
            }
            onClick={onOpenImpulsadoras}
          />
          <FilaNivel titulo="Reportes" subtitulo="Por marca y por tienda" onClick={onOpenReportes} />
        </ListaCard>
      )}
    </div>
    </>
  );
}
