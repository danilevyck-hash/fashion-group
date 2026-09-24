/**
 * MARCACIÓN — LO QUE SE GUARDA NO CAMBIÓ (24-sep-2026).
 *
 * El rediseño «un toque» es de PANTALLA: se retiró un botón, el principal bajó
 * al borde de abajo y la cámara mira para el otro lado. 🔴 `asistencia_marcaciones`
 * tiene que recibir EXACTAMENTE lo mismo que recibía: dispositivo, foto,
 * ubicación y la hora del servidor. Si alguna vez un cambio de pantalla se
 * lleva puesto un campo de la marca, este candado se pone rojo.
 *
 * Se mide en los TRES lugares donde el payload existe:
 *   1. lo que arma la pantalla al marcar (con señal),
 *   2. lo que arma la cola al vaciar (sin señal, el reenvío),
 *   3. lo que el servidor EXIGE (`validarPayloadMarca`) y lo que escribe la ruta.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COLUMNAS_DE_LA_MARCA,
  DISPOSITIVO_TELEFONO,
  MAX_BYTES_SELFIE,
  rutaDeSelfie,
  validarPayloadMarca,
} from "@/lib/marcacion/marcacion";

const RAIZ = join(process.cwd(), "src");
const PANTALLA = readFileSync(join(RAIZ, "app/marcacion/MarcacionClient.tsx"), "utf8");
const RUTA = readFileSync(join(RAIZ, "app/api/marcacion/route.ts"), "utf8");

/**
 * 🔴 LOS OCHO CAMPOS QUE VIAJAN, ESCRITOS A MANO. Es la foto de lo que se
 * mandaba ANTES del rediseño: si la pantalla empieza a mandar uno más, uno
 * menos o con otro nombre, hay que venir acá y decidirlo a propósito.
 */
const CAMPOS_QUE_VIAJAN = [
  "eventoId",
  "tipo",
  "sinSenal",
  "horaTelefono",
  "lat",
  "lng",
  "precisionM",
  "selfie",
] as const;

/** Cada `cuerpo.set("…")` de la pantalla, en el orden en que aparece. */
function camposQueArmaLaPantalla(): string[][] {
  // Dos bloques arman un FormData: `vaciarCola` (el reenvío) y `enviarMarca`.
  const bloques = PANTALLA.split("new FormData()").slice(1);
  return bloques.map((b) =>
    [...b.matchAll(/cuerpo\.set\(\s*"([^"]+)"/g)].map((m) => m[1]),
  );
}

describe("lo que la pantalla manda no cambió", () => {
  it("🔴 son los OCHO campos de siempre, en los DOS caminos (con señal y desde la cola)", () => {
    const bloques = camposQueArmaLaPantalla();
    expect(bloques.length).toBe(2);
    for (const campos of bloques) {
      expect(new Set(campos)).toEqual(new Set(CAMPOS_QUE_VIAJAN));
    }
  });

  // 🔴 24-sep-2026: las dos marcas del ALMUERZO van SIN foto (`cuatro-marcas.ts`).
  // Lo que se mide acá no cambió: cuando hay foto, viaja por el MISMO campo, con
  // el mismo nombre de archivo y achicada igual. Quién la lleva lo dice el
  // candado `marcacion-cuatro-marcas`.
  it("🔴 la foto viaja por el MISMO campo y con el mismo nombre de archivo", () => {
    expect(PANTALLA).toContain('cuerpo.set("selfie", blob, "selfie.jpg")');
    expect(PANTALLA).toContain('cuerpo.set("selfie", m.selfie, "selfie.jpg")');
    // Y se sigue achicando en el teléfono antes de viajar.
    expect(PANTALLA).toContain("achicarEnElTelefono(archivo)");
  });

  it("🔴 la marca se manda a la MISMA puerta, con el mismo método", () => {
    const puertas = [...PANTALLA.matchAll(/fetch\("(\/api\/marcacion[^"]*)"/g)].map((m) => m[1]);
    expect(new Set(puertas)).toEqual(new Set(["/api/marcacion", "/api/marcacion/deshacer"]));
    expect(PANTALLA).toContain('fetch("/api/marcacion", { method: "POST", body: cuerpo })');
  });

  it("🔴 «sin señal» sigue siendo 0 con señal y 1 desde la cola", () => {
    expect(PANTALLA).toContain('cuerpo.set("sinSenal", "1")');
    expect(PANTALLA).toContain('cuerpo.set("sinSenal", "0")');
  });

  it("⚠️ la hora del TELÉFONO sigue viajando siempre — es el testigo de las dos horas", () => {
    expect(PANTALLA).toContain('cuerpo.set("horaTelefono", horaTelefono)');
    expect(PANTALLA).toContain('cuerpo.set("horaTelefono", m.horaTelefono)');
  });
});

describe("lo que el servidor exige no cambió", () => {
  const base = {
    eventoId: "11111111-2222-3333-4444-555555555555",
    tipo: "entrada",
    lat: 8.9824,
    lng: -79.5199,
    precisionM: 12,
    selfie: { tipo: "image/jpeg", bytes: 40_000 },
  };

  it("una marca completa entra", () => {
    expect(validarPayloadMarca(base)).toBeNull();
  });

  it("🔴 sin foto NO entra — por omisión la foto sigue siendo obligatoria", () => {
    expect(validarPayloadMarca({ ...base, selfie: null })).toMatch(/Falta la selfie/);
    expect(validarPayloadMarca({ ...base, tipo: "salida", selfie: null })).toMatch(/Falta la selfie/);
  });

  it("🔴 sin ubicación NO entra", () => {
    expect(validarPayloadMarca({ ...base, lat: null, lng: null })).toMatch(/Falta la ubicación/);
  });

  it("y la foto se sigue guardando en el mismo lugar, con el mismo origen", () => {
    expect(DISPOSITIVO_TELEFONO).toBe("telefono");
    expect(rutaDeSelfie("2", "2026-09-24", "abc-123")).toBe("2/2026-09-24/abc-123.jpg");
    expect(MAX_BYTES_SELFIE).toBe(8 * 1024 * 1024);
    expect([...COLUMNAS_DE_LA_MARCA]).toEqual([
      "sin_senal",
      "hora_telefono",
      "foto_path",
      "lat",
      "lng",
      "precision_m",
      "marcada_por",
    ]);
  });

  it("🔴 la ruta sigue leyendo los mismos campos del formulario", () => {
    for (const campo of CAMPOS_QUE_VIAJAN) {
      expect(RUTA).toContain(`"${campo}"`);
    }
  });
});
