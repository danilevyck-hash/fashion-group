"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import { Toast } from "@/components/ui";
import { EMPRESAS } from "@/lib/companies";

interface GuiaItem { orden: number; cliente: string; direccion: string; empresa: string; facturas: string; bultos: number; }

const TRANSPORTISTAS = ["RedNblue", "Mojica", "Transporte Sol", "Sanjur"];
const CLIENTES = ["City Mall", "La Frontera Duty Free", "Jerusalem de Panama", "Plaza Los Angeles", "Golden Mall", "Multi Fashion Holding", "Kheriddine", "Bouti S.A.", "Jerusalem Duty Free", "Outlet Duty Free N2", "Outlet Duty Free N3", "Sporting Shoes N4"];
const DIRECCIONES = ["Paso Canoas", "David", "Santiago", "Guabito", "Changinola"];

export default function NuevaGuiaMovil() {
  const { authChecked } = useAuth({ moduleKey: "guias", allowedRoles: ["admin","secretaria","bodega"] });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [transportista, setTransportista] = useState("");
  const [placa, setPlaca] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [montoTotal, setMontoTotal] = useState(0);
  const [items, setItems] = useState<GuiaItem[]>([{ orden: 1, cliente: "", direccion: "", empresa: EMPRESAS[0], facturas: "", bultos: 0 }]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ numero: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Canvas drawing
  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setDrawing(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [getPos]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
  }, [drawing, getPos]);

  const stopDraw = useCallback(() => setDrawing(false), []);

  if (!authChecked) return null;

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }

  function addItem() {
    setItems(prev => [...prev, { orden: prev.length + 1, cliente: "", direccion: "", empresa: EMPRESAS[0], facturas: "", bultos: 0 }]);
  }

  function updateItem(idx: number, field: keyof GuiaItem, value: string | number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, orden: i + 1 })));
  }

  async function saveGuia() {
    if (!transportista) { setToast("Selecciona un transportista"); setTimeout(() => setToast(null), 2500); return; }
    const validItems = items.filter(i => i.cliente && i.bultos > 0);
    if (validItems.length === 0) { setToast("Agrega al menos un envío"); setTimeout(() => setToast(null), 2500); return; }

    setSaving(true);
    try {
      const firma = canvasRef.current?.toDataURL("image/png") || null;
      const res = await fetch("/api/guias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha, transportista, placa, observaciones,
          monto_total: montoTotal, estado: "Preparando",
          firma_transportista: firma,
          items: validItems.map(i => ({
            cliente: i.cliente, direccion: i.direccion, empresa: i.empresa,
            facturas: i.facturas, bultos: i.bultos,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSaved({ numero: data.numero || 0 });
      } else {
        setToast("Error al guardar"); setTimeout(() => setToast(null), 2500);
      }
    } catch { setToast("Error de conexión"); setTimeout(() => setToast(null), 2500); }
    setSaving(false);
  }

  async function downloadPDF() {
    const { jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable = autoTableModule.default;
    const doc = new jsPDF("portrait");

    doc.setFillColor(27, 58, 92);
    doc.rect(0, 0, 210, 20, "F");
    doc.setFontSize(13); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold");
    doc.text("Fashion Group — Guía de Transporte", 14, 13);
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(fecha, 196, 13, { align: "right" });

    doc.setTextColor(30, 30, 30); doc.setFontSize(10);
    let y = 28;
    doc.text(`Transportista: ${transportista}`, 14, y);
    doc.text(`Placa: ${placa}`, 120, y); y += 7;
    if (observaciones) { doc.text(`Observaciones: ${observaciones}`, 14, y); y += 7; }
    if (montoTotal > 0) { doc.text(`Monto Total: $${montoTotal.toFixed(2)}`, 14, y); y += 7; }

    const validItems = items.filter(i => i.cliente && i.bultos > 0);
    autoTable(doc, {
      startY: y + 2,
      head: [["#", "Cliente", "Dirección", "Empresa", "Facturas", "Bultos"]],
      body: validItems.map((it, i) => [i + 1, it.cliente, it.direccion, it.empresa, it.facturas, it.bultos]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [27, 58, 92] },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fy = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(`Total bultos: ${validItems.reduce((s, i) => s + i.bultos, 0)}`, 14, fy);

    // Signature
    const firma = canvasRef.current?.toDataURL("image/png");
    if (firma) {
      fy += 12;
      doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
      doc.text("Firma del Transportista:", 14, fy);
      try { doc.addImage(firma, "PNG", 14, fy + 2, 60, 30); } catch { /* */ }
    }

    doc.save(`guia-${fecha}.pdf`);
  }

  if (saved) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Guía guardada</h1>
        <p className="text-gray-500 mb-6">Guía #{saved.numero} creada exitosamente</p>
        <div className="flex flex-col gap-3 max-w-xs mx-auto">
          <button onClick={downloadPDF} className="w-full border border-black text-black py-3 rounded-lg text-sm font-medium hover:bg-gray-50 transition">Descargar PDF</button>
          <button onClick={() => { setSaved(null); setItems([{ orden: 1, cliente: "", direccion: "", empresa: EMPRESAS[0], facturas: "", bultos: 0 }]); setTransportista(""); setPlaca(""); setObservaciones(""); setMontoTotal(0); clearSignature(); }}
            className="w-full bg-black text-white py-3 rounded-lg text-sm font-medium hover:bg-gray-800 transition">Nueva guía</button>
          <Link href="/guias" className="text-sm text-gray-400 hover:text-black transition">← Volver a guías</Link>
        </div>
      </div>
    );
  }

  const totalBultos = items.reduce((s, i) => s + (i.bultos || 0), 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/guias" className="text-xs text-gray-400 hover:text-gray-700 transition">← Guías</Link>
          <h1 className="text-xl font-bold mt-1">Nueva Guía</h1>
        </div>
      </div>

      {/* Header fields */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="text-[11px] text-gray-400 uppercase block mb-1">Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base outline-none focus:ring-1 focus:ring-gray-300" />
        </div>
        <div>
          <label className="text-[11px] text-gray-400 uppercase block mb-1">Transportista *</label>
          <select value={transportista} onChange={e => setTransportista(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base outline-none focus:ring-1 focus:ring-gray-300 bg-white">
            <option value="">Seleccionar...</option>
            {TRANSPORTISTAS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-gray-400 uppercase block mb-1">Placa</label>
          <input type="text" value={placa} onChange={e => setPlaca(e.target.value)} placeholder="Ej: AB-1234"
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base outline-none focus:ring-1 focus:ring-gray-300" />
        </div>
        <div>
          <label className="text-[11px] text-gray-400 uppercase block mb-1">Monto Total ($)</label>
          <input type="number" step="1" min="0" value={montoTotal || ""} onChange={e => setMontoTotal(parseFloat(e.target.value) || 0)}
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base outline-none focus:ring-1 focus:ring-gray-300" />
        </div>
        <div>
          <label className="text-[11px] text-gray-400 uppercase block mb-1">Observaciones</label>
          <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base outline-none focus:ring-1 focus:ring-gray-300 resize-none" />
        </div>
      </div>

      {/* Items */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] text-gray-400 uppercase">Envíos ({items.length})</span>
          <button onClick={addItem} className="text-xs bg-black text-white px-3 py-1.5 rounded-lg">+ Agregar envío</button>
        </div>
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">Envío #{idx + 1}</span>
                {items.length > 1 && <button onClick={() => removeItem(idx)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <select value={item.cliente} onChange={e => updateItem(idx, "cliente", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-3 text-base bg-white">
                    <option value="">Cliente *</option>
                    {CLIENTES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <select value={item.direccion} onChange={e => updateItem(idx, "direccion", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-3 text-base bg-white">
                  <option value="">Dirección</option>
                  {DIRECCIONES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select value={item.empresa} onChange={e => updateItem(idx, "empresa", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-3 text-base bg-white">
                  {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <input type="text" value={item.facturas} onChange={e => updateItem(idx, "facturas", e.target.value)} placeholder="Facturas"
                  className="w-full border border-gray-200 rounded-lg px-3 py-3 text-base" />
                <input type="number" min={0} value={item.bultos || ""} onChange={e => updateItem(idx, "bultos", parseInt(e.target.value) || 0)} placeholder="Bultos *"
                  className="w-full border border-gray-200 rounded-lg px-3 py-3 text-base" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-gray-500 text-right">Total: <strong>{totalBultos}</strong> bultos</div>
      </div>

      {/* Signature */}
      <div className="mb-6">
        <label className="text-[11px] text-gray-400 uppercase block mb-2">Firma del Transportista</label>
        <canvas
          ref={canvasRef}
          width={600} height={200}
          className="w-full h-[200px] border border-gray-300 rounded-lg bg-white touch-none"
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        />
        <button onClick={clearSignature} className="text-xs text-gray-400 hover:text-black mt-1">Limpiar firma</button>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 mb-8">
        <button onClick={saveGuia} disabled={saving}
          className="w-full bg-black text-white py-4 rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-gray-800 transition disabled:opacity-50">
          {saving ? "Guardando..." : "Guardar Guía"}
        </button>
        <button onClick={downloadPDF} className="w-full border border-black text-black py-3 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
          Generar PDF
        </button>
      </div>

      <Toast message={toast} />
    </div>
  );
}
