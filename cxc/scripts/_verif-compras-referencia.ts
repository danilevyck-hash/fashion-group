// Verificación READ-ONLY contra producción de la tarjeta del tab
// Ventas › Referencia. Corre los MISMOS módulos puros que usa la pantalla
// (`armarArticulo` + `armarFicha`) — no una segunda implementación — así que lo
// que imprime es literalmente lo que Daniel va a ver.
//
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-compras-referencia.ts [CODIGO...]
//
// 🔴 Imprime la ficha del 12-ago-2026: los TRES GRANDES (Compré · Vendí · Me
// quedan), la lista de compras, la LÍNEA DE VENTA (tiempo de venta + % real —
// la regla del 90% se fue del módulo entero) y sus celdas VENDIDO · MESES del
// modo pedido, la vista de barras (anclada a la llegada o últimos 12 con ▲) y
// la fila de plata agrupada. Sin atribución por compra: eso no se sabe.

import { createClient } from "@supabase/supabase-js";
import { armarArticulo, type FilaIngreso } from "../src/lib/ventas/compras";
import { REFERENCIA_EMPRESA_KEYS } from "../src/lib/ventas/referencia";
import {
  armarFicha,
  centavos,
  fmtFechaCorta,
  leyendaLlegadas,
  medirVendidoMeses,
  pieGrandeMeses,
  subDesdeLlegada,
  textoCompra,
  textoLineaVenta,
  textoMesesCelda,
  textoAvanceCorto,
  fraseLlegadaActual,
  textoLlegadaAnterior,
  medirTandas,
  textoParteVendida,
  textoRestantes,
  textoVendidoCelda,
  tituloDesdeLlegada,
} from "../src/lib/ventas/resumen-articulo";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const CODIGOS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["4G5004G001", "4G5004G030", "CVM253CR02001", "NB2570001", "QD3958033", "40HM265032", "RETENCION"];

const HOY = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const HOY_MES = HOY.slice(0, 7);

// 🔴 El MISMO redondeo que la pantalla (`centavos`): `toFixed(2)` mostraba
// $16.55 donde la ficha dice $16.56 — el CIF real de NB2570001 es 16,555.
const money = (n: number | null | undefined) => {
  const c = centavos(n);
  return c == null ? "—" : `$${c.toFixed(2)}`;
};

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

      // ── LOS TRES GRANDES, exactamente como se leen ──
      const g = f.grandes;
      const pieVendi = textoParteVendida(g.parteVendida) ?? "—";
      console.log(
        `   Compré ${g.comprado ?? "—"} u · Vendí ${g.vendido} u (${pieVendi}) · Stock ${g.quedan ?? "—"} u · Meses ${f.ritmo.meses ?? "—"} (${pieGrandeMeses(f.ritmo)})`,
      );

      // ── El pie de Compré (la lista aprobada) ──
      if (f.compras.unica && f.compras.visibles[0]) {
        console.log(`     ${fmtFechaCorta(f.compras.visibles[0].fecha)} · única compra`);
      } else {
        for (const c of f.compras.visibles) console.log(`     ${textoCompra(c)}`);
        const restantes = textoRestantes(f.compras.restantes);
        if (restantes) console.log(`     ${restantes}   (gris, sin enlace)`);
      }

      // ── LAS TANDAS del motor (episodios entre ceros de bodega) ──
      const medida = medirTandas(art, HOY_MES);
      if (f.tandas) {
        console.log(
          `   tandas (${f.tandas.length}): ${f.tandas
            .map((t) => `${t.desdeMes}: ${t.llegaron}u vendidas ${t.vendidas} · ${t.cerrada ? "CERRADA" : "viva"} · ${t.meses}m`)
            .join("  |  ")}`,
        );
        console.log(`     frase: ${fraseLlegadaActual(f.tandas[f.tandas.length - 1])}`);
        const ant = textoLlegadaAnterior(f.tandas);
        if (ant) console.log(`     historia (gris): ${ant}`);
      } else {
        console.log(
          `   tandas: ${medida == null ? "timeline NO afirmable (o sin compras) — comportamiento de siempre" : `${medida.tandas.length} — una sola: comportamiento de siempre`}`,
        );
      }

      // ── LA LÍNEA DE VENTA de la ficha ──
      const linea = textoLineaVenta(f.avance, f.ritmo, f.tandas);
      console.log(`   línea: ${linea ?? "(sin línea)"}   [corto: ${textoAvanceCorto(f.avance)}]`);

      // ── VENDIDO · MESES — las dos celdas del modo pedido (12-ago-2026),
      //    medidas con LA MISMA función que la tabla y el Excel ──
      const vm = medirVendidoMeses(f);
      console.log(
        `   tabla pedido: VENDIDO ${textoVendidoCelda(vm)} · MESES ${textoMesesCelda(vm)} · ${
          vm.terminado ? "AGOTADO (cerrado en la última venta, negro)" : "en curso (gris)"
        }`,
      );

      // ── La vista de barras ──
      const vb = f.vista;
      if (vb.modo === "desde-llegada" && vb.llegada) {
        console.log(`   Barras: ${tituloDesdeLlegada(vb.llegada)} — ${subDesdeLlegada(vb, HOY_MES)}`);
        console.log(`     meses: ${vb.barras.map((b) => `${b.mes.slice(5)}:${b.unidades}`).join(" ")}`);
        console.log(`     acum : ${vb.acumulado?.join(" · ")}`);
      } else {
        const ley = leyendaLlegadas(vb.llegadas);
        console.log(`   Barras: últimos 12 meses${ley ? ` — ${ley}` : " (sin llegadas en la ventana)"}`);
      }

      // ── LA FILA DE PLATA, agrupada, exactamente como se lee ──
      const m = f.margen;
      const lista = f.ultima?.costos.lista ?? art.precioEtiqueta;
      const precios: string[] = [];
      if (m.precioReal != null) precios.push(`Precio prom ${money(m.precioReal)}`);
      if (lista != null) precios.push(`lista ${money(lista)}`);
      const costosTx: string[] = [];
      if (m.costo != null) {
        const c = f.cambioCosto;
        costosTx.push(
          `Costo CIF ${money(m.costo)}${c ? ` (antes ${money(c.anterior)} ${c.subio ? "↑" : "↓"})` : ""}`,
        );
      }
      if (f.fobCalculado != null) costosTx.push(`FOB ${money(f.fobCalculado)}`);
      const margenTx = m.margen != null ? [`margen ${(m.margen * 100).toFixed(0)}%`] : [];
      const gruposTx = [precios, costosTx, margenTx].filter((x) => x.length > 0);
      console.log(`   ${gruposTx.map((x) => x.join(" · ")).join(" | ")}`);
      if (m.motivo) console.log(`   (sin margen: ${m.motivo})`);

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
