// ─────────────────────────────────────────────────────────────────────────────
// La fila que se INSERTA en `cheques`, en un solo lugar.
//
// POR QUÉ EXISTE ESTE ARCHIVO. Durante 3 meses y medio no se pudo guardar NI UN
// cheque: la pantalla decía "Error interno" y el 500 tapaba el error real de
// Postgres, que era siempre el mismo:
//
//     23502 — null value in column "banco" of relation "cheques"
//              violates not-null constraint
//
// `cheques.banco` es NOT NULL y NO tiene default (medido contra producción vía
// el OpenAPI de PostgREST, que es la fuente de verdad del schema; las
// migraciones del repo están incompletas). El INSERT dejó de mandarla el
// 14-abr-2026 en `47f1f30f` ("remove banco column from cheques UI"), que sacó
// `banco: fBanco` del body del formulario — la columna quedó viva en la base y
// muerta en la app. `15878494` (17-abr) solo limpió el destructure que ya
// recibía `undefined`. Los 5 cheques vivos son todos del 14-abr **antes** de esa
// hora (20:21-20:45 UTC contra el commit de las 22:03 UTC) y tienen
// `banco = 'Otro'`: son los últimos que alcanzaron a entrar.
//
// EL CAMPO NO VUELVE A LA PANTALLA. Decisión de Daniel, textual en el PR #330:
// "BANCO: NO se agrega. Daniel: 'no, déjalo así'". Así que la app escribe la
// columna con el vacío explícito — es un dato que no se captura, no un banco
// llamado "Otro" que nadie eligió. Mismo criterio que `notas` y `vendedor`, que
// ya son `text` con default `''`.
//
// POR QUÉ UN MÓDULO Y NO UN LITERAL EN LA RUTA. Porque el defecto no fue
// escribir mal una columna: fue que **nadie podía ver** qué columnas exige la
// base. Acá están escritas una sola vez, y el candado
// `src/__tests__/lib/cheques-fila.test.ts` revienta si la fila deja de cubrir
// alguna — antes de que lo descubra un usuario en producción.
//
// FUNCIONA CON O SIN EL SQL. La migración
// `20260727180000_cheques_banco_default.sql` (default `''` + drop not null) deja
// la columna sana, pero es OPCIONAL: este código manda el valor igual, así que
// el arreglo sale con el deploy y no espera a que nadie corra un DDL a mano.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Columnas que `cheques` exige SÍ O SÍ en un INSERT: `NOT NULL` y **sin
 * default**. Si falta una, Postgres responde 23502 y el usuario ve
 * "Error interno".
 *
 * Medido contra producción el 27-jul-2026 (`definitions.cheques.required` del
 * OpenAPI de PostgREST, menos las que traen `default`). `id` queda fuera a
 * propósito: es la PK y la llena `gen_random_uuid()`.
 *
 * Para volver a medirla:
 *   curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
 *     | jq '.definitions.cheques | {required, defaults: (.properties | map_values(.default))}'
 *
 * Si algún día la base gana otra columna obligatoria, se agrega ACÁ y el test
 * obliga a cubrirla en `construirFilaCheque`.
 */
export const COLUMNAS_OBLIGATORIAS_CHEQUE = [
  "cliente",
  "empresa",
  "banco",
  "numero_cheque",
  "monto",
  "fecha_deposito",
] as const;

/**
 * Lo que se guarda en `banco`. El formulario no lo captura y no va a
 * capturarlo; la columna es NOT NULL, así que se escribe el vacío explícito.
 * No es `null` porque la columna hoy no lo admite, y el código tiene que
 * funcionar **antes** de que se corra la migración.
 */
export const BANCO_NO_CAPTURADO = "";

export type EntradaCheque = {
  cliente: string;
  empresa: string;
  numero_cheque: string;
  monto: number;
  fecha_deposito: string;
  notas?: unknown;
  vendedor: string;
  /** Código D-XXX del cliente elegido. `undefined`/"" = sin vincular, que es un
   *  estado legítimo (la opción "Otro" del selector). */
  cliente_codigo?: string | null;
};

/**
 * Arma la fila completa. Único lugar del sistema que construye un INSERT de
 * `cheques` — la ruta no debe volver a escribir el objeto a mano.
 */
export function construirFilaCheque(e: EntradaCheque): Record<string, unknown> {
  return {
    cliente: e.cliente.trim(),
    empresa: e.empresa,
    banco: BANCO_NO_CAPTURADO,
    numero_cheque: e.numero_cheque.trim(),
    monto: e.monto,
    fecha_deposito: e.fecha_deposito,
    notas: typeof e.notas === "string" ? e.notas : "",
    vendedor: e.vendedor.trim(),
    estado: "pendiente",
    // El texto de `cliente` se conserva SIEMPRE como display; esto es el
    // vínculo. Vacío → null, para que "sin vincular" sea NULL y no "".
    cliente_codigo: (e.cliente_codigo ?? "").trim() || null,
  };
}
