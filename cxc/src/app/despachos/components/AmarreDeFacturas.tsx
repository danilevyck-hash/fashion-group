"use client";

// 25-nov-2026 (`GUIA_AMARRE_FACTURAS_2026_11`, Daniel aprobó). Cada número del
// renglón se AMARRA: una factura de Switch (misma empresa, mismo cliente) o
// «Traslado». Lo que no aparece se señala en rojo, con las facturas del
// cliente de esa empresa para tocar, «Traslado» y «Actualizar facturas de hoy»
// (la de hoy que aún no bajó). La regla frena al COMPLETAR, no al guardar
// (`amarre-facturas.ts`, la misma del servidor). Solo lee
// `/api/guias/facturas-cliente?codigo=` (la misma de Nueva guía y Etiquetas).

import { useEffect, useState } from "react";
import { claveDeFactura, facturaParaMostrar } from "@/lib/guias/numero-factura";
import { GUIA_ENVIO_SIN_FACTURA_2026_11 } from "@/lib/guias/envio-sin-factura";
import { TEXTO_TRASLADO, fechaDeLaFactura, type FacturaDelCliente } from "@/lib/guias/atajos-facturas";
import { GUIA_AMARRE_FACTURAS_2026_11, partesDelRenglon as partesDeLaRegla, sinAmarre as sinAmarreDeLaRegla, type FacturaDeSwitch } from "@/lib/guias/amarre-facturas";
import { hoyPanama } from "@/lib/fecha-panama";
import type { GuiaItem } from "./types";

type Factura = FacturaDelCliente & { pedidoBultos?: number };

/** Las facturas de cada cliente de la guía, leídas una vez. */
export function useFacturasDeLaGuia(items: readonly GuiaItem[]) {
  const codigos = [...new Set(items.map((i) => (i.cliente_codigo ?? "").trim()).filter((c) => /^D-\d+$/i.test(c)))].sort().join(",");
  const [porCliente, setPorCliente] = useState<Record<string, Factura[]>>({});
  const [ronda, setRonda] = useState(0);
  useEffect(() => {
    if (!GUIA_AMARRE_FACTURAS_2026_11) return;
    let vigente = true;
    void Promise.all(codigos.split(",").filter(Boolean).map(async (c) => {
      try {
        const r = await fetch(`/api/guias/facturas-cliente?codigo=${encodeURIComponent(c)}`, { cache: "no-store" });
        const d = (await r.json()) as { facturas?: Factura[] };
        return [c, d.facturas ?? []] as const;
      } catch { return [c, null] as const; }
    })).then((pares) => {
      if (!vigente) return;
      const m: Record<string, Factura[]> = {};
      for (const [c, f] of pares) if (f) m[c] = f;
      setPorCliente(m);
    });
    return () => { vigente = false; };
  }, [codigos, ronda]);
  const actualizar = async () => {
    await fetch("/api/guias/facturas-hoy", { method: "POST" }).catch(() => {});
    setRonda((n) => n + 1);
  };
  return { porCliente, actualizar };
}

/** Las facturas del cliente del renglón, en la forma de la regla. `null` = sin cliente o sin leer: no se afirma nada. */
function facturasDelRenglon(item: GuiaItem, porCliente: Record<string, Factura[]>): FacturaDeSwitch[] | null {
  const codigo = (item.cliente_codigo ?? "").trim();
  const lista = porCliente[codigo];
  return lista ? lista.map((f) => ({ empresa_key: f.empresa_key, secuencial: f.secuencial, cliente_codigo: codigo })) : null;
}

export function partesDelRenglon(item: GuiaItem, porCliente: Record<string, Factura[]>) {
  return partesDeLaRegla(item, facturasDelRenglon(item, porCliente));
}

/** «Renglón 10: la factura 2943 no está en Fashion Shoes…». Lo mismo que contesta el servidor al completar. */
export function sinAmarre(items: readonly GuiaItem[], porCliente: Record<string, Factura[]>): string[] {
  return items.flatMap((it, i) => sinAmarreDeLaRegla([it], facturasDelRenglon(it, porCliente)).map((t) => t.replace(/^Renglón 1:/, `Renglón ${i + 1}:`)));
}

export function AmarreDelRenglon({ item, porCliente, onCambiar, onActualizar }: {
  item: GuiaItem;
  porCliente: Record<string, Factura[]>;
  onCambiar: (facturas: string) => void;
  onActualizar: () => void;
}) {
  const partes = partesDelRenglon(item, porCliente);
  if (!GUIA_AMARRE_FACTURAS_2026_11 || partes.length === 0) return null;
  const hoy = hoyPanama();
  const suyas = porCliente[(item.cliente_codigo ?? "").trim()] ?? [];
  const fechaDe = (f?: FacturaDeSwitch) =>
    f ? suyas.find((x) => x.empresa_key === f.empresa_key && x.secuencial === f.secuencial)?.fecha : undefined;
  const usadas = new Set(partes.map((p) => claveDeFactura(p.texto)));
  const sugeridas = suyas
    .filter((f) => f.empresa === item.empresa && !f.yaSalioEn && !usadas.has(claveDeFactura(f.secuencial)))
    .slice(0, 3);
  const reemplazar = (viejo: string, nuevo: string) =>
    onCambiar(partes.map((p) => (p.texto === viejo ? nuevo : p.texto)).join(", "));
  const falta = partes.find((p) => p.tipo === "falta");
  return (
    <div className="mt-1 space-y-1 text-xs">
      <div className="flex flex-wrap gap-1">
        {partes.filter((p) => p.tipo !== "sin_dato").map((p) => (
          <span
            key={p.texto}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${p.tipo === "falta" ? "bg-red-50 font-medium text-red-700" : "bg-emerald-50 text-emerald-800"}`}
          >
            {p.tipo === "falta" ? "✕" : "✓"} {p.tipo === "traslado" ? TEXTO_TRASLADO : facturaParaMostrar(p.factura?.secuencial ?? p.texto)}
            {fechaDe(p.factura) && <span className="text-emerald-700/80">· {fechaDeLaFactura(fechaDe(p.factura)!, hoy)}</span>}
            {p.tipo === "falta" && <span>· no está en {item.empresa}</span>}
          </span>
        ))}
      </div>
      {falta && (
        <div className="rounded-md border border-red-200 bg-white p-2">
          <p className="mb-1 text-gray-600">Selecciona la factura de {item.cliente || "este cliente"}:</p>
          <div className="flex flex-wrap gap-1">
            {sugeridas.map((f) => (
              <button
                key={f.secuencial}
                type="button"
                onClick={() => reemplazar(falta.texto, f.secuencial)}
                className="rounded-md border border-gray-300 px-2 py-1 font-medium text-gray-900 hover:bg-gray-50"
              >
                {facturaParaMostrar(f.secuencial)} · {fechaDeLaFactura(f.fecha, hoy)}
                {f.pedidoBultos ? ` · ${f.pedidoBultos} bultos` : ""}
              </button>
            ))}
            {/* 26-nov-2026: con «Envío sin factura» prendido, el traslado ya no se ofrece aquí. */}
            {!GUIA_ENVIO_SIN_FACTURA_2026_11 && (
              <button type="button" onClick={() => reemplazar(falta.texto, TEXTO_TRASLADO)} className="rounded-md border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50">
                Traslado
              </button>
            )}
          </div>
          <button type="button" onClick={onActualizar} className="mt-1 text-blue-600 hover:text-blue-800">
            Actualizar facturas de hoy
          </button>
        </div>
      )}
    </div>
  );
}
