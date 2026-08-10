"use client";

// Estado de LA PÁGINA DE UNA GUÍA (`/guias/[id]`): trae la guía, guarda lo que
// se va tipeando y confirma el despacho.
//
// 🩸 Antes esto vivía dentro de `useGuiasState`, el hook de la LISTA, porque el
// formulario de despacho se desplegaba dentro de la fila. Con el despacho en su
// propia pantalla, la lista dejó de necesitarlo: quedarse con esos campos allá
// habría dejado el estado del despacho vivo en una pantalla que ya no despacha.
//
// ⚠️ EL BORRADOR SE GUARDA POR GUÍA, igual que antes. La PWA se recarga sola al
// haber build nuevo y en la bodega el WiFi se cae: lo tipeado y lo firmado
// sobreviven a eso. Lo nuevo es que los N° del transportista también, uno por
// línea (`numerosTransp`).

import { useCallback, useEffect, useState } from "react";
import type { Guia } from "./types";
import type { TipoDespacho } from "@/lib/guias/falta-para-despachar";
import { numeroGuiaDeCabecera } from "@/lib/guias/falta-para-despachar";

interface Draft {
  placa?: string;
  receptor?: string;
  cedula?: string;
  chofer?: string;
  tipoDespacho?: TipoDespacho;
  numerosTransp?: string[];
}

function leerDraft(id: string): Draft {
  try {
    return JSON.parse(localStorage.getItem(`guia_despacho_${id}`) || "{}") as Draft;
  } catch {
    return {};
  }
}

function escribirDraft(id: string, campo: keyof Draft, valor: unknown) {
  try {
    const cur = leerDraft(id) as Record<string, unknown>;
    cur[campo] = valor;
    localStorage.setItem(`guia_despacho_${id}`, JSON.stringify(cur));
  } catch {
    /* sin borrador; la pantalla sigue funcionando */
  }
}

export function useDespachoGuia(id: string | null) {
  const [guia, setGuia] = useState<Guia | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [tipoDespacho, _setTipoDespacho] = useState<TipoDespacho>("externo");
  const [bPlaca, _setBPlaca] = useState("");
  const [bReceptor, _setBReceptor] = useState("");
  const [bCedula, _setBCedula] = useState("");
  const [bChofer, _setBChofer] = useState("");
  const [numerosTransp, _setNumerosTransp] = useState<string[]>([]);
  const [bSaving, setBSaving] = useState(false);
  const [pendingFirma1, _setPendingFirma1] = useState<string | null>(null);
  const [pendingFirma2, _setPendingFirma2] = useState<string | null>(null);
  const [despachada, setDespachada] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const cargar = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      // cache: "no-store" — sin esto Next sirve la guía de antes del despacho.
      const res = await fetch(`/api/guias/${id}`, { cache: "no-store" });
      if (!res.ok) {
        setError("No se encontró la guía");
        return;
      }
      const g = (await res.json()) as Guia;
      setGuia(g);

      const items = g.guia_items || [];
      const cabecera = g.numero_guia_transp || "";
      // Cada línea arranca con SU número; las guías viejas no lo tienen y
      // heredan el único de la cabecera, que es lo que se imprimía en todas.
      const desdeServidor = items.map((it) => it.numero_guia_transp || cabecera || "");

      setDespachada(g.estado === "Completada" || g.estado === "Rechazada");
      _setBPlaca(g.placa || "");
      _setBReceptor(g.receptor_nombre || "");
      _setBCedula(g.cedula || "");
      _setBChofer(g.nombre_chofer || "");
      _setTipoDespacho((g.tipo_despacho as TipoDespacho) || "externo");
      _setNumerosTransp(desdeServidor);

      try {
        const f1 = localStorage.getItem(`guia_firma_${id}_transportista`);
        const f2 = localStorage.getItem(`guia_firma_${id}_entregador`);
        if (f1) _setPendingFirma1(f1);
        if (f2) _setPendingFirma2(f2);
        // El borrador solo pisa lo que el servidor NO trae.
        const d = leerDraft(id);
        if (d.placa && !g.placa) _setBPlaca(d.placa);
        if (d.receptor && !g.receptor_nombre) _setBReceptor(d.receptor);
        if (d.cedula && !g.cedula) _setBCedula(d.cedula);
        if (d.chofer && !g.nombre_chofer) _setBChofer(d.chofer);
        if (d.tipoDespacho && !g.tipo_despacho) _setTipoDespacho(d.tipoDespacho);
        if (Array.isArray(d.numerosTransp)) {
          _setNumerosTransp(
            desdeServidor.map((v, i) => (v ? v : (d.numerosTransp?.[i] ?? "")))
          );
        }
      } catch {
        /* sin borrador */
      }
    } catch {
      setError("Error al cargar la guía");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);

  // ── setters que además guardan el borrador ────────────────────────────────
  const setBPlaca = (v: string) => { _setBPlaca(v); if (id) escribirDraft(id, "placa", v); };
  const setBReceptor = (v: string) => { _setBReceptor(v); if (id) escribirDraft(id, "receptor", v); };
  const setBCedula = (v: string) => { _setBCedula(v); if (id) escribirDraft(id, "cedula", v); };
  const setBChofer = (v: string) => { _setBChofer(v); if (id) escribirDraft(id, "chofer", v); };
  const setTipoDespacho = (v: TipoDespacho) => { _setTipoDespacho(v); if (id) escribirDraft(id, "tipoDespacho", v); };
  const setNumeroTransp = (idx: number, v: string) => {
    _setNumerosTransp((prev) => {
      const next = [...prev];
      next[idx] = v;
      if (id) escribirDraft(id, "numerosTransp", next);
      return next;
    });
  };
  const setPendingFirma1 = (v: string | null) => {
    _setPendingFirma1(v);
    try {
      if (!id) return;
      if (v) localStorage.setItem(`guia_firma_${id}_transportista`, v);
      else localStorage.removeItem(`guia_firma_${id}_transportista`);
    } catch { /* */ }
  };
  const setPendingFirma2 = (v: string | null) => {
    _setPendingFirma2(v);
    try {
      if (!id) return;
      if (v) localStorage.setItem(`guia_firma_${id}_entregador`, v);
      else localStorage.removeItem(`guia_firma_${id}_entregador`);
    } catch { /* */ }
  };

  async function confirmarDespacho(firma1: string, firma2: string) {
    if (!guia || !id) return;
    setBSaving(true);

    const items = guia.guia_items || [];
    // 🔴 EL N° DEL TRANSPORTISTA VIAJA POR LÍNEA. `items_guia_transp` toca UNA
    // columna de cada renglón; NO manda `items`, que en el PUT es un reemplazo
    // completo (borra e inserta) y le cambiaría el id a cada línea en pleno
    // despacho.
    const porLinea = items
      .map((it, i) => ({ id: it.id, numero_guia_transp: (numerosTransp[i] ?? "").trim() }))
      .filter((r): r is { id: string; numero_guia_transp: string } => !!r.id);

    const payload: Record<string, unknown> = {
      estado: "Completada",
      tipo_despacho: tipoDespacho,
      placa: bPlaca,
      receptor_nombre: bReceptor,
      cedula: bCedula,
      firma_base64: firma1,
      firma_entregador_base64: firma2,
      items_guia_transp: porLinea,
    };

    if (tipoDespacho === "externo") {
      // La columna de la guía NO se retira: la usan el buscador, el Excel y el
      // encabezado del papel. Se llena con el primer número que haya.
      payload.numero_guia_transp = numeroGuiaDeCabecera(numerosTransp);
    } else {
      payload.nombre_chofer = bChofer;
    }

    try {
      const res = await fetch(`/api/guias/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast(`Guía GT-${String(guia.numero).padStart(3, "0")} despachada`);
        try {
          localStorage.removeItem(`guia_firma_${id}_transportista`);
          localStorage.removeItem(`guia_firma_${id}_entregador`);
          localStorage.removeItem(`guia_despacho_${id}`);
        } catch { /* */ }
        setDespachada(true);
        await cargar();
        return true;
      }
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "No se pudo guardar. Intenta de nuevo en unos segundos.");
    } catch {
      showToast("Sin conexión. Tus datos y firmas quedaron guardados — intenta de nuevo.");
    } finally {
      setBSaving(false);
    }
    return false;
  }

  return {
    guia, loading, error, toast, showToast, recargar: cargar,
    despachada,
    tipoDespacho, setTipoDespacho,
    bPlaca, setBPlaca,
    bReceptor, setBReceptor,
    bCedula, setBCedula,
    bChofer, setBChofer,
    numerosTransp, setNumeroTransp,
    bSaving, confirmarDespacho,
    pendingFirma1, setPendingFirma1,
    pendingFirma2, setPendingFirma2,
  };
}
