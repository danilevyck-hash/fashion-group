#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de las DOS DESCARGAS de Cuentas por Cobrar (8-sep-2026) CAZAN?
#
# Lo que cubren:
#   1  «Descargar», no «Exportar», y DOS líneas sin subtítulo — no tres
#   2  el MISMO menú en la computadora y en el celular (no un CSV aparte)
#   3  los dos CSV se fueron
#   4  las columnas: Código · Cliente · los TRES tramos · Total, y nada de
#      Estado / Correo / Teléfono / Celular / Contacto
#   5  el nombre del cliente, CAPITALIZADO
#   6  🩸 el detallado respeta el filtro de empresa (dejó de contradecirse)
#   7  🩸 al saldo A FAVOR no se le cobra: sin botón, sin casilla, fuera del archivo
#   8  el papel: un solo encabezado navy, el logo, «Hoja N de M» y el pie
#   9  el Excel de la casa: título 1 · vacía 2 · encabezados 3 con filtro
#  10  el nombre del archivo lleva su FECHA
#  11  descarga TODO el que ve el módulo (también el vendedor)
#  12  `/api/cxc/aging-por-cliente` deja de aceptar a `contabilidad`
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los dos CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO con `git checkout`: esta rama trae archivos
# NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-cxc-descargas.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/cxc-descargas.test.ts \
src/__tests__/components/cxc-descargas-pantalla.test.tsx \
src/__tests__/lib/cxc-papel-vocabulario.test.ts \
src/__tests__/components/cxc-tramos-un-solo-nombre.test.tsx \
src/__tests__/lib/excel-encabezados-fila-1.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/cxc/descargas.ts"
  "src/lib/cxc/cobrable.ts"
  "src/lib/cxc/roles.ts"
  "src/lib/cxc/excel-cartera.ts"
  "src/lib/pdf-cxc.ts"
  "src/lib/excel-export.ts"
  "src/app/cxc/page.tsx"
  "src/app/cxc/components/MenuDescargar.tsx"
  "src/app/cxc/components/PanelCxcMobile.tsx"
  "src/app/cxc/components/ClientRow.tsx"
  "src/app/cxc/components/ClientTable.tsx"
  "src/app/cxc/hooks/useDescargasCartera.ts"
  "src/app/api/cxc/aging-por-cliente/[codigo]/route.ts"
)

RESPALDO="$(mktemp -d)"
for f in "${ARCHIVOS[@]}"; do
  mkdir -p "$RESPALDO/$(dirname "$f")"
  cp "$f" "$RESPALDO/$f"
done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap restaurar EXIT

cazadas=0; sobrevivientes=0; controles_ok=0; controles_mal=0

probar() { # $1 = nombre de la mutación
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — no hay resumen que leer: $1"
    sobrevivientes=$((sobrevivientes + 1)); return
  fi
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  ✅ CAZADA ($fallos fallos) — $1"
    cazadas=$((cazadas + 1))
  else
    echo "  🔴 SOBREVIVIÓ — $1"
    sobrevivientes=$((sobrevivientes + 1))
  fi
}

probar_control() { # $1 = nombre del control (NO debe ser cazado)
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -eq 0 ]; then
    echo "  ✅ CONTROL SANO (no cazado) — $1"
    controles_ok=$((controles_ok + 1))
  else
    echo "  🔴 CONTROL CAZADO (el candado es demasiado estricto) — $1"
    controles_mal=$((controles_mal + 1))
  fi
}

aplicar() { # $1 archivo, $2 viejo, $3 nuevo
  restaurar
  python3 - "$1" "$2" "$3" <<'PY'
import sys
ruta, viejo, nuevo = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(ruta).read()
if viejo not in s:
    print(f"  ⚠️  el patrón no está en {ruta}: {viejo[:70]}")
    sys.exit(3)
open(ruta, "w").write(s.replace(viejo, nuevo, 1))
PY
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

control() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  aplicar "$1" "$2" "$3"
  [ $? -eq 3 ] && { controles_mal=$((controles_mal + 1)); return; }
  probar_control "$4"
}

echo "── mutando ──────────────────────────────────────────────────────────────"

# ═══ 1 · El botón y las dos líneas ═══════════════════════════════════════════

mutar "src/app/cxc/page.tsx" \
  "                Descargar
              </button>" \
  "                Exportar
              </button>" \
  "el botón vuelve a decir «Exportar»"

mutar "src/lib/cxc/descargas.ts" \
  '  "por-compania": "Detallado por compañía",' \
  '  "por-compania": "Detallado por compañía · desglose completo por empresa",' \
  "vuelve el subtítulo explicativo pegado al rótulo"

mutar "src/app/cxc/components/MenuDescargar.tsx" \
  '      {LINEAS_DESCARGA.map(({ clave, rotulo }) => (' \
  '      {LINEAS_DESCARGA.slice(0, 1).map(({ clave, rotulo }) => (' \
  "el menú deja de ofrecer las dos cosas (solo dibuja una)"

mutar "src/app/cxc/hooks/useDescargasCartera.ts" \
  '  ["total-por-cliente", "por-compania"] as ClaveDescarga[]' \
  '  ["total-por-cliente", "por-compania", "total-por-cliente"] as ClaveDescarga[]' \
  "el menú crece a TRES opciones otra vez"

# ═══ 2 · El mismo menú en las dos pantallas ══════════════════════════════════

mutar "src/app/cxc/components/PanelCxcMobile.tsx" \
  "              <MenuDescargar
                onDescargar={(clave, formato) => { setOpen(false); onDescargar(clave, formato); }}
              />" \
  '              <button type="button" role="menuitem" onClick={() => { setOpen(false); onDescargar("total-por-cliente", "excel"); }}>Descargar CSV</button>' \
  "el celular vuelve a tener su propio menú con otro archivo"

# ═══ 3 · Los CSV ═════════════════════════════════════════════════════════════

mutar "src/app/cxc/page.tsx" \
  'import { COMPANIES, B2B_COMPANIES } from "@/lib/companies";' \
  'import { COMPANIES, B2B_COMPANIES } from "@/lib/companies";
import { csvBlob } from "@/lib/csv-export";
void csvBlob;' \
  "el CXC vuelve a importar el CSV"

# ═══ 4 · Las columnas ════════════════════════════════════════════════════════

mutar "src/lib/cxc/excel-cartera.ts" \
  '    { header: "Cliente", wch: 38 },
    ...COLS_TRAMO,
  ];
  const rows: ReportCell[][] = filas.map((f) => [f.codigo, f.nombre, f.t0, f.t1, f.t2, f.total]);' \
  '    { header: "Cliente", wch: 38 },
    { header: "Correo", wch: 24 },
    ...COLS_TRAMO,
  ];
  const rows: ReportCell[][] = filas.map((f) => [f.codigo, f.nombre, "", f.t0, f.t1, f.t2, f.total]);' \
  "vuelve la columna «Correo» al archivo"

mutar "src/lib/cxc/excel-cartera.ts" \
  '  { header: tramoLabel("current"), wch: 16, align: "right", fmt: MONEY_FMT },' \
  '  { header: "0-30", wch: 16, align: "right", fmt: MONEY_FMT },' \
  "vuelven los tramos finos escritos a mano"

mutar "src/lib/cxc/excel-cartera.ts" \
  '    { header: "Código", wch: 10 },
    { header: "Cliente", wch: 38 },
    { header: "Compañía", wch: 22 },' \
  '    { header: "Código", wch: 10 },
    { header: "Cliente", wch: 38 },
    { header: "Empresa", wch: 22 },' \
  "el detallado renombra la columna «Compañía»"

# ═══ 5 · El nombre capitalizado ══════════════════════════════════════════════

mutar "src/lib/cxc/descargas.ts" \
  '  const nombre = Object.values(c.companies).find((x) => x?.nombre)?.nombre;
  return (nombre ?? "").trim() || c.nombre_normalized;' \
  '  return c.nombre_normalized;' \
  "el nombre vuelve a bajarse en MAYÚSCULAS"

mutar "src/lib/cxc/descargas.ts" \
  '    nombre: nombreDeCliente(c),
    t0: c.current,' \
  '    nombre: c.nombre_normalized,
    t0: c.current,' \
  "solo el «Total por cliente» vuelve a las mayúsculas"

# ═══ 6 · 🩸 El detallado y el filtro de empresa ══════════════════════════════

mutar "src/lib/cxc/descargas.ts" \
  '  if (companyFilter === "all") return companias;
  return companias.filter((co) => co.key === companyFilter);' \
  '  return companias;' \
  "🩸 el detallado vuelve a listar las SEIS con una empresa en el filtro"

mutar "src/app/cxc/hooks/useDescargasCartera.ts" \
  "      const companias = companiasDeLaVista(cxcCompanies, companyFilter);" \
  "      const companias = cxcCompanies;" \
  "🩸 la pantalla deja de pasarle el filtro al archivo"

mutar "src/lib/cxc/descargas.ts" \
  '      total: empresas.reduce((s, e) => s + e.total, 0),
      empresas,' \
  '      total: c.total,
      empresas,' \
  "el total del cliente deja de ser la suma de sus renglones"

# ═══ 7 · 🩸 El saldo a favor ═════════════════════════════════════════════════

mutar "src/lib/cxc/cobrable.ts" \
  "  return total > 0;" \
  "  return true;" \
  "🩸 al saldo a favor se le vuelve a cobrar"

mutar "src/lib/cxc/descargas.ts" \
  "  return clientes.filter((c) => seLeCobra(c.total));" \
  "  return clientes;" \
  "🩸 el saldo a favor vuelve a las descargas"

mutar "src/app/cxc/components/ClientRow.tsx" \
  "          {seLeCobra(client.total) && (
            <button" \
  "          {true && (
            <button" \
  "vuelve el botón «Cobrar» en la fila del saldo a favor"

mutar "src/app/cxc/components/ClientRow.tsx" \
  "          {seLeCobra(client.total) ? (
            <input" \
  "          {true ? (
            <input" \
  "vuelve la casilla de «mandar a varios» en el saldo a favor"

mutar "src/app/cxc/components/ClientTable.tsx" \
  "  const negativos = filtered.filter((c) => c.total < 0);" \
  "  const negativos: typeof filtered = [];" \
  "el bloque «Saldo a favor» deja de dibujarse (se esconde la plata)"

# ═══ 8 · El papel ════════════════════════════════════════════════════════════

mutar "src/lib/pdf-cxc.ts" \
  "const NAVY: [number, number, number] = [27, 58, 92];" \
  "const NAVY: [number, number, number] = [249, 250, 251];" \
  "el encabezado del papel deja de ser el navy de la casa"

mutar "src/lib/pdf-cxc.ts" \
  '    doc.text(`Hoja ${i} de ${hojas}`, w - MARGEN, 22, { align: "right" });' \
  "" \
  "el papel pierde el «Hoja N de M»"

mutar "src/lib/pdf-cxc.ts" \
  '    doc.text("fashiongr.com", w - MARGEN, h - 10, { align: "right" });' \
  "" \
  "el pie pierde fashiongr.com"

mutar "src/lib/pdf-cxc.ts" \
  "    didDrawPage: () => cabecera(doc, opts.subtitulo, opts.hoy),
  });

  piePorHoja(doc);
  doc.save(opts.archivo);
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 ·" \
  "  });

  piePorHoja(doc);
  doc.save(opts.archivo);
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 ·" \
  "el primer papel se queda sin cabecera (los dos dejan de parecerse)"

mutar "src/lib/pdf-cxc.ts" \
  '      { content: `Total ${b.nombre}`, styles: { fontStyle: "bold", halign: "right" } },' \
  '      { content: `Suma ${b.nombre}`, styles: { fontStyle: "bold", halign: "right" } },' \
  "la suma del cliente cambia de rótulo (y de lugar reconocible)"

mutar "src/lib/pdf-cxc.ts" \
  "const tramo = tramoLabel;" \
  '  const tramo = (k: "current" | "watch" | "overdue") => k === "current" ? "Corriente" : k === "watch" ? "Vigilancia" : "Vencido";' \
  "el papel vuelve a escribirse sus propios rótulos de tramo"

# ═══ 9 · El Excel de la casa ═════════════════════════════════════════════════

mutar "src/lib/cxc/excel-cartera.ts" \
  "  const ws = buildReportSheet({
    titulo,
    columns,
    rows,
    totals: [\"\", \"Total\", t.t0, t.t1, t.t2, t.total],
  });" \
  "  const ws = buildReportSheet({
    columns,
    rows,
    totals: [\"\", \"Total\", t.t0, t.t1, t.t2, t.total],
  });" \
  "el Excel pierde el título de la fila 1"

mutar "src/lib/excel-export.ts" \
  "    heights[r] = 26; r++;
    heights[r] = 8; r++;" \
  "    heights[r] = 26; r++;" \
  "se pierde la fila 2 vacía (los encabezados suben a la 2)"

mutar "src/lib/excel-export.ts" \
  "  const filtro = \`A\${filaEncabezados}:\${addr(r - 1 + opts.rows.length, lastCol)}\`;" \
  "  const filtro = \`A1:\${addr(r - 1 + opts.rows.length, lastCol)}\`;" \
  "el filtro deja de arrancar en los encabezados"

mutar "src/lib/cxc/excel-cartera.ts" \
  '  { header: "Total", wch: 16, align: "right", fmt: MONEY_FMT },' \
  '  { header: "Total", wch: 16, align: "right" },' \
  "la plata pierde su formato de moneda (queda un número pelado)"

# ═══ 10 · El nombre del archivo ══════════════════════════════════════════════

mutar "src/lib/cxc/descargas.ts" \
  "  return \`\${BASE_ARCHIVO[clave]}-\${hoy}.\${ext}\`;" \
  "  return \`\${BASE_ARCHIVO[clave]}.\${ext}\`;" \
  "🩸 el archivo pierde la fecha en el camino"

mutar "src/lib/cxc/descargas.ts" \
  '  "por-compania": "CXC-cartera-por-compania",' \
  '  "por-compania": "CXC cartera por compania",' \
  "el nombre del archivo vuelve a llevar espacios"

# ═══ 11 y 12 · Los permisos ══════════════════════════════════════════════════

mutar "src/app/cxc/page.tsx" \
  "  const canExport = veCxc(userRole);" \
  '  const canExport = userRole === "admin" || userRole === "secretaria";' \
  "el vendedor pierde el botón de descargar"

mutar "src/lib/cxc/roles.ts" \
  'export const ROLES_CXC = ["admin", "secretaria", "vendedor"] as const;' \
  'export const ROLES_CXC = ["admin", "secretaria"] as const;' \
  "el vendedor sale de los roles del CXC"

mutar "src/app/api/cxc/aging-por-cliente/[codigo]/route.ts" \
  "const READ_ROLES = rolesCxc();" \
  'const READ_ROLES = ["admin", "contabilidad", "secretaria", "vendedor"];' \
  "la ruta del saldo por cliente vuelve a abrirse a contabilidad"

# ═══ Voseo ═══════════════════════════════════════════════════════════════════

mutar "src/lib/cxc/descargas.ts" \
  'export const ENCABEZADO_DESCARGAS = "Todos los clientes";' \
  'export const ENCABEZADO_DESCARGAS = "Elegí qué descargar";' \
  "voseo en el encabezado del menú (texto que se VE)"

# ═══ CONTROLES: cambios inocuos que NO deben ser cazados ═════════════════════
echo
echo "── controles (NO deben ser cazados) ─────────────────────────────────────"

control "src/lib/cxc/descargas.ts" \
  "  return \`\${ROTULO_DESCARGA[clave]} — \${empresa ?? \"Fashion Group · 6 empresas\"}\`;" \
  "  const de = empresa ?? \"Fashion Group · 6 empresas\";
  return \`\${ROTULO_DESCARGA[clave]} — \${de}\`;" \
  "CONTROL: el mismo subtítulo, armado en dos pasos"

control "src/lib/pdf-cxc.ts" \
  "const MARGEN = 19;" \
  "const MARGEN = 19; // milímetros" \
  "CONTROL: un comentario al lado del margen del papel"

restaurar
echo
echo "── CONTROL FINAL (sin mutar) ────────────────────────────────────────────"
salida="$(npx vitest run $TESTS 2>&1)"
grep -E "^ *(Tests|Test Files) " <<<"$salida"
echo
echo "══ resultado: $cazadas cazadas · $sobrevivientes sobrevivientes · controles: $controles_ok sanos / $controles_mal cazados ══"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]
