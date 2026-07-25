import fs from "node:fs";
async function main() {
  for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
    if (!l.includes("=") || l.trim().startsWith("#")) continue;
    const i = l.indexOf("=");
    process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  const lib = await import("../src/lib/acs-resumen-diario");
  const fecha = process.argv[2] || "2026-07-24";
  const r = await lib.calcularResumenDiario(fecha, true);
  console.log("RESUMEN:", JSON.stringify(r));
  console.log("\n--- TEXTO PLANO ---");
  console.log(lib.buildMensaje(r));
  console.log("\n--- HTML (lo que se manda) ---");
  console.log(lib.buildMensajeHtml(r));
}
main();
