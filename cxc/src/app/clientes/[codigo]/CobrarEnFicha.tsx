"use client";

// ─────────────────────────────────────────────────────────────────────────────
// «COBRAR» Y «VER LOS N DOCUMENTOS» DESDE LA FICHA DEL CLIENTE.
//
// 🔴 SON LOS MISMOS DOS COMPONENTES DEL CXC, no unos nuevos: `HojaCobrar` (las
// cuatro salidas, con el correo a un clic y su deshacer de 5 segundos) y
// `EstadoCuentaDrawer` (el cajón con los documentos). Este archivo solo los
// enchufa a los datos que la ficha ya tiene. Dibujar una segunda hoja de cobro
// habría sido una segunda que mantener igual a mano — que es exactamente lo que
// el rediseño del CXC acaba de terminar de borrar (había SEIS puertas).
//
// 🔴 SOLO SE MUESTRA A QUIEN TIENE CUENTAS POR COBRAR. La ficha la abre TODO el
// mundo —es su gracia: es la única página sobre un cliente que ven todos los
// roles— pero las tres rutas que hay detrás (`/api/cxc/enviar-email`,
// `/api/cxc/estado-cuenta/…`, `/api/cxc/envios`) contestan 403 a bodega. Un
// botón que siempre falla es peor que no tener el botón, así que la ficha lo
// esconde: quien decide es `puedeCobrar`, que le pasa el que dibuja.
//
// ⚠️ «Escribirlo yo» (el formulario completo con destinatario, asunto y cuerpo
// editables) vive en Cuentas por Cobrar y NO se replica acá: lleva al módulo
// con el cliente ya buscado. Es un camino menos usado y duplicar ese modal
// habría sido la tercera copia de la misma pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HojaCobrar, { type CorreoProgramado } from "@/app/cxc/components/HojaCobrar";
import EstadoCuentaDrawer from "@/app/cxc/components/EstadoCuentaDrawer";
import UndoToast from "@/components/UndoToast";
import { Toast } from "@/components/ui";
import { useUndoAction } from "@/lib/hooks/useUndoAction";
import { waHref } from "@/lib/contact-links";
import { clienteParaCobrar, type DatosDeContacto, type FilaAgingCliente } from "@/lib/clientes/cliente-para-cobrar";
import { EMPRESA_KEY_TO_NOMBRE_CORTO } from "@/lib/empresa-mapping";
import { dinero } from "@/lib/clientes/ficha";

export interface CobrarEnFichaProps {
  datos: DatosDeContacto;
  aging: FilaAgingCliente[];
  /** ¿Está abierta la hoja «Cobrar»? Lo maneja quien dibuja el botón. */
  hojaAbierta: boolean;
  onCerrarHoja: () => void;
  /** ¿Está abierto el cajón de documentos? */
  cajonAbierto: boolean;
  onCerrarCajon: () => void;
  /** Abre la hoja desde el pie del cajón («Cobrar»). */
  onAbrirHoja: () => void;
}

/**
 * El mensaje que se copia o se manda por WhatsApp.
 *
 * 🔴 ESTE TEXTO LO LEE EL CLIENTE, así que le rige la MISMA regla que al correo
 * de estado de cuenta: **la palabra «vencido» está PROHIBIDA**. `dias` es la
 * EDAD del documento desde su emisión, no días de mora — no sabemos el plazo de
 * crédito de cada factura, así que llamar «vencido» a uno de 121 días es
 * afirmar algo que el dato no dice. Se rotula por ANTIGÜEDAD, igual que el
 * correo aprobado.
 */
function mensajeDeCobro(nombre: string, porEmpresa: [string, number][], total: number, contacto: string): string {
  const lineas: string[] = [
    contacto ? `Estimado/a ${contacto},` : "Estimado/a cliente,",
    "",
    "Le escribimos de Fashion Group para informarle sobre su estado de cuenta actualizado.",
    "",
    `Estado de Cuenta - ${nombre}`,
    "",
  ];
  for (const [empresa, monto] of porEmpresa) {
    if (monto === 0) continue;
    lineas.push(`${EMPRESA_KEY_TO_NOMBRE_CORTO[empresa] ?? empresa}: ${dinero(monto)}`);
  }
  lineas.push("", `Total: ${dinero(total)}`, "", "Quedamos atentos. Gracias por su preferencia.");
  return lineas.join("\n");
}

export default function CobrarEnFicha({
  datos,
  aging,
  hojaAbierta,
  onCerrarHoja,
  cajonAbierto,
  onCerrarCajon,
  onAbrirHoja,
}: CobrarEnFichaProps) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const { scheduleAction, undoAction, pendingUndo } = useUndoAction();

  const client = useMemo(() => clienteParaCobrar(datos, aging), [datos, aging]);

  const avisar = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  /** Anota que se contactó al cliente. Falla ABIERTO: no se le rompe el cobro a
   *  nadie porque una anotación no entró. */
  const anotar = useCallback((canal: "whatsapp" | "copia") => {
    fetch("/api/cxc/envios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codigo: datos.codigo,
        canal,
        destinatario: canal === "whatsapp" ? (datos.celular || datos.telefono || "") : "",
      }),
    }).catch(() => { /* la marca es una ayuda, no un número de plata */ });
  }, [datos.codigo, datos.celular, datos.telefono]);

  const cuerpo = useCallback(() => {
    const porEmpresa = Object.entries(client.companies)
      .map(([k, c]) => [k, c.total] as [string, number])
      .filter(([, t]) => t !== 0);
    return mensajeDeCobro(client.nombre_normalized, porEmpresa, client.total, client.contacto);
  }, [client]);

  return (
    <>
      <EstadoCuentaDrawer
        client={cajonAbierto ? client : null}
        companyFilter="all"
        onClose={onCerrarCajon}
        onCobrar={() => { onCerrarCajon(); onAbrirHoja(); }}
      />

      <HojaCobrar
        client={hojaAbierta ? client : null}
        onClose={onCerrarHoja}
        onProgramarCorreo={(d: CorreoProgramado) =>
          scheduleAction({
            id: `ficha-correo-${d.codigo}`,
            message: `Correo enviado a ${d.destinatario}`,
            execute: async () => {
              const res = await fetch("/api/cxc/enviar-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(d),
              });
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                avisar(body?.error || "No se pudo enviar el correo. Intenta de nuevo en unos segundos.");
              }
            },
          })
        }
        onWhatsApp={() => {
          const href = waHref(datos.celular || datos.telefono, cuerpo());
          if (!href) { avisar("Este cliente no tiene teléfono — cárgalo aquí abajo, en Contacto."); return; }
          window.open(href, "_blank");
          anotar("whatsapp");
        }}
        onCopiar={() => {
          navigator.clipboard
            .writeText(`Estado de Cuenta - ${client.nombre_normalized} - Fashion Group\n\n${cuerpo()}`)
            .then(() => { avisar("Mensaje copiado — pégalo en WhatsApp o correo"); anotar("copia"); })
            .catch(() => avisar("No se pudo copiar. Intenta de nuevo."));
        }}
        onEscribirloYo={() => {
          // El formulario completo vive en Cuentas por Cobrar. Se llega con el
          // cliente ya buscado, no a la lista pelada.
          router.push(`/cxc?search=${encodeURIComponent(datos.nombre)}`);
        }}
        marcaEnvio={null}
      />

      {pendingUndo && (
        <UndoToast message={pendingUndo.message} startedAt={pendingUndo.startedAt} onUndo={undoAction} />
      )}
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
