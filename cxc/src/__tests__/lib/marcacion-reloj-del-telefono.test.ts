// @vitest-environment node
//
// 🔑 Entorno NODE y no jsdom: acá se le manda un `FormData` de verdad a la
// ruta, y el `Request` de undici (el que usa Next) no reconoce el `FormData`
// ni el `File` que fabrica jsdom — `req.formData()` tira y la ruta contesta
// «No se entendió lo que se envió» por una diferencia del entorno de prueba,
// no por un defecto. Este archivo no dibuja ninguna pantalla: la conducta de
// la pantalla vive en `marcacion-pantalla.test.tsx`.

/**
 * EL RELOJ DEL TELÉFONO — los candados (14-sep-2026).
 *
 * Lo que se construyó: un reloj más, al lado de los físicos de Boston, Fashion
 * Wear, Vistana y Multifashion. El aparato es el teléfono de quien trabaja
 * afuera (Ana 2, Cindy 3, Yeisibeth 306, Rodrigo 13).
 *
 * 🔴 LO QUE ACÁ SE PROTEGE ES PLATA: lo que se marca en esa pantalla son las
 * horas que la planilla paga.
 *
 *  A. EL BOTÓN cambia de texto y se apaga. Nunca se elige entrada o salida.
 *  B. LA HORA ES LA DEL SERVIDOR — con el CONTROL de que un teléfono
 *     adelantado tres horas no mueve la marca ni un minuto.
 *  C. SIN SEÑAL SE GUARDAN LAS DOS HORAS: la de la foto (la que cuenta) y la
 *     de cuándo llegó al servidor.
 *  D. LA MARCA ES UN INSERT CON SU ORIGEN, por la MISMA puerta que el reloj
 *     físico, y nada del módulo edita ni borra `asistencia_marcaciones`.
 *  E. LA PALABRA «llegó» NO APARECE en lo que lee la contadora. Daniel lo
 *     corrigió sobre el mockup: se entendería que llegó a TRABAJAR a esa hora.
 *  F. POR QUIÉN SE MARCA LO DICE LA SESIÓN, nunca el cuerpo del pedido.
 *  G. SELFIE Y UBICACIÓN OBLIGATORIAS, comprobadas en el servidor.
 *  H. LA SELFIE VIVE EN UN BUCKET PRIVADO y se borra sola a los 90 días.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

import {
  AVISO_FALTA_MIGRACION,
  DISPOSITIVO_TELEFONO,
  MARCAS_POR_DIA,
  MAX_ATRASO_SIN_SENAL_DIAS,
  RETENCION_SELFIE_DIAS,
  TOLERANCIA_ADELANTO_MS,
  diaPanamaDe,
  diasDeLaQuincena,
  estadoDelBoton,
  faltaLaMigracion,
  horaAmPm,
  horaCorta,
  horaQueCuenta,
  marcasDelDia,
  notaDespuesDe,
  quincenaDeHoy,
  rotuloDeLaMarca,
  rutaDeSelfie,
  selfieVencida,
  textoParaLaContadora,
  validarPayloadMarca,
} from "@/lib/marcacion/marcacion";
import { llaveDelDia, marcasPorDia } from "@/lib/marcacion/en-el-reporte";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** El texto del archivo SIN comentarios: un barrido de palabras prohibidas no
 *  puede ponerse rojo por el comentario que explica que están prohibidas. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// A. EL BOTÓN
// ─────────────────────────────────────────────────────────────────────────────
describe("A. Un solo botón, que cambia de texto y se apaga", () => {
  it("sin marcas dice «Marcar entrada»", () => {
    expect(estadoDelBoton(0)).toEqual({ tipo: "entrada", texto: "Marcar entrada", apagado: false });
  });

  it("con una marca dice «Marcar salida»", () => {
    expect(estadoDelBoton(1)).toEqual({ tipo: "salida", texto: "Marcar salida", apagado: false });
  });

  it("con las dos del día se APAGA y dice «Ya marcaste hoy»", () => {
    expect(estadoDelBoton(2)).toEqual({ tipo: null, texto: "Ya marcaste hoy", apagado: true });
  });

  it("con más de dos (el reloj físico también marcó) sigue apagado", () => {
    expect(estadoDelBoton(5).apagado).toBe(true);
    expect(estadoDelBoton(5).tipo).toBeNull();
  });

  it("son DOS marcas al día, no cuatro", () => {
    expect(MARCAS_POR_DIA).toBe(2);
  });

  it("las notitas son las que pidió Daniel", () => {
    expect(notaDespuesDe(0)).toBeNull();
    expect(notaDespuesDe(1)).toBe("Acuérdate de marcar la salida.");
    expect(notaDespuesDe(2)).toBe("Mañana acuérdate de marcar la entrada.");
  });

  it("CONTROL: la pantalla no ofrece elegir entre entrada y salida", () => {
    const pantalla = sinComentarios(leer("src/app/marcacion/MarcacionClient.tsx"));
    // El tipo sale SIEMPRE de `boton.tipo`; no hay dos botones ni un selector.
    expect(pantalla).toContain("setTipoEnCurso(boton.tipo)");
    expect(pantalla).not.toMatch(/<select/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. LA HORA ES LA DEL SERVIDOR
// ─────────────────────────────────────────────────────────────────────────────
describe("B. La hora que cuenta es la del servidor", () => {
  const AHORA = "2026-09-15T13:58:00.000Z"; // 8:58 a. m. de Panamá

  it("con señal, la marca queda con la hora del SERVIDOR", () => {
    const r = horaQueCuenta({ sinSenal: false, horaTelefono: null, ahoraServidor: AHORA });
    expect(r).toEqual({ ok: true, ocurrioEn: AHORA });
  });

  it("🔴 un teléfono adelantado TRES HORAS no mueve la marca ni un minuto", () => {
    const r = horaQueCuenta({
      sinSenal: false,
      horaTelefono: "2026-09-15T16:58:00.000Z",
      ahoraServidor: AHORA,
    });
    expect(r).toEqual({ ok: true, ocurrioEn: AHORA });
  });

  it("un teléfono atrasado tampoco la mueve", () => {
    const r = horaQueCuenta({
      sinSenal: false,
      horaTelefono: "2026-09-15T06:00:00.000Z",
      ahoraServidor: AHORA,
    });
    expect(r).toEqual({ ok: true, ocurrioEn: AHORA });
  });

  it("sin señal, la que cuenta es la hora de la FOTO", () => {
    // El caso del mockup: marcó a las 9:12 y el teléfono recién pudo mandarla a
    // las 11:30. El servidor, al recibirla, son las 11:30.
    const foto = "2026-09-15T14:12:00.000Z";
    const alRecibirla = "2026-09-15T16:30:00.000Z";
    const r = horaQueCuenta({ sinSenal: true, horaTelefono: foto, ahoraServidor: alRecibirla });
    expect(r).toEqual({ ok: true, ocurrioEn: foto });
  });

  it("sin señal y sin hora de la foto, NO entra", () => {
    const r = horaQueCuenta({ sinSenal: true, horaTelefono: null, ahoraServidor: AHORA });
    expect(r.ok).toBe(false);
  });

  it("sin señal con el reloj adelantado más de la tolerancia, NO entra", () => {
    const adelantada = new Date(Date.parse(AHORA) + TOLERANCIA_ADELANTO_MS + 60_000).toISOString();
    const r = horaQueCuenta({ sinSenal: true, horaTelefono: adelantada, ahoraServidor: AHORA });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("hora del teléfono");
  });

  it("CONTROL: un desfase chico (dentro de la tolerancia) SÍ entra", () => {
    const poquito = new Date(Date.parse(AHORA) + TOLERANCIA_ADELANTO_MS - 60_000).toISOString();
    const r = horaQueCuenta({ sinSenal: true, horaTelefono: poquito, ahoraServidor: AHORA });
    expect(r.ok).toBe(true);
  });

  it("una marca sin señal de hace más de una semana NO entra", () => {
    const vieja = new Date(
      Date.parse(AHORA) - (MAX_ATRASO_SIN_SENAL_DIAS + 1) * 86_400_000,
    ).toISOString();
    const r = horaQueCuenta({ sinSenal: true, horaTelefono: vieja, ahoraServidor: AHORA });
    expect(r.ok).toBe(false);
  });

  it("las horas se muestran en hora de PANAMÁ (UTC−5 fijo)", () => {
    expect(horaCorta(AHORA)).toBe("08:58");
    expect(horaAmPm(AHORA)).toBe("8:58 a. m.");
    expect(horaAmPm("2026-09-15T23:04:00.000Z")).toBe("6:04 p. m.");
    // La noche de Panamá NO cae al día siguiente.
    expect(diaPanamaDe("2026-09-15T23:04:00.000Z")).toBe("2026-09-15");
  });

  it("la pantalla dibuja la hora del servidor, no `new Date()`", () => {
    const pantalla = sinComentarios(leer("src/app/marcacion/MarcacionClient.tsx"));
    // El reloj grande sale del desfase contra el servidor.
    expect(pantalla).toContain("desfase");
    expect(pantalla).toContain("Date.parse(j.ahora) - Date.now()");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C y D. LA MARCA: las dos horas, el origen, y una sola puerta de escritura
// ─────────────────────────────────────────────────────────────────────────────
const guardado: Record<string, unknown>[][] = [];
let filasMarcaciones: Record<string, unknown>[] = [];
let subidas: string[] = [];

vi.mock("@/lib/marcacion/acceso", () => ({
  requireMarcacion: () => ({ role: "marcacion", userId: "u-1", userName: "ana" }),
  leerEmpleadoCodigo: async () => "2",
}));

vi.mock("@/lib/marcacion/selfie-servidor", () => ({
  subirSelfie: async (p: string) => {
    subidas.push(p);
    return { path: p, achicada: true };
  },
  borrarSelfies: async () => undefined,
  firmarSelfie: async () => "https://firmada/ejemplo",
  BUCKET_SELFIES: "asistencia-marcaciones",
  SEGUNDOS_URL_FIRMADA: 3600,
}));

vi.mock("@/lib/asistencia/guardar-marcaciones", () => ({
  guardarMarcaciones: async (filas: Record<string, unknown>[]) => {
    guardado.push(filas);
    filasMarcaciones = [...filasMarcaciones, ...filas];
    return { error: null };
  },
}));

// Un Supabase de mentira que FILTRA de verdad: los `.eq()` se aplican contra
// las filas guardadas. Un mock que devuelve siempre la misma fila no cazaría
// que alguien deje de acotar por el código de la persona.
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from(tabla: string) {
      const filtros: Array<[string, unknown]> = [];
      const filas = () =>
        tabla === "asistencia_marcaciones"
          ? filasMarcaciones.filter((r) => filtros.every(([c, v]) => r[c] === v))
          : [{ nombre: "ANA TREJOS" }];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (c: string, v: unknown) => {
          filtros.push([c, v]);
          return builder;
        },
        gte: () => builder,
        lte: () => builder,
        order: () => builder,
        limit: async () => ({ data: filas(), error: null }),
        maybeSingle: async () => ({ data: filas()[0] ?? null, error: null }),
      };
      return builder;
    },
  },
}));

function nuevoForm(extra: Record<string, string> = {}, conFoto = true): FormData {
  const f = new FormData();
  f.set("eventoId", extra.eventoId ?? "11111111-2222-3333-4444-555555555555");
  f.set("tipo", extra.tipo ?? "entrada");
  f.set("sinSenal", extra.sinSenal ?? "0");
  if (extra.horaTelefono) f.set("horaTelefono", extra.horaTelefono);
  f.set("lat", extra.lat ?? "8.9824");
  f.set("lng", extra.lng ?? "-79.5199");
  f.set("precisionM", extra.precisionM ?? "12");
  if (conFoto) {
    f.set("selfie", new File([new Uint8Array([1, 2, 3])], "selfie.jpg", { type: "image/jpeg" }));
  }
  return f;
}

describe("C y D. La marca cae en la MISMA tabla, con su origen y sus dos horas", () => {
  beforeEach(() => {
    guardado.length = 0;
    filasMarcaciones = [];
    subidas = [];
  });

  it("🔴 el origen es `telefono` y la fila entra por `guardarMarcaciones`", async () => {
    const { POST } = await import("@/app/api/marcacion/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://x/api/marcacion", { method: "POST", body: nuevoForm() });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(guardado).toHaveLength(1);
    const fila = guardado[0][0] as Record<string, unknown>;
    expect(fila.dispositivo).toBe(DISPOSITIVO_TELEFONO);
    expect(fila.empleado_codigo).toBe("2");
    expect(fila.foto_path).toBe(subidas[0]);
    expect(fila.lat).toBe(8.9824);
    expect(fila.lng).toBe(-79.5199);
  });

  it("🔴 CON señal: `ocurrio_en` NO es la hora del teléfono, y la del teléfono queda de testigo", async () => {
    const { POST } = await import("@/app/api/marcacion/route");
    const { NextRequest } = await import("next/server");
    const mentira = "2030-01-01T05:00:00.000Z";
    const req = new NextRequest("http://x/api/marcacion", {
      method: "POST",
      body: nuevoForm({ horaTelefono: mentira }),
    });
    await POST(req);
    const fila = guardado[0][0] as Record<string, unknown>;
    expect(fila.ocurrio_en).not.toBe(mentira);
    expect(fila.hora_telefono).toBe(mentira);
    expect(fila.sin_senal).toBe(false);
    // La hora guardada es de AHORA, no de 2030.
    expect(Math.abs(Date.parse(String(fila.ocurrio_en)) - Date.now())).toBeLessThan(60_000);
  });

  it("🔴 SIN señal: la que cuenta es la de la foto, y SE GUARDAN LAS DOS", async () => {
    const { POST } = await import("@/app/api/marcacion/route");
    const { NextRequest } = await import("next/server");
    const foto = new Date(Date.now() - 2 * 3600_000).toISOString();
    const req = new NextRequest("http://x/api/marcacion", {
      method: "POST",
      body: nuevoForm({ sinSenal: "1", horaTelefono: foto }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const fila = guardado[0][0] as Record<string, unknown>;
    expect(fila.ocurrio_en).toBe(foto);
    expect(fila.hora_telefono).toBe(foto);
    expect(fila.sin_senal).toBe(true);
    // La segunda hora —cuándo llegó al servidor— la pone la base en
    // `created_at` (DEFAULT now()): por eso la fila NO la trae escrita.
    expect(fila.created_at).toBeUndefined();
  });

  it("sin selfie, el servidor la rechaza", async () => {
    const { POST } = await import("@/app/api/marcacion/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://x/api/marcacion", {
      method: "POST",
      body: nuevoForm({}, false),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(guardado).toHaveLength(0);
  });

  it("sin ubicación, el servidor la rechaza", async () => {
    const { POST } = await import("@/app/api/marcacion/route");
    const { NextRequest } = await import("next/server");
    const f = nuevoForm();
    f.delete("lat");
    f.delete("lng");
    const req = new NextRequest("http://x/api/marcacion", { method: "POST", body: f });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(guardado).toHaveLength(0);
  });

  it("un REENVÍO de la misma marca no la guarda dos veces", async () => {
    const { POST } = await import("@/app/api/marcacion/route");
    const { NextRequest } = await import("next/server");
    const cuerpo = () =>
      new NextRequest("http://x/api/marcacion", { method: "POST", body: nuevoForm() });
    await POST(cuerpo());
    const res = await POST(cuerpo());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, yaEstaba: true });
    expect(guardado).toHaveLength(1);
  });

  it("🔴 NADA del módulo edita ni borra `asistencia_marcaciones`", () => {
    const archivos = [
      "src/app/api/marcacion/route.ts",
      "src/lib/marcacion/estado-server.ts",
      "src/lib/marcacion/reporte-server.ts",
      "src/lib/marcacion/retencion.ts",
      "src/app/api/asistencia/marcacion-foto/route.ts",
    ];
    for (const rel of archivos) {
      const src = sinComentarios(leer(rel));
      expect(src, rel).not.toMatch(/\.update\s*\(/);
      expect(src, rel).not.toMatch(/\.delete\s*\(/);
      expect(src, rel).not.toMatch(/\.upsert\s*\(/);
    }
  });

  it("la ÚNICA puerta de escritura sigue siendo `guardarMarcaciones`", () => {
    const ruta = sinComentarios(leer("src/app/api/marcacion/route.ts"));
    expect(ruta).toContain("guardarMarcaciones");
    expect(ruta).not.toContain('from("asistencia_marcaciones")');
  });

  it("con la migración sin correr se DICE, no se guarda a medias", () => {
    expect(faltaLaMigracion({ code: "PGRST204", message: "Could not find the 'sin_senal' column" })).toBe(true);
    expect(faltaLaMigracion({ code: "42703", message: 'column "foto_path" does not exist' })).toBe(true);
    // CONTROL: un error cualquiera NO se confunde con la migración pendiente.
    expect(faltaLaMigracion({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(AVISO_FALTA_MIGRACION).toContain("20261127120000");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. LO QUE LEE LA CONTADORA — la palabra «llegó» está prohibida
// ─────────────────────────────────────────────────────────────────────────────
describe("E. Lo que lee la contadora nunca dice «llegó»", () => {
  const SIN_SENAL = { sinSenal: true, creadoEn: "2026-09-15T16:30:00.000Z" };

  it("🔴 dice «envió», y la hora es la de cuándo el teléfono la mandó", () => {
    expect(textoParaLaContadora(SIN_SENAL)).toBe(
      "Marcada sin señal · el teléfono la envió 11:30",
    );
  });

  it("🔴 NO dice «llegó» en ninguna de sus formas", () => {
    for (const t of [
      textoParaLaContadora(SIN_SENAL),
      textoParaLaContadora({ sinSenal: false, creadoEn: SIN_SENAL.creadoEn }),
    ]) {
      expect(t.toLowerCase()).not.toContain("lleg");
    }
  });

  it("con señal solo dice de dónde salió", () => {
    expect(textoParaLaContadora({ sinSenal: false, creadoEn: SIN_SENAL.creadoEn })).toBe(
      "Marcada desde el teléfono",
    );
  });

  it("🔴 BARRIDO: nada de lo que lee la contadora usa «llegó»", () => {
    // ⚠️ EL BARRIDO ES SOBRE LO QUE LEE LA CONTADORA, no sobre el módulo
    // entero, y eso es a propósito. En la pantalla de quien marca hay mensajes
    // como «La marca llegó sin identificador»: ahí «llegó» habla del pedido que
    // llegó al servidor, no de una persona llegando a trabajar, y prohibirlo
    // sería un candado que grita por algo que no es el defecto.
    const archivos = [
      "src/lib/marcacion/en-el-reporte.ts",
      // 🩸 Se llamaba `SelfieMarcacionModal.tsx` hasta el 25-sep-2026: son fotos
      // DEL LUGAR, no selfies.
      "src/app/asistencia/FotosDeLaMarcaModal.tsx",
    ];
    for (const rel of archivos) {
      expect(sinComentarios(leer(rel)).toLowerCase(), rel).not.toMatch(/lleg[oó]/);
    }
    // La función que redacta la línea, mirada sola.
    const puro = leer("src/lib/marcacion/marcacion.ts");
    const fn = puro.slice(puro.indexOf("export function textoParaLaContadora"));
    expect(sinComentarios(fn).toLowerCase()).not.toMatch(/lleg[oó]/);
    // Y la sub-fila del reporte, que es donde el mockup lo decía. Desde el
    // 25-sep-2026 es UNA línea por día (`lineaDelDia`), que dice «enviada 3 h
    // después» por el MISMO motivo: «llegó con 3 h de atraso» se leería como que
    // la persona llegó tarde a trabajar.
    const reporte = leer("src/app/asistencia/ReporteTab.tsx");
    const sub = reporte.slice(reporte.indexOf("delTelefono.map"), reporte.indexOf("d.correcciones.map"));
    expect(sinComentarios(sub).toLowerCase()).not.toMatch(/lleg[oó]/);
    expect(sinComentarios(leer("src/lib/asistencia/linea-del-dia.ts")).toLowerCase()).not.toMatch(/lleg[oó]/);
  });

  it("la primera del día es Entrada y la última Salida, venga de donde venga", () => {
    expect(rotuloDeLaMarca(0, 2)).toBe("Entrada");
    expect(rotuloDeLaMarca(1, 2)).toBe("Salida");
    expect(rotuloDeLaMarca(0, 1)).toBe("Entrada");
    expect(rotuloDeLaMarca(1, 4)).toBe("Marca");
    expect(rotuloDeLaMarca(3, 4)).toBe("Salida");
  });

  it("las marcas del teléfono se agrupan por (código, día de Panamá)", () => {
    const mapa = marcasPorDia([
      {
        id: "a", empleado_codigo: "2", ocurrio_en: "2026-09-15T14:12:00.000Z",
        tipo: "entrada", sin_senal: true, created_at: "2026-09-15T16:30:00.000Z",
        foto_path: "2/2026-09-15/a.jpg", lat: 8.98, lng: -79.5,
      },
      {
        id: "b", empleado_codigo: "2", ocurrio_en: "2026-09-15T23:04:00.000Z",
        tipo: "salida", sin_senal: false, created_at: "2026-09-15T23:04:05.000Z",
        foto_path: "2/2026-09-15/b.jpg", lat: 8.98, lng: -79.5,
      },
    ]);
    const dia = mapa[llaveDelDia("2", "2026-09-15")];
    expect(dia).toHaveLength(2);
    expect(dia[0].horaLarga).toBe("9:12 a. m.");
    expect(dia[0].detalle).toContain("sin señal");
    expect(dia[1].detalle).toBe("Marcada desde el teléfono");
    // La marca de las 6:04 p. m. NO se va al día siguiente.
    expect(Object.keys(mapa)).toEqual([llaveDelDia("2", "2026-09-15")]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F y G. Quién marca, y qué entra
// ─────────────────────────────────────────────────────────────────────────────
describe("F y G. La sesión dice por quién se marca; la selfie y la ubicación son obligatorias", () => {
  it("🔴 el código de colaborador NO sale del cuerpo del pedido", () => {
    const ruta = sinComentarios(leer("src/app/api/marcacion/route.ts"));
    expect(ruta).toContain("leerEmpleadoCodigo(auth.userId)");
    expect(ruta).not.toMatch(/form\.get\(\s*["']codigo["']\s*\)/);
    expect(ruta).not.toMatch(/form\.get\(\s*["']empleado/);
  });

  const base = {
    eventoId: "11111111-2222-3333-4444-555555555555",
    tipo: "entrada",
    lat: 8.98,
    lng: -79.51,
    precisionM: 12,
    selfie: { tipo: "image/jpeg", bytes: 120_000 },
  };

  it("un payload completo entra", () => {
    expect(validarPayloadMarca(base)).toBeNull();
  });

  it("sin selfie, no", () => {
    expect(validarPayloadMarca({ ...base, selfie: null })).toContain("selfie");
  });

  it("lo que no es una foto, no", () => {
    expect(validarPayloadMarca({ ...base, selfie: { tipo: "application/pdf", bytes: 10 } })).toContain("foto");
  });

  it("sin ubicación, no — y lo dice con el permiso", () => {
    expect(validarPayloadMarca({ ...base, lat: null, lng: null })).toContain("permiso de ubicación");
  });

  it("una ubicación imposible, no", () => {
    expect(validarPayloadMarca({ ...base, lat: 91, lng: 0 })).not.toBeNull();
    expect(validarPayloadMarca({ ...base, lat: 0, lng: 181 })).not.toBeNull();
  });

  it("un tipo que no es entrada ni salida, no", () => {
    expect(validarPayloadMarca({ ...base, tipo: "almuerzo" })).not.toBeNull();
  });

  it("sin identificador de marca, no (sería imposible evitar duplicarla)", () => {
    expect(validarPayloadMarca({ ...base, eventoId: "corto" })).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. La selfie: bucket privado, carpeta por código, 90 días
// ─────────────────────────────────────────────────────────────────────────────
describe("H. La selfie vive en un bucket privado y se borra sola a los 90 días", () => {
  it("🔴 el bucket nace PRIVADO en la migración", () => {
    const sql = leer("supabase/migrations/20261127120000_marcacion_telefono.sql");
    expect(sql).toMatch(/storage\.buckets[\s\S]*'asistencia-marcaciones'[\s\S]*false/);
  });

  it("🔴 se firma al leer: nunca una dirección pública", () => {
    const src = sinComentarios(leer("src/lib/marcacion/selfie-servidor.ts"));
    expect(src).toContain("createSignedUrl");
    expect(src).not.toContain("getPublicUrl");
    const ruta = sinComentarios(leer("src/app/api/asistencia/marcacion-foto/route.ts"));
    expect(ruta).not.toContain("getPublicUrl");
  });

  it("la carpeta es el CÓDIGO, nunca el nombre, y se limpia lo raro", () => {
    expect(rutaDeSelfie("2", "2026-09-15", "abc-123")).toBe("2/2026-09-15/abc-123.jpg");
    expect(rutaDeSelfie("../../etc", "2026-09-15", "a/b")).toBe("etc/2026-09-15/ab.jpg");
    expect(rutaDeSelfie("", "no-es-fecha", "")).toBe("sin-codigo/sin-fecha/sin-id.jpg");
  });

  it("a los 90 días vence; a los 89 todavía no", () => {
    expect(RETENCION_SELFIE_DIAS).toBe(90);
    expect(selfieVencida("2026-06-17", "2026-09-15")).toBe(true); // 90 días
    expect(selfieVencida("2026-06-18", "2026-09-15")).toBe(false); // 89
    // Una carpeta con un nombre que no es fecha NO se borra por las dudas.
    expect(selfieVencida("cualquier-cosa", "2026-09-15")).toBe(false);
  });

  it("🔴 la retención NO nace como un cron nuevo: cuelga de `asistencia-vigia`", () => {
    const vigia = leer("src/app/api/cron/asistencia-vigia/route.ts");
    expect(vigia).toContain("borrarSelfiesVencidas");
    // Y no aparece una entrada nueva en vercel.json.
    const vercel = JSON.parse(leer("vercel.json")) as { crons: { path: string }[] };
    expect(vercel.crons.some((c) => c.path.includes("marcacion"))).toBe(false);
    expect(vercel.crons.some((c) => c.path.includes("selfie"))).toBe(false);
  });

  it("la retención solo toca Storage: ni una fila de marcaciones", () => {
    const src = sinComentarios(leer("src/lib/marcacion/retencion.ts"));
    expect(src).toContain(".storage");
    expect(src).not.toContain('from("asistencia_marcaciones")');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I. Sus marcas de la quincena — y nada más
// ─────────────────────────────────────────────────────────────────────────────
describe("I. Ella ve sus marcas de la quincena, y nada de nadie más", () => {
  it("la quincena es 1–15 o 16–último día REAL del mes", () => {
    expect(quincenaDeHoy("2026-09-15")).toEqual({ desde: "2026-09-01", hasta: "2026-09-15" });
    expect(quincenaDeHoy("2026-09-16")).toEqual({ desde: "2026-09-16", hasta: "2026-09-30" });
    expect(quincenaDeHoy("2026-02-20")).toEqual({ desde: "2026-02-16", hasta: "2026-02-28" });
  });

  it("la primera del día es la entrada y la última la salida", () => {
    const dias = diasDeLaQuincena(
      [
        { ocurrioEn: "2026-09-15T13:58:00.000Z" }, // 8:58
        { ocurrioEn: "2026-09-15T23:04:00.000Z" }, // 18:04
        { ocurrioEn: "2026-09-11T14:02:00.000Z" }, // 9:02, sin salida
      ],
      "2026-09-15",
    );
    expect(dias[0]).toMatchObject({ fecha: "2026-09-15", entrada: "08:58", salida: "18:04" });
    expect(dias[1]).toMatchObject({ fecha: "2026-09-11", entrada: "09:02", salida: null, faltaSalida: true });
  });

  it("HOY con una sola marca todavía NO dice que falta la salida", () => {
    const dias = diasDeLaQuincena([{ ocurrioEn: "2026-09-15T13:58:00.000Z" }], "2026-09-15");
    expect(dias[0].faltaSalida).toBe(false);
  });

  it("las marcas del día se cuentan sin mirar de qué reloj vinieron", () => {
    expect(
      marcasDelDia(
        [
          { ocurrioEn: "2026-09-15T13:58:00.000Z" },
          { ocurrioEn: "2026-09-15T23:04:00.000Z" },
          { ocurrioEn: "2026-09-14T13:58:00.000Z" },
        ],
        "2026-09-15",
      ),
    ).toBe(2);
  });

  it("la ruta del teléfono acota SIEMPRE por el código de esa persona", () => {
    const src = sinComentarios(leer("src/lib/marcacion/estado-server.ts"));
    expect(src).toContain('.eq("empleado_codigo", codigo)');
  });
});
