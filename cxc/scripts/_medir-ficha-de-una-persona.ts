/* Solo LECTURA. Mide el costo de la ficha de UNA persona por los dos caminos:
 *   (a) el de hoy — leer las 6 fuentes enteras y quedarse con una fila,
 *   (b) el nuevo  — pedirle a la base solo esa persona.
 * Y comprueba lo único que podría separarlos: que ningún código traiga espacios
 * a los bordes (un `.eq()` exacto no encontraría un código guardado como " 12 ",
 * y el camino de hoy lo recorta al leer).
 *   NODE_OPTIONS=--no-deprecation npx tsx --env-file=.env.local scripts/_medir-ficha-de-una-persona.ts
 */
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { leerReglas, leerPersonas, leerRepartos, DIAS_VENTANA_PERSONAS } from "@/lib/asistencia/config-server";
import { leerIgnorados } from "@/lib/asistencia/codigos-ignorados-server";
import { leerDeudaPorCodigo } from "@/lib/prestamos-lista-server";

const desde = new Date(Date.now() - DIAS_VENTANA_PERSONAS * 86_400_000).toISOString();

interface FilaMarca { empleado_codigo: string | null; empleado_nombre: string | null; ocurrio_en: string; dispositivo: string | null }

const leerMarcas = (codigo?: string) =>
  leerTodoPaginado<FilaMarca>("asistencia_marcaciones", (c, from, to) => {
    let q = supabaseServer.from("asistencia_marcaciones")
      .select("empleado_codigo, empleado_nombre, ocurrio_en, dispositivo", c ? { count: "exact" } : {})
      .gte("ocurrio_en", desde);
    if (codigo) q = q.eq("empleado_codigo", codigo);
    return q.order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(from, to);
  });

const ms = async <T>(f: () => Promise<T>): Promise<[T, number]> => {
  const t = Date.now(); const v = await f(); return [v, Date.now() - t];
};

async function main() {
  // ── 1. ¿Algún código trae espacios a los bordes? ────────────────────────────
  const sucios: string[] = [];
  const revisar = (tabla: string, valores: (string | null)[]) => {
    for (const v of valores) {
      if (v === null || v === undefined) continue;
      if (String(v) !== String(v).trim()) sucios.push(`${tabla}: «${v}»`);
    }
  };
  const [fichas, rep, hor, ign, pre] = await Promise.all([
    leerPersonas(),
    leerRepartos(),
    supabaseServer.from("asistencia_horarios").select("empleado_codigo"),
    supabaseServer.from("asistencia_codigos_ignorados").select("empleado_codigo").eq("activo", true),
    supabaseServer.from("prestamos_empleados").select("empleado_codigo"),
  ]);
  revisar("asistencia_personas", fichas.filas.map((f) => f.empleado_codigo));
  revisar("asistencia_reparto_empresa", rep.filas.map((f) => String(f.empleado_codigo)));
  revisar("asistencia_horarios", (hor.data ?? []).map((h) => String(h.empleado_codigo)));
  revisar("asistencia_codigos_ignorados", (ign.data ?? []).map((h) => String(h.empleado_codigo)));
  revisar("prestamos_empleados", (pre.data ?? []).map((h) => (h.empleado_codigo === null ? null : String(h.empleado_codigo))));

  // ── 2. El camino de HOY: las 6 lecturas enteras ─────────────────────────────
  const [todo, msTodo] = await ms(async () => {
    const [marcas] = await Promise.all([
      leerMarcas(), leerReglas(), leerPersonas(), leerRepartos(),
      leerDeudaPorCodigo(), supabaseServer.from("asistencia_horarios").select("empleado_codigo"),
    ]);
    await leerIgnorados();
    return marcas;
  });
  revisar("asistencia_marcaciones", todo.map((m) => m.empleado_codigo));

  const codigos = new Set<string>();
  for (const m of todo) { const c = (m.empleado_codigo ?? "").trim(); if (c) codigos.add(c); }
  for (const f of fichas.filas) codigos.add(String(f.empleado_codigo));

  console.log(`Marcaciones en ${DIAS_VENTANA_PERSONAS} días: ${todo.length}`);
  console.log(`Personas del universo (reloj ∪ fichas): ${codigos.size}  ·  fichas: ${fichas.filas.length}`);
  console.log(`Códigos con espacios a los bordes: ${sucios.length === 0 ? "NINGUNO ✅" : sucios.join(" · ")}`);
  console.log(`\nCamino de HOY (todo, para quedarse con uno): ${msTodo} ms`);

  // ── 3. El camino NUEVO, sobre 3 personas de distinto tamaño ─────────────────
  const porMarcas = [...codigos].map((c) => ({ c, n: todo.filter((m) => (m.empleado_codigo ?? "").trim() === c).length }))
    .sort((a, b) => b.n - a.n);
  const muestra = [porMarcas[0], porMarcas[Math.floor(porMarcas.length / 2)], porMarcas[porMarcas.length - 1]];
  for (const { c, n } of muestra) {
    const [, msUno] = await ms(() => Promise.all([
      leerMarcas(c),
      leerReglas(),
      supabaseServer.from("asistencia_personas").select("empleado_codigo").eq("empleado_codigo", c).maybeSingle(),
      supabaseServer.from("asistencia_reparto_empresa").select("empleado_codigo").eq("empleado_codigo", c),
      supabaseServer.from("asistencia_horarios").select("empleado_codigo").eq("empleado_codigo", c).maybeSingle(),
      supabaseServer.from("asistencia_codigos_ignorados").select("empleado_codigo").eq("empleado_codigo", c).eq("activo", true).maybeSingle(),
      supabaseServer.from("prestamos_empleados").select("empleado_codigo, prestamos_movimientos(concepto, monto, estado, deleted, cuenta)").eq("empleado_codigo", c).or("deleted.is.null,deleted.eq.false"),
    ]));
    console.log(`Camino NUEVO · código ${c} (${n} marcaciones): ${msUno} ms`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
