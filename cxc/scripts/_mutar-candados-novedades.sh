#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ¿Los candados de «QUÉ CAMBIÓ» (9-sep-2026) CAZAN?
#
# Las siete reglas del aviso que sale al entrar a un módulo:
#   1  se ve UNA vez por persona y por novedad — cerrada, no vuelve
#   2  no bloquea nada: es una tira con una ×, no un modal
#   3  máximo 3 a la vez, las más nuevas
#   4  cada novedad es UNA línea, sin jerga
#   5  solo la ve quien TIENE ese módulo
#   6  caduca sola a los 30 días
#   7  nunca sale una de un módulo dentro de otro
# Más: las novedades son DATOS escritos a mano, lo leído se guarda POR PERSONA
# (tabla + respaldo en el navegador) y la pantalla de Daniel es solo de admin.
#
# Se rompe el código a propósito, una cosa por vez, y se exige que los tests se
# pongan ROJOS. Los dos CONTROLES (cambios inocuos) tienen que SOBREVIVIR.
#
# 🩸 LA RESTAURACIÓN VA POR COPIA, NO con `git checkout`: esta rama trae archivos
# NUEVOS y git aborta el comando entero sin restaurar nada.
# 🩸 `probar()` EXIGE ENCONTRAR EL RESUMEN de vitest: una corrida muerta no es
# un verde.
#
#   bash scripts/_mutar-candados-novedades.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS="src/__tests__/lib/novedades.test.ts \
src/__tests__/components/novedades-aviso.test.tsx \
src/__tests__/lib/backup-nada-sin-copia.test.ts \
src/__tests__/lib/data-health-dentro-de-usuarios.test.ts \
src/__tests__/lib/nada-de-voseo.test.ts"

ARCHIVOS=(
  "src/lib/novedades/seleccion.ts"
  "src/lib/novedades/lista.ts"
  "src/components/NovedadesAviso.tsx"
  "src/components/AppHeader.tsx"
  "src/app/api/novedades/route.ts"
  "src/app/api/novedades/resumen/route.ts"
  "src/app/admin/usuarios/page.tsx"
  "src/lib/backup/tablas.ts"
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

# ═══ 1 · cerrada, no vuelve ══════════════════════════════════════════════════

mutar "src/lib/novedades/seleccion.ts" \
  "    .filter((n) => !yaVistas.has(n.id))      // regla 1" \
  "    .filter(() => true)      // regla 1" \
  "1 · la novedad ya cerrada VUELVE a salir"

mutar "src/lib/novedades/lista.ts" \
  '    id: "cxc-saldo-a-favor-no-se-cobra",' \
  '    id: "cxc-descargar-en-vez-de-exportar",' \
  "1 · dos novedades con el MISMO id (cerrar una apaga la otra)"

mutar "src/lib/novedades/lista.ts" \
  '    id: "guias-westland-bien-escrito",' \
  '    id: "westland-bien-escrito",' \
  "1 · un id SIN el prefijo de su módulo"

mutar "src/components/NovedadesAviso.tsx" \
  '    anotarLocal(ids);' \
  '    /* anotarLocal(ids); */' \
  "1 · la × deja de anotar en este navegador (vuelve al recargar)"

mutar "src/components/NovedadesAviso.tsx" \
  '      method: "POST",' \
  '      method: "GET",' \
  "1 · la × deja de anotar en la base (vuelve en el otro aparato)"

# ═══ 2 · no bloquea nada ═════════════════════════════════════════════════════

mutar "src/components/NovedadesAviso.tsx" \
  '      className="w-full border-b border-gray-200 bg-gray-50"' \
  '      className="fixed inset-0 z-50 w-full border-b border-gray-200 bg-gray-50"' \
  "2 · la tira se convierte en modal y tapa la pantalla"

mutar "src/components/NovedadesAviso.tsx" \
  '      role="status"' \
  '      role="dialog"' \
  "2 · la tira se anuncia como diálogo (atrapa al lector de pantalla)"

mutar "src/components/NovedadesAviso.tsx" \
  'className="-my-1 -mr-2 flex min-h-[44px] min-w-[44px]' \
  'className="-my-1 -mr-2 flex h-6 w-6' \
  "2 · la × pierde los 44 px y no se puede tocar con el dedo"

# ═══ 3 · máximo tres, las más nuevas ═════════════════════════════════════════

mutar "src/lib/novedades/seleccion.ts" \
  "export const MAX_A_LA_VEZ = 3;" \
  "export const MAX_A_LA_VEZ = 5;" \
  "3 · salen CINCO a la vez en vez de tres"

mutar "src/lib/novedades/seleccion.ts" \
  "b.fecha.localeCompare(a.fecha)" \
  "a.fecha.localeCompare(b.fecha)" \
  "3 · salen las MÁS VIEJAS primero"

mutar "src/lib/novedades/seleccion.ts" \
  "  return novedadesPendientes(ctx).slice(0, MAX_A_LA_VEZ);" \
  "  return novedadesPendientes(ctx);" \
  "3 · se acaba el corte: salen todas"

mutar "src/lib/novedades/lista.ts" \
  '  /* ── Cuentas por Cobrar — módulo `cxc` ──────────────────────────────────── */' \
  '  {
    id: "cargar-cuarta-del-mismo-dia",
    modulo: "cargar",
    fecha: "2026-09-08",
    texto: "Una cuarta novedad del mismo día, que nadie llegaría a ver nunca.",
  },
  /* ── Cuentas por Cobrar — módulo `cxc` ──────────────────────────────────── */' \
  "3 · un módulo escribe CUATRO el mismo día (dos quedan enterradas)"

# ═══ 4 · una línea, sin jerga ════════════════════════════════════════════════

mutar "src/lib/novedades/lista.ts" \
  'texto: "La flechita gris al lado de cada número descarga ese reporte sin tener que abrir el detalle.",' \
  'texto: "Se agregó un endpoint nuevo que consulta comision_b2b_v9 desde /api/ventas/comisiones.",' \
  "4 · una novedad escrita en jerga de programador"

mutar "src/lib/novedades/lista.ts" \
  'texto: "«CALLE 19» salió de la lista de destinos: sola no dice a qué tienda va el envío.",' \
  'texto: "«CALLE 19» salió de la lista.\nY además cambió otra cosa más, en otro renglón.",' \
  "4 · una novedad de DOS líneas"

mutar "src/lib/novedades/lista.ts" \
  'texto: "Al registrar un pago ahora eliges de dónde salió la plata; ya no viene contestado «Quincena».",' \
  'texto: "Al registrar un pago ahora elegí de dónde salió la plata; ya no viene contestado «Quincena».",' \
  "4 · una novedad escrita en voseo"

# ═══ 5 · solo quien tiene el módulo ══════════════════════════════════════════

mutar "src/lib/novedades/seleccion.ts" \
  "  if (!modulosDelUsuario.includes(moduloKey)) return [];" \
  "  if (false && !modulosDelUsuario.includes(moduloKey)) return [];" \
  "5 · le sale a quien NO tiene ese módulo"

mutar "src/app/api/novedades/route.ts" \
  "      modulosDelUsuario: modulosDe(auth)," \
  "      modulosDelUsuario: ALL_MODULE_KEYS," \
  "5 · el servidor deja de recortar por los módulos de la sesión"

mutar "src/app/api/novedades/route.ts" \
  "    .filter((n) => ids.includes(n.id) && suyos.has(n.modulo))" \
  "    .filter((n) => ids.includes(n.id))" \
  "5 · el POST deja anotar una novedad de un módulo ajeno"

# ═══ 6 · caduca a los 30 días ════════════════════════════════════════════════

mutar "src/lib/novedades/seleccion.ts" \
  "export const DIAS_VIGENCIA = 30;" \
  "export const DIAS_VIGENCIA = 999;" \
  "6 · una novedad de hace TRES MESES sigue saliendo"

mutar "src/lib/novedades/seleccion.ts" \
  "  return dias >= 0 && dias <= DIAS_VIGENCIA;" \
  "  return dias <= DIAS_VIGENCIA;" \
  "6 · una novedad con fecha FUTURA ya se muestra"

# ═══ 7 · nunca de otro módulo ════════════════════════════════════════════════

mutar "src/lib/novedades/seleccion.ts" \
  "    .filter((n) => n.modulo === moduloKey)   // regla 7" \
  "    .filter(() => true)   // regla 7" \
  "7 · en Guías salen también las de Cuentas por Cobrar"

mutar "src/lib/novedades/seleccion.ts" \
  "    if (pathname === m.href || pathname.startsWith(\`\${m.href}/\`)) {" \
  "    if (pathname.startsWith(m.href)) {" \
  "7 · la dirección calza un módulo por PARECIDO (/cxcotra → cxc)"

mutar "src/lib/novedades/lista.ts" \
  '    modulo: "cargar",
    fecha: "2026-09-08",
    texto: "El módulo ahora se llama' \
  '    modulo: "depurador",
    fecha: "2026-09-08",
    texto: "El módulo ahora se llama' \
  "7 · una novedad apunta a un módulo que NO existe"

mutar "src/components/AppHeader.tsx" \
  "      <NovedadesAviso moduloKey={moduloDeRuta(pathname, ALL_MODULES)} />" \
  "      <NovedadesAviso moduloKey={module} />" \
  "7 · la tira recibe el RÓTULO en vez de la key del módulo"

mutar "src/components/NovedadesAviso.tsx" \
  "    if (!moduloKey || !hayAlgoQuePreguntar) { setPendientes([]); return; }" \
  "    if (false) { setPendientes([]); return; }" \
  "7 · se le pregunta al servidor aun fuera de todo módulo"

# ═══ dónde vive lo leído, y la pantalla de Daniel ════════════════════════════

mutar "src/lib/backup/tablas.ts" \
  '  "novedades_vistas",' \
  '' \
  "la tabla nueva se queda SIN clasificar en el respaldo"

mutar "src/app/admin/usuarios/page.tsx" \
  'const SOLO_ADMIN: readonly string[] = ["data-health", "novedades"];' \
  'const SOLO_ADMIN: readonly string[] = ["data-health"];' \
  "la lista de avisos deja de ser solo de admin"

mutar "src/app/api/novedades/resumen/route.ts" \
  '  const auth = requireRole(req, ["admin"]);' \
  '  const auth = requireRole(req, ["admin", "secretaria"]);' \
  "quién leyó qué se lo puede pedir alguien que no es Daniel"

mutar "src/app/api/novedades/route.ts" \
  '  return err.code === "42P01" || err.code === "PGRST205" ||' \
  '  return err.code === "PGRST205" ||' \
  "se pierde la tolerancia a que el cambio de base no haya corrido"

mutar "src/components/NovedadesAviso.tsx" \
  "export const ESPERA_MS = 800;" \
  "export const ESPERA_MS = 0;" \
  "🩸 el aviso vuelve a competir con la carga de la pantalla"

echo "── controles (NO deben ser cazados) ─────────────────────────────────────"

control "src/components/NovedadesAviso.tsx" \
  'border-b border-gray-200 bg-gray-50"' \
  'border-b border-gray-200 bg-white"' \
  "la tira cambia de color de fondo (cosmético)"

control "src/lib/novedades/seleccion.ts" \
  "/** Cuántas se muestran a la vez. Más que esto ya no es un aviso, es una lista. */" \
  "/** Cuántas se muestran a la vez. Tres. */" \
  "se reescribe un comentario"

restaurar
echo "─────────────────────────────────────────────────────────────────────────"
echo "  mutaciones cazadas : $cazadas"
echo "  sobrevivientes     : $sobrevivientes"
echo "  controles sanos    : $controles_ok"
echo "  controles cazados  : $controles_mal"
[ "$sobrevivientes" -eq 0 ] && [ "$controles_mal" -eq 0 ] && echo "  ✅ TODO EN ORDEN" || echo "  🔴 REVISAR"
