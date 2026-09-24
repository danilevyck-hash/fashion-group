"use client";

// ============================================================================
// 7b · MOBILIARIO EN EL CELULAR: UNA FILA POR PRODUCTO (24-sep-2026).
//
//   ‹ Marketing                                                          ···
//   Mobiliario
//   6 productos · 13 tiendas con muebles
//                                  18
//                    piezas en bodega · $324.00
//   ┌────────────────────────────────────────────┐
//   │ [foto] Barra plana        $18.00 c/u       │  18  en bodega
//   └────────────────────────────────────────────┘
//   POR TIENDA · 13
//
// 🔴 LA FILA ES EL PRODUCTO, SU PRECIO Y LO QUE QUEDA EN BODEGA. Daniel pidió
// la foto pequeña —*«tocarla la abre grande»*— y 🔴 SIN el «entregadas 543 de
// 561»: *«eso va adentro»*. Comprado, entregado y disponible se ven al tocar
// la fila, y en la computadora siguen en su tabla.
//
// 🔴 EDITAR Y BORRAR SALEN DEL PULGAR: se deslizan (`SwipeableRow`), como en
// el resto del sistema. 🩸 Hoy los dos botones son del mismo tamaño y el rojo
// está a la derecha, donde cae el dedo.
//
// 🔴 EL RESUMEN POR TIENDA ES UNA LISTA: nombre + total, con el total al pie.
// 🩸 Hoy son 13 tarjetas de 12 renglones cada una — 4,6 pantallas.
// ⚠️ Ese total del pie SUMA LAS TRES MARCAS ENTRE SÍ, que es lo contrario de
// la regla del módulo. Queda ANOTADO, no cambiado: Daniel ya dijo que
// Mobiliario por dentro no se toca.
//
// 🔴 NINGÚN NÚMERO SE CALCULA ACÁ: productos, entregas, métricas y el resumen
// por tienda llegan armados de la página, que no cambió una cuenta.
// ============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SwipeableRow } from "@/components/ui";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { montoCelular, subtituloProductoCelular, subtituloTiendaMobiliarioCelular } from "@/lib/marketing/celular";
import type { MkInventarioProducto, MkMarca } from "@/lib/marketing/types";
import {
  FilaCelular,
  GrupoCelular,
  NumeroGrande,
  PantallaCelular,
  RotuloDeGrupo,
  TituloCelular,
  VacioCelular,
} from "./PiezasCelular";
import HojaDeAcciones from "./HojaDeAcciones";

/** Una fila del resumen por tienda, tal como la arma `resumirPorTienda`. */
export interface FilaResumenTienda {
  tienda: string;
  tiendaCodigo: string | null;
  totalPaneles: number;
  montoPorMarca: Record<string, number>;
  totalMonto: number;
}

interface Props {
  productos: ReadonlyArray<MkInventarioProducto>;
  /** Cuántas piezas se entregaron de cada producto. */
  entregadoPorProducto: ReadonlyMap<string, number>;
  metricas: { enBodega: number; entregado: number; tiendas: number };
  resumenFilas: ReadonlyArray<FilaResumenTienda>;
  resumenMarcas: ReadonlyArray<MkMarca>;
  totalResumen: { totalPaneles: number; montoPorMarca: Record<string, number>; totalMonto: number };
  cargando: boolean;
  escribe: boolean;
  esAdmin: boolean;
  onEditar: (p: MkInventarioProducto) => void;
  onBorrar: (p: MkInventarioProducto) => void;
  onNuevo: () => void;
  onExcel: () => void;
  /** La ficha de la tienda, para que cada renglón del resumen lleve a ella. */
  hrefDeTienda: (codigo: string) => string;
  /**
   * 🔴 EL NOMBRE DE LA TIENDA SALE DEL DIRECTORIO, por código — la MISMA regla
   * del 23-sep-2026 que ya aplica la tabla de la computadora. Sin código o sin
   * lectura, el texto del proyecto de siempre (falla ABIERTA).
   */
  nombreDeTienda: (f: FilaResumenTienda) => string;
}

/** Cuántas tiendas se ven antes del «Ver las N»: el resto se despliega. */
const TIENDAS_A_LA_VISTA = 5;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function MobiliarioCelular({
  productos,
  entregadoPorProducto,
  metricas,
  resumenFilas,
  resumenMarcas,
  totalResumen,
  cargando,
  escribe,
  esAdmin,
  onEditar,
  onBorrar,
  onNuevo,
  onExcel,
  hrefDeTienda,
  nombreDeTienda,
}: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<MkInventarioProducto | null>(null);
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [todasLasTiendas, setTodasLasTiendas] = useState(false);

  const piezasEnBodega = productos.reduce((s, p) => s + Number(p.stock_total), 0);
  const tiendas = todasLasTiendas ? resumenFilas : resumenFilas.slice(0, TIENDAS_A_LA_VISTA);

  if (abierto) {
    const entregado = entregadoPorProducto.get(abierto.id) ?? 0;
    const comprado = entregado + Number(abierto.stock_total);
    return (
      <PantallaCelular>
        <div className="px-2 pt-1">
          <button
            type="button"
            onClick={() => setAbierto(null)}
            className="min-h-[44px] px-2 text-[17px] text-blue-600 active:opacity-60"
          >
            ‹ Mobiliario
          </button>
        </div>
        <TituloCelular titulo={abierto.nombre} detalle={subtituloProductoCelular(abierto.precio)} />
        {abierto.foto_url && (
          <div className="px-4 pt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={abierto.foto_url}
              alt={abierto.nombre}
              className="mx-auto max-h-64 rounded-2xl object-contain"
            />
          </div>
        )}
        <GrupoCelular className="mt-5">
          <FilaCelular titulo="Comprado" monto={String(comprado)} />
          <FilaCelular titulo="Entregado" monto={String(entregado)} />
          <FilaCelular titulo="En bodega" monto={String(abierto.stock_total)} />
          <FilaCelular titulo="Valor" monto={formatearMonto(Number(abierto.precio) * Number(abierto.stock_total))} />
        </GrupoCelular>
        {escribe && (
          <GrupoCelular className="mt-6">
            <FilaCelular titulo="Editar el producto" monto="›" onClick={() => onEditar(abierto)} />
            {esAdmin && (
              <li className="border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => onBorrar(abierto)}
                  className="w-full px-4 py-4 text-left text-[17px] font-medium text-red-600 active:bg-gray-50"
                >
                  Borrar el producto
                </button>
              </li>
            )}
          </GrupoCelular>
        )}
      </PantallaCelular>
    );
  }

  return (
    <PantallaCelular>
      <div className="flex items-center justify-between px-2 pt-1">
        <button
          type="button"
          onClick={() => router.push("/marketing")}
          className="min-h-[44px] px-2 text-[17px] text-blue-600 active:opacity-60"
        >
          ‹ Marketing
        </button>
        <button
          type="button"
          onClick={() => setMenu(true)}
          aria-label="Más opciones"
          className="grid h-11 w-11 place-items-center rounded-full text-[22px] leading-none text-blue-600 active:opacity-60"
        >
          ···
        </button>
      </div>

      <TituloCelular
        titulo="Mobiliario"
        detalle={`${plural(productos.length, "producto", "productos")} · ${plural(metricas.tiendas, "tienda con muebles", "tiendas con muebles")}`}
      />
      <NumeroGrande
        valor={String(piezasEnBodega)}
        detalle={
          <>
            piezas en bodega · <b className="text-gray-900">{montoCelular(metricas.enBodega)}</b>
          </>
        }
      />

      {cargando ? (
        <div className="mx-4 mt-4 h-48 animate-pulse rounded-2xl bg-white" />
      ) : productos.length === 0 ? (
        <VacioCelular>No hay productos. Agrega el primero.</VacioCelular>
      ) : (
        <GrupoCelular className="mt-4">
          {productos.map((p) => {
            const fila = (
              <FilaCelular
                data-fila="producto"
                titulo={p.nombre}
                detalle={subtituloProductoCelular(p.precio)}
                monto={String(p.stock_total)}
                pie="en bodega"
                tono={Number(p.stock_total) > 0 ? "normal" : "apagado"}
                onClick={() => setAbierto(p)}
                ariaLabel={`Abrir ${p.nombre}`}
                foto={
                  <span className="block h-11 w-11 shrink-0 overflow-hidden rounded-[10px] bg-gray-100">
                    {p.foto_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={p.foto_url}
                        alt={p.nombre}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFotoGrande(p.foto_url);
                        }}
                      />
                    ) : null}
                  </span>
                }
              />
            );
            if (!escribe) return <span key={p.id}>{fila}</span>;
            return (
              <SwipeableRow
                key={p.id}
                rightAction={{ label: "Editar", color: "bg-blue-600", onAction: () => onEditar(p) }}
                leftAction={
                  esAdmin ? { label: "Borrar", color: "bg-red-600", onAction: () => onBorrar(p) } : undefined
                }
              >
                {fila}
              </SwipeableRow>
            );
          })}
        </GrupoCelular>
      )}

      <RotuloDeGrupo>Por tienda · {resumenFilas.length}</RotuloDeGrupo>
      {resumenFilas.length === 0 ? (
        <VacioCelular>Aún no hay entregas registradas.</VacioCelular>
      ) : (
        <GrupoCelular className="mt-0">
          {tiendas.map((f) => (
            <FilaCelular
              key={f.tienda}
              data-fila="tienda-mobiliario"
              titulo={nombreDeTienda(f)}
              detalle={subtituloTiendaMobiliarioCelular(f.totalPaneles)}
              monto={montoCelular(f.totalMonto)}
              href={f.tiendaCodigo ? hrefDeTienda(f.tiendaCodigo) : undefined}
              ariaLabel={`Abrir ${nombreDeTienda(f)}`}
            />
          ))}
          {!todasLasTiendas && resumenFilas.length > TIENDAS_A_LA_VISTA && (
            <li className="border-t border-gray-100">
              <button
                type="button"
                onClick={() => setTodasLasTiendas(true)}
                className="w-full px-4 py-4 text-left text-[17px] font-medium text-blue-600 active:bg-gray-50"
              >
                Ver las {resumenFilas.length} tiendas
              </button>
            </li>
          )}
          {/* ⚠️ Este total suma las tres marcas entre sí. Queda como está: es
              el MISMO número del pie de la computadora. */}
          <FilaCelular
            data-fila="total-mobiliario"
            titulo="Total"
            detalle={`${plural(totalResumen.totalPaneles, "panel", "paneles")}${
              resumenMarcas.length > 0
                ? ` · ${resumenMarcas
                    .map((m) => `${m.nombre} ${montoCelular(totalResumen.montoPorMarca[m.id] ?? 0)}`)
                    .join(" · ")}`
                : ""
            }`}
            monto={montoCelular(totalResumen.totalMonto)}
          />
        </GrupoCelular>
      )}

      {menu && (
        <HojaDeAcciones
          titulo="Mobiliario"
          opciones={[
            { label: "Descargar Excel", onClick: onExcel },
            ...(escribe ? [{ label: "＋ Agregar producto", onClick: onNuevo }] : []),
          ]}
          onCerrar={() => setMenu(false)}
        />
      )}

      {fotoGrande && (
        <button
          type="button"
          aria-label="Cerrar la foto"
          onClick={() => setFotoGrande(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-6"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoGrande} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      )}
    </PantallaCelular>
  );
}
