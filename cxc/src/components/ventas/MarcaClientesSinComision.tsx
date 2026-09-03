"use client";

// «3 clientes sin comisión» — la marca que va pegada al nombre del vendedor en
// las tablas y tarjetas de Comisiones cuando ese vendedor tiene clientes por
// los que NO comisiona (configuración «Clientes que no comisionan», solo
// admin). El tooltip dice cuáles. Es INFORMATIVA: quien resta es la RPC
// (comision_b2b_v8); la lista la manda el servidor pegada a cada fila. Si la
// exclusión es solo de venta o solo de cobro, el tooltip lo dice.
//
// UNA sola pieza para las tres vistas (tabla por empresa, matriz, tarjetas):
// el texto sale de lib/comisiones/exclusiones, nunca se escribe a mano aquí.

import {
  etiquetaClienteSinComision,
  rotuloClientesSinComision,
  type ClienteSinComision,
} from "@/lib/comisiones/exclusiones";

/** En la matriz cada cliente trae la empresa en la que no comisiona. */
export type ClienteSinComisionConEmpresa = ClienteSinComision & { empresa?: string };

interface Props {
  clientes?: ClienteSinComisionConEmpresa[] | null;
  /** Para la matriz: cómo se nombra la empresa delante de cada cliente. */
  nombreEmpresa?: (key: string) => string;
}

export function MarcaClientesSinComision({ clientes, nombreEmpresa }: Props) {
  if (!clientes || clientes.length === 0) return null;
  const lineas = clientes.map((c) => {
    const e = c.empresa && nombreEmpresa ? nombreEmpresa(c.empresa) : null;
    return e ? `${e}: ${etiquetaClienteSinComision(c)}` : etiquetaClienteSinComision(c);
  });
  return (
    <span
      title={lineas.join("\n")}
      data-clientes-sin-comision={clientes.length}
      className="ml-1.5 inline-block shrink-0 cursor-help rounded border border-dashed border-gray-300 px-1.5 py-0.5 align-middle text-[11px] font-normal not-italic text-gray-500"
    >
      {rotuloClientesSinComision(clientes.length)}
    </span>
  );
}
