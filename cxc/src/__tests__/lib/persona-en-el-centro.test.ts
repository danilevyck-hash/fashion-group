/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DE «LA PERSONA EN EL CENTRO» (10-sep-2026)
 *
 * Daniel, al aprobar el mockup v6: *«sí me gustó, para editar una info como
 * seguros, que sea con Editar»*. Y sobre el nombre de la pestaña: *«te acepto
 * la queja»* — Configuración se llama **Personas**.
 *
 * Y la corrección que llegó después, sobre dónde quedaban las vistas de
 * «todos»: *«Reporte es para otra cosa»* — el saldo de vacaciones de todos se
 * fue a **Personas** (columna + chip), las justificaciones del período sí a
 * **Reporte** (vista propia al lado de la tabla).
 *
 * LO QUE ESTE ARCHIVO PROTEGE, punto por punto:
 *
 *   A. el interruptor arranca APAGADO y apagado el módulo es el de hoy;
 *   B. las pestañas: 6 → 4 (5 con Préstamos), Personas primera;
 *   C. las direcciones viejas aterrizan donde vive ahora cada cosa;
 *   D. la ficha se LEE y se edita con un botón «Editar»;
 *   E. las excepciones se dibujan SOLO si la persona las tiene;
 *   F. una persona nueva abre directo en Editar;
 *   G. la foto de la cédula: privada, firmada, y nunca pública;
 *   H. las cuatro secciones, con los endpoints DE SIEMPRE;
 *   I. el saldo en Personas y las justificaciones en Reporte.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
  PESTANAS_HOY,
  PESTANAS_PERSONA_EN_EL_CENTRO,
  abreEnEditar,
  esPersonaNueva,
  pestanaMudada,
  pestanaPorDefecto,
  pestanaQueSeAbre,
  pestanasDeAsistencia,
  personaEnElCentroPrendida,
  rutaDePersona,
  RUTA_PERSONA_NUEVA,
} from "@/lib/asistencia/persona-en-el-centro";
import {
  SECCIONES_DE_PERSONA,
  SIN_DATO,
  datosDeLaFicha,
  desgloseDeuda,
  excepcionesDeLaFicha,
  textoDeuda,
  textoSaldoVacaciones,
  tituloDePersona,
  type PersonaFicha,
} from "@/lib/asistencia/ficha-persona";
import {
  ACCEPT_CEDULA,
  BUCKET_CEDULAS,
  MAX_BYTES_CEDULA,
  SEGUNDOS_URL_FIRMADA,
  esPathDeCedula,
  extensionDeCedula,
  rutaDeCedula,
  textoBotonCedula,
  validarArchivoCedula,
} from "@/lib/asistencia/cedula-foto";

const raiz = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");
/** Sin comentarios: un candado no se cumple con una palabra de una explicación. */
const puro = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CLIENTE = "app/asistencia/AsistenciaClient.tsx";
const CONFIG = "app/asistencia/ConfiguracionTab.tsx";
// 🔴 10-sep-2026: la pestaña y la dirección se llaman «Colaboradores»
// (Daniel: *«no lo llames personas, sino colaboradores»*): clave `colaboradores`,
// carpeta `app/asistencia/colaboradores/`. Los nombres de los componentes y de
// las constantes (`PersonaPagina`, `RUTA_PERSONAS`) se quedan: son identificadores.
// Este candado cambió de texto, no de regla. Ver
// `asistencia-colaboradores-no-personas.test.ts`.
const PAGINA = "app/asistencia/colaboradores/PersonaPagina.tsx";
const TEXTO = "app/asistencia/colaboradores/FichaTexto.tsx";
const EDITAR = "app/asistencia/colaboradores/FichaEditar.tsx";
const REPORTE = "app/asistencia/ReporteTab.tsx";

/** Una ficha NORMAL: la de 36 de las 37 personas medidas. */
const NORMAL: PersonaFicha = {
  codigo: "7", nombre: "ANGELA GARCIA", posicion: "Secretaria", cedula: "8-1010-2403",
  empresa: "vistana", salarioMensual: 850, jornadaSemanal: 40,
  fechaIngreso: "2024-03-01", noMarcaReloj: false, pagaSeguros: true,
  baseSeguros: null, servicioProfesional: false, reparto: [], baja: null,
};

// ═════════════════════════════════════════════════════════════════════════════
describe("A. 🔴 EL INTERRUPTOR ARRANCA APAGADO", () => {
  it("sin la variable, apagado; y solo «1» o «true» lo prenden", () => {
    const antes = process.env.NEXT_PUBLIC_PERSONA_EN_EL_CENTRO;
    try {
      delete process.env.NEXT_PUBLIC_PERSONA_EN_EL_CENTRO;
      expect(personaEnElCentroPrendida()).toBe(false);
      for (const v of ["", "0", "false", "no", "si", "SÍ"]) {
        process.env.NEXT_PUBLIC_PERSONA_EN_EL_CENTRO = v;
        expect(`${v}=${personaEnElCentroPrendida()}`).toBe(`${v}=false`);
      }
      for (const v of ["1", "true"]) {
        process.env.NEXT_PUBLIC_PERSONA_EN_EL_CENTRO = v;
        expect(`${v}=${personaEnElCentroPrendida()}`).toBe(`${v}=true`);
      }
    } finally {
      if (antes === undefined) delete process.env.NEXT_PUBLIC_PERSONA_EN_EL_CENTRO;
      else process.env.NEXT_PUBLIC_PERSONA_EN_EL_CENTRO = antes;
    }
  });

  it("🔴 APAGADO, EL MÓDULO ES EXACTAMENTE EL DE HOY: 7 pestañas, en su orden", () => {
    // Es el CONTROL de todo este archivo. Si esto se rompe, apagar el
    // interruptor ya no devuelve la pantalla de siempre — que es lo único que
    // un interruptor tiene que garantizar.
    expect(pestanasDeAsistencia({ personaEnElCentro: false, planillaUnida: true }))
      .toEqual([
        ["reporte", "Reporte"],
        ["planilla", "Planilla"],
        ["prestamos", "Préstamos"],
        ["justificaciones", "Justificaciones"],
        ["vacaciones", "Vacaciones"],
        ["aprobaciones", "Aprobaciones"],
        ["configuracion", "Configuración"],
      ]);
    expect(PESTANAS_HOY[0]).toEqual(["reporte", "Reporte"]);
    expect(pestanaPorDefecto(false)).toBe("reporte");
  });

  it("🔴 apagado, la página de una persona NO existe: manda al módulo", () => {
    const pag = puro("app/asistencia/colaboradores/[codigo]/page.tsx");
    expect(pag).toMatch(/PERSONA_EN_EL_CENTRO/);
    expect(pag).toMatch(/redirect\("\/asistencia"\)/);
  });

  it("🔴 apagado, la lista de Personas NO lleva a ninguna página nueva", () => {
    // La fila sigue desplegándose, como hoy. La prueba de que las dos formas
    // conviven en el mismo componente es que el enlace cuelga del prop.
    const src = puro(CONFIG);
    expect(src).toMatch(/personaEnElCentro \? \(/);
    expect(src).toMatch(/rutaDePersona\(p\.codigo\)/);
    expect(src).toMatch(/!personaEnElCentro && abiertaEsta && borrador/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("B. 🔴 DE 6 A 4 PESTAÑAS, Y PERSONAS ES LA PRIMERA", () => {
  it("prendido: Personas · Planilla · Préstamos · Aprobaciones · Reporte", () => {
    expect(pestanasDeAsistencia({ personaEnElCentro: true, planillaUnida: true }))
      .toEqual([
        ["colaboradores", "Colaboradores"],
        ["planilla", "Planilla"],
        ["prestamos", "Préstamos"],
        ["aprobaciones", "Aprobaciones"],
        ["reporte", "Reporte"],
      ]);
  });

  it("🔴 son CUATRO sin Préstamos — las que Daniel aprobó", () => {
    const claves = pestanasDeAsistencia({ personaEnElCentro: true, planillaUnida: false })
      .map(([k]) => k);
    expect(claves).toEqual(["colaboradores", "planilla", "aprobaciones", "reporte"]);
  });

  it("🔴 Justificaciones y Vacaciones dejaron de ser pestañas", () => {
    const claves = PESTANAS_PERSONA_EN_EL_CENTRO.map(([k]) => k);
    expect(claves).not.toContain("justificaciones");
    expect(claves).not.toContain("vacaciones");
    expect(claves).not.toContain("configuracion");
  });

  it("🔴 el módulo abre en Personas, no en un cuadro", () => {
    expect(pestanaPorDefecto(true)).toBe("colaboradores");
    expect(PESTANAS_PERSONA_EN_EL_CENTRO[0]).toEqual(["colaboradores", "Colaboradores"]);
  });

  it("Préstamos sigue colgando de SU interruptor, y en las dos listas", () => {
    for (const modo of [true, false]) {
      const claves = pestanasDeAsistencia({ personaEnElCentro: modo, planillaUnida: false })
        .map(([k]) => k);
      expect(`${modo}:${claves.includes("prestamos")}`).toBe(`${modo}:false`);
    }
  });

  it("la pantalla monta «Personas» con el MISMO componente, no con uno nuevo", () => {
    // 🔴 Un segundo componente sería una segunda lista de personas.
    const src = puro(CLIENTE);
    expect(src).toMatch(/tab === "colaboradores" && <ConfiguracionTab personaEnElCentro \/>/);
    expect(src).toMatch(/tab === "configuracion" && <ConfiguracionTab \/>/);
    // Y la decisión de qué pestañas hay NO vive en el JSX.
    expect(src).toMatch(/pestanasDeAsistencia\(/);
    expect(src).toMatch(/pestanaQueSeAbre\(tabRaw, visibles\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("C. 🔴 LAS DIRECCIONES VIEJAS NO CAEN EN BLANCO", () => {
  const VISIBLES = PESTANAS_PERSONA_EN_EL_CENTRO;

  it("`?tab=configuracion` → Personas", () => {
    expect(pestanaMudada("configuracion")).toBe("colaboradores");
    expect(pestanaQueSeAbre("configuracion", VISIBLES)).toBe("colaboradores");
  });

  it("🔴 `?tab=vacaciones` → PERSONAS, que es adonde se fue el saldo", () => {
    // Daniel: *«Reporte es para otra cosa»*. El saldo es un dato DE LA PERSONA.
    expect(pestanaMudada("vacaciones")).toBe("colaboradores");
    expect(pestanaQueSeAbre("vacaciones", VISIBLES)).toBe("colaboradores");
  });

  it("🔴 `?tab=justificaciones` → REPORTE, que es lo que explican", () => {
    expect(pestanaMudada("justificaciones")).toBe("reporte");
    expect(pestanaQueSeAbre("justificaciones", VISIBLES)).toBe("reporte");
  });

  it("basura, vacío o nulo caen en la primera visible — nunca en blanco", () => {
    for (const v of ["", "   ", "cualquiera", "PERSONAS", null, undefined]) {
      expect(pestanaQueSeAbre(v, VISIBLES)).toBe("colaboradores");
    }
  });

  it("🔑 quien SOLO aprueba no aterriza en una pantalla que no puede ver", () => {
    // Julio entra con `bodega` y solo ve Aprobaciones: `?tab=configuracion`
    // suyo tiene que caer ahí, no en Personas.
    const suyas = PESTANAS_PERSONA_EN_EL_CENTRO.filter(([k]) => k === "aprobaciones");
    expect(pestanaQueSeAbre("configuracion", suyas)).toBe("aprobaciones");
    expect(pestanaQueSeAbre("colaboradores", suyas)).toBe("aprobaciones");
  });

  it("una pestaña que este rol SÍ ve se respeta tal cual", () => {
    expect(pestanaQueSeAbre("planilla", VISIBLES)).toBe("planilla");
    expect(pestanaQueSeAbre("reporte", VISIBLES)).toBe("reporte");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("D. 🔴 LA FICHA SE LEE, Y SE EDITA CON UN BOTÓN «Editar»", () => {
  it("los datos salen en orden y con su etiqueta", () => {
    const d = datosDeLaFicha(NORMAL, (x) => x);
    expect(d.map((x) => x.clave)).toEqual([
      "codigo", "posicion", "empresa", "ingreso", "cedula",
      "salario", "jornada", "reloj", "seguros",
    ]);
    expect(d.find((x) => x.clave === "salario")!.valor).toBe("$850.00");
    expect(d.find((x) => x.clave === "jornada")!.valor).toBe("40 h/semana");
    expect(d.find((x) => x.clave === "reloj")!.valor).toBe("Marca el reloj");
    expect(d.find((x) => x.clave === "seguros")!.valor).toBe("Se le retienen");
  });

  it("lo que falta es un GUION, nunca un cero ni un vacío", () => {
    const d = datosDeLaFicha(
      { ...NORMAL, posicion: null, cedula: "  ", salarioMensual: null, fechaIngreso: null },
      (x) => x,
    );
    for (const k of ["posicion", "cedula", "salario", "ingreso"]) {
      expect(`${k}=${d.find((x) => x.clave === k)!.valor}`).toBe(`${k}=${SIN_DATO}`);
    }
    // 🔴 Y el salario no dice «$0.00»: un cero grande se lee como dato roto.
    expect(d.find((x) => x.clave === "salario")!.valor).not.toContain("0.00");
  });

  it("el nombre se capitaliza y sin nombre sale el código", () => {
    expect(tituloDePersona({ nombre: "ANGELA GARCIA", codigo: "7" })).toBe("Angela Garcia");
    expect(tituloDePersona({ nombre: "  ", codigo: "39" })).toBe("Código 39");
  });

  it("🔴 hay un botón «Editar» VISIBLE, no tocar-para-editar", () => {
    const src = leer(TEXTO);
    expect(src).toMatch(/onClick=\{onEditar\}/);
    expect(src).toMatch(/>\s*Editar\s*</);
    // 🩸 Y la ficha se dibuja como TEXTO: nada de `<input>` en la vista de leer.
    expect(puro(TEXTO)).not.toMatch(/<input/);
  });

  it("🔴 el formulario tiene Guardar Y Cancelar — arrepentirse es la mitad que faltaba", () => {
    const src = leer(EDITAR);
    expect(src).toMatch(/onClick=\{onGuardar\}/);
    expect(src).toMatch(/onClick=\{onCancelar\}/);
    expect(src).toMatch(/>\s*Cancelar\s*</);
  });

  it("🔴 GUARDA EN EL ENDPOINT DE SIEMPRE, no en uno nuevo", () => {
    const src = puro(PAGINA);
    // 🩸 Se exige la RUTA PEGADA AL MÉTODO. Preguntar por las dos por separado
    // no caza nada: la misma ruta aparece en la lectura, así que un PUT mandado
    // a `/api/asistencia/persona` habría pasado con el candado flojo.
    expect(src).toMatch(/fetch\(\s*"\/api\/asistencia\/configuracion",\s*\{\s*method: "PUT"/);
    // Y lee de esa misma ruta: una sola lectura de la ficha.
    expect(src).toMatch(/fetch\("\/api\/asistencia\/configuracion", \{ cache: "no-store" \}\)/);
    // Ninguna ruta inventada para la ficha.
    expect(src).not.toMatch(/\/api\/asistencia\/(persona|ficha)"/);
  });

  it("🔴 «Dar de baja…» está, plegado, y no hay ningún botón de BORRAR", () => {
    const src = leer(EDITAR);
    expect(src).toMatch(/Dar de baja…/);
    expect(src).toMatch(/MOTIVOS_SALIDA/);
    expect(puro(EDITAR)).not.toMatch(/Eliminar ficha|Borrar persona|method: "DELETE"/);
  });

  it("🔴 las excepciones van PLEGADAS, y se abren solas si ya tiene alguna", () => {
    const src = puro(EDITAR);
    expect(src).toMatch(/useState\(\(\) => tieneExcepciones\(b\)\)/);
    expect(src).toMatch(/aria-expanded=\{verExcepciones\}/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("E. 🔴 LO RARO SE VE; LO NORMAL NO SE DIBUJA", () => {
  it("una ficha normal NO tiene ni una etiqueta de excepción", () => {
    // 🩸 Es la lección del chip verde de Guías, que salía en 221 de 222 filas:
    // un aviso que sale siempre deja de avisar.
    expect(excepcionesDeLaFicha(NORMAL)).toEqual([]);
  });

  it("cada excepción aparece SOLO cuando la persona la tiene", () => {
    const claves = (p: Partial<PersonaFicha>) =>
      excepcionesDeLaFicha({ ...NORMAL, ...p }).map((e) => e.clave);

    expect(claves({ servicioProfesional: true })).toEqual(["servicio"]);
    expect(claves({ noMarcaReloj: true })).toEqual(["no-marca"]);
    expect(claves({ pagaSeguros: false })).toEqual(["sin-seguros"]);
    expect(claves({ baseSeguros: 500 })).toEqual(["base-seguros"]);
    expect(claves({ reparto: [{ empresa: "vistana", salarioMensual: 400 }] })).toEqual(["reparto"]);
    expect(claves({ baja: "Renunció el 12 de agosto de 2026" })).toEqual(["baja"]);
  });

  it("🔑 `baseSeguros` en CERO también es una excepción — cero no es «no hay»", () => {
    // Un cero cargado a mano es una decisión: los seguros se calculan sobre $0.
    expect(excepcionesDeLaFicha({ ...NORMAL, baseSeguros: 0 }).map((e) => e.clave))
      .toEqual(["base-seguros"]);
  });

  it("las que son plata que no se paga van marcadas para mirarlas", () => {
    const ojo = (p: Partial<PersonaFicha>) =>
      excepcionesDeLaFicha({ ...NORMAL, ...p })[0]?.ojo === true;
    expect(ojo({ servicioProfesional: true })).toBe(true);
    expect(ojo({ pagaSeguros: false })).toBe(true);
    // Marcar el reloj o no es una forma de trabajar, no plata perdida.
    expect(ojo({ noMarcaReloj: true })).toBe(false);
  });

  it("todas traen una explicación: nadie tiene que adivinar qué dice el chip", () => {
    const todas = excepcionesDeLaFicha({
      ...NORMAL, servicioProfesional: true, noMarcaReloj: true, pagaSeguros: false,
      baseSeguros: 500, reparto: [{ empresa: "vistana", salarioMensual: 400 }],
      baja: "Renunció el 12 de agosto de 2026",
    });
    expect(todas).toHaveLength(6);
    for (const e of todas) expect(e.ayuda.length).toBeGreaterThan(10);
  });

  it("la lista de Personas las dibuja, y solo con el acomodo nuevo", () => {
    const src = puro(CONFIG);
    expect(src).toMatch(/personaEnElCentro \? excepcionesDeLaFicha\(p\) : \[\]/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("F. 🔴 UNA PERSONA NUEVA ABRE DIRECTO EN EDITAR", () => {
  it("`nueva` es una persona nueva, con o sin mayúsculas", () => {
    expect(esPersonaNueva("nueva")).toBe(true);
    expect(esPersonaNueva("NUEVA")).toBe(true);
    expect(esPersonaNueva(" nueva ")).toBe(true);
    expect(esPersonaNueva("7")).toBe(false);
    expect(esPersonaNueva(null)).toBe(false);
  });

  it("abre en editar si es nueva, o si esa ficha todavía no existe", () => {
    expect(abreEnEditar("nueva", false)).toBe(true);
    expect(abreEnEditar("39", false)).toBe(true);   // marca el reloj y no tiene ficha
    expect(abreEnEditar("7", true)).toBe(false);    // la ficha existe → se LEE
  });

  it("la dirección del alta y la de una persona son las de siempre", () => {
    expect(rutaDePersona("7")).toBe("/asistencia/colaboradores/7");
    expect(RUTA_PERSONA_NUEVA).toBe("/asistencia/colaboradores/nueva");
    // 🔑 El código se codifica: puede traer cualquier cosa.
    expect(rutaDePersona("a b/c")).toBe("/asistencia/colaboradores/a%20b%2Fc");
  });

  it("la página lo aplica, no lo reescribe", () => {
    expect(puro(PAGINA)).toMatch(/abreEnEditar\(codigo, !!persona\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("G. 🔴 LA FOTO DE LA CÉDULA: PRIVADA Y FIRMADA", () => {
  const RUTA = "app/api/asistencia/cedula-foto/route.ts";

  it("🔴 NUNCA `getPublicUrl` — es un documento de identidad", () => {
    const src = puro(RUTA);
    expect(src).toMatch(/createSignedUrl\(/);
    expect(src).not.toMatch(/getPublicUrl/);
    // Y el bucket nace PRIVADO en la migración.
    const sql = leer("../supabase/migrations/20261102120000_cedula_foto_bucket.sql");
    expect(sql).toMatch(/'asistencia-cedulas', 'asistencia-cedulas', false/);
    expect(sql).not.toMatch(/, true\)/);
  });

  it("el enlace VENCE, y en una hora", () => {
    expect(SEGUNDOS_URL_FIRMADA).toBe(3600);
    expect(puro(RUTA)).toMatch(/SEGUNDOS_URL_FIRMADA/);
  });

  it("🔴 en la base se guarda el PATH, nunca la URL firmada", () => {
    expect(esPathDeCedula("7/cedula-123.jpg")).toBe(true);
    expect(esPathDeCedula("https://x.supabase.co/storage/v1/object/sign/…")).toBe(false);
    expect(esPathDeCedula("")).toBe(false);
    expect(esPathDeCedula(null)).toBe(false);
    // La columna que se escribe es la de siempre, la del papel.
    expect(puro(RUTA)).toMatch(/COLUMNA_CEDULA_FOTO/);
  });

  it("🔴 la sube quien toca la ficha; la MIRA todo el que entra a Asistencia", () => {
    const src = puro(RUTA);
    // El GET solo pide Asistencia (la secretaria imprime el comprobante).
    expect(src).toMatch(/requireAsistencia\(req, asistenciaRoles\(\)\)/);
    // 🩸 SE MIRA CADA BLOQUE, no el archivo entero. Contar apariciones no caza
    // nada: el GET ya usa `cerrarPlanillaRoles` dos veces para decidir si
    // dibuja el botón, así que sacarle el guard al POST dejaba el total en pie.
    const bloque = (metodo: string) => {
      const i = src.indexOf(`export async function ${metodo}(`);
      expect(i, metodo).toBeGreaterThan(-1);
      const j = src.indexOf("export async function ", i + 10);
      return src.slice(i, j === -1 ? undefined : j);
    };
    for (const m of ["POST", "DELETE"]) {
      expect(bloque(m), m).toMatch(/if \(!cerrarPlanillaRoles\(\)\.includes\([\s\S]{0,40}\)\) \{[\s\S]{0,200}status: 403/);
    }
  });

  it("qué archivo entra lo decide UNA función, y el servidor la vuelve a llamar", () => {
    expect(validarArchivoCedula({ nombre: "c.jpg", tipo: "image/jpeg", bytes: 1000 })).toBeNull();
    expect(validarArchivoCedula({ nombre: "c.pdf", tipo: "application/pdf", bytes: 1000 })).toBeNull();
    expect(validarArchivoCedula({ nombre: "c.heic", tipo: "image/heic", bytes: 1000 })).toBeNull();
    // Un .exe no entra, y se dice qué sí entra.
    expect(validarArchivoCedula({ nombre: "x.exe", tipo: "application/x-msdownload", bytes: 10 }))
      .toMatch(/foto|PDF/i);
    // Vacío y demasiado grande, cada uno con SU mensaje.
    expect(validarArchivoCedula({ nombre: "c.jpg", tipo: "image/jpeg", bytes: 0 }))
      .toMatch(/vac[ií]o/i);
    expect(validarArchivoCedula({ nombre: "c.jpg", tipo: "image/jpeg", bytes: MAX_BYTES_CEDULA + 1 }))
      .toMatch(/MB/);
    // 🔴 El servidor NO le cree a la pantalla: llama a la misma función.
    expect(puro("app/api/asistencia/cedula-foto/route.ts")).toMatch(/validarArchivoCedula\(/);
  });

  it("los mensajes dicen qué hacer, en español y sin jerga", () => {
    const m = validarArchivoCedula({ nombre: "c.jpg", tipo: "image/jpeg", bytes: MAX_BYTES_CEDULA + 1 })!;
    expect(m).not.toMatch(/error|Error|4\d\d|5\d\d|undefined/);
    expect(m.toLowerCase()).toMatch(/recórtala|calidad/);
  });

  it("el archivo se llama por el CÓDIGO y lleva marca de tiempo", () => {
    expect(rutaDeCedula("7", 1700000000000, "image/jpeg", "foto.jpg"))
      .toBe("7/cedula-1700000000000.jpg");
    expect(extensionDeCedula("application/pdf", "x")).toBe("pdf");
    expect(extensionDeCedula("", "escaneo.PNG")).toBe("png");
    // 🩸 Sin la marca, reemplazar la foto dejaría el navegador mostrando la
    // vieja: misma dirección, mismo caché.
    const a = rutaDeCedula("7", 1, "image/jpeg", "x.jpg");
    const b = rutaDeCedula("7", 2, "image/jpeg", "x.jpg");
    expect(a).not.toBe(b);
  });

  it("se puede VER, DESCARGAR y QUITAR — si se agrega, se quita", () => {
    const src = leer("app/asistencia/colaboradores/CedulaFoto.tsx");
    expect(src).toMatch(/Ver la foto/);
    expect(src).toMatch(/Descargar/);
    // 🩸 EL BOTÓN VISIBLE, CON SU RÓTULO — no la palabra suelta.
    //
    // Dos intentos fallidos y por qué: «Quitar» a secas lo cumple el texto del
    // confirm, y `<button[^>]*hidden[^>]*quitar` nunca casa porque entre medio
    // hay un `=>` y `[^>]` se corta ahí. Se exige la línea EXACTA de apertura
    // —cualquier atributo que se cuele la rompe— más el rótulo del botón.
    expect(src).toMatch(
      /<button type="button" disabled=\{ocupado\} onClick=\{\(\) => void quitar\(\)\}/,
    );
    expect(src).toMatch(/>\s*Quitar\s*<\/button>/);
    expect(src).toMatch(/method: "DELETE"/);
    expect(BUCKET_CEDULAS).toBe("asistencia-cedulas");
    expect(ACCEPT_CEDULA).toContain("image/*");
    expect(textoBotonCedula(true)).toBe("Reemplazar la foto");
    expect(textoBotonCedula(false)).toBe("Subir la foto");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H. 🔴 LAS CUATRO SECCIONES, CON LOS ENDPOINTS DE SIEMPRE", () => {
  it("son cuatro, en orden, y tres tienen botón", () => {
    expect(SECCIONES_DE_PERSONA.map((s) => s.clave))
      .toEqual(["prestamos", "justificaciones", "vacaciones", "asistencia"]);
    expect(SECCIONES_DE_PERSONA.map((s) => s.boton))
      .toEqual(["+ Préstamo", "+ Justificar", "+ Vacación", null]);
  });

  it("la página monta las cuatro", () => {
    const src = puro(PAGINA);
    for (const c of ["SeccionPrestamos", "SeccionJustificaciones", "SeccionVacaciones", "SeccionAsistencia"]) {
      expect(src, c).toMatch(new RegExp(`<${c} codigo=`));
    }
  });

  it("🔴 cada una llama a SU ruta de siempre, con la persona ya puesta", () => {
    expect(puro("app/asistencia/colaboradores/SeccionPrestamos.tsx"))
      .toMatch(/\/api\/asistencia\/prestamos-deuda/);
    const just = puro("app/asistencia/colaboradores/SeccionJustificaciones.tsx");
    // 🩸 La ruta PEGADA al método: suelta, la caza el GET de arriba y un POST
    // a un endpoint inventado se colaba.
    expect(just).toMatch(/fetch\(\s*"\/api\/asistencia\/justificaciones",\s*\{\s*method: "POST"/);
    expect(just).toMatch(/JSON\.stringify\(\{ codigo, desde, hasta, motivo, nota \}\)/);
    const vac = puro("app/asistencia/colaboradores/SeccionVacaciones.tsx");
    expect(vac).toMatch(/"\/api\/asistencia\/vacaciones"/);
    expect(vac).toMatch(/JSON\.stringify\(\{ codigo, desde, hasta, yaPagadas \}\)/);
    expect(puro("app/asistencia/colaboradores/SeccionAsistencia.tsx"))
      .toMatch(/\/api\/asistencia\/reporte\?desde=/);
  });

  it("🔴 NINGUNA sección tiene selector de persona: la persona ES el contexto", () => {
    // 🩸 Ese selector, duplicado en las dos pestañas viejas, es el campo donde
    // se equivoca quien justifica de apuro.
    for (const f of ["SeccionJustificaciones", "SeccionVacaciones"]) {
      expect(puro(`app/asistencia/colaboradores/${f}.tsx`), f).not.toMatch(/optgroup/);
    }
  });

  it("🔴 un préstamo NUEVO se sigue creando en el módulo de Préstamos", () => {
    // La regla de que solo Daniel aprueba no se toca, y un segundo lugar para
    // crear un préstamo sería un segundo camino a la misma plata.
    //
    // ⚠️ CAMBIÓ DE DIRECCIÓN EL 10-sep-2026, y no se borró. Nació fijando el
    // texto `href="/prestamos"`, y ese texto dejó de ser correcto cuando
    // Préstamos pasó a tener UNA SOLA PUERTA: con el interruptor prendido el
    // módulo suelto ya no existe y esa dirección REBOTA, así que el enlace lo
    // resuelve `enlaceAPrestamos()` (apagado → `/prestamos`, el de siempre).
    // 🔑 LA REGLA QUE PROTEGE NO CAMBIÓ y su control se conserva INTACTO: acá
    // no se crea nada — ni un `<form>`, ni un POST. Se enlaza.
    const src = puro("app/asistencia/colaboradores/SeccionPrestamos.tsx");
    expect(src).toMatch(/enlaceAPrestamos\(\)/);
    expect(src).not.toMatch(/method: "POST"/);
    expect(src).not.toMatch(/<form/);
  });

  it("la deuda se desglosa solo con lo que tiene algo, y el cero se dice con palabras", () => {
    expect(textoDeuda(0)).toBe("No debe nada");
    expect(textoDeuda(null)).toBe("No debe nada");
    expect(textoDeuda(120.5)).toBe("Debe $120.50");
    expect(desgloseDeuda({ prestamo: 0, dano: 0, terceros: 0 })).toEqual([]);
    expect(desgloseDeuda({ prestamo: 100, dano: 0, terceros: 20 }).map((f) => f.clave))
      .toEqual(["prestamo", "terceros"]);
  });

  it("🔴 la tercera cuenta VIAJA en la respuesta: si no, la resta no cierra", () => {
    const src = puro("app/api/asistencia/prestamos-deuda/route.ts");
    expect(src).toMatch(/saldoTerceros: f\.saldoTerceros/);
    expect(src).toMatch(/cuotaTerceros: f\.cuotaTerceros/);
  });

  it("sin saldo de vacaciones NO se inventa un cero", () => {
    expect(textoSaldoVacaciones(null)).toBe("Falta el saldo");
    expect(textoSaldoVacaciones(undefined)).toBe("Falta el saldo");
    expect(textoSaldoVacaciones(1)).toBe("1 día");
    expect(textoSaldoVacaciones(12.5)).toBe("12.5 días");
  });

  it("🔴 el reporte de UNA persona se pide por CÓDIGO EXACTO, no por texto", () => {
    // 🩸 Con `q=1` entrarían el 1, el 11, el 13 y el 21: la identidad es el
    // código, nunca un parecido.
    const src = puro("app/api/asistencia/reporte/route.ts");
    expect(src).toMatch(/const soloCodigo = \(sp\.get\("codigo"\) \?\? ""\)\.trim\(\);/);
    expect(src).toMatch(/\(m\.empleado_codigo \?\? ""\)\.trim\(\) === soloCodigo/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("I. 🔴 EL SALDO EN PERSONAS, LAS JUSTIFICACIONES EN REPORTE", () => {
  it("Personas trae la columna «Vacaciones», del MISMO motor de siempre", () => {
    const src = puro(CONFIG);
    expect(src).toMatch(/"\/api\/asistencia\/vacaciones"/);
    expect(src).toMatch(/textoSaldo\(saldo\)/);
    expect(leer(CONFIG)).toMatch(/>Vacaciones</);
    // La rejilla del escritorio gana una columna, escrita completa.
    expect(src).toMatch(/COLUMNAS_CON_VACACIONES/);
    expect(leer(CONFIG)).toMatch(/lg:grid-cols-\[minmax\(0,1fr\)_9rem_5rem_6\.5rem_6rem_7rem_5rem\]/);
  });

  it("🔴 el aviso «N no tienen saldo» es ahora un chip QUE FILTRA", () => {
    // 🩸 Un cartel dice un número y no se puede tocar.
    //
    // 🔴 10-sep-2026 (tarde): el chip ya no se llama «Sin saldo». Daniel: *«veo
    // falta configurar 4 y sin saldo bastantes, todos deben de estar en sin
    // configurar no?»*. El saldo entró a «Falta completar», junto con el
    // cargo, la cédula y la fecha de ingreso (`lib/asistencia/que-le-falta.ts`).
    // La REGLA de este candado no cambió: sigue siendo un chip que filtra de
    // verdad y que no se dibuja en cero. Ver `asistencia-falta-configurar.test.ts`.
    const src = puro(CONFIG);
    expect(src).toMatch(/setFiltro\("completar"\)/);
    // 🩸 QUE FILTRE DE VERDAD, no que el chip se pinte: borrar la rama que arma
    // la lista dejaba un chip que se prende y no hace nada.
    expect(src).toMatch(/if \(filtro === "completar"\) return activos\.filter\(\(p\) => queLeFalta\(p\)\.completar\.length > 0\)/);
    expect(leer(CONFIG)).toMatch(/\{CHIP_COMPLETAR\} \(\{conteo\.completar\}\)/);
    // 🔑 Y con nadie adentro NO se dibuja: un chip en cero no ofrece nada.
    expect(src).toMatch(/conteo\.completar > 0 && \(/);
    // CONTROL: el nombre viejo no vuelve.
    expect(leer(CONFIG)).not.toMatch(/Sin saldo \(/);
  });

  it("Reporte trae «Justificaciones del período» como VISTA, no como bloque", () => {
    const src = puro(REPORTE);
    expect(src).toMatch(/PERSONA_EN_EL_CENTRO && \(/);
    expect(src).toMatch(/<JustificacionesDelPeriodo desde=\{desde\} hasta=\{hasta\} \/>/);
    // 🩸 ARRANCA CERRADA, y se pregunta por ESE estado: `useState(false)` a
    // secas lo cumplen otros cinco estados del mismo archivo.
    expect(src).toMatch(/const \[verJustificaciones, setVerJustificaciones\] = useState\(false\);/);
    expect(leer(REPORTE)).toMatch(/Justificaciones del período/);
  });

  it("🔴 en Reporte SOLO se mira y se quita: agregar es desde la persona", () => {
    const src = puro("app/asistencia/JustificacionesDelPeriodo.tsx");
    expect(src).toMatch(/method: "DELETE"/);
    expect(src).not.toMatch(/method: "POST"/);
    expect(src).not.toMatch(/optgroup/);
    // Y el nombre lleva a su página, que es donde se arregla.
    expect(src).toMatch(/rutaDePersona\(j\.empleado_codigo\)/);
  });

  it("la lista de Reporte se acota AL PERÍODO que se está mirando", () => {
    expect(puro("app/asistencia/JustificacionesDelPeriodo.tsx"))
      .toMatch(/justificaciones\?desde=\$\{desde\}&hasta=\$\{hasta\}/);
  });

  it("🔴 los nombres se muestran capitalizados, y lo guardado no se toca", () => {
    expect(puro("app/asistencia/JustificacionesDelPeriodo.tsx"))
      .toMatch(/capitalizarNombre\(etiquetaPersona\(/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 SE USA EN EL CELULAR", () => {
  const ARCHIVOS = [
    "app/asistencia/colaboradores/PersonaPagina.tsx",
    "app/asistencia/colaboradores/FichaTexto.tsx",
    "app/asistencia/colaboradores/FichaEditar.tsx",
    "app/asistencia/colaboradores/Seccion.tsx",
    "app/asistencia/colaboradores/CedulaFoto.tsx",
    "app/asistencia/colaboradores/SeccionPrestamos.tsx",
    "app/asistencia/colaboradores/SeccionJustificaciones.tsx",
    "app/asistencia/colaboradores/SeccionVacaciones.tsx",
    "app/asistencia/colaboradores/SeccionAsistencia.tsx",
    "app/asistencia/JustificacionesDelPeriodo.tsx",
  ];

  it("todo lo que se toca mide 44 px", () => {
    for (const f of ARCHIVOS) {
      const src = leer(f);
      if (!/<button|<a |<Link/.test(src)) continue;
      expect(src, f).toMatch(/min-h-\[44px\]/);
    }
  });

  it("ningún archivo pasa el techo de la casa", () => {
    for (const f of ARCHIVOS) {
      const n = leer(f).split("\n").length;
      expect(`${f}=${n <= 800}`).toBe(`${f}=true`);
    }
  });

  // 🔑 El barrido de voseo del sistema entero vive en `nada-de-voseo.test.ts` y
  // ya cubre `src/**`. Acá se comprueban solo las formas ACENTUADAS —las que de
  // verdad son voseo— sobre los archivos nuevos, para que el que rompa la regla
  // vea el nombre de SU pantalla en el fallo y no una lista de 600 archivos.
  // ⚠️ «revisa», «guarda» y «mira» son tuteo correcto y NO se prohíben: la
  // primera versión de este candado los cazaba y se puso rojo con español bueno.
  it("🔴 español neutro: ni un voseo en la pantalla nueva", () => {
    for (const f of ARCHIVOS) {
      const src = leer(f);
      // Solo las formas acentuadas de voseo, con el acento OBLIGATORIO: sin
      // él, «elegir», «revisa» y «guarda» —español correcto— caen adentro.
      expect(src, f).not.toMatch(/\b(elegí|escribí|revisá|guardá|mirá|tocá|tenés|podés|andá|acá)\b/);
    }
  });
});
