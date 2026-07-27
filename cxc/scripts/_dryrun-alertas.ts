/**
 * DRY-RUN de las alertas — NO manda nada a Telegram.
 *
 * Imprime, tal como los vería Daniel en el celular, los mensajes de los DOS
 * canales. Sirve para revisar redacción sin spamear el chat real.
 *
 *   npx tsx scripts/_dryrun-alertas.ts
 */
import { describirCronParaDaniel } from "../src/lib/cron-telemetry";
import { consecuenciaDeSyncType } from "../src/lib/switch-api/alert-policy";
import { PREFIJO_SISTEMA } from "../src/lib/alertas/canal";
import { shortError } from "../src/lib/telegram";

const linea = "─".repeat(64);
const sis = (s: string) => `${PREFIJO_SISTEMA}${s}`;

console.log(`\n${linea}\n📊 CANAL NEGOCIO — Daniel los quiere TODOS, sin filtro\n${linea}`);
console.log("(texto sin cambios respecto de hoy; se listan para ver el contraste)\n");
for (const m of [
  "📊 Resumen del día — ACS  ·  Ventas $4.231,50 …",
  "🛒 Pedido nuevo del link — Reebok RBK-0142 · Cliente X · $1.980,00",
  "📦 Pedido Reebok RBK-0142 enviado a Switch → 5521 ✓ verificado · Cliente X / Vendedor Y",
  "📦 GT-1234 despachada · Cliente X · 12 bultos",
  "⚠️ 2 cheques por vencer — $8.400,00\n• Cliente X (Fashion Wear) $5.000,00 — HOY",
  "⚠️ Costo sospechoso en artículos — active_shoes\n• 2026-07-26 · 10021 ZAPATO [FAC]: costo $9.900,00 × 2 und",
]) console.log(`  ${m.replace(/\n/g, "\n  ")}\n`);

console.log(`${linea}\n🔧 CANAL SISTEMA — solo lo que está roto y necesita acción\n${linea}\n`);

const ejemplos: Array<[string, string]> = [
  [
    "Switch caído de verdad (tras 2+ intentos, ya no es pasajero)",
    sis(
      "Switch lleva rato sin responder para Fashion Shoes y ya no parece un corte pasajero.\n" +
        "Viene fallando desde 26 jul 2026, 11:20 (3 intentos seguidos).\n" +
        `Qué significa: ${consecuenciaDeSyncType("estadocuenta")}\n` +
        "Qué hacer: avisame para revisarlo.\n" +
        `Detalle: ${shortError("Auth respondió 200 pero sin token: <!DOCTYPE html><html><head><title>Exception - SWITCH SOFT</title>")}`,
    ),
  ],
  [
    "Tarea automática caída (antes: '⏰ Watchdog crons — 1 sin success reciente')",
    sis(
      "Una tarea automática lleva más de un día sin completarse.\n" +
        "Qué significa: puede haber datos sin actualizar en la app.\n" +
        "Qué hacer: avisame para revisarlo.\nDetalle: sync-proveedores",
    ),
  ],
  [
    "Error genérico de cron (antes: '🚨 Cron error — refresh_clientes_vw')",
    sis(`${describirCronParaDaniel("refresh_clientes_vw")}\nDetalle: canceling statement due to statement timeout`),
  ],
  [
    "Backup incompleto SIN segunda oportunidad hoy",
    sis(
      "La copia de seguridad de hoy quedó incompleta (2 tabla(s) sin copiar) y hoy ya no queda otro intento.\n" +
        "Qué significa: si hubiera que recuperar datos de hoy, faltarían esas tablas.\n" +
        "Qué hacer: avisame para revisarlo.\n" +
        `Detalle: ${shortError('<?xml version="1.0"?><Error><Code>AccessDenied</Code></Error>')}`,
    ),
  ],
];
for (const [titulo, msg] of ejemplos) {
  console.log(`▸ ${titulo}`);
  console.log(`  ${msg.replace(/\n/g, "\n  ")}\n`);
}

console.log(`${linea}\n🔇 LO QUE YA NO SUENA\n${linea}`);
console.log(`  · "ℹ️ Switch estuvo caído de 06:06 a 10:53 — todo re-sincronizado, sin impacto."
      → se declara a sí mismo un no-evento; queda registrado, no suena.
  · Fallo de backup a las 06:00 cuando 10:30 y 18:30 todavía van a correr.
  · Página de error HTML de Switch en el 1er intento (se recupera sola).
  · Cron retirado que ya no existe (lo cerró el #320).\n`);
