// ═══════════════════════════════════════════════════════════════════════════
// CANDADO — las retenciones de ITBMS NO pagan comisión.
// ═══════════════════════════════════════════════════════════════════════════
//
// REGLA DE NEGOCIO (Daniel, 30-jul-2026 — decisión cerrada, no se relitiga):
//   Una retención BAJA LA DEUDA del cliente pero NO PAGA COMISIÓN. Es plata que
//   el cliente le entrega al Estado en nombre nuestro; a nuestra cuenta no entró
//   nada, así que no hay cobro que comisionar. Medido: ~$4.211 en julio 2026
//   sólo en Fashion Wear.
//
// LA REGLA YA ESTÁ IMPLEMENTADA desde el 4-jun-2026 (migración
// 20260604000000_switch_recibos_es_retencion.sql creó el flag y las RPC de
// comisión nacieron con `AND r.es_retencion = false` en su CTE de cobros).
// Lo que NO existía es este candado: hoy nada impide que alguien borre esa línea
// al tocar la RPC por otro motivo, y el síntoma sería plata de más en la
// comisión de un vendedor — un error que nadie ve hasta que se paga.
//
// LAS DOS MITADES DE LA REGLA, y por qué este test sólo cuida una:
//   • BASE DE COBRO de la comisión  → EXCLUYE retenciones.  ← lo que se cuida acá
//   • CXC / aging / estado de cuenta → INCLUYE retenciones (la deuda SÍ baja).
//     Por eso este test NO exige el filtro en toda lectura de switch_recibos:
//     un candado que empujara a filtrar retenciones en el CXC estaría forzando
//     el comportamiento EQUIVOCADO. La huella que distingue una base de cobro de
//     una lectura de CXC es la exclusión del pseudo-cliente de mostrador
//     ('TCKCTA'): sólo la comisión lo excluye. Esa es la llave del barrido de
//     abajo.
//
// Es un test ESTÁTICO sobre los .sql (mismo patrón que
// ventas-reportes-sargable.test.ts): la lógica vive en la base y no se puede
// ejecutar sin ella, pero la FORMA del SQL sí se puede congelar sin tocar
// producción.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../../..");
const DIR_MIGRACIONES = path.join(RAIZ, "supabase/migrations");

/** El SQL sin comentarios `--`: lo que Postgres realmente ejecuta.
 *  Imprescindible acá — varias migraciones NOMBRAN el filtro en su cabecera
 *  explicativa, y un test que leyera los comentarios pasaría en verde aunque el
 *  código de abajo ya no lo tuviera. */
function soloCodigo(sql: string): string {
  return sql
    .split("\n")
    .map((l) => {
      const i = l.indexOf("--");
      return i === -1 ? l : l.slice(0, i);
    })
    .join("\n");
}

function leerMigracion(archivo: string): string {
  return soloCodigo(readFileSync(path.join(DIR_MIGRACIONES, archivo), "utf8"));
}

/**
 * Recorta cada bloque que lee `switch_recibos`: desde `FROM switch_recibos`
 * hasta el primer cierre de la consulta (GROUP BY / ORDER BY / `)` de cierre de
 * CTE / `;`). Alcanza y sobra para ver el WHERE, que es lo único que importa.
 */
function bloquesDeRecibos(codigo: string): string[] {
  const bloques: string[] = [];
  const re = /FROM\s+switch_recibos\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo)) !== null) {
    const resto = codigo.slice(m.index);
    const corte = resto.search(/\bGROUP\s+BY\b|\bORDER\s+BY\b|;/i);
    bloques.push(corte === -1 ? resto : resto.slice(0, corte));
  }
  return bloques;
}

/** El predicado exacto, tolerante a espacios. `es_retencion` es NOT NULL
 *  DEFAULT false, así que `= false` no tiene agujero de tri-valuada. */
const FILTRO_RETENCION = /\bes_retencion\s*=\s*false\b/i;
const FILTRO_MOSTRADOR = /'TCKCTA'/;

// ─── 1. Candado explícito sobre las bases de COBRO conocidas ─────────────────
//
// Cada entrada es una función que multiplica un monto de switch_recibos por una
// tasa y lo paga como comisión. Si mañana se dropea una, hay que borrarla de
// esta lista A PROPÓSITO — que el test se ponga rojo al desaparecer el archivo
// es parte del candado.
const BASES_DE_COBRO: { archivo: string; funcion: string; nota: string }[] = [
  {
    archivo: "20260703120000_comision_b2b_v5_vendedor_factura.sql",
    funcion: "comision_b2b_v5",
    nota: "VIVA — la llama /api/ventas/comisiones (tabla de comisiones por empresa)",
  },
  {
    archivo: "20260724130000_comision_b2b_detalle_v2_vendedor_factura.sql",
    funcion: "comision_b2b_detalle",
    nota: "VIVA — la llama /api/ventas/comisiones/detalle (modal doc-por-doc)",
  },
  {
    archivo: "20260604020000_comision_detalle.sql",
    funcion: "comision_b2b_detalle",
    nota: "v1 del detalle; sigue siendo la definición viva si la DDL de 20260724130000 no corrió",
  },
  {
    archivo: "20260604010000_comision_cobro_v3.sql",
    funcion: "comision_b2b_v3",
    nota: "legacy: nadie la llama, pero NUNCA se dropeó (a diferencia de v1/v2/v4)",
  },
  {
    archivo: "20260604080000_comision_b2b_v4.sql",
    funcion: "comision_b2b_v4",
    nota: "dropeada en 20260703150000, pero esa migración la señala como el rollback de v5",
  },
];

describe("las retenciones NO entran en la base de cobro de la comisión", () => {
  for (const { archivo, funcion, nota } of BASES_DE_COBRO) {
    it(`${funcion} (${archivo}) excluye es_retencion — ${nota}`, () => {
      const codigo = leerMigracion(archivo);

      // La función sigue definida en el archivo que decimos.
      expect(codigo, `${archivo} ya no define ${funcion}`).toMatch(
        new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+${funcion}\\s*\\(`, "i"),
      );

      const bloques = bloquesDeRecibos(codigo);
      expect(bloques.length, `${archivo}: esperaba al menos un FROM switch_recibos`).toBeGreaterThan(0);

      for (const bloque of bloques) {
        expect(
          bloque,
          `${funcion}: la base de cobro perdió el filtro de retenciones. ` +
            "Las retenciones bajan la deuda pero NO pagan comisión (regla de Daniel, 30-jul-2026).",
        ).toMatch(FILTRO_RETENCION);
        // El guard del mostrador viaja pegado al de retenciones desde el día 1;
        // si desaparece, el que sigue es un vendedor cobrando sobre la caja.
        expect(bloque, `${funcion}: la base de cobro perdió la exclusión del mostrador TCKCTA`).toMatch(
          FILTRO_MOSTRADOR,
        );
      }
    });
  }
});

// ─── 2. Barrido de regresión FUTURA ──────────────────────────────────────────
//
// Una comisión v6 escrita dentro de un año no está en la lista de arriba. Lo que
// sí va a tener, porque es la definición misma de "base de cobro", es la
// exclusión del mostrador. La regla: si un bloque excluye 'TCKCTA', es comisión,
// y entonces DEBE excluir retenciones.
//
// Lo que este barrido deliberadamente NO toca: cualquier otro `FROM
// switch_recibos` (último pago del CXC, cobrado YTD de la ficha, backups). Ahí
// la retención puede o no contar según el caso y no es asunto de este candado.

describe("barrido: todo bloque de switch_recibos que excluya el mostrador excluye retenciones", () => {
  const migraciones = readdirSync(DIR_MIGRACIONES)
    .filter((f) => f.endsWith(".sql"))
    // El flag nació el 4-jun-2026; antes de esa migración la columna no existía
    // y exigirla sería exigir SQL que no compilaba.
    .filter((f) => !/^\d{14}_/.test(f) || f >= "20260604000000");

  it("hay migraciones que revisar (el filtro de arriba no se comió la lista)", () => {
    expect(migraciones.length).toBeGreaterThan(10);
  });

  for (const archivo of migraciones) {
    const bloques = bloquesDeRecibos(leerMigracion(archivo)).filter((b) => FILTRO_MOSTRADOR.test(b));
    if (bloques.length === 0) continue;
    it(`${archivo}: sus ${bloques.length} bloque(s) de cobro filtran es_retencion`, () => {
      for (const bloque of bloques) {
        expect(
          bloque,
          `${archivo}: hay una base de cobro (excluye TCKCTA) que NO excluye es_retencion. ` +
            "Una retención no es un cobro: bajó la deuda pero la plata se la llevó el Estado.",
        ).toMatch(FILTRO_RETENCION);
      }
    });
  }
});

// ─── 3. La otra mitad: el CXC NO se toca ─────────────────────────────────────
//
// El riesgo simétrico de este cambio es que alguien "termine el trabajo"
// llevando la exclusión al estado de cuenta. La deuda del cliente SÍ baja con la
// retención; si el CXC la ignorara, le estaríamos cobrando dos veces.

describe("el CXC sigue viendo las retenciones (la deuda SÍ baja)", () => {
  it("ninguna migración de estado de cuenta / aging filtra es_retencion", () => {
    const sospechosas = readdirSync(DIR_MIGRACIONES).filter(
      (f) => f.endsWith(".sql") && /estadocuenta|aging/i.test(f),
    );
    expect(sospechosas.length, "esperaba encontrar migraciones de estado de cuenta/aging").toBeGreaterThan(0);
    for (const archivo of sospechosas) {
      expect(
        leerMigracion(archivo),
        `${archivo}: el CXC/aging NO debe excluir retenciones — la deuda del cliente sí baja con ellas.`,
      ).not.toMatch(FILTRO_RETENCION);
    }
  });
});
