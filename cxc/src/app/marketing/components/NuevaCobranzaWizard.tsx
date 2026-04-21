"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastSystem";
import { PasoInstruccion } from "@/components/marketing";
import { formatearMonto } from "@/lib/marketing/normalizar";
import type {
  MkCobranza,
  MkFactura,
  MkMarca,
  ProyectoConMarcas,
  FacturaConAdjuntos,
} from "@/lib/marketing/types";

interface ProyectoListado {
  id: string;
  nombre: string | null;
  tienda: string;
  estado: string;
}

export function NuevaCobranzaWizard() {
  const router = useRouter();
  const { toast } = useToast();

  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);

  const [proyectos, setProyectos] = useState<ProyectoListado[]>([]);
  const [loadingProyectos, setLoadingProyectos] = useState(true);

  const [proyectoId, setProyectoId] = useState("");
  const [proyecto, setProyecto] = useState<ProyectoConMarcas | null>(null);
  const [facturas, setFacturas] = useState<FacturaConAdjuntos[]>([]);
  const [cargandoProyecto, setCargandoProyecto] = useState(false);

  const [marcaId, setMarcaId] = useState("");

  const [montoStr, setMontoStr] = useState("");
  const [emailDestino, setEmailDestino] = useState("");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [creando, setCreando] = useState(false);

  // Cargar proyectos (solo abiertos o listos para cobrar)
  useEffect(() => {
    (async () => {
      setLoadingProyectos(true);
      try {
        const r = await fetch("/api/marketing/proyectos", {
          cache: "no-store",
        });
        if (!r.ok) throw new Error("No se pudieron cargar los proyectos");
        const data = (await r.json()) as ProyectoListado[];
        // Filtrar: no mostrar anulados ni ya cobrados
        const abiertos = data.filter((p) => p.estado !== "cobrado");
        setProyectos(abiertos);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Error al cargar proyectos";
        toast(msg, "error");
      } finally {
        setLoadingProyectos(false);
      }
    })();
  }, [toast]);

  // Al seleccionar proyecto, cargar detalle + facturas
  useEffect(() => {
    if (!proyectoId) {
      setProyecto(null);
      setFacturas([]);
      return;
    }
    (async () => {
      setCargandoProyecto(true);
      try {
        const [pr, fr] = await Promise.all([
          fetch(`/api/marketing/proyectos/${proyectoId}`, { cache: "no-store" }),
          fetch(`/api/marketing/proyectos/${proyectoId}/facturas`, {
            cache: "no-store",
          }),
        ]);
        if (!pr.ok) throw new Error("No se pudo cargar el proyecto");
        if (!fr.ok) throw new Error("No se pudieron cargar las facturas");
        const p = (await pr.json()) as ProyectoConMarcas;
        const f = (await fr.json()) as FacturaConAdjuntos[];
        setProyecto(p);
        setFacturas(f);
        // Si el proyecto tiene 1 sola marca, auto-seleccionar
        if (p.marcas.length === 1) setMarcaId(p.marcas[0].marca.id);
        else setMarcaId("");
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Error cargando detalle";
        toast(msg, "error");
      } finally {
        setCargandoProyecto(false);
      }
    })();
  }, [proyectoId, toast]);

  const marcasProyecto = proyecto?.marcas ?? [];
  const marcaSeleccionada: MkMarca | undefined = useMemo(
    () => marcasProyecto.find((m) => m.marca.id === marcaId)?.marca,
    [marcasProyecto, marcaId]
  );
  const porcentajeMarca = useMemo(
    () => marcasProyecto.find((m) => m.marca.id === marcaId)?.porcentaje ?? 0,
    [marcasProyecto, marcaId]
  );

  const facturasVigentes = useMemo<MkFactura[]>(
    () => facturas.filter((f) => f.anulado_en === null),
    [facturas]
  );

  const subtotalProyecto = useMemo(
    () => facturasVigentes.reduce((acc, f) => acc + Number(f.subtotal || 0), 0),
    [facturasVigentes]
  );

  const montoCalculado = useMemo(
    () => Number(((subtotalProyecto * porcentajeMarca) / 100).toFixed(2)),
    [subtotalProyecto, porcentajeMarca]
  );

  // Autofill monto cuando cambia marca/proyecto y el usuario no escribió
  useEffect(() => {
    if (paso <= 3) setMontoStr(montoCalculado.toFixed(2));
  }, [montoCalculado, paso]);

  const monto = Number(montoStr) || 0;
  const emailOk =
    emailDestino.length === 0 || /.+@.+\..+/.test(emailDestino.trim());

  const puedePaso2 = Boolean(proyectoId) && !cargandoProyecto;
  const puedePaso3 = puedePaso2 && Boolean(marcaId);
  const puedeCrear = puedePaso3 && monto > 0 && emailOk && !creando;

  const handleCrear = async () => {
    if (!puedeCrear || !proyecto || !marcaSeleccionada) return;
    setCreando(true);
    try {
      const res = await fetch("/api/marketing/cobranzas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proyectoId: proyecto.id,
          marcaId,
          monto,
          emailDestino: emailDestino.trim() || undefined,
          asunto: asunto.trim() || undefined,
          cuerpo: cuerpo.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: "" }))) as {
          error?: string;
        };
        throw new Error(body.error || "No se pudo crear la cobranza");
      }
      const data = (await res.json()) as MkCobranza;
      toast(`Cobranza ${data.numero} creada`, "success");
      // Ir directo al detalle para ejecutar descarga + envío manual
      router.push(`/marketing/cobranzas/${data.id}`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error al crear la cobranza";
      toast(msg, "error");
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Paso 1: Proyecto */}
      <PasoInstruccion
        numero={1}
        titulo="Elige el proyecto"
        descripcion="Solo se muestran proyectos abiertos o listos para cobrar."
        completado={Boolean(proyectoId)}
      >
        {loadingProyectos ? (
          <div className="text-sm text-gray-500">Cargando proyectos…</div>
        ) : (
          <select
            value={proyectoId}
            onChange={(e) => {
              setProyectoId(e.target.value);
              setPaso(2);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:border-black focus:outline-none"
          >
            <option value="">— Selecciona un proyecto —</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.nombre || p.tienda) +
                  (p.tienda && p.nombre ? ` · ${p.tienda}` : "")}
              </option>
            ))}
          </select>
        )}
      </PasoInstruccion>

      {/* Paso 2: Marca */}
      <PasoInstruccion
        numero={2}
        titulo="Elige la marca a cobrar"
        descripcion={
          proyecto && proyecto.marcas.length === 1
            ? "Este proyecto solo tiene una marca, ya está seleccionada."
            : "Solo podrás elegir marcas asignadas al proyecto."
        }
        completado={Boolean(marcaId)}
      >
        {cargandoProyecto ? (
          <div className="text-sm text-gray-500">Cargando marcas…</div>
        ) : !proyecto ? (
          <div className="text-sm text-gray-400">
            Selecciona un proyecto primero.
          </div>
        ) : (
          <select
            value={marcaId}
            onChange={(e) => setMarcaId(e.target.value)}
            disabled={proyecto.marcas.length === 1}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:border-black focus:outline-none disabled:bg-gray-50"
          >
            <option value="">— Selecciona la marca —</option>
            {proyecto.marcas.map((m) => (
              <option key={m.marca.id} value={m.marca.id}>
                {m.marca.nombre} ({m.porcentaje}%)
              </option>
            ))}
          </select>
        )}
      </PasoInstruccion>

      {/* Paso 3: Monto + asunto/cuerpo/email */}
      <PasoInstruccion
        numero={3}
        titulo="Revisa el monto y redacta el email"
        descripcion="Calculamos el monto como subtotal de facturas × % de la marca."
        completado={monto > 0 && emailOk}
      >
        {!marcaSeleccionada ? (
          <div className="text-sm text-gray-400">Elige la marca primero.</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="border border-gray-200 rounded-md p-3">
                <div className="text-xs text-gray-500">Facturas vigentes</div>
                <div className="text-lg font-semibold tabular-nums">
                  {facturasVigentes.length}
                </div>
              </div>
              <div className="border border-gray-200 rounded-md p-3">
                <div className="text-xs text-gray-500">Subtotal proyecto</div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatearMonto(subtotalProyecto)}
                </div>
              </div>
              <div className="border border-gray-200 rounded-md p-3">
                <div className="text-xs text-gray-500">
                  Participación {marcaSeleccionada.nombre}
                </div>
                <div className="text-lg font-semibold tabular-nums">
                  {porcentajeMarca.toFixed(2)}%
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Monto a cobrar
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={montoStr}
                onChange={(e) => setMontoStr(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-black focus:outline-none"
              />
              <div className="text-xs text-gray-500 mt-1">
                Calculado: {formatearMonto(montoCalculado)}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Email destino (opcional)
              </label>
              <input
                type="email"
                value={emailDestino}
                onChange={(e) => setEmailDestino(e.target.value)}
                placeholder="marketing@marca.com"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              />
              {!emailOk && (
                <div className="text-xs text-red-600 mt-1">
                  Revisa el email, no parece válido.
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Asunto (opcional)
              </label>
              <input
                type="text"
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                placeholder="Cobranza coop — Tienda — Marca"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Cuerpo (opcional)
              </label>
              <textarea
                rows={5}
                value={cuerpo}
                onChange={(e) => setCuerpo(e.target.value)}
                placeholder="Si lo dejas vacío usaremos una plantilla estándar al descargar el ZIP."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-black focus:outline-none"
              />
            </div>
          </div>
        )}
      </PasoInstruccion>

      {/* Paso 4: Crear (y navegar al detalle) */}
      <PasoInstruccion
        numero={4}
        titulo="Crea la cobranza"
        descripcion="Quedará en borrador. En el detalle podrás descargar el ZIP y marcarla como enviada."
      >
        {!marcaSeleccionada || !proyecto ? (
          <div className="text-sm text-gray-400">
            Completa los pasos anteriores.
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCrear}
              disabled={!puedeCrear}
              className="rounded-md bg-fuchsia-600 text-white px-4 py-2 text-sm font-medium hover:bg-fuchsia-700 active:scale-[0.97] transition disabled:opacity-50"
            >
              {creando ? "Creando…" : "Crear cobranza"}
            </button>
          </div>
        )}
      </PasoInstruccion>
    </div>
  );
}

export default NuevaCobranzaWizard;
