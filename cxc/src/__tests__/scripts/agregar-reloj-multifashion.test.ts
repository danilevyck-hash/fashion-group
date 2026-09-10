/* ─────────────────────────────────────────────────────────────────────────────
 * EL ARCHIVO DE DOBLE CLIC que agrega el reloj de Multifashion.
 *
 * Daniel no es programador y NO SABE DÓNDE quedó instalado el agente en la PC
 * de la oficina — esa es la razón entera por la que este archivo existe. Así
 * que el programa encuentra la carpeta solo, agrega dos renglones, prueba los
 * dos relojes y reinicia la tarea de Windows.
 *
 * ⚠️ NO HAY WINDOWS ACÁ. Lo que se prueba es todo lo que DECIDE:
 *
 *   1. leer la salida de `schtasks` (que viene en UTF-16, no en UTF-8)
 *   2. sacar la carpeta del XML de la tarea, contra un XML real
 *   3. buscar el agente a mano cuando la tarea no lo dice
 *   4. 🔴 agregar los dos renglones UNA sola vez, sin tocar nada más
 *   5. leer el resultado de la prueba de los dos relojes
 *   6. 🔴 que el .bat lleve ADENTRO exactamente este programa
 *
 * Lo que NO se puede probar desde acá queda dicho en el reporte: el doble clic
 * en Windows, `certutil`, `schtasks` y los relojes de verdad.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// @ts-expect-error — JS puro a propósito: corre en una PC de la oficina con
// Node pelado, sin `npm install` y sin build.
import {
  RELOJ_2,
  RUTAS_TIPICAS_DE_NODE,
  TAREA,
  agregarReloj2,
  buscarAgente,
  carpetaDesdeXml,
  decodificarSalida,
  hayQueActualizar,
  leerPaquete,
  nombreDeReloj,
  resumenDeProbar,
  tareasDelXml,
  versionDe,
} from "../../../scripts/agente-reloj/agregar-reloj.mjs";
// @ts-expect-error — idem.
import {
  ARCHIVOS_DEL_AGENTE,
  paqueteDelBat,
  programaDelBat,
} from "../../../scripts/_generar-bat-agregar-reloj.mjs";

const leer = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const CARPETA = "scripts/agente-reloj";
const XML = leer("src/__tests__/fixtures/schtasks-agente-reloj.xml");

/* ── 1. La salida de schtasks viene en UTF-16 ─────────────────────────────── */

describe("🩸 `schtasks /XML` devuelve UTF-16, no UTF-8", () => {
  it("un XML en UTF-16 con BOM se lee entero", () => {
    // Leerlo como texto normal deja un `\0` entre cada letra: ninguna búsqueda
    // encuentra nada y parece que la tarea no existe.
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(XML, "utf16le"),
    ]);
    const texto = decodificarSalida(utf16);
    expect(texto).toContain("<WorkingDirectory>");
    expect(texto).not.toContain("\u0000");
  });

  it("sin BOM también, mirando si el segundo byte es cero", () => {
    expect(decodificarSalida(Buffer.from(XML, "utf16le"))).toContain("agente.mjs");
  });

  it("y un UTF-8 normal no se rompe", () => {
    expect(decodificarSalida(Buffer.from("hola\n", "utf8"))).toBe("hola\n");
    expect(decodificarSalida(null)).toBe("");
  });
});

/* ── 2. La carpeta sale del XML de la tarea ───────────────────────────────── */

describe("🔴 la carpeta se DEDUCE de la tarea de Windows, no se pregunta", () => {
  it("del XML real de la tarea sale la carpeta del agente", () => {
    expect(carpetaDesdeXml(XML)).toBe("C:\\FashionGroup\\agente-reloj");
  });

  it("si no hay carpeta de trabajo, la saca de la ruta del programa", () => {
    const sinTrabajo = XML.replace(
      /<WorkingDirectory>[\s\S]*?<\/WorkingDirectory>/,
      "",
    );
    expect(carpetaDesdeXml(sinTrabajo)).toBe("C:\\FashionGroup\\agente-reloj");
  });

  it("⚠️ ante la duda devuelve nada — NUNCA una carpeta adivinada", () => {
    // Una carpeta equivocada escribiría un `.env` que nadie lee, y el reloj
    // nuevo no entraría nunca sin que nadie se entere.
    expect(carpetaDesdeXml("")).toBeNull();
    expect(carpetaDesdeXml("<Task><Actions/></Task>")).toBeNull();
    expect(carpetaDesdeXml("ERROR: el sistema no encuentra la tarea")).toBeNull();
  });

  it("no confunde el node.exe del Command con la carpeta", () => {
    const raro = XML.replace(
      "<WorkingDirectory>C:\\FashionGroup\\agente-reloj</WorkingDirectory>",
      "<WorkingDirectory>C:\\Program Files\\nodejs\\node.exe</WorkingDirectory>",
    );
    expect(carpetaDesdeXml(raro)).toBe("C:\\FashionGroup\\agente-reloj");
  });

  it("la tarea se llama como la registró el instalador", () => {
    expect(TAREA).toBe("FashionGroup-AgenteReloj");
    expect(leer(`${CARPETA}/instalar.ps1`)).toContain('$nombreTarea = "FashionGroup-AgenteReloj"');
  });
});

describe("⚠️ la tarea podría llamarse de otra forma", () => {
  // Alguien pudo recrearla a mano con otro nombre. Entonces se miran TODAS y se
  // busca la que corre `agente.mjs`.
  const DOS_TAREAS = `<?xml version="1.0" encoding="UTF-16"?>
<Tasks>
<Task><RegistrationInfo><URI>\\OneDrive Sync</URI></RegistrationInfo>
<Actions><Exec><Command>C:\\OneDrive.exe</Command></Exec></Actions></Task>
<Task><RegistrationInfo><URI>\\Reloj de la oficina</URI></RegistrationInfo>
<Actions><Exec><Command>C:\\Program Files\\nodejs\\node.exe</Command>
<Arguments>"C:\\FashionGroup\\agente-reloj\\agente.mjs"</Arguments>
<WorkingDirectory>C:\\FashionGroup\\agente-reloj</WorkingDirectory></Exec></Actions></Task>
</Tasks>`;

  it("encuentra la que corre el agente, con su nombre y su carpeta", () => {
    const t = tareasDelXml(DOS_TAREAS);
    expect(t).toHaveLength(1);
    expect(t[0].nombre).toBe("Reloj de la oficina");
    expect(t[0].carpeta).toBe("C:\\FashionGroup\\agente-reloj");
  });

  it("🔴 se busca por el XML y NO por el listado de texto", () => {
    // 🩸 `schtasks /FO LIST` sale TRADUCIDO al idioma de Windows («Tarea que se
    // ejecutará:»), así que buscar por ese rótulo se rompe en la primera PC en
    // inglés. El XML no cambia de idioma.
    const mjs = leer(`${CARPETA}/agregar-reloj.mjs`);
    expect(mjs).toContain('"/XML", "ONE"');
    expect(mjs).not.toContain("/FO");
  });

  it("si ninguna corre el agente, no devuelve ninguna", () => {
    expect(tareasDelXml("<Tasks><Task><Actions/></Task></Tasks>")).toEqual([]);
    expect(tareasDelXml("")).toEqual([]);
  });
});

/* ── 3. El plan B: buscarlo a mano ────────────────────────────────────────── */

describe("plan B: buscar el agente en el disco, acotado", () => {
  function arbol(): string {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "buscar-agente-"));
    // Dos copias: una vieja sin configurar y la de verdad, con su `.env`.
    fs.mkdirSync(path.join(raiz, "Descargas", "agente-reloj"), { recursive: true });
    fs.writeFileSync(path.join(raiz, "Descargas", "agente-reloj", "agente.mjs"), "");
    fs.mkdirSync(path.join(raiz, "FashionGroup", "agente-reloj"), { recursive: true });
    fs.writeFileSync(path.join(raiz, "FashionGroup", "agente-reloj", "agente.mjs"), "");
    fs.writeFileSync(path.join(raiz, "FashionGroup", "agente-reloj", ".env"), "RELOJ_HOST=x");
    return raiz;
  }

  it("🔴 con dos copias gana la que tiene su configuración al lado", () => {
    // La otra es una carpeta bajada y nunca configurada: escribirle el reloj 2
    // ahí sería agregarlo en un programa que no corre.
    const raiz = arbol();
    expect(buscarAgente([raiz])).toBe(path.join(raiz, "FashionGroup", "agente-reloj"));
    fs.rmSync(raiz, { recursive: true, force: true });
  });

  it("⚠️ no baja más hondo de lo que se le dice — el disco entero tarda horas", () => {
    const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "hondo-"));
    const hondo = path.join(raiz, "a", "b", "c", "d", "e", "f");
    fs.mkdirSync(hondo, { recursive: true });
    fs.writeFileSync(path.join(hondo, "agente.mjs"), "");
    expect(buscarAgente([raiz], { hondoMax: 2 })).toBeNull();
    expect(buscarAgente([raiz], { hondoMax: 8 })).toBe(hondo);
    fs.rmSync(raiz, { recursive: true, force: true });
  });

  it("una carpeta sin permiso no lo mata: se sigue con las demás", () => {
    const raiz = arbol();
    expect(buscarAgente(["/no/existe/nada", raiz])).toContain("agente-reloj");
    fs.rmSync(raiz, { recursive: true, force: true });
  });

  it("si no está, dice que no está", () => {
    const vacia = fs.mkdtempSync(path.join(os.tmpdir(), "vacia-"));
    expect(buscarAgente([vacia])).toBeNull();
    fs.rmSync(vacia, { recursive: true, force: true });
  });
});

/* ── 4. Los dos renglones ─────────────────────────────────────────────────── */

const ENV_VIEJO = [
  "# Configuración del agente del reloj.",
  "RELOJ_HOST=192.168.10.10",
  "RELOJ_USUARIO=admin",
  "RELOJ_CLAVE=secreta con espacios",
  "FASHIONGR_SECRET=la-llave",
  "FASHIONGR_URL=https://www.fashiongr.com",
  "DISPOSITIVO=reloj cboston",
  "VUELTA_MINUTOS=3",
  "VENTANA_DIAS=3",
].join("\r\n");

describe("🔴 agregar el reloj 2: una sola vez, y sin tocar nada más", () => {
  it("los dos renglones son los medidos, con el nombre del reloj", () => {
    expect(RELOJ_2).toEqual({ host: "192.168.20.98", dispositivo: "reloj acs" });
    const { texto, resultado } = agregarReloj2(ENV_VIEJO);
    expect(resultado).toBe("agregado");
    expect(texto).toContain("RELOJ_2_HOST=192.168.20.98");
    expect(texto).toContain("RELOJ_2_DISPOSITIVO=reloj acs");
  });

  it("🔴 NO se toca ni una línea de las que ya estaban", () => {
    const { texto } = agregarReloj2(ENV_VIEJO);
    for (const linea of ENV_VIEJO.split("\r\n")) {
      expect(texto).toContain(linea);
    }
    // Y el reloj 1 sigue siendo uno solo.
    expect(texto.match(/^RELOJ_HOST=/gm)).toHaveLength(1);
  });

  it("🔴 correrlo dos veces no duplica un renglón", () => {
    const una = agregarReloj2(ENV_VIEJO).texto;
    const dos = agregarReloj2(una);
    expect(dos.resultado).toBe("ya-estaba");
    expect(dos.texto).toBe(una);
    expect(una.match(/^RELOJ_2_HOST=/gm)).toHaveLength(1);
  });

  it("⚠️ una corrida que quedó a medias se COMPLETA, no se repite", () => {
    // Con la dirección puesta y el nombre no, volver a escribir las dos dejaría
    // dos `RELOJ_2_HOST` en el mismo archivo: una configuración rota.
    const aMedias = `${ENV_VIEJO}\r\nRELOJ_2_HOST=192.168.20.98\r\n`;
    const { texto, resultado } = agregarReloj2(aMedias);
    expect(resultado).toBe("agregado");
    expect(texto.match(/^RELOJ_2_HOST=/gm)).toHaveLength(1);
    expect(texto.match(/^RELOJ_2_DISPOSITIVO=/gm)).toHaveLength(1);
  });

  it("🔴 sin el reloj 1 no se escribe nada: no es la configuración esperada", () => {
    const otro = agregarReloj2("ALGO=1\r\nOTRA=2");
    expect(otro.resultado).toBe("falta-reloj-1");
    expect(otro.texto).toBe("ALGO=1\r\nOTRA=2");
  });

  it("un renglón comentado no cuenta como puesto", () => {
    expect(agregarReloj2("# RELOJ_HOST=192.168.10.10").resultado).toBe("falta-reloj-1");
    const conComentario = `${ENV_VIEJO}\r\n# RELOJ_2_HOST=192.168.20.98`;
    expect(agregarReloj2(conComentario).resultado).toBe("agregado");
  });

  it("⚠️ se conserva el fin de línea de Windows", () => {
    // Mezclarlos deja un archivo que el Bloc de notas muestra todo pegado en
    // una sola línea, y ahí nadie corrige nada.
    const { texto } = agregarReloj2(ENV_VIEJO);
    expect(texto).toContain("\r\nRELOJ_2_HOST=");
    expect(texto.replace(/\r\n/g, "")).not.toContain("\n");
    // Y en un archivo con saltos de Unix se respeta el suyo.
    const unix = agregarReloj2(ENV_VIEJO.replace(/\r\n/g, "\n")).texto;
    expect(unix).not.toContain("\r");
  });

  it("lo agregado se puede volver a leer con el lector del agente", async () => {
    // El candado de fondo: no alcanza con escribir dos renglones, tienen que
    // servir. Se le pasan al que arma la lista de relojes de verdad.
    const { armarRelojes } = await import("../../../scripts/agente-reloj/config.mjs");
    const { texto } = agregarReloj2(ENV_VIEJO);
    const env: Record<string, string> = {};
    for (const l of texto.split(/\r?\n/)) {
      const t = l.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    const relojes = armarRelojes(env) as Array<{ dispositivo: string; host: string }>;
    expect(relojes.map((r) => r.dispositivo)).toEqual(["reloj cboston", "reloj acs"]);
    expect(relojes[1].host).toBe("http://192.168.20.98");
  });
});

/* ── 4b. El programa nuevo que viaja adentro ──────────────────────────────── */

describe("🔴 la PC de la oficina tiene el programa VIEJO, y hay que cambiarlo", () => {
  // 🩸 Tiene la 1.1.0, que solo sabe leer UN reloj: agregarle el renglón del
  // segundo no serviría de nada. El repo es privado y esa PC no puede bajarlo.
  it("la versión se lee del propio archivo, no de una lista aparte", () => {
    expect(versionDe('export const VERSION = "1.1.0";')).toBe("1.1.0");
    expect(versionDe("sin version")).toBeNull();
    expect(versionDe(leer(`${CARPETA}/config.mjs`))).toBe("1.2.0");
  });

  it("🔴 con la misma versión NO se toca nada (correrlo dos veces es seguro)", () => {
    // Si se reemplazara igual, la segunda corrida pisaría el respaldo bueno con
    // el archivo nuevo y se perdería a qué volver.
    expect(hayQueActualizar("1.2.0", "1.2.0")).toBe(false);
    expect(hayQueActualizar("1.1.0", "1.2.0")).toBe(true);
    expect(hayQueActualizar(null, "1.2.0")).toBe(true);
  });

  it("sin programa adentro no se inventa nada", () => {
    expect(hayQueActualizar("1.1.0", null)).toBe(false);
  });

  it("un paquete que no se puede leer da nada, no medio programa", () => {
    // Escribir medio agente deja la PC sin traer marcaciones y sin saber por qué.
    expect(leerPaquete("x", () => "esto no es base64 {{{")).toBeNull();
    expect(leerPaquete("x", () => "")).toBeNull();
    expect(
      leerPaquete("x", () => Buffer.from(JSON.stringify({ otro: "1" })).toString("base64")),
    ).toBeNull();
    expect(
      leerPaquete("x", () => {
        throw new Error("no existe");
      }),
    ).toBeNull();
  });
});

describe("🔴 el .bat lleva el agente NUEVO adentro, entero", () => {
  const bat = leer(`${CARPETA}/agregar-reloj-multifashion.bat`);
  const paquete = paqueteDelBat(bat) as Record<string, string>;

  it("🔴 trae TODO lo que el agente importa — la lista no se escribe a mano", () => {
    // 🩸 Si falta un archivo, el agente no arranca en esa PC y nadie se entera
    // hasta que la asistencia deja de entrar. Se sigue la cadena de `import`
    // desde `agente.mjs`: el paquete tiene que ser el cierre completo.
    const pendientes = ["agente.mjs"];
    const necesarios = new Set(pendientes);
    while (pendientes.length) {
      const nombre = pendientes.pop() as string;
      const texto = leer(`${CARPETA}/${nombre}`);
      for (const m of texto.matchAll(/from\s+"\.\/([\w.-]+\.mjs)"/g)) {
        if (!necesarios.has(m[1])) {
          necesarios.add(m[1]);
          pendientes.push(m[1]);
        }
      }
    }
    expect([...necesarios].sort()).toEqual(Object.keys(paquete).sort());
    expect(necesarios.size).toBeGreaterThanOrEqual(8);
  });

  it("trae los ocho archivos del agente, idénticos a los del repo", () => {
    expect(Object.keys(paquete).sort()).toEqual([...(ARCHIVOS_DEL_AGENTE as string[])].sort());
    for (const nombre of ARCHIVOS_DEL_AGENTE as string[]) {
      expect(paquete[nombre]).toBe(leer(`${CARPETA}/${nombre}`));
    }
  });

  it("🔴 el que viaja es el que sabe leer DOS relojes", () => {
    expect(versionDe(paquete["config.mjs"])).toBe("1.2.0");
    expect(paquete["agente.mjs"]).toContain("darRonda");
    expect(paquete["ronda.mjs"]).toContain("nuevosEstados");
  });

  it("⚠️ ninguno necesita `npm install`: todo lo que usan es de Node", () => {
    // En esa PC nadie va a correr `npm install`, y no hay internet para el repo.
    for (const [nombre, texto] of Object.entries(paquete)) {
      const importa = [...String(texto).matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
      for (const dep of importa) {
        expect(dep.startsWith("node:") || dep.startsWith("./"), `${nombre} → ${dep}`).toBe(true);
      }
    }
  });

  it("el paquete lo abre el programa, sin una segunda pasada de certutil", () => {
    expect(bat).toContain('set "PAQ=%TRABAJO%\\paquete.b64"');
    expect(bat).toContain('"%NODE%" "%MJS%" "%TRABAJO%"');
  });
});

describe("🔴 el .bat se eleva solo: sin administrador no funciona ni el paso 1", () => {
  // 🩸 MEDIDO EN LA PC DE LA OFICINA (10-sep-2026): `schtasks /Query /TN
  // FashionGroup-AgenteReloj /V /FO LIST` en una terminal normal contesta
  // «Acceso denegado». Sin elevarse, este archivo no puede ni mirar la tarea.
  const bat = leer(`${CARPETA}/agregar-reloj-multifashion.bat`);

  it("pregunta si es administrador y se relanza pidiendo permiso", () => {
    // Al principio de renglón: un `REM net session` contiene el mismo texto y
    // no hace absolutamente nada.
    expect(bat).toMatch(/^net session >nul 2>&1$/m);
    expect(bat).toContain("Start-Process -FilePath '%~f0' -Verb RunAs");
  });

  it("le dice a Daniel qué va a pasar antes de que salte la ventana de Windows", () => {
    expect(bat).toContain("Windows va a pedir permiso");
    expect(bat).toMatch(/elige "Si"/);
  });

  it("🩸 adentro del bloque usa `if errorlevel`, NUNCA %errorlevel%", () => {
    // cmd reemplaza las variables de TODO el bloque antes de correr la primera
    // línea: con %errorlevel% compararía el resultado de `net session` y diría
    // siempre que falló el permiso, aunque haya salido bien.
    const bloque = bat.slice(bat.indexOf("net session"), bat.indexOf("REM -- 1."));
    expect(bloque).toContain("if errorlevel 1 (");
    expect(bloque.match(/%errorlevel%/g) ?? []).toHaveLength(1); // solo el de afuera
  });

  it("si el permiso se niega, dice cómo hacerlo a mano", () => {
    expect(bat).toContain("Ejecutar como administrador");
  });
});

/* ── 5. El resultado de la prueba ─────────────────────────────────────────── */

describe("lo que se le muestra a Daniel después de probar", () => {
  // Es la salida REAL de `agente.mjs --probar`, con los dos relojes.
  const SALIDA_BUENA = [
    "[2026-09-10 09:00:00] Agente v1.2.0. Probando la conexión…",
    "[2026-09-10 09:00:00] 2 reloj(es) configurado(s).",
    '[2026-09-10 09:00:00] Reloj "reloj cboston": http://192.168.10.10 (usuario admin)',
    "[2026-09-10 09:00:01]   ✔ El reloj contesta.",
    "[2026-09-10 09:00:02]   ✔ fashiongr contesta. Leído hasta: 2026-09-10T13:41:02Z",
    '[2026-09-10 09:00:02] Reloj "reloj acs": http://192.168.20.98 (usuario admin)',
    "[2026-09-10 09:00:03]   ✔ El reloj contesta.",
    "[2026-09-10 09:00:04]   ✔ fashiongr contesta. Leído hasta: (nunca)",
    "[2026-09-10 09:00:04] Todo bien. Ya se puede instalar para que arranque solo.",
  ].join("\r\n");

  it("una línea por reloj, con su nombre en cristiano", () => {
    const r = resumenDeProbar(SALIDA_BUENA);
    expect(r.map((x: { linea: string }) => x.linea)).toEqual([
      "✔ Reloj de Boston contesta",
      "✔ Reloj de Multifashion contesta",
    ]);
  });

  it("🔴 el que no contesta se dice con el MOTIVO, no solo con una cruz", () => {
    const caido = SALIDA_BUENA.replace(
      "[2026-09-10 09:00:03]   ✔ El reloj contesta.",
      "[2026-09-10 09:00:03]   ✘ No se llegó al reloj: connect ETIMEDOUT 192.168.20.98:80",
    );
    const r = resumenDeProbar(caido);
    expect(r[0].ok).toBe(true);
    expect(r[1].ok).toBe(false);
    expect(r[1].linea).toBe(
      "✗ Reloj de Multifashion no contesta: connect ETIMEDOUT 192.168.20.98:80",
    );
  });

  it("una salida que no se entiende no inventa relojes", () => {
    expect(resumenDeProbar("cualquier cosa")).toEqual([]);
    expect(resumenDeProbar("")).toEqual([]);
  });

  it("el nombre en pantalla es el mismo que usa la web", async () => {
    const { nombreRelojEnPantalla } = await import("@/lib/asistencia/agente");
    for (const clave of ["reloj cboston", "reloj acs", "reloj de otro lado"]) {
      expect(nombreDeReloj(clave)).toBe(nombreRelojEnPantalla(clave));
    }
  });
});

/* ── 6. UN SOLO ARCHIVO ───────────────────────────────────────────────────── */

describe("🔴 el .bat es autosuficiente: lleva el programa ADENTRO", () => {
  const bat = leer(`${CARPETA}/agregar-reloj-multifashion.bat`);
  const mjs = leer(`${CARPETA}/agregar-reloj.mjs`);

  it("🔴 lo que lleva adentro es EXACTAMENTE el programa del repo", () => {
    // 🩸 Si se cambia el .mjs y no se regenera el .bat, Daniel corre una versión
    // vieja y nadie se entera. Se compara letra por letra.
    expect(programaDelBat(bat)).toBe(mjs);
  });

  it("no depende de ningún archivo al lado: lo escribe él mismo", () => {
    // Daniel se lo lleva solo a la PC de la oficina. Un segundo archivo que
    // tenga que viajar con él es un archivo que se pierde en el camino.
    expect(bat).toContain("certutil -f -decode");
    expect(bat).toContain("%TEMP%\\fg-agregar-reloj");
  });

  it("busca Node en las mismas rutas que dice el programa", () => {
    // Escribir la lista dos veces es cómo una se queda vieja.
    for (const ruta of RUTAS_TIPICAS_DE_NODE as string[]) {
      expect(bat).toContain(`if exist "${ruta}"`);
    }
    expect(bat).toContain("%%~$PATH:N");
  });

  it("⚠️ la ventana no se cierra sola en ninguna salida que haya que leer", () => {
    // Sin esto la ventana se cierra en un parpadeo y Daniel no alcanza a leer
    // ni si funcionó.
    const trabajo = bat.slice(bat.indexOf("REM -- 1. Buscar Node.js"));
    const salidas = trabajo.match(/exit \/b/g) ?? [];
    const pausas = trabajo.match(/^ *pause$/gm) ?? [];
    expect(salidas.length).toBeGreaterThan(0);
    expect(pausas.length).toBe(salidas.length);
  });

  it("⚠️ la ÚNICA salida sin pausa es el traspaso a la ventana con permisos", () => {
    // Esa sí se cierra a propósito: el trabajo lo hace la ventana nueva, y dos
    // ventanas abiertas diciendo cosas distintas confunden más que ayudar. Pero
    // si el permiso se NIEGA, ahí sí se espera, porque hay algo que leer.
    const elevacion = bat.slice(bat.indexOf("net session"), bat.indexOf("REM -- 1."));
    expect(elevacion.match(/exit \/b/g) ?? []).toHaveLength(1);
    expect(elevacion).toContain("pause");
    expect(elevacion.indexOf("pause")).toBeLessThan(elevacion.indexOf("exit /b"));
  });

  it("se puede correr con doble clic, y no depende de ningún archivo .ps1", () => {
    // ⚠️ CAMBIÓ DE DIRECCIÓN EL 10-sep-2026, con nota. Antes exigía que la
    // palabra «powershell» no apareciera en ninguna parte. Ahora aparece UNA
    // vez, y por una razón medida: sin permisos de administrador `schtasks`
    // contesta «Acceso denegado», así que el .bat tiene que relanzarse
    // pidiéndoselos, y en Windows eso se pide con `Start-Process -Verb RunAs`.
    //
    // Lo que la regla protegía sigue protegido: es un `-Command` de una línea,
    // NO un archivo `.ps1` al lado —eso es lo que se pierde en el camino y lo
    // que choca con las políticas de ejecución—, y va con `-ExecutionPolicy
    // Bypass` explícito.
    expect(bat.startsWith("@echo off")).toBe(true);
    expect(bat).not.toMatch(/\.ps1/);
    const usos = bat.match(/powershell/gi) ?? [];
    expect(usos).toHaveLength(1);
    expect(bat).toContain("powershell -NoProfile -ExecutionPolicy Bypass -Command");
    // CONTROL de la regla vieja, en lo que sigue valiendo: la puerta es el .bat
    // y el trabajo lo hace Node, no un script de PowerShell.
    expect(bat).toContain('"%NODE%" "%MJS%"');
  });

  it("los renglones del programa no llevan un espacio al final", () => {
    // 🩸 `echo hola ` escribe el espacio, y un espacio en el medio del base64
    // rompe el decodificado. Por eso el redirect va ADELANTE.
    const renglones = bat.split(/\r?\n/).filter((l) => l.startsWith('>>"%B64%"'));
    expect(renglones.length).toBeGreaterThan(50);
    for (const l of renglones) expect(l).toBe(l.trimEnd());
  });

  it("el .bat va con fin de línea de Windows", () => {
    expect(bat.includes("\r\n")).toBe(true);
    expect(bat.replace(/\r\n/g, "")).not.toContain("\n");
  });
});
