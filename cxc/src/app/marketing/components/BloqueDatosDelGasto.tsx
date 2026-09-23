"use client";

// ============================================================================
// EL PASO «DE QUIÉN ES» de la puerta «＋ Gasto» (22-sep-2026, pieza A).
//
// Lo que Daniel definió, en este orden y sin más:
//   · MARCA — UNA, obligatoria, en un desplegable. Si la puerta se abrió
//     desde la página de una marca, viene puesta con «Cambiar» (no se pregunta
//     dos veces). En un pago de impulsadora la marca es LA DE ELLA y se
//     enseña fija: una impulsadora es de una marca (`impulsadoras.ts`).
//   · TIENDA — del directorio (`ClientePicker`, por CÓDIGO, sin salida a
//     mano) o «General». Daniel: *«si es de una tienda [la tienda] es
//     obligatoria»*. Si la puerta se abrió desde una tienda, viene puesta y no
//     se pregunta.
//   · «SE REPORTA A LA MARCA» — casilla PRENDIDA por defecto. Daniel: *«hay
//     gastos o muebles que son para tienda pero no quiero reportar como gastos
//     pero saber que existen»*.
//   · NOTA — qué fue («Apertura», «Remodelación»). Libre y opcional: es lo
//     que queda del proyecto que se fue.
//
// Este bloque solo DIBUJA y avisa (`onChange`); la regla de qué falta vive en
// `lib/marketing/puerta-gasto.ts` y la aplica la puerta al botón Continuar.
// ============================================================================

import { useState } from "react";
import ClientePicker from "@/components/ClientePicker";
import { TIENDA_GENERAL } from "@/lib/marketing/gasto";
import type { DatosDelGasto } from "@/lib/marketing/puerta-gasto";
import type { MkMarca } from "@/lib/marketing/types";

export interface TiendaElegida {
  codigo: string;
  nombre: string;
}

interface Props {
  datos: DatosDelGasto;
  onChange: (siguiente: DatosDelGasto) => void;
  /** Ya ordenadas por la puerta. */
  marcas: MkMarca[];
  /** La marca de la página desde la que se abrió (renglón fijo con «Cambiar»). */
  marcaInicial?: MkMarca | null;
  /** En un pago de impulsadora: la marca de ella, fija. `undefined` = no aplica. */
  marcaDeImpulsadora?: MkMarca | null;
  /** La tienda desde la que se abrió la puerta: viene puesta, no se pregunta. */
  tiendaInicial?: TiendaElegida | null;
}

const CAMPO =
  "w-full rounded-md border border-gray-300 px-3 py-2 min-h-[44px] text-base sm:text-sm focus:border-black focus:outline-none bg-white";

export default function BloqueDatosDelGasto({
  datos,
  onChange,
  marcas,
  marcaInicial = null,
  marcaDeImpulsadora,
  tiendaInicial = null,
}: Props) {
  const [cambiandoMarca, setCambiandoMarca] = useState(false);
  const esImpulsadora = marcaDeImpulsadora !== undefined;
  const marcaElegida = marcas.find((m) => m.id === datos.marcaId) ?? null;
  const marcaFijaVisible =
    !esImpulsadora && !!marcaInicial && !cambiandoMarca && !!marcaElegida;

  const cambiar = (parte: Partial<DatosDelGasto>) => onChange({ ...datos, ...parte });

  return (
    <div className="space-y-5">
      {/* ─── MARCA ─────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="gasto-marca" className="block text-sm font-medium text-gray-700 mb-1">
          Marca<span className="text-red-500 ml-0.5">*</span>
        </label>
        {esImpulsadora ? (
          <div
            data-testid="marca-de-impulsadora"
            className="rounded-md border border-gray-200 bg-gray-50 px-3 min-h-[44px] py-2 text-sm flex items-center"
          >
            {marcaDeImpulsadora ? (
              <span className="text-gray-900 font-medium">{marcaDeImpulsadora.nombre}</span>
            ) : (
              <span className="text-gray-500">Elige a quién le pagas: la marca es la de ella.</span>
            )}
          </div>
        ) : marcaFijaVisible ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 min-h-[44px] py-2">
            <span className="text-sm text-gray-900 font-medium truncate">{marcaElegida!.nombre}</span>
            <button
              type="button"
              onClick={() => setCambiandoMarca(true)}
              className="shrink-0 text-sm text-teal-700 hover:text-teal-900 transition min-h-[44px] -my-2 inline-flex items-center"
            >
              Cambiar
            </button>
          </div>
        ) : marcas.length === 0 ? (
          <p className="text-sm text-gray-500">No hay marcas configuradas.</p>
        ) : (
          <select
            id="gasto-marca"
            name="marca"
            value={datos.marcaId}
            onChange={(e) => cambiar({ marcaId: e.target.value })}
            className={CAMPO}
          >
            <option value="">Elige la marca</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ─── TIENDA o GENERAL ──────────────────────────────────────────── */}
      <div>
        <div className="block text-sm font-medium text-gray-700 mb-1">
          Tienda
          {datos.esDeTienda && !tiendaInicial && <span className="text-red-500 ml-0.5">*</span>}
        </div>
        {tiendaInicial ? (
          <div
            data-testid="tienda-fija"
            className="rounded-md border border-gray-200 bg-gray-50 px-3 min-h-[44px] py-2 text-sm flex items-center gap-2"
          >
            <span className="text-gray-900 font-medium truncate">{tiendaInicial.nombre}</span>
            <span className="text-gray-500 tabular-nums">{tiendaInicial.codigo}</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                data-tienda="tienda"
                aria-pressed={datos.esDeTienda}
                onClick={() => cambiar({ esDeTienda: true })}
                className={`rounded-md border-2 px-3 min-h-[44px] text-sm transition ${
                  datos.esDeTienda
                    ? "border-black bg-gray-50 font-medium"
                    : "border-gray-200 hover:border-gray-400"
                }`}
              >
                De una tienda
              </button>
              <button
                type="button"
                data-tienda="general"
                aria-pressed={!datos.esDeTienda}
                onClick={() => cambiar({ esDeTienda: false })}
                className={`rounded-md border-2 px-3 min-h-[44px] text-sm transition ${
                  !datos.esDeTienda
                    ? "border-black bg-gray-50 font-medium"
                    : "border-gray-200 hover:border-gray-400"
                }`}
              >
                {TIENDA_GENERAL}
              </button>
            </div>
            {datos.esDeTienda && (
              <ClientePicker
                value={datos.tiendaNombre}
                codigo={datos.tiendaCodigo}
                onChange={(nombre, codigo) => cambiar({ tiendaNombre: nombre, tiendaCodigo: codigo })}
                permitirOtro={false}
                placeholder="Busca la tienda…"
                inputClassName={`${CAMPO} pr-16`}
              />
            )}
          </>
        )}
      </div>

      {/* ─── SE REPORTA ────────────────────────────────────────────────── */}
      <div className="rounded-md border border-gray-200 bg-gray-50/60 px-3 py-1">
        <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            name="se-reporta"
            checked={datos.seReporta}
            onChange={(e) => cambiar({ seReporta: e.target.checked })}
            className="accent-black w-4 h-11"
          />
          <span className="text-sm text-gray-800">Se reporta a la marca</span>
        </label>
        {!datos.seReporta && (
          <p className="text-xs text-gray-500 pb-2" data-testid="aviso-no-se-reporta">
            Se guarda y se ve en la tienda, pero no suma ni va al ZIP de la marca.
          </p>
        )}
      </div>

      {/* ─── NOTA ──────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="gasto-nota" className="block text-sm font-medium text-gray-700 mb-1">
          Nota <span className="font-normal text-gray-400">(opcional)</span>
        </label>
        <input
          id="gasto-nota"
          name="nota"
          type="text"
          value={datos.nota}
          onChange={(e) => cambiar({ nota: e.target.value })}
          maxLength={120}
          placeholder="Apertura, Remodelación…"
          className={CAMPO}
        />
      </div>
    </div>
  );
}
