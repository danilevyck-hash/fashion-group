// ============================================================================
// DRY-RUN del backfill de fotos de Mobiliario. SOLO LECTURA — no escribe nada.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/_verif-mobiliario-fotos.ts
//
// Hace tres cosas, y las tres antes de que Daniel corra el .sql:
//   1. Muestra el pareo foto↔producto UNO POR UNO, leyendo los pares del
//      MISMO archivo de migración que se va a correr (nada se copia acá).
//   2. Avisa de cualquier producto sin pareja y de cualquier renglón del
//      proveedor que quede sin usar.
//   3. Verifica que cada foto EXISTE de verdad: firma la URL, la baja y mira
//      que sea una imagen de más de 5 KB. Sin esto, el backfill podría dejar
//      la tabla apuntando a un archivo que no está.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import { firmarPath } from "@/lib/marketing/storage";
import { paresDeFotos } from "@/lib/marketing/fotos-pares";

const MIN_BYTES = 5 * 1024;

interface Prod {
  id: string;
  nombre: string;
  foto_path: string | null;
}
interface Nota {
  id: string;
  producto: string;
  precio: number | null;
  nota: string | null;
  foto_paths: string[] | null;
}

async function main() {
  const pares = paresDeFotos();

  const { data: prodRaw, error: e1 } = await supabaseServer
    .from("mk_inventario_productos")
    .select("id, nombre, foto_path")
    .order("nombre");
  if (e1) throw new Error(`productos: ${e1.message}`);

  const { data: notaRaw, error: e2 } = await supabaseServer
    .from("mk_mobiliario_notas_proveedor")
    .select("id, producto, precio, nota, foto_paths")
    .order("orden");
  if (e2) throw new Error(`notas: ${e2.message}`);

  const productos = (prodRaw ?? []) as Prod[];
  const notas = (notaRaw ?? []) as Nota[];

  const porNombre = new Map(productos.map((p) => [p.nombre, p]));
  const porNota = new Map(notas.map((n) => [n.producto, n]));

  console.log(
    `\nPAREO FOTO ↔ PRODUCTO (${pares.length} pares declarados en la migración)\n` +
      "=".repeat(78),
  );

  const usados = new Set<string>();
  const aVerificar: { producto: string; path: string }[] = [];
  let seEscriben = 0;
  let problemas = 0;

  for (const par of pares) {
    const p = porNombre.get(par.productoInventario);
    const n = porNota.get(par.productoNota);
    if (n) usados.add(n.producto);

    const path = n?.foto_paths?.[0] ?? null;
    let accion: string;
    if (!p) {
      accion = "🔴 FALTA el producto en el inventario";
      problemas++;
    } else if (!n) {
      accion = "🔴 FALTA el renglón del proveedor";
      problemas++;
    } else if (!path) {
      accion = "🔴 el renglón del proveedor no tiene foto";
      problemas++;
    } else if (p.foto_path) {
      accion = `🟡 ya tiene foto — NO se toca (${p.foto_path})`;
    } else {
      accion = "🟢 se escribe";
      seEscriben++;
      aVerificar.push({ producto: par.productoInventario, path });
    }

    const nFotos = n?.foto_paths?.length ?? 0;
    console.log(
      `\n  ${par.productoInventario.padEnd(18)} ← "${par.productoNota}"` +
        (par.productoInventario !== par.productoNota
          ? "   (nombres distintos)"
          : ""),
    );
    console.log(`     foto:   ${path ?? "(ninguna)"}`);
    if (nFotos > 1) {
      console.log(
        `     ⚠️  el renglón tiene ${nFotos} fotos — se toma la PRIMERA`,
      );
    }
    console.log(`     acción: ${accion}`);
  }

  // ── Nadie se puede quedar afuera sin que se diga ──────────────────────────
  const parProd = new Set(pares.map((p) => p.productoInventario));
  const sinPareja = productos.filter((p) => !parProd.has(p.nombre));
  const notasSinUsar = notas.filter((n) => !usados.has(n.producto));

  console.log("\n" + "=".repeat(78));
  console.log(
    `Productos en el inventario: ${productos.length} · con pareja: ${
      productos.length - sinPareja.length
    } · SIN pareja: ${sinPareja.length}`,
  );
  if (sinPareja.length > 0) {
    console.log(
      "  🔴 se quedan SIN FOTO: " + sinPareja.map((p) => p.nombre).join(", "),
    );
  }
  console.log(
    `Renglones del proveedor: ${notas.length} · usados: ${usados.size} · sin usar: ${notasSinUsar.length}`,
  );
  if (notasSinUsar.length > 0) {
    console.log(
      "  🟡 sin usar: " + notasSinUsar.map((n) => n.producto).join(", "),
    );
  }
  console.log(`\nEl PASO 2 escribiría ${seEscriben} filas. Problemas: ${problemas}.`);

  // ── ¿Las fotos EXISTEN? ──────────────────────────────────────────────────
  console.log("\nLAS FOTOS CARGAN DE VERDAD\n" + "=".repeat(78));
  let malas = 0;
  for (const { producto, path } of aVerificar) {
    try {
      const url = await firmarPath(path);
      const res = await fetch(url);
      const buf = Buffer.from(await res.arrayBuffer());
      const tipo = res.headers.get("content-type") ?? "";
      const ok = res.ok && tipo.startsWith("image/") && buf.length >= MIN_BYTES;
      if (!ok) malas++;
      console.log(
        `  ${ok ? "🟢" : "🔴"} ${producto.padEnd(18)} ${res.status} ${tipo} ${(
          buf.length / 1024
        ).toFixed(1)} KB`,
      );
    } catch (err) {
      malas++;
      console.log(
        `  🔴 ${producto.padEnd(18)} no se pudo firmar/bajar: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  console.log(
    "\n" +
      (problemas === 0 && malas === 0 && sinPareja.length === 0
        ? "🟢 TODO EN ORDEN — se puede correr el PASO 2 de la migración."
        : "🔴 REVISAR antes de correr nada."),
  );
  console.log("\n(Este script NO escribió nada.)\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
