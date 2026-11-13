"use client";

// Lo que la fila de totales dice en LAS DOS pantallas de Plantilla Switch
// (17-sep-2026). Una sola pieza, montada por `ReebokClient` y por
// `DepuradorClient`: si el rótulo cambia, cambia en las dos.
//
// 🔴 ACÁ NO SE CALCULA NADA. Los números llegan hechos de
// `lib/depurador/resumen-del-archivo.ts`, que solo suma lo que las filas ya
// traen. Esto es pantalla.

import { useState } from "react";
import { plural, type CostoDelArchivo as Costo, type ContraSwitch } from "@/lib/depurador/resumen-del-archivo";

const dinero = (n: number): string => `$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Separador = () => <span className="text-gray-300">·</span>;

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
      <span data-costo-fob={fob}>FOB <b className="font-semibold text-gray-900">{dinero(fob)}</b></span>
      <Separador />
      <span data-costo-cif={cif}>CIF <b className="font-semibold text-gray-900">{dinero(cif)}</b></span>
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
        <b className="font-semibold text-gray-900">{facturas.join(" · ")}</b>
      </span>
    </>
  );
}

/**
 * «63 códigos nuevos · 12 ya están en Switch», debajo de la fila de totales.
 * Cada número se toca y despliega sus códigos con la descripción (13-nov-2026,
 * Daniel: «saber cuáles según el código»). El grano es el CÓDIGO: un estilo-color
 * con todas sus tallas es un código y cuenta uno.
 *
 * ⚠️ FALLA ABIERTA: con `null` —la consulta falló, la empresa no se reconoció o
 * esa empresa no tiene catálogo sincronizado— no se dibuja nada y la pantalla
 * funciona igual.
 */
export function NuevosEnSwitch({
  contra,
  descripciones = {},
}: {
  contra: ContraSwitch | null;
  /** Código → descripción de la plantilla. */
  descripciones?: Readonly<Record<string, string>>;
}) {
  const [abierto, setAbierto] = useState<"nuevos" | "yaEstan" | null>(null);
  if (!contra) return null;
  const { nuevos, yaEstan, codigosNuevos, codigosYaEstan, descripcionEnSwitch = {} } = contra;
  const lista = abierto === "nuevos" ? codigosNuevos : abierto === "yaEstan" ? codigosYaEstan : undefined;

  const Boton = ({ grupo, n, lista: l, children }: { grupo: "nuevos" | "yaEstan"; n: number; lista?: string[]; children: React.ReactNode }) =>
    n > 0 && l ? (
      <button
        type="button"
        aria-expanded={abierto === grupo}
        onClick={() => setAbierto(abierto === grupo ? null : grupo)}
        className={`rounded-md px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 active:scale-[0.97] ${abierto === grupo ? "bg-blue-50" : ""}`}
      >
        {children} <span aria-hidden>{abierto === grupo ? "⌃" : "⌄"}</span>
      </button>
    ) : (
      <span className="px-1.5">{children}</span>
    );

  return (
    <div className="mb-4 text-[12px] text-gray-500" data-nuevos-en-switch={`${nuevos}/${yaEstan}`}>
      <div className="flex flex-wrap items-center gap-x-1">
        <Boton grupo="nuevos" n={nuevos} lista={codigosNuevos}>
          <b className="font-semibold">{nuevos.toLocaleString()}</b> {plural(nuevos, "código nuevo", "códigos nuevos")}
        </Boton>
        <span className="text-gray-300">·</span>
        <Boton grupo="yaEstan" n={yaEstan} lista={codigosYaEstan}>
          <b className="font-semibold">{yaEstan.toLocaleString()}</b> {plural(yaEstan, "ya está", "ya están")} en Switch
        </Boton>
      </div>
      {lista && (
        <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {lista.map((c) => {
            const enArchivo = descripciones[c];
            const enSwitch = abierto === "yaEstan" ? descripcionEnSwitch[c] : undefined;
            const distinta = enSwitch && enArchivo && enSwitch.trim().toLowerCase() !== enArchivo.trim().toLowerCase();
            return (
              <li key={c} className="flex items-baseline gap-3 px-3 py-2 text-[13px]">
                <span className="tabular-nums text-gray-900">{c}</span>
                <span className="min-w-0 flex-1 truncate text-gray-600">
                  {enArchivo ?? enSwitch ?? ""}
                  {distinta && <span className="block text-amber-700">En Switch: {enSwitch}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
