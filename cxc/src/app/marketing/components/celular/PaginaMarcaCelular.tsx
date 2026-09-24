"use client";

// ============================================================================
// 3a · LA PÁGINA DE UNA MARCA EN EL CELULAR (24-sep-2026).
//
//   ‹ Marcas                                                              ＋
//   Tommy Hilfiger
//   Período 2026 · abierto · 17 gastos
//                             $22,571.23
//                lo que irá al próximo ZIP · 2 gastos sin foto
//   [   Bajar ZIP   ]  [  Cerrar período  ]
//   ┌──────────────────────────────────────────┐
//   │ General                       12 gastos  │  $12,617.76
//   │ Nova Lux, S.A.                 4 gastos  │   $8,913.22
//   └──────────────────────────────────────────┘
//   CERRADOS
//
// 🩸 Hasta el 24-sep-2026 el nombre del período salía UNA LETRA POR RENGLÓN:
// «Período 2026» medía 5 px de ancho por 248 de alto, y «mid 2026 · PVH»,
// 0 × 248 — el chip, el monto, ZIP y Cerrar eran `shrink-0` y al título le
// quedaban 5 px. El parche del 24-sep hizo que la fila envolviera; esto es la
// pantalla como debería ser.
//
// 🔴 ZIP Y CERRAR SON DOS BOTONES ANCHOS, al alcance del pulgar. Son los
// MISMOS: `bajarZipMarca` y `CerrarPeriodoModal`, con sus mismas reglas —acá
// no se cierra nada distinto—.
//
// 🔴 EL NÚMERO GRANDE ES EL TOTAL DEL PERÍODO ABIERTO, el mismo `s.total` que
// dibuja la fila de la computadora. Acá no se suma nada, y en particular no se
// suman marcas entre sí: esta pantalla es de UNA marca.
// ============================================================================

import { useRouter } from "next/navigation";
import { formatearFecha } from "@/lib/marketing/normalizar";
import { montoCelular, subtituloMarcaCelular } from "@/lib/marketing/celular";
import { textoParteDeLaMarca } from "@/lib/marketing/cerrados-por-periodo";
import type { SeccionPeriodo } from "@/lib/marketing/lista-por-periodo";
import { hrefDePestana, type TiendaDeSeccion } from "@/lib/marketing/tiendas-y-marcas";
import {
  AvisoCelular,
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
  marca: { key: string; nombre: string; slug: string };
  secciones: ReadonlyArray<SeccionPeriodo>;
  escribe: boolean;
  /** Cuántos gastos del período abierto no tienen foto. */
  sinFoto: number;
  bajando: string | null;
  onZip: (periodoId?: string) => void;
  onCerrar: () => void;
  puedeCerrar: boolean;
  onRegistrarGasto: () => void;
  onAbrirCerrado: (slug: string) => void;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function PaginaMarcaCelular({
  marca,
  secciones,
  escribe,
  sinFoto,
  bajando,
  onZip,
  onCerrar,
  puedeCerrar,
  onRegistrarGasto,
  onAbrirCerrado,
}: Props) {
  const router = useRouter();
  const abierta = secciones.find((s) => s.estado === "abierto") ?? null;
  const cerradas = secciones.filter((s) => s.estado !== "abierto");
  const gastos = abierta ? abierta.docs.facturas + abierta.docs.muebles : 0;
  const tiendas: ReadonlyArray<TiendaDeSeccion> = abierta?.tiendas ?? [];

  return (
    <PantallaCelular>
      <div className="flex items-center justify-between px-2 pt-1">
        <button
          type="button"
          onClick={() => router.push(hrefDePestana("marcas"))}
          className="min-h-[44px] px-2 text-[17px] text-blue-600 active:opacity-60"
        >
          ‹ Marcas
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

      <TituloCelular
        titulo={marca.nombre}
        detalle={
          abierta ? `${abierta.nombre} · abierto · ${subtituloMarcaCelular({ gastos })}` : "Sin período abierto"
        }
      />

      {abierta && (
        <NumeroGrande
          valor={gastos > 0 ? montoCelular(abierta.total) : "—"}
          detalle={
            gastos > 0
              ? `lo que irá al próximo ZIP${sinFoto > 0 ? ` · ${plural(sinFoto, "gasto sin foto", "gastos sin foto")}` : ""}`
              : "Todavía no hay gasto en este período"
          }
        />
      )}

      {abierta && sinFoto > 0 && (
        <AvisoCelular>
          {plural(sinFoto, "gasto sin foto", "gastos sin foto")}. Se pueden agregar después de cerrar.
        </AvisoCelular>
      )}

      {escribe && abierta && (
        <div className="flex gap-3 px-4 pt-5">
          {gastos > 0 && (
            <div className="flex-1">
              <BotonAncho tono="blanco" onClick={() => onZip()} disabled={bajando === `${marca.key}:abierto`}>
                {bajando === `${marca.key}:abierto` ? "Armando…" : "Bajar ZIP"}
              </BotonAncho>
            </div>
          )}
          {puedeCerrar && (
            <div className="flex-1">
              <BotonAncho onClick={onCerrar}>Cerrar período</BotonAncho>
            </div>
          )}
        </div>
      )}

      {abierta &&
        (tiendas.length === 0 ? (
          <VacioCelular>Todavía no hay gasto en este período.</VacioCelular>
        ) : (
          <GrupoCelular className="mt-5">
            {tiendas.map((t) => (
              <FilaCelular
                key={t.codigo ?? "general"}
                data-fila="tienda-de-la-marca"
                titulo={t.nombre}
                detalle={plural(t.gastos, "gasto", "gastos")}
                monto={montoCelular(t.monto)}
                href={t.href}
                ariaLabel={`Abrir ${t.nombre}`}
              />
            ))}
          </GrupoCelular>
        ))}

      {cerradas.length > 0 && (
        <>
          <RotuloDeGrupo>Cerrados · {cerradas.length}</RotuloDeGrupo>
          <GrupoCelular className="mt-0">
            {cerradas.map((s) => (
              <FilaCelular
                key={s.key}
                data-fila="periodo-cerrado"
                titulo={s.compartido?.proveedorNombre ? `${s.nombre} · ${s.compartido.proveedorNombre}` : s.nombre}
                detalle={[
                  s.cerradoEn ? `cerrado el ${formatearFecha(s.cerradoEn)}` : "",
                  s.compartido ? textoParteDeLaMarca(marca.nombre, s.compartido.otrasMarcas) : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                monto={montoCelular(s.total)}
                onClick={() => onAbrirCerrado(s.slug)}
                ariaLabel={`Abrir ${s.nombre}`}
              />
            ))}
          </GrupoCelular>
        </>
      )}
    </PantallaCelular>
  );
}
