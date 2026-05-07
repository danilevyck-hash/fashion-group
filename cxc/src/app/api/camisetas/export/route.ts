import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import XLSX from "xlsx-js-style";

export const dynamic = "force-dynamic";

const PPQ = 13; // piezas por paquete
const TALLAS: Record<string, Record<string, number>> = {
  HOMBRE: { XS: 0, S: 2, M: 4, L: 4, XL: 2, XXL: 1, "3XL": 0 },
  MUJER:  { XS: 2, S: 4, M: 4, L: 2, XL: 1, XXL: 0, "3XL": 0 },
  "NIÑO": { "4": 1, "6": 1, "8": 1, "10": 2, "12": 2, "14": 2, "16": 2, "18": 2 },
};

interface Cliente { id: string; nombre: string; estado: string | null; created_at: string | null; }
interface Producto { id: string; nombre: string; genero: string; color: string; precio_panama: number; }
interface Pedido { cliente_id: string; producto_id: string; paquetes: number; created_at: string | null; }

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const [{ data: clientesData, error: e1 }, { data: productosData, error: e2 }, { data: pedidosData, error: e3 }] = await Promise.all([
    supabaseServer.from("camisetas_clientes").select("id,nombre,estado,created_at").eq("deleted", false).order("nombre"),
    supabaseServer.from("camisetas_productos").select("id,nombre,genero,color,precio_panama"),
    supabaseServer.from("camisetas_pedidos").select("cliente_id,producto_id,paquetes,created_at").eq("deleted", false),
  ]);
  if (e1 || e2 || e3) {
    console.error("[camisetas/export]", e1?.message, e2?.message, e3?.message);
    return NextResponse.json({ error: "Error al cargar datos" }, { status: 500 });
  }

  const clientes = (clientesData ?? []) as Cliente[];
  const productos = (productosData ?? []) as Producto[];
  const pedidos = (pedidosData ?? []) as Pedido[];
  const prodById = new Map(productos.map(p => [p.id, p]));
  const clienteById = new Map(clientes.map(c => [c.id, c]));

  // ─── Sheet 1: Pedidos (1 fila por cliente) ─────────────────────────────────
  const pedidosHeader = [
    "Cliente", "Estado", "# Productos", "# Paquetes", "# Piezas", "Valor Total",
    "Primer Pedido", "Último Pedido",
  ];
  const pedidosRows: (string | number)[][] = [pedidosHeader];

  // Agregar fila SOLO para clientes con al menos 1 pedido (evitar ruido)
  const clientStats = new Map<string, { prods: number; paqs: number; pzas: number; valor: number; minDate: string | null; maxDate: string | null }>();
  for (const p of pedidos) {
    if (p.paquetes <= 0) continue;
    const prod = prodById.get(p.producto_id);
    if (!prod) continue;
    const e = clientStats.get(p.cliente_id) ?? { prods: 0, paqs: 0, pzas: 0, valor: 0, minDate: null, maxDate: null };
    e.prods += 1;
    e.paqs += p.paquetes;
    e.pzas += p.paquetes * PPQ;
    e.valor += p.paquetes * PPQ * Number(prod.precio_panama);
    if (p.created_at) {
      if (!e.minDate || p.created_at < e.minDate) e.minDate = p.created_at;
      if (!e.maxDate || p.created_at > e.maxDate) e.maxDate = p.created_at;
    }
    clientStats.set(p.cliente_id, e);
  }

  const sortedClientes = [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre));
  for (const c of sortedClientes) {
    const s = clientStats.get(c.id);
    if (!s) continue; // sin pedidos
    pedidosRows.push([
      c.nombre,
      c.estado ?? "Pendiente",
      s.prods,
      s.paqs,
      s.pzas,
      s.valor,
      fmtDate(s.minDate),
      fmtDate(s.maxDate),
    ]);
  }

  // Totales row
  const totalProds = [...clientStats.values()].reduce((s, e) => s + e.prods, 0);
  const totalPaqs = [...clientStats.values()].reduce((s, e) => s + e.paqs, 0);
  const totalPzas = [...clientStats.values()].reduce((s, e) => s + e.pzas, 0);
  const totalValor = [...clientStats.values()].reduce((s, e) => s + e.valor, 0);
  pedidosRows.push(["TOTAL", "", totalProds, totalPaqs, totalPzas, totalValor, "", ""]);

  // ─── Sheet 2: Detalle (1 fila por talla) ───────────────────────────────────
  const detalleHeader = [
    "Cliente", "Producto", "Género", "Color", "Talla",
    "Cantidad", "Precio Unit", "Subtotal", "Estado",
  ];
  const detalleRows: (string | number)[][] = [detalleHeader];

  // Sort: cliente, producto, género (orden HOMBRE/MUJER/NIÑO), color
  const GEN_ORDER: Record<string, number> = { HOMBRE: 0, MUJER: 1, "NIÑO": 2 };
  const expandedLines: { cliente: string; prodNombre: string; genero: string; color: string; talla: string; cantidad: number; precioUnit: number; subtotal: number; estado: string }[] = [];

  for (const p of pedidos) {
    if (p.paquetes <= 0) continue;
    const prod = prodById.get(p.producto_id);
    const cli = clienteById.get(p.cliente_id);
    if (!prod || !cli) continue;
    const tallaDist = TALLAS[prod.genero] ?? {};
    for (const [talla, qtyPerPaq] of Object.entries(tallaDist)) {
      if (qtyPerPaq <= 0) continue;
      const cantidad = qtyPerPaq * p.paquetes;
      const precioUnit = Number(prod.precio_panama);
      expandedLines.push({
        cliente: cli.nombre,
        prodNombre: prod.nombre,
        genero: prod.genero,
        color: prod.color,
        talla,
        cantidad,
        precioUnit,
        subtotal: cantidad * precioUnit,
        estado: cli.estado ?? "Pendiente",
      });
    }
  }

  expandedLines.sort((a, b) =>
    a.cliente.localeCompare(b.cliente) ||
    a.prodNombre.localeCompare(b.prodNombre) ||
    (GEN_ORDER[a.genero] ?? 99) - (GEN_ORDER[b.genero] ?? 99) ||
    a.color.localeCompare(b.color)
  );

  for (const l of expandedLines) {
    detalleRows.push([l.cliente, l.prodNombre, l.genero, l.color, l.talla, l.cantidad, l.precioUnit, l.subtotal, l.estado]);
  }

  // Total row Detalle
  const totalCant = expandedLines.reduce((s, l) => s + l.cantidad, 0);
  const totalSub = expandedLines.reduce((s, l) => s + l.subtotal, 0);
  detalleRows.push(["TOTAL", "", "", "", "", totalCant, "", totalSub, ""]);

  // ─── Build workbook ────────────────────────────────────────────────────────
  const wsPedidos = XLSX.utils.aoa_to_sheet(pedidosRows);
  const wsDetalle = XLSX.utils.aoa_to_sheet(detalleRows);

  // Column widths
  wsPedidos["!cols"] = [
    { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ];
  wsDetalle["!cols"] = [
    { wch: 28 }, { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
  ];

  // Bold headers + format money columns
  const styleHdr = { font: { bold: true }, fill: { fgColor: { rgb: "F3F4F6" } } };
  const styleMoney = { numFmt: "$#,##0.00" };
  const styleTotalNum = { font: { bold: true } };
  const styleTotalMoney = { font: { bold: true }, numFmt: "$#,##0.00" };

  // Apply to Pedidos sheet
  for (let c = 0; c < pedidosHeader.length; c++) {
    const cell = wsPedidos[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = styleHdr;
  }
  for (let r = 1; r < pedidosRows.length - 1; r++) {
    const moneyCell = wsPedidos[XLSX.utils.encode_cell({ r, c: 5 })];
    if (moneyCell) moneyCell.s = styleMoney;
  }
  // Total row Pedidos
  {
    const r = pedidosRows.length - 1;
    for (let c = 0; c < pedidosHeader.length; c++) {
      const cell = wsPedidos[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.s = c === 5 ? styleTotalMoney : styleTotalNum;
    }
  }

  // Apply to Detalle sheet
  for (let c = 0; c < detalleHeader.length; c++) {
    const cell = wsDetalle[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = styleHdr;
  }
  for (let r = 1; r < detalleRows.length - 1; r++) {
    for (const c of [6, 7]) { // precio_unit, subtotal
      const cell = wsDetalle[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.s = styleMoney;
    }
  }
  // Total row Detalle
  {
    const r = detalleRows.length - 1;
    for (let c = 0; c < detalleHeader.length; c++) {
      const cell = wsDetalle[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.s = c === 7 ? styleTotalMoney : styleTotalNum;
    }
  }

  // Freeze header row in both sheets
  wsPedidos["!freeze"] = { xSplit: 0, ySplit: 1 };
  wsDetalle["!freeze"] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsPedidos, "Pedidos");
  XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const filename = `camisetas_pedidos_${ymd}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
