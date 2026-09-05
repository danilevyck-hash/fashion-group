// ─────────────────────────────────────────────────────────────────────────────
// «COBRAR» — UNA HOJA, CUATRO SALIDAS (5-sep-2026).
//
// 🩸 QUÉ REEMPLAZA. Para mandarle el estado de cuenta a un cliente había SEIS
// puertas que hacían lo mismo: las 4 opciones del menú "···" de la fila, el
// botón negro «Estado de cuenta» del panel expandido, y el menú de CLIC
// DERECHO. Ninguna se veía sin abrir algo, y las tres listas de opciones vivían
// en tres archivos que había que mantener iguales a mano.
//
// 🔴 LO QUE SE MANDA SON SIEMPRE LAS 6 EMPRESAS DEL GRUPO, sin importar el
// filtro de la pantalla. Daniel, textual: *«todo»*.
//
// 🩸 QUÉ PASABA ANTES: `EnviarEmailModal` le pasaba a la ruta el filtro de la
// pantalla como `empresa`, así que con «Vistana» seleccionado el CLIENTE
// recibía un estado de cuenta de Vistana solamente —creyendo que ése es todo lo
// que debe— y el resto quedaba sin cobrar. Peor: un vendedor con empresa
// asociada (Edwin tiene Vistana fija por `fg_empresa_filter`) NO PODÍA mandar el
// completo ni queriendo, porque la ruta le forzaba su empresa.
//
// ⚠️ Esto NO afecta al cajón de documentos (`/api/cxc/estado-cuenta/[codigo]`),
// que es lo que se MIRA: ahí el filtro sigue mandando. Cambia lo que se ENVÍA.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");

describe("🔴 el envío es SIEMPRE de las 6 empresas del grupo", () => {
  const src = sinComentarios(leer("src/app/api/cxc/enviar-email/route.ts"));

  it("existe una función que devuelve las 6 y nada más", () => {
    expect(src).toContain("function empresasDelEnvio()");
    expect(src).toContain("return [...CXC_GRUPO_EMPRESA_KEYS]");
  });

  it("🩸 el parámetro `empresa` DEJÓ DE LEERSE — en el GET y en el POST", () => {
    expect(src).not.toMatch(/sp\.get\(["']empresa["']\)/);
    expect(src).not.toMatch(/str\(body\.empresa\)/);
    expect(src).not.toContain("empresaParam");
  });

  it("🩸 y ya no se le recorta al vendedor por su empresa asociada", () => {
    // La vieja `resolveEmpresas` devolvía `[asociada]` para el rol vendedor: por
    // eso Edwin no podía mandar el estado de cuenta completo ni queriendo.
    expect(src).not.toContain("resolveEmpresas");
    expect(src).not.toMatch(/associatedCompany[\s\S]{0,80}return \[/);
  });

  it("las dos puntas (preview y envío) usan la MISMA función", () => {
    const usos = src.match(/empresasDelEnvio\(\)/g) ?? [];
    expect(usos.length).toBeGreaterThanOrEqual(2);
  });

  it("🔴 Boston no entra por ningún lado de esta ruta", () => {
    expect(src).not.toContain("confecciones_boston");
  });

  it("el modal de «Escribirlo yo» ya no manda el filtro de empresa", () => {
    const modal = sinComentarios(leer("src/app/cxc/components/EnviarEmailModal.tsx"));
    expect(modal).not.toContain("empresaScope");
    // 🔴 Ni `empresa` de ninguna forma: mandar una sola empresa hace que el
    // CLIENTE reciba un pedazo de su saldo creyendo que es todo.
    expect(modal).not.toMatch(/\bempresa\b\s*:/);
    expect(modal).toMatch(/new URLSearchParams\(\{ codigo, nombre, nombreNormalizado \}\)/);
    const pagina = sinComentarios(leer("src/app/cxc/page.tsx"));
    expect(pagina).not.toMatch(/<EnviarEmailModal[\s\S]{0,200}companyFilter=/);
  });

  it("⚠️ el cajón de documentos SÍ conserva el filtro (es lo que se MIRA)", () => {
    const drawer = sinComentarios(leer("src/app/cxc/components/EstadoCuentaDrawer.tsx"));
    expect(drawer).toContain("empresaScope");
    const ruta = sinComentarios(leer("src/app/api/cxc/estado-cuenta/[codigo]/route.ts"));
    expect(ruta).toMatch(/searchParams\.get\("empresa"\)/);
  });
});

describe("🔴 la hoja «Cobrar» ofrece las cuatro salidas", () => {
  const src = leer("src/app/cxc/components/HojaCobrar.tsx");

  it("Correo · WhatsApp · Copiar el mensaje · Ver o bajar el PDF", () => {
    for (const titulo of ["Correo", "WhatsApp", "Copiar el mensaje", "Ver o bajar el PDF"]) {
      expect(src, `falta la salida «${titulo}»`).toContain(`titulo="${titulo}"`);
    }
  });

  it("sin correo, la fila de Correo sale apagada y dice dónde cargarlo", () => {
    expect(src).toContain("Este cliente no tiene correo — cárgalo en su ficha");
    expect(src).toMatch(/apagada=\{!tieneCorreo/);
  });

  it("se conserva «Escribirlo yo» — el formulario completo NO se borró", () => {
    // El TEXTO del botón, no una mención en un comentario.
    expect(src).toContain("        Escribirlo yo ›\n      </button>");
    expect(fs.existsSync(path.join(process.cwd(), "src/app/cxc/components/EnviarEmailModal.tsx"))).toBe(true);
  });

  it("el encabezado dice al día, cuántas empresas y cuánto", () => {
    expect(src).toContain("Estado de cuenta al ${fmtDate(datos.generadoEn.slice(0, 10))}");
    expect(src).toContain("$${fmt(datos.total)}");
  });

  it("🔴 pide el estado de cuenta SIN pasar filtro de empresa", () => {
    expect(src).toMatch(/new URLSearchParams\(\{ codigo, nombre, nombreNormalizado \}\)/);
  });

  it("🔴 en celular la hoja sube DESDE ABAJO (y es UNA sola hoja)", () => {
    // `align="center"` es el patrón de hoja-desde-abajo del sistema
    // (`items-end sm:items-center`): pegada al borde inferior en celular,
    // centrada desde iPad. Una segunda hoja solo para el celular sería otra
    // lista de salidas que mantener igual a mano.
    expect(src).toContain('<ModalOverlay onBackdropClick={onClose} align="center">');
    expect(src).toContain("rounded-t-2xl sm:rounded-lg");
    expect(src).not.toContain("BottomSheet");
  });
});

describe("🔴 el correo de un clic se puede DESHACER 5 segundos", () => {
  const src = sinComentarios(leer("src/app/cxc/page.tsx"));

  it("usa el patrón del sistema, no un `setTimeout` propio", () => {
    expect(src).toContain("useUndoAction");
    expect(src).toContain("UndoToast");
    // La LLAMADA, no la desestructuración del hook: sin ella el correo saldría
    // al toque y «Deshacer» no impediría nada.
    expect(src).toMatch(/scheduleAction\(\{/);
    // (El único `setTimeout` de la pantalla es el del toast de 3 s, que no
    // tiene nada que ver con el envío.)
    expect((src.match(/setTimeout/g) ?? []).length).toBe(1);
  });

  it("el POST real ocurre DENTRO del `execute`, o sea al vencer el plazo", () => {
    expect(src).toMatch(/execute: async \(\) => \{[\s\S]{0,200}\/api\/cxc\/enviar-email/);
  });

  it("el aviso nombra al destinatario", () => {
    expect(src).toContain("Correo enviado a ${datos.destinatario}");
  });
});

describe("🩸 las seis puertas viejas ya no existen", () => {
  it("la fila no tiene menú «···» ni menú de clic derecho", () => {
    const tabla = sinComentarios(leer("src/app/cxc/components/ClientTable.tsx"));
    const fila = sinComentarios(leer("src/app/cxc/components/ClientRow.tsx"));
    for (const rastro of ["OverflowMenu", "useContextMenu", "onContextMenu", "buildClientContextMenu", "buildRowMenuItems"]) {
      expect(tabla, `«${rastro}» volvió a la tabla`).not.toContain(rastro);
      expect(fila, `«${rastro}» volvió a la fila`).not.toContain(rastro);
    }
  });

  it("la tarjeta del celular tampoco", () => {
    const movil = sinComentarios(leer("src/app/cxc/components/PanelCxcMobile.tsx"));
    expect(movil).not.toContain("OverflowMenu");
    expect(movil).not.toContain("buildRowMenuItems");
  });

  it("🔴 «Cobrar» se VE en la fila, sin abrir nada", () => {
    const fila = leer("src/app/cxc/components/ClientRow.tsx");
    expect(fila).toContain("onCobrar");
    expect(fila).toMatch(/>\s*Cobrar\s*</);
  });

  it("y también en la tarjeta del celular", () => {
    const movil = leer("src/app/cxc/components/PanelCxcMobile.tsx");
    expect(movil).toMatch(/>\s*Cobrar\s*</);
  });

  it("🩸 se fue la línea «N de M clientes · ordenados por …»", () => {
    const tabla = sinComentarios(leer("src/app/cxc/components/ClientTable.tsx"));
    const movil = sinComentarios(leer("src/app/cxc/components/PanelCxcMobile.tsx"));
    for (const src of [tabla, movil]) {
      expect(src).not.toContain("etiquetaOrden");
      expect(src).not.toContain("ordenados por");
    }
  });
});

describe("quién puede cobrar", () => {
  it("los MISMOS roles que ven el módulo — no se agregó ninguna restricción", () => {
    const pagina = sinComentarios(leer("src/app/cxc/page.tsx"));
    expect(pagina).toContain('allowedRoles: ["admin", "secretaria", "vendedor"]');
    for (const rel of [
      "src/app/api/cxc/enviar-email/route.ts",
      "src/app/api/cxc/cobrar-lote/route.ts",
      "src/app/api/cxc/envios/route.ts",
    ]) {
      const src = sinComentarios(leer(rel));
      expect(src, rel).toContain('const CXC_ROLES = ["admin", "secretaria", "vendedor"]');
    }
  });
});
