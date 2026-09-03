#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de "clientes_master es SOLO del grupo, y nadie lo une por
# nombre" CAZAN de verdad? Se rompe el código a propósito, una cosa por vez, y
# se exige que los tests se pongan ROJOS.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO CON `git checkout`: esta rama trae
# archivos NUEVOS y git aborta el comando entero sin restaurar nada, así que las
# mutaciones se apilarían y ninguna se probaría por separado.
#
# 🩸 Y TODO ARCHIVO QUE SE MUTE TIENE QUE ESTAR EN `ARCHIVOS`. Ya pasó en esta
# misma corrida: se mutó la migración de `ventas_dashboard_summary` sin
# respaldarla, no se restauró, y la mutación quedó viva — el CONTROL de más abajo
# salió rojo culpando a un cambio inocente. Por eso ahora `probar()` verifica
# ANTES de cada caso que el árbol esté limpio.
#
# 🩸 Y `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: si la corrida muere, un
# "0 fallos" se leería como "sobrevivió". Un verificador que miente en verde es
# peor que no tenerlo.
#
# Incluye un CONTROL que NO debe dar rojo: un cambio inocuo que, si pusiera los
# tests en rojo, probaría que los candados están atados a la forma del texto y
# no a la conducta.
#
#   bash scripts/_mutar-candados-clientes-master.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/clientes-master-solo-del-grupo.test.ts \
src/__tests__/components/ventas-clientes-las-seis-empresas.test.tsx"

MIGRACION="supabase/migrations/20260907120000_clientes_ranking_por_codigo.sql"

ARCHIVOS=(
  "src/lib/switch-api/sync-clientes-master.ts"
  "src/components/ventas/ClientesView.tsx"
  "src/app/api/clientes/[codigo]/route.ts"
  "src/lib/clientes/mundos.ts"
  "supabase/migrations/20260725170100_ventas_dashboard_summary_mes_sargable.sql"
  "$MIGRACION"
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

probar_control() { # $1 = nombre del control (NO debe dar rojo)
  local salida fallos
  salida="$(npx vitest run $TESTS 2>&1)"
  if ! grep -qE "^ *Tests " <<<"$salida"; then
    echo "  ⚠️  LA CORRIDA MURIÓ — $1"; controles_mal=$((controles_mal + 1)); return
  fi
  fallos="$(grep -oE "[0-9]+ failed" <<<"$salida" | head -1 | grep -oE "[0-9]+" || echo 0)"
  if [ "${fallos:-0}" -gt 0 ]; then
    echo "  🔴 CONTROL EN ROJO ($fallos) — el candado mira la FORMA, no la conducta: $1"
    controles_mal=$((controles_mal + 1))
  else
    echo "  ✅ control en verde (como debe ser) — $1"
    controles_ok=$((controles_ok + 1))
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

# Todo archivo mutado tiene que estar respaldado; si no, la mutación sobrevive a
# la restauración y contamina los casos siguientes.
respaldado() {
  for f in "${ARCHIVOS[@]}"; do [ "$f" = "$1" ] && return 0; done
  echo "  ⛔ $1 NO está en ARCHIVOS: se mutaría sin poder restaurarlo"; return 1
}

mutar() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  respaldado "$1" || { sobrevivientes=$((sobrevivientes + 1)); return; }
  aplicar "$1" "$2" "$3" || { sobrevivientes=$((sobrevivientes + 1)); return; }
  probar "$4"
}

control() { # $1 archivo, $2 viejo, $3 nuevo, $4 nombre
  respaldado "$1" || { controles_mal=$((controles_mal + 1)); return; }
  aplicar "$1" "$2" "$3" || { controles_mal=$((controles_mal + 1)); return; }
  probar_control "$4"
}

echo "── mutando ──────────────────────────────────────────────────────────────"

# ── 1. La RAÍZ: que Boston vuelva a entrar ───────────────────────────────────
mutar src/lib/switch-api/sync-clientes-master.ts \
  '.in("empresa_key", [...EMPRESAS_DEL_GRUPO])' \
  '.neq("empresa_key", "american_classic")' \
  "el sync vuelve a excluir SOLO a ACS (el bug del 28-jul: Boston entra)"

mutar src/lib/switch-api/sync-clientes-master.ts \
  '.in("empresa_key", [...EMPRESAS_DEL_GRUPO])' \
  '.in("empresa_key", [...EMPRESAS_DEL_GRUPO, "confecciones_boston"])' \
  "alguien 'agrega' Boston a la lista de inclusión"

mutar src/lib/switch-api/sync-clientes-master.ts \
  '.in("empresa_key", [...EMPRESAS_DEL_GRUPO])' \
  '.in("empresa_key", [...EMPRESAS_DEL_GRUPO].filter((e) => e !== "joystep"))' \
  "el sync se olvida de joystep (la lista deja de ser LAS SEIS)"

mutar src/lib/switch-api/sync-clientes-master.ts \
  '.in("empresa_key", [...EMPRESAS_DEL_GRUPO])' \
  '.order("id", { ascending: true })' \
  "el sync no acota nada y lee las 8 empresas"

# ── 2. EL MÉTODO: que las vistas vuelvan a resolver por nombre ──────────────
mutar "$MIGRACION" \
  '    LEFT JOIN switch_clientes sc
      ON sc.empresa_key = a.empresa_key
     AND sc.cliente_switch_id = a.cliente_switch_id
  ),' \
  '    LEFT JOIN switch_clientes sc
      ON sc.empresa_key = a.empresa_key
     AND sc.cliente_switch_id = a.cliente_switch_id
    LEFT JOIN clientes_master mc
      ON mc.nombre_normalized = a.cliente_norm
     AND mc.deleted = false
  ),' \
  "clientes_empresa_12m_vw vuelve al fallback por nombre (el bug exacto)"

mutar "$MIGRACION" \
  '    LEFT JOIN switch_clientes m
      ON m.empresa_key = nb.empresa
     AND m.cliente_switch_id = nb.cliente_switch_id' \
  '    LEFT JOIN clientes_master m
      ON m.nombre_normalized = nb.cliente_norm
     AND m.deleted = false' \
  "la rama no-B2B de la MV vuelve a resolver por nombre"

mutar "$MIGRACION" \
  '      LEFT JOIN switch_clientes m
        ON m.empresa_key = nb.empresa AND m.cliente_switch_id = nb.cliente_switch_id' \
  '      LEFT JOIN clientes_master m
        ON m.nombre_normalized = nb.c_norm AND m.deleted = false' \
  "clientes_anio() vuelve a resolver por nombre (los años CERRADOS)"

# ── 3. Que el PUENTE deje de ser por (empresa, id) ──────────────────────────
mutar "$MIGRACION" \
  '    LEFT JOIN switch_clientes sc
      ON sc.empresa_key = a.empresa_key
     AND sc.cliente_switch_id = a.cliente_switch_id' \
  '    LEFT JOIN switch_clientes sc
      ON sc.cliente_switch_id = a.cliente_switch_id' \
  "el puente pierde empresa_key → mezcla el id de una empresa con otra"

mutar "$MIGRACION" \
  '      LEFT JOIN switch_clientes sc
        ON sc.empresa_key = a.empresa_key AND sc.cliente_switch_id = a.cliente_switch_id' \
  '      LEFT JOIN switch_clientes sc
        ON sc.empresa_key = a.empresa_key AND sc.codigo = a.cliente_norm' \
  "clientes_anio() cambia el puente por un pareo contra el nombre"

# ── 4. Que el ranking pierda el join por CÓDIGO, o el grano por EMPRESA ─────
mutar "$MIGRACION" \
  'LEFT JOIN clientes_master m ON m.codigo = id2.cliente_codigo AND m.deleted = false' \
  'LEFT JOIN clientes_master m ON m.nombre_normalized = id2.cliente_norm AND m.deleted = false' \
  "la ficha del ranking se resuelve por nombre en vez de por código"

mutar "$MIGRACION" \
  '    FROM keyed k, current_year cy, max_mes mm
    WHERE k.anio = cy.y AND k.mes <= mm.m
    GROUP BY k.cliente_key, k.empresa' \
  '    FROM keyed k, current_year cy, max_mes mm
    WHERE k.anio = cy.y AND k.mes <= mm.m
    GROUP BY k.cliente_key' \
  "el grano pierde la EMPRESA → los seis mostradores TCKCTA caen en una fila"

# ── 5. Que las ventas de Boston dejen de sumar (el bug OPUESTO) ─────────────
mutar supabase/migrations/20260725170100_ventas_dashboard_summary_mes_sargable.sql \
  'FROM switch_facturas f' \
  "FROM switch_facturas f WHERE f.empresa_key <> 'confecciones_boston'" \
  "alguien saca la VENTA de Boston de Vista General (Daniel dijo que se queda)"

# ── 6. La tira de empresas de Ventas › Clientes ──────────────────────────────
mutar src/components/ventas/ClientesView.tsx \
  '  ...B2B_EMPRESA_KEYS.map((key) => ({' \
  '  ...B2B_EMPRESA_KEYS.filter((k) => k !== "joystep").map((key) => ({' \
  "vuelve el filtro que escondía joystep (el bug de hoy)"

mutar src/components/ventas/ClientesView.tsx \
  '  ...B2B_EMPRESA_KEYS.map((key) => ({
    id: key,
    label: EMPRESA_KEY_TO_NAME[key] ?? key,
  })),' \
  '  { id: "vistana", label: "Vistana International" },
  { id: "fashion_wear", label: "Fashion Wear" },
  { id: "fashion_shoes", label: "Fashion Shoes" },
  { id: "active_shoes", label: "Active Shoes" },
  { id: "active_wear", label: "Active Wear" },
  { id: "joystep", label: "Joystep" },' \
  "la lista se vuelve a escribir a mano (aunque hoy esté completa)"

mutar src/components/ventas/ClientesView.tsx \
  '{EMPRESA_PILLS.map(p => {' \
  '{EMPRESA_PILLS.filter(p => p.id !== "joystep").map(p => {' \
  "la constante deriva bien pero la PANTALLA esconde joystep al pintar"

mutar src/components/ventas/ClientesView.tsx \
  '  { id: "todas", label: "Todas" },' \
  '  { id: "todas", label: "Todas" },
  { id: "confecciones_boston", label: "Confecciones Boston" },' \
  "alguien agrega Boston a la tira (el bug OPUESTO, y más caro)"

# ── 7. La ficha por dirección ───────────────────────────────────────────────
mutar "src/app/api/clientes/[codigo]/route.ts" \
  '  if (!(await esCodigoDelGrupo(codigo))) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // El año se corta en hora PANAMÁ' \
  '  // El año se corta en hora PANAMÁ' \
  "el GET de la ficha deja de preguntar por el mundo (servía Boston)"

mutar "src/app/api/clientes/[codigo]/route.ts" \
  '  if (!(await esCodigoDelGrupo(codigo))) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const { data, error } = await supabaseServer
    .from("clientes_master")
    .update(allowed)' \
  '  const { data, error } = await supabaseServer
    .from("clientes_master")
    .update(allowed)' \
  "el PATCH deja de preguntar (se podían EDITAR 4.915 fichas de Boston)"

mutar "src/app/api/clientes/[codigo]/route.ts" \
  'return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // El año se corta en hora PANAMÁ' \
  'return NextResponse.json({ error: "Es de Boston" }, { status: 403 });
  }

  // El año se corta en hora PANAMÁ' \
  "el 404 se vuelve 403 y delata qué códigos existen en Boston"

mutar src/lib/clientes/mundos.ts \
  '  if (error || !data) return true;' \
  '  if (error || !data) return false;' \
  "el guard falla CERRADO (un hipo de la base esconde el Directorio entero)"

mutar src/lib/clientes/mundos.ts \
  '  if (data.length === 0) return true;' \
  '  if (data.length === 0) return false;' \
  "los 3 huérfanos del grupo (D-201, D-173, D-101) dejan de tener ficha"

# ── CONTROL — NO debe dar rojo ───────────────────────────────────────────────
echo "── control (no debe dar rojo) ───────────────────────────────────────────"

control src/lib/switch-api/sync-clientes-master.ts \
  'const BATCH = 500;' \
  'const BATCH = 400;' \
  "cambiar el tamaño del lote del upsert (no toca ninguna regla)"

restaurar
echo "─────────────────────────────────────────────────────────────────────────"
echo "cazadas: $cazadas · sobrevivientes: $sobrevivientes · controles ok: $controles_ok · controles mal: $controles_mal"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ]
