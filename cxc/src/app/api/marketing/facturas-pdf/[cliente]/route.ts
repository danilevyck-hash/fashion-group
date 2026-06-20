import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { supabaseServer } from "@/lib/supabase-server";
import { esPathStorage } from "@/lib/marketing/storage";
import { verifyFacturasToken } from "@/lib/marketing/gallery-token";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // descargar + combinar PDFs del cliente

// GET /api/marketing/facturas-pdf/[cliente]?t=<token>
//
// Pública (exenta en middleware), token HMAC por cliente (scope "facturas").
// Devuelve UN PDF combinado con todas las facturas (PDF) del cliente, en orden
// por fecha, inline para verlas de corrido. Solo PDFs de facturas NO anuladas de
// proyectos NO anulados del cliente. Un PDF corrupto/ilegible se salta sin
// romper el combinado. No expone montos ni datos de otros clientes.

const BUCKET = "marketing";

async function descargar(path: string): Promise<Uint8Array | null> {
  try {
    if (esPathStorage(path)) {
      const { data, error } = await supabaseServer.storage.from(BUCKET).download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    }
    const res = await fetch(path);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { cliente: string } },
) {
  const codigo = decodeURIComponent(params.cliente);
  const token = req.nextUrl.searchParams.get("t");
  if (!verifyFacturasToken(codigo, token)) {
    return NextResponse.json({ error: "Enlace inválido" }, { status: 403 });
  }

  // Proyectos NO anulados del cliente.
  const { data: proys } = await supabaseServer
    .from("mk_proyectos")
    .select("id")
    .eq("tienda_codigo", codigo)
    .is("anulado_en", null);
  const proyIds = (proys ?? []).map((p) => String((p as { id: string }).id));
  if (proyIds.length === 0) {
    return NextResponse.json({ error: "Sin facturas" }, { status: 404 });
  }

  // Facturas NO anuladas, en orden por fecha.
  const { data: facts } = await supabaseServer
    .from("mk_facturas")
    .select("id, fecha_factura")
    .in("proyecto_id", proyIds)
    .is("anulado_en", null)
    .order("fecha_factura", { ascending: true });
  const factIds = (facts ?? []).map((f) => String((f as { id: string }).id));
  if (factIds.length === 0) {
    return NextResponse.json({ error: "Sin facturas" }, { status: 404 });
  }

  // PDFs por factura.
  const { data: adjs } = await supabaseServer
    .from("mk_adjuntos")
    .select("factura_id, url")
    .eq("tipo", "pdf_factura")
    .in("factura_id", factIds)
    .order("created_at", { ascending: true });
  const pdfsPorFactura = new Map<string, string[]>();
  for (const a of (adjs ?? []) as Array<{ factura_id: string; url: string }>) {
    const arr = pdfsPorFactura.get(String(a.factura_id)) ?? [];
    arr.push(a.url);
    pdfsPorFactura.set(String(a.factura_id), arr);
  }

  // Combinar en orden de factura. Un PDF que falle se salta.
  const merged = await PDFDocument.create();
  let incluidos = 0;
  let omitidos = 0;
  for (const fid of factIds) {
    for (const path of pdfsPorFactura.get(fid) ?? []) {
      const buf = await descargar(path);
      if (!buf) {
        omitidos++;
        continue;
      }
      try {
        const src = await PDFDocument.load(buf, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((pg) => merged.addPage(pg));
        incluidos++;
      } catch {
        omitidos++; // PDF corrupto/ilegible → se salta, no rompe el combinado
      }
    }
  }

  if (incluidos === 0) {
    return NextResponse.json({ error: "No hay PDFs combinables" }, { status: 404 });
  }

  const bytes = await merged.save();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="facturas-${codigo}.pdf"`,
      "X-Pdfs-Incluidos": String(incluidos),
      "X-Pdfs-Omitidos": String(omitidos),
    },
  });
}
