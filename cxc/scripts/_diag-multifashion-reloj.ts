/* ─────────────────────────────────────────────────────────────────────────────
 * SOLO LECTURA. ¿La gente de Multi Fashion marca el reloj?
 *
 * Mapeo previo a decidir si Multi Fashion entra al módulo de Asistencia. No
 * escribe nada: solo lee POR LA PUERTA DEL MÓDULO (`leerPersonas` y
 * `leerCodigosConMarcaciones` de `config-server.ts`), que es lo que usa la
 * pantalla — un `select` crudo se comería el paginado de 1.000 filas y la
 * lectura escalonada de columnas que todavía no migraron.
 *
 * Contesta tres cosas y nada más:
 *   1. Qué códigos marcaron en el reloj y cuáles de ellos tienen ficha.
 *   2. Si alguno de los 9 nombres de la planilla de Multi Fashion aparece
 *      —por nombre— entre las fichas o entre los que marcan.
 *   3. Cómo se reparten las fichas por empresa.
 *
 * 🔑 El cruce es POR APELLIDO ADEMÁS DE POR NOMBRE, a propósito. «Jenifer
 * Miranda» (Multi Fashion) y «Jennifer Armas» (Boston) son DOS personas
 * distintas: cruzar solo por el nombre de pila las fundiría en una y la
 * respuesta saldría al revés. Por eso cada coincidencia se imprime con el
 * nombre completo de la ficha, para que se vea cuál es cuál.
 * ────────────────────────────────────────────────────────────────────────── */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  if (!l.includes("=") || l.trim().startsWith("#")) continue;
  const i = l.indexOf("=");
  if (!process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}

/** Los 9 nombres del Excel «Planilla Quincenal -15 de julio de 2026». */
const MULTIFASHION = [
  "Jenifer Miranda", "Widney Miranda", "Ana Trejos", "Angel Pizza",
  "Jailine Quispe", "Milagros Torres", "Yeisibeth Muñoz",
  "Cindy De Gracia", "Sheynee Batista",
];

/** Sin tildes, sin dobles espacios y en minúsculas: «Muñoz» = «munoz». */
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  // Import DIFERIDO a propósito: `supabase-server.ts` arma el cliente al cargarse,
  // y los `import` de arriba corren ANTES del bloque que lee `.env.local`.
  const { leerPersonas, leerCodigosConMarcaciones } = await import("../src/lib/asistencia/config-server");
  const { filas, faltaMigracion, faltaColumnasBajas } = await leerPersonas();
  const codigos = await leerCodigosConMarcaciones();

  console.log(`fichas en asistencia_personas: ${filas.length}  (faltaMigracion=${faltaMigracion} faltaColumnasBajas=${faltaColumnasBajas})`);
  console.log(`códigos con marcaciones (ventana 180 días): ${codigos.size}`);

  const porEmpresa = new Map<string, number>();
  for (const f of filas) porEmpresa.set(String(f.empresa ?? "(sin empresa)"), (porEmpresa.get(String(f.empresa ?? "(sin empresa)")) ?? 0) + 1);
  console.log("\n── fichas por empresa ──");
  for (const [e, n] of [...porEmpresa].sort((a, b) => b[1] - a[1])) console.log(`  ${String(e).padEnd(24)} ${n}`);

  const conFicha = new Set(filas.map((f) => String(f.empleado_codigo).trim()));
  const marcanSinFicha = [...codigos].filter((c) => !conFicha.has(c)).sort((a, b) => Number(a) - Number(b));
  const fichaSinMarcar = filas.filter((f) => !codigos.has(String(f.empleado_codigo).trim()));
  console.log(`\ncódigos que marcan SIN ficha: ${marcanSinFicha.length} → ${marcanSinFicha.join(", ")}`);
  console.log(`fichas que NO marcaron en 180 días: ${fichaSinMarcar.length} → ${fichaSinMarcar.map((f) => `${f.empleado_codigo}:${f.nombre ?? "?"}`).join(" · ")}`);

  console.log("\n── los 9 de Multi Fashion contra las fichas ──");
  for (const nom of MULTIFASHION) {
    const partes = norm(nom).split(" ").filter((p) => p.length > 2);
    const hits = filas.filter((f) => {
      const n = norm(String(f.nombre ?? ""));
      return partes.some((p) => n.split(" ").includes(p));
    });
    const detalle = hits.map((f) => `${f.empleado_codigo}:${f.nombre}[${f.empresa}]${codigos.has(String(f.empleado_codigo).trim()) ? " MARCA" : " no-marca"}`);
    console.log(`  ${nom.padEnd(20)} → ${detalle.length ? detalle.join(" · ") : "SIN FICHA"}`);
  }

  console.log("\n── todas las fichas (código · nombre · empresa · ¿marcó?) ──");
  for (const f of [...filas].sort((a, b) => Number(a.empleado_codigo) - Number(b.empleado_codigo))) {
    console.log(`  ${String(f.empleado_codigo).padStart(3)} ${String(f.nombre ?? "?").padEnd(32)} ${String(f.empresa ?? "?").padEnd(20)} ${codigos.has(String(f.empleado_codigo).trim()) ? "marcó" : "—"}`);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * SEGUNDA PASADA: el único código que marca sin ficha (50) y los relojes.
 *
 * 🔑 Un código huérfano NO alcanza para esconder a los 9 de Multi Fashion, pero
 * hay que mirarlo igual: si resultara ser de tienda, la respuesta cambiaría de
 * «ninguno marca» a «uno marca». Se lee la quincena del Excel (1-15 jul 2026)
 * para poder comparar contra las «104 HORAS» que declara el comprobante.
 * ────────────────────────────────────────────────────────────────────────── */
async function segundaPasada() {
  const { supabaseServer } = await import("../src/lib/supabase-server");

  const disp = await supabaseServer.from("asistencia_dispositivos").select("*");
  console.log("\n── relojes registrados ──");
  console.log(disp.error ? `error: ${disp.error.message}` : JSON.stringify(disp.data, null, 1));

  // Panamá es UTC−5 fijo: el 1 de julio local arranca a las 05:00Z.
  const DESDE = "2026-07-01T05:00:00Z";
  const HASTA = "2026-07-16T05:00:00Z";
  const c50 = await supabaseServer
    .from("asistencia_marcaciones")
    .select("ocurrio_en, empleado_codigo, empleado_nombre, dispositivo", { count: "exact" })
    .eq("empleado_codigo", "50")
    .gte("ocurrio_en", DESDE).lte("ocurrio_en", HASTA)
    .order("ocurrio_en").limit(20);
  console.log(`\n── código 50 en la quincena 1-15 jul 2026: ${c50.count ?? "?"} marcaciones ──`);
  for (const f of c50.data ?? []) console.log(" ", JSON.stringify(f));

  const rango = await supabaseServer
    .from("asistencia_marcaciones")
    .select("ocurrio_en", { count: "exact", head: true });
  console.log(`\nmarcaciones totales en la tabla: ${rango.count ?? "?"}`);
}

main().then(segundaPasada).catch((e) => { console.error(e); process.exit(1); });
