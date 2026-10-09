/**
 * 🔒 CANDADO — 7-oct-2026, Ángela no pudo recibir el pedido 16-000002323.
 * Roles TAL CUAL están guardados en `fg_users` en producción (leídos ese día):
 * "Angela" / "andrea" → "secretaria"; "julio" / "jorman" → "bodega".
 * Regla de Daniel: Preparado solo bodega, Recibido solo secretaria (y admin).
 */
import { describe, expect, it } from "vitest";
import { puedeMoverFlujoSimple } from "@/lib/guias/pedidos-flujo-simple";
import { otraSesionEnElNavegador } from "@/lib/sesion-entre-pestanas";

// `empresa`: una que cada quien sí ve (jorman solo Vistana, julio no la ve).
const PRODUCCION = [
  { userName: "Angela", role: "secretaria", empresa: "vistana" },
  { userName: "andrea", role: "secretaria", empresa: "fashion_wear" },
  { userName: "julio", role: "bodega", empresa: "fashion_wear" },
  { userName: "jorman", role: "bodega", empresa: "vistana" },
];
const secretarias = PRODUCCION.filter((u) => u.role === "secretaria");
const bodega = PRODUCCION.filter((u) => u.role === "bodega");

const recibir = (u: (typeof PRODUCCION)[number]) => puedeMoverFlujoSimple({ desde: "preparado", hasta: "recibido", empresa_key: u.empresa }, u);
const preparar = (u: (typeof PRODUCCION)[number]) => puedeMoverFlujoSimple({ desde: "en_preparacion", hasta: "preparado", empresa_key: u.empresa }, u);
const deshacerRecibido = (u: (typeof PRODUCCION)[number]) => puedeMoverFlujoSimple({ desde: "recibido", hasta: "preparado", empresa_key: u.empresa }, u);
const deshacerPreparado = (u: (typeof PRODUCCION)[number]) => puedeMoverFlujoSimple({ desde: "preparado", hasta: "en_preparacion", empresa_key: u.empresa }, u);

describe("🔒 quién marca qué, con los roles reales de producción", () => {
  it.each(secretarias)("$userName (secretaria) marca Recibido y NO Preparado", (u) => {
    expect(recibir(u).ok).toBe(true);
    expect(preparar(u).ok).toBe(false);
  });

  it.each(bodega)("$userName (bodega) marca Preparado y NO Recibido", (u) => {
    expect(preparar(u).ok).toBe(true);
    expect(recibir(u).ok).toBe(false);
  });

  it("Ángela recibe el pedido real: Vistana, 16-000002323", () => {
    expect(puedeMoverFlujoSimple({ desde: "preparado", hasta: "recibido", empresa_key: "vistana" }, PRODUCCION[0]).ok).toBe(true);
  });

  it("deshacer un paso es de quien lo marca: Recibido la secretaria, Preparado bodega", () => {
    for (const u of secretarias) {
      expect(deshacerRecibido(u).ok).toBe(true);
      expect(deshacerPreparado(u).ok).toBe(false);
    }
    for (const u of bodega) {
      expect(deshacerPreparado(u).ok).toBe(true);
      expect(deshacerRecibido(u).ok).toBe(false);
    }
  });

  it("el rechazo nombra la sesión que llegó: nunca le dice a una secretaria que lo marca la secretaria", () => {
    const r = recibir(PRODUCCION[3]);
    expect(r).toEqual({ ok: false, error: "«Recibido» lo marca la secretaria. La sesión abierta es de jorman (bodega)." });
    for (const u of [...secretarias, ...bodega]) {
      for (const v of [recibir(u), preparar(u), deshacerRecibido(u), deshacerPreparado(u)]) {
        if (!v.ok) expect(v.error).toContain(`${u.userName} (${u.role})`);
      }
    }
  });
});

describe("🔒 la pestaña sigue a la sesión del navegador", () => {
  it("pestaña de Angela + navegador ya con jorman → esa pestaña se retira", () => {
    expect(otraSesionEnElNavegador("jorman", "Angela")).toBe(true);
    expect(otraSesionEnElNavegador("Angela", "Angela")).toBe(false);
    expect(otraSesionEnElNavegador(null, "Angela")).toBe(false);
    expect(otraSesionEnElNavegador("jorman", null)).toBe(false);
  });
});
