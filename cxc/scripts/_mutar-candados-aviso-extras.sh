#!/usr/bin/env bash
# Verificador de mutaciones del AVISO «horas extra sin aprobar» y del freno del
# cierre (arreglado el 3-sep-2026: el aviso leía las horas ya filtradas).
#
# Mismo andamiaje que `_mutar-candados-planilla-guardada.sh`: restaura por
# COPIA, reemplazo LITERAL con python (sin regex ni delimitadores), `mutar()`
# exige que el archivo cambie y `probar()` exige que vitest haya COLECTADO
# tests. La ÚLTIMA mutación es de CONTROL y a propósito no matchea.
set -uo pipefail
cd "$(dirname "$0")/.."

TESTS=(
  src/__tests__/lib/planilla-aviso-extras-sin-aprobar.test.ts
  src/__tests__/lib/asistencia-aprobaciones.test.ts
  src/__tests__/lib/asistencia-planilla-guardada.test.ts
  src/__tests__/lib/boston-acceso.test.ts
)
ARCHIVOS=(
  src/lib/asistencia/planilla.ts
  src/lib/asistencia/aprobaciones.ts
  src/lib/asistencia/planilla-guardada.ts
  src/lib/boston/planilla-sin-dinero.ts
)
TMP=$(mktemp -d); trap 'for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; rm -rf "$TMP"' EXIT INT TERM PIPE
for f in "${ARCHIVOS[@]}"; do cp "$f" "$TMP/$(echo "$f"|tr / _)"; done
restaurar() { for f in "${ARCHIVOS[@]}"; do cp "$TMP/$(echo "$f"|tr / _)" "$f"; done; }

CAZ=0; SOB=0; NOOP=0
probar() {
  local out; out=$(npx vitest run "${TESTS[@]}" 2>&1)
  if ! grep -qE 'Tests +[0-9]+ (failed|passed)' <<<"$out"; then echo "MUERTA"; return; fi
  grep -oE 'Tests +[0-9]+ failed' <<<"$out" | grep -oE '[0-9]+' | head -1 || echo 0
}
mutar() { # archivo  viejo  nuevo  nombre
  local f="$1" antes; antes=$(md5 -q "$f")
  python3 scripts/_mutar-aplicar.py "$f" "$2" "$3" >/dev/null 2>&1
  if [ "$antes" = "$(md5 -q "$f")" ]; then
    echo "  ⛔ NO MUTÓ (patrón muerto) — $4"; NOOP=$((NOOP+1)); restaurar; return
  fi
  local n; n=$(probar)
  if [ "$n" = "MUERTA" ]; then echo "  ⛔ corrida MUERTA (no colectó) — $4"; NOOP=$((NOOP+1))
  elif [ "${n:-0}" -gt 0 ] 2>/dev/null; then echo "  ✅ cazada ($n) — $4"; CAZ=$((CAZ+1))
  else echo "  🔴 SOBREVIVIÓ — $4"; SOB=$((SOB+1)); fi
  restaurar
}

MOTOR=src/lib/asistencia/planilla.ts
AVISO=src/lib/asistencia/aprobaciones.ts
CIERRE=src/lib/asistencia/planilla-guardada.ts
BOSTON=src/lib/boston/planilla-sin-dinero.ts

echo "== control: sin mutar debe dar 0 fallos =="
echo "  fallos: $(probar)"

echo "== EL AVISO VUELVE A LEER LAS HORAS YA FILTRADAS (el defecto) =="
mutar "$AVISO" \
  '    .filter((l) => l.extraNoAprobada != null && l.extraNoAprobada.minutos > 0)
    .map((l) => ({
      codigo: l.codigo,
      etiqueta: l.etiqueta,
      minutos: l.extraNoAprobada!.minutos,
      monto: l.extraNoAprobada!.monto,
    }));' \
  '    .filter((l) => l.extraMedido !== null && l.extraMedido.minutos > 0 && !l.extraAprobada)
    .map((l) => ({
      codigo: l.codigo,
      etiqueta: l.etiqueta,
      minutos: l.extraMedido!.minutos,
      monto: l.extraMedido!.monto,
    }));' \
  '🩸 el aviso vuelve a leer `extraMedido` (el bug del 3-sep)'

mutar "$AVISO" \
  '    .filter((l) => l.extraNoAprobada != null && l.extraNoAprobada.minutos > 0)' \
  '    .filter((l) => l.extraNoAprobada != null && l.extraNoAprobada.minutos > 0 && !l.extraAprobada && l.extraMedido !== null)' \
  'el aviso exige que ADEMÁS haya algo pagado (todo sin aprobar no avisa)'

mutar "$AVISO" \
  '      minutos: l.extraNoAprobada!.minutos,' \
  '      minutos: l.extraMedido?.minutos ?? l.extraNoAprobada!.minutos,' \
  'el aviso dice los minutos PAGADOS cuando hay parcial'

mutar "$AVISO" \
  '      monto: l.extraNoAprobada!.monto,' \
  '      monto: null,' \
  'el aviso pierde el monto'

echo "== EL MOTOR DEJA DE APARTAR LO NO APROBADO =="
mutar "$MOTOR" \
  '      h.extraNoAprobadaMin += c.extraDiurnoMin + c.extraNocturnoMin;
      h.extraNoAprobadaDiurnoMin += c.extraDiurnoMin;
      h.extraNoAprobadaNocturnoMin += c.extraNocturnoMin;' \
  '' \
  '🔴 `medirHoras` deja de apartar `extraNoAprobadaMin` (se pierde en silencio)'

mutar "$MOTOR" \
  '      h.extraNoAprobadaDiurnoMin += c.extraDiurnoMin;
      h.extraNoAprobadaNocturnoMin += c.extraNocturnoMin;' \
  '' \
  'se aparta el total pero no el desglose (la línea queda en null)'

mutar "$MOTOR" \
  '      h.extraNoAprobadaDiurnoMin += c.extraDiurnoMin;
      h.extraNoAprobadaNocturnoMin += c.extraNocturnoMin;' \
  '      h.extraNoAprobadaDiurnoMin += c.extraDiurnoMin + c.extraNocturnoMin;' \
  'todo lo no aprobado se aparta como DIURNO (recargo equivocado)'

mutar "$MOTOR" \
  '    const pagaExtra =
      !aprob?.exigir || aprob.claves.has(`${aprob.codigo}|${d.fecha}`);' \
  '    const pagaExtra = true;' \
  '🔴 se paga todo aunque se exija aprobación'

echo "== LA LÍNEA VALÚA MAL =="
mutar "$MOTOR" \
  '  const extraNoAprobada = resumenExtra(
    horasEfectivas.extraNoAprobadaDiurnoMin || 0,
    horasEfectivas.extraNoAprobadaNocturnoMin || 0,
    rataDeLaLinea,
    reglas,
  );' \
  '  const extraNoAprobada = resumenExtra(
    horasEfectivas.extraNoAprobadaDiurnoMin || 0,
    horasEfectivas.extraNoAprobadaNocturnoMin || 0,
    rataDeLaLinea === null ? null : rataDeLaLinea / 2,
    reglas,
  );' \
  '🔴 valúa con la rata equivocada (la mitad)'

mutar "$MOTOR" \
  '  const extraNoAprobada = resumenExtra(
    horasEfectivas.extraNoAprobadaDiurnoMin || 0,
    horasEfectivas.extraNoAprobadaNocturnoMin || 0,
    rataDeLaLinea,
    reglas,
  );' \
  '  const extraNoAprobada = resumenExtra(
    horasEfectivas.extraNoAprobadaDiurnoMin || 0,
    horasEfectivas.extraNoAprobadaNocturnoMin || 0,
    parte ? centavos(parte.salarioMensual / 173.33) : rataDeLaLinea,
    reglas,
  );' \
  'con reparto valúa con la rata de los $200, no del sueldo completo'

mutar "$MOTOR" \
  '  const extraNoAprobada = resumenExtra(
    horasEfectivas.extraNoAprobadaDiurnoMin || 0,
    horasEfectivas.extraNoAprobadaNocturnoMin || 0,' \
  '  const extraNoAprobada = resumenExtra(
    horasEfectivas.extraNoAprobadaMin || 0,
    0,' \
  'valúa TODO como diurno (pierde el 1,50 del nocturno)'

mutar "$MOTOR" \
  '  const extraNoAprobada = resumenExtra(
    horasEfectivas.extraNoAprobadaDiurnoMin || 0,
    horasEfectivas.extraNoAprobadaNocturnoMin || 0,' \
  '  const extraNoAprobada = resumenExtra(
    horasMedidas.extraNoAprobadaDiurnoMin || 0,
    horasMedidas.extraNoAprobadaNocturnoMin || 0,' \
  'con reparto sale en las DOS líneas (la persona se cuenta dos veces)'

mutar "$MOTOR" \
  '  const extraNoAprobada = resumenExtra(
    horasEfectivas.extraNoAprobadaDiurnoMin || 0,
    horasEfectivas.extraNoAprobadaNocturnoMin || 0,' \
  '  const extraNoAprobada = resumenExtra(
    horasEfectivas.extraDiurnoMin || 0,
    horasEfectivas.extraNocturnoMin || 0,' \
  'la línea llama «sin aprobar» a lo que se PAGÓ'

mutar "$MOTOR" \
  '        centavos((diurnoMin / 60) * reglas.recargoExtraDiurno * rataHora)
        + centavos((nocturnoMin / 60) * reglas.recargoExtraNocturno * rataHora),' \
  '        centavos((diurnoMin / 60) * reglas.recargoExtraDiurno * rataHora)
        + centavos((nocturnoMin / 60) * reglas.recargoExtraDiurno * rataHora),' \
  'el nocturno se valúa al 1,25'

mutar "$MOTOR" \
  '        centavos((diurnoMin / 60) * reglas.recargoExtraDiurno * rataHora)
        + centavos((nocturnoMin / 60) * reglas.recargoExtraNocturno * rataHora),' \
  '        centavos(((diurnoMin + nocturnoMin) / 60) * reglas.recargoExtraDiurno * rataHora),' \
  'una sola columna al 1,25'

mutar "$MOTOR" \
  '  "extraNoAprobadaDiurnoMin", "extraNoAprobadaNocturnoMin",
] as const;' \
  '] as const;' \
  'el reparto no lleva el desglose a la parte de las extras'

mutar "$MOTOR" \
  '  const minutos = diurnoMin + nocturnoMin;
  if (!(minutos > 0)) return null;' \
  '  const minutos = diurnoMin + nocturnoMin;
  if (!(minutos > 30)) return null;' \
  'menos de media hora sin aprobar no se dice'

echo "== EL FRENO DEL CIERRE =="
mutar "$CIERRE" \
  '  const extras = extrasNoAprobadas(lineas);' \
  '  const extras = extrasNoAprobadas([]);' \
  'las horas extra sin aprobar dejan de frenar'

mutar "$CIERRE" \
  '  const extras = extrasNoAprobadas(lineas);' \
  '  const extras = extrasNoAprobadas(lineas.filter((l) => !l.extraAprobada && l.extraMedido !== null));' \
  'el freno vuelve a mirar el rótulo y lo pagado'

echo "== BOSTON: EL MONTO NO VIAJA =="
mutar "$BOSTON" \
  '  salida.extraNoAprobada = en
    ? { minutos: en.minutos ?? 0, diurnoMin: en.diurnoMin ?? 0, nocturnoMin: en.nocturnoMin ?? 0 }
    : null;' \
  '  salida.extraNoAprobada = linea.extraNoAprobada ?? null;' \
  '🔴 el monto de lo no aprobado viaja a quien no ve sueldos'

mutar "$BOSTON" \
  '  salida.extraNoAprobada = en
    ? { minutos: en.minutos ?? 0, diurnoMin: en.diurnoMin ?? 0, nocturnoMin: en.nocturnoMin ?? 0 }
    : null;' \
  '' \
  'lo no aprobado no viaja a Boston'

echo "== CONTROL (a propósito NO matchea) =="
mutar "$MOTOR" 'ESTA_LINEA_NO_EXISTE_EN_NINGUN_LADO' 'nada' 'control: el denunciador tiene que gritar ⛔'

echo
echo "cazadas: $CAZ · sobrevivieron: $SOB · patrones muertos/corridas muertas: $NOOP"
