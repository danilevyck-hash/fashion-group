"use client";

// Despachos › Pedidos › el pedido abierto — «Muestras» (24-nov-2026,
// `MUESTRAS_2026_11`). Bodega toca las referencias que no tiene y pide las
// muestras con UN botón; cada referencia marcada dice, sin botones, en qué va.
// Tocar una marcada abre una hoja: «No llegó» (enviada) o «Quitar muestra»
// (sin enviar), y «Cancelar». Las reglas son de `lib/guias/muestras.ts`; el
// servidor decide igual.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { ConfirmModal } from "@/components/ui";
import { useToast } from "@/components/ToastSystem";
import {
  esPorMandar,
  lineaDeEsperaDelPedido,
  lineaParaBodega,
  rotuloPedirMuestras,
  type MuestraLeida,
} from "@/lib/guias/muestras";

export interface ControlMuestras {
  activo: boolean;
  porCodigo: ReadonlyMap<string, MuestraLeida>;
  elegidas: ReadonlySet<string>;
  puedePedir: boolean;
  alternar: (codigo: string) => void;
  abrirHoja: (m: MuestraLeida) => void;
  pedir: () => Promise<void>;
  rotuloPedir: string | null;
  lineaDelPedido: string | null;
  hoja: React.ReactNode;
}

export function useMuestrasDelPedido(
  pedido: { empresa_key: string; pedido_switch_id: number },
  activo: boolean,
  puedePedir: boolean,
  estadoPedido: string | null,
): ControlMuestras {
  const { toast } = useToast();
  const [muestras, setMuestras] = useState<MuestraLeida[]>([]);
  const [elegidas, setElegidas] = useState<ReadonlySet<string>>(new Set());
  const [enHoja, setEnHoja] = useState<MuestraLeida | null>(null);
  const [guardando, setGuardando] = useState(false);
  const clave = `empresa_key=${encodeURIComponent(pedido.empresa_key)}&pedido_switch_id=${pedido.pedido_switch_id}`;

  const cargar = useCallback(async () => {
    if (!activo) return;
    try {
      const r = await fetch(`/api/guias/muestras?${clave}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { muestras: MuestraLeida[] };
      setMuestras(d.muestras ?? []);
    } catch {
      // Falla ABIERTA: el pedido se sigue viendo, sin las marcas.
    }
  }, [activo, clave]);
  useEffect(() => { void cargar(); }, [cargar]);

  const porCodigo = useMemo(() => new Map(muestras.map((m) => [m.codigo.trim(), m])), [muestras]);
  const abiertas = muestras.filter((m) => esPorMandar(m.estado)).length;
  // «recibido» no lleva muestras: el servidor tampoco deja pedirlas.
  const sePuedePedir = activo && puedePedir && estadoPedido !== "recibido";

  const alternar = (codigo: string) =>
    setElegidas((s) => {
      const n = new Set(s);
      if (n.has(codigo)) n.delete(codigo);
      else n.add(codigo);
      return n;
    });

  async function pedir() {
    if (elegidas.size === 0) return;
    setGuardando(true);
    try {
      const r = await fetch("/api/guias/muestras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pedido, codigos: [...elegidas] }),
      });
      const d = (await r.json().catch(() => null)) as { error?: string; muestras?: MuestraLeida[] } | null;
      if (!r.ok) throw new Error(d?.error ?? "No se pudieron pedir las muestras. Intenta de nuevo.");
      const n = d?.muestras?.length ?? elegidas.size;
      setElegidas(new Set());
      await cargar();
      toast(n === 1 ? "Muestra pedida" : `${n} muestras pedidas`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudieron pedir las muestras.", "error");
    } finally {
      setGuardando(false);
    }
  }

  async function accion(m: MuestraLeida, a: "no_llego" | "quitar") {
    setEnHoja(null);
    try {
      const r = await fetch("/api/guias/muestras", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: a, ids: [m.id] }),
      });
      const d = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(d?.error ?? "No se pudo guardar. Intenta de nuevo.");
      await cargar();
      toast(a === "no_llego" ? "Muestra reclamada" : "Muestra quitada", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar.", "error");
    }
  }

  const enviada = enHoja?.estado === "enviada";
  const hoja = enHoja && (
    <ConfirmModal
      open
      onClose={() => setEnHoja(null)}
      onConfirm={() => void accion(enHoja, enviada ? "no_llego" : "quitar")}
      title={`${enHoja.codigo}${enHoja.descripcion ? ` · ${enHoja.descripcion}` : ""}`}
      message={lineaParaBodega(enHoja, new Date().toISOString())}
      confirmLabel={enviada ? "No llegó" : "Quitar muestra"}
      destructive={!enviada}
    />
  );

  return {
    activo,
    porCodigo,
    elegidas,
    puedePedir: sePuedePedir,
    alternar,
    abrirHoja: (m) => { if (activo && puedePedir) setEnHoja(m); },
    pedir,
    rotuloPedir: sePuedePedir && elegidas.size > 0 && !guardando ? rotuloPedirMuestras(elegidas.size) : null,
    lineaDelPedido: lineaDeEsperaDelPedido(abiertas, estadoPedido),
    hoja,
  };
}

/** El fondo de la fila: ámbar lo que falta, verde lo enviado, gris lo elegido. */
export function fondoDeLaFila(c: ControlMuestras, codigo: string): string | undefined {
  if (!c.activo) return undefined;
  const m = c.porCodigo.get(codigo.trim());
  if (m) return m.estado === "enviada" ? "bg-emerald-50" : "bg-amber-50";
  return c.elegidas.has(codigo.trim()) ? "bg-gray-50" : undefined;
}

/** La línea bajo la referencia: «Falta muestra · esperando a Rey». */
export function LineaDeMuestra({ c, codigo }: { c: ControlMuestras; codigo: string }) {
  const m = c.activo ? c.porCodigo.get(codigo.trim()) : undefined;
  if (!m) return null;
  const tono = m.estado === "enviada" ? "text-emerald-700" : "text-amber-700";
  return <span className={`block text-xs font-medium ${tono}`}>{lineaParaBodega(m, new Date().toISOString())}</span>;
}

/** La celda de la derecha: el círculo para elegir, o tocar la fila marcada abre la hoja. */
export function CeldaDeMuestra({ c, codigo, descripcion }: { c: ControlMuestras; codigo: string; descripcion: string }) {
  const k = codigo.trim();
  const m = c.porCodigo.get(k);
  if (m) {
    if (!c.puedePedir) return null;
    return (
      <button
        type="button"
        onClick={() => c.abrirHoja(m)}
        aria-label={`Muestra de ${k}`}
        className="flex h-11 w-11 items-center justify-center text-gray-400 active:opacity-60"
      >
        <span aria-hidden>···</span>
      </button>
    );
  }
  if (!c.puedePedir) return null;
  const elegida = c.elegidas.has(k);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={elegida}
      aria-label={`Pedir muestra de ${k} · ${descripcion}`}
      onClick={() => c.alternar(k)}
      className="flex h-11 w-11 items-center justify-center"
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
          elegida ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white"
        }`}
      >
        {elegida && <Check size={16} strokeWidth={2.5} aria-hidden />}
      </span>
    </button>
  );
}
