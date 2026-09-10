/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LOS DATOS FISCALES DE LAS SEIS EMPRESAS (9-sep-2026)
 *
 * El estado de cuenta que recibe el cliente copia la forma del de Switch, que
 * arriba imprime cuatro líneas de la empresa QUE COBRA. Hasta hoy solo se
 * conocía Fashion Wear y las otras cinco salían sin esas líneas. Daniel bajó de
 * Switch el papel de las seis y dictó, verbatim, el nombre legal y la
 * identificación de cada una.
 *
 * Dos cosas se apartan de lo que dice Switch, por decisión suya:
 *
 *   · **El teléfono va VACÍO en las seis** — Switch tampoco lo trae.
 *   · **El correo de las SEIS es `info@fashiongr.com`**. Textual: *«los correos
 *     de todos debe de ser info@fashiongr.com»*. Los papeles de Switch traen
 *     `vistanaa@cwpanama.net`, `alberto@cboston.net`,
 *     `albertolevyalberto@cboston.net` y `fashionvista.pa@gmail.com`; **ninguno
 *     se usa**.
 *
 * 🔑 Y ESE CORREO SE ESCRIBE UNA SOLA VEZ. Repetido seis veces, el día que
 * cambie queda corregido en cinco empresas y viejo en la sexta.
 *
 * 🔴 Y NINGUNA EMPRESA PUEDE SALIR CON LOS DATOS DE OTRA: escribir en el papel
 * de un cliente la identificación de la empresa equivocada es una mentira
 * fiscal, no un detalle de forma.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  CORREO_DEL_GRUPO,
  EMPRESA_FISCAL,
  fichaFiscal,
} from "@/lib/cxc/empresa-fiscal";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

/** La empresa de cartera aparte que TAMBIÉN tiene ficha, con su propio correo. */
const BOSTON = "confecciones_boston";

const raiz = process.cwd();
const fuente = readFileSync(path.join(raiz, "src/lib/cxc/empresa-fiscal.ts"), "utf8");

/** Lo que Daniel dictó, verbatim de los papeles de Switch del 9-sep-2026. */
const DICTADO: Array<[string, string, string]> = [
  ["fashion_wear", "FASHION WEAR, INC", "40254-103-278837"],
  ["vistana", "VISTANA INTERNATIONAL PANAMA, S.A.", "626251-1-455645"],
  ["fashion_shoes", "FASHION SHOES HOLDINGS, S.A.", "1481660-1-643734"],
  ["active_shoes", "ACTIVE SHOES S.A", "155727670-2-2022"],
  ["active_wear", "ACTIVE WEAR S.A", "155727673-2-2022"],
  ["joystep", "JOYSTEP CORP", "155769235-2-2025"],
];

// ═════════════════════════════════════════════════════════════════════════════
// 1 · ESTÁN LAS SEIS, CON LO QUE DANIEL DICTÓ
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 1. las SEIS empresas del grupo tienen su ficha", () => {
  // 🔄 CAMBIÓ DE DIRECCIÓN, CON NOTA (9-sep-2026, más tarde el mismo día). Acá
  // se exigía que la lista fuera EXACTAMENTE las 6 del grupo. Daniel bajó el
  // papel de Confecciones Boston y dictó sus cuatro líneas, así que ahora la
  // lista es «las 6 + Boston»: sigue siendo EXACTA y cerrada —una empresa nueva
  // del grupo la sigue reclamando, y una octava clave rompe el build—, y el
  // CONTROL de que nadie hereda nada se conserva abajo con Multifashion.
  it("la lista cubre las 6 del CXC del grupo — ni una menos", () => {
    for (const k of B2B_EMPRESA_KEYS) {
      expect(Object.keys(EMPRESA_FISCAL), `${k} se quedó sin ficha`).toContain(k);
    }
  });

  // 🩸 Y MULTIFASHION DESDE EL 10-SEP-2026. Daniel mandó su Aviso de Operación
  // (Ministerio de Comercio e Industrias) al entrar ACS a Asistencia y Planilla:
  // su nombre legal y su RUC van en el encabezado del COMPROBANTE DE PAGO.
  //
  // 🔑 LA REGLA QUE ESTE CANDADO PROTEGE NO CAMBIÓ: la lista es CERRADA y
  // escrita a mano. Lo que se agregó es una ficha dictada de un papel oficial,
  // no una derivada de un número.
  //
  // ⚠️ ACS NO cobra por este camino: no tiene estado de cuenta. Su ficha existe
  // para el papel que firma su gente.
  it("y NADIE MÁS que ellas, Confecciones Boston y Multifashion", () => {
    expect([...Object.keys(EMPRESA_FISCAL)].sort())
      .toEqual([...B2B_EMPRESA_KEYS, BOSTON, "american_classic"].sort());
  });

  it("ninguna sale con el nombre legal ni la identificación en blanco", () => {
    for (const key of B2B_EMPRESA_KEYS) {
      const f = fichaFiscal(key, "NO DEBERÍA VERSE");
      expect(f.legal, `${key} salió sin nombre legal`).not.toBe("");
      expect(f.legal, `${key} cayó al nombre de la pantalla`).not.toBe("NO DEBERÍA VERSE");
      expect(f.identificacion, `${key} salió sin identificación`).not.toBe("");
    }
  });

  it("y dice lo que Daniel dictó, letra por letra", () => {
    for (const [key, legal, identificacion] of DICTADO) {
      const f = fichaFiscal(key, "X");
      expect(f.legal, key).toBe(legal);
      expect(f.identificacion, key).toBe(identificacion);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · EL CORREO ES UNO SOLO, Y EL TELÉFONO VA VACÍO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 2. el correo de las seis es info@fashiongr.com", () => {
  it("es el mismo en las seis", () => {
    expect(CORREO_DEL_GRUPO).toBe("info@fashiongr.com");
    for (const key of B2B_EMPRESA_KEYS) {
      expect(fichaFiscal(key, "X").correo, key).toBe(CORREO_DEL_GRUPO);
    }
    const correos = new Set(B2B_EMPRESA_KEYS.map((k) => fichaFiscal(k, "X").correo));
    expect(correos.size, "alguna empresa quedó con otro correo").toBe(1);
  });

  it("🔑 y se escribe UNA sola vez en el archivo, nunca seis", () => {
    // Repetido por empresa, el día que cambie queda corregido en cinco y viejo
    // en la sexta. Se cuenta fuera de los comentarios: el encabezado lo nombra
    // al contar la decisión.
    const codigo = fuente.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const veces = (codigo.match(/info@fashiongr\.com/g) ?? []).length;
    expect(veces, "el correo está escrito más de una vez").toBe(1);
    expect(codigo).toContain("CORREO_DEL_GRUPO");
  });

  it("⚠️ los correos viejos de Switch NO se usan en ninguna de las seis", () => {
    const viejos = [
      "vistanaa@cwpanama.net",
      "alberto@cboston.net",
      "albertolevyalberto@cboston.net",
      "fashionvista.pa@gmail.com",
    ];
    for (const key of B2B_EMPRESA_KEYS) {
      const correo = fichaFiscal(key, "X").correo;
      for (const v of viejos) expect(correo, `${key} quedó con ${v}`).not.toBe(v);
    }
  });

  it("🔴 el teléfono va VACÍO en las seis (decisión de Daniel)", () => {
    for (const key of B2B_EMPRESA_KEYS) {
      expect(fichaFiscal(key, "X").telefono, key).toBe("");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · NADIE SALE CON LOS DATOS DE OTRO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 3. ninguna empresa puede salir con los datos de otra", () => {
  it("las seis identificaciones son distintas entre sí", () => {
    const ids = B2B_EMPRESA_KEYS.map((k) => fichaFiscal(k, "X").identificacion);
    expect(new Set(ids).size, "dos empresas comparten identificación").toBe(6);
  });

  it("los seis nombres legales son distintos entre sí", () => {
    const legales = B2B_EMPRESA_KEYS.map((k) => fichaFiscal(k, "X").legal);
    expect(new Set(legales).size, "dos empresas comparten nombre legal").toBe(6);
  });

  it("cada clave devuelve SU ficha, no la de la vecina", () => {
    for (const [key, legal, identificacion] of DICTADO) {
      for (const [otra, otroLegal, otraId] of DICTADO) {
        if (otra === key) continue;
        expect(legal, `${key} tomó el nombre de ${otra}`).not.toBe(otroLegal);
        expect(identificacion, `${key} tomó la identificación de ${otra}`).not.toBe(otraId);
      }
    }
  });

  it("⚠️ CONTROL: una clave que no está en la lista no hereda nada", () => {
    // Una clave desconocida sale con el nombre de la pantalla y las tres líneas
    // en blanco, nunca con los datos de una del grupo. (Boston está desde el
    // 9-sep-2026 y Multifashion desde el 10-sep-2026, cada una con SU ficha.)
    for (const key of ["lo_que_sea", "empresa_nueva"]) {
      const f = fichaFiscal(key, "Nombre Corto");
      expect(f.legal, key).toBe("Nombre Corto");
      expect(f.identificacion, key).toBe("");
      expect(f.telefono, key).toBe("");
      expect(f.correo, key).toBe("");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · 🔴 CONFECCIONES BOSTON — SUS CUATRO LÍNEAS, Y SU CORREO NO ES EL DEL GRUPO
//
// Daniel bajó su papel de Switch (9-sep-2026) y dictó, verbatim:
//
//     CONFECCIONES BOSTON S.A
//     Identificación: 655-544-133465
//     TEL:
//     ventas@cboston.net
//
// 🔴 Y ACÁ SE CRUZAN DOS REGLAS. Para las seis del grupo, Daniel dictó que el
// correo del papel es `info@fashiongr.com` y que los de Switch no se usan. Para
// Boston manda la otra: **su papel no dice Fashion Group en ninguna parte** —no
// lleva el logo del grupo ni `fashiongr.com` en el pie, porque lo lee un cliente
// que le compró a Confecciones Boston—. Meterle el correo del grupo en la cabeza
// le devolvería justo lo que se le sacó. Por eso usa el de SU papel.
//
// ⚠️ El REMITENTE del correo no cambia: sigue saliendo por nuestro dominio
// (Daniel, preguntado: *«fashiongr»*). Lo que cambia es la cabeza del PDF.
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 4. la cabeza del papel de Confecciones Boston", () => {
  it("trae sus cuatro líneas, letra por letra", () => {
    const f = fichaFiscal(BOSTON, "NO DEBERÍA VERSE");
    expect(f.legal).toBe("CONFECCIONES BOSTON S.A");
    expect(f.identificacion).toBe("655-544-133465");
    expect(f.telefono).toBe(""); // ⚠️ Switch tampoco lo trae
    expect(f.correo).toBe("ventas@cboston.net");
  });

  it("🔴 su correo NO es el del grupo — su papel no dice Fashion Group", () => {
    const f = fichaFiscal(BOSTON, "X");
    expect(f.correo).not.toBe(CORREO_DEL_GRUPO);
    expect(f.correo).not.toContain("fashiongr.com");
  });

  it("🔴 y no toma nada de una empresa del grupo", () => {
    const f = fichaFiscal(BOSTON, "X");
    for (const key of B2B_EMPRESA_KEYS) {
      const g = fichaFiscal(key, "X");
      expect(f.legal, `Boston tomó el nombre de ${key}`).not.toBe(g.legal);
      expect(f.identificacion, `Boston tomó la identificación de ${key}`).not.toBe(g.identificacion);
    }
  });

  it("⚠️ CONTROL: ninguna de las seis se llevó el correo de Boston", () => {
    for (const key of B2B_EMPRESA_KEYS) {
      expect(fichaFiscal(key, "X").correo, key).toBe(CORREO_DEL_GRUPO);
    }
  });

  it("🔑 el correo del grupo se sigue escribiendo UNA sola vez", () => {
    const codigo = fuente.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect((codigo.match(/info@fashiongr\.com/g) ?? []).length).toBe(1);
    expect((codigo.match(/ventas@cboston\.net/g) ?? []).length).toBe(1);
  });
});
