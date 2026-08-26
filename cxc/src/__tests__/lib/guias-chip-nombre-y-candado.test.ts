// ─────────────────────────────────────────────────────────────────────────────
// Lo que /guias tiene que DECIR en pantalla, y que no puede dejar de decir.
//
//   1. el chip de una línea atada muestra el NOMBRE, no solo `D-108`;
//   2. en una guía ya despachada queda claro que lo ÚNICO editable es el cliente
//      — sin eso, el chip tocable se lee como si el despacho fuera editable.
//
// Es un test ESTÁTICO sobre el fuente, igual que `guias-atar-cliente-route`:
// lo que se protege es que estas dos cosas no desaparezcan en un refactor.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const LISTA = leer("src/app/guias/components/GuiasList.tsx");
const PAGE = leer("src/app/guias/page.tsx");
const RUTA_CLIENTE = leer("src/app/api/guias/[id]/cliente/route.ts");

describe("el chip dice el NOMBRE del cliente, no solo el código", () => {
  it("existe un ChipCliente y es lo que se dibuja en las dos ramas (con y sin permiso)", () => {
    expect(LISTA).toContain("function ChipCliente");
    expect((LISTA.match(/<ChipCliente\b/g) ?? []).length).toBe(2);
  });

  it("🔴 el NOMBRE va primero y el código de apoyo — es el contrato que aprobó Daniel", () => {
    const chip = LISTA.slice(LISTA.indexOf("function ChipCliente"), LISTA.indexOf("const DESPACHO_ROLES"));
    expect(chip).toContain("{codigo}");
    expect(chip).toContain("{nombre}");
    // El nombre sale del mapa del directorio; nunca se arma acá.
    expect(chip).toMatch(/nombres\?\.get\(/);
    // Orden en el JSX: cuando hay nombre, se pinta ANTES que el código.
    const conNombre = chip.slice(chip.indexOf("{nombre ? ("), chip.indexOf(") : ("));
    expect(conNombre.indexOf("{nombre}")).toBeGreaterThan(-1);
    expect(conNombre.indexOf("{codigo}")).toBeGreaterThan(conNombre.indexOf("{nombre}"));
    // 🔴 El código es SECUNDARIO por color y tipografía, nunca por tamaño: en
    // guías nada baja de 12 px (candado `iphone-targets-guias`).
    expect(conNombre).toMatch(/font-mono/);
    expect(conNombre).toMatch(/text-emerald-600/);
    expect(conNombre).not.toMatch(/text-\[\d+px\]/);
  });

  it("🔴 sin directorio, el chip degrada al código pelado — nunca inventa un nombre", () => {
    const chip = LISTA.slice(LISTA.indexOf("function ChipCliente"), LISTA.indexOf("const DESPACHO_ROLES"));
    // Con nombre se pinta nombre+código; SIN nombre, el código solo — que es
    // exactamente como se veía antes de este cambio.
    expect(chip).toMatch(/\{nombre \? \(/);
    const sinNombre = chip.slice(chip.indexOf(") : ("), chip.indexOf("</span>\n    </span>"));
    expect(sinNombre).toContain("{codigo}");
    expect(sinNombre).not.toContain("{nombre}");
    // Y el fallback tiene que ser VACÍO. Un `|| "Cliente"` acá pintaría un
    // nombre de relleno que se lee como si el sistema supiera de quién se
    // trata — peor que no decir nada.
    const linea = chip.split("\n").find((l) => l.includes("const nombre ="));
    expect(linea).toBeDefined();
    expect(linea).toContain('?? ""');
    expect(linea).not.toMatch(/["'`][A-Za-zÀ-ÿ]/);
  });

  it("🔴 un nombre largo BAJA DE LÍNEA, no se esconde", () => {
    // Truncar sería deshacer lo que este cambio vino a arreglar. El peor caso
    // real, medido sobre los 148 clientes D-XXX vivos, es de 47 caracteres:
    // "Sistema Nacional De Proteccion Civil (Sinaproc)" (D-138).
    const chip = LISTA.slice(LISTA.indexOf("function ChipCliente"), LISTA.indexOf("const DESPACHO_ROLES"));
    expect(chip).toContain("break-words");
    expect(chip).not.toContain("truncate");
    expect(chip).not.toMatch(/max-w-\[\d/);
    expect(chip).toContain("title=");
  });

  it("la página le pasa el mapa a la lista y al modal, desde el caché del selector", () => {
    expect(PAGE).toContain("useNombresDeClientes");
    expect(PAGE).toContain("nombresPorCodigo={nombresPorCodigo}");
    expect(PAGE).toContain("nombreActual=");
  });

  it("el chip SIGUE siendo un botón — una línea mal atada tiene que poder corregirse", () => {
    // Regla del PR #443: sin esto, un código equivocado sería para siempre.
    expect((LISTA.match(/puedeAtarCliente && item\.id/g) ?? []).length).toBe(2);
    const celda = LISTA.slice(LISTA.indexOf("item.cliente_codigo ? ("), LISTA.indexOf("Atar cliente"));
    expect(celda).toContain("<button");
    expect(celda).toContain("onAtarCliente?.(item)");
  });
});

describe("🔴 LOS TRES TEXTOS QUE SE CONTRADECÍAN, RETIRADOS (25-ago-2026)", () => {
  // 🩸 QUÉ AFIRMABA ESTE BLOQUE ANTES, Y POR QUÉ SE DIO VUELTA.
  //
  // Hasta hoy exigía que el acordeón de una guía despachada dijera **"Solo se
  // puede cambiar el cliente"**. Al mismo tiempo, y sobre la MISMA guía:
  //   · `/guias/[id]` decía *"Lo único que se puede cambiar es el N° del
  //     transportista de cada envío"*;
  //   · el renglón decía *"Es lo único que se puede cambiar de una guía ya
  //     despachada"*.
  //
  // Tres frases, tres respuestas distintas a la misma pregunta — y desde que
  // Daniel abrió las correcciones de una guía firmada (punto 4: **N° del
  // transportista · cliente · facturas**) las tres son además FALSAS. Punto 14,
  // textual: *"Los 3 textos que se contradicen → fuera los tres"*.
  //
  // 🔑 LO QUE LOS REEMPLAZA NO ES UN CUARTO TEXTO: es que se VEA. En una guía
  // firmada el formulario dibuja como campo **solo** lo que se puede tocar, y
  // el resto como texto. La regla vive en `campos-editables.ts` y la aplican el
  // formulario y el servidor — con candados de conducta propios.
  //
  // ⚠️ EL BARRIDO VA SOBRE EL CÓDIGO SIN COMENTARIOS. En este repo ya pasó
  // cuatro veces que un candado de texto se cumpliera con el comentario que
  // explicaba el cambio: acá arriba mismo las tres frases están escritas.
  const sinComentarios = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");

  const CODIGO = {
    lista: sinComentarios(LISTA),
    guia: sinComentarios(leer("src/app/guias/[id]/page.tsx")),
    renglon: sinComentarios(leer("src/app/guias/components/ListaEnvios.tsx")),
  };

  it("🔴 los tres se fueron de los tres archivos", () => {
    expect(CODIGO.lista).not.toContain("Solo se puede cambiar el cliente");
    expect(CODIGO.guia).not.toContain("no se puede editar");
    expect(CODIGO.renglon).not.toContain("Es lo único que se puede cambiar");
  });

  it("🔴 y no volvieron disfrazados: ninguno de los tres archivos promete «lo único»", () => {
    // La forma del defecto era prometer exclusividad. Cualquier frase que
    // vuelva a decirlo miente igual, aunque cambie las palabras.
    for (const [donde, src] of Object.entries(CODIGO)) {
      expect(src, donde).not.toMatch(/[Ll]o único que se puede/);
      expect(src, donde).not.toMatch(/[Ss]olo se puede cambiar/);
    }
  });

  it("🔴 la verdad la dice la REGLA, y es una sola", () => {
    // Con tres textos a mano cualquiera podía quedar viejo. Ahora hay UN módulo
    // que decide qué se puede tocar, y lo leen el formulario y el servidor.
    const regla = leer("src/lib/guias/campos-editables.ts");
    expect(regla).toContain("CAMPOS_DESPACHADA");
    expect(leer("src/app/guias/components/GuiaForm.tsx")).toContain("soloCorregible");
    expect(leer("src/app/api/guias/[id]/item/route.ts")).toContain("camposEditablesDeRenglon");
  });

  it("🔴 y el candado del despacho sigue intacto: atar NO mira el estado", () => {
    const soloCodigo = RUTA_CLIENTE.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    expect(soloCodigo).not.toContain("Completada");
    expect(soloCodigo).not.toMatch(/\bestado\b/);
    expect(leer("src/app/api/guias/[id]/route.ts")).toContain("Guía ya despachada, no se puede editar");
  });
});
