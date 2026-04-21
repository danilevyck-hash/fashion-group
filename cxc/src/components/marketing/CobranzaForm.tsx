"use client";

import { useMemo, useState, useEffect } from "react";
import type {
  MkMarca,
  MkFactura,
  ProyectoConMarcas,
} from "@/lib/marketing/types";
import { useToast } from "@/components/ToastSystem";
import { PasoInstruccion } from "./PasoInstruccion";
import { formatearMonto } from "@/lib/marketing/normalizar";

interface CobranzaFormValues {
  marcaId: string;
  monto: number;
  emailDestino: string;
  asunto: string;
  cuerpo: string;
}

interface CobranzaFormProps {
  proyecto: ProyectoConMarcas;
  marcas: MkMarca[];
  facturas: MkFactura[];
  defaultMarcaId?: string;
  onSubmit: (data: CobranzaFormValues) => Promise<{ cobranzaId: string }>;
}

function generarAsuntoDefault(proyecto: ProyectoConMarcas, marca?: MkMarca) {
  if (!marca) return "";
  return `Cobro de marketing — ${proyecto.tienda}${
    proyecto.nombre ? " · " + proyecto.nombre : ""
  } (${marca.nombre})`;
}

function generarCuerpoDefault(
  proyecto: ProyectoConMarcas,
  marca: MkMarca | undefined,
  monto: number
) {
  if (!marca) return "";
  return [
    `Hola,`,
    ``,
    `Adjunto el cobro de marketing correspondiente al proyecto ${proyecto.tienda}${
      proyecto.nombre ? " — " + proyecto.nombre : ""
    }.`,
    ``,
    `Marca: ${marca.nombre}`,
    `Monto a cobrar: ${formatearMonto(monto)}`,
    ``,
    `En el ZIP adjunto encontrarás las facturas, fotos del proyecto y el desglose.`,
    ``,
    `Gracias,`,
    `Fashion Group`,
  ].join("\n");
}

export function CobranzaForm({
  proyecto,
  marcas,
  facturas,
  defaultMarcaId,
  onSubmit,
}: CobranzaFormProps) {
  const { toast } = useToast();

  const marcasProyecto = proyecto.marcas;
  const unaSola = marcasProyecto.length === 1;
  const initialMarcaId =
    defaultMarcaId ??
    (unaSola ? marcasProyecto[0].marca.id : marcasProyecto[0]?.marca.id ?? "");

  const [marcaId, setMarcaId] = useState<string>(initialMarcaId);
  const [montoStr, setMontoStr] = useState<string>("");
  const [emailDestino, setEmailDestino] = useState<string>("");
  const [asunto, setAsunto] = useState<string>("");
  const [cuerpo, setCuerpo] = useState<string>("");
  const [enviando, setEnviando] = useState(false);
  const [montoEditado, setMontoEditado] = useState(false);
  const [asuntoEditado, setAsuntoEditado] = useState(false);
  const [cuerpoEditado, setCuerpoEditado] = useState(false);

  const marca = useMemo(
    () => marcas.find((m) => m.id === marcaId),
    [marcas, marcaId]
  );

  const porcentajeMarca = useMemo(() => {
    return (
      marcasProyecto.find((m) => m.marca.id === marcaId)?.porcentaje ?? 0
    );
  }, [marcasProyecto, marcaId]);

  const montoCalculado = useMemo(() => {
    const facturasVigentes = facturas.filter((f) => f.anulado_en === null);
    const subtotalTotal = facturasVigentes.reduce(
      (acc, f) => acc + (Number(f.subtotal) || 0),
      0
    );
    return (subtotalTotal * porcentajeMarca) / 100;
  }, [facturas, porcentajeMarca]);

  // Auto-fill monto si el usuario no lo editó
  useEffect(() => {
    if (!montoEditado) {
      setMontoStr(montoCalculado.toFixed(2));
    }
  }, [montoCalculado, montoEditado]);

  const monto = Number(montoStr) || 0;

  // Auto-fill asunto y cuerpo si el usuario no los editó
  useEffect(() => {
    if (!asuntoEditado) setAsunto(generarAsuntoDefault(proyecto, marca));
  }, [proyecto, marca, asuntoEditado]);

  useEffect(() => {
    if (!cuerpoEditado) {
      setCuerpo(generarCuerpoDefault(proyecto, marca, monto));
    }
  }, [proyecto, marca, monto, cuerpoEditado]);

  const marcaOk = Boolean(marcaId);
  const emailOk =
    emailDestino.length === 0 || /.+@.+\..+/.test(emailDestino.trim());
  const puedeContinuar =
    marcaOk && monto > 0 && asunto.trim().length > 0 && !enviando && emailOk;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeContinuar) return;
    try {
      setEnviando(true);
      await onSubmit({
        marcaId,
        monto,
        emailDestino: emailDestino.trim(),
        asunto,
        cuerpo,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo crear la cobranza. Intenta de nuevo.";
      toast(message, "error");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PasoInstruccion
        numero={1}
        titulo="Selecciona la marca a cobrar"
        descripcion={
          unaSola
            ? "Este proyecto solo tiene una marca, ya está seleccionada."
            : "Elige la marca a la que le vas a enviar este cobro."
        }
        completado={marcaOk}
      >
        <select
          value={marcaId}
          onChange={(e) => setMarcaId(e.target.value)}
          disabled={unaSola}
          aria-label="Marca"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none bg-white disabled:bg-gray-50"
        >
          {marcasProyecto.map((m) => (
            <option key={m.marca.id} value={m.marca.id}>
              {m.marca.nombre} ({m.porcentaje}%)
            </option>
          ))}
        </select>
      </PasoInstruccion>

      <PasoInstruccion
        numero={2}
        titulo="Revisa el monto"
        descripcion="Se calcula como la suma de subtotales de las facturas vigentes multiplicada por el % de la marca. Puedes ajustarlo si hace falta."
        completado={monto > 0}
      >
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label
              htmlFor="cobranza-monto"
              className="block text-sm text-gray-600 mb-1"
            >
              Monto a cobrar
            </label>
            <input
              id="cobranza-monto"
              type="number"
              min={0}
              step="0.01"
              value={montoStr}
              onChange={(e) => {
                setMontoStr(e.target.value);
                setMontoEditado(true);
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-black focus:outline-none"
            />
          </div>
          {montoEditado && (
            <button
              type="button"
              onClick={() => setMontoEditado(false)}
              className="text-xs text-gray-600 underline self-end mb-2"
            >
              Usar calculado
            </button>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Calculado: {formatearMonto(montoCalculado)}
        </div>
      </PasoInstruccion>

      <PasoInstruccion
        numero={3}
        titulo="Escribe asunto y cuerpo"
        descripcion="Prellenamos un texto estándar, edítalo si quieres."
        completado={asunto.trim().length > 0 && cuerpo.trim().length > 0}
      >
        <div className="space-y-3">
          <div>
            <label
              htmlFor="cobranza-asunto"
              className="block text-sm text-gray-600 mb-1"
            >
              Asunto
            </label>
            <input
              id="cobranza-asunto"
              type="text"
              value={asunto}
              onChange={(e) => {
                setAsunto(e.target.value);
                setAsuntoEditado(true);
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="cobranza-cuerpo"
              className="block text-sm text-gray-600 mb-1"
            >
              Cuerpo
            </label>
            <textarea
              id="cobranza-cuerpo"
              rows={8}
              value={cuerpo}
              onChange={(e) => {
                setCuerpo(e.target.value);
                setCuerpoEditado(true);
              }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-black focus:outline-none"
            />
          </div>
        </div>
      </PasoInstruccion>

      <PasoInstruccion
        numero={4}
        titulo="Email destino"
        descripcion="A dónde enviarás el cobro (solo informativo, tú lo envías manualmente desde Outlook)."
        completado={emailDestino.length > 0 && emailOk}
      >
        <input
          type="email"
          value={emailDestino}
          onChange={(e) => setEmailDestino(e.target.value)}
          placeholder="ej: marketing@tommy.com"
          aria-label="Email destino"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
        />
        {!emailOk && (
          <div className="text-xs text-red-600 mt-1">
            Revisa el email, no parece válido.
          </div>
        )}
      </PasoInstruccion>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!puedeContinuar}
          className="rounded-md bg-black text-white px-3 py-2 text-sm active:scale-[0.97] transition disabled:opacity-50"
        >
          {enviando ? "Guardando…" : "Continuar a descarga y envío"}
        </button>
      </div>
    </form>
  );
}

export default CobranzaForm;
