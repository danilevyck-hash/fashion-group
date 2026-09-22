/**
 * 🔴 EL EXCEL DEL HISTORIAL DURA UN AÑO, Y LA PANTALLA LO DICE SOLA (22-sep-2026).
 *
 * Daniel preguntó si subir la retención podía saturarle la base antes de
 * decir que sí. La respuesta —medida contra producción el 22-sep-2026— es que
 * no puede: estos archivos NO viven en la base, viven en Storage, y pesan
 * **35 KB de promedio** (10 archivos medidos), con un ritmo real de ~50
 * plantillas al mes → **~21 MB al año**. Con eso dijo «sí».
 *
 * 🩸 Y el número no era el único problema. El plazo estaba escrito A MANO en
 * la pantalla («El Excel se puede volver a bajar por 90 días»), así que el día
 * que la constante se moviera, la pantalla iba a seguir prometiendo 90 días
 * mientras el cron borraba a otro ritmo. Ahora el rótulo se DERIVA de la
 * constante y este candado prohíbe volver a escribirlo a mano.
 *
 * Lo que NO cambió: solo se guardan los Excel de Switch, y 🔴 la FILA con los
 * totales se queda PARA SIEMPRE — al vencer el archivo la fila pierde el
 * botón, nunca se borra la fila.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// El módulo arrastra el cliente de Supabase solo para el cron; este candado
// mira la CONSTANTE y el RÓTULO, que son puros.
// 🩸 El número y el rótulo viven en un módulo PURO, aparte del que habla con
// Storage: la PANTALLA los necesita y no puede arrastrar el cliente de
// servidor al navegador. Importarlos desde aquí prueba justamente eso.
import {
  RETENCION_ARCHIVO_DIAS,
  textoRetencion,
} from "@/lib/depurador/historial-retencion";

const RAIZ = process.cwd();
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

const PANTALLA = "src/app/productos/cargar/HistorialView.tsx";

describe("🔴 El archivo del Historial dura un año", () => {
  it("la retención es de 365 días", () => {
    expect(RETENCION_ARCHIVO_DIAS).toBe(365);
  });

  it("un año se dice «un año», no «365 días»", () => {
    expect(textoRetencion(365)).toBe("un año");
    expect(textoRetencion(730)).toBe("2 años");
    expect(textoRetencion(90)).toBe("90 días");
  });
});

describe("🔴 El plazo sale de UN solo lugar", () => {
  it("la pantalla lo deriva de la constante, no lo escribe", () => {
    const tsx = leer(PANTALLA);
    expect(tsx).toContain("textoRetencion()");
    // 🔴 Del módulo PURO, nunca del que importa supabase-server.
    expect(tsx).toContain('from "@/lib/depurador/historial-retencion"');
    expect(tsx).not.toContain('from "@/lib/depurador/historial-archivos"');
  });

  it("ningún archivo del módulo promete un plazo escrito a mano", () => {
    const sospechosos = [
      PANTALLA,
      "src/app/productos/cargar/DepuradorClient.tsx",
      "src/app/productos/cargar/page.tsx",
      "src/app/api/cron/cleanup-depurador-archivos/route.ts",
    ];
    const culpables = sospechosos.filter((p) => /90\s*d[ií]as/i.test(leer(p)));
    expect(
      culpables,
      `\n\nEstos archivos siguen prometiendo «90 días» a mano; el plazo ahora es ` +
        `${RETENCION_ARCHIVO_DIAS} y el rótulo tiene que salir de textoRetencion().\n` +
        culpables.join("\n") +
        "\n",
    ).toEqual([]);
  });
});

describe("🔴 Lo que NO cambió", () => {
  it("el módulo del plazo no arrastra el cliente de servidor", () => {
    const puro = leer("src/lib/depurador/historial-retencion.ts");
    expect(puro).not.toMatch(/^\s*import /m);
  });

  it("la fila con los totales nunca se borra junto con el archivo", () => {
    const lib = leer("src/lib/depurador/historial-archivos.ts");
    expect(lib).toMatch(/FILA[\s\S]{0,120}(para siempre|se queda)/i);
    // El cron limpia Storage y apaga el botón; no hace DELETE de la fila.
    expect(lib).not.toMatch(/\.delete\(\)[\s\S]{0,80}carga_history/);
  });
});
