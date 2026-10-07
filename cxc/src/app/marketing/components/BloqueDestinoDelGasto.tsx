"use client";

// ============================================================================
// Marketing › la puerta «Registrar gasto» — SE COBRA A (6-oct-2026)
//
// 🔴 DOS CAMPOS, SIN FRASES. Daniel, al ver el mockup: «porque no termino ERP
// yaaa». Los rótulos son sustantivos cortos y estándar (docs/nombres-erp.md:
// «Rótulos de formulario: sustantivo, nunca preguntas»):
//
//   · **Se cobra a** — UNA lista con las marcas y, al final, «A cargo de la
//     empresa». Reemplaza al viejo «Marca» y al «A quién se le pasa»: son la
//     misma pregunta y ahora es UN solo campo.
//   · **Porcentaje** — 100 % o 50 %. Sale SOLO si se eligió una marca, y nace
//     en 100 %, que es lo más común.
//
// 🔴 NADA QUE ESCRIBIR Y NINGUNA EMPRESA QUE ELEGIR. Daniel, textual: «eso no
// debe de importar, lo asumo y ya. No debes dividirlo ni nada. Solo que algunas
// se registran para cobrar la mitad y algunas muy pocas no, como el caso de la
// barra». No hay campo de monto, no hay selector de empresa y no se reparte
// entre dos marcas.
//
// 🔴 SIN LÍNEA EXPLICATIVA. Con los dos campos ya se entiende; una frase abajo
// sería ruido (docs/diseno.md: «sin párrafos explicativos»).
//
// 🔴 EL AVISO DE DOBLE COBRO se queda: si el proveedor de la compra es la marca
// a la que se le cobra, hay que mirarlo antes de guardar. AVISA, no bloquea.
// ============================================================================

import { useMemo } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { ENLACE } from "@/lib/marketing/marketing-2026-10";
import {
  CUANTO_POR_OMISION,
  CUANTO_SE_COBRA,
  ROTULO_A_CARGO_EMPRESA,
  ROTULO_CUANTO,
  ROTULO_SE_COBRA,
  ROTULO_SE_COBRA_A,
  VALOR_A_CARGO_EMPRESA,
  esCuantoSeCobra,
  type CuantoSeCobra,
} from "@/lib/marketing/proveedores-2026-10";
import { avisoDeDobleCobro } from "@/lib/marketing/doble-cobro";
import type { MkMarca } from "@/lib/marketing/types";

const CAMPO =
  "w-full rounded-md border border-gray-300 px-3 min-h-[44px] py-2 text-base sm:text-sm text-gray-900 focus:border-black focus:outline-none bg-white";

/** Lo que la puerta lleva encima de lo de siempre. */
export interface DestinoDelGasto {
  /** `true` = no se le cobra a ninguna marca. */
  aCargoDeLaEmpresa: boolean;
  /** Completo o Mitad. 🔴 Sin números: el porcentaje vive solo en la base. */
  cuanto: CuantoSeCobra;
}

export function destinoInicial(): DestinoDelGasto {
  return { aCargoDeLaEmpresa: false, cuanto: CUANTO_POR_OMISION };
}

interface Props {
  valor: DestinoDelGasto;
  onChange: (v: DestinoDelGasto) => void;
  /** La marca elegida. "" = todavía no eligió. */
  marcaId: string;
  onMarcaId: (id: string) => void;
  marcas: MkMarca[];
  /** La marca que vino puesta de la página desde la que se abrió la puerta. */
  marcaFija?: MkMarca | null;
  /**
   * 🔴 «Cambiar» sobre la marca fija (6-oct-2026, mismo trato que el renglón
   * de marca de siempre): sin esto, quien abre la puerta desde la página de
   * una marca no podría escoger «A cargo de la empresa» ni otra marca.
   * `undefined` = no se ofrece el enlace (la marca queda fija de verdad).
   */
  onCambiarMarcaFija?: () => void;
  /** Lo que se escribió de proveedor, para el aviso de doble cobro. */
  proveedor?: string;
}

export default function BloqueDestinoDelGasto({
  valor,
  onChange,
  marcaId,
  onMarcaId,
  marcas,
  marcaFija = null,
  onCambiarMarcaFija,
  proveedor = "",
}: Props) {
  // El valor del único desplegable: la marca, o el centinela de la empresa.
  const seCobraA = valor.aCargoDeLaEmpresa ? VALOR_A_CARGO_EMPRESA : marcaId;

  const aviso = useMemo(() => {
    const nombre = marcas.find((m) => m.id === marcaId)?.nombre ?? marcaFija?.nombre ?? "";
    if (nombre.length === 0 || valor.aCargoDeLaEmpresa) return null;
    return avisoDeDobleCobro({ proveedorDeLaCompra: proveedor, marcaCobrada: nombre });
  }, [marcas, marcaId, marcaFija, proveedor, valor.aCargoDeLaEmpresa]);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="gasto-se-cobra-a" className="mb-1 block text-sm font-medium text-gray-700">
          {ROTULO_SE_COBRA_A}
        </label>
        {marcaFija && !valor.aCargoDeLaEmpresa ? (
          <div className="flex min-h-[44px] items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <span className="truncate text-sm font-medium text-gray-900">{marcaFija.nombre}</span>
            {onCambiarMarcaFija && (
              <button
                type="button"
                onClick={onCambiarMarcaFija}
                className={`shrink-0 text-sm transition min-h-[44px] -my-2 inline-flex items-center ${ENLACE}`}
              >
                Cambiar
              </button>
            )}
          </div>
        ) : (
          <select
            id="gasto-se-cobra-a"
            name="seCobraA"
            value={seCobraA}
            onChange={(e) => {
              const v = e.target.value;
              if (v === VALOR_A_CARGO_EMPRESA) {
                onMarcaId("");
                onChange({ ...valor, aCargoDeLaEmpresa: true });
                return;
              }
              onMarcaId(v);
              onChange({ ...valor, aCargoDeLaEmpresa: false });
            }}
            className={CAMPO}
          >
            <option value="">Seleccionar…</option>
            {marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
            <option value={VALOR_A_CARGO_EMPRESA}>{ROTULO_A_CARGO_EMPRESA}</option>
          </select>
        )}
      </div>

      {/* 🔴 «Se cobra» SOLO con una marca elegida: a cargo de la empresa no hay
          nada que cobrar. Sin porcentajes — Daniel: «es o le cobro la mitad a
          la marca, o todo, o nada». */}
      {!valor.aCargoDeLaEmpresa && (marcaId !== "" || marcaFija) && (
        <div>
          <label htmlFor="gasto-cuanto" className="mb-1 block text-sm font-medium text-gray-700">
            {ROTULO_SE_COBRA}
          </label>
          <select
            id="gasto-cuanto"
            name="cuanto"
            value={valor.cuanto}
            onChange={(e) => {
              const c = e.target.value;
              if (esCuantoSeCobra(c)) onChange({ ...valor, cuanto: c });
            }}
            className={`${CAMPO} max-w-[12rem]`}
          >
            {CUANTO_SE_COBRA.map((c) => (
              <option key={c} value={c}>
                {ROTULO_CUANTO[c]}
              </option>
            ))}
          </select>
        </div>
      )}

      {aviso && (
        <Aviso tono="aviso" testId="aviso-doble-cobro">
          {aviso.mensaje}
        </Aviso>
      )}
    </div>
  );
}
