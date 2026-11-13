/**
 * Texto del aviso de Telegram de guía despachada (25-oct-2026: chat privado).
 * 13-nov-2026, Daniel: el total de bultos va en la PRIMERA línea, junto al número
 * y el transportista, y ya no se repite al final.
 */
export interface RenglonAviso {
  cliente?: string | null;
  empresa?: string | null;
  bultos?: number | null;
}

export function textoGuiaDespachada(numero: string, transp: string, renglones: RenglonAviso[]): string {
  // empresa → cliente → bultos sumados; Map preserva el orden de aparición.
  const porEmpresa = new Map<string, Map<string, number>>();
  let total = 0;
  for (const i of renglones) {
    const emp = (i.empresa || "").trim() || "Sin empresa";
    const cli = (i.cliente || "").trim() || "Sin cliente";
    const b = Number(i.bultos) || 0;
    total += b;
    if (!porEmpresa.has(emp)) porEmpresa.set(emp, new Map());
    const clientes = porEmpresa.get(emp)!;
    clientes.set(cli, (clientes.get(cli) ?? 0) + b);
  }
  const lineas = [`📦 ${numero} · ${transp} · ${total} ${total === 1 ? "bulto" : "bultos"}`];
  for (const [emp, clientes] of porEmpresa) {
    lineas.push("", emp);
    for (const [cli, b] of clientes) lineas.push(`  ${cli} — ${b}`);
  }
  return lineas.join("\n");
}
