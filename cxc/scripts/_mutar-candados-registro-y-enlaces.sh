#!/usr/bin/env bash
# Verificación por MUTACIÓN de los tres arreglos del 18-sep-2026:
# `src/__tests__/lib/registro-de-descargas-y-enlaces.test.ts`.
#
# Se rompe cada regla a propósito y se comprueba que el candado se pone ROJO;
# dos CONTROLES (cambios que NO alteran la regla) tienen que quedar en verde.
#
# 🩸 La restauración va por COPIA, no por `git checkout`: hay archivos NUEVOS en
# esta rama y git aborta el comando entero sin restaurar NADA. Y el reemplazo lo
# hace `_mutar-aplicar.py` con textos LITERALES, no `perl -0pi`.
set -uo pipefail
cd "$(dirname "$0")/.."

CLIENTE=src/lib/logActivityClient.ts
RUTA=src/app/api/activity/route.ts
HREF=src/lib/navegacion/href-del-modulo.ts
HEADER=src/components/AppHeader.tsx
BARRA=src/components/SearchBar.tsx
CFG=next.config.js
CURVAS=src/app/productos/cargar/CurvasView.tsx

TESTS=(src/__tests__/lib/registro-de-descargas-y-enlaces.test.ts)

ARCHIVOS=("$CLIENTE" "$RUTA" "$HREF" "$HEADER" "$BARRA" "$CFG" "$CURVAS")

TMP=$(mktemp -d)
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f" | tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f" | tr / _)" "$f"; done; }
trap restaurar EXIT INT TERM PIPE

cazadas=0; total=0; muertas=0; controles_ok=0; controles=0

mutar() { python3 scripts/_mutar-aplicar.py "$@"; }
correr() { npx vitest run "${TESTS[@]}" 2>&1; }

probar() {  # $1 = nombre de la mutación — TIENE que cazarse
  total=$((total + 1))
  local salida; salida=$(correr)
  if ! echo "$salida" | grep -qE "Test Files"; then
    echo "  ⛔ CORRIDA MUERTA — $1"; muertas=$((muertas + 1)); restaurar; return
  fi
  if echo "$salida" | grep -qE "Tests +.*failed"; then
    echo "  ✅ CAZADA ($(echo "$salida" | grep -oE "[0-9]+ failed" | head -1)) — $1"; cazadas=$((cazadas + 1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

controlar() {  # $1 = nombre del control — NO tiene que cazarse
  controles=$((controles + 1))
  local salida; salida=$(correr)
  if echo "$salida" | grep -qE "Test Files" && ! echo "$salida" | grep -qE "Tests +.*failed"; then
    echo "  ✅ CONTROL en verde (esperado) — $1"; controles_ok=$((controles_ok + 1))
  else
    echo "  ❌ CONTROL se puso rojo (NO esperado) — $1"
  fi
  restaurar
}

echo "== 1. el contador vuelve a tragarse el error del servidor =="
mutar "$CLIENTE" '      if (!res.ok) {' '      if (false) {' \
&& probar 'un 500 vuelve a pasar en silencio'

echo "== 2. una red caída vuelve a callar =="
mutar "$CLIENTE" '    .catch((err) => {
      console.warn(' '    .catch((err) => {
      void err;
      const callar = (..._a: unknown[]) => {};
      callar(' \
&& probar 'el fallo de red no se dice'

echo "== 3. el aviso no sobrevive a cerrar la pestaña =="
mutar "$CLIENTE" '    keepalive: true,' '    keepalive: false,' \
&& probar 'sin keepalive la anotación se pierde al navegar'

echo "== 4. se anota en otra dirección =="
mutar "$CLIENTE" 'export const RUTA_ACTIVIDAD = "/api/activity";' \
                 'export const RUTA_ACTIVIDAD = "/api/actividad";' \
&& probar 'el POST va a una ruta que no existe'

echo "== 5. vuelve la columna que la tabla NO tiene =="
mutar "$RUTA" '    entity_type: module,' '    module,' \
&& probar 'el insert vuelve a nombrar `module`'

echo "== 6. el nombre de quien descargó se pierde =="
mutar "$RUTA" '    ...(session.userName ? { user_name: session.userName } : {}),' '' \
&& probar 'details deja de decir quién fue'

echo "== 7. el insert vuelve a fallar callado =="
mutar "$RUTA" '    console.error("[api/activity] insert failed:", error.message, { action, module });' '' \
&& probar 'el servidor no deja rastro del fallo'

echo "== 8. uno de los cinco botones deja de anotar =="
mutar "$CURVAS" '        action: "descarga_tallas",' '        action: "bajada_tallas",' \
&& probar 'Tallas por bulto deja de contarse'

echo "== 9. el breadcrumb vuelve a adivinar la dirección recortando =="
mutar "$HREF" '  if (modulo) return modulo.href;' '  if (false && modulo) return modulo.href;' \
&& probar 'Plantilla Switch vuelve a apuntar a /productos'

echo "== 10. el encabezado deja de usar la función =="
mutar "$HEADER" '          const moduleBaseHref = hrefDelModulo(pathname);' \
                '          const moduleBaseHref = pathname.split("/").slice(0, 2).join("/") || "/home";' \
&& probar 'vuelve el recorte adentro del encabezado'

echo "== 11. deja de fallar ABIERTA: una ruta ajena se queda sin enlace =="
mutar "$HREF" '  return pathname.split("/").slice(0, 2).join("/") || "/home";' '  return "";' \
&& probar 'una dirección que no es de ningún módulo pierde su enlace'

echo "== 12. el redirect de /productos se come /productos/cargar =="
mutar "$CFG" '{ source: "/productos", destination: "/productos/cargar", permanent: false },' \
             '{ source: "/productos/:path*", destination: "/productos/cargar", permanent: false },' \
&& probar 'el módulo entero redirige a sí mismo en un bucle'

echo "== 13. vuelve el ?search= que nadie lee =="
mutar "$BARRA" '    return { label: "Ir a Préstamos", href: "/prestamos" };' \
               '    return { label: "Ir a Préstamos", href: "/prestamos?search=x" };' \
&& probar 'el atajo vuelve a mandar un parámetro muerto'

echo "== 14. el rótulo vuelve a prometer una búsqueda que no ocurre =="
mutar "$BARRA" '    return { label: "Ir a Préstamos", href: "/prestamos" };' \
               '    return { label: "Buscar préstamos de la persona", href: "/prestamos" };' \
&& probar 'el atajo promete buscar y solo abre el módulo'

echo "== 15. se cae el ?search= de CXC, que SÍ se lee =="
mutar "$BARRA" 'href: `/cxc?search=${encodeURIComponent(client)}`' 'href: `/cxc`' \
&& probar 'se retira un parámetro que sí tenía lector'

echo "== CONTROL A. un comentario cambia (nada de conducta) =="
mutar "$HREF" '// 🔑 FALLA ABIERTA: una dirección que no es de ningún módulo' \
              '// 🔑 FALLA ABIERTA (y así se queda): una dirección que no es de ningún módulo' \
&& controlar 'comentario en el módulo de la dirección'

echo "== CONTROL B. se renombra una variable interna (misma conducta) =="
mutar "$HREF" '  const modulo = key ? ALL_MODULES.find((m) => m.key === key) : null;
  if (modulo) return modulo.href;' \
              '  const encontrado = key ? ALL_MODULES.find((m) => m.key === key) : null;
  if (encontrado) return encontrado.href;' \
&& controlar 'nombre de la variable del módulo encontrado'

echo
echo "== RESULTADO: $cazadas de $total mutaciones cazadas · $muertas corridas muertas · $controles_ok de $controles controles en verde =="
