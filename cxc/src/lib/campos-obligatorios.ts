// ─────────────────────────────────────────────────────────────────────────────
// COLUMNAS QUE LA BASE EXIGE SÍ O SÍ, Y QUÉ CONTESTAR CUANDO FALTA UNA.
//
// POR QUÉ EXISTE ESTE ARCHIVO. El 27-jul-2026 se descubrió que durante 3 meses
// y medio NADIE pudo guardar un cheque. La causa era `cheques.banco`: NOT NULL
// sin default, y el INSERT no la mandaba. La cadena completa, que es la misma
// en todos los casos de este archivo:
//
//   1. la ruta hace `const { x } = body` sin validar nada;
//   2. el body no trae `x` → `x` vale `undefined`;
//   3. `JSON.stringify` **borra** la clave (undefined no se serializa);
//   4. PostgREST manda un INSERT sin esa columna;
//   5. Postgres responde 23502 (not-null violation);
//   6. el `catch` hace `console.error` y devuelve **"Error interno"**.
//
// EL DAÑO NO FUE EL PASO 5, FUE EL PASO 6. Que algo falle es normal; que falle
// **en silencio durante tres meses y medio** pasó porque la pantalla no decía
// nada que un humano pudiera accionar y nadie mira los logs de Vercel. Por eso
// este módulo tiene DOS mitades y las dos importan igual:
//
//   - `faltan()` + `respuestaFaltan()`  → validar ANTES de escribir y devolver
//     un **400 que dice qué falta, en español**.
//   - `respuestaErrorEscritura()`       → si la base igual rechaza, contestar
//     algo **reportable** en vez de "Error interno", y avisar por Telegram.
//
// LO QUE NO SE HACE: no se le muestran al navegador nombres de tabla, nombres
// de columna, ni el mensaje crudo de Postgres. El detalle completo va al log
// del servidor y al canal 🔧 SISTEMA; al usuario le llega una frase humana y un
// código corto que puede repetirle a Daniel.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { enviarSistema } from "@/lib/alertas/canal";

/**
 * Una columna `NOT NULL` sin default, con el nombre que un humano usaría.
 * `etiqueta` se lee dentro de "Falta …", así que va en minúscula y con
 * artículo: "el nombre del cliente", "la empresa".
 */
export type CampoObligatorio = { columna: string; etiqueta: string };

/**
 * Las columnas que cada tabla exige SÍ O SÍ (`NOT NULL` **y sin default**),
 * limitado a las tablas que se escriben desde una ruta con body de usuario.
 *
 * MEDIDO CONTRA PRODUCCIÓN el 27-jul-2026 con el OpenAPI de PostgREST, que es
 * la fuente de verdad del schema — las migraciones del repo están incompletas.
 * Para volver a medirlo (solo lectura):
 *
 *   curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
 *     | jq '.definitions | map_values({required, defaults: (.properties|map_values(.default))})'
 *
 * Una columna cuenta como obligatoria solo si está en `required` Y su
 * `default` es `undefined`. Con default, mandarla ausente es legal.
 */
export const CAMPOS_OBLIGATORIOS = {
  caja_responsables: [
    { columna: "nombre", etiqueta: "el nombre del responsable" },
  ],
  directorio_clientes: [
    { columna: "nombre", etiqueta: "el nombre del cliente" },
  ],
  vendor_assignments: [
    { columna: "company_key", etiqueta: "la empresa" },
    { columna: "client_name", etiqueta: "el nombre del cliente" },
    { columna: "vendor_name", etiqueta: "el nombre del vendedor" },
  ],
  reclamo_contactos: [
    { columna: "empresa", etiqueta: "la empresa" },
    { columna: "nombre_contacto", etiqueta: "el nombre del contacto" },
  ],
  // `numero` NO va acá: lo calcula el servidor (auto-increment con reintento).
  // El único que viene del body es `fecha`, y no se validaba.
  guia_transporte: [
    { columna: "fecha", etiqueta: "la fecha de la guía" },
  ],
  // `nombre_normalized` es además la llave del `onConflict` del upsert: vacío
  // no solo rompe el INSERT, puede pisar la fila equivocada.
  cxc_client_overrides: [
    { columna: "nombre_normalized", etiqueta: "el nombre del cliente" },
  ],
  // `pl_items` se valida aparte en la ruta de packing lists: `pl_id` lo pone la
  // RPC y `producto` se normaliza a vacío (ver el comentario de esa ruta).
  pl_items: [
    { columna: "pl_id", etiqueta: "el packing list" },
    { columna: "estilo", etiqueta: "el estilo (SKU)" },
    { columna: "producto", etiqueta: "el producto" },
  ],
} as const satisfies Record<string, readonly CampoObligatorio[]>;

export type TablaConObligatorios = keyof typeof CAMPOS_OBLIGATORIOS;

/**
 * Normaliza un valor de texto que va a una columna `NOT NULL`.
 *
 * Devuelve el texto sin espacios sobrantes, o `null` si no hay nada utilizable.
 * `null` es la señal de "falta"; NUNCA devuelve `undefined`, que es justo el
 * valor que desaparece en `JSON.stringify` y produce el 23502.
 */
export function textoObligatorio(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const limpio = v.trim();
  return limpio === "" ? null : limpio;
}

/**
 * Qué campos obligatorios le faltan al body. Se evalúa contra el body CRUDO
 * (lo que mandó el cliente), antes de armar la fila.
 *
 * Un campo falta si no es un texto con contenido: cubre `undefined`, `null`,
 * `""`, `"   "` y cualquier tipo que no sea string. Los tres son el mismo
 * problema para la base — una columna de texto NOT NULL con `''` guardado es
 * una fila fantasma tan inservible como la que no se pudo guardar.
 */
export function faltan(
  body: Record<string, unknown>,
  campos: readonly CampoObligatorio[],
): CampoObligatorio[] {
  return campos.filter((c) => textoObligatorio(body[c.columna]) === null);
}

/**
 * El 400 que reemplaza al 500 mudo: dice EXACTAMENTE qué falta, en español, y
 * el usuario puede arreglarlo solo.
 */
export function respuestaFaltan(faltantes: readonly CampoObligatorio[]): NextResponse {
  const lista = faltantes.map((c) => c.etiqueta);
  const mensaje =
    lista.length === 1
      ? `Falta ${lista[0]}.`
      : `Faltan estos datos: ${lista.slice(0, -1).join(", ")} y ${lista.at(-1)}.`;
  return NextResponse.json({ error: `${mensaje} Complétalo e intenta de nuevo.` }, { status: 400 });
}

/** Atajo: valida y, si falta algo, devuelve el 400 ya armado. */
export function validarObligatorios(
  body: Record<string, unknown>,
  campos: readonly CampoObligatorio[],
): NextResponse | null {
  const f = faltan(body, campos);
  return f.length ? respuestaFaltan(f) : null;
}

// ── La otra mitad: cuando la base rechaza igual ──────────────────────────────

/**
 * Códigos que significan "el código y la base no están de acuerdo". No son
 * culpa del usuario y no se arreglan reintentando: alguien tiene que tocar el
 * código o el schema.
 *
 * - `23502` — columna NOT NULL que el INSERT no mandó (el bug de `cheques.banco`).
 * - `PGRST204` — el INSERT mandó una columna que la tabla NO tiene (el caso de
 *   `reclamo_contactos.nombre`, que sigue en un allow-list y ya no existe).
 */
const DESACUERDO_CON_LA_BASE: Record<string, { codigo: string; mensaje: string }> = {
  "23502": {
    codigo: "FALTA-DATO",
    mensaje:
      "No se pudo guardar: falta un dato que la base exige y el sistema no envió.",
  },
  PGRST204: {
    codigo: "CAMPO-DESCONOCIDO",
    mensaje:
      "No se pudo guardar: el sistema intentó guardar un campo que ya no existe en la base.",
  },
};

type ErrorSupabase = { code?: string; message?: string } | null | undefined;

/** Ventana de silencio por (tabla, código) para no repetir el mismo aviso. */
const UNA_HORA_MS = 60 * 60 * 1000;
const ultimoAviso = new Map<string, number>();

function debeAvisar(clave: string, ahora: number): boolean {
  const previo = ultimoAviso.get(clave);
  if (previo !== undefined && ahora - previo < UNA_HORA_MS) return false;
  ultimoAviso.set(clave, ahora);
  return true;
}

/**
 * Traduce el error de una escritura a una respuesta HTTP.
 *
 * Un 23502 o un PGRST204 que llega hasta acá **ya pasó la validación**, así que
 * no es un dato que le falte al usuario: es el código y el schema en
 * desacuerdo. Cumple las tres reglas del canal 🔧 SISTEMA — es real, no se
 * arregla solo y alguien tiene que hacer algo — así que además de contestar
 * algo reportable, avisa. Es EXACTAMENTE el aviso que habría ahorrado los tres
 * meses y medio de cheques.
 *
 * El aviso se limita a uno por hora y por (tabla, código): el evento es raro
 * por construcción, pero un usuario que insiste con el botón no debe encender
 * el celular de Daniel diez veces.
 *
 * Cualquier otro error sigue siendo un 500 genérico a propósito: un fallo de
 * red o un timeout de la base no le dicen nada útil al usuario y se resuelven
 * reintentando.
 */
export async function respuestaErrorEscritura(
  error: ErrorSupabase,
  contexto: { tabla: string; accion: string },
): Promise<NextResponse> {
  const codigo = String(error?.code ?? "");
  const detalle = error?.message ?? "sin mensaje";
  console.error(`[${contexto.tabla}] ${contexto.accion} falló (${codigo || "sin código"}): ${detalle}`);

  const desacuerdo = DESACUERDO_CON_LA_BASE[codigo];
  if (!desacuerdo) {
    return NextResponse.json(
      { error: "No se pudo guardar. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }

  if (debeAvisar(`${contexto.tabla}:${codigo}`, Date.now())) {
    // El aviso SÍ lleva el detalle técnico: va al canal de sistema, no al
    // navegador. Se espera (nada de fire-and-forget) pero no puede tumbar la
    // respuesta al usuario, que ya está decidida.
    try {
      await enviarSistema(
        `No se puede guardar en ${contexto.accion}.\n\n` +
          `Qué pasa: el sistema y la base de datos no coinciden en un campo, así que la pantalla ` +
          `devuelve un error cada vez que alguien intenta guardar.\n` +
          `Qué significa: esa función está caída para todos hasta que se corrija.\n` +
          `Qué hacer: avísale a quien programa — código ${codigo}, tabla ${contexto.tabla}.\n\n` +
          `Detalle: ${detalle}`,
      );
    } catch (e) {
      console.error(`[${contexto.tabla}] no se pudo avisar por Telegram:`, e);
    }
  }

  return NextResponse.json(
    { error: `${desacuerdo.mensaje} Avisa a soporte con este código: ${desacuerdo.codigo}.` },
    { status: 500 },
  );
}

/** Reinicia la ventana de silencio. Solo para tests. */
export function _resetAvisos(): void {
  ultimoAviso.clear();
}
