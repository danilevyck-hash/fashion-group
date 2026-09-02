// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — lo desconocido cae en el cajón neutro Y AVISA, una sola vez.
//
// Dos mitades, y las dos importan:
//   · que el aviso SALGA cuando Switch manda algo que el catálogo no conoce
//     (sin aviso, el producto se publica con el bulto equivocado en silencio);
//   · que NO se repita corrida tras corrida. El catálogo corre 4×/día: un rubro
//     mal cargado que Daniel decida no corregir sonaría 4 veces por día para
//     siempre — la alerta que suena para siempre que la poda de julio eliminó.
//
// Y una tercera que es de forma: el aviso sale por `enviarSistema`. Nadie llama
// `sendTelegramAlert` directo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Los mocks se izan al tope del archivo, así que las funciones espía viven en
// un objeto creado con `vi.hoisted` — una variable normal todavía no existiría.
const espias = vi.hoisted(() => ({
  enviarSistema: vi.fn(async (_texto: string) => true),
  clavesYaAvisadasPorCampo: vi.fn(async () => [] as string[]),
}));
vi.mock("@/lib/alertas/canal", () => ({
  enviarSistema: espias.enviarSistema,
  enviarNegocio: vi.fn(async () => true),
}));
vi.mock("@/lib/switch-api/monto-guard-io", () => ({
  clavesYaAvisadasPorCampo: espias.clavesYaAvisadasPorCampo,
}));
const { enviarSistema, clavesYaAvisadasPorCampo } = espias;

import {
  agruparSinClasificar,
  detallesDeClasificacion,
  textoDelAviso,
  avisarClasificacionDesconocida,
  claveDeValor,
  CAMPO_SKIP_CLASIFICACION,
} from "@/lib/catalogos/clasificacion-aviso";

beforeEach(() => {
  enviarSistema.mockClear();
  clavesYaAvisadasPorCampo.mockClear();
  clavesYaAvisadasPorCampo.mockResolvedValue([]);
});

const HALLAZGOS = [
  { sku: "ACCX001", campo: "rubro" as const, valor: "PROMO" },
  { sku: "ACCX002", campo: "rubro" as const, valor: "PROMO" },
  { sku: "ACCX001", campo: "rubro" as const, valor: "PROMO" }, // repetido: mismo producto
  { sku: "APPZ009", campo: "subrubro" as const, valor: "GENERAL" },
];

describe("agrupar — el trabajo a hacer en Switch es UNO por valor, no uno por producto", () => {
  it("agrupa por (campo, valor) y no repite SKUs", () => {
    const v = agruparSinClasificar(HALLAZGOS);
    expect(v).toHaveLength(2);
    expect(v[0]).toEqual({ campo: "rubro", valor: "PROMO", skus: ["ACCX001", "ACCX002"] });
    expect(v[1]).toEqual({ campo: "subrubro", valor: "GENERAL", skus: ["APPZ009"] });
  });

  it("el orden es estable: dos corridas idénticas dan el mismo mensaje", () => {
    const a = JSON.stringify(agruparSinClasificar(HALLAZGOS));
    const b = JSON.stringify(agruparSinClasificar([...HALLAZGOS].reverse()));
    expect(a).toBe(b);
  });
});

describe("el texto habla de NEGOCIO", () => {
  const texto = textoDelAviso("active_shoes", "Reebok", agruparSinClasificar(HALLAZGOS));

  it("dice qué pasó, qué significa y qué hacer", () => {
    expect(texto).toContain("Qué pasó:");
    expect(texto).toContain("Qué significa:");
    expect(texto).toContain("Qué hacer:");
  });

  it("nombra el valor concreto y los productos afectados", () => {
    expect(texto).toContain('rubro "PROMO"');
    expect(texto).toContain("ACCX001");
  });

  it("💸 dice explícitamente la consecuencia de plata (el bulto de 6 en vez de 12)", () => {
    expect(texto).toMatch(/bulto/i);
    expect(texto).toContain("6");
    expect(texto).toContain("12");
  });

  it("NO habla de tablas, columnas ni códigos HTTP", () => {
    expect(texto).not.toMatch(/switch_articulo_info|skip_details|HTTP|4\d\d|select|null/i);
  });

  it("aclara que lo ya clasificado conserva su clasificación", () => {
    expect(texto).toMatch(/YA estaban clasificados/i);
  });
});

describe("skip_details — el rastro con el que funciona el anti-loop", () => {
  it("usa su propio `campo` (no pisa el de los montos ni el de las escrituras)", () => {
    const d = detallesDeClasificacion(agruparSinClasificar(HALLAZGOS)) as Array<Record<string, unknown>>;
    expect(d.every((x) => x.campo === CAMPO_SKIP_CLASIFICACION)).toBe(true);
    expect(CAMPO_SKIP_CLASIFICACION).not.toBe("catalogo_escrituras");
  });

  it("la clave que se escribe es la MISMA que después se lee", () => {
    const valores = agruparSinClasificar(HALLAZGOS);
    const d = detallesDeClasificacion(valores) as Array<{ secuencial: string }>;
    expect(d.map((x) => x.secuencial)).toEqual(valores.map(claveDeValor));
  });
});

describe("🔴 el aviso sale, y sale UNA vez", () => {
  it("avisa cuando hay valores nuevos", async () => {
    await avisarClasificacionDesconocida({
      empresaKey: "active_shoes", syncType: "catalogo_reebok", marca: "Reebok",
      valores: agruparSinClasificar(HALLAZGOS), logId: "log-1",
    });
    expect(enviarSistema).toHaveBeenCalledTimes(1);
  });

  it("NO avisa si no hay nada desconocido (y ni siquiera consulta)", async () => {
    await avisarClasificacionDesconocida({
      empresaKey: "active_shoes", syncType: "catalogo_reebok", marca: "Reebok",
      valores: [], logId: "log-1",
    });
    expect(enviarSistema).not.toHaveBeenCalled();
    expect(clavesYaAvisadasPorCampo).not.toHaveBeenCalled();
  });

  it("🔴 NO repite: si las claves ya se avisaron, se calla", async () => {
    const valores = agruparSinClasificar(HALLAZGOS);
    clavesYaAvisadasPorCampo.mockResolvedValue(valores.map(claveDeValor));
    await avisarClasificacionDesconocida({
      empresaKey: "active_shoes", syncType: "catalogo_reebok", marca: "Reebok",
      valores, logId: "log-1",
    });
    expect(enviarSistema).not.toHaveBeenCalled();
  });

  it("pero un valor NUEVO al lado de uno ya avisado SÍ suena, y solo nombra el nuevo", async () => {
    const valores = agruparSinClasificar([
      ...HALLAZGOS,
      { sku: "ZZZ1", campo: "marca" as const, valor: "MARCA RECIEN INVENTADA" },
    ]);
    clavesYaAvisadasPorCampo.mockResolvedValue(['rubro=PROMO', 'subrubro=GENERAL']);
    await avisarClasificacionDesconocida({
      empresaKey: "active_shoes", syncType: "catalogo_reebok", marca: "Reebok",
      valores, logId: "log-1",
    });
    expect(enviarSistema).toHaveBeenCalledTimes(1);
    const texto = enviarSistema.mock.calls[0][0] as unknown as string;
    expect(texto).toContain("MARCA RECIEN INVENTADA");
    expect(texto).not.toContain("PROMO");
  });

  it("🔴 fail-open: si no se puede leer lo ya avisado, SE AVISA (perder un aviso es peor que repetirlo)", async () => {
    clavesYaAvisadasPorCampo.mockRejectedValue(new Error("base caída"));
    await avisarClasificacionDesconocida({
      empresaKey: "active_shoes", syncType: "catalogo_reebok", marca: "Reebok",
      valores: agruparSinClasificar(HALLAZGOS), logId: "log-1",
    });
    expect(enviarSistema).toHaveBeenCalledTimes(1);
  });

  it("NUNCA lanza, aunque Telegram falle: el sync sigue en success", async () => {
    enviarSistema.mockRejectedValueOnce(new Error("telegram caído"));
    await expect(
      avisarClasificacionDesconocida({
        empresaKey: "active_shoes", syncType: "catalogo_reebok", marca: "Reebok",
        valores: agruparSinClasificar(HALLAZGOS), logId: "log-1",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("forma — el canal y el lugar del aviso", () => {
  const RAIZ = path.resolve(__dirname, "../../..");
  const sinComentarios = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("nadie llama sendTelegramAlert directo desde acá", () => {
    const src = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/lib/catalogos/clasificacion-aviso.ts"), "utf8"),
    );
    expect(src).not.toContain("sendTelegramAlert");
    expect(src).toContain("enviarSistema");
  });

  it("🩸 el console.warn del navegador ya no existe en reebok-gender: no era un aviso", () => {
    // Corría en la consola del cliente que abre el catálogo público. Nadie lo
    // leyó nunca. Si vuelve, alguien creerá que hay un aviso donde no lo hay.
    const src = sinComentarios(
      fs.readFileSync(path.join(RAIZ, "src/lib/reebok-gender.ts"), "utf8"),
    );
    expect(src).not.toContain("console.warn");
  });
});
