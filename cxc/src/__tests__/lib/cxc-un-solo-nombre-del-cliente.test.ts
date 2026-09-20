// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL NOMBRE DEL CLIENTE SE ESCRIBE IGUAL EN TODAS LAS PANTALLAS
// (20-sep-2026, pedido de Daniel).
//
// 🩸 QUÉ PASABA. La lista del grupo GRITABA `CITY MODA DEL ESTE SA` —el
// `nombre_normalized`, la llave con la que se consolidan las seis empresas— y
// el papel del MISMO cliente decía `City Moda Del Este, S.A.`. Guías y Reclamos
// también lo escriben capitalizado, y la pestaña de Boston ya usaba el nombre de
// Switch (`Estger hidrie`). Cuatro superficies, el mismo cliente, dos grafías.
//
// Y la regla ya existía: `nombreDelPapel()` —el nombre de Switch tal cual, y
// solo si Switch no lo manda, el normalizado capitalizado respetando siglas—.
// Lo que faltaba era usarla: había TRES copias sueltas del
// `find(...)?.nombre ?? nombre_normalized` (la hoja «Cobrar», el modal de correo
// y el cajón del estado de cuenta), cada una sin el respaldo capitalizado, y la
// lista ni eso.
//
// 🔴 EL PAREO NO SE TOCA. `nombre_normalized` sigue siendo la llave: consolida
// las seis empresas, ordena, busca, recuerda qué fila está abierta y ata las
// anotaciones. Lo único que cambia es lo que se DIBUJA.
//
// 🔴 Y ESTO NO JUNTA A BOSTON CON EL GRUPO. Daniel, textual: *«no puedes juntar
// Boston con Fashion Gr, nunca te darán los mismos nombres, por eso no se
// mezclan»*. Boston ya mostraba el nombre de Switch y lo lee de SU propia
// fuente; acá no entra ni una fila suya. Los candados de aislamiento
// (`cxc-boston-fuera-de-toda-superficie`) siguen mandando en las dos
// direcciones.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { ConsolidatedClient } from "@/lib/types";
import { nombreDeCliente } from "@/lib/cxc/nombre-cliente";
import { nombreDeCliente as nombreEnLasDescargas } from "@/lib/cxc/descargas";
import { nombreDelPapel } from "@/lib/cxc/estado-cuenta-switch";

const RAIZ = process.cwd();
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
const plano = (rel: string) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

const FILA = "src/app/cxc/components/ClientRow.tsx";
const CELULAR = "src/app/cxc/components/PanelCxcMobile.tsx";
const PAGINA = "src/app/cxc/page.tsx";
const BOSTON = "src/components/cxc/BostonTab.tsx";
const LAS_TRES = [
  "src/app/cxc/components/HojaCobrar.tsx",
  "src/app/cxc/components/EnviarEmailModal.tsx",
  "src/app/cxc/components/EstadoCuentaDrawer.tsx",
];

function cliente(llave: string, nombreSwitch: string): ConsolidatedClient {
  return {
    nombre_normalized: llave,
    companies: { vistana: { codigo: "D-77", nombre: nombreSwitch, total: 100 } },
    total: 100, current: 100, watch: 0, overdue: 0,
    correo: "", telefono: "", celular: "", contacto: "",
  } as unknown as ConsolidatedClient;
}

// El caso de Daniel, tal cual.
const CITY_MODA = cliente("CITY MODA DEL ESTE SA", "City Moda Del Este, S.A.");

// ─────────────────────────────────────────────────────────────────────────────
// 1 · La regla
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 1 · el nombre que se lee es el que escribe Switch", () => {
  it("🩸 el caso de Daniel: la lista deja de gritar", () => {
    expect(nombreDeCliente(CITY_MODA)).toBe("City Moda Del Este, S.A.");
    expect(nombreDeCliente(CITY_MODA)).not.toBe(CITY_MODA.nombre_normalized);
  });

  it("⚠️ y NO se transforma: las siglas de Switch salen tal cual", () => {
    // «ACTIVE SHOES, S.A.» está en mayúsculas en Switch y así lo imprime el
    // papel. Capitalizarlo a la fuerza daría «R.j.a.s.a.».
    expect(nombreDeCliente(cliente("ACTIVE SHOES SA", "ACTIVE SHOES, S.A."))).toBe("ACTIVE SHOES, S.A.");
    expect(nombreDeCliente(cliente("RJASA", "R.J.A.S.A."))).toBe("R.J.A.S.A.");
  });

  it("sin nombre de Switch cae a la llave CAPITALIZADA, nunca a un grito", () => {
    const sinSwitch = cliente("CITY MALL PASO CANOA", "");
    expect(nombreDeCliente(sinSwitch)).toBe("City Mall Paso Canoa");
  });

  it("🔴 es la MISMA regla del papel, no una copia", () => {
    expect(nombreDeCliente(CITY_MODA)).toBe(nombreDelPapel("City Moda Del Este, S.A.", "CITY MODA DEL ESTE SA"));
    expect(plano("src/lib/cxc/nombre-cliente.ts")).toContain("nombreDelPapel");
  });

  it("…y la que usan las descargas: una sola función, un solo nombre", () => {
    expect(nombreEnLasDescargas).toBe(nombreDeCliente);
  });

  it("un cliente sin empresas no rompe nada", () => {
    const vacio = { nombre_normalized: "SIN EMPRESAS", companies: {} } as unknown as ConsolidatedClient;
    expect(nombreDeCliente(vacio)).toBe("Sin Empresas");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Las pantallas la usan, y no hay una segunda copia
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 2 · todas las superficies del grupo la usan", () => {
  it("la fila del escritorio dibuja el nombre de Switch", () => {
    const src = plano(FILA);
    expect(src).toContain("nombreDeCliente(client)");
    expect(src, "la fila volvió a gritar la llave de pareo")
      .not.toContain("{client.nombre_normalized}");
  });

  it("la tarjeta del celular, igual", () => {
    const src = plano(CELULAR);
    expect(src).toContain("{nombreDeCliente(client)}");
    expect(src).not.toContain("{client.nombre_normalized}\n");
  });

  it("la barra de «mandar a varios» y los textos que LEE EL CLIENTE", () => {
    const src = plano(PAGINA);
    // WhatsApp y «copiar mensaje» son textos que recibe el cliente.
    expect(src).toContain("`Estado de Cuenta - ${nombreDeCliente(client)} - Fashion Group`");
    expect(src).toContain("`Estado de Cuenta - ${nombreDeCliente(client)}`");
    expect(src).toContain("nombre: nombreDeCliente(c)");
  });

  it("🔴 y NO queda una segunda copia de la regla en ningún lado", () => {
    for (const rel of [FILA, CELULAR, PAGINA, ...LAS_TRES]) {
      expect(
        plano(rel),
        `${rel} volvió a escribir la regla del nombre a mano`,
      ).not.toMatch(/find\(\(?\w+\)? => \w+\?\.nombre\)\?\.nombre \?\?/);
    }
  });

  it("las tres pantallas que tenían su copia ahora importan la única", () => {
    for (const rel of LAS_TRES) {
      expect(plano(rel), `${rel} no importa la regla`).toContain('from "@/lib/cxc/nombre-cliente"');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Lo que NO cambió
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 3 · el pareo sigue siendo `nombre_normalized`", () => {
  it("la llave sigue consolidando, ordenando, buscando y recordando la fila", () => {
    const pagina = plano(PAGINA);
    // Consolida y busca.
    expect(pagina).toContain("c.nombre_normalized.includes(q)");
    // Ordena (el comparador es el de `lib/cxc-orden`, que compara por la llave).
    expect(plano("src/lib/cxc-orden.ts")).toContain("a.nombre_normalized.localeCompare(b.nombre_normalized");
    // Recuerda qué fila está abierta.
    expect(plano("src/app/cxc/components/ClientTable.tsx")).toContain("expanded === client.nombre_normalized");
    // Y el lote sigue mandando la llave aparte, para PAREAR en el servidor.
    expect(pagina).toContain("nombreNormalizado: c.nombre_normalized");
  });

  it("⚠️ la llave sigue existiendo en la fila: cambió el dibujo, no el dato", () => {
    expect(CITY_MODA.nombre_normalized).toBe("CITY MODA DEL ESTE SA");
  });
});

describe("🔴 4 · Boston no se junta con el grupo, ni por el nombre", () => {
  it("Boston sigue leyendo SU nombre de SU propia fuente", () => {
    const src = plano(BOSTON);
    expect(src).toContain("/api/cxc/boston");
    // Dibuja `c.nombre`, el que trae su propia cartera — no el del grupo.
    expect(src).toContain("{c.nombre}");
  });

  it("🔴 y no importa nada del grupo para escribirlo", () => {
    const src = plano(BOSTON);
    for (const delGrupo of [
      "nombre-cliente", "clientes_master", "fetchEstadoCuentaData", "B2B_EMPRESA_KEYS",
    ]) {
      expect(src, `Boston se asomó al grupo por «${delGrupo}»`).not.toContain(delGrupo);
    }
  });

  it("🔴 y la regla del grupo tampoco sabe de Boston", () => {
    const regla = plano("src/lib/cxc/nombre-cliente.ts");
    expect(regla).not.toContain("boston");
    expect(regla).not.toContain("confecciones");
  });
});
