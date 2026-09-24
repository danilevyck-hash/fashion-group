"use client";

// ============================================================================
// 1a · LA PORTADA DE MARKETING EN EL CELULAR: TIENDAS PRIMERO (24-sep-2026).
//
//   ‹ Inicio                                                              ＋
//   Marketing
//   Abierto · lo que irá al próximo ZIP
//                              $59,493.67
//                  5 tiendas · Abierto · Todos
//   ┌──────────────────────────────────────────┐
//   │ General            sin tienda · 21 gastos│  $35,470.80
//   │ Nova Lux, S.A.                 4 gastos  │  $12,649.97
//   └──────────────────────────────────────────┘
//   TAMBIÉN
//   Marcas · Impulsadoras · Mobiliario
//
// 🔴 LA FILA ES NOMBRE + UN MONTO. Daniel, textual: *«ya son datos que veré
// adentro, eso me ensucia la pantalla, no solo aquí sino en todo el sistema»*.
// El desglose por marca que la computadora pone en la línea gris («Tommy
// $8,913.22 · Calvin $3,736.75») no se dibuja: está en la ficha de la tienda.
//
// 🔴 EL NÚMERO GRANDE ES MÁS CHICO que en el dibujo (34 px, `NumeroGrande`):
// Daniel lo pidió así — *«el número grande más chico, que no consuma tanto»*.
//
// 🩸 NINGÚN NÚMERO SE CALCULA ACÁ: las filas, los chips de período y el total
// son EXACTAMENTE los que ya armó `PortadaTiendas` con `periodo-manda.ts`.
// Este archivo solo los escribe distinto.
// ============================================================================

import { useRouter } from "next/navigation";
import {
  PUERTAS_DEL_CELULAR,
  montoCelular,
  subtituloTiendaCelular,
} from "@/lib/marketing/celular";
import { textoDelPieDeTiendas, type ChipDePeriodo } from "@/lib/marketing/periodo-manda";
import { hrefDePestana, type FilaTienda } from "@/lib/marketing/tiendas-y-marcas";
import { HREF_MOBILIARIO } from "@/lib/marketing/tiendas-y-marcas";
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

interface Props {
  /** Las filas YA filtradas por período (las mismas de la computadora). */
  filas: ReadonlyArray<FilaTienda>;
  chips: ReadonlyArray<ChipDePeriodo>;
  periodo: string;
  onPeriodo: (clave: string) => void;
  /** El total del pie de la computadora: la suma de las filas que se ven. */
  total: number;
  cargando: boolean;
  /** `null` = la lectura se cayó. */
  hayDatos: boolean;
  escribe: boolean;
  onRegistrarGasto: () => void;
}

export default function TiendasCelular({
  filas,
  chips,
  periodo,
  onPeriodo,
  total,
  cargando,
  hayDatos,
  escribe,
  onRegistrarGasto,
}: Props) {
  const router = useRouter();

  return (
    <PantallaCelular>
      <TituloCelular
        titulo="Marketing"
        detalle={textoDelPieDeTiendas(periodo, chips, filas.length)}
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

      <NumeroGrande valor={montoCelular(total)} />

      {chips.length > 0 && (
        <ChipsDePeriodoCelular chips={chips} elegido={periodo} onElegir={onPeriodo} etiqueta="Elegir el período" />
      )}

      {cargando ? (
        <div className="mx-4 mt-3 h-52 animate-pulse rounded-2xl bg-white" />
      ) : !hayDatos ? (
        <VacioCelular>No se pudo cargar la lista de tiendas. Revisa tu conexión.</VacioCelular>
      ) : filas.length === 0 ? (
        <VacioCelular>Nada abierto: todo lo registrado ya se le pasó a la marca.</VacioCelular>
      ) : (
        <GrupoCelular>
          {filas.map((f) => (
            <FilaCelular
              key={f.codigo ?? "general"}
              data-fila="tienda"
              titulo={f.nombre}
              detalle={subtituloTiendaCelular(f)}
              monto={montoCelular(f.total)}
              href={f.href}
              ariaLabel={`Abrir ${f.nombre}`}
            />
          ))}
        </GrupoCelular>
      )}

      <RotuloDeGrupo>También</RotuloDeGrupo>
      <GrupoCelular className="mt-0">
        {PUERTAS_DEL_CELULAR.map((p) => (
          <FilaCelular
            key={p.clave}
            data-fila={`puerta-${p.clave}`}
            titulo={p.titulo}
            detalle={p.detalle}
            monto="›"
            onClick={() =>
              router.push(p.clave === "mobiliario" ? HREF_MOBILIARIO : hrefDePestana(p.clave))
            }
            ariaLabel={`Abrir ${p.titulo}`}
          />
        ))}
      </GrupoCelular>
    </PantallaCelular>
  );
}
