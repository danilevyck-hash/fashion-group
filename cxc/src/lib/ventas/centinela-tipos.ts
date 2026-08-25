// ─────────────────────────────────────────────────────────────────────────────
// EL CENTINELA DE TIPOS DE COMPROBANTE DE VENTA
//
// ═══ 🩸 QUÉ PROBLEMA CIERRA ══════════════════════════════════════════════════
//
// En **mayo de 2025 Switch estrenó el tipo «Transacción»** (reemplazó a
// «Tiquete»). Alguien lo agregó a tiempo y no se perdió una sola venta — **por
// suerte**. Si mañana Switch inventa otro tipo, esa venta cae al `ELSE 0` de las
// vistas de ventas y **desaparece del tablero sin una sola alerta**: no hay
// error, no suena nada, el total sale más bajo y nadie se entera.
//
// En la CARTERA ese guard existe desde mayo-2026
// (`switch_estadocuenta_tipos_sin_clasificar` + el check diario
// `aging_tipos_sin_clasificar`). Este es el mismo mecanismo para ventas.
//
// ⚠️ **La venta NO se descarta.** Sigue guardada en `switch_facturas` con su
// tipo tal como vino y sigue valiendo 0 en los reportes — que es lo honesto:
// adivinarle un signo a un tipo que nadie clasificó sería inventar plata. Lo
// único que cambia es que ahora AVISA.
//
// ═══ POR QUÉ NO ESTRENA UNA ALERTA NUEVA ═════════════════════════════════════
//
// La lista de alertas de sistema es CERRADA (4 reglas, CLAUDE.md). Esto entra en
// la **regla 2 — "algo se rompió y no se arregló solo"** y sale por la maquinaria
// que ya existe: `alertSwitchCronErrors` → canal 🔧 SISTEMA, con la regla de los
// **2 fallos seguidos** y el rastro completo en `cron_email_errors`. Este módulo
// NO manda Telegram por su cuenta: devuelve `CronSwitchError[]` y el cron los
// suma a la ÚNICA llamada que ya hacía.
//
// 🔑 **Y por eso deja su propia fila en `switch_sync_log`** (`sync_type =
// 'ventas_tipos'`, una por empresa y corrida). La racha se mide sobre el par
// `(empresa, sync_type)`: sin filas propias, `evaluateSwitchEscalation` no
// tendría historia que leer, caería en "sin-historia" (fail-open) y avisaría en
// la PRIMERA corrida y en todas las siguientes, para siempre. Con filas, el
// comportamiento es el mismo que el de cualquier sync: la 1ª corrida se calla,
// la 2ª avisa, y el día que alguien clasifique el tipo la fila vuelve a
// `success` y la racha se reinicia sola.
//
// ⚠️ **No toca el heartbeat.** Un tipo nuevo no significa que el cron de
// facturas haya fallado —las facturas se escribieron bien—, así que el cron
// sigue registrando su latido y no despierta al vigía de crones caídos.
//
// ═══ DEGRADACIÓN LIMPIA ══════════════════════════════════════════════════════
// Si las vistas todavía no existen (la migración la corre Daniel a mano), el
// centinela lo reconoce, lo dice en el log y NO avisa. Nunca lanza: un centinela
// que puede tumbar el sync que vigila es peor que no tenerlo.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { esTablaAusente } from "@/lib/contable/tabla-ausente";
import { createSwitchSyncLog, finishSwitchSyncLog } from "@/lib/switch-api/sync-log";
import type { CronSwitchError } from "@/lib/switch-api/alert-policy";
import { TIPOS_VENTA_CONOCIDOS, CODIGOS_ARTICULO_CONOCIDOS } from "./tipos-comprobante";

/** Las dos vistas que el centinela lee. Los tipos que cada una considera
 *  conocidos salen de `tipos-comprobante.ts`, que es donde la lista se dice una
 *  sola vez; el test compara el SQL contra esas constantes. */
export const VISTA_VENTAS = "switch_facturas_tipos_sin_clasificar";
export const VISTA_ARTICULOS = "switch_articulo_diario_tipos_sin_clasificar";

/** El `sync_type` con el que el centinela deja rastro. */
export const SYNC_TYPE_CENTINELA = "ventas_tipos" as const;

export interface TipoSinClasificar {
  empresaKey: string;
  /** El valor crudo que mandó Switch. `null` es un caso legítimo y también
   *  cuenta: una fila sin tipo tampoco la sabe contar nadie. */
  tipo: string | null;
  /** De dónde salió: las ventas (`ELSE 0`, la plata desaparece) o el diario de
   *  artículos (`ELSE +`, la plata se suma sin permiso). */
  fuente: "ventas" | "articulos";
  filas: number;
  filasConPlata: number;
  plata: number;
}

export type MedicionCentinela =
  | { ok: true; hallazgos: TipoSinClasificar[] }
  | { ok: false; motivo: string };

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Lee las dos vistas. NO decide nada: eso es de `hallazgosQueAvisan`.
 *
 * Devuelve `ok:false` cuando no pudo medir (vista ausente, permiso, red). "No
 * pude mirar" NO es "está todo bien" y tampoco es una alerta: se dice y se
 * sigue.
 */
export async function medirTiposSinClasificar(): Promise<MedicionCentinela> {
  const hallazgos: TipoSinClasificar[] = [];
  try {
    const ventas = await supabaseServer
      .from(VISTA_VENTAS)
      .select("empresa_key, tipo_comprobante, filas, filas_con_plata, suma_base");
    if (ventas.error) {
      return {
        ok: false,
        motivo: esTablaAusente(ventas.error)
          ? `la vista ${VISTA_VENTAS} todavía no existe (migración pendiente)`
          : `no pude leer ${VISTA_VENTAS}: ${ventas.error.message}`,
      };
    }
    for (const r of ventas.data ?? []) {
      const f = r as Record<string, unknown>;
      hallazgos.push({
        empresaKey: String(f.empresa_key ?? ""),
        tipo: (f.tipo_comprobante as string | null) ?? null,
        fuente: "ventas",
        filas: n(f.filas),
        filasConPlata: n(f.filas_con_plata),
        plata: n(f.suma_base),
      });
    }

    const arts = await supabaseServer
      .from(VISTA_ARTICULOS)
      .select("empresa_key, tipo, filas, filas_con_plata, suma_venta");
    if (arts.error) {
      return {
        ok: false,
        motivo: esTablaAusente(arts.error)
          ? `la vista ${VISTA_ARTICULOS} todavía no existe (migración pendiente)`
          : `no pude leer ${VISTA_ARTICULOS}: ${arts.error.message}`,
      };
    }
    for (const r of arts.data ?? []) {
      const f = r as Record<string, unknown>;
      hallazgos.push({
        empresaKey: String(f.empresa_key ?? ""),
        tipo: (f.tipo as string | null) ?? null,
        fuente: "articulos",
        filas: n(f.filas),
        filasConPlata: n(f.filas_con_plata),
        plata: n(f.suma_venta),
      });
    }
    return { ok: true, hallazgos };
  } catch (err) {
    return { ok: false, motivo: `el centinela de tipos no pudo medir: ${String(err)}` };
  }
}

/**
 * Los hallazgos que MERECEN aviso: los que traen plata. PURA.
 *
 * Un tipo nuevo sin un centavo asociado existe (Switch a veces deja un
 * comprobante en cero) y no está torciendo ningún número todavía: queda anotado
 * en `skip_details` y no despierta a nadie. Es la misma gradación que usa la
 * cartera —`critical` con saldo, `warning` sin él— dicha en la moneda de este
 * canal: avisar o callar.
 */
export function hallazgosQueAvisan(
  hallazgos: readonly TipoSinClasificar[],
): TipoSinClasificar[] {
  return hallazgos.filter((h) => h.filasConPlata > 0);
}

const plataFmt = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * El texto del error, uno por empresa. PURO, para poder revisar la redacción de
 * un aviso que ojalá nunca salga sin base ni Telegram.
 *
 * Habla de negocio, no de tablas: quien lo lee tiene que entender qué plata está
 * mal contada y por qué, sin abrir el código.
 */
export function textoDelHallazgo(hallazgos: readonly TipoSinClasificar[]): string {
  const nombrar = (h: TipoSinClasificar) => `"${h.tipo ?? "(sin tipo)"}"`;
  const partes = hallazgos.map((h) =>
    h.fuente === "ventas"
      ? `${nombrar(h)} en ${h.filas} venta(s) por ${plataFmt(h.plata)}, que el tablero está contando como CERO`
      : `${nombrar(h)} en ${h.filas} línea(s) de artículo por ${plataFmt(h.plata)}, que se está sumando al costo sin clasificar`,
  );
  return (
    `Switch mandó un tipo de comprobante que el sistema no sabe contar: ${partes.join(" · ")}. ` +
    `Hay que clasificarlo (¿suma o resta?) para que la plata vuelva a los totales.`
  );
}

/**
 * El centinela completo: mide, deja rastro en `switch_sync_log` y devuelve los
 * errores que el cron tiene que sumar a su ÚNICA llamada a
 * `alertSwitchCronErrors`.
 *
 * `empresas` son las que ESTA corrida sincronizó: se les escribe la fila del
 * log (success o error) para que la racha se pueda medir y, sobre todo, para
 * que un tipo ya clasificado deje de sonar. Un hallazgo de una empresa que esta
 * corrida no tocó igual se avisa —la plata está mal contada igual—, pero no se
 * le inventa una fila de log.
 *
 * NUNCA lanza.
 */
export async function correrCentinelaTipos(
  empresas: readonly string[],
): Promise<CronSwitchError[]> {
  const medicion = await medirTiposSinClasificar();
  if (!medicion.ok) {
    // No pude mirar ≠ está todo bien, y tampoco es una alerta. Queda en el log
    // del cron para que se pueda auditar por qué el centinela estuvo ciego.
    console.error(`[centinela-tipos] ${medicion.motivo}`);
    return [];
  }

  const avisan = hallazgosQueAvisan(medicion.hallazgos);
  const mudos = medicion.hallazgos.filter((h) => h.filasConPlata === 0);
  if (mudos.length > 0) {
    console.error(
      `[centinela-tipos] ${mudos.length} tipo(s) sin clasificar SIN plata (no avisan): ` +
        mudos.map((h) => `${h.empresaKey}/${h.tipo ?? "(sin tipo)"}`).join(", "),
    );
  }

  // Una fila de log por empresa medida, para que la racha tenga qué contar.
  for (const empresaKey of empresas) {
    const suyos = avisan.filter((h) => h.empresaKey === empresaKey);
    let logId: string | null = null;
    try {
      logId = await createSwitchSyncLog({
        empresaKey,
        syncType: SYNC_TYPE_CENTINELA,
        triggeredBy: "cron",
      });
      if (suyos.length === 0) {
        await finishSwitchSyncLog(logId, "success", {
          skipped: medicion.hallazgos.filter((h) => h.empresaKey === empresaKey).length,
        });
      } else {
        await finishSwitchSyncLog(logId, "error", { errorMessage: textoDelHallazgo(suyos) });
      }
    } catch (err) {
      // El logger es degradable (CHECK sin el tipo, lock, red). Se pierde la
      // observabilidad de ESTA corrida, no el aviso.
      console.error(`[centinela-tipos] no pude registrar la corrida de ${empresaKey}: ${String(err)}`);
    }
  }

  // Un error por empresa afectada: el mensaje de Telegram sale en UN solo
  // mensaje con un renglón por empresa (así lo arma `construirMensajeEscalado`).
  const porEmpresa = new Map<string, TipoSinClasificar[]>();
  for (const h of avisan) {
    porEmpresa.set(h.empresaKey, [...(porEmpresa.get(h.empresaKey) ?? []), h]);
  }
  return [...porEmpresa.entries()].map(([empresaKey, hs]) => ({
    empresaKey,
    syncType: SYNC_TYPE_CENTINELA,
    error: textoDelHallazgo(hs),
  }));
}
