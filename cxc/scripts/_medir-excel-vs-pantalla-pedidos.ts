// ─────────────────────────────────────────────────────────────────────────────
// EL EXCEL Y LA PANTALLA TIENEN QUE DECIR EL MISMO TOTAL — la prueba, contra
// producción, corriendo el código REAL de la app.
//
// 🩸 EL DEFECTO (6-sep-2026). El botón «Descargar Excel» de Comprobantes armaba
// el total sin las PIEZAS POR BULTO del estilo, así que todo lo marcado en 8 se
// cobraba en 12. Seis pedidos de Tommy salían inflados: $1.516,00 de más.
//
// Este script lee las cuatro vistas unificadas y calcula, pedido por pedido:
//   · pantalla     → la cadena de `/orders`: contextoDeLineas + resumirDesdeItems
//   · Excel ANTES  → la fórmula RETIRADA, copiada tal cual estaba en la ruta
//                    (`cfg.calcTotal` sin las piezas por bulto)
//   · Excel AHORA  → `totalDeLaLista`, la MISMA función que usa la pantalla
//
// Después del arreglo, «pantalla» y «Excel AHORA» tienen que dar IDÉNTICOS en
// los 62 pedidos vivos de las 4 marcas.
//
// SOLO LECTURA: no escribe ni un byte.
//
// Uso:  npx tsx scripts/_medir-excel-vs-pantalla-pedidos.ts
// Necesita NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local.
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";

function cargarEnv() {
  for (const linea of fs.readFileSync(".env.local", "utf8").split("\n")) {
    if (!linea.includes("=") || linea.trim().startsWith("#")) continue;
    const i = linea.indexOf("=");
    // Los valores de `.env.local` vienen entre comillas: hay que quitarlas o el
    // client de Supabase rechaza la URL.
    process.env[linea.slice(0, i).trim()] = linea
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
}

const plata = (n: number) =>
  n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Fila {
  marca: string;
  /** El total que la pantalla daba ANTES del arreglo. */
  pantallaAntes: number;
  numero: string;
  cliente: string;
  pantalla: number;
  excelAntes: number;
  excelAhora: number;
  guardado: number | null;
}

async function main() {
  cargarEnv();

  const { MARCAS_CONFIG } = await import("../src/lib/catalogo/marcas");
  const { contextoDeLineas, totalDeLaLista } = await import("../src/lib/catalogo/totales-lista");
  const { resumirDesdeItems } = await import("../src/lib/catalogo/lineas-pedido");

  const filas: Fila[] = [];

  for (const marca of ["reebok", "joybees", "tommy", "calvin"]) {
    const cfg = MARCAS_CONFIG[marca];
    const viewDb = await cfg.publicosDb();
    const { data, error } = await viewDb
      .from(cfg.unificadoView)
      .select("origen, id_natural, cliente, items, created_at, fuente")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`${marca}: ${error.message}`);
    const rows = (data || []) as unknown as {
      origen: string;
      id_natural: string;
      cliente: string;
      fuente?: string;
      items: { product_id?: string | null; quantity?: number | null; unit_price?: number | null }[] | null;
    }[];

    const db = await cfg.db();
    const ids = rows.flatMap((r) => (r.items || []).map((i) => i.product_id));

    // El contexto REAL que arma la app (categoría + piezas por bulto).
    const ctx = await contextoDeLineas(cfg, db as never, ids);

    // El número del pedido, solo para poder leer la tabla ("TOM-020").
    const orderIds = rows
      .filter((r) => (r.fuente ?? (r.origen === "link" ? "publicos" : "orders")) === "orders")
      .map((r) => r.id_natural);
    const numeros = new Map<string, string>();
    const guardados = new Map<string, number>();
    if (orderIds.length > 0) {
      const { data: ords } = await db
        .from(cfg.ordersTable)
        .select("id, order_number, total")
        .in("id", orderIds);
      for (const o of (ords || []) as Record<string, unknown>[]) {
        numeros.set(String(o.id), String(o.order_number ?? ""));
        if (o.total != null) guardados.set(String(o.id), Number(o.total));
      }
    }

    for (const r of rows) {
      const items = r.items || [];

      const pantalla = resumirDesdeItems(items, ctx).total;
      const excelAhora = totalDeLaLista(items, ctx);

      // ⚠️ LA FÓRMULA RETIRADA, copiada VERBATIM de `pedidos-export/route.ts`
      // antes del arreglo. Vive acá para poder medir el daño; no la usa nadie.
      const excelAntes = cfg.calcTotal(
        items.map((i) => ({
          quantity: Number(i.quantity) || 0,
          unit_price: Number(i.unit_price) || 0,
          ...(cfg.categoryLookup
            ? {
                category:
                  (i.product_id && ctx.categoryByProduct?.get(i.product_id)) ||
                  cfg.fallbackCategory ||
                  undefined,
              }
            : {}),
        })),
      );

      // ⚠️ LA PANTALLA TAMPOCO PUEDE MOVERSE. Para las filas del LINK sin
      // convertir, la lista usaba antes la misma fórmula suelta; se recalcula
      // con ella para probar que el número no cambia.
      const esDelLink = (r.fuente ?? (r.origen === "link" ? "publicos" : "orders")) === "publicos";
      const pantallaAntes = esDelLink
        ? cfg.calcTotal(
            items.map((i) => ({
              quantity: Number(i.quantity) || 0,
              unit_price: Number(i.unit_price) || 0,
              ...(cfg.categoryLookup
                ? {
                    category:
                      (i.product_id && ctx.categoryByProduct?.get(i.product_id)) ||
                      (i as { category?: string }).category ||
                      cfg.fallbackCategory ||
                      undefined,
                  }
                : {}),
            })),
          )
        : pantalla;

      filas.push({
        pantallaAntes,
        marca,
        numero: numeros.get(r.id_natural) || `(del link ${r.id_natural})`,
        cliente: r.cliente,
        pantalla,
        excelAntes,
        excelAhora,
        guardado: guardados.get(r.id_natural) ?? null,
      });
    }
  }

  console.log(`Pedidos vivos medidos: ${filas.length}\n`);

  const distintos = filas.filter((f) => Math.abs(f.excelAntes - f.pantalla) > 0.005);
  console.log("── ANTES DEL ARREGLO: donde el Excel no coincidía con la pantalla ──");
  console.log("Pedido      Cliente                        Pantalla        Excel      De más");
  let suma = 0;
  for (const f of distintos.sort((a, b) => b.excelAntes - b.pantalla - (a.excelAntes - a.pantalla))) {
    const dif = f.excelAntes - f.pantalla;
    suma += dif;
    console.log(
      `${f.numero.padEnd(11)} ${f.cliente.slice(0, 28).padEnd(30)} ${plata(f.pantalla).padStart(10)}  ${plata(f.excelAntes).padStart(10)}  ${("+" + plata(dif)).padStart(10)}`,
    );
  }
  console.log(`${" ".repeat(43)}${"TOTAL DE MÁS:".padStart(22)} ${("+" + plata(suma)).padStart(10)}`);

  const siguenDistintos = filas.filter((f) => Math.abs(f.excelAhora - f.pantalla) > 0.005);
  console.log("\n── DESPUÉS DEL ARREGLO ──");
  console.log(`Pedidos donde el Excel y la pantalla NO coinciden: ${siguenDistintos.length}`);
  for (const f of siguenDistintos) {
    console.log(`  ⚠️ ${f.numero}: pantalla ${plata(f.pantalla)} · Excel ${plata(f.excelAhora)}`);
  }

  const totalPantalla = filas.reduce((s, f) => s + f.pantalla, 0);
  const totalAhora = filas.reduce((s, f) => s + f.excelAhora, 0);
  const totalAntes = filas.reduce((s, f) => s + f.excelAntes, 0);
  console.log(
    `\nSuma de los ${filas.length} pedidos — pantalla ${plata(totalPantalla)} · Excel antes ${plata(totalAntes)} · Excel ahora ${plata(totalAhora)}`,
  );

  const pantallaMovida = filas.filter((f) => Math.abs(f.pantallaAntes - f.pantalla) > 0.005);
  console.log(
    `\n── LA PANTALLA NO SE MUEVE: pedidos cuyo total en pantalla cambió: ${pantallaMovida.length} ──`,
  );
  for (const f of pantallaMovida) {
    console.log(`  ⚠️ ${f.numero}: antes ${plata(f.pantallaAntes)} · ahora ${plata(f.pantalla)}`);
  }

  const guardadoRaro = filas.filter(
    (f) => f.guardado != null && Math.abs(f.guardado - f.pantalla) > 0.005,
  );
  console.log("\n── HIGIENE: el `total` GUARDADO que ya no es el suyo ──");
  console.log(`Pedidos con el guardado distinto del real: ${guardadoRaro.length}`);
  for (const f of guardadoRaro) {
    console.log(
      `  ${f.marca} ${f.numero} (${f.cliente}): guardado ${plata(f.guardado!)} · real ${plata(f.pantalla)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
