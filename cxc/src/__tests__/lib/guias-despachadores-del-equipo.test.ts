/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — LA LISTA DE «DESPACHADO POR» ES DEL EQUIPO, NO DE UN NAVEGADOR.
 *
 * Daniel, textual (19-sep-2026): *«el + para agregar nombre debe de guardarse
 * para todos los navegadores, o más fácil ponlo en configuraciones nada más y
 * quita la opción de que sea en la creación de la guía»*.
 *
 * 🩸 La lista vivía mitad en una constante de `GuiaForm.tsx` (Julio · Rodrigo ·
 * Eloyn · Jorman) y mitad en el `localStorage` del navegador
 * (`fg_entregadores`): un nombre que agregaba Angela con el ＋ NO lo veía
 * Andrea, y no se podía quitar desde ninguna pantalla. Es EXACTAMENTE el mismo
 * cuento del destino «hola» (7-sep-2026) y de los transportistas escritos a
 * mano (9-sep-2026).
 *
 * 🔴 LO QUE ESTE CANDADO SOSTIENE:
 *   1. nadie vuelve a guardar la lista en el navegador;
 *   2. el formulario de la guía se quedó con el DESPLEGABLE PELADO —ni «＋»,
 *      ni «Otro…»—, que es lo que Daniel pidió;
 *   3. la lista se administra en Guías › Configuración, con soft delete
 *      FIRMADO y NUNCA un DELETE;
 *   4. falla ABIERTA: sin la migración, el desplegable ofrece los cuatro de
 *      siempre y nada se rompe.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import {
  DESPACHADORES_BASE,
  DESPACHADORES_ROLES_ESCRITURA,
  DESPACHADORES_ROLES_LECTURA,
  claveDespachador,
  conCuentaDeGuias,
  contarGuiasPorDespachador,
  listaParaElDesplegable,
  textoGuiasDelDespachador,
  textoQuitarDespachador,
  validarDespachadorNuevo,
  yaEsUnDespachador,
  type Despachador,
} from "@/lib/guias/despachadores";
import { CONFIG_GUIAS_ROLES } from "@/lib/guias/destinos-config";

const raiz = process.cwd();
const leer = (r: string) => readFileSync(path.join(raiz, r), "utf8");

/** Barre `src/` (sin los tests) buscando un patrón. Devuelve los archivos. */
function barrer(re: RegExp): string[] {
  const encontrados: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (rel === "src/__tests__") continue;
        recorrer(rel);
      } else if (/\.tsx?$/.test(e.name) && re.test(readFileSync(path.join(raiz, rel), "utf8"))) {
        encontrados.push(rel);
      }
    }
  };
  recorrer("src");
  return encontrados;
}

const form = leer("src/app/guias/components/GuiaForm.tsx");
const ruta = leer("src/app/api/guias/despachadores/route.ts");
const server = leer("src/lib/guias/despachadores-server.ts");
const config = leer("src/app/guias/components/GuiasConfiguracionView.tsx");
const migracion = leer("supabase/migrations/20261210120000_guias_despachadores.sql");

describe("🔴 la lista ya no vive en el navegador", () => {
  it("🩸 la clave `fg_entregadores` no la USA ningún archivo", () => {
    // Se busca la clave ENTRE COMILLAS (el uso), no la palabra: los
    // comentarios que cuentan esta historia la nombran, y contarlos sería un
    // candado que se caza a sí mismo.
    const rastro = barrer(/["']fg_entregadores["']/);
    expect(rastro, `todavía hay código guardando la lista en el navegador: ${rastro.join(", ")}`).toEqual([]);
  });

  it("el formulario pide la lista al servidor", () => {
    expect(form).toContain('fetch("/api/guias/despachadores"');
    expect(form).toContain("listaParaElDesplegable");
  });

  it("⚠️ y FALLA ABIERTA: sin la tabla, los cuatro de siempre", () => {
    expect(form).toContain("DESPACHADORES_BASE");
    expect(server).toContain("return [...DESPACHADORES_BASE];");
    expect([...DESPACHADORES_BASE]).toEqual(["Julio", "Rodrigo", "Eloyn", "Jorman"]);
    // La semilla de la migración son ESOS CUATRO y ninguno más.
    for (const n of DESPACHADORES_BASE) expect(migracion).toContain(`('${n}'`);
  });
});

describe("🔴 en la guía quedó SOLO el desplegable", () => {
  it("no hay «＋» de agregar quien despacha", () => {
    expect(form).not.toContain("Agregar quien despacha");
    expect(form).not.toContain("addEntregador");
  });

  it("no hay opción «Otro…»: era la otra puerta para agregar un nombre", () => {
    expect(form).not.toContain("ENTREGADO_POR_OTRO");
    expect(form).not.toContain("entregadoPorOtro");
  });

  it("⚠️ pero el centinela `__other__` NO se retiró: es la red de lo guardado", () => {
    // Una guía vieja pudo quedar guardada con el centinela, y el papel no
    // puede imprimirlo. `nombreDespachadoPor` sigue tapándolo.
    const despachadoPor = leer("src/lib/guias/despachado-por.ts");
    expect(despachadoPor).toContain('export const ENTREGADO_POR_OTRO = "__other__"');
    expect(form).toContain("nombreDespachadoPor");
  });

  it("el campo sigue siendo OBLIGATORIO", () => {
    expect(form).toContain('label="Despachado por" requerido');
    expect(leer("src/app/guias/components/guia-form-logic.ts")).toContain(
      "if (!entregadoPorElegido(estado.entregadoPor)) errores.add(\"entregadoPor\");",
    );
  });
});

describe("🔴 se administra en Guías › Configuración", () => {
  it("la tarjeta está montada en la pantalla de Configuración", () => {
    expect(config).toContain("<DespachadoresConfig onAviso={setToast} />");
  });

  it("agregar y quitar son de admin y secretaria, y de nadie más", () => {
    expect([...DESPACHADORES_ROLES_ESCRITURA]).toEqual([...CONFIG_GUIAS_ROLES]);
    expect([...DESPACHADORES_ROLES_ESCRITURA]).toEqual(["admin", "secretaria"]);
    // Leer la lista sí es de todo el que abre Guías: el desplegable la usa.
    expect([...DESPACHADORES_ROLES_LECTURA]).toContain("bodega");
    expect(ruta).toContain("DESPACHADORES_ROLES_ESCRITURA");
    expect(ruta).toContain("DESPACHADORES_ROLES_LECTURA");
  });

  it("🔴 quitar es SOFT DELETE FIRMADO: nunca un DELETE", () => {
    expect(server).toContain("activo: false");
    expect(server).toContain("desactivado_por");
    expect(server).toContain("desactivado_en");
    expect(server).not.toMatch(/\.delete\(/);
    expect(migracion).toContain("guias_despachadores_baja_firmada");
    expect(migracion).not.toMatch(/\bDROP TABLE\b/i);
    // La tabla no le da permiso de DELETE ni al service_role.
    expect(migracion).toContain("GRANT SELECT, INSERT, UPDATE ON guias_despachadores TO service_role;");
  });

  it("🔴 la ruta NO escribe una sola guía", () => {
    expect(server).not.toMatch(/from\("guia_transporte"\)[\s\S]{0,120}\.(update|insert|upsert|delete)\(/);
    expect(server).toContain('from("guia_transporte")');
    expect(server).toContain("leerTodoPaginado");
  });
});

describe("el módulo puro decide bien", () => {
  it("el repetido se rechaza por clave normalizada, nunca por parecido", () => {
    expect(yaEsUnDespachador("JULIO", ["Julio"])).toBe(true);
    expect(yaEsUnDespachador(" julio ", ["Julio"])).toBe(true);
    expect(yaEsUnDespachador("Julián", ["Julio"])).toBe(false);
    expect(claveDespachador("Julio")).toBe(claveDespachador("JULIO"));
  });

  it("la lista del desplegable descarta repetidos y cae a la de siempre", () => {
    expect(listaParaElDesplegable(["Julio", "JULIO", "Rodrigo"])).toEqual(["Julio", "Rodrigo"]);
    expect(listaParaElDesplegable([])).toEqual([...DESPACHADORES_BASE]);
    expect(listaParaElDesplegable(null)).toEqual([...DESPACHADORES_BASE]);
    expect(listaParaElDesplegable(["  ", ""])).toEqual([...DESPACHADORES_BASE]);
  });

  it("validar es fail-closed y dice qué falta", () => {
    expect(validarDespachadorNuevo({ nombre: "  " })).toEqual({
      ok: false,
      error: "Escribe el nombre de quien despacha",
    });
    expect(validarDespachadorNuevo({})).toEqual({
      ok: false,
      error: "Escribe el nombre de quien despacha",
    });
    expect(validarDespachadorNuevo({ nombre: "x".repeat(200) }).ok).toBe(false);
    expect(validarDespachadorNuevo({ nombre: " Jorman " })).toEqual({ ok: true, valor: "Jorman" });
  });

  it("cuenta las guías por el TEXTO del nombre, normalizado", () => {
    const cuenta = contarGuiasPorDespachador([
      { entregado_por: "Julio" },
      { entregado_por: "JULIO" },
      { entregado_por: "Rodrigo" },
      { entregado_por: "" },
      { entregado_por: null },
    ]);
    const filas: Despachador[] = [
      { id: 1, nombre: "Julio", creado_por: "sistema", creado_en: "2026-09-19" },
      { id: 2, nombre: "Rodrigo", creado_por: "sistema", creado_en: "2026-09-19" },
      { id: 3, nombre: "Eloyn", creado_por: "sistema", creado_en: "2026-09-19" },
    ];
    const conCuenta = conCuentaDeGuias(filas, cuenta);
    expect(conCuenta.map((f) => [f.nombre, f.guias])).toEqual([
      ["Julio", 2],
      ["Rodrigo", 1],
      ["Eloyn", 0],
    ]);
  });

  it("nunca un «0» pelado, y el modal dice qué cambia", () => {
    expect(textoGuiasDelDespachador(0)).toBe("Todavía sin guías");
    expect(textoGuiasDelDespachador(1)).toBe("1 guía");
    expect(textoGuiasDelDespachador(178)).toBe("178 guías");
    expect(textoQuitarDespachador("Julio", 178)).toContain("178 guías que lo dicen");
    expect(textoQuitarDespachador("Julio", 178)).toContain("no cambian");
    expect(textoQuitarDespachador("Eloyn", 0)).not.toContain("guías");
  });
});
