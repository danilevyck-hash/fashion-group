// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS — UNA SOLA PUERTA PARA DESPACHAR, Y EL N° DEL TRANSPORTISTA POR LÍNEA.
//
// Lo que este archivo impide que vuelva:
//
//  1. **Dos caminos para lo mismo en la misma tarjeta.** Abrir una guía
//     pendiente en la lista desplegaba el formulario de despacho ENTERO (placa,
//     N° de guía, receptor, cédula, dos canvas de firma y "Confirmar despacho")
//     y, arriba, un botón "Editar". Daniel lo vio en ESCRITORIO —no era un
//     problema de pantalla chica— y fue textual: *"mira como me sale editar al
//     hacer clic en por despachar y esta ya aparece el campo para editar,
//     confunde, solo quiero una y en boton de editar para entrar a la guia y
//     terminarla"*.
//
//  2. **Deslizar para despachar.** *"al hacer slide a la izquierda de una guia
//     no despachada da la opcion de despachar, no quiero eso asi"*. Un gesto
//     invisible que dispara el paso más caro del módulo.
//
//  3. **Un solo N° del transportista para toda la guía.** *"la info de guia de
//     transp, debe de ser por linea, no por guia porque nos hacen varias guias
//     el transportista por guia"*. La columna `guia_items.numero_guia_transp`
//     ya existía; lo que se imprimía en TODOS los renglones era el de la
//     cabecera, así que aunque las líneas tuvieran número propio, el papel
//     mostraba el mismo en todas.
//
//  4. **El botón que se puede tocar y contesta con un toast por vez.** Ahora se
//     apaga y debajo dice qué falta, todo junto y quieto.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  faltaParaDespachar,
  textoFalta,
  numeroGuiaDeCabecera,
  numeroTranspDeLinea,
  numeroTranspUnico,
} from "@/lib/guias/falta-para-despachar";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const LISTA = leer("src/app/guias/components/GuiasList.tsx");
const PAGE_LISTA = leer("src/app/guias/page.tsx");
const PAGE_GUIA = leer("src/app/guias/[id]/page.tsx");
const PAGE_EDITAR = leer("src/app/guias/[id]/editar/page.tsx");
const FORM = leer("src/app/guias/components/DespachoForm.tsx");
const LISTA_ENVIOS = leer("src/app/guias/components/ListaEnvios.tsx");
const ESTADO_LISTA = leer("src/app/guias/components/useGuiasState.ts");
const RUTA = leer("src/app/api/guias/[id]/route.ts");
const IMPRESO = leer("src/app/guias/components/PrintDocument.tsx");
const PDF = leer("src/lib/guias/pdf-guia.ts");

describe("🔴 la lista NO despacha: ni deslizando ni desplegando el formulario", () => {
  it("el swipe de 'Despachar' ya no existe", () => {
    expect(LISTA).not.toContain("SwipeableRow");
    expect(LISTA).not.toContain("despachoSwipeAction");
    expect(LISTA).not.toContain('label: "Despachar"');
  });

  it("el formulario de despacho no se dibuja dentro de la fila", () => {
    expect(LISTA).not.toContain("DespachoForm");
    // Y tampoco por la puerta de atrás: ni un campo del despacho en la lista.
    for (const campo of ["bPlaca", "bReceptor", "bCedula", "bChofer", "pendingFirma1"]) {
      expect(LISTA, campo).not.toContain(campo);
    }
  });

  it("el hook de la LISTA se quedó sin estado de despacho", () => {
    // Dejarlo vivo en una pantalla que ya no despacha es la mitad del problema
    // de vuelta: dos lugares con la misma verdad.
    for (const campo of ["bPlaca", "confirmarDespacho", "pendingFirma1", "tipoDespacho"]) {
      expect(ESTADO_LISTA, campo).not.toContain(campo);
    }
  });

  it("queda UN SOLO botón para entrar a la guía — lo que cambia es cómo se llama", () => {
    // ⚠️ Lo que Daniel pidió sacar era tener "Despachar" Y "Editar" uno al lado
    // del otro. Eso NO se aflojó: sigue habiendo un solo `onEdit`. Lo que sí
    // cambió (ago-2026) es el rótulo: en "Pendiente Bodega" dice "Despachar",
    // porque 185 de las 186 guías terminaron despachadas y ésa es LA acción del
    // día para bodega. Ver `guias-entrega-directa.test.tsx`, que lo prueba
    // pintando la lista.
    const acciones = LISTA.slice(
      LISTA.indexOf("{/* Acciones rápidas (header de la card expandida) */}"),
      LISTA.indexOf("{/* Items table */}")
    );
    expect(acciones).toContain("Editar");
    expect(acciones).toContain("Despachar");
    expect(acciones).toContain("Imprimir");
    expect((acciones.match(/onEdit\(/g) ?? []).length).toBe(1);
  });

  it("'Editar' lleva a la PÁGINA de la guía, no directo a los renglones", () => {
    expect(PAGE_LISTA).toContain("onEdit={(id) => router.push(`/guias/${id}`)}");
  });
});

describe("🔴 la página de la guía es donde se termina", () => {
  it("tiene el encabezado aprobado: ‹ Atrás y el número de la guía", () => {
    expect(PAGE_GUIA).toContain("‹ Atrás");
    expect(PAGE_GUIA).toContain("fmtGuia(g.numero)");
    expect(PAGE_GUIA).toContain('router.push("/guias")');
  });

  // ⚠️ CANDADO QUE CAMBIÓ DE DIRECCIÓN (23-ago-2026). Antes exigía que la
  // página de la guía ENLAZARA a `/guias/[id]/editar`, o sea que el formulario
  // viviera un nivel más adentro — justo lo que Daniel pidió sacar. Lo que
  // siempre quiso decir es que el camino viejo no se pierda, y eso ahora lo
  // sostiene el REDIRECT: un enlace guardado sigue abriendo lo que abría.
  it("el camino viejo no se pierde: `/guias/[id]/editar` redirige a la guía", () => {
    expect(PAGE_EDITAR).toContain("router.replace(");
    expect(PAGE_EDITAR).toContain("?editar=1");
    // `replace` y no `push`: con push el "atrás" volvería acá y encerraría a
    // la persona en un bucle de redirecciones.
    expect(PAGE_EDITAR).not.toContain("router.push(");
  });

  it("los hooks van ANTES del primer return condicional (regla de React)", () => {
    const iHook = PAGE_GUIA.indexOf("useDespachoGuia(");
    const iReturn = PAGE_GUIA.indexOf("if (!authChecked");
    expect(iHook).toBeGreaterThan(0);
    expect(iHook).toBeLessThan(iReturn);
  });

  it("una guía ya despachada se muestra de solo lectura, sin formulario", () => {
    const i = PAGE_GUIA.indexOf("s.despachada ? (");
    const j = PAGE_GUIA.indexOf(") : puedeDespachar ? (");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    const bloque = PAGE_GUIA.slice(i, j);
    expect(bloque).not.toContain("<DespachoForm");
    // 🔴 Y tampoco el formulario del ALTA: desde el 23-ago-2026 «Editar» abre
    // `GuiaForm` DENTRO de la guía, así que una despachada tiene que quedar
    // fuera de ese camino igual que del despacho.
    expect(bloque).not.toContain("<EdicionGuia");
  });

  // 🔴 El candado de la guía DESPACHADA, del otro lado: quién puede abrir el
  // formulario tiene que mirar el estado, no solo el rol.
  it("«Editar» no se ofrece en una guía ya despachada", () => {
    expect(PAGE_GUIA).toContain("!s.despachada");
    expect(PAGE_GUIA).toContain("const enEdicion = editando && puedeEditar");
    // Y la pantalla lo DICE, en vez de mostrar campos que no dejan escribir.
    expect(PAGE_GUIA).toContain("ya se despachó: no se puede editar");
  });

  it("vendedor entra pero no despacha", () => {
    expect(PAGE_GUIA).toContain('const DESPACHO_ROLES = ["admin", "secretaria", "bodega"]');
    expect(PAGE_GUIA).toContain("DESPACHO_ROLES.includes(role");
  });
});

describe("🔴 el N° del transportista es POR LÍNEA", () => {
  it("se pide uno por cada envío, no uno para toda la guía", () => {
    // ⚠️ Desde el 17-ago-2026 las cajas viven en `ListaEnvios`, pegadas a su
    // renglón: el formulario tenía una SEGUNDA copia de la lista entera. Que
    // sean una sola lo prueba `guias-lista-unica-envios.test.tsx`.
    expect(LISTA_ENVIOS).toContain("items.map((item, idx)");
    expect(LISTA_ENVIOS).toContain("setNumeroTransp(idx, e.target.value)");
    // El campo único de guía no existe en ninguno de los dos.
    expect(FORM).not.toContain("bNumeroGuiaTransp");
    expect(LISTA_ENVIOS).not.toContain("bNumeroGuiaTransp");
  });

  it("se guarda con su propio campo, NUNCA mandando `items` (que reemplaza todo)", () => {
    // `items` en el PUT borra e inserta los renglones: usarlo acá le cambiaría
    // el id a cada línea en pleno despacho y tiraría los clientes atados.
    const hook = leer("src/app/guias/components/useDespachoGuia.ts");
    expect(hook).toContain("items_guia_transp");
    expect(hook).not.toMatch(/payload\.items\s*=/);
    expect(hook).not.toMatch(/\bitems:\s/);
  });

  it("el servidor escribe UNA columna y solo de líneas de ESTA guía", () => {
    const i = RUTA.indexOf("if (Array.isArray(items_guia_transp))");
    expect(i).toBeGreaterThan(0);
    const bloque = RUTA.slice(i, i + 1400);
    expect(bloque).toContain('.update({ numero_guia_transp: numero })');
    expect(bloque).toContain('.eq("guia_id", id)');
    expect(bloque).toContain("UUID_RE.test(itemId)");
    // Nada más de la línea se toca.
    expect(bloque).not.toContain("cliente");
    expect(bloque).not.toContain("bultos");
  });

  it("el papel imprime el de CADA línea, no el de la cabecera repetido", () => {
    // ⚠️ Desde ago-2026 los papeles llaman al envoltorio `numeroTranspImpreso`,
    // que es la MISMA herencia línea → cabecera pasada por `sinCeroPelado`: un
    // "0" no es un número de guía, es lo que alguien tecleó para poder apretar
    // el botón. La regla de herencia sigue viviendo en `falta-para-despachar`.
    expect(IMPRESO).toContain("numeroTranspImpreso(item.numero_guia_transp, g.numero_guia_transp)");
    expect(PDF).toContain("numeroTranspImpreso(it.numero_guia_transp, g.numero_guia_transp)");
  });

  it("el encabezado del papel solo anuncia un número cuando hay UNO solo", () => {
    // Con varios distintos, poner uno arriba sería una mentira impresa en un
    // documento que alguien firma.
    expect(IMPRESO).toContain("numeroTranspUnicoImpreso(guiaItems, g.numero_guia_transp)");
    expect(PDF).toContain("numeroTranspUnicoImpreso(items, g.numero_guia_transp)");
    expect(IMPRESO).not.toContain("{g.numero_guia_transp && (");
  });

  it("una guía VIEJA sale igual que siempre: la línea hereda el de la cabecera", () => {
    // Las guías despachadas antes de este cambio no tienen número por línea.
    expect(numeroTranspDeLinea("", "TR-900")).toBe("TR-900");
    expect(numeroTranspDeLinea(null, "TR-900")).toBe("TR-900");
    expect(numeroTranspDeLinea("TR-901", "TR-900")).toBe("TR-901");
    expect(numeroTranspUnico([{ numero_guia_transp: "" }, { numero_guia_transp: "" }], "TR-900")).toBe("TR-900");
  });

  it("con dos números distintos, el encabezado se calla", () => {
    expect(numeroTranspUnico(
      [{ numero_guia_transp: "TR-4471" }, { numero_guia_transp: "TR-4472" }],
      "TR-4471"
    )).toBe("");
  });

  it("la columna de la GUÍA no se retira: se llena con el primer número que haya", () => {
    // La usan el buscador de la lista, el Excel y el encabezado del papel.
    expect(numeroGuiaDeCabecera(["", "TR-4472", "TR-4473"])).toBe("TR-4472");
    expect(numeroGuiaDeCabecera(["  ", ""])).toBe("");
  });
});

describe("🔴 el botón se apaga y DICE qué falta", () => {
  const lleno = {
    tipoDespacho: "externo" as const,
    placa: "AB-1234", receptor: "Juan", cedula: "8-8-8", chofer: "",
    tieneFirma1: true, tieneFirma2: true,
  };

  it("todo lleno → no falta nada", () => {
    expect(faltaParaDespachar(lleno)).toEqual([]);
  });

  it("el caso del mockup: 'Falta: placa, recibido por y cédula'", () => {
    const falta = faltaParaDespachar({ ...lleno, placa: "", receptor: "", cedula: "" });
    expect(falta).toEqual(["placa", "recibido por", "cédula"]);
    expect(textoFalta(falta)).toBe("Falta: placa, recibido por y cédula");
  });

  it("con uno solo no dice 'y'", () => {
    expect(textoFalta(["placa"])).toBe("Falta: placa");
    expect(textoFalta([])).toBe("");
  });

  it("el N° del transportista NO traba el despacho, ni faltando en TODAS las líneas", () => {
    // ⚠️ CAMBIÓ DE DIRECCIÓN el 17-ago-2026. Antes se exigía que al menos una
    // línea lo trajera; Daniel: *"a veces el transportista lo da, a veces no"*.
    // El candado completo vive en `guias-numero-transp-no-bloquea.test.ts`.
    expect(faltaParaDespachar(lleno)).toEqual([]);
  });

  it("en entrega directa se pide chofer y NO se piden placa ni N° de transportista", () => {
    const directo = { ...lleno, tipoDespacho: "directo" as const, placa: "", chofer: "" };
    expect(faltaParaDespachar(directo)).toEqual(["chofer"]);
    expect(faltaParaDespachar({ ...directo, chofer: "Pedro" })).toEqual([]);
  });

  it("los espacios en blanco no cuentan como lleno", () => {
    expect(faltaParaDespachar({ ...lleno, placa: "   " })).toContain("placa");
    expect(faltaParaDespachar({ ...lleno, receptor: "  " })).toContain("recibido por");
  });

  it("el texto de lo que falta va en español simple, sin jerga ni nombres de columna", () => {
    const todo = faltaParaDespachar({
      tipoDespacho: "externo", placa: "", receptor: "", cedula: "", chofer: "",
      tieneFirma1: false, tieneFirma2: false,
    });
    for (const t of todo) {
      expect(t, t).not.toMatch(/_/); // nada de `receptor_nombre` ni `firma_base64`
      expect(t, t).not.toMatch(/[A-Z]{2,}/); // ni siglas ni constantes
    }
    expect(todo).toContain("recibido por");
    expect(todo).toContain("cédula");
  });
});
