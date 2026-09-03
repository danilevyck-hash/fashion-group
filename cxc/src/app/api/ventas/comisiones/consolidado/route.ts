/**
 * Comisiones B2B de TODAS las empresas que comisionan, en UNA sola petición.
 *
 * 🩸 POR QUÉ EXISTE (12-ago-2026). La vista "Todas las empresas" —que es la que
 * abre por defecto— hacía `Promise.all` sobre las 5 empresas con un segundo
 * `fetch` anidado adentro. Medido contra el build de producción, una sola
 * apertura de /comisiones:
 *
 *     /api/ventas/comisiones            ×5   (las 5 en el mismo milisegundo)
 *     /api/ventas/comisiones/descuentos ×5
 *     ─────────────────────────────────────────────────────────────
 *     10 peticiones · 4.014 ms de red sumados · 15 consultas a la base
 *
 * Cada `/comisiones` corre su propio `comision_b2b_v5` (3 tablas grandes), y
 * cada `/descuentos` sus 2 consultas — pero el `empresa_key` de los descuentos
 * es solo un `.eq()` de filtro, así que 10 de esas 15 consultas eran
 * innecesarias por completo.
 *
 * Acá el navegador hace **1 llamada** y la base recibe **7 consultas** (5 RPC +
 * 2 de descuentos).
 *
 * ⚠️ LAS DOS PESTAÑAS LLAMAN LA MISMA RPC, por construcción: `leerComision`
 * (`lib/comisiones/rpc` → comision_b2b_v6, con red a la v5 mientras la DDL no
 * corra), una vez por empresa y con los mismos argumentos, y los descuentos
 * salen de la MISMA función que usa el endpoint por empresa
 * (`lib/comisiones/descuentos`). La respuesta trae, empresa por empresa,
 * exactamente la forma que el cliente ya armaba a mano, más `regla_cobro`.
 *
 * ⚠️ NO se reemplaza la RPC por una nueva que agrupe las 6 en una: eso pide
 * una migración (que corre Daniel a mano) y es la ruta del dinero. Las 6 RPC
 * siguen siendo 6 — lo que se elimina son los viajes de red del navegador y
 * las consultas de descuentos de más.
 *
 * ⚠️ LOS DESCUENTOS SE RESTAN ACÁ, no en la vista (24-ago-2026). Antes la resta
 * vivía dentro del pivot de `ComisionesConsolidadoView` y la pestaña "Por
 * empresa" no la tenía: Reinaldo salía $1.573,08 más alto en una que en la
 * otra. Hoy las dos pestañas piden un `comision_total` que YA viene neto de la
 * MISMA función (`netearComisiones`), así que no pueden separarse.
 *
 * GET ?year=&mes= → { empresas: [{ empresa_key, vendedores[] }] }
 *   vendedores[].comision_total = NETO · vendedores[].descuento = lo restado
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { EMPRESAS_COMISIONAN } from "@/lib/comisiones/empresas";
import { leerComision } from "@/lib/comisiones/rpc";
import { marcarSePaga } from "@/lib/comisiones/sin-pago";
import { adjuntarClientesSinComision } from "@/lib/comisiones/exclusiones";
import { leerExclusionesActivasOVacio } from "@/lib/comisiones/exclusiones-server";
import {
  leerDescuentosEfectivos,
  totalPorVendedor,
  netearComisiones,
} from "@/lib/comisiones/descuentos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const year = parseInt(sp.get("year") ?? "", 10);
  const mes = parseInt(sp.get("mes") ?? "", 10);

  if (!Number.isInteger(year) || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }

  // Las 5 RPC en paralelo (mismo trabajo de base que antes) + UNA lectura de
  // descuentos para las 5 empresas.
  //
  // Los descuentos fallan ABIERTO, igual que antes: si su lectura se cae, la
  // pantalla sale con descuentos en 0 en vez de quedar en blanco. Un total de
  // comisiones visible vale más que una pantalla vacía.
  // Las exclusiones (clientes que no comisionan) fallan ABIERTO igual: son la
  // marca informativa pegada al nombre; quien resta es la RPC (v8).
  const [porEmpresa, descuentos, exclusiones] = await Promise.all([
    Promise.all(
      EMPRESAS_COMISIONAN.map(async (empresa) => {
        const { data, error } = await leerComision(empresa, year, mes);
        if (error || !data) throw new Error(`${empresa}: ${error?.message ?? "sin datos"}`);
        return {
          // La key PEDIDA, no la que devuelve la RPC: es con la que se filtran
          // los descuentos y con la que la tabla arma sus columnas. Que sean la
          // misma no debe depender de dos fuentes.
          empresa: empresa as string,
          empresa_key: data.empresa_key,
          regla_cobro: data.regla_cobro,
          version: data.version,
          exclusiones_aplicadas: data.exclusiones_aplicadas,
          alias_aplicado: data.alias_aplicado,
          vendedores: data.vendedores,
        };
      }),
    ).catch((e: unknown) => e instanceof Error ? e : new Error(String(e))),
    leerDescuentosEfectivos(EMPRESAS_COMISIONAN, year, mes).catch(() => []),
    leerExclusionesActivasOVacio(EMPRESAS_COMISIONAN),
  ]);

  if (porEmpresa instanceof Error) {
    return NextResponse.json({ error: porEmpresa.message }, { status: 500 });
  }

  return NextResponse.json({
    empresas: porEmpresa.map(({ empresa, empresa_key, regla_cobro, version, exclusiones_aplicadas, alias_aplicado, vendedores }) => ({
      empresa_key,
      regla_cobro,
      version,
      exclusiones_aplicadas,
      alias_aplicado,
      // El descuento es por (empresa, vendedor) y se resta del total de ESA
      // empresa — que es la celda que Daniel mira.
      // `se_paga`: DEFAULT y Daniel se calculan y se muestran, pero no entran
      // al total a pagar. Misma marca que en /api/ventas/comisiones.
      vendedores: adjuntarClientesSinComision(
        marcarSePaga(netearComisiones(vendedores, totalPorVendedor(descuentos, empresa))),
        exclusiones,
        empresa,
      ),
    })),
  });
}
