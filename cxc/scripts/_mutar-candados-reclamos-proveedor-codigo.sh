#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MUTACIONES contra los candados de «Reclamos → proveedor por (empresa, código)».
#
# Cada mutación rompe UNA regla a propósito. Si los tests siguen verdes con la
# mutación puesta, el candado no sirve. Cada archivo se restaura siempre.
#
#   bash scripts/_mutar-candados-reclamos-proveedor-codigo.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/lib/reclamos-proveedor-por-codigo.test.ts
  src/__tests__/lib/reclamos-estado-pagado-unico.test.ts
  src/__tests__/lib/reclamos-fetch-empresa-una-sola.test.ts
)

CAZADAS=0
TOTAL=0

mutar() {           # mutar "<nombre>" "<archivo>" "<python que edita>"
  local nombre="$1" archivo="$2" script="$3"
  TOTAL=$((TOTAL + 1))
  cp "$archivo" "$archivo.bak"
  python3 - "$archivo" <<PY
import sys
p = sys.argv[1]
s = open(p).read()
$script
open(p, "w").write(s)
PY
  if npx vitest run "${TESTS[@]}" >/dev/null 2>&1; then
    echo "  ESCAPÓ  · $nombre"
  else
    echo "  cazada  · $nombre"
    CAZADAS=$((CAZADAS + 1))
  fi
  mv "$archivo.bak" "$archivo"
}

echo "Mutando…"

# ── 1. Volver a unir por NOMBRE / aflojar el par ────────────────────────────
mutar "el par ignora la empresa (código suelto)" src/lib/reclamos/proveedor-vinculo.ts \
  's = s.replace("return `${e}|${c}`;", "return c;")'

mutar "la ficha vuelve a filtrar por nombre" "src/app/api/proveedores/[key]/route.ts" \
  's = s.replace("reclamosDelProveedor(recl ?? [], pares)", "(recl ?? []).filter((r) => normProvName(r.proveedor) === key)")'

mutar "la ficha deja de pedir proveedor_codigo" "src/app/api/proveedores/[key]/route.ts" \
  's = s.replace("proveedor_codigo,", "")'

# ── 2. Código sin empresa / clave a medias ──────────────────────────────────
mutar "un código vacío igual arma clave" src/lib/reclamos/proveedor-vinculo.ts \
  's = s.replace("if (!e || !c) return null;", "if (!e) return null;")'

mutar "una empresa vacía igual arma clave" src/lib/reclamos/proveedor-vinculo.ts \
  's = s.replace("if (!e || !c) return null;", "if (!c) return null;")'

mutar "el POST deja de escribir el código" src/app/api/reclamos/route.ts \
  's = s.replace("proveedor_codigo: empInfo?.proveedor_codigo ?? null,", "")'

mutar "el PATCH no rehace el código al cambiar de empresa" "src/app/api/reclamos/[id]/route.ts" \
  's = s.replace("updates.proveedor_codigo = empInfo.proveedor_codigo;", "")'

# ── 3. El mapa de las 6 empresas ────────────────────────────────────────────
mutar "se cae Joystep del mapa" src/lib/reclamos/empresas.ts \
  's = s.replace("""  Joystep: {
    empresa_key: "joystep",
    proveedor: "JCBBRANDS",
    marca: "Joybees",
    proveedor_codigo: "112",
  },
""", "")'

mutar "Active Wear vuelve a ser Reebok" src/lib/reclamos/empresas.ts \
  's = s.replace("marca: \"Karl Lagerfeld\"", "marca: \"Reebok\"")'

mutar "Fashion Shoes copia el código de Fashion Wear" src/lib/reclamos/empresas.ts \
  's = s.replace("""    empresa_key: "fashion_shoes",
    proveedor: "American Fashion Wear",
    marca: "Tommy Hilfiger",
    proveedor_codigo: "112",""", """    empresa_key: "fashion_shoes",
    proveedor: "American Fashion Wear",
    marca: "Tommy Hilfiger",
    proveedor_codigo: "122",""")'

mutar "Vistana pierde el cero de la izquierda (01 → 1)" src/lib/reclamos/empresas.ts \
  's = s.replace("proveedor_codigo: \"01\"", "proveedor_codigo: \"1\"")'

# ── 4. La migración ─────────────────────────────────────────────────────────
MIG=supabase/migrations/20260922120000_reclamos_proveedor_codigo.sql

mutar "la migración ata con ILIKE" "$MIG" \
  's = s.replace("upper(btrim(r.proveedor)) = upper(btrim(l.proveedor))", "r.proveedor ILIKE l.proveedor")'

mutar "la migración usa left() para cortar el nombre" "$MIG" \
  's = s.replace("upper(btrim(r.proveedor)) = upper(btrim(l.proveedor))", "left(r.proveedor, 10) = left(l.proveedor, 10)")'

mutar "la migración ata SIN mirar la empresa" "$MIG" \
  's = s.replace("WHERE upper(btrim(r.empresa)) = upper(btrim(l.empresa))\n  AND ", "WHERE ")'

mutar "la migración pisa un código ya puesto" "$MIG" \
  's = s.replace("\n  AND r.proveedor_codigo IS NULL", "")'

mutar "se cuela una séptima fila en la lista" "$MIG" \
  "s = s.replace(\"    ('Joystep',               'JCBBRANDS',                 '112')\", \"    ('Joystep',               'JCBBRANDS',                 '112'),\n    ('Multifashion',          'LATIN FITNESS GROUP INC',   '1110')\")"

mutar "la lista de la migración cambia un código" "$MIG" \
  "s = s.replace(\"'American Designer Fashion', '01'\", \"'American Designer Fashion', '02'\")"

mutar "la migración borra en vez de agregar" "$MIG" \
  's = s.replace("ALTER TABLE reclamos\n  ADD COLUMN IF NOT EXISTS proveedor_codigo text;", "ALTER TABLE reclamos DROP COLUMN IF EXISTS proveedor;\nALTER TABLE reclamos\n  ADD COLUMN IF NOT EXISTS proveedor_codigo text;")'

mutar "la migración también pisa el nombre del proveedor" "$MIG" \
  "s = s.replace(\"SET proveedor_codigo = l.codigo\", \"SET proveedor_codigo = l.codigo, proveedor = l.proveedor\")"

# ── 5. El literal «Pagado» ──────────────────────────────────────────────────
mutar "el flip a Pagado vuelve al literal" "src/app/api/reclamos/[id]/settlements/route.ts" \
  's = s.replace("estado: ESTADO_PAGADO,", "estado: \"Pagado\",")'

mutar "el badge de notificaciones vuelve al literal" src/app/api/notification-badges/route.ts \
  's = s.replace("`(Aplicado,Rechazado,Aplicada,${ESTADO_PAGADO})`", "\"(Aplicado,Rechazado,Aplicada,Pagado)\"")'

mutar "Vista General vuelve al literal" src/app/api/dashboard/vista-general/route.ts \
  's = s.replace(".neq(\"estado\", ESTADO_PAGADO)", ".neq(\"estado\", \"Pagado\")")'

mutar "la máquina de estados vuelve al literal" "src/app/api/reclamos/[id]/route.ts" \
  's = s.replace("[ESTADO_PAGADO]: [\"En proceso\"],", "\"Pagado\": [\"En proceso\"],")'

mutar "la constante cambia de valor y el RPC del home no" src/lib/reclamos/pendientes.ts \
  's = s.replace("ESTADO_PAGADO = \"Pagado\"", "ESTADO_PAGADO = \"Pagada\"")'

# ── 6. El Excel del proveedor ───────────────────────────────────────────────
mutar "el Excel deja de filtrar borrados (rama de la lista)" src/lib/reclamos/fetch-empresa.ts \
  's = s.replace("""      .eq("empresa", empresa)
      .eq("deleted", false)
      .order("created_at", { ascending: false });
    if (tab !== \x27all\x27)""".replace("\x27all\x27", chr(34)+"all"+chr(34)), """      .eq("empresa", empresa)
      .order("created_at", { ascending: false });
    if (tab !== "all")""")'

mutar "el Excel deja de filtrar borrados (rama de ids)" src/lib/reclamos/fetch-empresa.ts \
  's = s.replace("""      .eq("deleted", false)
      .in("id", sel.reclamo_ids)""", """      .in("id", sel.reclamo_ids)""")'

mutar "se pierden los settlements del select" src/lib/reclamos/fetch-empresa.ts \
  's = s.replace(", reclamo_settlements(*)", "")'

mutar "vuelve una segunda fetchReclamosForEmpresa en excel-bulk" src/lib/reclamos/excel-bulk.ts \
  's = s.replace("export function reclamoBulkConstants", "export async function fetchReclamosForEmpresa() { return []; }\n\nexport function reclamoBulkConstants")'

echo
echo "Mutaciones cazadas: $CAZADAS / $TOTAL"
[ "$CAZADAS" = "$TOTAL" ] || exit 1
