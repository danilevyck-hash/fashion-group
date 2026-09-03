/**
 * Comisiones B2B por empresa + período — con los DESCUENTOS FIJOS YA RESTADOS.
 *
 * 🩸 POR QUÉ SE RESTAN ACÁ (24-ago-2026). Esta ruta devolvía la RPC cruda, así
 * que la pestaña "Por empresa" mostraba el SUBTOTAL mientras "Todas las
 * empresas" y el detalle del vendedor sí restaban: Reinaldo en Fashion Shoes
 * salía **$1.573,08 más alto** en una pestaña que en la otra, y el Excel de esa
 * vista bajaba el número inflado. La resta vive en `lib/comisiones/descuentos`
 * y la aplican los DOS endpoints — dos implementaciones serían dos totales
 * posibles para el mismo mes.
 *
 * Lee la RPC de comisión por `lib/comisiones/rpc` (comision_b2b_v6, con red a
 * la v5 mientras la DDL no corra). Regla: facturas con utilidad>20% menos NC,
 * excluye intercompañía/internos. Desde v5 (jul-2026, retroactivo) las VENTAS
 * se atribuyen al VENDEDOR DE LA FACTURA (switch_facturas, la NC usa su propio
 * vendedor). Desde v6 (sep-2026) los COBROS se pagan a QUIEN REGISTRÓ EL
 * RECIBO (switch_recibos.vendedor_registro), ya no al dueño de la cartera.
 * 🩸 Daniel: «el que vende a veces no es el que cobra». Desde v7 (sep-2026)
 * hay CLIENTES QUE NO COMISIONAN para un vendedor concreto (tabla
 * comision_exclusion, grano empresa + cliente + vendedor, venta y cobro).
 * 🩸 Daniel: «crea configuración en comisiones para desactivar cálculos de
 * clientes». Desde v8 (sep-2026, noche) el vendedor pasa por el ALIAS
 * (comision_vendedor_alias: una persona, una fila — Daniel: «¿por qué hay 4
 * Reinaldo?») y las exclusiones distinguen Venta de Cobro. La respuesta trae
 * `version`, `regla_cobro`, `exclusiones_aplicadas` y `alias_aplicado` para que
 * se sepa con cuál salió.
 *
 * COBROS $0 (switch_recibos.total = 0): son aplicaciones/cruces (saldo a favor
 * o NC aplicada contra facturas) o recibos anulados. Por decisión de negocio
 * (Daniel, 23-jul-2026) NO comisionan — las RPC suman por total, así que
 * aportan $0 a base_cobro. Comportamiento correcto: no "arreglarlo".
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import {
  leerDescuentosEfectivos,
  totalPorVendedor,
  netearComisiones,
} from "@/lib/comisiones/descuentos";
import { leerComision } from "@/lib/comisiones/rpc";
import { marcarSePaga } from "@/lib/comisiones/sin-pago";
import { adjuntarClientesSinComision } from "@/lib/comisiones/exclusiones";
import { leerExclusionesActivasOVacio } from "@/lib/comisiones/exclusiones-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const empresa = sp.get("empresa") ?? "";
  const year = parseInt(sp.get("year") ?? "", 10);
  const mes = parseInt(sp.get("mes") ?? "", 10);

  if (!(B2B_EMPRESA_KEYS as readonly string[]).includes(empresa)) {
    return NextResponse.json({ error: "empresa B2B inválida" }, { status: 400 });
  }
  if (!Number.isInteger(year) || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }

  // Los descuentos fallan ABIERTO, igual que en el consolidado: si su lectura
  // se cae, la tabla sale con descuentos en 0 en vez de quedar en blanco. Un
  // error de las COMISIONES sí se propaga (500): una tabla vacía silenciosa se
  // leería como "este mes no se vendió nada".
  //
  // Las exclusiones (clientes que no comisionan para un vendedor) también
  // fallan ABIERTO: son la MARCA informativa pegada al nombre; quien resta es
  // la RPC (comision_b2b_v8). Sin tabla o sin red, la tabla sale sin la marca.
  const [rpc, descuentos, exclusiones] = await Promise.all([
    leerComision(empresa, year, mes),
    leerDescuentosEfectivos([empresa], year, mes).catch(() => []),
    leerExclusionesActivasOVacio([empresa]),
  ]);
  if (rpc.error || !rpc.data) {
    return NextResponse.json({ error: rpc.error?.message ?? "sin datos" }, { status: 500 });
  }

  const data = rpc.data;
  // `se_paga` se marca ACÁ, después de netear, y la pantalla solo lo lee:
  // DEFAULT y Daniel se calculan y se muestran, pero no entran al total a
  // pagar («no me autopago»). Ver lib/comisiones/sin-pago.
  return NextResponse.json({
    ...data,
    vendedores: adjuntarClientesSinComision(
      marcarSePaga(netearComisiones(data.vendedores, totalPorVendedor(descuentos, empresa))),
      exclusiones,
      empresa,
    ),
  });
}
