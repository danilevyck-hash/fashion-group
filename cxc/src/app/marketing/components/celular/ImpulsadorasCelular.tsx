"use client";

// ============================================================================
// 6b · IMPULSADORAS EN EL CELULAR: UNA FILA POR PERSONA (24-sep-2026).
//
//   ‹ Marketing                                                           ＋
//   Impulsadoras
//   $800.00 al mes cada una
//                                  28
//                    meses sin pagar · 2 impulsadoras
//   ┌────────────────────────────────────────────────┐
//   │ Ana Trejos      Tommy · debe 24 meses · desde… │ [Pagar]
//   │ Cindy de Gracia Calvin · debe 4 meses · desde… │ [Pagar]
//   └────────────────────────────────────────────────┘
//
// 🔴 «Pagar» ES EL BOTÓN DE LA FILA — lo único que se hace todos los meses. Los
// 24 chips de meses, el historial y «Eliminar» viven ADENTRO, al tocar el
// nombre.
//
// 🩸 La tarjeta de hoy mide 1,2 iPhones por persona: los 24 chips de Ana
// estiran su tarjeta y «Eliminar» —lo destructivo— queda como texto suelto
// debajo de «Ver historial».
//
// 🔴 ACÁ NO SE GUARDA NADA. «Pagar» abre el MISMO `RegistrarPagoModal` con el
// MISMO `mesInicial`, el historial el MISMO modal y «Eliminar» el MISMO
// `ConfirmDeleteModal`: los monta `ImpulsadorasView`, que no cambió de reglas.
// El número grande es la suma de los meses que la propia lista ya trae.
// ============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatearMonto } from "@/lib/marketing/normalizar";
import { etiquetaMes } from "@/lib/marketing/meses";
import { debeEnRojo, lineaDeImpulsadoraCelular } from "@/lib/marketing/celular";
import type { ImpulsadoraConEstado } from "@/lib/marketing/types";
import {
  BotonAncho,
  FilaCelular,
  GrupoCelular,
  NumeroGrande,
  PantallaCelular,
  RotuloDeGrupo,
  TituloCelular,
  VacioCelular,
} from "./PiezasCelular";

interface Props {
  items: ImpulsadoraConEstado[] | null;
  cargando: boolean;
  escribe: boolean;
  onPagar: (i: ImpulsadoraConEstado) => void;
  onHistorial: (i: ImpulsadoraConEstado) => void;
  onEliminar: (i: ImpulsadoraConEstado) => void;
  onNueva: () => void;
  hrefVolver: string;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function ImpulsadorasCelular({
  items,
  cargando,
  escribe,
  onPagar,
  onHistorial,
  onEliminar,
  onNueva,
  hrefVolver,
}: Props) {
  const router = useRouter();
  const [abierta, setAbierta] = useState<ImpulsadoraConEstado | null>(null);

  const lista = (items ?? []).filter((i) => i.activa || (i.mesesSinPagar ?? []).length > 0);
  // El número grande: la suma de los meses que cada fila ya dice deber. No es
  // plata y no se inventa: son los mismos meses de la lista.
  const meses = lista.reduce((s, i) => s + (i.mesesSinPagar ?? []).length, 0);
  const conDeuda = lista.filter((i) => (i.mesesSinPagar ?? []).length > 0).length;
  const mensual = lista[0]?.monto_mensual ?? null;

  const dentro = abierta;

  return (
    <PantallaCelular>
      <div className="px-2 pt-1">
        <button
          type="button"
          onClick={() => (dentro ? setAbierta(null) : router.push(hrefVolver))}
          className="min-h-[44px] px-2 text-[17px] text-blue-600 active:opacity-60"
        >
          {dentro ? "‹ Impulsadoras" : "‹ Marketing"}
        </button>
      </div>

      {dentro ? (
        <DetalleDeLaImpulsadora
          imp={dentro}
          escribe={escribe}
          onPagar={() => onPagar(dentro)}
          onHistorial={() => onHistorial(dentro)}
          onEliminar={() => onEliminar(dentro)}
        />
      ) : (
        <>
          <TituloCelular
            titulo="Impulsadoras"
            detalle={mensual != null ? `${formatearMonto(mensual)} al mes cada una` : undefined}
          />
          <NumeroGrande
            valor={String(meses)}
            detalle={
              <>
                meses sin pagar · <b className="text-gray-900">{plural(conDeuda, "impulsadora", "impulsadoras")}</b>
              </>
            }
          />

          {cargando ? (
            <div className="mx-4 mt-4 h-40 animate-pulse rounded-2xl bg-white" />
          ) : lista.length === 0 ? (
            <VacioCelular>Aún no hay impulsadoras.</VacioCelular>
          ) : (
            <GrupoCelular className="mt-4">
              {lista.map((i) => {
                const debe = (i.mesesSinPagar ?? []).length;
                const primero = (i.mesesSinPagar ?? [])[0];
                return (
                  <FilaCelular
                    key={i.id}
                    data-fila="impulsadora"
                    titulo={i.nombre}
                    detalle={
                      <span className={debeEnRojo(debe) ? "text-red-600" : undefined}>
                        {lineaDeImpulsadoraCelular({
                          marca: i.marcas[0]?.marca.nombre ?? "",
                          debe,
                          desde: primero ? etiquetaMes(primero.mes).toLowerCase() : "",
                        })}
                      </span>
                    }
                    onClick={() => setAbierta(i)}
                    ariaLabel={`Abrir ${i.nombre}`}
                    accion={
                      escribe && debe > 0 ? (
                        <button
                          type="button"
                          onClick={() => onPagar(i)}
                          className="min-h-[44px] rounded-[10px] bg-gray-900 px-4 text-[15px] font-semibold text-white active:scale-[0.97]"
                        >
                          Pagar
                        </button>
                      ) : undefined
                    }
                  />
                );
              })}
            </GrupoCelular>
          )}

          {escribe && (
            <div className="px-4 pt-6">
              <BotonAncho onClick={onNueva}>＋ Nueva impulsadora</BotonAncho>
            </div>
          )}
        </>
      )}
    </PantallaCelular>
  );
}

/** Lo que vive ADENTRO: los meses sin pagar, el historial y «Eliminar». */
function DetalleDeLaImpulsadora({
  imp,
  escribe,
  onPagar,
  onHistorial,
  onEliminar,
}: {
  imp: ImpulsadoraConEstado;
  escribe: boolean;
  onPagar: () => void;
  onHistorial: () => void;
  onEliminar: () => void;
}) {
  const meses = imp.mesesSinPagar ?? [];
  return (
    <>
      <TituloCelular
        titulo={imp.nombre}
        detalle={[
          imp.marcas.map((m) => `${m.marca.nombre} ${m.porcentaje}%`).join(" · ") || "Sin marcas",
          `${formatearMonto(imp.monto_mensual)} al mes`,
        ].join(" · ")}
      />

      {escribe && meses.length > 0 && (
        <div className="px-4 pt-5">
          <BotonAncho onClick={onPagar}>Registrar pago</BotonAncho>
        </div>
      )}

      <RotuloDeGrupo>
        {meses.length === 0 ? "Sin meses pendientes" : `Los meses sin pagar · ${meses.length}`}
      </RotuloDeGrupo>
      {meses.length > 0 && (
        <GrupoCelular className="mt-0">
          {meses.map((m) => (
            <FilaCelular
              key={m.mes}
              data-fila="mes-sin-pagar"
              titulo={etiquetaMes(m.mes)}
              detalle={m.estado === "parcial" ? `a medias · falta ${m.faltan}` : "sin pagar"}
            />
          ))}
        </GrupoCelular>
      )}

      {imp.ultimosPeriodos.length > 0 && (
        <>
          <RotuloDeGrupo>Historial de pagos</RotuloDeGrupo>
          <GrupoCelular className="mt-0">
            <FilaCelular
              data-fila="historial"
              titulo="Ver el historial"
              detalle={imp.ultimosPeriodos.join(" · ")}
              monto="›"
              onClick={onHistorial}
              ariaLabel={`Ver el historial de ${imp.nombre}`}
            />
          </GrupoCelular>
        </>
      )}

      {escribe && (
        <GrupoCelular className="mt-6">
          <li className="border-t border-gray-100 first:border-t-0">
            <button
              type="button"
              onClick={onEliminar}
              className="w-full px-4 py-4 text-left text-[17px] font-medium text-red-600 active:bg-gray-50"
            >
              Eliminar impulsadora
            </button>
          </li>
        </GrupoCelular>
      )}
    </>
  );
}
