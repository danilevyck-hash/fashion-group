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
import type { Guia, GuiaItem } from "./types";
import type { TipoDespacho } from "@/lib/guias/falta-para-despachar";
import { numeroGuiaDeCabecera } from "@/lib/guias/falta-para-despachar";
import { guiaYaDespachada, tipoDespachoEfectivo } from "@/lib/guias/modo-despacho";
import type { JuegoDespacho } from "@/lib/guias/juegos-despacho";

/**
 * Lo que bodega puede corregir de un renglón sin salir de la pantalla. Viaja al
 * endpoint que escribe SOLO estos campos de UNA fila — ver la nota de
 * `corregirItem` más abajo.
 */
export interface CorreccionEnvio {
  cliente?: string;
  cliente_codigo?: string | null;
  direccion?: string;
  empresa?: string;
  facturas?: string;
  bultos?: number;
}

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
  // Los juegos MÁS USADOS (recibido por + cédula + placa) de ESTE transportista.
  // Best-effort: si no llegan, los tres campos se escriben a mano como siempre.
  const [juegos, setJuegos] = useState<JuegoDespacho[]>([]);

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

      const yaSalio = guiaYaDespachada(g.estado);
      setDespachada(yaSalio);
      _setBPlaca(g.placa || "");
      _setBReceptor(g.receptor_nombre || "");
      _setBCedula(g.cedula || "");
      _setBChofer(g.nombre_chofer || "");
      // 🔴 EL MODO ARRANCA EN LO QUE SE ELIGIÓ AL CREAR LA GUÍA.
      // Acá vivía `(g.tipo_despacho as TipoDespacho) || "externo"`, que nunca
      // miraba `modo_entrega`. Y no era un `??` faltante: `tipo_despacho` tiene
      // DEFAULT 'externo' en la base, así que la rama de respaldo era
      // inalcanzable. Medido: 50 de 51 guías creadas como entrega directa
      // terminaron grabadas como transportista externo. Ver `modo-despacho.ts`.
      _setTipoDespacho(tipoDespachoEfectivo(g));
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
        // El borrador manda mientras la guía NO haya salido: es lo que la
        // persona eligió con "cambiar". La condición vieja era
        // `!g.tipo_despacho`, o sea NUNCA (la columna trae DEFAULT 'externo'):
        // cambiar el modo y perder la conexión te devolvía al modo del alta.
        if (d.tipoDespacho && !yaSalio) _setTipoDespacho(d.tipoDespacho);
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

  // Los juegos del transportista de ESTA guía, del más usado al menos. Solo
  // tiene sentido mientras la guía no haya salido: después, lo que se ve es lo
  // que se firmó.
  const transportistaId = guia?.transportista_id ?? null;
  useEffect(() => {
    if (!transportistaId || despachada) { setJuegos([]); return; }
    let cancel = false;
    fetch(`/api/guias/despachos-frecuentes?transportista=${encodeURIComponent(transportistaId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancel || !d || !Array.isArray(d.juegos)) return;
        setJuegos(d.juegos as JuegoDespacho[]);
      })
      .catch(() => { /* sin sugerencias: los campos se llenan a mano */ });
    return () => { cancel = true; };
  }, [transportistaId, despachada]);

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
  /**
   * Un toque llena los TRES campos — y los tres quedan editables. Pasa por los
   * setters de siempre, así que el borrador también los guarda: si se corta el
   * WiFi en la bodega, lo tomado no se pierde.
   */
  const usarJuego = (j: JuegoDespacho) => {
    setBReceptor(j.receptor);
    setBCedula(j.cedula);
    setBPlaca(j.placa);
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

  /**
   * 🔴 CORREGIR UN RENGLÓN SIN REEMPLAZAR LA LISTA.
   *
   * Va por `PATCH /api/guias/[id]/item`, que escribe los campos tocados de UNA
   * fila. **NUNCA por `items` del PUT**: eso borra todos los renglones e inserta
   * otros nuevos, cambiándoles el id — se perderían los clientes atados y los
   * ids que esta misma pantalla tiene en la mano para el N° del transportista.
   *
   * Devuelve el mensaje de error, o `null` si se guardó.
   */
  async function corregirItem(itemId: string, cambios: CorreccionEnvio): Promise<string | null> {
    if (!id) return "No se pudo guardar. Intenta de nuevo en unos segundos.";
    try {
      const res = await fetch(`/api/guias/${id}/item`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, ...cambios }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) return cuerpo.error || "No se pudo guardar. Intenta de nuevo en unos segundos.";
      // Se actualiza SOLO esa fila del estado local: recargar la guía entera
      // tiraría lo que se está tipeando en los otros renglones y las firmas ya
      // dibujadas.
      const devuelto = (cuerpo.item ?? {}) as Record<string, unknown>;
      const aplicado = { ...cambios, ...devuelto };
      setGuia((prev) => {
        if (!prev) return prev;
        const items = (prev.guia_items || []).map((it) => {
          if (it.id !== itemId) return it;
          return {
            ...it,
            cliente: String(aplicado.cliente ?? it.cliente ?? ""),
            // "" = sin vincular. El endpoint guarda NULL; en pantalla es lo mismo.
            cliente_codigo: String(aplicado.cliente_codigo ?? ""),
            direccion: String(aplicado.direccion ?? it.direccion ?? ""),
            empresa: String(aplicado.empresa ?? it.empresa ?? ""),
            facturas: String(aplicado.facturas ?? it.facturas ?? ""),
            bultos: Number(aplicado.bultos ?? it.bultos ?? 0),
          };
        });
        return { ...prev, guia_items: items };
      });
      showToast("Envío corregido");
      return null;
    } catch {
      return "Sin conexión. Intenta de nuevo en unos segundos.";
    }
  }

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
      receptor_nombre: bReceptor,
      cedula: bCedula,
      firma_base64: firma1,
      firma_entregador_base64: firma2,
    };

    if (tipoDespacho === "externo") {
      payload.placa = bPlaca;
      payload.items_guia_transp = porLinea;
      // La columna de la guía NO se retira: la usan el buscador, el Excel y el
      // encabezado del papel. Se llena con el primer número que haya.
      payload.numero_guia_transp = numeroGuiaDeCabecera(numerosTransp);
    } else {
      // 🔴 EN ENTREGA DIRECTA NO HAY TRANSPORTISTA: es nuestro propio camión.
      // La placa y el N° del transportista no se piden en pantalla, así que
      // tampoco se escriben — y se mandan VACÍOS a propósito, no se omiten: si
      // alguien empezó a llenarlos en modo externo y después tocó "cambiar",
      // omitirlos dejaría esa placa ajena pegada a una guía que salió con
      // nuestro camión. Eso es justo la mentira que este cambio vino a sacar.
      payload.placa = "";
      payload.numero_guia_transp = "";
      payload.items_guia_transp = items
        .map((it) => ({ id: it.id, numero_guia_transp: "" }))
        .filter((r): r is { id: string; numero_guia_transp: string } => !!r.id);
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
    juegos, usarJuego,
    numerosTransp, setNumeroTransp,
    corregirItem,
    bSaving, confirmarDespacho,
    pendingFirma1, setPendingFirma1,
    pendingFirma2, setPendingFirma2,
  };
}
