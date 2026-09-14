/* Solo LECTURA, contra PRODUCCIÓN. La condición con la que Daniel aprobó abrir
 * la segunda puerta a la ficha: los DOS caminos —la lista entera y la ficha de
 * una persona— tienen que decir lo MISMO, campo por campo, para TODOS los
 * colaboradores. Acá se corren los dos con los datos de verdad y se compara;
 * el candado que deja el build rojo para siempre es
 * `src/__tests__/lib/asistencia-ficha-una-persona.test.ts`.
 *   NODE_OPTIONS=--no-deprecation npx tsx --env-file=.env.local scripts/_verif-ficha-una-persona.ts */
import { supabaseServer } from "@/lib/supabase-server";
import { leerReglas, leerPersonas, leerRepartos, leerTrabajaAfuera } from "@/lib/asistencia/config-server";
import { leerDeudaPorCodigo } from "@/lib/prestamos-lista-server";
import { leerIgnorados } from "@/lib/asistencia/codigos-ignorados-server";
import { crearDirectorio } from "@/lib/asistencia/directorio";
import { agruparPorCodigo } from "@/lib/asistencia/reparto";
import { diaPanama } from "@/lib/asistencia/reporte";
import { sinIgnorados } from "@/lib/asistencia/codigos-ignorados";
import { agruparMarcas, armarPersonaDeConfiguracion } from "@/lib/asistencia/ficha-de-configuracion";
import {
  arranqueDeLaVentana, leerCodigosConHorario, leerMarcasDeLaVentana, leerInsumosDeUnaPersona,
} from "@/lib/asistencia/ficha-de-configuracion-server";

const ms = async <T>(f: () => Promise<T>): Promise<[T, number]> => {
  const t = Date.now(); const v = await f(); return [v, Date.now() - t];
};

async function main() {
  // ── CAMINO VIEJO: lo que hace hoy la lista, y lo que hacía la ficha ─────────
  const [lista, msLista] = await ms(async () => {
    const desde = arranqueDeLaVentana();
    const [marcas, { reglas }, { filas }, repRes, deudaDe, conHorario, afuera] = await Promise.all([
      leerMarcasDeLaVentana(desde), leerReglas(), leerPersonas(), leerRepartos(),
      leerDeudaPorCodigo(), leerCodigosConHorario(), leerTrabajaAfuera(),
    ]);
    const hoy = diaPanama(new Date().toISOString());
    const vistos = agruparMarcas(marcas);
    const reparto = agruparPorCodigo(repRes.filas);
    const fichas = new Map(filas.map((f) => [String(f.empleado_codigo), f]));
    const directorio = crearDirectorio(filas);
    const codigos = new Set<string>([...vistos.keys(), ...fichas.keys()]);
    const personas = [...codigos].map((codigo) => armarPersonaDeConfiguracion({
      codigo, visto: vistos.get(codigo), ficha: fichas.get(codigo), directorio, reglas,
      filasReparto: reparto.get(codigo), deudaPrestamo: deudaDe.get(codigo) ?? 0,
      tieneHorario: conHorario ? conHorario.has(codigo) : null, hoy,
    }).persona).map((p) => ({ ...p, trabajaAfuera: afuera.has(p.codigo) }));
    const escondidos = await leerIgnorados();
    return { visibles: sinIgnorados(personas, escondidos.codigos), universo: [...codigos], escondidos: escondidos.codigos };
  });

  console.log(`Camino de HOY (la lista entera, que es lo que pedía la ficha): ${msLista} ms`);
  console.log(`Universo: ${lista.universo.length} colaboradores · ${lista.escondidos.size} ignorados · ${lista.visibles.length} visibles\n`);

  // ── CAMINO NUEVO: uno por uno, y comparar ──────────────────────────────────
  let iguales = 0; const distintos: string[] = []; const tiempos: number[] = [];
  for (const codigo of lista.universo) {
    const [ins, t] = await ms(() => leerInsumosDeUnaPersona(codigo));
    tiempos.push(t);
    const nueva = ins
      ? { ...armarPersonaDeConfiguracion(ins).persona, trabajaAfuera: ins.trabajaAfuera }
      : null;
    const vieja = lista.visibles.find((p) => p.codigo === codigo) ?? null;
    if (JSON.stringify(nueva) === JSON.stringify(vieja)) { iguales += 1; continue; }
    distintos.push(codigo);
    console.log(`❌ ${codigo}\n   lista: ${JSON.stringify(vieja)}\n   ficha: ${JSON.stringify(nueva)}`);
  }
  tiempos.sort((a, b) => a - b);
  const p50 = tiempos[Math.floor(tiempos.length / 2)];
  const p95 = tiempos[Math.floor(tiempos.length * 0.95)];
  console.log(`\nCamino NUEVO (una persona): mediana ${p50} ms · p95 ${p95} ms · más lento ${tiempos[tiempos.length - 1]} ms`);
  console.log(distintos.length === 0
    ? `✅ IGUALES campo por campo: ${iguales} de ${lista.universo.length} colaboradores.`
    : `❌ DISTINTOS: ${distintos.join(", ")}`);
  process.exit(distintos.length === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
