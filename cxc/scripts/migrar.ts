// `npm run migrar supabase/migrations/<archivo>.sql [-- --dry-run | --forzar]`
//
// Aplica UNA migración a Supabase desde la terminal, previa confirmación.
// El flujo y el porqué están en `scripts/migrar-core.ts`.

import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { migrar } from "./migrar-core";

const RAIZ = path.resolve(__dirname, "..");

function uso(): never {
  console.log(
    [
      "Uso:",
      "  npm run migrar supabase/migrations/<archivo>.sql",
      "  npm run migrar supabase/migrations/<archivo>.sql -- --dry-run   (muestra, no aplica)",
      "  npm run migrar supabase/migrations/<archivo>.sql -- --forzar    (repite una ya registrada)",
    ].join("\n"),
  );
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const banderas = new Set(args.filter((a) => a.startsWith("--")));
  const rutas = args.filter((a) => !a.startsWith("--"));
  const desconocidas = [...banderas].filter((b) => !["--dry-run", "--forzar"].includes(b));
  if (desconocidas.length) {
    console.log(`Opción desconocida: ${desconocidas.join(" ")}`);
    uso();
  }
  if (rutas.length !== 1) uso();

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const r = await migrar(
      {
        ruta: rutas[0],
        raiz: RAIZ,
        dryRun: banderas.has("--dry-run"),
        forzar: banderas.has("--forzar"),
      },
      {
        fetch: globalThis.fetch,
        preguntar: (texto) => rl.question(texto),
        escribir: (l) => console.log(l),
      },
    );
    process.exitCode = r.ok ? 0 : 1;
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  // El token nunca va en el mensaje: los errores de red no lo incluyen.
  console.log(`❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
