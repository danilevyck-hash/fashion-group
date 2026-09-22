"use client";

/**
 * LAS CUATRO ACCIONES DE UN CHEQUE — depositar · rebotado · re-depositar ·
 * eliminar. Salieron de `RecordatoriosClient.tsx` el 22-sep-2026, cuando la
 * puerta única empujó al orquestador por encima del límite de 800 líneas de la
 * casa. **Es una mudanza: no cambió ni una regla.**
 *
 * Las cuatro comparten la misma forma, que es el patrón de la casa:
 *
 *   1. Se toma una FOTO de la lista (`snapshot`).
 *   2. Se pinta el cambio al instante (UI optimista).
 *   3. Se programa la escritura con **5 segundos para deshacer**
 *      (`useUndoAction`); si el servidor la rechaza, se vuelve a la foto y se
 *      dice por qué, en castellano.
 *
 * 🔴 **La nota a CXC del rebotado es SECUNDARIA**: si falla, se avisa pero el
 * cheque queda rebotado igual. Al revés —revertir el rebote porque no se pudo
 * escribir una nota— sería perder el dato que importa por el que acompaña.
 *
 * 🔴 **Un cheque que no se va a cobrar SE BORRA** (Daniel: *«no lo quiero
 * marcar»*): no existe ningún estado de «no se cobró».
 */

import { fmt } from "@/lib/format";
import { CARTERA_GRUPO } from "@/lib/cxc/cartera";
import type { useUndoAction } from "@/lib/hooks/useUndoAction";
import type { Cheque } from "./RecordatoriosClient";

interface Entorno {
  cheques: Cheque[];
  setCheques: React.Dispatch<React.SetStateAction<Cheque[]>>;
  /** HOY en fecha de Panamá, del servidor. Nunca `new Date()`. */
  hoy: string;
  showToast: (msg: string) => void;
  /** El programador de «deshacer en 5 s» de la casa. Se toma SU tipo, no uno
   *  copiado: dos firmas de lo mismo se separan con el tiempo. */
  scheduleAction: ReturnType<typeof useUndoAction>["scheduleAction"];
  loadCheques: () => Promise<void> | void;
  /** La ruta de la tabla del motivo «cheque». Sale del registro de motivos. */
  ruta: string;
  motivoRebote: string;
  cerrarRebote: () => void;
  setConfirmDepositId: (id: string | null) => void;
}

export interface AccionesCheque {
  depositar: (id: string) => void;
  marcarRebotado: (id: string) => Promise<void>;
  redepositar: (id: string) => void;
  deleteCheque: (id: string) => void;
}

export function useAccionesCheque(e: Entorno): AccionesCheque {
  const {
    cheques, setCheques, hoy, showToast, scheduleAction, loadCheques, ruta,
    motivoRebote, cerrarRebote, setConfirmDepositId,
  } = e;

  function depositar(id: string) {
    const cheque = cheques.find((c) => c.id === id);
    if (!cheque) return;
    const snapshot = [...cheques];
    setCheques((prev) =>
      prev.map((c) => (c.id === id ? { ...c, estado: "depositado", fecha_depositado: hoy } : c)),
    );
    setConfirmDepositId(null);
    scheduleAction({
      id: `deposit-${id}`,
      message: `Cheque N° ${cheque.numero_cheque} depositado`,
      execute: async () => {
        try {
          const res = await fetch(`${ruta}/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ estado: "depositado", fecha_depositado: hoy }),
          });
          if (!res.ok) {
            setCheques(snapshot);
            showToast("No se pudo depositar. Intenta de nuevo.");
          }
        } catch {
          setCheques(snapshot);
          showToast("Sin conexión. Intenta de nuevo.");
        }
      },
      onRevert: () => setCheques(snapshot),
    });
  }

  async function marcarRebotado(id: string) {
    const cheque = cheques.find((c) => c.id === id);
    if (!cheque) return;
    const snapshot = [...cheques];
    const motivo = motivoRebote || null;
    setCheques((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, estado: "rebotado", motivo_rebote: motivo || undefined } : c,
      ),
    );
    cerrarRebote();
    scheduleAction({
      id: `rebotado-${id}`,
      message: `Cheque N° ${cheque.numero_cheque} marcado como rebotado`,
      execute: async () => {
        try {
          const res = await fetch(`${ruta}/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ estado: "rebotado", motivo_rebote: motivo }),
          });
          if (!res.ok) {
            setCheques(snapshot);
            showToast("No se pudo marcar como rebotado. Intenta de nuevo.");
            return;
          }
          // La nota a CXC es SECUNDARIA: el cheque ya quedó rebotado. Si falla,
          // se avisa pero NO se revierte el rebotado.
          const nombre = cheque.cliente.toUpperCase().trim();
          const linea = `⚠ Cheque rebotado ${hoy}: N° ${cheque.numero_cheque} por $${fmt(cheque.monto)} — ${motivo || "Sin motivo"}`;
          let previo = "";
          try {
            const existingRes = await fetch(`/api/overrides?cartera=${CARTERA_GRUPO}`, {
              cache: "no-store",
            });
            if (existingRes.ok) {
              const all: Array<{ nombre_normalized: string; resultado_contacto?: string | null }> =
                await existingRes.json();
              previo = (all.find((o) => o.nombre_normalized === nombre)?.resultado_contacto || "").trim();
            }
          } catch {
            /* si falla el GET, escribimos solo la línea nueva */
          }
          try {
            const ovRes = await fetch("/api/overrides", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                nombre_normalized: nombre,
                resultado_contacto: previo ? `${previo}\n${linea}` : linea,
                cartera: CARTERA_GRUPO,
              }),
            });
            if (!ovRes.ok) showToast("Cheque rebotado, pero no se pudo registrar la nota en CXC.");
          } catch {
            showToast("Cheque rebotado, pero no se pudo registrar la nota en CXC.");
          }
          loadCheques();
        } catch {
          setCheques(snapshot);
          showToast("Error de conexión. Intenta de nuevo.");
        }
      },
      onRevert: () => setCheques(snapshot),
    });
  }

  function redepositar(id: string) {
    const cheque = cheques.find((c) => c.id === id);
    if (!cheque) return;
    const snapshot = [...cheques];
    const notaExtra = `Re-depósito desde rebote (${hoy})`;
    const notas = cheque.notas ? `${cheque.notas}\n${notaExtra}` : notaExtra;
    setCheques((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, estado: "pendiente", motivo_rebote: undefined, notas } : c,
      ),
    );
    scheduleAction({
      id: `redepositar-${id}`,
      message: `Cheque N° ${cheque.numero_cheque} re-depositado`,
      execute: async () => {
        try {
          const res = await fetch(`${ruta}/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ estado: "pendiente", motivo_rebote: null, notas }),
          });
          if (!res.ok) {
            setCheques(snapshot);
            showToast("No se pudo re-depositar. Intenta de nuevo.");
          }
        } catch {
          setCheques(snapshot);
          showToast("Error de conexión. Intenta de nuevo.");
        }
      },
      onRevert: () => setCheques(snapshot),
    });
  }

  function deleteCheque(id: string) {
    const cheque = cheques.find((c) => c.id === id);
    if (!cheque) return;
    const snapshot = [...cheques];
    setCheques((prev) => prev.filter((c) => c.id !== id));
    scheduleAction({
      id: `delete-${id}`,
      message: `Cheque N° ${cheque.numero_cheque} eliminado`,
      execute: async () => {
        try {
          const res = await fetch(`${ruta}/${id}`, { method: "DELETE" });
          if (!res.ok) {
            setCheques(snapshot);
            showToast("No se pudo eliminar. Intenta de nuevo.");
          }
        } catch {
          setCheques(snapshot);
          showToast("Sin conexión. Verifica tu internet e intenta de nuevo.");
        }
      },
      onRevert: () => setCheques(snapshot),
    });
  }

  return { depositar, marcarRebotado, redepositar, deleteCheque };
}
