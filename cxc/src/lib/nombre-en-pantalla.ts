// ─────────────────────────────────────────────────────────────────────────────
// CÓMO SE ESCRIBE UN NOMBRE EN PANTALLA. Un solo lugar.
//
// Daniel, 10-sep-2026: *«no me gustan los nombres en planilla de los usuarios
// todo en mayúscula, arréglalo a capitalización»*.
//
// 🔴 SOLO CAMBIA CÓMO SE MUESTRA. Lo guardado no se toca: `LUIS PARAJON` sigue
// siendo `LUIS PARAJON` en la base, la clave de agrupación sigue en mayúsculas
// y no se mueve un solo número. Es la MISMA decisión que Comisiones tomó con
// `nombreVendedorEnPantalla` («REYNALDO ESPINOSA» → «Reynaldo Espinosa») y que
// Multifashion aplicó a sus vendedoras.
//
// 🩸 POR QUÉ VIVE ACÁ Y NO EN `comisiones/alias.ts`. La función de Comisiones
// tiene casos propios de VENDEDOR (el comodín `*`, el `DEFAULT` de Switch) que
// no significan nada para una persona de la planilla. Copiarla habría sido la
// segunda forma de capitalizar un nombre, y dos formas es cómo la misma persona
// termina escrita distinto en dos pantallas. Así que el capitalizador puro vive
// acá y Comisiones lo LLAMA, conservando sus casos especiales.
//
// ── 🔴 NO SE INVENTAN ACENTOS ────────────────────────────────────────────────
//
// `LUIS PARAJON` se muestra `Luis Parajon`, SIN tilde, porque lo guardado no la
// tiene. Bajar a minúscula y subir la primera letra no puede agregar un acento
// que no estaba: adivinar cuál «Parajon» lleva tilde es inventar el nombre de
// una persona.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las partículas que van en minúscula CUANDO NO ABREN el nombre.
 *
 * «MARIA DE LA CRUZ» → «Maria de la Cruz», pero «DE GRACIA» al principio de un
 * apellido suelto se queda «De Gracia»: una partícula que abre es un apellido.
 */
const PARTICULAS = new Set([
  "de", "del", "la", "las", "los", "y", "e", "da", "das", "do", "dos", "van", "von",
]);

/** ¿Es una INICIAL con punto? («V.», «G.») Se dejan en mayúscula. */
function esInicial(palabra: string): boolean {
  return /^\p{L}\.$/u.test(palabra);
}

function capitalizarPalabra(p: string): string {
  // Los guiones y apóstrofes parten palabras compuestas: «JEAN-LUC» → «Jean-Luc».
  return p.replace(
    /(^|[-'’])(\p{L})/gu,
    (_m, sep: string, letra: string) => sep + letra.toLocaleUpperCase("es"),
  );
}

/**
 * `LUIS PARAJON` → `Luis Parajon` · `MARIA V. BETHANCOURTH G.` →
 * `Maria V. Bethancourth G.` · `LUZ DE LA CRUZ` → `Luz de la Cruz`.
 *
 * ⚠️ Un nombre que YA viene capitalizado («Roxana Hernandez») sale igual: se
 * baja todo a minúscula primero, así que no importa cómo venga escrito.
 */
export function capitalizarNombre(nombre: string | null | undefined): string {
  const v = String(nombre ?? "").trim().replace(/\s+/g, " ");
  if (!v) return "";
  const palabras = v.toLocaleLowerCase("es").split(" ");
  return palabras
    .map((p, i) => {
      if (esInicial(p)) return p.toLocaleUpperCase("es");
      // 🔑 La partícula solo se queda en minúscula si NO abre el nombre.
      if (i > 0 && PARTICULAS.has(p)) return p;
      // 🔑 La partícula solo se queda en minúscula si NO abre el nombre.
      return capitalizarPalabra(p);
    })
    .join(" ");
}

/**
 * ¿Este texto está TODO en mayúsculas sostenidas? Lo usan los candados para
 * barrer las superficies de Planilla.
 *
 * ⚠️ Un texto sin letras (un código como «V-EG» no cuenta: tiene letras, pero
 * es un CÓDIGO, no un nombre) — por eso el barrido se hace sobre nombres, no
 * sobre cualquier cadena.
 */
export function esGritado(texto: string | null | undefined): boolean {
  const v = String(texto ?? "");
  const letras = v.match(/\p{L}/gu);
  if (!letras || letras.length < 2) return false;
  return v === v.toLocaleUpperCase("es") && v !== v.toLocaleLowerCase("es");
}
