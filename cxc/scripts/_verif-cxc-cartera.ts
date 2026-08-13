/**
 * VERIFICACIÓN CONTRA PRODUCCIÓN — las anotaciones del CXC no se cruzan entre
 * carteras. Escribe filas de PRUEBA y **las borra**, y después vuelve a contar
 * con una lectura INDEPENDIENTE (no la del módulo) para probar que no quedó
 * nada.
 *
 * Corre los MISMOS módulos que la app (`lib/cxc/anotaciones.ts`), no una
 * segunda implementación: si acá pasara y en la app no, la verificación no
 * estaría verificando la app.
 *
 * Se adapta al estado de la base:
 *   · SIN la columna `cartera` (antes del DDL) → verifica la DEGRADACIÓN: el
 *     grupo escribe/lee/borra como hoy, y Boston queda BLOQUEADO en vez de
 *     escribir en el namespace compartido.
 *   · CON la columna → verifica la SEPARACIÓN completa, sobre el nombre que
 *     existe en las dos carteras (`CITY MALL PASO CANOA`).
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-cxc-cartera.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  alternarFavorito,
  leerContactLog,
  leerCorreoDeOverride,
  leerFavoritos,
  guardarOverride,
  registrarContacto,
} from "../src/lib/cxc/anotaciones";
import { CARTERA_BOSTON, CARTERA_GRUPO, CarteraNoDisponibleError } from "../src/lib/cxc/cartera";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** El cliente que existe en las DOS carteras — el caso que disparó todo esto. */
const NOMBRE = "CITY MALL PASO CANOA";
const USUARIO = "__verif_cartera__";
const TABLAS = ["cxc_favorites", "cxc_client_overrides", "cxc_contact_log"] as const;

let fallos = 0;
function chequear(ok: boolean, texto: string) {
  console.log(`${ok ? "🟢" : "🔴"} ${texto}`);
  if (!ok) fallos++;
}

/** Lectura INDEPENDIENTE: PostgREST crudo, sin pasar por el módulo. */
async function contar(tabla: string, filtro?: Record<string, string>) {
  let q = db.from(tabla).select("id", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filtro ?? {})) q = q.eq(k, v);
  const { count, error } = await q;
  if (error) throw new Error(`${tabla}: ${error.message}`);
  return count ?? 0;
}

/** Borra TODO lo que este script pudo haber escrito. Corre pase lo que pase. */
async function limpiar() {
  await db.from("cxc_favorites").delete().eq("user_id", USUARIO);
  await db.from("cxc_client_overrides").delete().like("nombre_normalized", "__VERIF_CARTERA__%");
  await db.from("cxc_contact_log").delete().like("nombre_normalized", "__VERIF_CARTERA__%");
}

async function main() {
  // ── 0. Estado de la base y línea base ────────────────────────────────────
  const { error: sonda } = await db.from("cxc_favorites").select("cartera").limit(1);
  const hayColumna = !sonda;
  console.log(`\nColumna \`cartera\`: ${hayColumna ? "YA EXISTE (el DDL corrió)" : "todavía NO existe"}\n`);

  const base: Record<string, number> = {};
  for (const t of TABLAS) base[t] = await contar(t);
  console.log(`Línea base: ${TABLAS.map((t) => `${t}=${base[t]}`).join(" · ")}\n`);

  await limpiar();

  try {
    if (!hayColumna) {
      // ── A. SIN la columna: el grupo funciona, Boston queda bloqueado ─────
      console.log("── DEGRADACIÓN (antes del DDL) ──");

      chequear((await alternarFavorito(CARTERA_GRUPO, USUARIO, NOMBRE)) === "added", "grupo: la estrella se guarda");
      chequear((await leerFavoritos(CARTERA_GRUPO, USUARIO)).includes(NOMBRE), "grupo: la estrella se lee");

      let bloqueado = false;
      try {
        await alternarFavorito(CARTERA_BOSTON, USUARIO, NOMBRE);
      } catch (e) {
        bloqueado = e instanceof CarteraNoDisponibleError;
      }
      chequear(bloqueado, "boston: la estrella NO se guarda en el namespace compartido, y lo dice");
      chequear(
        (await contar("cxc_favorites", { user_id: USUARIO })) === 1,
        "boston no escribió NADA (queda 1 fila, la del grupo)",
      );

      chequear((await alternarFavorito(CARTERA_GRUPO, USUARIO, NOMBRE)) === "removed", "grupo: la estrella se quita");
    } else {
      // ── B. CON la columna: separación completa ──────────────────────────
      console.log("── SEPARACIÓN (después del DDL) ──");
      const marca = `__VERIF_CARTERA__ ${NOMBRE}`;

      await alternarFavorito(CARTERA_GRUPO, USUARIO, NOMBRE);
      await alternarFavorito(CARTERA_BOSTON, USUARIO, NOMBRE);
      chequear((await leerFavoritos(CARTERA_GRUPO, USUARIO)).includes(NOMBRE), "grupo ve SU estrella");
      chequear((await leerFavoritos(CARTERA_BOSTON, USUARIO)).includes(NOMBRE), "boston ve SU estrella");
      chequear(
        (await contar("cxc_favorites", { user_id: USUARIO })) === 2,
        "son DOS filas distintas, una por cartera (el UNIQUE viejo no dejaba)",
      );

      // Quitarla de una NO la quita de la otra.
      await alternarFavorito(CARTERA_BOSTON, USUARIO, NOMBRE);
      chequear(
        (await leerFavoritos(CARTERA_BOSTON, USUARIO)).length === 0 &&
          (await leerFavoritos(CARTERA_GRUPO, USUARIO)).includes(NOMBRE),
        "quitar la estrella de Boston NO toca la del grupo",
      );
      await alternarFavorito(CARTERA_GRUPO, USUARIO, NOMBRE);

      await guardarOverride(CARTERA_GRUPO, { nombre_normalized: marca, correo: "grupo@verif.test" });
      await guardarOverride(CARTERA_BOSTON, { nombre_normalized: marca, correo: "boston@verif.test" });
      chequear(
        (await leerCorreoDeOverride(CARTERA_GRUPO, marca)) === "grupo@verif.test" &&
          (await leerCorreoDeOverride(CARTERA_BOSTON, marca)) === "boston@verif.test",
        "cada cartera guarda SU correo, ninguna pisa a la otra",
      );

      await registrarContacto(CARTERA_BOSTON, marca, "llamada");
      const enGrupo = (await leerContactLog(CARTERA_GRUPO)).some((r) => r.nombre_normalized === marca);
      const enBoston = (await leerContactLog(CARTERA_BOSTON)).some((r) => r.nombre_normalized === marca);
      chequear(!enGrupo && enBoston, "una llamada anotada en Boston NO aparece en el grupo");
    }
  } finally {
    // ── 1. Borrar las pruebas, y confirmarlo leyendo de vuelta ─────────────
    await limpiar();
  }

  console.log("\n── LAS PRUEBAS SE BORRARON ──");
  let limpio = true;
  for (const t of TABLAS) {
    const ahora = await contar(t);
    const ok = ahora === base[t];
    limpio &&= ok;
    console.log(`${ok ? "🟢" : "🔴"} ${t}: ${ahora} filas (línea base ${base[t]})`);
  }
  chequear(limpio, "las 3 tablas volvieron EXACTAMENTE a su línea base");
  chequear((await contar("cxc_favorites", { user_id: USUARIO })) === 0, "no quedó ninguna fila del usuario de prueba");

  console.log(`\n${fallos === 0 ? "🟢 TODO BIEN" : `🔴 ${fallos} FALLO(S)`}\n`);
  if (fallos) process.exit(1);
}

main().catch(async (e) => {
  await limpiar();
  console.error(e);
  process.exit(1);
});
