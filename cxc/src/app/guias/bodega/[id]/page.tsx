"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface GuiaItem { cliente: string; direccion: string; empresa: string; facturas: string; bultos: number; }
interface Guia { id: string; numero: number; fecha: string; transportista: string; guia_items: GuiaItem[]; }

export default function BodegaPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  const [guia, setGuia] = useState<Guia | null>(null);
  const [loading, setLoading] = useState(true);
  const [placa, setPlaca] = useState("");
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role");
    if (!r) { router.push("/"); return; }
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/guias/${id}`);
      if (res.ok) setGuia(await res.json());
      else router.push("/guias");
    } catch { router.push("/guias"); }
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  // Canvas drawing
  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
    return { x: (e as React.MouseEvent).clientX - r.left, y: (e as React.MouseEvent).clientY - r.top };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault(); setDrawing(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  }, [getPos]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing) return; e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke();
  }, [drawing, getPos]);

  const stopDraw = useCallback(() => setDrawing(false), []);

  function clearSig() {
    const c = canvasRef.current; if (!c) return;
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
  }

  async function save() {
    if (!placa.trim() || !nombre.trim()) {
      setToast("Placa y nombre son requeridos"); setTimeout(() => setToast(null), 2500); return;
    }
    setSaving(true);
    try {
      const firma = canvasRef.current?.toDataURL("image/png") || null;
      const res = await fetch(`/api/guias/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: placa.trim(), nombre_entregador: nombre.trim(), cedula_entregador: cedula.trim(),
          observaciones: obs, firma_transportista: firma, estado: "Listo para Imprimir",
        }),
      });
      if (!res.ok) { setToast("Error al guardar"); setTimeout(() => setToast(null), 2500); setSaving(false); return; }

      // Send notification
      const items = guia?.guia_items || [];
      const totalBultos = items.reduce((s, i) => s + (i.bultos || 0), 0);
      await fetch("/api/guias/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `✅ Guía #${guia?.numero} Lista para Imprimir — ${guia?.transportista}`,
          body: `
            <h2 style="color:#1b3a5c">Guía #${guia?.numero} — Lista para Imprimir</h2>
            <p><strong>Transportista:</strong> ${guia?.transportista}</p>
            <p><strong>Placa:</strong> ${placa}</p>
            <p><strong>Entregador:</strong> ${nombre} — Cédula: ${cedula}</p>
            <p><strong>Total bultos:</strong> ${totalBultos}</p>
            ${obs ? `<p><strong>Observaciones:</strong> ${obs}</p>` : ""}
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <tr style="background:#1b3a5c;color:white"><th style="padding:6px;text-align:left">Cliente</th><th style="padding:6px">Dirección</th><th style="padding:6px">Bultos</th></tr>
              ${items.map(i => `<tr style="border-bottom:1px solid #eee"><td style="padding:6px">${i.cliente}</td><td style="padding:6px">${i.direccion}</td><td style="padding:6px;text-align:center">${i.bultos}</td></tr>`).join("")}
            </table>
            <p style="color:#999;font-size:12px;margin-top:16px">La firma del transportista está guardada en el sistema.</p>
          `,
        }),
      }).catch(() => {});

      setSaved(true);
    } catch { setToast("Error de conexión"); setTimeout(() => setToast(null), 2500); }
    setSaving(false);
  }

  if (loading || !guia) return null;

  if (saved) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Guía enviada</h1>
        <p className="text-gray-500 mb-6">Guía #{guia.numero} lista para imprimir</p>
        <Link href="/guias" className="text-sm text-gray-400 hover:text-black transition">← Volver a guías</Link>
      </div>
    );
  }

  const totalBultos = (guia.guia_items || []).reduce((s, i) => s + (i.bultos || 0), 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/guias" className="text-xs text-gray-400 hover:text-gray-700 transition">← Guías</Link>
      <h1 className="text-xl font-bold mt-1 mb-4">Bodega — Guía #{guia.numero}</h1>

      {/* Read-only guia info */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-gray-400 text-xs">Fecha</span><br/>{guia.fecha}</div>
          <div><span className="text-gray-400 text-xs">Transportista</span><br/>{guia.transportista}</div>
        </div>
        <div className="mt-3 space-y-2">
          {(guia.guia_items || []).map((it, i) => (
            <div key={i} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-gray-100">
              <div><span className="font-medium">{it.cliente}</span> <span className="text-gray-400">→ {it.direccion}</span></div>
              <span className="font-medium">{it.bultos} bultos</span>
            </div>
          ))}
        </div>
        <div className="text-right mt-2 text-sm font-medium">{totalBultos} bultos total</div>
      </div>

      {/* Bodega fields */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="text-[11px] text-gray-400 uppercase block mb-1">Placa del camión *</label>
          <input type="text" value={placa} onChange={e => setPlaca(e.target.value)} placeholder="Ej: AB-1234"
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base outline-none focus:ring-1 focus:ring-gray-300" />
        </div>
        <div>
          <label className="text-[11px] text-gray-400 uppercase block mb-1">Nombre del entregador *</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre completo"
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base outline-none focus:ring-1 focus:ring-gray-300" />
        </div>
        <div>
          <label className="text-[11px] text-gray-400 uppercase block mb-1">Cédula del entregador</label>
          <input type="text" value={cedula} onChange={e => setCedula(e.target.value)} placeholder="Cédula"
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base outline-none focus:ring-1 focus:ring-gray-300" />
        </div>
        <div>
          <label className="text-[11px] text-gray-400 uppercase block mb-1">Observaciones</label>
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-base outline-none focus:ring-1 focus:ring-gray-300 resize-none" />
        </div>
      </div>

      {/* Signature */}
      <div className="mb-6">
        <label className="text-[11px] text-gray-400 uppercase block mb-2">Firma del Transportista</label>
        <canvas ref={canvasRef} width={600} height={200}
          className="w-full h-[200px] border border-gray-300 rounded-lg bg-white touch-none"
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw} />
        <button onClick={clearSig} className="text-xs text-gray-400 hover:text-black mt-1">Limpiar firma</button>
      </div>

      {/* Save */}
      <button onClick={save} disabled={saving}
        className="w-full bg-black text-white py-4 rounded-lg text-sm font-bold uppercase tracking-wider hover:bg-gray-800 transition disabled:opacity-50 mb-4">
        {saving ? "Guardando..." : "Guardar y Enviar"}
      </button>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-black text-white px-5 py-2.5 rounded-full text-sm z-50 shadow-lg">{toast}</div>}
    </div>
  );
}
