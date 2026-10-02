"use client";

// ─────────────────────────────────────────────────────────────────────────────
// NUEVA GUÍA › LOS ENVÍOS COMO TARJETAS (1-oct-2026, `GUIA_APPLE_2026_10`).
// Daniel aprobó la «Propuesta estilo Apple» del mockup: *«ten mentalidad steve
// jobs, estilo apple»* (docs/diseno.md).
//
//   · «Etiquetados»: cada envío pendiente es UNA tarjeta. Se toca y queda
//     marcada (círculo con ✓, borde oscuro); se vuelve a tocar y sale.
//   · «Facturas» + chip «Sin etiqueta»: los renglones escritos a mano, también
//     como tarjetas — tocar abre sus campos, ✕ los quita.
//   · «+ Agregar factura» abre el MISMO `AgregarSinEtiquetas` de siempre.
//
// 🔴 ES SOLO LA PANTALLA. Marcar y desmarcar usan `marcarEnvio` /
// `desmarcarEnvio` (un renglón por envío) y las etiquetas que se atan salen de
// `idsDeLosEnviosMarcados`: lo MISMO que `DetalleDeEnvio`, así que el payload
// no cambia (candado `guias-nueva-guia-apple.test.tsx`).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, type ReactNode } from "react";
import type { GuiaItem } from "./types";
import type { ClienteHit } from "@/lib/hooks/useBusquedaClientes";
import type { EtiquetaFila } from "@/lib/guias/etiquetas";
import { agruparEnEnvios, contenidoDelTraslado, desmarcarEnvio, facturasDelEnvio, lineaDeTraslado, marcarEnvio, type Envio } from "@/lib/guias/etiquetas-por-envio";
import { envioTomadoPorUnRenglon } from "@/lib/guias/anti-doble-captura";
import { facturasParaMostrar } from "@/lib/guias/numero-factura";
import { filaTieneDatos } from "./guia-form-logic";
import { emptyItem } from "./constants";
import AgregarSinEtiquetas from "./AgregarSinEtiquetas";
import { CHIP_SIN_ETIQUETA, MOTIVO_FACTURA_EN_RENGLON, idsDeLosEnviosMarcados } from "./DetalleDeEnvio";

export const TEXTO_SIN_ETIQUETADOS = "No hay envíos etiquetados pendientes.";
export const BOTON_AGREGAR_FACTURA = "+ Agregar factura";

const TITULO = "mb-2.5 flex items-center gap-2 text-[15px] font-semibold";
const CHIP = "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500";

function Candado() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

const bultosTxt = (n: number) => (n === 1 ? "bulto" : "bultos");

/** Lo de adentro de una tarjeta: cliente en negrita, la línea gris y los bultos a la derecha. */
function Contenido({ cliente, detalle, titulo, bultos, candado, extra }: {
  cliente: string;
  detalle: string;
  /** La factura ENTERA (se muestra corta). */
  titulo?: string;
  bultos: number;
  candado?: boolean;
  extra?: ReactNode;
}) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[15px] font-medium">{cliente}</span>
        <span className="block break-words text-[13px] text-gray-500" title={titulo}>{detalle}</span>
        {extra}
      </span>
      <span className="shrink-0 text-right tabular-nums" data-bultos-de-etiquetas={candado ? "1" : undefined}>
        <span className="inline-flex items-center gap-1 text-[15px] font-semibold">
          {candado && <Candado />}
          {bultos}
        </span>{" "}
        <span className="text-xs text-gray-500">{bultosTxt(bultos)}</span>
        {candado && <span className="sr-only">, de las etiquetas impresas: no se cambian</span>}
      </span>
    </>
  );
}

const linea = (...partes: string[]) => partes.map((p) => p.trim()).filter(Boolean).join(" · ") || "—";

interface Props {
  items: GuiaItem[];
  etiquetas: readonly EtiquetaFila[];
  onReemplazarItems: (items: GuiaItem[]) => void;
  onSeleccion?: (ids: number[]) => void;
  onQuitar: (idx: number) => void;
  editor: (item: GuiaItem, idx: number) => ReactNode;
  clientesTop?: ClienteHit[];
  destinoAutollenadoDe?: (codigo: string) => string | null;
  /** 🔴 Un traslado marcado deja su contenido en Observaciones (2-oct-2026). */
  onLineaDeTraslado?: (linea: string, poner: boolean) => void;
}

export default function EnviosApple({
  items, etiquetas, onReemplazarItems, onSeleccion, onQuitar, editor, clientesTop, destinoAutollenadoDe, onLineaDeTraslado,
}: Props) {
  const [editando, setEditando] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);

  const envios = agruparEnEnvios(etiquetas);
  const porId = new Map(envios.map((v) => [v.envio_id, v]));
  const marcados = new Set(items.map((r) => r.envio_id).filter(Boolean));
  const aMano = items.filter((r) => !r.envio_id);

  const ids = idsDeLosEnviosMarcados(items, envios);
  useEffect(() => {
    onSeleccion?.(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);

  // Un renglón etiquetado que ya no está en la lista de pendientes (raro) se
  // sigue viendo, marcado y sin poder tocarlo: nunca desaparece en silencio.
  const huerfanos = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => (item.envio_id ? !porId.has(item.envio_id) : item.con_etiquetas === true));
  const facturas = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => !item.envio_id && !item.con_etiquetas && (filaTieneDatos(item) || item.uid === editando));

  function alternar(v: Envio) {
    const linea = lineaDeTraslado(v);
    if (marcados.has(v.envio_id)) {
      onReemplazarItems(desmarcarEnvio(items, v));
      if (linea) onLineaDeTraslado?.(linea, false);
    } else if (!envioTomadoPorUnRenglon(aMano, v.filas)) {
      onReemplazarItems(marcarEnvio(items, v));
      if (linea) onLineaDeTraslado?.(linea, true);
    }
  }
  function quitar(idx: number) {
    if (items.length > 1) onQuitar(idx);
    else onReemplazarItems([emptyItem(1)]);
  }

  const tarjeta = (marcado: boolean) =>
    `flex w-full min-h-[64px] items-center gap-3.5 rounded-xl border px-4 py-3 text-left transition ${
      marcado
        ? "border-black ring-1 ring-black"
        : "border-gray-200 hover:border-gray-400"
    }`;
  const circulo = (marcado: boolean) => (
    <span
      aria-hidden="true"
      className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-xs ${
        marcado ? "bg-black text-white" : "border-2 border-gray-300"
      }`}
    >
      {marcado && "✓"}
    </span>
  );

  return (
    <div data-testid="envios-apple">
      <section aria-labelledby="titulo-etiquetados">
        <h2 id="titulo-etiquetados" className={TITULO}>Etiquetados</h2>
        {envios.length === 0 && huerfanos.length === 0 ? (
          <p className="text-sm text-gray-500">{TEXTO_SIN_ETIQUETADOS}</p>
        ) : (
          <ul className="space-y-2.5">
            {envios.map((v) => {
              const marcado = marcados.has(v.envio_id);
              const bloqueado = !marcado && envioTomadoPorUnRenglon(aMano, v.filas);
              return (
                <li key={v.envio_id} data-envio={v.envio_id} data-renglon={marcado ? "etiquetado" : undefined}>
                  <button
                    type="button"
                    aria-pressed={marcado}
                    disabled={bloqueado}
                    onClick={() => alternar(v)}
                    className={`${tarjeta(marcado)} active:scale-[0.99] disabled:cursor-default disabled:opacity-60`}
                  >
                    {circulo(marcado)}
                    <Contenido
                      cliente={v.cliente_nombre}
                      detalle={linea(v.empresa, v.destino, facturasParaMostrar(facturasDelEnvio(v)), contenidoDelTraslado(v) ?? "")}
                      titulo={facturasDelEnvio(v)}
                      bultos={v.total}
                      candado
                      extra={bloqueado && <span className={`mt-1 inline-block ${CHIP}`}>{MOTIVO_FACTURA_EN_RENGLON}</span>}
                    />
                  </button>
                </li>
              );
            })}
            {huerfanos.map(({ item, idx }) => (
              <li key={item.uid ?? idx} data-renglon="etiquetado">
                <div aria-disabled="true" className={tarjeta(true)}>
                  {circulo(true)}
                  <Contenido
                    cliente={item.cliente || "Sin cliente"}
                    detalle={linea(item.empresa, item.direccion, facturasParaMostrar(item.facturas))}
                    titulo={item.facturas}
                    bultos={item.bultos || 0}
                    candado
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titulo-facturas" className="mt-7">
        {facturas.length > 0 && (
          <>
            <h2 id="titulo-facturas" className={TITULO}>
              Facturas <span className={CHIP}>{CHIP_SIN_ETIQUETA}</span>
            </h2>
            <ul className="mb-3 space-y-2.5">
              {facturas.map(({ item, idx }) => {
                const abierto = item.uid === editando;
                const nombre = item.cliente || "Sin cliente";
                return (
                  <li key={item.uid ?? idx} data-renglon="sin-etiqueta">
                    <div className={`${tarjeta(false)} !p-0 !gap-0`}>
                      <button
                        type="button"
                        aria-expanded={abierto}
                        aria-label={`Editar la factura de ${nombre}`}
                        onClick={() => setEditando(abierto ? null : (item.uid ?? null))}
                        className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3.5 py-3 pl-4 text-left"
                      >
                        <Contenido
                          cliente={nombre}
                          detalle={linea(item.empresa, item.direccion, facturasParaMostrar(item.facturas))}
                          titulo={item.facturas}
                          bultos={item.bultos || 0}
                        />
                      </button>
                      <button
                        type="button"
                        aria-label={`Quitar la factura de ${nombre}`}
                        title="Quitar"
                        onClick={() => quitar(idx)}
                        className="mr-1 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                    {abierto && (
                      <div className="mt-2 rounded-xl border border-gray-200 p-4">
                        {editor(item, idx)}
                        <button
                          type="button"
                          onClick={() => setEditando(null)}
                          className="mt-3 inline-flex min-h-[44px] items-center text-sm text-gray-500 transition hover:text-black"
                        >
                          Listo
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <button
          type="button"
          onClick={() => setAgregando((a) => !a)}
          aria-expanded={agregando}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-black px-4 text-sm font-medium transition hover:bg-gray-50 active:scale-[0.97]"
        >
          {BOTON_AGREGAR_FACTURA}
        </button>
        {agregando && (
          <AgregarSinEtiquetas
            items={items}
            etiquetas={etiquetas}
            onReemplazarItems={onReemplazarItems}
            onEditar={setEditando}
            onCerrar={() => setAgregando(false)}
            clientesTop={clientesTop}
            destinoAutollenadoDe={destinoAutollenadoDe}
          />
        )}
      </section>
    </div>
  );
}
