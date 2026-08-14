// Verificación por MUTACIÓN de los candados del #t200: el menú dice "Enviar
// correo" (no "email") y los DOS menús de la fila —el "···" y el de click
// derecho— dicen lo mismo. Rompe cada regla A PROPÓSITO, corre los tests, exige
// ROJO y deja el archivo como estaba. No toca la base ni nada externo.
//
// Uso: node scripts/_mutar-candados-t200.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const TESTS = ["src/__tests__/components/cxc-pestanas-y-menu.test.tsx"];

const CLIENT_TABLE = "src/app/admin/components/ClientTable.tsx";
const PANEL_MOVIL = "src/app/admin/components/PanelCxcMobile.tsx";

const MUTACIONES = [
  {
    nombre: "1. el menú '···' del escritorio vuelve a decir 'Enviar email'",
    archivo: CLIENT_TABLE,
    de: `    { label: "Enviar correo", onClick: () => onOpenEmail(client) },`,
    a: `    { label: "Enviar email", onClick: () => onOpenEmail(client) },`,
  },
  {
    nombre: "2. el menú '···' del celular vuelve a decir 'Enviar email'",
    archivo: PANEL_MOVIL,
    de: `    { label: "Enviar correo", onClick: () => onOpenEmail(client) },`,
    a: `    { label: "Enviar email", onClick: () => onOpenEmail(client) },`,
  },
  {
    nombre: "3. el click derecho vuelve a su propio vocabulario ('Email')",
    archivo: CLIENT_TABLE,
    de: `      label: "Enviar correo",\n      shortcut: "E",`,
    a: `      label: "Email",\n      shortcut: "E",`,
  },
  {
    nombre: "4. vuelve 'Ver en directorio' al menú de click derecho",
    archivo: CLIENT_TABLE,
    de: `      onClick: () => onOpenEmail(client),\n    },\n  ], [onOpenEmail]);`,
    a: `      onClick: () => onOpenEmail(client),\n    },\n    {\n      label: "Ver en directorio",\n      shortcut: "D",\n      onClick: () => { window.open("/clientes", "_blank"); },\n    },\n  ], [onOpenEmail]);`,
  },
  {
    nombre: "5. el click derecho vuelve a esconderse sin correo (no abre NADA)",
    archivo: CLIENT_TABLE,
    de: `      onClick: () => onOpenEmail(client),\n    },\n  ], [onOpenEmail]);`,
    a: `      onClick: () => onOpenEmail(client),\n      hidden: !client.correo,\n    },\n  ], [onOpenEmail]);`,
  },
  {
    nombre: "6. la fila pierde el click derecho (no abre ningún menú)",
    archivo: CLIENT_TABLE,
    de: `          onRowContextMenu={(e) => showContextMenu(e, buildClientContextMenu(client))}`,
    a: `          onRowContextMenu={undefined}`,
  },
];

let fallos = 0;
for (const m of MUTACIONES) {
  const original = readFileSync(m.archivo, "utf8");
  if (!original.includes(m.de)) {
    console.log(`⚠️  ${m.nombre} — NO se pudo aplicar (el texto cambió). REVISAR.`);
    fallos++;
    continue;
  }
  writeFileSync(m.archivo, original.replace(m.de, m.a));
  let rojo = false;
  let salida = "";
  try {
    salida = execSync(`npx vitest run ${TESTS.join(" ")} 2>&1`, { encoding: "utf8" });
  } catch (e) {
    rojo = true;
    salida = String(e.stdout ?? "");
  } finally {
    // El `finally` NO es adorno: sin él, un Ctrl-C o un error inesperado deja el
    // archivo MUTADO en el árbol de trabajo, que es la peor forma de fallar acá.
    writeFileSync(m.archivo, original);
  }
  const cuantos = (salida.match(/Tests\s+(\d+) failed/) ?? [])[1] ?? "?";
  console.log(`${rojo ? "🔴 CAZADA" : "🟢 PASÓ (¡MAL!)"}  ${m.nombre}${rojo ? ` — ${cuantos} test(s) en rojo` : ""}`);
  if (!rojo) fallos++;
}

console.log(fallos === 0 ? `\n✅ ${MUTACIONES.length}/${MUTACIONES.length} mutaciones cazadas.` : `\n❌ ${fallos} mutación(es) SIN cazar.`);
process.exit(fallos === 0 ? 0 : 1);
