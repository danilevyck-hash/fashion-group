// ─────────────────────────────────────────────────────────────────────────────
// CREA LOS TRES USUARIOS DE MARCACIÓN — ana · cindy · yeisibeth (14-sep-2026).
//
// ⚠️ NO SE HA CORRIDO. Lo corre Daniel cuando decida, DESPUÉS de aplicar la
// migración `20261125120000_rol_marcacion_y_rodrigo.sql` (necesita la columna
// `fg_users.empleado_codigo` y la fila `marcacion` de `role_permissions`).
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_crear-usuarios-marcacion.ts          # solo muestra
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_crear-usuarios-marcacion.ts --crear  # escribe
//
// Daniel, textual: *«tú las creas con su nombre»* y *«crea las contraseñas con
// su nombre y después ellas la cambian»*.
//
// 🔴 EL LOGIN ES SOLO CONTRASEÑA: la contraseña ES la identidad. Una igual al
// nombre es adivinable, y cualquiera que la escriba entra como esa persona y
// marca por ella. Daniel lo aprobó igual, con la idea de que la cambien al
// entrar (desde su nombre › «Contraseña»). Queda escrito, no se discute acá.
//
// 🔴 TODO O NADA. Antes de escribir una sola fila se comprueban las tres:
//   · el nombre de usuario no existe;
//   · el colaborador existe y está activo en `asistencia_personas`;
//   · el nombre NO es ya la contraseña de otra persona — con la MISMA función
//     que usa la app (`contrasenaEnUso`, `lib/auth/contrasena-en-uso.ts`).
//     Si choca, el alta FALLA diciéndolo. Nunca se crea un usuario ambiguo.
// Solo si las tres pasan las tres, se insertan.
//
// ⚠️ El mínimo de 8 caracteres del alta por pantalla NO aplica acá: «ana»
// tiene 3 y es lo que Daniel pidió. Cuando la cambien, la nueva sí lleva 8.
// ─────────────────────────────────────────────────────────────────────────────

import bcrypt from "bcryptjs";
import { supabaseServer } from "../src/lib/supabase-server";
import { contrasenaEnUso } from "../src/lib/auth/contrasena-en-uso";
import { ROL_MARCACION } from "../src/lib/marcacion/rol";

/** Usuario · contraseña inicial (= el usuario) · colaborador por quien marca. */
export const USUARIOS_MARCACION = [
  { name: "ana",       empleado_codigo: "2",   nombre_completo: "Ana Trejos" },
  { name: "cindy",     empleado_codigo: "3",   nombre_completo: "Cindy De Gracia" },
  { name: "yeisibeth", empleado_codigo: "306", nombre_completo: "Yeisibeth Muñoz" },
] as const;

async function main() {
  const crear = process.argv.includes("--crear");
  const problemas: string[] = [];

  for (const u of USUARIOS_MARCACION) {
    const { data: existe } = await supabaseServer.from("fg_users").select("id").eq("name", u.name).limit(1);
    if (existe && existe.length > 0) problemas.push(`«${u.name}»: ya existe un usuario con ese nombre.`);

    const { data: persona } = await supabaseServer
      .from("asistencia_personas").select("empleado_codigo, nombre, activo").eq("empleado_codigo", u.empleado_codigo).maybeSingle();
    if (!persona) problemas.push(`«${u.name}»: no existe el colaborador ${u.empleado_codigo} en Asistencia.`);
    else if (!persona.activo) problemas.push(`«${u.name}»: el colaborador ${u.empleado_codigo} (${persona.nombre}) está dado de baja.`);

    if (await contrasenaEnUso(u.name)) {
      problemas.push(`«${u.name}»: esa contraseña YA la usa otra persona. Con ella el login sería ambiguo. Elige otra a mano.`);
    }
  }

  // ¿La columna existe? (la migración va primero)
  const { error: colErr } = await supabaseServer.from("fg_users").select("empleado_codigo").limit(1);
  if (colErr) problemas.push(`fg_users.empleado_codigo no existe todavía: aplica 20261125120000 primero (${colErr.message}).`);
  const { data: rol } = await supabaseServer.from("role_permissions").select("modulos").eq("role", ROL_MARCACION).maybeSingle();
  if (!rol) problemas.push(`role_permissions no tiene la fila «${ROL_MARCACION}»: aplica 20261125120000 primero.`);

  if (problemas.length) {
    console.error("NO SE CREÓ NADA. Antes hay que resolver:\n  - " + problemas.join("\n  - "));
    process.exit(1);
  }

  console.log(`Se van a crear ${USUARIOS_MARCACION.length} usuarios, rol «${ROL_MARCACION}», contraseña = su nombre:`);
  for (const u of USUARIOS_MARCACION) console.log(`  · ${u.name} → colaborador ${u.empleado_codigo} (${u.nombre_completo})`);
  if (!crear) {
    console.log("\nSolo se mostró. Para escribir, vuelve a correrlo con --crear.");
    return;
  }

  for (const u of USUARIOS_MARCACION) {
    const hashed = await bcrypt.hash(u.name, 10);
    const { error } = await supabaseServer.from("fg_users").insert({
      name: u.name,
      password: hashed,
      role: ROL_MARCACION,
      active: true,
      associated_company: null,
      modulos_override: null,
      nombre_completo: u.nombre_completo,
      empleado_codigo: u.empleado_codigo,
    });
    if (error) {
      console.error(`Falló «${u.name}»: ${error.message}. Los anteriores sí quedaron; revisa Usuarios.`);
      process.exit(1);
    }
    console.log(`  ✓ ${u.name} creado`);
  }
  console.log("\nListo. Cada una entra con su nombre como contraseña y la cambia desde su nombre › «Contraseña».");
}

main().catch((e) => { console.error(e); process.exit(1); });
