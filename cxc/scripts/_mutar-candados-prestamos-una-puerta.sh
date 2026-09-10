#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN POR MUTACIÓN — «Préstamos: una sola puerta» (10-sep-2026).
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO.
#
# 🩸 SE RESTAURA POR COPIA A /tmp, JAMÁS CON `git checkout`. Un
# `trap 'git checkout …' EXIT` ya borró el trabajo sin commitear de un agente
# que se colgó en medio de la corrida. (Y con archivos NUEVOS en la rama,
# `git checkout` aborta el comando entero sin restaurar nada.)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

CANDADO="src/__tests__/lib/prestamos-una-puerta.test.ts"
ARCHIVOS=(
  "src/lib/prestamos-una-puerta.ts"
  "src/lib/modules.ts"
  "src/lib/asistencia/roles.ts"
  "src/middleware.ts"
  "src/app/asistencia/personas/SeccionPrestamos.tsx"
)

RESPALDO="$(mktemp -d /tmp/mutar-prestamos-puerta.XXXXXX)"
for f in "${ARCHIVOS[@]}"; do mkdir -p "$RESPALDO/$(dirname "$f")"; cp "$f" "$RESPALDO/$f"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$RESPALDO/$f" "$f"; done; }
trap 'restaurar; echo "→ archivos restaurados desde $RESPALDO"' EXIT

TOTAL=0; CAZADAS=0; ESCAPADAS=()
mutar() {
  local nombre="$1" archivo="$2" py="$3"
  if [ ! -f "$RESPALDO/$archivo" ]; then
    echo "  ⛔ $nombre — «${archivo}» NO está en ARCHIVOS: se aborta para no dejarlo mutado."
    exit 1
  fi
  TOTAL=$((TOTAL + 1)); restaurar
  ANTES="$(md5 -q "$archivo")"
  python3 -c "
import io
p='$archivo'
s=io.open(p,encoding='utf-8').read()
$py
io.open(p,'w',encoding='utf-8').write(s)
"
  if [ "$(md5 -q "$archivo")" = "$ANTES" ]; then
    echo "  ⚠️  $nombre — la mutación no aplicó (el ancla cambió); REVISAR"
    ESCAPADAS+=("$nombre (ancla)"); restaurar; return
  fi
  if npx vitest run "$CANDADO" >/dev/null 2>&1; then
    echo "  ❌ ESCAPÓ: $nombre"; ESCAPADAS+=("$nombre")
  else
    echo "  ✅ cazada: $nombre"; CAZADAS=$((CAZADAS + 1))
  fi
  restaurar
}

echo "── EL INTERRUPTOR ──────────────────────────────────────────────────────"
mutar "el interruptor arranca PRENDIDO (la puerta se mueve sin permiso)" src/lib/prestamos-una-puerta.ts \
  's = s.replace("  return !planillaUnidaPrendida();", "  return false;")'
mutar "apagado, /prestamos ya redirige igual" src/lib/prestamos-una-puerta.ts \
  's = s.replace("  if (!planillaUnidaPrendida()) return null;", "")'
mutar "apagado, la persona enlaza a la pestaña que no existe" src/lib/prestamos-una-puerta.ts \
  's = s.replace("  if (planillaUnidaPrendida()) return PESTANA_PRESTAMOS;", "  return PESTANA_PRESTAMOS;")'

echo "── LA QUERY Y EL DESTINO ───────────────────────────────────────────────"
mutar "la query se tira: el destino pierde persona y fechas" src/lib/prestamos-una-puerta.ts \
  'q = chr(34)
s = s.replace("const params = new URLSearchParams(String(search ?? " + q + q + ").replace(/^\\?/, " + q + q + "));", "const params = new URLSearchParams();")'
mutar "el tab de la query gana y el destino cae en otra pestaña" src/lib/prestamos-una-puerta.ts \
  'q = chr(34)
s = s.replace("params.set(" + q + "tab" + q + ", " + q + "prestamos" + q + ");", "if (!params.get(" + q + "tab" + q + ")) params.set(" + q + "tab" + q + ", " + q + "prestamos" + q + ");")'
mutar "el destino apunta al modulo suelto, o sea a si mismo" src/lib/prestamos-una-puerta.ts \
  'q = chr(34)
s = s.replace("PESTANA_PRESTAMOS = " + q + "/asistencia?tab=prestamos" + q, "PESTANA_PRESTAMOS = " + q + "/prestamos" + q)'

echo "── 🔴 LAS RUTAS DE DATOS ───────────────────────────────────────────────"
mutar "se redirigen tambien las rutas /api/prestamos (rompe el modulo)" src/lib/prestamos-una-puerta.ts \
  'q = chr(34)
s = s.replace("  if (p.startsWith(" + q + "/api/" + q + ")) return false;\n", "")'
mutar "cualquier direccion que empiece parecido se redirige" src/lib/prestamos-una-puerta.ts \
  'q = chr(34)
s = s.replace("return p === " + q + "/prestamos" + q + " || p.startsWith(" + q + "/prestamos/" + q + ");", "return p.startsWith(" + q + "/prestamos" + q + ");")'

echo "── 🔴 QUIEN LLEGA A LA PESTAÑA ─────────────────────────────────────────"
mutar "la lista se teclea a mano y deja de derivar de PRESTAMOS_ROLES" src/lib/prestamos-una-puerta.ts \
  'q = chr(34)
s = s.replace("  ...PRESTAMOS_ROLES,\n  " + q + "secretaria" + q + ",", "  " + q + "admin" + q + ",\n  " + q + "secretaria" + q + ",")'
mutar "la secretaria pierde la pestaña (regresion escondida en la mudanza)" src/lib/prestamos-una-puerta.ts \
  'q = chr(34)
s = s.replace("  ...PRESTAMOS_ROLES,\n  " + q + "secretaria" + q + ",", "  ...PRESTAMOS_ROLES,")'
mutar "bodega entra a la pestaña de la plata" src/lib/prestamos-una-puerta.ts \
  'q = chr(34)
s = s.replace("  " + q + "secretaria" + q + ",\n];", "  " + q + "secretaria" + q + ",\n  " + q + "bodega" + q + ",\n];")'
mutar "la pestaña vuelve a autorizarse por ASISTENCIA" src/lib/asistencia/roles.ts \
  'q = chr(34)
s = s.replace("  if (pestana === " + q + "prestamos" + q + ") return vePestanaPrestamos(rol);\n", "")'

echo "── EL MENU Y EL REDIRECT ───────────────────────────────────────────────"
mutar "la ficha se queda en el menu con la pestaña prendida" src/lib/modules.ts \
  's = s.replace("    moduloPrestamosEnElMenu() ? ms : ms.filter((m) => m.key !== MODULO_PRESTAMOS);", "    ms;")'
mutar "la ficha se BORRA de la lista en vez de filtrarse" src/lib/modules.ts \
  'q = chr(34)
s = s.replace("{ key: " + q + "prestamos" + q + ",", "{ key: " + q + "prestamos-retirado" + q + ",")'
mutar "el redirect pasa a 308 (permanente: el favorito no vuelve nunca)" src/middleware.ts \
  's = s.replace("new URL(destino, req.url), 307)", "new URL(destino, req.url), 308)")'
mutar "el middleware deja de redirigir" src/middleware.ts \
  's = s.replace("    if (destino) return NextResponse.redirect(new URL(destino, req.url), 307);", "")'
mutar "la seccion de la persona vuelve a la direccion que rebota" src/app/asistencia/personas/SeccionPrestamos.tsx \
  'q = chr(34)
s = s.replace("href={enlaceAPrestamos()}", "href=" + q + "/prestamos" + q)'

echo ""
echo "── CONTROLES: NO se tienen que cazar ───────────────────────────────────"
control() {
  local nombre="$1" archivo="$2" py="$3"
  restaurar
  python3 -c "
import io
p='$archivo'
s=io.open(p,encoding='utf-8').read()
$py
io.open(p,'w',encoding='utf-8').write(s)
"
  if npx vitest run "$CANDADO" >/dev/null 2>&1; then
    echo "  ✅ control OK (no se cazó): $nombre"
  else
    echo "  ❌ CONTROL CAZADO (el candado aprieta de más): $nombre"
  fi
  restaurar
}
control "cambia la redacción de un comentario" src/lib/prestamos-una-puerta.ts \
  's = s.replace("UNA SOLA PUERTA, NUNCA DOS.", "UNA SOLA PUERTA (y nada mas).")'
control "renombra una variable interna del destino" src/lib/prestamos-una-puerta.ts \
  's = s.replace("const params = new URLSearchParams", "const q0 = new URLSearchParams").replace("params.set", "q0.set").replace("params.toString", "q0.toString")'

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  $CAZADAS de $TOTAL mutaciones cazadas"
if [ ${#ESCAPADAS[@]} -gt 0 ]; then
  echo "  ESCAPARON:"; for e in "${ESCAPADAS[@]}"; do echo "    · $e"; done
fi
echo "═══════════════════════════════════════════════════════════════════════"
