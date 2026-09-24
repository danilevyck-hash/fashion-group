"use client";

// ============================================================================
// 2a · 8a · 9a — LA FICHA DE LA TIENDA EN EL CELULAR (24-sep-2026).
//
//   ‹ Marketing                                                           ＋
//   Outlet Duty Free N3
//   D-118 · Abierto · Tommy $1,040.25 · Calvin $731.02
//                              $1,771.27
//                        2 gastos · irán al próximo ZIP
//   [Abierto] [mid 2026 · PVH] [Todos]
//   ┌──────────────────────────────────────────────┐
//   │ Impresora Comercial · Remodelación           │  $1,040.25
//   │ 21 sep · Tommy · factura 0000065466          │
//   └──────────────────────────────────────────────┘
//
// 🔴 DOS RENGLONES POR GASTO, CON EL MONTO A LA VISTA (2a). 🩸 En la tabla de
// hoy el monto de cada gasto empieza en el píxel 537 de una pantalla de 390:
// se ve QUÉ es el gasto o CUÁNTO vale, nunca las dos cosas, y el «···» de
// Editar y Eliminar está a casi una pantalla de arrastre.
//
// 🔴 «GENERAL» PLIEGA SUS PAGOS DE IMPULSADORA EN UN RENGLÓN Y NO DICE EL
// NÚMERO DE FACTURA EN LA FILA (8a). De los 21 gastos de General, 17 son el
// mismo pago de $800.00 repetido mes a mes.
//
// 🔴 CON «TODOS», EL PERÍODO ES EL TÍTULO DEL GRUPO, CON SU SUBTOTAL (9a). Son
// los MISMOS bloques y los MISMOS subtotales de la computadora
// (`bloquesPorPeriodo`): acá no se suma nada.
//
// 🔴 TOCAR UN GASTO ABRE SUS ACCIONES — las MISMAS del «···» de la tabla (ver
// el PDF, editar, eliminar), decididas por quien monta esta pantalla.
// ============================================================================

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { OverflowMenuItem } from "@/components/ui/OverflowMenu";
import { formatearMonto } from "@/lib/marketing/normalizar";
import {
  esFichaGeneral,
  fichaGeneralCelular,
  montoCelular,
  renglonDeGastoCelular,
} from "@/lib/marketing/celular";
import {
  PERIODO_TODOS,
  cabeceraDelBloque,
  type BloqueDePeriodo,
  type ChipDePeriodo,
} from "@/lib/marketing/periodo-manda";
import type { FilaDeTienda } from "@/lib/marketing/vista-tienda";
import {
  FilaCelular,
  GrupoCelular,
  NumeroGrande,
  PantallaCelular,
  RotuloDeGrupo,
  TituloCelular,
  VacioCelular,
} from "./PiezasCelular";
import ChipsDePeriodoCelular from "./ChipsDePeriodoCelular";
import HojaDeAcciones from "./HojaDeAcciones";

interface Props {
  titulo: string;
  /** «D-118 · Abierto · Tommy $1,040.25 · Calvin $731.02». */
  subtitulo: string;
  /** El total de la pantalla: el MISMO `pie.total` de la computadora. */
  total: number;
  textoPie: string;
  chips: ReadonlyArray<ChipDePeriodo>;
  periodo: string;
  onPeriodo: (clave: string) => void;
  /** Las filas del período elegido, ya ordenadas. */
  visibles: ReadonlyArray<FilaDeTienda>;
  /** Los bloques de «Todos», los mismos de la computadora. */
  bloques: ReadonlyArray<BloqueDePeriodo<FilaDeTienda>>;
  cargando: boolean;
  aviso: string | null;
  escribe: boolean;
  onRegistrarGasto: () => void;
  /** Las acciones de un gasto: las MISMAS del «···». */
  accionesDe: (f: FilaDeTienda) => OverflowMenuItem[];
  /** Abre el PDF de la factura, si lo tiene. */
  onPdf: (f: FilaDeTienda) => void;
  /** Las fotos de la tienda, tal cual (13b vive dentro de `FotosSection`). */
  fotos?: React.ReactNode;
  hrefVolver: string;
}

export default function FichaTiendaCelular({
  titulo,
  subtitulo,
  total,
  textoPie,
  chips,
  periodo,
  onPeriodo,
  visibles,
  bloques,
  cargando,
  aviso,
  escribe,
  onRegistrarGasto,
  accionesDe,
  onPdf,
  fotos,
  hrefVolver,
}: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<FilaDeTienda | null>(null);
  const [verPagos, setVerPagos] = useState(false);

  const esGeneral = esFichaGeneral(titulo);
  const enTodos = periodo === PERIODO_TODOS;

  // 8a — en «General» los pagos de impulsadora van en UN renglón que se abre.
  // El total del grupo es la suma de esos MISMOS renglones.
  const general = useMemo(
    () => (esGeneral && !enTodos ? fichaGeneralCelular(visibles) : null),
    [esGeneral, enTodos, visibles],
  );

  const renglon = (f: FilaDeTienda, apagada: boolean) => {
    const r = renglonDeGastoCelular(f, { sinNumeroDeFactura: esGeneral });
    return (
      <FilaCelular
        key={f.id}
        data-fila="gasto"
        titulo={r.titulo}
        detalle={r.detalle}
        monto={r.monto}
        tono={apagada || !f.seReporta ? "apagado" : "normal"}
        onClick={() => setAbierto(f)}
        ariaLabel={`Abrir ${r.titulo}`}
      />
    );
  };

  return (
    <PantallaCelular>
      <div className="flex items-center justify-between px-2 pt-1">
        <button
          type="button"
          onClick={() => router.push(hrefVolver)}
          className="min-h-[44px] px-2 text-[17px] text-blue-600 active:opacity-60"
        >
          ‹ Marketing
        </button>
        {escribe && (
          <button
            type="button"
            onClick={onRegistrarGasto}
            aria-label="Registrar un gasto"
            className="grid h-11 w-11 place-items-center rounded-full text-[30px] font-light leading-none text-blue-600 active:opacity-60"
          >
            ＋
          </button>
        )}
      </div>

      <TituloCelular titulo={titulo} detalle={subtitulo} />
      <NumeroGrande valor={montoCelular(total)} detalle={textoPie} />

      {chips.length > 0 && (
        <ChipsDePeriodoCelular chips={chips} elegido={periodo} onElegir={onPeriodo} etiqueta="Elegir el período" />
      )}

      {cargando ? (
        <div className="mx-4 mt-4 h-48 animate-pulse rounded-2xl bg-white" />
      ) : aviso ? (
        <VacioCelular>{aviso}</VacioCelular>
      ) : enTodos ? (
        // 9a — el período es el título del grupo, con su subtotal.
        bloques.map((b) => (
          <div key={b.clave}>
            <RotuloDeGrupo>
              {cabeceraDelBloque(b)} · {formatearMonto(b.total)}
            </RotuloDeGrupo>
            <GrupoCelular className="mt-0">{b.gastos.map((f) => renglon(f, b.cerrado))}</GrupoCelular>
          </div>
        ))
      ) : general ? (
        <GrupoCelular className="mt-4">
          {general.sueltas.map((f) => renglon(f, false))}
          {general.grupo && (
            <FilaCelular
              data-fila="pagos-de-impulsadora"
              titulo={`Pagos de impulsadora · ${general.grupo.cantidad}`}
              detalle={general.grupo.detalle}
              monto={montoCelular(general.grupo.total)}
              pie={verPagos ? "ocultar" : `ver los ${general.grupo.cantidad}`}
              onClick={() => setVerPagos((v) => !v)}
              ariaLabel="Ver los pagos de impulsadora"
            />
          )}
          {general.grupo && verPagos && general.grupo.filas.map((f) => renglon(f, false))}
        </GrupoCelular>
      ) : (
        <GrupoCelular className="mt-4">{visibles.map((f) => renglon(f, false))}</GrupoCelular>
      )}

      {fotos && <div className="px-4 pt-6">{fotos}</div>}

      {abierto && (
        <HojaDeAcciones
          titulo={renglonDeGastoCelular(abierto, { sinNumeroDeFactura: esGeneral }).titulo}
          opciones={[
            ...(abierto.tipo !== "mueble" && abierto.tienePdf
              ? [{ label: "Ver el PDF de la factura", onClick: () => onPdf(abierto) }]
              : []),
            ...accionesDe(abierto),
          ]}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </PantallaCelular>
  );
}
