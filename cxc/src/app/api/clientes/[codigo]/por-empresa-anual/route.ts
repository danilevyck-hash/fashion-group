// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clientes/[codigo]/por-empresa-anual?year=YYYY
//
// 🔴 LO QUE LA HOJA DEL CLIENTE DEL CELULAR NECESITA Y NO EXISTÍA (25-sep-2026,
// la «3g» que Daniel aprobó): el año del cliente **empresa por empresa, con su
// propio %**, y al tocar una empresa **su mes a mes contra el mismo mes del año
// pasado**.
//
// 🔴 SE COMPARAN LOS MISMOS DÍAS. No es un detalle: medido el 25-sep-2026,
// City Mall Paso Canoa (D-25) da **+28,0 %** contra los mismos días de 2025
// (1-ene al 24-sep en los dos años) y **+20,9 %** contra el 2025 completo hasta
// el 30-sep — porque le regala seis días al año pasado (en Fashion Wear son 3
// facturas de $30.847,00 entre el 25 y el 30 de septiembre de 2025). La regla
// es la escrita del sistema (`clientes-corte-comparativo.ts`), no una nueva.
//
// 🔴 NINGÚN NÚMERO SE INVENTA. La venta se firma con `signoVenta`, la MISMA
// función que usan el Resumen, Clientes y Productos: las notas de crédito
// restan, las de débito suman y un tipo desconocido vale CERO. Medido contra la
// pantalla: las seis empresas suman **$1.431.353,98** contra los
// $1.431.353,99 de la lista — **un centavo de redondeo**, no falta ninguna
// factura (463 comprobantes de 2026 y 326 de 2025, ninguno sin clasificar).
//
// 🔑 LA IDENTIDAD DEL CLIENTE ES EL CÓDIGO, y el puente es por ID:
// `switch_clientes (codigo, empresa_key) → cliente_switch_id → switch_facturas`.
// Nunca por nombre: un homónimo multiplicaría la factura.
//
// ⚠️ La misma puerta de mundo que la ficha (`esCodigoDelGrupo`): un código que
// no es del grupo contesta **404**, nunca 403.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { B2B_EMPRESA_KEYS, nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { esCodigoDelGrupo } from "@/lib/clientes/mundos";
import { signoVenta } from "@/lib/ventas/tipos-comprobante";
import { unAnioAntes } from "@/lib/ventas/clientes-corte-comparativo";
import { hoyPanama } from "@/lib/fecha-panama";

export const dynamic = "force-dynamic";

const READ_ROLES = ["admin", "contabilidad", "secretaria", "vendedor"];

/** Un mes del cliente en una empresa: lo de este año y lo del mismo mes del pasado. */
export interface MesDeLaEmpresa {
  /** 1–12. */
  mes: number;
  actual: number;
  previo: number;
}

/** Una empresa de la hoja del cliente. */
export interface EmpresaDelCliente {
  empresaKey: string;
  empresaNombre: string;
  actual: number;
  previo: number;
  meses: MesDeLaEmpresa[];
}

export interface PorEmpresaAnual {
  year: number;
  /** El último día que entra en la cuenta, en los DOS años. */
  corte: string;
  cortePrevio: string;
  total: number;
  totalPrevio: number;
  empresas: EmpresaDelCliente[];
}

const CENTAVOS = (n: number) => Math.round(n * 100) / 100;

export async function GET(req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const authError = requireAuth(req, READ_ROLES);
  if (authError) return authError;

  const { codigo } = await ctx.params;
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });

  const hoy = hoyPanama();
  const anioEnCurso = Number(hoy.slice(0, 4));
  const pedido = Number(req.nextUrl.searchParams.get("year") ?? anioEnCurso);
  const year = Number.isFinite(pedido) && pedido >= 2000 && pedido <= anioEnCurso ? pedido : anioEnCurso;

  // 🔴 La misma puerta de mundo que la ficha: 404, nunca 403.
  if (!(await esCodigoDelGrupo(codigo))) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // 🔴 El corte: hasta HOY si el año es el que corre, el 31 de diciembre si ya
  // cerró. Y el del año pasado, el MISMO día (29-feb → 28-feb).
  const corte = year === anioEnCurso ? hoy : `${year}-12-31`;
  const cortePrevio = unAnioAntes(corte);
  const desde = `${year}-01-01`;
  const desdePrevio = `${year - 1}-01-01`;

  // 1 · El puente por ID, para las seis del grupo de una sola lectura.
  const { data: pares, error: pErr } = await supabaseServer
    .from("switch_clientes")
    .select("cliente_switch_id, empresa_key")
    .eq("codigo", codigo)
    .in("empresa_key", B2B_EMPRESA_KEYS as unknown as string[]);
  if (pErr) {
    console.error("[por-empresa-anual] puente:", pErr.message);
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const idsPorEmpresa = new Map<string, number[]>();
  for (const p of (pares ?? []) as { cliente_switch_id: number | null; empresa_key: string | null }[]) {
    if (typeof p.cliente_switch_id !== "number" || !p.empresa_key) continue;
    const ya = idsPorEmpresa.get(p.empresa_key) ?? [];
    ya.push(p.cliente_switch_id);
    idsPorEmpresa.set(p.empresa_key, ya);
  }

  const empresas: EmpresaDelCliente[] = [];

  for (const key of B2B_EMPRESA_KEYS as unknown as string[]) {
    const ids = idsPorEmpresa.get(key);
    if (!ids || ids.length === 0) continue;

    // 2 · Los dos años, de una sola lectura por empresa. El rango va por
    // FECHA (sargable), nunca por `EXTRACT(YEAR …)`.
    const { data: filas, error: fErr } = await supabaseServer
      .from("switch_facturas")
      .select("fecha, tipo_comprobante, subtotal_descuento")
      .eq("empresa_key", key)
      .in("cliente_switch_id", ids)
      .gte("fecha", desdePrevio)
      .lte("fecha", `${corte}T23:59:59`);
    if (fErr) {
      console.error("[por-empresa-anual] facturas:", fErr.message);
      return NextResponse.json({ error: fErr.message }, { status: 500 });
    }

    const meses: MesDeLaEmpresa[] = Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      actual: 0,
      previo: 0,
    }));
    let actual = 0;
    let previo = 0;

    for (const f of (filas ?? []) as {
      fecha: string | null;
      tipo_comprobante: string | null;
      subtotal_descuento: number | string | null;
    }[]) {
      const dia = f.fecha ? String(f.fecha).slice(0, 10) : "";
      if (!dia) continue;
      const monto = Number(f.subtotal_descuento ?? 0) * signoVenta(f.tipo_comprobante);
      if (monto === 0) continue;
      const mes = Number(dia.slice(5, 7));
      if (!Number.isFinite(mes) || mes < 1 || mes > 12) continue;

      // 🔴 Los MISMOS DÍAS: este año hasta el corte; el pasado, hasta su
      // propio corte. Lo que cae entre los dos cortes NO entra en ninguno.
      if (dia >= desde && dia <= corte) {
        actual += monto;
        meses[mes - 1].actual += monto;
      } else if (dia >= desdePrevio && dia <= cortePrevio) {
        previo += monto;
        meses[mes - 1].previo += monto;
      }
    }

    if (actual === 0 && previo === 0) continue;

    empresas.push({
      empresaKey: key,
      empresaNombre: nombreCortoEmpresa(key),
      actual: CENTAVOS(actual),
      previo: CENTAVOS(previo),
      meses: meses.map((m) => ({ mes: m.mes, actual: CENTAVOS(m.actual), previo: CENTAVOS(m.previo) })),
    });
  }

  // 🔴 Las empresas se ordenan por lo que compró ESTE año, de más a menos: es
  // la misma pregunta que ordena la lista de clientes.
  empresas.sort((a, b) => b.actual - a.actual);

  const respuesta: PorEmpresaAnual = {
    year,
    corte,
    cortePrevio,
    total: CENTAVOS(empresas.reduce((s, e) => s + e.actual, 0)),
    totalPrevio: CENTAVOS(empresas.reduce((s, e) => s + e.previo, 0)),
    empresas,
  };

  return NextResponse.json(respuesta);
}
