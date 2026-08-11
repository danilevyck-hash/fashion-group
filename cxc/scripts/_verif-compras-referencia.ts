// Verificación READ-ONLY contra producción del motor de compras del tab
// Ventas › Referencia. Corre el MISMO módulo que usa la pantalla — no una
// segunda implementación — así que lo que mide es lo que Daniel va a ver.
//
// Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-compras-referencia.ts [CODIGO...]

import { createClient } from "@supabase/supabase-js";
import { armarArticulo, textoMesesVendidos, type FilaIngreso } from "../src/lib/ventas/compras";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const CODIGOS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["40HM265032", "WW0WW505930A8", "TWCAPRE001", "EM0EM00898-YBR", "S1"];

const HOY = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

async function main() {
  console.log(`hoy (Panamá) = ${HOY}\n`);

  for (const codigo of CODIGOS) {
    const { data: ing } = await db
      .from("switch_ingresos_mercancia")
      .select(
        "empresa_key, fecha, n_interno, linea, proveedor, codigo_articulo, articulo, precio, cantidad, costo_fob, costo_cif, costo_sin_desglosar, costo_promedio, fob_confiable",
      )
      .eq("codigo_articulo", codigo);

    const { data: ven } = await db
      .from("switch_articulo_diario")
      .select("empresa_key, fecha, codigo, descripcion, tipo, cantidad_total, venta_total")
      .eq("codigo", codigo)
      .order("fecha");

    const { data: inf } = await db
      .from("switch_articulo_info")
      .select("empresa_key, codigo, descripcion, existencia, precio_etiqueta, synced_at")
      .eq("codigo", codigo);

    // empresa dominante
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

      console.log(`═══ ${codigo} · ${empresa} · ${art.descripcion}`);
      if (art.sinCompraRegistrada) {
        console.log(`   ⚠️  SIN COMPRA REGISTRADA (vendió ${art.cuadre.vendido} u)`);
      }
      console.log(
        `   cuadre: comprado ${art.cuadre.comprado} − vendido ${art.cuadre.vendido} − existencia ${art.cuadre.existencia} = residuo ${art.cuadre.residuo} · ajusteConfiable=${art.cuadre.ajusteConfiable}${art.stockSinRespaldo ? ` · stock sin respaldo ${art.stockSinRespaldo}` : ""}`,
      );
      if (art.vendidoAntes) console.log(`   ⚠️  ${art.vendidoAntes} u vendidas ANTES de la primera compra`);
      if (art.vendidoDeMas) console.log(`   ⚠️  ${art.vendidoDeMas} u vendidas de MÁS`);
      if (art.comprasFueraDeVentana) console.log(`   (${art.comprasFueraDeVentana} compras fuera de los 3 años)`);

      console.log(
        `   ${"LLEGÓ".padEnd(12)}${"CUÁNTO".padStart(8)}  ${"SE VENDIÓ EN".padEnd(16)}${"QUEDA".padStart(6)}${"CIF".padStart(9)}${"FOB".padStart(11)}${"LISTA".padStart(9)}${"VENDIDO".padStart(9)}${"DESC".padStart(7)}`,
      );
      for (const c of art.compras) {
        const seVendio =
          c.estado === "medida"
            ? `${Math.round(c.meses!)} meses`
            : c.estado === "viva"
              ? `te quedan ${c.quedan}`
              : c.estado === "sin-ventas"
                ? "todavía nada"
                : `${Math.round(c.meses!)} meses*`;
        const fob = c.costos.fob == null ? "—" : `$${c.costos.fob.toFixed(2)}${c.costos.fobOrigen === "estimado" ? " est" : c.costos.fobOrigen === "igual-al-cif" ? " ?" : ""}`;
        console.log(
          `   ${c.fecha.padEnd(12)}${String(c.unidades).padStart(6)} u  ${seVendio.padEnd(16)}${String(c.quedan).padStart(6)}${(c.costos.cif == null ? "—" : "$" + c.costos.cif.toFixed(2)).padStart(9)}${fob.padStart(11)}${(c.costos.lista == null ? "—" : "$" + c.costos.lista.toFixed(2)).padStart(9)}${(c.precioVendido == null ? "—" : "$" + c.precioVendido.toFixed(2)).padStart(9)}${(c.descuento == null ? "—" : (c.descuento * 100).toFixed(0) + "%").padStart(7)}`,
        );
        console.log(`      meses: ${textoMesesVendidos(c.mesesConVenta, HOY.slice(0, 7)) || "—"}`);
        if (c.meses != null) console.log(`      (exacto ${c.meses.toFixed(2)} meses · cruzó el 90% el ${c.fechaUmbral ?? "—"})`);
        if (art.cuadre.ajusteConfiable && c.noVendidoNiEnBodega)
          console.log(`      de las ${c.unidades}, ${c.noVendidoNiEnBodega} se perdió en ajuste`);
        else if (c.noVendidoNiEnBodega) console.log(`      (residuo sin explicar: ${c.noVendidoNiEnBodega} — NO se muestra)`);
      }
      console.log("");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
