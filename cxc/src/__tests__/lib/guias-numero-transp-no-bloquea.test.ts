// ─────────────────────────────────────────────────────────────────────────────
// EL N° DEL TRANSPORTISTA NO BLOQUEA — Y LO QUE SÍ BLOQUEA NO SE AFLOJA.
//
// Daniel, 17-ago-2026, sobre lo que pasa cuando llega el camión: *"a veces el
// transportista lo da, a veces no"*. Antes el despacho exigía que al menos una
// línea trajera el número, y esa exigencia no describe el trabajo real: el
// camión se carga y se firma, y el número aparece —o no— después. Un requisito
// que la realidad no puede cumplir se paga con ceros tecleados para destrabar el
// botón (GT-194, GT-195 y GT-196 tienen `numero_guia_transp = "0"`).
//
// 🔴 LA MITAD QUE IMPORTA MÁS ES LA QUE **NO** CAMBIÓ. Placa, quién recibe,
// cédula y **las dos firmas** siguen bloqueando, y no es negociable: cuando nada
// bloqueaba se cerraron 65 guías sin firma; el bloqueo se puso el 10-ago-2026 y
// desde entonces son 0 de 15. Preguntado explícito, Daniel: *"Placa · quién
// recibe · cédula debería de bloquear no?"* — sí.
//
// Y lo que falta no se pierde: queda MARCADO (`guiaSinNumeroTransp`), en la guía
// y en la lista de guías.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  faltaParaDespachar,
  pendienteNumeroTransp,
  textoFalta,
  type EstadoDespacho,
} from "@/lib/guias/falta-para-despachar";
import {
  guiaSinNumeroTransp,
  numeroTranspImpreso,
  numeroTranspUnicoImpreso,
} from "@/lib/guias/modo-despacho";
import { validarNumeroTransp } from "@/lib/guias/numero-transp-tarde";
import { camposEditablesDeRenglon } from "@/lib/guias/campos-editables";

/** ⚠️ Los comentarios se borran ANTES de barrer: en este repo ya falló cuatro
 *  veces un candado que se cumplía con su propia explicación. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const leer = (p: string) => sinComentarios(readFileSync(join(process.cwd(), p), "utf8"));
const RUTA = leer("src/app/api/guias/[id]/route.ts");
const MODULO = leer("src/lib/guias/falta-para-despachar.ts");
const FORM = leer("src/app/guias/components/DespachoForm.tsx");

const lleno: EstadoDespacho = {
  tipoDespacho: "externo",
  placa: "AB-1234",
  receptor: "Juan",
  cedula: "8-8-8",
  chofer: "",
  tieneFirma1: true,
  tieneFirma2: true,
};

describe("🔴 el N° del transportista NO bloquea", () => {
  it("sin ningún número en ninguna línea, no falta nada", () => {
    expect(faltaParaDespachar(lleno)).toEqual([]);
  });

  it("el módulo puro ni siquiera RECIBE los números — no hay qué chequear", () => {
    // Mientras vivieran adentro, volver a exigirlos era agregar dos líneas.
    // El objeto que describe "lo que bloquea" no lo lleva.
    const iTipo = MODULO.indexOf("export interface EstadoDespacho");
    const tipo = MODULO.slice(iTipo, MODULO.indexOf("}", iTipo));
    expect(tipo).not.toContain("numerosTransp");
    const i = MODULO.indexOf("export function faltaParaDespachar");
    const cuerpo = MODULO.slice(i, MODULO.indexOf("export function", i + 10));
    expect(cuerpo).not.toContain("numerosTransp");
    // ⚠️ "la firma del transportista" sí vive ahí, y tiene que vivir: es una
    // firma, no el número. Por eso no se barre la palabra suelta.
    expect(cuerpo).not.toMatch(/N° de gu[íi]a/);
  });

  it("ninguna lista de faltantes puede nombrar el número", () => {
    const todo = faltaParaDespachar({
      tipoDespacho: "externo",
      placa: "",
      receptor: "",
      cedula: "",
      chofer: "",
      tieneFirma1: false,
      tieneFirma2: false,
    });
    // ⚠️ "la firma del transportista" SÍ está y tiene que estar: es una firma,
    // no el número. Lo que no puede aparecer es el N° de su guía.
    expect(todo.join(" ")).not.toMatch(/N° de gu[íi]a/i);
    expect(textoFalta(todo)).not.toMatch(/gu[íi]a del transportista/i);
  });

  it("el SERVIDOR tampoco lo pide — si no, el botón verde y el PUT rechazando", () => {
    expect(RUTA).not.toContain('tipo_despacho === "externo" && !numero_guia_transp');
    expect(RUTA).not.toContain("Falta el N° de guía del transportista");
  });
});

describe("🔴 LO QUE SÍ BLOQUEA, y no se aflojó", () => {
  it("placa, recibido por y cédula siguen apagando el botón", () => {
    const falta = faltaParaDespachar({ ...lleno, placa: "", receptor: "", cedula: "" });
    expect(falta).toEqual(["placa", "recibido por", "cédula"]);
    expect(textoFalta(falta)).toBe("Falta: placa, recibido por y cédula");
  });

  it("LAS DOS FIRMAS bloquean — es lo que cerró las 65 guías sin firma", () => {
    expect(faltaParaDespachar({ ...lleno, tieneFirma1: false })).toEqual([
      "la firma del transportista",
    ]);
    expect(faltaParaDespachar({ ...lleno, tieneFirma2: false })).toEqual([
      "la firma del entregador",
    ]);
    expect(faltaParaDespachar({ ...lleno, tieneFirma1: false, tieneFirma2: false })).toHaveLength(2);
  });

  it("en entrega directa: chofer sí, placa no, número tampoco", () => {
    const directo = { ...lleno, tipoDespacho: "directo" as const, placa: "", chofer: "" };
    expect(faltaParaDespachar(directo)).toEqual(["chofer"]);
    expect(faltaParaDespachar({ ...directo, chofer: "Pedro" })).toEqual([]);
  });

  it("el servidor sigue exigiendo placa, receptor y cédula", () => {
    expect(RUTA).toContain('{ error: "Placa del vehículo requerida" }');
    expect(RUTA).toContain('{ error: "Nombre del receptor requerido" }');
    expect(RUTA).toContain('{ error: "Cédula del receptor requerida" }');
  });

  it("el botón apagado sigue diciendo QUÉ falta (el patrón 'Falta: …')", () => {
    expect(FORM).toContain("textoFalta(faltantes)");
    expect(FORM).toContain("disabled={!puedeDespachar || bSaving}");
  });
});

describe("🔴 lo que falta queda MARCADO", () => {
  const base = {
    estado: "Completada",
    tipo_despacho: "externo",
    modo_entrega: "transportista",
  };

  it("una guía que salió sin número queda marcada", () => {
    expect(guiaSinNumeroTransp({ ...base, numero_guia_transp: "", guia_items: [{}] })).toBe(true);
    expect(guiaSinNumeroTransp({ ...base, numero_guia_transp: null, guia_items: [] })).toBe(true);
  });

  it("un '0' pelado cuenta como vacío — es lo que alguien tecleó, no un número", () => {
    expect(guiaSinNumeroTransp({ ...base, numero_guia_transp: "0" })).toBe(true);
    // Y nada que CONTENGA un 0 se pierde.
    expect(guiaSinNumeroTransp({ ...base, numero_guia_transp: "EK0700" })).toBe(false);
    expect(guiaSinNumeroTransp({ ...base, numero_guia_transp: "00" })).toBe(false);
  });

  it("con número —propio o heredado de la cabecera— no se marca", () => {
    expect(
      guiaSinNumeroTransp({ ...base, numero_guia_transp: "TR-1", guia_items: [{}, {}] }),
    ).toBe(false);
    expect(
      guiaSinNumeroTransp({
        ...base,
        numero_guia_transp: "",
        guia_items: [{ numero_guia_transp: "TR-9" }, {}],
      }),
    ).toBe(false);
  });

  it("en ENTREGA DIRECTA nunca se marca: no hay transportista a quien pedírselo", () => {
    expect(
      guiaSinNumeroTransp({
        estado: "Completada",
        tipo_despacho: "directo",
        modo_entrega: "entrega_directa",
        numero_guia_transp: "",
      }),
    ).toBe(false);
  });

  it("una guía PENDIENTE no se marca: todavía se está llenando", () => {
    expect(
      guiaSinNumeroTransp({
        estado: "Pendiente Bodega",
        modo_entrega: "transportista",
        numero_guia_transp: "",
      }),
    ).toBe(false);
  });

  it("la lista de guías dibuja la marca, y la página de la guía también", () => {
    const lista = leer("src/app/guias/components/GuiasList.tsx");
    const pagina = leer("src/app/guias/[id]/page.tsx");
    expect(lista).toContain("guiaSinNumeroTransp(g)");
    expect(lista).toContain("Falta N° transportista");
    expect(pagina).toContain("guiaSinNumeroTransp(g)");
  });

  it("`pendienteNumeroTransp` es la misma regla, y no decide nada más", () => {
    expect(pendienteNumeroTransp("externo", ["", "  ", null])).toBe(true);
    expect(pendienteNumeroTransp("externo", ["", "TR-2"])).toBe(false);
    expect(pendienteNumeroTransp("directo", [""])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA EXCEPCIÓN: el número se puede anotar DESPUÉS, en una guía ya despachada.
//
// Daniel, al aprobar: ***"si publicalo y hazle la excepcion para ese numero"***.
// Lo que se vigila acá es que completarlo tarde **no rompa el papel** —que es un
// documento que alguien firmó— ni deje la marca encendida para siempre.
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 completar el número TARDE no rompe el papel", () => {
  it("con UNA sola línea completada, el encabezado la anuncia (hay un solo número)", () => {
    // Es exactamente lo mismo que pasa hoy cuando se despacha llenando una sola
    // línea: la regla no cambió, y la marca se apaga.
    const items = [{ numero_guia_transp: "TR-4471" }, { numero_guia_transp: "" }, { numero_guia_transp: "" }];
    expect(numeroTranspUnicoImpreso(items, "")).toBe("TR-4471");
    expect(guiaSinNumeroTransp({
      estado: "Completada", tipo_despacho: "externo", modo_entrega: "transportista",
      numero_guia_transp: "", guia_items: items,
    })).toBe(false);
  });

  it("al completar una SEGUNDA línea distinta, el encabezado se CALLA", () => {
    // Con dos números, anunciar uno arriba sería una mentira impresa.
    const items = [{ numero_guia_transp: "TR-4471" }, { numero_guia_transp: "TR-4472" }];
    expect(numeroTranspUnicoImpreso(items, "")).toBe("");
  });

  it("cada línea imprime el SUYO; la que quedó vacía no hereda el del vecino", () => {
    expect(numeroTranspImpreso("TR-4471", "")).toBe("TR-4471");
    expect(numeroTranspImpreso("", "")).toBe("");
  });

  it("un '0' no se puede guardar — si no, la pantalla diría 'guardado' y el aviso seguiría", () => {
    expect(validarNumeroTransp("0").ok).toBe(false);
    expect(validarNumeroTransp(" 0 ").ok).toBe(false);
    // Y nada que CONTENGA un cero se pierde.
    for (const bueno of ["EK0700", "TR-0", "00"]) {
      const r = validarNumeroTransp(bueno);
      expect(r.ok, bueno).toBe(true);
      if (r.ok) expect(r.numero).toBe(bueno);
    }
  });

  it("borrar lo anotado es válido: alguien pudo escribir el número equivocado", () => {
    for (const vacio of ["", "   ", null, undefined]) {
      const r = validarNumeroTransp(vacio);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.numero).toBe("");
    }
  });

  it("la lista de guías lee el número POR LÍNEA — si no, el chip no se apagaría nunca", () => {
    // La cabecera `guia_transporte.numero_guia_transp` NO se reescribe al anotar
    // tarde (este endpoint toca UNA columna de UNA línea), así que el listado
    // tiene que mirar las líneas.
    const ruta = leer("src/app/api/guias/route.ts");
    expect(ruta).toMatch(/guia_items\([^)]*numero_guia_transp[^)]*\)/);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ⚠️ ACÁ HABÍA UN BARRIDO DE TEXTO Y SE RETIRÓ. Buscaba en `page.tsx` el botón
  // «Anotar el N°» por renglón (`puedeAnotarNumero=…` / `onAnotarNumero=…`). Ese
  // camino ya no existe: Daniel pidió UNA sola forma de editar, así que el N° de
  // una guía despachada se corrige con el MISMO formulario que abre «Editar».
  //
  // 🔴 Y NO SE REEMPLAZA POR OTRO BARRIDO. Este repo ya pagó cuatro veces el
  // candado que se cumple con su propio comentario explicativo. Lo que se afirma
  // es la REGLA PURA —la que de verdad decide qué se puede escribir en una guía
  // ya firmada— y la conducta que la sostiene.
  // ───────────────────────────────────────────────────────────────────────────
  it("la regla deja corregir el N° en una guía YA DESPACHADA — y sólo eso más el cliente y las facturas", () => {
    // ⚠️ NOTA 5-sep-2026 — este candado CAMBIÓ DE DIRECCIÓN, no se borró.
    // Daniel retiró el estado «Rechazada» entero (*«quitarlo»*): medido contra
    // producción, **0 de las 242 guías** de toda la historia lo usaron, el botón de
    // rechazar ya se había ido el 14-ago-2026 y `motivo_rechazo` salió de la lista
    // de campos que el PATCH acepta. `guiaYaDespachada` ya no lo reconoce.
    // Lo que se sigue exigiendo es lo MISMO, sobre «Completada».
    for (const estado of ["Completada"]) {
      const permitidos = camposEditablesDeRenglon(estado);
      expect(permitidos, estado).toContain("numero_guia_transp");
      // Las otras dos que Daniel aprobó, para que el N° no quede solo por azar.
      expect(permitidos, estado).toContain("cliente");
      expect(permitidos, estado).toContain("facturas");
      // 🔴 Y lo que sigue cerrado: los bultos son lo que el transportista firmó.
      for (const cerrado of ["bultos", "direccion", "empresa"]) {
        expect(permitidos as readonly string[], `${estado}/${cerrado}`).not.toContain(cerrado);
      }
    }
    // Antes de salir se corrige todo, el número incluido.
    expect(camposEditablesDeRenglon("Pendiente Bodega")).toContain("numero_guia_transp");
    expect(camposEditablesDeRenglon("Pendiente Bodega")).toContain("bultos");
  });

  it("las dos mitades se sostienen juntas: no bloquea al despachar, y por eso se anota después", () => {
    // Si bloqueara, no habría guías sin número que completar y la excepción no
    // tendría para qué existir; si no se pudiera completar, la marca ámbar sería
    // una advertencia que nadie puede apagar.
    expect(faltaParaDespachar(lleno)).toEqual([]);
    expect(pendienteNumeroTransp("externo", ["", "  "])).toBe(true);
    expect(camposEditablesDeRenglon("Completada")).toContain("numero_guia_transp");
  });
});
