#!/usr/bin/env bash
# Verificador de mutaciones — sesión vigente no pide contraseña (3-sep-2026).
#
# Cada mutación rompe una defensa a propósito y exige que el candado
# (sesion-vigente-no-pide-contrasena.test.tsx) se ponga ROJO.
#
# 🩸 Restaura por COPIA y no con `git checkout` (archivos nuevos en la rama).
# 🩸 Reemplazo LITERAL con python (el código tiene `||`, `/` y comillas).
# 🩸 `mutar()` EXIGE que el archivo cambie y `probar()` exige tests colectados.
set -uo pipefail
cd "$(dirname "$0")/.."

TEST=src/__tests__/lib/sesion-vigente-no-pide-contrasena.test.tsx
ARCHIVOS=(
  src/app/api/auth/sesion/route.ts
  src/app/page.tsx
)
TMP=$(mktemp -d); trap 'for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; rm -rf "$TMP"' EXIT INT TERM PIPE
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f"|tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; }

mutar() { # $1 archivo, $2 buscar, $3 reemplazar
  python3 - "$1" "$2" "$3" <<'PY'
import sys
path, buscar, reemplazar = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(path).read()
if buscar not in src:
    print(f"  ✗ NO SE PUDO MUTAR: patrón ausente en {path}", file=sys.stderr)
    sys.exit(3)
open(path, "w").write(src.replace(buscar, reemplazar, 1))
PY
}

CAZADAS=0; TOTAL=0
probar() { # $1 descripción — espera que el test FALLE
  TOTAL=$((TOTAL+1))
  SALIDA=$(npx vitest run "$TEST" 2>&1)
  if ! echo "$SALIDA" | grep -qE "Tests[[:space:]]+[0-9]+ (passed|failed)"; then
    echo "  💀 corrida muerta (no colectó tests) — $1"
  elif echo "$SALIDA" | grep -q "failed"; then
    echo "  ✅ CAZADA — $1"
    CAZADAS=$((CAZADAS+1))
  else
    echo "  ❌ SOBREVIVIÓ — $1"
  fi
  restaurar
}

R=src/app/api/auth/sesion/route.ts
P=src/app/page.tsx

echo "1) El endpoint deja pasar una sesión REVOCADA"
mutar "$R" '.eq("revoked", false)' '' && probar "quitar el filtro revoked=false"

echo "2) El endpoint NO verifica contra user_sessions"
mutar "$R" 'if (sesErr || !ses || ses.user_name !== parsed.userName) {
    return noAutorizado();
  }' '' && probar "saltarse el chequeo de user_sessions"

echo "3) El endpoint acepta el token de OTRO usuario"
mutar "$R" 'ses.user_name !== parsed.userName' 'false' && probar "quitar la comparación de user_name"

echo "4) El endpoint deja entrar a un usuario DESACTIVADO"
mutar "$R" '.eq("active", true)' '' && probar "quitar el filtro active=true"

echo "5) La pantalla redirige al rol EQUIVOCADO (cliente a /home)"
mutar "$P" 'data.role === "cliente" ? "/catalogo/reebok" : "/home"' '"/home"' && probar "todos a /home"

echo "6) La pantalla muestra el formulario aunque haya sesión viva"
mutar "$P" 'useState(!expired)' 'useState(false)' && probar "formulario visible mientras verifica"

echo "7) La pantalla entra sin rehidratar sessionStorage"
mutar "$P" 'storeSession(data);' '' && probar "saltarse storeSession"

echo "8) La pantalla pregunta por la sesión aunque venga de ?expired=1"
mutar "$P" 'if (expired) return;
    let cancelado = false;' 'let cancelado = false;' && probar "ignorar expired=1"

echo "9) La pantalla entra con un 200 SIN rol"
mutar "$P" 'if (!data?.role) throw new Error("sin rol");' '' && probar "aceptar payload sin rol"

echo ""
echo "Mutaciones cazadas: $CAZADAS/$TOTAL"
[ "$CAZADAS" -eq "$TOTAL" ]
