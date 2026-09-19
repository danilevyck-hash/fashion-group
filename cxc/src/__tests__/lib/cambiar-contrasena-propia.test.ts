/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — CADA QUIEN CAMBIA SU CONTRASEÑA, Y SOLO LA SUYA (14-sep-2026)
 *
 * Daniel, textual: *«has que todos los usuarios puedan cambiar su contraseña»*,
 * *«no cambies la contraseña a nadie»*, y para la que ya usa otra persona:
 * *«Crea otra, esa no se puede»*.
 *
 * 🔴 POR QUÉ IMPORTA MÁS ACÁ QUE EN OTRO SISTEMA: el login de esta app es SOLO
 * contraseña — no hay campo de usuario, la contraseña ES la identidad. Dos
 * personas con la misma hacen el login ambiguo (`/api/auth` rechaza el empate
 * y las dos se quedan afuera), así que toda contraseña que se escriba tiene que
 * pasar por la MISMA comprobación. Dos comprobaciones es cómo una se queda
 * vieja y deja pasar el empate.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  AVISO_CONTRASENA_CORTA,
  AVISO_CONTRASENA_REPETIDA,
  LARGO_MINIMO_CONTRASENA,
  esHashBcrypt,
} from "@/lib/auth/contrasena-en-uso";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

const RUTA_PROPIA = "src/app/api/auth/contrasena/route.ts";
const RUTA_ADMIN = "src/app/api/admin/users/route.ts";

/* ═══ 1 · LA FRASE DE DANIEL, UNA SOLA VEZ ════════════════════════════════ */

describe("🔴 la contraseña repetida se rechaza, y con las palabras de Daniel", () => {
  it("la frase es exactamente la suya", () => {
    expect(AVISO_CONTRASENA_REPETIDA).toBe("Crea otra, esa no se puede");
  });

  it("🔴 la dicen las DOS puertas —la propia y la del admin— y ninguna la escribe a mano", () => {
    for (const rel of [RUTA_PROPIA, RUTA_ADMIN]) {
      const src = sinComentarios(leer(rel));
      expect(src, rel).toContain("AVISO_CONTRASENA_REPETIDA");
      expect(src, `${rel} tiene la frase escrita a mano`).not.toContain('"Crea otra');
    }
  });

  it("🔴 y las dos preguntan con la MISMA función, no con una copia", () => {
    for (const rel of [RUTA_PROPIA, RUTA_ADMIN]) {
      const src = sinComentarios(leer(rel));
      expect(src, rel).toContain("contrasenaEnUso");
      expect(src, rel).toContain('from "@/lib/auth/contrasena-en-uso"');
    }
  });

  it("🔴 la comprobación vive en UN archivo: nadie más compara contra todas las contraseñas", () => {
    const culpables: string[] = [];
    const anda = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return p.includes("__tests__") ? [] : anda(p);
        return /\.tsx?$/.test(e.name) ? [p] : [];
      });
    for (const abs of anda(path.join(RAIZ, "src"))) {
      const rel = path.relative(RAIZ, abs);
      if (rel === "src/lib/auth/contrasena-en-uso.ts") continue;
      if (rel === "src/app/api/auth/route.ts") continue; // el LOGIN compara, que es su trabajo
      const src = sinComentarios(leer(rel));
      // El gesto que delata una segunda comprobación: leer contraseñas SIN
      // acotar a un usuario. Leer la de UNO (para confirmar la suya) está bien.
      const re = /from\("fg_users"\)[\s\S]{0,160}?select\([^)]*password[^)]*\)([\s\S]{0,200})/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        if (!/\.eq\(\s*"(id|name)"/.test(m[1])) culpables.push(rel);
      }
    }
    expect(culpables, `\n${culpables.join("\n")}\n`).toEqual([]);
  });

  it("solo una contraseña ya hasheada cuenta como contraseña", () => {
    expect(esHashBcrypt("$2a$10$loquesea")).toBe(true);
    expect(esHashBcrypt("$2b$10$loquesea")).toBe(true);
    expect(esHashBcrypt("marcela123")).toBe(false);
    expect(esHashBcrypt(null)).toBe(false);
    expect(esHashBcrypt(undefined)).toBe(false);
  });
});

/* ═══ 2 · SOLO LA PROPIA ══════════════════════════════════════════════════ */

describe("🔴 nadie le cambia la contraseña a nadie", () => {
  const src = sinComentarios(leer(RUTA_PROPIA));

  it("🔴 a quién se le cambia sale de la COOKIE, nunca del cuerpo", () => {
    expect(src).toContain("verifySession(req.cookies.get(COOKIE_NAME)?.value)");
    expect(src).toContain('.eq("id", parsed.userId)');
    // El cuerpo solo trae las dos contraseñas. Un `id`/`name`/`userId` ahí
    // sería una puerta para cambiarle la contraseña a otra persona.
    expect(src).toMatch(/cuerpo:\s*\{\s*actual\?:\s*unknown;\s*nueva\?:\s*unknown\s*\}/);
    for (const campo of ["cuerpo.id", "cuerpo.name", "cuerpo.userId", "cuerpo.usuario"]) {
      expect(src, `el cuerpo lee «${campo}»`).not.toContain(campo);
    }
  });

  it("🔴 pide la contraseña de hoy antes de cambiarla", () => {
    expect(src).toContain("bcrypt.compare(actual");
    expect(src).toContain("La contraseña actual no es correcta.");
    // Y el orden importa: primero se confirma quién es, después se escribe.
    expect(src.indexOf("bcrypt.compare(actual")).toBeLessThan(src.indexOf("bcrypt.hash(nueva"));
  });

  it("🔴 y solo hay DOS lugares en toda la app que escriben una contraseña", () => {
    const anda = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return p.includes("__tests__") ? [] : anda(p);
        return /\.tsx?$/.test(e.name) ? [p] : [];
      });
    const escriben = anda(path.join(RAIZ, "src"))
      .map((abs) => path.relative(RAIZ, abs))
      .filter((rel) => /bcrypt\.hash\(/.test(sinComentarios(leer(rel))))
      .sort();
    // La propia (cookie) y la del admin (`requireAuth(req, ["admin"])`).
    expect(escriben).toEqual([RUTA_ADMIN, RUTA_PROPIA].sort());
    expect(sinComentarios(leer(RUTA_ADMIN))).toContain('requireAuth(req, ["admin"])');
  });

  it("🔴 un usuario sin contraseña de verdad no se puede «confirmar» a sí mismo", () => {
    expect(src).toContain("esHashBcrypt(user.password)");
    expect(src).toContain("Pídesela al administrador");
  });
});

/* ═══ 3 · LAS SESIONES Y EL RITMO ═════════════════════════════════════════ */

describe("🔴 qué pasa con las sesiones abiertas", () => {
  const src = sinComentarios(leer(RUTA_PROPIA));

  it("se cierran las DEMÁS y se conserva la de este aparato", () => {
    // Si se cambia porque alguien más la sabía, ese alguien queda afuera en el
    // acto; y quien la acaba de cambiar no se auto-expulsa.
    expect(src).toContain('.from("user_sessions")');
    expect(src).toContain("revoked: true");
    expect(src).toContain('.neq("session_token", parsed.sessionToken)');
  });

  it("🔴 se frena el ritmo con el MISMO contador del login", () => {
    // «Esa no se puede» dice, sin querer, que esa contraseña es de alguien — y
    // con login solo por contraseña, saberla es entrar como esa persona. Sin
    // freno, un usuario con sesión podría ir probando contraseñas de a una.
    expect(src).toContain("getLoginLock");
    expect(src).toContain("registerLoginFailure");
    expect(src).toContain("429");
  });

  it("queda rastro de quién la cambió", () => {
    expect(src).toContain('logActivity(user.role, "cambio_contrasena"');
  });
});

/* ═══ 4 · LA PANTALLA, PARA TODOS LOS ROLES ═══════════════════════════════ */

describe("🔴 todos los roles pueden llegar a cambiarla", () => {
  it("el botón vive donde ya vivía el de cerrar sesión, en los TRES encabezados", () => {
    for (const rel of [
      "src/components/AppHeader.tsx",
      "src/components/Sidebar.tsx",
      "src/app/home/page.tsx",
    ]) {
      expect(sinComentarios(leer(rel)), rel).toContain("BotonCambiarContrasena");
    }
  });

  it("🔴 y no se esconde por rol: no hay ninguna condición de rol alrededor", () => {
    const src = sinComentarios(leer("src/components/CambiarContrasena.tsx"));
    expect(src).not.toMatch(/role\s*===/);
    expect(src).not.toContain("allowedRoles");
  });

  it("el login ya no dice que solo el administrador puede", () => {
    const src = leer("src/app/page.tsx");
    expect(src).toContain("puedes cambiarla tú");
  });
});

/* ═══ 5 · EL LARGO MÍNIMO VIVE EN UN SOLO LUGAR ═══════════════════════════ */

/*
 * 🔴 CANDADO — TRES CARACTERES, ESCRITOS UNA VEZ (19-sep-2026)
 *
 * Daniel, textual: *«y que las contraseñas que los usuarios cambien no tenga
 * limite de nada, minimo 3 caracteres nada mas»*.
 *
 * 🩸 POR QUÉ ESTE CANDADO: el 15-sep se le quitó el mínimo de 8 a las DOS
 * rutas del servidor, pero la VENTANA de «Cambiar mi contraseña» se quedó con
 * su propio `const MINIMO = 8`. Cindy se puso una de 6 dígitos el 19-sep, la
 * ventana la frenó, nunca se guardó, y al entrar con la nueva le salía
 * «Contraseña incorrecta» —su contraseña seguía siendo la vieja—. Un mínimo
 * escrito en dos lugares es un mínimo que se desincroniza en silencio, y en
 * este sistema desincronizarse deja a alguien afuera creyendo que se cambió.
 */
describe("🔴 el largo mínimo es UNO y son 3 caracteres", () => {
  it("el número es 3, y la frase se arma con él", () => {
    expect(LARGO_MINIMO_CONTRASENA).toBe(3);
    expect(AVISO_CONTRASENA_CORTA).toContain("3");
  });

  it("🔴 la ventana y las DOS rutas lo leen del módulo: ninguna escribe su propio número", () => {
    for (const rel of [RUTA_PROPIA, RUTA_ADMIN, "src/components/CambiarContrasena.tsx"]) {
      const src = sinComentarios(leer(rel));
      expect(src, rel).toContain("LARGO_MINIMO_CONTRASENA");
      expect(src, rel).toContain('from "@/lib/auth/contrasena-en-uso"');
      // Ni un `MINIMO` propio, ni el 8 de antes escrito a mano.
      // ⚠️ El `length < 3` del NOMBRE en la ruta del admin es otra cosa y se
      // queda: lo que se prohíbe es un largo de CONTRASEÑA escrito acá.
      expect(src, `${rel} vuelve a escribir su propio mínimo`).not.toMatch(/const\s+MINIMO\b/);
      expect(src, `${rel} conserva el 8 de antes`).not.toMatch(
        /(password|nueva|contrase\u00f1a)[^\n]*length\s*<\s*\d|length\s*<\s*8/i,
      );
    }
  });

  it("🔴 y no queda ninguna otra exigencia: ni mayúsculas, ni números, ni símbolos", () => {
    for (const rel of [RUTA_PROPIA, RUTA_ADMIN, "src/components/CambiarContrasena.tsx"]) {
      const src = sinComentarios(leer(rel));
      expect(src, rel).not.toMatch(/A-Z.*a-z|\[0-9\].*test|contiene.*mayúscula/i);
    }
  });
});
