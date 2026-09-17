"use client";

// Lo que la fila de totales dice en LAS DOS pantallas de Plantilla Switch
// (17-sep-2026). Una sola pieza, montada por `ReebokClient` y por
// `DepuradorClient`: si el rótulo cambia, cambia en las dos.
//
// 🔴 ACÁ NO SE CALCULA NADA. Los números llegan hechos de
// `lib/depurador/resumen-del-archivo.ts`, que solo suma lo que las filas ya
// traen. Esto es pantalla.

import { plural, type CostoDelArchivo as Costo, type ContraSwitch } from "@/lib/depurador/resumen-del-archivo";

const dinero = (n: number): string => `$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Separador = () => <span className="text-stone-300">·</span>;

/**
 * `FOB $X · CIF $Y` dentro de la fila de totales: el número con el que se cuadra
 * contra la factura del proveedor.
 *
 * 🔴 UN ARTÍCULO SIN COSTO NO SE CUENTA COMO CERO: se suma lo que hay y se dice
 * cuántos quedaron fuera. Un total que miente es peor que no tenerlo.
 */
export function CostoDelArchivo({ costo }: { costo: Costo }) {
  const { fob, cif, sinCosto } = costo;
  return (
    <>
      <Separador />
      <span data-costo-fob={fob}>FOB <b className="font-semibold text-stone-900">{dinero(fob)}</b></span>
      <Separador />
      <span data-costo-cif={cif}>CIF <b className="font-semibold text-stone-900">{dinero(cif)}</b></span>
      {sinCosto > 0 && (
        <>
          <Separador />
          <span className="text-amber-700">
            {sinCosto} {plural(sinCosto, "artículo", "artículos")} sin costo{" "}
            {plural(sinCosto, "queda", "quedan")} fuera de esa suma
          </span>
        </>
      )}
    </>
  );
}

/** «Factura 3970 · 3971», solo cuando el archivo las trae. Nunca se inventan. */
export function FacturasDelArchivo({ facturas }: { facturas: readonly string[] }) {
  if (facturas.length === 0) return null;
  return (
    <>
      <Separador />
      <span data-facturas={facturas.join(",")}>
        {plural(facturas.length, "Factura", "Facturas")}{" "}
        <b className="font-semibold text-stone-900">{facturas.join(" · ")}</b>
      </span>
    </>
  );
}

/**
 * «63 artículos nuevos · 12 ya están en Switch», debajo de la fila de totales.
 *
 * ⚠️ FALLA ABIERTA: con `null` —la consulta falló, la empresa no se reconoció o
 * esa empresa no tiene catálogo sincronizado— no se dibuja nada y la pantalla
 * funciona igual.
 */
export function NuevosEnSwitch({ contra }: { contra: ContraSwitch | null }) {
  if (!contra) return null;
  const { nuevos, yaEstan } = contra;
  return (
    <div className="mb-4 px-1 text-[12px] text-stone-500" data-nuevos-en-switch={`${nuevos}/${yaEstan}`}>
      <b className="font-semibold text-stone-700">{nuevos.toLocaleString()}</b>{" "}
      {plural(nuevos, "artículo nuevo", "artículos nuevos")}
      {" · "}
      <b className="font-semibold text-stone-700">{yaEstan.toLocaleString()}</b>{" "}
      {plural(yaEstan, "ya está", "ya están")} en Switch
    </div>
  );
}
