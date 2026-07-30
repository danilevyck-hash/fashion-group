// Candados del vigía de recursos de la base (/api/cron/db-salud + src/lib/db-recursos.ts).
//
// Contexto: el 26-jul-2026 el proyecto de Supabase se ahogó y devolvió 521
// durante 1 h 16 min sin que nada avisara. La telemetría existente escribe en
// `cron_email_errors`, que vive DENTRO de la base caída — medido: cero filas en
// esa ventana. Este módulo es el único vigía que no depende de Postgres, así
// que sus umbrales y su parser tienen que quedar clavados.
//
// La muestra de abajo son líneas REALES del endpoint del proyecto
// (rspocgqhtpveytgbtler) leídas el 27-jul-2026 a las 00:19 UTC con compute
// Micro en reposo. Sirve de línea base: si un cambio de umbrales hiciera que un
// día normal alerte, este test falla.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import {
  parsePrometheus,
  leerMuestra,
  evaluarRecursos,
  mensajeRecursos,
  mensajeSinLectura,
  UMBRALES,
  DB_LIMITE_BYTES,
  type MuestraRecursos,
} from "@/lib/db-recursos";

const L = `supabase_project_ref="rspocgqhtpveytgbtler",supabase_identifier="rspocgqhtpveytgbtler",service_type="db"`;
const P = `supabase_project_ref="rspocgqhtpveytgbtler",supabase_identifier="rspocgqhtpveytgbtler",service_type="postgresql",server="localhost:5432"`;

/** Foto real del proyecto en reposo (27-jul-2026 00:19 UTC, compute Micro). */
const MUESTRA_REAL = `
# HELP node_memory_MemTotal_bytes Memory information field MemTotal_bytes.
# TYPE node_memory_MemTotal_bytes gauge
node_memory_MemTotal_bytes{${L}} 9.50153216e+08
node_memory_MemAvailable_bytes{${L}} 5.39734016e+08
node_memory_MemFree_bytes{${L}} 7.6664832e+07
node_memory_SwapTotal_bytes{${L}} 1.073737728e+09
node_memory_SwapFree_bytes{${L}} 9.29267712e+08
node_filesystem_size_bytes{${L},device="/dev/nvme0n1",device_error="",fstype="ext4",mountpoint="/data"} 8.350298112e+09
node_filesystem_avail_bytes{${L},device="/dev/nvme0n1",device_error="",fstype="ext4",mountpoint="/data"} 7.679680512e+09
node_filesystem_size_bytes{${L},device="/dev/nvme1n1p2",device_error="",fstype="ext4",mountpoint="/"} 1.0359754752e+10
node_filesystem_avail_bytes{${L},device="/dev/nvme1n1p2",device_error="",fstype="ext4",mountpoint="/"} 2.910277632e+09
node_cpu_online{${L},cpu="0"} 1
node_cpu_online{${L},cpu="1"} 1
node_load1{${L}} 0.01
node_load5{${L}} 0.04
node_load15{${L}} 0.04
pg_database_size_bytes{supabase_project_ref="x",supabase_identifier="x",service_type="postgresql",datname="postgres"} 2.61524627e+08
pg_database_size_bytes{supabase_project_ref="x",supabase_identifier="x",service_type="postgresql",datname="template0"} 7.520783e+06
pg_stat_database_num_backends{${P}} 9
max_connections_connection_count{${P}} 60
`;

describe("parsePrometheus", () => {
  it("ignora comentarios y lee nombre, etiquetas y valor", () => {
    const m = parsePrometheus(MUESTRA_REAL);
    expect(m.some((x) => x.nombre.startsWith("#"))).toBe(false);

    const load1 = m.find((x) => x.nombre === "node_load1");
    expect(load1?.valor).toBe(0.01);
    expect(load1?.labels.service_type).toBe("db");
  });

  it("entiende la notación científica que usa Supabase", () => {
    const m = parsePrometheus(MUESTRA_REAL);
    expect(m.find((x) => x.nombre === "node_memory_MemTotal_bytes")?.valor).toBe(950153216);
  });

  it("no explota con basura ni con una respuesta vacía", () => {
    expect(parsePrometheus("")).toEqual([]);
    expect(parsePrometheus("<!DOCTYPE html>\n<title>521</title>")).toEqual([]);
    // Una línea sin número no debe colarse como 0 (un 0 se leería como emergencia).
    expect(parsePrometheus("node_load1{a=\"b\"} NaN")).toEqual([]);
  });
});

describe("leerMuestra", () => {
  const m = leerMuestra(MUESTRA_REAL);

  it("mide la memoria contra el total, no contra MemFree", () => {
    // MemFree son 76 MB (8%) pero MemAvailable son 539 MB (57%): usar MemFree
    // haría que un servidor sano alertara todos los días.
    expect(m.memoriaDisponibleBytes).toBe(539734016);
    expect(m.memoriaDisponiblePct).toBeCloseTo(56.8, 1);
  });

  it("calcula el swap usado como total menos libre", () => {
    expect(m.swapUsadoBytes).toBe(1073737728 - 929267712);
    expect(m.swapUsadoPct).toBeCloseTo(13.5, 1);
  });

  it("toma la partición /data y NO la del sistema", () => {
    // La raíz está al 28% libre; /data al 92%. Confundirlas daría un aviso falso.
    expect(m.discoTotalBytes).toBe(8350298112);
    expect(m.discoDisponiblePct).toBeCloseTo(91.97, 1);
  });

  it("mide solo la base postgres, no las template", () => {
    expect(m.dbBytes).toBe(261524627);
    expect(m.dbUsadoPct).toBeCloseTo((261524627 / DB_LIMITE_BYTES) * 100, 5);
    expect(m.dbUsadoPct!).toBeLessThan(4);
  });

  it("cuenta los núcleos sumando node_cpu_online y divide la carga", () => {
    expect(m.cpuNucleos).toBe(2);
    expect(m.cargaPorNucleo).toBeCloseTo(0.02, 2);
  });

  it("lee conexiones actuales y máximo", () => {
    expect(m.conexiones).toBe(9);
    expect(m.conexionesMax).toBe(60);
    expect(m.conexionesPct).toBeCloseTo(15, 1);
  });

  it("devuelve null (no cero) cuando la métrica no vino", () => {
    const vacia = leerMuestra("");
    expect(vacia.memoriaDisponiblePct).toBeNull();
    expect(vacia.discoDisponiblePct).toBeNull();
    expect(vacia.cargaPorNucleo).toBeNull();
  });
});

describe("evaluarRecursos", () => {
  it("un día normal NO alerta (línea base real del proyecto)", () => {
    const ev = evaluarRecursos(leerMuestra(MUESTRA_REAL));
    expect(ev.nivel).toBe("ok");
    expect(ev.hallazgos).toEqual([]);
  });

  it("una lectura vacía tampoco alerta: sin dato no se inventa emergencia", () => {
    // El grito por "no pude leer" lo da la ruta con mensajeSinLectura, no acá.
    const ev = evaluarRecursos(leerMuestra(""));
    expect(ev.nivel).toBe("ok");
  });

  const base: MuestraRecursos = leerMuestra(MUESTRA_REAL);

  it("avisa cuando la memoria libre baja del 20% y grita bajo el 10%", () => {
    expect(evaluarRecursos({ ...base, memoriaDisponiblePct: 21 }).nivel).toBe("ok");
    expect(evaluarRecursos({ ...base, memoriaDisponiblePct: 19 }).nivel).toBe("aviso");
    expect(evaluarRecursos({ ...base, memoriaDisponiblePct: 8 }).nivel).toBe("critico");
  });

  it("tolera el swap normal de Micro pero avisa si sube de verdad", () => {
    // 13,5% es la línea base en reposo: no puede alertar.
    expect(evaluarRecursos({ ...base, swapUsadoPct: 13.5 }).nivel).toBe("ok");
    // 40,3% fue la medición real del 30-jul-2026 con la base SANA (memoria libre
    // 53,3%, oom_kill 0). Con el umbral viejo de 40 esto mandaba un 🟡 de ruido
    // puro, y encima Daniel lo leyó como falta de espacio en disco. El swap usado
    // es una marca de marea pegajosa (13,5% → 40,3% en 3 días sin incidentes):
    // un umbral cerca de la deriva normal alerta para siempre.
    expect(evaluarRecursos({ ...base, swapUsadoPct: 40.3 }).nivel).toBe("ok");
    expect(evaluarRecursos({ ...base, swapUsadoPct: 65 }).nivel).toBe("ok");
    expect(evaluarRecursos({ ...base, swapUsadoPct: 72 }).nivel).toBe("aviso");
    // El episodio REAL (caída del 26-jul, swap 86%) sigue siendo crítico: subir
    // el umbral no puede haber apagado la única vez que esto importó.
    expect(evaluarRecursos({ ...base, swapUsadoPct: 86 }).nivel).toBe("critico");
  });

  it("grita cuando la carga por núcleo llega al territorio del statement timeout", () => {
    expect(evaluarRecursos({ ...base, cargaPorNucleo: 1 }).nivel).toBe("ok");
    expect(evaluarRecursos({ ...base, cargaPorNucleo: 2 }).nivel).toBe("aviso");
    expect(evaluarRecursos({ ...base, cargaPorNucleo: 4 }).nivel).toBe("critico");
  });

  it("vigila disco, tamaño de la base y conexiones", () => {
    expect(evaluarRecursos({ ...base, discoDisponiblePct: 10 }).nivel).toBe("critico");
    expect(evaluarRecursos({ ...base, dbUsadoPct: 80 }).nivel).toBe("aviso");
    expect(evaluarRecursos({ ...base, conexionesPct: 95 }).nivel).toBe("critico");
  });

  it("un crítico manda sobre varios avisos y sale primero en la lista", () => {
    const ev = evaluarRecursos({
      ...base,
      swapUsadoPct: 72, // aviso (umbral 70 desde el 30-jul-2026)
      memoriaDisponiblePct: 5, // crítico
      dbUsadoPct: 80, // aviso
    });
    expect(ev.nivel).toBe("critico");
    expect(ev.hallazgos[0].nivel).toBe("critico");
    expect(ev.hallazgos[0].clave).toBe("memoria");
    expect(ev.hallazgos).toHaveLength(3);
  });

  it("la caída del 26-jul se habría detectado antes de los 521", () => {
    // Reconstrucción del cuadro que describió Supabase ("exhausting multiple
    // resources") sobre el compute Nano: memoria en el piso y carga disparada.
    const ahogo: MuestraRecursos = {
      ...base,
      memoriaDisponiblePct: 4,
      swapUsadoPct: 92,
      cargaPorNucleo: 6,
    };
    const ev = evaluarRecursos(ahogo);
    expect(ev.nivel).toBe("critico");
    expect(ev.hallazgos.map((h) => h.clave).sort()).toEqual(["carga", "memoria", "swap"]);
  });
});

describe("umbrales", () => {
  it("crítico siempre es más exigente que aviso, en la dirección correcta", () => {
    expect(UMBRALES.memoriaDisponiblePctCritico).toBeLessThan(UMBRALES.memoriaDisponiblePctAviso);
    expect(UMBRALES.discoDisponiblePctCritico).toBeLessThan(UMBRALES.discoDisponiblePctAviso);
    expect(UMBRALES.swapUsadoPctCritico).toBeGreaterThan(UMBRALES.swapUsadoPctAviso);
    expect(UMBRALES.dbUsadoPctCritico).toBeGreaterThan(UMBRALES.dbUsadoPctAviso);
    expect(UMBRALES.cargaPorNucleoCritico).toBeGreaterThan(UMBRALES.cargaPorNucleoAviso);
    expect(UMBRALES.conexionesPctCritico).toBeGreaterThan(UMBRALES.conexionesPctAviso);
  });
});

describe("mensajes de Telegram", () => {
  it("van en español simple, sin jerga técnica y apuntan al runbook", () => {
    const ev = evaluarRecursos({ ...leerMuestra(MUESTRA_REAL), memoriaDisponiblePct: 5 });
    const texto = mensajeRecursos(leerMuestra(MUESTRA_REAL), ev);

    expect(texto).toContain("Memoria libre");
    expect(texto).toContain("runbook-base-lenta.md");
    // Nada de jerga que Daniel no lea: son alertas para el dueño del negocio.
    for (const jerga of ["MemAvailable", "swap ", "load", "backends", "Prometheus"]) {
      expect(texto).not.toContain(jerga);
    }
  });

  it("el mensaje de 'no pude leer' dice qué significa", () => {
    const t = mensajeSinLectura("HTTP 521");
    expect(t).toContain("HTTP 521");
    expect(t).toContain("runbook-base-lenta.md");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 🩸 30-jul-2026: "me preocupa que me manda alerta de espacio, eso que es si
  // subi supabase". El mensaje decía MEMORIA pero listaba disco y tamaño de la
  // base en la MISMA lista, y se leyó como que la base se quedaba sin espacio —
  // con el disco al 92% libre y la base en 270 MB de 8 GB. Estos candados fijan
  // que memoria y almacenamiento no vuelvan a mezclarse.
  describe("un aviso de memoria no se puede confundir con falta de espacio", () => {
    const muestra = leerMuestra(MUESTRA_REAL);
    const evMemoria = evaluarRecursos({ ...muestra, swapUsadoPct: 86 });
    const texto = mensajeRecursos({ ...muestra, swapUsadoPct: 86 }, evMemoria);

    it("el hallazgo dice MEMORIA de entrada", () => {
      expect(evMemoria.hallazgos[0].texto).toContain("MEMORIA");
    });

    it("aclara que es memoria y NO espacio de almacenamiento", () => {
      expect(texto).toContain("es MEMORIA (RAM), no espacio de almacenamiento");
    });

    it("dice que tener disco libre no lo arregla", () => {
      expect(texto).toMatch(/disco libre no lo arregla/i);
    });

    it("dice que el plan de Supabase no cambia la RAM (fue la duda exacta)", () => {
      expect(texto).toMatch(/plan de Supabase no cambia la RAM/i);
    });

    it("memoria y almacenamiento van en bloques SEPARADOS y rotulados", () => {
      const iMem = texto.indexOf("MEMORIA (es lo que se aprieta)");
      const iAlm = texto.indexOf("ALMACENAMIENTO (va aparte");
      expect(iMem).toBeGreaterThan(-1);
      expect(iAlm).toBeGreaterThan(-1);
      // El disco vive DESPUÉS del rótulo de almacenamiento, nunca entre las
      // cifras de memoria: esa mezcla fue la causa de la confusión.
      expect(texto.indexOf("Disco libre")).toBeGreaterThan(iAlm);
      expect(texto.indexOf("Memoria de respaldo usada")).toBeLessThan(iAlm);
      expect(texto.indexOf("Tamaño de la base")).toBeGreaterThan(iAlm);
    });

    it("cuando el problema NO es de memoria, no mete la aclaración de RAM", () => {
      // Un aviso de tamaño de la base sí es de almacenamiento: la aclaración
      // sobraría y volvería a mezclar los dos temas.
      const evDisco = evaluarRecursos({ ...muestra, dbUsadoPct: 80 });
      const t = mensajeRecursos({ ...muestra, dbUsadoPct: 80 }, evDisco);
      expect(t).not.toContain("es MEMORIA (RAM), no espacio de almacenamiento");
    });
  });

  it("la medición real del 30-jul-2026 (base sana) NO manda ningún mensaje", () => {
    // swap 40,3% · memoria libre 53,3% · disco 92% libre · base 270 MB de 8 GB.
    // Ese día llegó un 🟡 que no correspondía. Con los umbrales nuevos: silencio.
    const sana = { ...leerMuestra(MUESTRA_REAL), swapUsadoPct: 40.3, memoriaDisponiblePct: 53.3 };
    const ev = evaluarRecursos(sana);
    expect(ev.nivel).toBe("ok");
    expect(ev.hallazgos).toEqual([]);
  });
});

describe("cableado del cron", () => {
  const raiz = path.resolve(__dirname, "../../..");
  const vercel = JSON.parse(fs.readFileSync(path.join(raiz, "vercel.json"), "utf-8"));
  const entradas: { path: string; schedule: string }[] = vercel.crons;
  const propias = entradas.filter((c) => c.path === "/api/cron/db-salud");

  it("está en vercel.json y toma varias muestras al día", () => {
    // Una sola muestra diaria no sirve: la caída del 26-jul duró 76 minutos.
    expect(propias.length).toBeGreaterThanOrEqual(8);
  });

  it("las muestras están repartidas: ningún hueco mayor a 3 horas", () => {
    const horas = propias
      .map((c) => {
        const [min, hr] = c.schedule.split(" ");
        return Number(hr) * 60 + Number(min);
      })
      .sort((a, b) => a - b);
    for (let i = 0; i < horas.length; i++) {
      const sig = i === horas.length - 1 ? horas[0] + 1440 : horas[i + 1];
      expect(sig - horas[i]).toBeLessThanOrEqual(180);
    }
  });

  it("no se pisa con el minuto cargado de los otros crons", () => {
    // Los slots :00 :05 :10 :15 :30 :40 :50 ya están poblados por switch-sync,
    // catálogos y reconciliación. El vigía se corre a un minuto tranquilo para
    // medir la carga de fondo, no la de su propio vecino.
    const ocupados = new Set([0, 5, 10, 15, 30, 40, 50]);
    for (const c of propias) {
      expect(ocupados.has(Number(c.schedule.split(" ")[0]))).toBe(false);
    }
  });

  it("el total de crons sigue bajo el límite de 100 del plan Pro", () => {
    expect(entradas.length).toBeLessThanOrEqual(100);
  });
});
