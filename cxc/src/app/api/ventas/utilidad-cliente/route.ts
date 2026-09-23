// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/utilidad-cliente?year=YYYY
//
// Tab Utilidad de Ventas: utilidad real por cliente. Lee switch_factura_utilidad
// (reporte web, la misma fuente que Comisiones — cuadra al centavo).
// Las NC se guardan negativas → ventas/utilidad netas pueden ser negativas
// (devoluciones > ventas): dato válido, se pasa tal cual al cliente.
//
// 🔴 LAS EMPRESAS SE DERIVAN, NO SE ESCRIBEN. La lista sale de
// `empresasConUtilidad()` — la MISMA fuente única (`EMPRESA_SYNC_CAPABILITIES`)
// de la que salen el sync de utilidad y el cronograma de crons — y viaja POR
// PARÁMETRO a la RPC. La v1 de `utilidad_por_cliente` llevaba las cinco
// empresas escritas a mano adentro del SQL y `joystep` había quedado afuera:
// su utilidad se sincroniza desde el 27-jul-2026 y ya comisiona, pero esta
// pantalla no la dibujaba. Es el mismo olvido que costó 15.262,00 de cobros
// invisibles. Con la lista derivada no puede repetirse: no hay copia que se
// aparte.
//
// ⚠️ FALLBACK: mientras la migración 20260824180000 no la haya corrido Daniel a
// mano, `utilidad_por_cliente_v2` no existe y se cae sola a la v1 (5 empresas,
// lo que se ve hoy). La pantalla NUNCA queda en blanco por eso.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { empresasConUtilidad } from "@/lib/switch-api/empresas";
import { EMPRESAS_UTILIDAD_V1 } from "@/lib/ventas/utilidad-cliente";
import { rpcConFallbackDeVersion } from "@/lib/ventas/rpc-version";
import { empresaNombre, type UtilidadClienteResponse, type UtilidadClienteRow } from "@/lib/ventas/utilidad-cliente";
// 🔴 UNA SOLA VENTA (23-sep-2026): la venta por cliente es la del Resumen —el
// contado incluido— y el cuadre contra el Resumen se dice. La RPC `_v3`
// (migración 20261217120000) la trae hecha; mientras no corra, se cae a la v2
// y el contado se le suma desde `switch_facturas` en el servidor. Ver
// `lib/ventas/una-sola-venta.ts`.
import {
  UNA_SOLA_VENTA, agregarContado, anioValido, armarCuadreUtilidad, type FilaUtilidadUna,
} from "@/lib/ventas/una-sola-venta";
import { contadoDelAnio, codigosDeClientes, primeraFecha, ventaResumenDelAnio } from "@/lib/ventas/una-sola-venta-server";
import { esMostrador } from "@/lib/clientes/mostrador";

export const dynamic = "force-dynamic";

interface RpcRow {
  empresa_key: string | null;
  cliente_switch_id: number | null;
  cliente: string | null;
  n_docs: number | string;
  total_subtotal: number | string;
  total_costo: number | string | null;
  total_utilidad: number | string | null;
  pct_utilidad: number | string | null;
  /** Solo la v3. */
  codigo?: string | null;
  ventas_con_costo?: number | string | null;
}

const num = (v: number | string | null | undefined): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;

/** Las filas de la v2/v1: la venta es SOLO lo que el reporte de utilidad trae. */
function filasDeLaV2(data: RpcRow[]): UtilidadClienteRow[] {
  return data.map((r) => {
    const ventas = num(r.total_subtotal);
    const costo = num(r.total_costo);
    const utilidad = num(r.total_utilidad);
    const ek = r.empresa_key ?? "";
    return {
      clienteSwitchId: r.cliente_switch_id ?? null,
      cliente: r.cliente ?? "(Sin nombre)",
      empresaKey: ek,
      empresa: empresaNombre(ek),
      nDocs: num(r.n_docs),
      ventas,
      costo,
      utilidad,
      // margen como fracción; null si no hay base de venta positiva (evita % engañoso).
      margen: ventas > 0 ? utilidad / ventas : null,
    };
  });
}

/** Las filas de la v3: la venta entera, y el margen sobre la parte con costo. */
function filasDeLaV3(data: RpcRow[]): (UtilidadClienteRow & FilaUtilidadUna)[] {
  return data.map((r) => {
    const ventas = num(r.total_subtotal);
    const ventasConCosto = num(r.ventas_con_costo);
    const costo = num(r.total_costo);
    const utilidad = num(r.total_utilidad);
    const ek = r.empresa_key ?? "";
    return {
      clienteSwitchId: r.cliente_switch_id ?? null,
      cliente: r.cliente ?? "(Sin nombre)",
      empresaKey: ek,
      empresa: empresaNombre(ek),
      nDocs: num(r.n_docs),
      ventas,
      costo,
      utilidad,
      margen: ventasConCosto > 0 ? utilidad / ventasConCosto : null,
      ventasConCosto,
      ventasSinCosto: ventas - ventasConCosto,
      codigo: r.codigo ?? null,
      mostrador: esMostrador(r.codigo),
    };
  });
}

function totalesDe(rows: readonly UtilidadClienteRow[]) {
  const tV = rows.reduce((s, r) => s + r.ventas, 0);
  const tC = rows.reduce((s, r) => s + r.costo, 0);
  const tU = rows.reduce((s, r) => s + r.utilidad, 0);
  return { ventas: tV, costo: tC, utilidad: tU, margen: tV > 0 ? tU / tV : null };
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const year = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10);
  // 🔴 2022 y 2023 se aceptan (23-sep-2026; Daniel: «Sí» mira esos años). El
  // reporte de utilidad arranca en ene-2026: para un año anterior no se llama
  // a la RPC, se contesta vacío y se dice desde cuándo hay datos.
  if (!anioValido(year)) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }

  // La lista DERIVADA. Si la v2 todavía no existe en la base, el fallback usa la
  // v1 y ésa lleva sus cinco empresas adentro del SQL: el alcance REAL de la
  // respuesta pasa a ser otro, y la pantalla tiene que poder decirlo (el título
  // del Excel dice cuántas empresas se están mirando). Por eso el alcance viaja
  // en el cuerpo en vez de escribirse a mano en la pantalla.
  const empresasDerivadas = empresasConUtilidad();
  let empresas: string[] = empresasDerivadas;

  if (UNA_SOLA_VENTA) {
    const desde = await primeraFecha("switch_factura_utilidad");
    if (desde && Number(desde.slice(0, 4)) > year) {
      const body: UtilidadClienteResponse = {
        year, empresas, totales: { ventas: 0, costo: 0, utilidad: 0, margen: null }, rows: [],
        cuadre: null, datosDesde: desde,
      };
      return NextResponse.json(body);
    }
  }

  const llamarV2 = () => rpcConFallbackDeVersion(
    () => supabaseServer.rpc("utilidad_por_cliente_v2", { p_anio: year, p_empresas: empresasDerivadas }),
    () => {
      empresas = [...EMPRESAS_UTILIDAD_V1];
      return supabaseServer.rpc("utilidad_por_cliente", { p_anio: year });
    },
    { label: "utilidad_por_cliente_v2" },
  );

  if (!UNA_SOLA_VENTA) {
    const { data, error } = await llamarV2();
    if (error) {
      console.error("[api/ventas/utilidad-cliente]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const rows = filasDeLaV2((data ?? []) as RpcRow[]);
    const body: UtilidadClienteResponse = { year, empresas, totales: totalesDe(rows), rows };
    return NextResponse.json(body);
  }

  // ── UNA SOLA VENTA: v3, o v2 + el contado ──────────────────────────────
  let porV3 = true;
  const { data, error } = await rpcConFallbackDeVersion(
    () => supabaseServer.rpc("utilidad_por_cliente_v3", { p_anio: year, p_empresas: empresasDerivadas }),
    () => { porV3 = false; return llamarV2(); },
    { label: "utilidad_por_cliente_v3" },
  );
  if (error) {
    console.error("[api/ventas/utilidad-cliente]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows: (UtilidadClienteRow & FilaUtilidadUna)[];
  if (porV3) {
    rows = filasDeLaV3((data ?? []) as RpcRow[]);
  } else {
    // El RESPALDO: a lo que trae el reporte de utilidad se le suma el contado
    // de `switch_facturas`, cliente por cliente. Si esa lectura falla, la
    // pantalla queda como antes (sin contado) y el cuadre lo dice.
    const base = filasDeLaV2((data ?? []) as RpcRow[]);
    let contado: Awaited<ReturnType<typeof contadoDelAnio>> = [];
    try {
      contado = await contadoDelAnio(empresas, year);
    } catch (e) {
      console.error("[api/ventas/utilidad-cliente] contado:", e instanceof Error ? e.message : e);
    }
    rows = agregarContado(base, contado, empresaNombre);
    // El código del cliente, para marcar el mostrador (la v2 no lo trae).
    const ids = [...new Set(rows.map((r) => r.clienteSwitchId).filter((id): id is number => id != null))];
    const codigos = await codigosDeClientes(empresas, ids);
    rows = rows.map((r) => {
      const codigo = r.clienteSwitchId != null ? codigos.get(`${r.empresaKey}|${r.clienteSwitchId}`) ?? null : null;
      return { ...r, codigo, mostrador: esMostrador(codigo) };
    });
  }

  const totales = totalesDe(rows);
  let cuadre: UtilidadClienteResponse["cuadre"] = null;
  try {
    const ventaResumen = await ventaResumenDelAnio(empresas, year);
    cuadre = armarCuadreUtilidad({
      ventaResumen,
      ventaPantalla: totales.ventas,
      sinCosto: rows.reduce((s, r) => s + (r.ventasSinCosto ?? 0), 0),
    });
  } catch (e) {
    console.error("[api/ventas/utilidad-cliente] cuadre:", e instanceof Error ? e.message : e);
  }

  const body: UtilidadClienteResponse = { year, empresas, totales, rows, cuadre };
  return NextResponse.json(body);
}
