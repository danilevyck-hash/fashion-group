/* Solo LECTURA. Captura la FORMA real de cada colaborador para el candado
 * `asistencia-ficha-una-persona`. Ver el encabezado del fixture: los valores que
 * el candado no compara contra nada de afuera (cédula) salen despersonalizados.
 *   NODE_OPTIONS=--no-deprecation npx tsx --env-file=.env.local scripts/_capturar-fixture-fichas.ts */
import { writeFileSync } from "node:fs";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { leerPersonas, leerRepartos, leerReglas, DIAS_VENTANA_PERSONAS } from "@/lib/asistencia/config-server";

const desde = new Date(Date.now() - DIAS_VENTANA_PERSONAS * 86_400_000).toISOString();
interface M { empleado_codigo: string | null; empleado_nombre: string | null; ocurrio_en: string; dispositivo: string | null }

async function main() {
  const marcas = await leerTodoPaginado<M>("m", (c, f, t) =>
    supabaseServer.from("asistencia_marcaciones")
      .select("empleado_codigo, empleado_nombre, ocurrio_en, dispositivo", c ? { count: "exact" } : {})
      .gte("ocurrio_en", desde).order("ocurrio_en").order("id").range(f, t));
  const [fichas, rep, reglas, hor, ign, pre] = await Promise.all([
    leerPersonas(), leerRepartos(), leerReglas(),
    supabaseServer.from("asistencia_horarios").select("empleado_codigo"),
    supabaseServer.from("asistencia_codigos_ignorados").select("empleado_codigo, motivo, ignorado_por, ignorado_en, activo"),
    supabaseServer.from("prestamos_empleados").select("id, empleado_codigo, deleted, prestamos_movimientos(concepto, monto, estado, deleted, cuenta)"),
  ]);

  // De cada persona: la PRIMERA, una del medio y la ÚLTIMA marcación reales.
  const porCodigo = new Map<string, M[]>();
  for (const m of marcas) {
    const c = (m.empleado_codigo ?? "").trim(); if (!c) continue;
    (porCodigo.get(c) ?? porCodigo.set(c, []).get(c)!).push(m);
  }
  const muestraMarcas: M[] = [];
  for (const [, lista] of porCodigo) {
    const idx = [...new Set([0, Math.floor(lista.length / 2), lista.length - 1])];
    for (const i of idx) muestraMarcas.push(lista[i]);
  }
  muestraMarcas.sort((a, b) => a.ocurrio_en.localeCompare(b.ocurrio_en));

  const anon = (v: string | null | undefined, i: number) => (v == null || v === "" ? v ?? null : `8-${1000 + i}-${2000 + i}`);
  const datos = {
    reglas: reglas.reglas,
    fichas: fichas.filas.map((f, i) => ({ ...f, cedula: anon(f.cedula, i) })),
    repartos: rep.filas,
    horarios: (hor.data ?? []).map((h) => ({ empleado_codigo: String(h.empleado_codigo) })),
    ignorados: (ign.data ?? []),
    prestamos: (pre.data ?? []),
    marcaciones: muestraMarcas.map((m, i) => ({ id: i + 1, ...m })),
  };
  writeFileSync("src/__tests__/fixtures/asistencia-colaboradores.json", JSON.stringify(datos));
  console.log(`fichas ${datos.fichas.length} · repartos ${datos.repartos.length} · horarios ${datos.horarios.length} · ignorados ${datos.ignorados.length} · préstamos ${datos.prestamos.length} · marcaciones ${datos.marcaciones.length} (de ${marcas.length}) · universo ${new Set([...porCodigo.keys(), ...datos.fichas.map((f) => String(f.empleado_codigo))]).size}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
