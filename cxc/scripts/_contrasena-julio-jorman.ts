// ─────────────────────────────────────────────────────────────────────────────
// LA CONTRASEÑA DE JULIO Y JORMAN — su propio nombre (7-oct-2026).
//
// Daniel, textual: *«a julio y jorman créale tú la contraseña como a los otros,
// con su nombre y ellos q la editen, go»*.
//
// Las dos filas ya existen: las creó `20261231130000_usuarios_julio_jorman.sql`
// con el marcador `PENDIENTE-DANIEL-PONE-LA-CONTRASENA-EN-ADMIN-USUARIOS`, que
// NO es un hash bcrypt. El login salta a quien no tenga hash (`isHash` en
// `/api/auth`), así que hoy la fila existe y la puerta sigue cerrada. Esto es
// lo que la abre.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_contrasena-julio-jorman.ts            # solo muestra
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_contrasena-julio-jorman.ts --aplicar  # escribe
//
// 🔑 EL MISMO MECANISMO QUE LA PANTALLA, no un hash a mano: `bcrypt.hash(x, 10)`
// —el mismo costo 10 del PUT de `/api/admin/users`— y la MISMA comprobación de
// unicidad, `contrasenaEnUso` (`lib/auth/contrasena-en-uso.ts`), que es la que
// leen la pantalla de Usuarios y el cambio de contraseña propio. Es el camino
// que ya se usó con ana · cindy · yeisibeth (`_crear-usuarios-marcacion.ts`).
//
// 🔴 EL LOGIN ES SOLO CONTRASEÑA: la contraseña ES la identidad, no hay campo de
// usuario. Una igual al nombre es adivinable, y cualquiera que la escriba entra
// como esa persona y despacha por ella. Daniel lo aprobó igual, con la idea de
// que la cambien al entrar (su nombre › «Contraseña»). Queda escrito, no se
// discute acá — es el mismo trato que ana · cindy · yeisibeth.
//
// 🔴 NO EXISTE UNA MARCA DE «DEBE CAMBIARLA AL ENTRAR». Se buscó en todo el
// repo el 7-oct-2026: `fg_users` no tiene esa columna y ninguna pantalla la
// lee. No se inventa una acá —sería media función: una columna que nadie mira
// no obliga a nadie—. Si Daniel la quiere de verdad, es su propio encargo.
//
// 🔴 SOLO ESTAS DOS FILAS, Y SOLO SI SIGUEN CON EL MARCADOR. Antes de escribir
// se exige que la contraseña de hoy NO sea un hash bcrypt: si alguien ya le
// puso una de verdad desde la pantalla, este script la respeta y no la pisa.
// Ningún otro usuario se toca ni se lee para escribir.
//
// 🔴 TODO O NADA. Las dos filas se comprueban enteras antes de escribir una
// sola: que exista, que siga con el marcador, que el largo alcance y que el
// nombre no sea ya la contraseña de otra persona (con ella el login sería
// AMBIGUO y `/api/auth` rechaza el empate). Si una falla, no se escribe nada.
// ─────────────────────────────────────────────────────────────────────────────

import bcrypt from "bcryptjs";
import { supabaseServer } from "../src/lib/supabase-server";
import {
  contrasenaEnUso,
  esHashBcrypt,
  LARGO_MINIMO_CONTRASENA,
} from "../src/lib/auth/contrasena-en-uso";

/** El marcador que escribió la migración. Mientras esté, no se puede entrar. */
const CENTINELA = "PENDIENTE-DANIEL-PONE-LA-CONTRASENA-EN-ADMIN-USUARIOS";

/** Usuario · contraseña inicial (= su nombre, lo que pidió Daniel). */
const USUARIOS = ["julio", "jorman"] as const;

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const problemas: string[] = [];
  const porEscribir: Array<{ id: string; name: string }> = [];

  for (const name of USUARIOS) {
    const { data: filas, error } = await supabaseServer
      .from("fg_users")
      .select("id, name, password, role, active")
      .ilike("name", name)
      .limit(2);
    if (error) {
      problemas.push(`«${name}»: no se pudo leer fg_users (${error.message}).`);
      continue;
    }
    if (!filas || filas.length === 0) {
      problemas.push(`«${name}»: no existe la fila. Aplica 20261231130000_usuarios_julio_jorman.sql primero.`);
      continue;
    }
    if (filas.length > 1) {
      problemas.push(`«${name}»: hay ${filas.length} filas con ese nombre. Revísalo a mano.`);
      continue;
    }
    const fila = filas[0];

    // Que siga con el marcador: nunca pisar una contraseña de verdad.
    if (esHashBcrypt(fila.password)) {
      problemas.push(`«${name}»: ya tiene una contraseña de verdad (hash bcrypt). No se pisa.`);
      continue;
    }
    if (fila.password !== CENTINELA) {
      problemas.push(`«${name}»: su contraseña no es el marcador esperado. No se toca; revísalo a mano.`);
      continue;
    }

    // El mismo piso de largo que la pantalla y la ruta propia.
    if (name.length < LARGO_MINIMO_CONTRASENA) {
      problemas.push(`«${name}»: la contraseña tendría ${name.length} caracteres y el mínimo es ${LARGO_MINIMO_CONTRASENA}.`);
      continue;
    }

    // La MISMA comprobación de la pantalla: el login no pide usuario, así que
    // dos contraseñas iguales lo hacen ambiguo y `/api/auth` rechaza el empate.
    if (await contrasenaEnUso(name, fila.id)) {
      problemas.push(`«${name}»: esa contraseña YA la usa otra persona. Con ella el login sería ambiguo. Elige otra a mano.`);
      continue;
    }

    porEscribir.push({ id: fila.id, name: fila.name });
  }

  if (problemas.length) {
    console.error("NO SE ESCRIBIÓ NADA. Antes hay que resolver:\n  - " + problemas.join("\n  - "));
    process.exit(1);
  }

  console.log(`Se le va a poner la contraseña a ${porEscribir.length} usuarios (contraseña = su nombre):`);
  for (const u of porEscribir) console.log(`  · ${u.name} → contraseña «${u.name.toLowerCase()}»`);
  if (!aplicar) {
    console.log("\nSolo se mostró. Para escribir, vuelve a correrlo con --aplicar.");
    return;
  }

  for (const u of porEscribir) {
    const hashed = await bcrypt.hash(u.name.toLowerCase(), 10);
    // El `eq` del marcador es el último candado: si entre la comprobación y
    // esta línea alguien le puso una de verdad, este UPDATE no toca nada.
    const { data, error } = await supabaseServer
      .from("fg_users")
      .update({ password: hashed, updated_at: new Date().toISOString() })
      .eq("id", u.id)
      .eq("password", CENTINELA)
      .select("id");
    if (error) {
      console.error(`Falló «${u.name}»: ${error.message}. Revisa Usuarios.`);
      process.exit(1);
    }
    if (!data || data.length === 0) {
      console.error(`«${u.name}»: su contraseña cambió mientras corría esto. No se tocó. Revisa Usuarios.`);
      process.exit(1);
    }
    console.log(`  ✓ ${u.name} listo`);
  }
  console.log("\nListo. Cada uno entra con su nombre como contraseña y la cambia desde su nombre › «Contraseña».");
}

main().catch((e) => { console.error(e); process.exit(1); });
