// Verificación READ-ONLY contra producción de la tarjeta del tab
// Ventas › Referencia. Corre los MISMOS módulos puros que usa la pantalla
// (`armarArticulo` + `armarFicha`) — no una segunda implementación — así que lo
// que imprime es literalmente lo que Daniel va a ver.
//
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-compras-referencia.ts [CODIGO...]
//
// 🔴 La caja de Compras es CRUDA: fecha y cantidad. No hay "se vendió en N
// meses" por compra y no debe volver — con stock encima, de qué llegada salió
// cada venta NO se sabe.

import { createClient } from "@supabase/supabase-js";
import { armarArticulo, type FilaIngreso } from "../src/lib/ventas/compras";
import { REFERENCIA_EMPRESA_KEYS } from "../src/lib/ventas/referencia";
import { armarFicha, textoCompra, textoMeses } from "../src/lib/ventas/resumen-articulo";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const CODIGOS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["NB2570001", "QD3958033", "40HM265032", "TWCAPRE001"];

const HOY = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const HOY_MES = HOY.slice(0, 7);

const money = (n: number | null | undefined) => (n == null ? "—" : `$${n.toFixed(2)}`);

async function main() {
  console.log(`hoy (Panamá) = ${HOY}\n`);

  for (const codigo of CODIGOS) {
    const { data: ing } = await db
      .from("switch_ingresos_mercancia")
      .select(
        "empresa_key, fecha, n_interno, linea, proveedor, codigo_articulo, articulo, precio, cantidad, costo_fob, costo_cif, costo_sin_desglosar, costo_promedio, fob_confiable",
      )
      .eq("codigo_articulo", codigo)
      .in("empresa_key", [...REFERENCIA_EMPRESA_KEYS]);

    const { data: ven } = await db
      .from("switch_articulo_diario")
      .select("empresa_key, fecha, codigo, descripcion, tipo, cantidad_total, venta_total")
      .eq("codigo", codigo)
      .in("empresa_key", [...REFERENCIA_EMPRESA_KEYS])
      .order("fecha");

    const { data: inf } = await db
      .from("switch_articulo_info")
      .select("empresa_key, codigo, descripcion, existencia, precio_etiqueta, synced_at")
      .eq("codigo", codigo)
      .in("empresa_key", [...REFERENCIA_EMPRESA_KEYS]);

    const emps = new Set([...(ing ?? []).map((r) => r.empresa_key), ...(ven ?? []).map((r) => r.empresa_key)]);
    for (const empresa of emps) {
      const ingE = (ing ?? []).filter((r) => r.empresa_key === empresa) as FilaIngreso[];
      const venE = (ven ?? []).filter((r) => r.empresa_key === empresa);
      const infE = (inf ?? []).find((r) => r.empresa_key === empresa);

      const art = armarArticulo(
        {
          empresa,
          codigo,
          descripcion: infE?.descripcion ?? venE[0]?.descripcion ?? ingE[0]?.articulo ?? "",
          ingresos: ingE,
          ventas: venE,
          existencia: infE?.existencia == null ? null : Number(infE.existencia),
          precioEtiqueta: infE?.precio_etiqueta == null ? null : Number(infE.precio_etiqueta),
          catalogoSyncedAt: infE?.synced_at ?? null,
        },
        HOY,
      );
      const f = armarFicha(art, HOY_MES);

      console.log(`═══ ${codigo} · ${empresa} · ${art.descripcion}`);
      if (art.sinCompraRegistrada) {
        console.log(`   ⚠️  SIN COMPRA REGISTRADA (vendió ${art.cuadre.vendido} u)`);
      }

      // ── LA CAJA DE COMPRAS, exactamente como se dibuja ──
      console.log("   Compras");
      for (const c of f.compras.visibles) console.log(`     ${textoCompra(c)}`);
      if (f.compras.ocultas.length) {
        console.log(
          `     [botón] ${f.compras.ocultas.length === 1 ? "Ver 1 compra más" : `Ver las otras ${f.compras.ocultas.length} compras`}`,
        );
        for (const c of f.compras.ocultas) console.log(`       · ${textoCompra(c)}`);
      }
      if (f.compras.masViejas) console.log(`     y ${f.compras.masViejas} más de hace años`);
      if (f.compras.unica) console.log("     única compra");

      // ── Las otras dos cajas ──
      const porMes = f.promedio.porMes == null ? "no vendió" : `${Math.round(f.promedio.porMes)} u`;
      console.log(`   Vendo por mes: ${porMes} (${f.promedio.meses} meses promediados)`);
      const alcance = f.alcance === 0 ? "nada" : f.alcance == null ? "—" : textoMeses(f.alcance);
      console.log(`   Me queda para: ${alcance} · ${art.existencia ?? "—"} en bodega`);

      // ── Costo y margen ──
      const m = f.margen;
      console.log(
        m.motivo
          ? `   Margen: NO se puede (${m.motivo}) · vendí a ${money(m.precioReal)}`
          : `   Vendí a ${money(m.precioReal)} · me costó ${money(m.costo)} · margen ${(m.margen! * 100).toFixed(0)}%`,
      );
      console.log(
        `   CIF anterior ${money(f.anterior?.costos.cif)} · lista ${money(f.ultima?.costos.lista ?? art.precioEtiqueta)}`,
      );

      // ── Avisos ──
      console.log(
        `   cuadre: comprado ${art.cuadre.comprado} − vendido ${art.cuadre.vendido} − existencia ${art.cuadre.existencia} = residuo ${art.cuadre.residuo} · ajusteConfiable=${art.cuadre.ajusteConfiable}${art.stockSinRespaldo ? ` · stock sin respaldo ${art.stockSinRespaldo}` : ""}`,
      );
      if (art.vendidoAntes) console.log(`   ⚠️  ${art.vendidoAntes} u vendidas ANTES de la primera compra`);
      if (art.vendidoDeMas) console.log(`   ⚠️  ${art.vendidoDeMas} u vendidas de MÁS`);
      console.log("");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
