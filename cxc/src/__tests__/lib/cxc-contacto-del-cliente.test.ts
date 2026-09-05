// ─────────────────────────────────────────────────────────────────────────────
// LA CASILLA «CONTACTO» DE LA FICHA DEL CLIENTE (5-sep-2026).
//
// QUÉ ES: el NOMBRE DE LA PERSONA con quien se habla en ese cliente. No es un
// teléfono ni un correo: es «con quién pregunto» al llamar a cobrar.
//
// POR QUÉ HIZO FALTA UNA COLUMNA (medido el 5-sep-2026):
//   · `clientes_master` NO tenía dónde guardarlo. La vista de aging devuelve
//     `contacto` como `''::text` HARDCODEADO, justamente porque no había fuente.
//   · Existe en Switch (`switch_clientes.raw_data->>'nombreContacto'`) pero está
//     VACÍO: lleno en **3 de 847** filas de las 6 del grupo y en **1 solo** de
//     los 100 clientes que deben.
//   · Lo que sí había estaba escrito a mano en las notas del CXC: **3**
//     («Alberto levy» → Confecciones Boston · «Mohamed» → Zona Sur Dutty Free ·
//     «emad» → Internacional Belén).
//
// 🔴 EL SYNC NO LO PISA. `contacto` entra a la MISMA familia que
// telefono/celular/email/notas: lo escribe la gente. Si `sync-clientes-master`
// lo metiera en su upsert, cada corrida borraría lo que alguien escribió.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { defaultCuerpo } from "@/lib/cxc/estado-cuenta-email";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");

const MIGRACION = "supabase/migrations/20260926120000_clientes_master_contacto.sql";
/** El SQL sin sus comentarios `--`: lo que corre, no lo que explica. */
const sinComentariosSql = (src: string) =>
  src.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("la migración", () => {
  const sql = leer(MIGRACION);

  it("agrega la columna sin romper si ya existiera", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS contacto text/i);
  });

  it("🔴 rescata los 3 contactos escritos en las notas del CXC del GRUPO", () => {
    expect(sql).toMatch(/cxc_client_overrides/);
    // Acotado a la cartera del grupo: una nota de Boston no entra al directorio
    // del grupo.
    expect(sql).toMatch(/o\.cartera = 'grupo'/);
  });

  it("🔴 y los que Switch sí manda, SOLO de las 6 del grupo", () => {
    expect(sql).toMatch(/nombreContacto/);
    for (const e of ["vistana", "fashion_wear", "fashion_shoes", "active_wear", "active_shoes", "joystep"]) {
      expect(sql, `falta ${e}`).toContain(`'${e}'`);
    }
    const corre = sinComentariosSql(sql);
    expect(corre).not.toContain("confecciones_boston");
    expect(corre).not.toContain("american_classic");
  });

  it("⚠️ el rescate NO pisa lo que alguien haya escrito", () => {
    const updates = sql.split(/UPDATE clientes_master/i).slice(1);
    expect(updates.length).toBe(2);
    for (const u of updates) expect(u).toMatch(/contacto IS NULL/i);
  });

  it("el cruce de Switch va por CÓDIGO, nunca por nombre", () => {
    expect(sql).toMatch(/cm\.codigo = sc\.codigo/);
    expect(sql).not.toMatch(/cm\.nombre\w* = sc\.nombre/);
  });
});

describe("🔴 el sync de Switch NUNCA escribe `contacto`", () => {
  it("no aparece en el escritor de `clientes_master`", () => {
    const src = sinComentarios(leer("src/lib/switch-api/sync-clientes-master.ts"));
    expect(src).not.toMatch(/\bcontacto\b/);
  });

  it("ni en el escritor del directorio de Switch", () => {
    const src = sinComentarios(leer("src/lib/switch-api/clientes-directorio.ts"));
    expect(src).not.toMatch(/contacto:\s/);
  });

  it("el upsert sigue siendo por `codigo` y sin los campos que escribe la gente", () => {
    const src = sinComentarios(leer("src/lib/switch-api/sync-clientes-master.ts"));
    expect(src).toContain('onConflict: "codigo"');
    for (const campo of ["telefono", "celular", "notas"]) {
      expect(src, `«${campo}» volvió al upsert`).not.toMatch(new RegExp(`\\b${campo}:`));
    }
  });
});

describe("la ficha del cliente", () => {
  it("la casilla se edita y va ARRIBA de Correo", () => {
    // ⚠️ CAMBIÓ DE FORMA EL 5-sep-2026, no de regla. La ficha se rediseñó y el
    // bloque Contacto dejó de ser un formulario con «Editar»/«Guardar»: ahora
    // **se edita tocando el dato** (`CampoEnLinea`), un solo componente que
    // sirve para leer y para escribir. Lo que el candado protege es lo mismo:
    // que la casilla EXISTA, que se pueda EDITAR y que vaya ARRIBA de Correo —
    // es lo primero que se pregunta al llamar a cobrar («¿con quién hablo?»).
    const src = leer("src/app/clientes/[codigo]/ClienteDetail.tsx");
    expect(src).toContain('campo="contacto" rotulo="Contacto"');
    expect(src).toContain("puedeEditar={puedeEditar}");
    expect(src.indexOf('rotulo="Contacto"')).toBeLessThan(src.indexOf('rotulo="Correo"'));
    // Y el rótulo es «Correo», no «Email» (diccionario § 0, #8).
    expect(src).not.toContain('rotulo="Email"');
  });

  it("la ruta la acepta en su lista blanca, con los demás campos de la gente", () => {
    const src = sinComentarios(leer("src/app/api/clientes/[codigo]/route.ts"));
    expect(src).toContain('if ("contacto" in body) allowed.contacto');
  });

  it("⚠️ si la DDL todavía no corrió, lo DEMÁS se guarda igual", () => {
    const src = sinComentarios(leer("src/app/api/clientes/[codigo]/route.ts"));
    expect(src).toContain("faltaColumnaContacto");
    expect(src).toContain("contactoGuardado");
  });

  it("🔴 la puerta de mundo sigue cerrada: un código de Boston contesta 404", () => {
    const src = sinComentarios(leer("src/app/api/clientes/[codigo]/route.ts"));
    expect(src).toContain("esCodigoDelGrupo");
  });
});

describe("el saludo del cobro usa el contacto cuando lo hay", () => {
  it("el correo saluda por su nombre", () => {
    expect(defaultCuerpo("Septiembre 2026", "Narimy").startsWith("Buen día Narimy,")).toBe(true);
  });

  it("sin contacto, el texto es EXACTAMENTE el de siempre", () => {
    expect(defaultCuerpo("Septiembre 2026")).toBe(defaultCuerpo("Septiembre 2026", ""));
    expect(defaultCuerpo("Septiembre 2026").startsWith("Buen día,")).toBe(true);
  });

  it("⚠️ del saludo para abajo no cambió una coma", () => {
    const con = defaultCuerpo("Septiembre 2026", "Narimy").split("\n").slice(1).join("\n");
    const sin = defaultCuerpo("Septiembre 2026").split("\n").slice(1).join("\n");
    expect(con).toBe(sin);
  });

  it("el mensaje de WhatsApp / copiar también, y sin inventar un nombre", () => {
    const src = sinComentarios(leer("src/app/cxc/page.tsx"));
    expect(src).toMatch(/contacto \? `Estimado\/a \$\{contacto\},` : `Estimado\/a cliente,`/);
  });

  it("🔴 en un correo COMPARTIDO por varios clientes no se saluda a ninguno", () => {
    // Elegir a uno de los trece de `oficina@citymoda.store` sería peor que no
    // saludar a nadie.
    const src = sinComentarios(leer("src/app/api/cxc/cobrar-lote/route.ts"));
    expect(src).toMatch(/cuentas\.length === 1 \? await contactoDe/);
  });

  it("el CXC lee el contacto EN VIVO del maestro, tolerando que la DDL no corra", () => {
    const src = sinComentarios(leer("src/app/api/cxc/aging/route.ts"));
    expect(src).toContain("COLS_CON_CONTACTO");
    expect(src).toContain("COLS_SIN_CONTACTO");
    expect(src).toContain("faltaColumnaContacto");
  });
});
