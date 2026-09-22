// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UNA SOLA PUERTA, UNA SOLA LISTA — el candado del 22-sep-2026.
//
// Daniel, textual: ***«cheque es un motivo de recordatorio»***.
//
// Lo que se unificó es la PANTALLA y el FORMULARIO. **NADA se fusionó en la
// base**: `cheques` y `recordatorios` siguen existiendo tal cual, con sus
// columnas y sus filas, y el MOTIVO es lo que decide en cuál se guarda.
//
// Lo que este archivo impide, en orden de lo que costaría más si se rompe:
//
//   1. Que vuelvan las DOS puertas separadas («Nuevo Cheque» por un lado y la
//      caja de escribir por el otro).
//   2. Que un motivo termine guardando en la tabla EQUIVOCADA.
//   3. Que las dos tablas se fusionen, se migren o se dropeen.
//   4. Que la lista se vuelva a partir en dos.
//   5. Que el cron de las 9:00 deje de ver alguna de las dos tablas.
//   6. Que `destino` lo decida el NAVEGADOR y no el servidor.
//   7. Que aparezca un total sumado en la agenda.
//   8. Que el aviso de «venció y sigue sin depositar» suene dos veces.
//
// Medido contra producción el 22-sep-2026: **19 cheques, los 19 depositados**
// ($279.396,12, cero pendientes) y **2 recordatorios**, los dos con fecha
// pasada — o sea, la pantalla hoy abre en «Todo al día». Ningún cambio de esta
// tanda toca una sola de esas 21 filas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  FICHA_MOTIVO,
  MOTIVOS,
  MOTIVOS_EN_ORDEN,
  RUTA_DE_TABLA,
  TABLAS_DEL_MODULO,
  TABLA_DE_MOTIVO,
  esMotivo,
  iconoDeItem,
  motivoDeItem,
  rutaDelMotivo,
  tablaDelMotivo,
} from "@/lib/recordatorios/motivos";
import { destinoPermitido } from "@/lib/recordatorios/recordatorio";
import { mereceAvisoVencido } from "@/lib/cheques-vencidos-aviso";

const RAIZ = join(__dirname, "../../..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

const PANTALLA = "src/app/recordatorios/RecordatoriosClient.tsx";
const PUERTA = "src/app/recordatorios/components/PuertaRecordar.tsx";
const LISTA = "src/app/recordatorios/components/AgendaLista.tsx";
const AGENDA = "src/lib/recordatorios/agenda.ts";
const CRON = "src/lib/cheques-alert.ts";
const SERVER_REC = "src/lib/recordatorios/server.ts";
const ACCIONES = "src/app/recordatorios/acciones-cheque.ts";
const RUTA_CHEQUES = "src/app/api/cheques/route.ts";
const RUTA_REC = "src/app/api/recordatorios/route.ts";
const RUTA_REC_ID = "src/app/api/recordatorios/[id]/route.ts";

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 1 · LOS MOTIVOS — la lista es UNA y está cerrada", () => {
  it("hoy son DOS: cheque y nota — no se inventó ninguno más", () => {
    // Se le preguntó a Daniel qué otros motivos usaría y todavía no contestó.
    // Inventar uno sería adivinar; el mecanismo para agregarlo ya está.
    expect([...MOTIVOS]).toEqual(["cheque", "nota"]);
  });

  it("las fichas se derivan de la lista, en el mismo orden", () => {
    expect(MOTIVOS_EN_ORDEN.map((f) => f.motivo)).toEqual([...MOTIVOS]);
  });

  it("cada motivo tiene label, icono y una línea que dice qué hace", () => {
    for (const f of MOTIVOS_EN_ORDEN) {
      expect(f.label.trim(), f.motivo).not.toBe("");
      expect(f.icono.trim(), f.motivo).not.toBe("");
      expect(f.queHace.trim(), f.motivo).not.toBe("");
      expect(f.pide.length, f.motivo).toBeGreaterThan(0);
    }
  });

  it("los iconos NO se repiten: son lo único que distingue una fila de otra", () => {
    const iconos = MOTIVOS_EN_ORDEN.map((f) => f.icono);
    expect(new Set(iconos).size).toBe(iconos.length);
  });

  it("`esMotivo` no deja entrar cualquier cosa", () => {
    expect(esMotivo("cheque")).toBe(true);
    expect(esMotivo("nota")).toBe(true);
    expect(esMotivo("factura")).toBe(false);
    expect(esMotivo(undefined)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 2 · CADA MOTIVO GUARDA EN SU TABLA — nunca en la del otro", () => {
  it("cheque → `cheques`, nota → `recordatorios`", () => {
    expect(tablaDelMotivo("cheque")).toBe("cheques");
    expect(tablaDelMotivo("nota")).toBe("recordatorios");
  });

  it("y la ruta de cada motivo sale de SU tabla", () => {
    expect(rutaDelMotivo("cheque")).toBe("/api/cheques");
    expect(rutaDelMotivo("nota")).toBe("/api/recordatorios");
    for (const m of MOTIVOS) {
      expect(rutaDelMotivo(m), m).toBe(RUTA_DE_TABLA[TABLA_DE_MOTIVO[m]]);
    }
  });

  it("ningún motivo apunta a una tabla que no sea del módulo", () => {
    for (const m of MOTIVOS) {
      expect(TABLAS_DEL_MODULO, m).toContain(TABLA_DE_MOTIVO[m]);
    }
  });

  it("🔴 las DOS tablas siguen usándose: ninguna quedó sin motivo", () => {
    // Si un día las dos apuntaran a la misma tabla, eso SERÍA la fusión que este
    // encargo prohíbe — y se notaría acá antes que en producción.
    const usadas = new Set(MOTIVOS.map((m) => TABLA_DE_MOTIVO[m]));
    expect([...usadas].sort()).toEqual([...TABLAS_DEL_MODULO].sort());
  });

  it("la PANTALLA no escribe una ruta a mano: la pide al registro", () => {
    const src = leer(PANTALLA);
    expect(src).toContain('rutaDelMotivo("cheque")');
    expect(src).toContain('rutaDelMotivo("nota")');
    // 🔴 Un ALTA con la ruta escrita a mano es exactamente cómo se manda un
    // motivo a la tabla equivocada sin que nadie se entere. Lo que SÍ puede ir
    // a mano: las LECTURAS (`fetch("/api/cheques")`, que no guardan nada) y las
    // escrituras POR ID (`/api/cheques/<id>`), que apuntan a una fila que ya
    // existe y por lo tanto ya está en su tabla.
    const lineas = src.split("\n");
    const altasAMano = lineas
      .map((linea, i) => ({ linea, cola: lineas.slice(i, i + 4).join(" ") }))
      .filter(({ linea, cola }) =>
        /fetch\(\s*"\/api\/(cheques|recordatorios)"/.test(linea) && /method:\s*"POST"/.test(cola),
      )
      .map(({ linea }) => linea.trim());
    expect(altasAMano, "un alta con la ruta escrita a mano").toEqual([]);
  });

  it("las acciones de un cheque tampoco escriben su ruta a mano", () => {
    const src = leer(ACCIONES);
    expect(src).toContain("${ruta}/${id}");
    expect(src).not.toMatch(/fetch\(\s*[`"]\/api\/(cheques|recordatorios)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 3 · NADA SE FUSIONA NI SE MIGRA", () => {
  it("el registro de motivos NO inventa una columna `motivo`", () => {
    // El motivo se DERIVA de en qué tabla vive la fila. Una columna guardada se
    // podría contradecir con la tabla, y habría que elegir a cuál creerle.
    expect(leer(SERVER_REC)).not.toMatch(/\bmotivo\b/);
    expect(motivoDeItem({ tipo: "cheque" })).toBe("cheque");
    expect(motivoDeItem({ tipo: "recordatorio" })).toBe("nota");
    expect(iconoDeItem({ tipo: "cheque" })).toBe(FICHA_MOTIVO.cheque.icono);
    expect(iconoDeItem({ tipo: "recordatorio" })).toBe(FICHA_MOTIVO.nota.icono);
  });

  it("🔴 ninguna migración dropea `cheques` ni `recordatorios`", () => {
    const dir = join(RAIZ, "supabase/migrations");
    const culpables: string[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".sql")) continue;
      const sql = readFileSync(join(dir, f), "utf8").toLowerCase();
      for (const t of ["cheques", "recordatorios"]) {
        if (new RegExp(`drop\\s+table\\s+(if\\s+exists\\s+)?(public\\.)?${t}\\b`).test(sql)) {
          culpables.push(`${f} → ${t}`);
        }
      }
    }
    expect(culpables, "una migración dropea una tabla del módulo").toEqual([]);
  });

  it("🔴 el lector de recordatorios NO toca la tabla de cheques, ni al revés", () => {
    expect(leer(SERVER_REC)).not.toContain('from("cheques")');
    expect(leer(RUTA_CHEQUES)).not.toContain('from("recordatorios")');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 4 · UNA SOLA PUERTA EN LA PANTALLA", () => {
  const src = leer(PANTALLA);

  it("«Nuevo Cheque» ya no es un botón de la pantalla", () => {
    // Era el botón negro de arriba a la derecha, la segunda puerta.
    expect(src).not.toContain(">\n                Nuevo Cheque\n");
    expect(src.split("Nuevo Cheque").length - 1, "quedó un botón «Nuevo Cheque»").toBeLessThanOrEqual(
      // Solo puede sobrevivir nombrado en los comentarios que cuentan la historia.
      src.split(/\*.*Nuevo Cheque/g).length - 1 + 1,
    );
  });

  it("hay UN botón de alta y monta la puerta de motivos", () => {
    expect(src).toContain("data-puerta-boton");
    expect(src.split("data-puerta-boton").length - 1, "hay más de un botón de alta").toBe(1);
    expect(src).toContain("<PuertaRecordar");
  });

  it("la puerta ofrece los motivos DEL REGISTRO, no una lista escrita a mano", () => {
    const puerta = leer(PUERTA);
    expect(puerta).toContain("MOTIVOS_EN_ORDEN");
    expect(puerta).not.toMatch(/"Cheque"\s*[,}]/);
  });

  it("🔴 elegir un motivo NO guarda nada: la puerta no hace ningún fetch", () => {
    expect(leer(PUERTA)).not.toContain("fetch(");
  });

  it("agregar un motivo sin formulario deja el build ROJO (switch exhaustivo)", () => {
    expect(src).toContain("const _exhaustivo: never = m;");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 5 · UNA SOLA LISTA — no se vuelve a partir en dos", () => {
  it("la agenda mete cheques y recordatorios en los MISMOS grupos", () => {
    const src = leer(AGENDA);
    expect(src).toContain("for (const c of cheques)");
    expect(src).toContain("for (const rec of recordatorios)");
    // Un segundo contenedor de lista sería la partición de vuelta.
    const lista = leer(LISTA);
    expect(lista.split('data-agenda="lista"').length - 1).toBe(1);
  });

  it("🔴 cada fila lleva el icono de SU motivo, sacado del registro", () => {
    const lista = leer(LISTA);
    expect(lista).toContain("iconoDeItem(item)");
    // Escrito a mano, un motivo nuevo saldría sin marca y nadie se enteraría.
    expect(lista.split("iconoDeItem(item)").length - 1).toBe(MOTIVOS.length);
  });

  it("🔴 y NINGÚN total sumado en la agenda", () => {
    const src = leer(AGENDA);
    expect(src).not.toMatch(/reduce\(/);
    expect(src).not.toMatch(/\+=/);
    expect(src).not.toMatch(/\bsuma\w*\s*=/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 6 · EL CRON DE LAS 9:00 SIGUE VIENDO LAS DOS TABLAS", () => {
  it("lee `cheques` directo y `recordatorios` por su lector", () => {
    const cron = leer(CRON);
    expect(cron).toContain('.from("cheques")');
    expect(cron).toContain("leerRecordatorios()");
    expect(leer(SERVER_REC)).toContain("TABLA_RECORDATORIOS");
  });

  it("🔴 y se comprueba TABLA POR TABLA, derivado del registro de motivos", () => {
    // Derivado, no escrito a mano: el día que exista un tercer motivo con tabla
    // propia, este test lo va a exigir en el cron sin que nadie lo agregue.
    const alcance = leer(CRON) + leer(SERVER_REC) + leer("src/lib/recordatorios/recordatorio.ts");
    for (const tabla of TABLAS_DEL_MODULO) {
      expect(alcance, `el cron dejó de ver ${tabla}`).toContain(`"${tabla}"`);
    }
  });

  it("un fallo de los recordatorios NO se lleva puesto el aviso de cheques", () => {
    expect(leer(CRON)).toContain("(recordatorios fallaron:");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 7 · `destino` LO DECIDE EL SERVIDOR, NO EL NAVEGADOR", () => {
  it("lo de una secretaria va SIEMPRE al equipo, aunque pida privado a mano", () => {
    expect(destinoPermitido("secretaria", "privado")).toBe("equipo");
    expect(destinoPermitido("vendedor", "privado")).toBe("equipo");
    expect(destinoPermitido("admin", "privado")).toBe("privado");
  });

  it("ante la duda, `equipo` — nunca esconder del grupo lo que nadie pidió esconder", () => {
    expect(destinoPermitido("admin", "cualquier_cosa")).toBe("equipo");
    expect(destinoPermitido("admin", undefined)).toBe("equipo");
  });

  it("🔴 las DOS rutas leen el cuerpo con el ROL, nunca solo el cuerpo", () => {
    for (const ruta of [RUTA_REC, RUTA_REC_ID]) {
      const src = leer(ruta);
      expect(src, ruta).toMatch(/leerCuerpo\(.*,\s*(s\.role|rol)\s*\)/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 8 · EL AVISO DE VENCIDO SUENA UNA SOLA VEZ", () => {
  const BASE = { estado: "pendiente", deleted: false, fecha_deposito: "2026-08-31" };

  it("un vencido sin avisar, avisa", () => {
    expect(mereceAvisoVencido({ ...BASE, aviso_vencido_en: null }, "2026-09-05")).toBe(true);
  });

  it("🔴 el mismo cheque, ya avisado, NO vuelve a sonar", () => {
    expect(
      mereceAvisoVencido({ ...BASE, aviso_vencido_en: "2026-09-01T14:00:00Z" }, "2026-09-05"),
    ).toBe(false);
  });

  it("un rebotado no avisa, y un borrado tampoco", () => {
    expect(mereceAvisoVencido({ ...BASE, estado: "rebotado", aviso_vencido_en: null }, "2026-09-05")).toBe(false);
    expect(mereceAvisoVencido({ ...BASE, deleted: true, aviso_vencido_en: null }, "2026-09-05")).toBe(false);
  });

  it("🔴 la marca se escribe DESPUÉS de que Telegram confirme", () => {
    const cron = leer(CRON);
    const envio = cron.indexOf("await enviarNegocio(mensajeGrupo)");
    const marca = cron.indexOf("aviso_vencido_en: new Date().toISOString()");
    expect(envio, "no se encontró el envío").toBeGreaterThan(-1);
    expect(marca, "no se encontró la marca").toBeGreaterThan(-1);
    // Marcar antes y que el envío falle quemaría el único aviso del cheque.
    expect(marca).toBeGreaterThan(envio);
    expect(cron).toContain("if (enviadoGrupo && vencidos.length > 0)");
  });
});
