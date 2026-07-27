/**
 * VERIFICA EL RUTEO de los dos canales de Telegram — y manda, como mucho,
 * UN mensaje real a cada uno.
 *
 *   npx tsx scripts/_probe-canales-telegram.ts            # solo diagnóstico
 *   npx tsx scripts/_probe-canales-telegram.ts --enviar   # + 1 msg por canal
 *
 * Sin `--enviar` NO toca Telegram: imprime a qué bot y a qué chat iría cada
 * canal, que es lo que hace falta para confirmar la configuración sin ruido.
 *
 * Con `--enviar` manda exactamente 2 mensajes (uno de negocio, uno de sistema)
 * marcados como prueba. Se usa para certificar el ruteo end-to-end una vez.
 */
import fs from "node:fs";
import { destinoPorDefecto } from "../src/lib/telegram";
import { destinoSistema, enviarNegocio, enviarSistema } from "../src/lib/alertas/canal";

// .env.local para correrlo a mano (las de la shell mandan sobre el archivo).
if (fs.existsSync(".env.local")) {
  for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    if (!l.includes("=") || l.trim().startsWith("#")) continue;
    const i = l.indexOf("=");
    const k = l.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = l.slice(i + 1).trim();
  }
}

const enviar = process.argv.includes("--enviar");

/** Nunca imprimir un token entero: es una credencial. */
const tapar = (t: string) => `${t.slice(0, 10)}…${t.slice(-4)} (${t.length} chars)`;

async function quienEs(token: string): Promise<string> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const j = (await res.json()) as { ok: boolean; result?: { username?: string } };
    return j.ok && j.result?.username ? `@${j.result.username}` : "??? (getMe falló)";
  } catch {
    return "??? (sin red)";
  }
}

async function main() {
  const negocio = destinoPorDefecto();
  const sistema = destinoSistema() ?? negocio;

  if (!negocio) {
    console.error("✖ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID no configurados. Nada que probar.");
    process.exit(1);
  }

  console.log("\n📊 CANAL NEGOCIO");
  console.log(`   bot  ${await quienEs(negocio.token)}  ${tapar(negocio.token)}`);
  console.log(`   chat ${negocio.chatId}`);

  console.log("\n🔧 CANAL SISTEMA");
  console.log(`   bot  ${await quienEs(sistema!.token)}  ${tapar(sistema!.token)}`);
  console.log(`   chat ${sistema!.chatId}`);

  const separados = sistema!.token !== negocio.token || sistema!.chatId !== negocio.chatId;
  console.log(
    `\n${separados ? "✔ SEPARADOS" : "• MISMO DESTINO"} — ` +
      (separados
        ? "sistema va a su propio bot/chat."
        : "sin TELEGRAM_BOT_TOKEN_SISTEMA + TELEGRAM_CHAT_ID_SISTEMA todo cae en el canal de siempre (fail-safe)."),
  );

  if (!enviar) {
    console.log("\n(no se mandó nada — agregá --enviar para mandar 1 mensaje a cada canal)\n");
    return;
  }

  const sello = new Date().toISOString().slice(0, 16).replace("T", " ");
  const okNeg = await enviarNegocio(`✅ Prueba de canal NEGOCIO (${sello} UTC). Este chat sigue igual que siempre.`);
  const okSis = await enviarSistema(`Prueba del canal SISTEMA (${sello} UTC). Acá van solo los avisos de que algo está roto.`);

  console.log(`\n  negocio → ${okNeg ? "enviado ✔" : "FALLÓ ✖"}`);
  console.log(`  sistema → ${okSis ? "enviado ✔" : "FALLÓ ✖"}\n`);
  if (!okNeg || !okSis) process.exit(1);
}

void main();
