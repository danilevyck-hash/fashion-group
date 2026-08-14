// Verificación por MUTACIÓN de los candados del #t198 (pestaña de Boston + menú
// de 4 opciones). Rompe cada regla A PROPÓSITO, corre los tests, exige ROJO y
// deja el archivo como estaba. Solo lectura sobre la base: no toca nada externo.
//
// Uso: node scripts/_mutar-candados-t198.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const TESTS = [
  "src/__tests__/lib/cxc-boston-permiso.test.ts",
  "src/__tests__/components/cxc-pestanas-y-menu.test.tsx",
  "src/__tests__/lib/navegacion-atras-fluido.test.ts",
  "src/__tests__/lib/cxc-anotaciones-cartera.test.ts",
];

const MUTACIONES = [
  {
    nombre: "1. el vendedor entra en ROLES_BOSTON",
    archivo: "src/lib/cxc/boston-roles.ts",
    de: `export const ROLES_BOSTON = ["admin", "secretaria"] as const;`,
    a: `export const ROLES_BOSTON = ["admin", "secretaria", "vendedor"] as const;`,
  },
  {
    nombre: "2. pestanasCxc deja de filtrar (la pestaña vuelve para todos)",
    archivo: "src/lib/cxc/boston-roles.ts",
    de: `return PESTANAS_CXC.filter((p) => p.key !== "boston" || puedeVerBoston(role)).map((p) => ({ ...p }));`,
    a: `return PESTANAS_CXC.map((p) => ({ ...p }));`,
  },
  {
    nombre: "3. tabCxcPermitida ignora el rol (?tab=boston vuelve a colarse)",
    archivo: "src/lib/cxc/boston-roles.ts",
    de: `return valor === "boston" && puedeVerBoston(role) ? "boston" : "grupo";`,
    a: `return valor === "boston" ? "boston" : "grupo";`,
  },
  {
    nombre: "4. el endpoint vuelve a escribir su propia lista de roles",
    archivo: "src/app/api/cxc/boston/route.ts",
    de: `requireRole(req, rolesBoston())`,
    a: `requireRole(req, ["admin", "secretaria"])`,
  },
  {
    nombre: "5. vuelve 'Ya contacté · Llamada' al menú del escritorio",
    archivo: "src/app/admin/components/ClientTable.tsx",
    de: `    { label: "WhatsApp", onClick: () => onWhatsApp(client) },`,
    a: `    { label: "Ya contacté · Llamada", onClick: () => onOpenEstado(client) },\n    { label: "WhatsApp", onClick: () => onWhatsApp(client) },`,
  },
  {
    nombre: "6. vuelve 'Ver en directorio' al menú del celular",
    archivo: "src/app/admin/components/PanelCxcMobile.tsx",
    de: `    { label: "Copiar mensaje", onClick: () => onCopyMessage(client) },\n  ];`,
    a: `    { label: "Copiar mensaje", onClick: () => onCopyMessage(client) },\n    { label: "Ver en directorio", onClick: () => onOpenEstado(client) },\n  ];`,
  },
  {
    nombre: "7. se cae una de las 4 que quedan (WhatsApp, escritorio)",
    archivo: "src/app/admin/components/ClientTable.tsx",
    de: `    { label: "WhatsApp", onClick: () => onWhatsApp(client) },\n`,
    a: ``,
  },
  {
    nombre: "8. TabsCartera vuelve a dibujar las dos pestañas a mano",
    archivo: "src/app/admin/components/TabsCartera.tsx",
    de: `  const pestanas = pestanasCxc(role);`,
    a: `  const pestanas = [{ key: "grupo" as const, label: "Grupo · 6 empresas" }, { key: "boston" as const, label: "Confecciones Boston" }];`,
  },
  {
    nombre: "9. el panel resuelve la pestaña sin mirar el rol",
    archivo: "src/app/admin/page.tsx",
    de: `const tab = tabCxcPermitida(tabRaw, userRole);`,
    a: `const tab = tabRaw === "boston" ? "boston" : "grupo";`,
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
