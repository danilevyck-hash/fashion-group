// ============================================================================
// Marketing nuevo — CERRAR UN COBRO, con gastos excluidos (8-oct-2026).
//
// Daniel: quiere poder dejar un gasto fuera de un cierre para que pase al
// siguiente (una factura que todavía no tiene fotos). Así:
//
//   1. Lo que entra es EXACTAMENTE lo que el ZIP abierto de la marca lleva,
//      menos lo excluido. Ese número es el que se ve al confirmar.
//   2. Lo excluido NO cambia: solo se le quita la asignación a ESTE período
//      (`mk_periodo_documentos`) antes de cerrar. Un gasto sin asignación es
//      del período abierto (la regla de siempre), así que pasa solo al
//      siguiente; después de abrirlo se le pone su asignación nueva.
//   3. El cierre es el de siempre (`cerrarPeriodoRediseno`), sellando solo lo
//      incluido. Ningún gasto se reescribe; nada de migraciones.
//
// Al final se vuelve a calcular el ZIP del período cerrado: el total que se
// devuelve es el del ZIP, y tiene que ser el mismo que se confirmó.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import { sellarDocumento } from "@/lib/marketing/periodos-io";
import { resumenDeUnCobro, type LineaDelCobro } from "@/lib/marketing/zip-marca";
import { ErrorDeCierre, cerrarPeriodoRediseno } from "../periodos/cerrar";

export const claveDeLinea = (l: Pick<LineaDelCobro, "tipo" | "documentoId">): string =>
  `${l.tipo}:${l.documentoId ?? ""}`;

export interface ResultadoCierreDeCobro {
  periodoId: string;
  marcaNombre: string;
  total: number;
  gastos: number;
  excluidos: number;
  siguiente: { id: string; nombre: string };
}

export async function cerrarCobro(args: {
  marcaCodigo: string;
  periodoId: string;
  excluidos: ReadonlyArray<string>;
  cerradoPor: string;
  ahoraISO?: string;
  hoy?: string;
}): Promise<ResultadoCierreDeCobro> {
  const abierto = await resumenDeUnCobro({ marcaCodigo: args.marcaCodigo });
  if (abierto.periodoId !== args.periodoId) {
    throw new ErrorDeCierre(409, "Ese cobro ya no es el abierto de la marca. Actualiza la pantalla.");
  }
  const fuera = new Set(args.excluidos);
  const incluidas = abierto.lineas.filter((l) => l.documentoId && !fuera.has(claveDeLinea(l)));
  const excluidas = abierto.lineas.filter((l) => l.documentoId && fuera.has(claveDeLinea(l)));
  if (incluidas.length === 0) {
    throw new ErrorDeCierre(400, "Para cerrar tiene que quedar al menos un gasto incluido.");
  }

  // Antes de cerrar: si esto falla, no se cerró nada.
  for (const tipo of ["factura", "entrega"] as const) {
    const ids = excluidas.filter((l) => l.tipo === tipo).map((l) => l.documentoId!);
    if (ids.length === 0) continue;
    const { error } = await supabaseServer
      .from("mk_periodo_documentos")
      .delete()
      .eq("periodo_id", args.periodoId)
      .eq("tipo", tipo)
      .in("documento_id", ids);
    if (error) throw new ErrorDeCierre(500, "No se pudo excluir los gastos del cierre. No se cerró nada.");
  }

  const r = await cerrarPeriodoRediseno({
    periodoId: args.periodoId,
    nombreAlCerrar: abierto.periodoNombre || "Período",
    notaCredito: null,
    cerradoPor: args.cerradoPor,
    documentos: {
      facturas: incluidas.filter((l) => l.tipo === "factura").map((l) => l.documentoId!),
      entregas: incluidas.filter((l) => l.tipo === "entrega").map((l) => l.documentoId!),
    },
    ahoraISO: args.ahoraISO,
    hoy: args.hoy,
  });

  // Lo excluido, al período nuevo. Sin esto igual entra (sin asignación =
  // período abierto); con esto queda dicho a cuál pertenece.
  for (const l of excluidas) {
    await sellarDocumento({ tipo: l.tipo, documentoId: l.documentoId!, marcaKeys: [r.cerrado.marcaCodigo] });
  }

  const cerrado = await resumenDeUnCobro({ marcaCodigo: args.marcaCodigo, periodoId: args.periodoId });
  return {
    periodoId: args.periodoId,
    marcaNombre: cerrado.marcaNombre,
    total: cerrado.total,
    gastos: cerrado.lineas.length,
    excluidos: excluidas.length,
    siguiente: r.siguiente,
  };
}
