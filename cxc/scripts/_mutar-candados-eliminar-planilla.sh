#!/usr/bin/env bash
# Verifica por MUTACIÓN que `planilla-eliminar-reabierta.test.ts` sirve de algo:
# rompe la regla a propósito, una rotura por vez, y exige que el candado se ponga
# ROJO. Las dos últimas son CONTROLES: cambios inocentes que deben quedar VERDES.
set -u
ARCH="src/lib/asistencia/planilla-guardada.ts"
TEST="src/__tests__/lib/planilla-eliminar-reabierta.test.ts"
COPIA="$(mktemp)"; cp "$ARCH" "$COPIA"
restaurar() { cp "$COPIA" "$ARCH"; }
trap restaurar EXIT

cazadas=0; sueltas=0
probar() { # nombre · esperado(rojo|verde)
  if npx vitest run "$TEST" >/dev/null 2>&1; then res=verde; else res=rojo; fi
  if [ "$res" = "$2" ]; then echo "  ✅ $1 → $res"; cazadas=$((cazadas+1));
  else echo "  ❌ $1 → $res (se esperaba $2)"; sueltas=$((sueltas+1)); fi
  restaurar
}

echo "MUTACIONES (deben salir ROJAS):"
perl -0pi -e 's/if \(esCerrada\(cabecera\.estado\)\) \{/if (false) {/' "$ARCH"
probar "1. deja borrar una CERRADA" rojo

perl -0pi -e 's/if \(pagosDePrestamo > 0\) \{/if (pagosDePrestamo > 99) {/' "$ARCH"
probar "2. ignora los pagos de préstamo" rojo

perl -0pi -e 's/if \(g\.estado !== "reabierta"\) continue;//' "$ARCH"
probar "3. reabiertaDe también trae las cerradas" rojo

perl -0pi -e 's/if \(g\.empresa !== empresa\) continue;//' "$ARCH"
probar "4. reabiertaDe cruza empresas" rojo

perl -0pi -e 's/if \(g\.desde !== rango\.desde \|\| g\.hasta !== rango\.hasta\) continue;//' "$ARCH"
probar "5. reabiertaDe deja de exigir el rango exacto" rojo

perl -0pi -e 's/if \(!mejor \|\| g\.version > mejor\.version\) mejor = g;/mejor = g;/' "$ARCH"
probar "6. se queda con la última en vez de la versión mayor" rojo

echo "CONTROLES (deben salir VERDES):"
perl -0pi -e 's/Déjala reabierta\./Déjala reabierta, y listo./' "$ARCH"
probar "C1. cambiar una palabra del final del texto" verde

perl -0pi -e 's/let mejor: CabeceraGuardada \| null = null;/let mejor: CabeceraGuardada | null = null; \/\/ nota/' "$ARCH"
probar "C2. agregar un comentario" verde

echo
echo "RESULTADO: $cazadas de $((cazadas+sueltas))"
[ "$sueltas" -eq 0 ]
