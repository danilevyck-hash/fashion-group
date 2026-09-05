// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE ASISTENCIA — GET (todo) y PUT (una persona).
//
// GET devuelve TRES cosas juntas porque la pantalla las necesita juntas:
//   1. la lista de códigos que YA marcaron en el reloj (aunque nadie los haya
//      configurado — son los que hay que terminar de llenar),
//   2. la ficha guardada de cada uno (nombre, salario, jornada, empresa),
//   3. las reglas del cálculo.
//
// 🩸 EL UNIVERSO SON LOS CÓDIGOS DEL RELOJ, NO LAS FICHAS GUARDADAS. Si la lista
// saliera de `asistencia_personas`, arrancaría VACÍA y nadie sabría que hay 37
// personas marcando. El reloj manda códigos numéricos con el nombre en blanco:
// esta pantalla es el único lugar donde el código 6 se vuelve una persona con
// sueldo y empresa.
//
// Historia (ago-2026): todo lo que se leía acá AGUANTABA que la migración no
// estuviera corrida — devolvía la lista del reloj sin fichas y avisaba qué
// archivo faltaba; y el PUT reintentaba el guardado sin cada columna que el
// error nombrara. 🔴 Tolerancia retirada el 3-sep-2026: las siete migraciones
// de `asistencia_personas` existen en producción (lista en el encabezado de
// `config-server.ts`). Hoy un error de la base es un 500 con el mensaje; los
// campos `avisoMigracion*`/`puede*` de la respuesta quedan CONSTANTES (nunca
// hay aviso, siempre se puede) y se conservan porque `ConfiguracionTab` los
// lee.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { supabaseServer } from "@/lib/supabase-server";
import { leerDeudaPorCodigo } from "@/lib/prestamos-lista-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { diaPanama } from "@/lib/asistencia/reporte";
import {
  validarPersona,
  valorMinuto,
  REGLAS_DEFAULT,
  type Jornada,
} from "@/lib/asistencia/config";
import { rataPorHoraCalculo } from "@/lib/asistencia/rata";
import { agruparPorCodigo, partesDe, validarReparto } from "@/lib/asistencia/reparto";
import type { ParteReparto } from "@/lib/asistencia/planilla";
import {
  leerReglas,
  leerPersonas,
  TABLA_PERSONAS,
  DIAS_VENTANA_PERSONAS,
  vigenciaDeFila,
  servicioProfesionalDeFila,
  pagaSegurosDeFila,
  baseSegurosDeFila,
  noMarcaRelojDeFila,
  leerRepartos,
} from "@/lib/asistencia/config-server";
import {
  COLUMNA_SERVICIO_PROFESIONAL,
  validarServicioProfesional,
} from "@/lib/asistencia/participacion";
import { COLUMNA_PAGA_SEGUROS, validarPagaSeguros } from "@/lib/asistencia/seguros";
import { COLUMNA_NO_MARCA_RELOJ, validarNoMarcaReloj } from "@/lib/asistencia/sueldo-fijo";
import { COLUMNA_BASE_SEGUROS, validarBaseSeguros } from "@/lib/asistencia/seguros-base";
import {
  COLS_SALDO_VACACIONES,
  numeroDeDias,
  validarSaldoInicial,
} from "@/lib/asistencia/saldo-vacaciones";
import { hoyPanama } from "@/lib/fecha-panama";
import { crearDirectorio, compararPersonas } from "@/lib/asistencia/directorio";
import {
  avisoMarcasPosteriores,
  fraseBaja,
  marcoDespuesDeLaBaja,
  tieneBaja,
  validarVigencia,
  type MarcaPosterior,
} from "@/lib/asistencia/vigencia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** La ventana de marcaciones es la MISMA que la del resto del módulo: una
 *  pantalla que ve 180 días y otra que ve 90 mostrarían universos distintos. */
const DIAS_VENTANA = DIAS_VENTANA_PERSONAS;

interface FilaMarca {
  empleado_codigo: string | null;
  empleado_nombre: string | null;
  ocurrio_en: string;
  dispositivo: string | null;
}

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  try {
    const desde = new Date(Date.now() - DIAS_VENTANA * 86_400_000).toISOString();

    // Paginado con verificación contra el COUNT: PostgREST corta en 1.000 filas
    // EN SILENCIO, y con 3.287 marcaciones cargadas eso dejaría códigos afuera.
    const marcas = await leerTodoPaginado<FilaMarca>(
      "asistencia_marcaciones (configuración)",
      (pedirCount, from, to) =>
        supabaseServer
          .from("asistencia_marcaciones")
          .select(
            "empleado_codigo, empleado_nombre, ocurrio_en, dispositivo",
            pedirCount ? { count: "exact" } : {},
          )
          .gte("ocurrio_en", desde)
          .order("ocurrio_en", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    );

    // Si cualquiera de las tres lecturas falla, se sale por el `catch` con un
    // 500 y el mensaje (tolerancia a la DDL retirada el 3-sep-2026).
    const [{ reglas }, { filas }, repRes, deudaDe] = await Promise.all([
      leerReglas(),
      leerPersonas(),
      leerRepartos(),
      // 🔴 Cuánto debe cada persona en Préstamos. Es lo que hace falta para
      // avisar «Debe $100 — descuéntalo de la liquidación» EN EL MOMENTO en que
      // se marca la fecha de salida, que es cuando se decide la liquidación.
      // Nunca tumba esta pantalla: si Préstamos no contesta, el mapa viene vacío.
      leerDeudaPorCodigo(),
    ]);

    // El día de hoy en Panamá. Solo decide cómo se REDACTA la baja («Renunció»
    // vs «Renuncia» cuando la fecha es futura); no filtra ni calcula nada.
    const hoy = diaPanama(new Date().toISOString());

    // Qué se sabe de cada código POR EL RELOJ.
    interface Visto {
      marcaciones: number;
      ultima: string;
      nombreReloj: string | null;
      dispositivo: string | null;
    }
    const vistos = new Map<string, Visto>();
    for (const m of marcas) {
      const cod = (m.empleado_codigo ?? "").trim();
      if (!cod) continue;
      const v = vistos.get(cod);
      if (!v) {
        vistos.set(cod, {
          marcaciones: 1,
          ultima: m.ocurrio_en,
          // El reloj lo manda vacío en todas las filas medidas; se guarda igual
          // por si alguna vez llega, y sirve de semilla del nombre.
          nombreReloj: (m.empleado_nombre ?? "").trim() || null,
          dispositivo: m.dispositivo,
        });
      } else {
        v.marcaciones += 1;
        if (m.ocurrio_en > v.ultima) v.ultima = m.ocurrio_en;
        if (!v.nombreReloj && (m.empleado_nombre ?? "").trim()) {
          v.nombreReloj = (m.empleado_nombre ?? "").trim();
        }
        if (!v.dispositivo) v.dispositivo = m.dispositivo;
      }
    }

    // 🔴 QUIÉN REPARTE SU SUELDO ENTRE DOS EMPRESAS. Se valida con la MISMA
    // función que usa la planilla: si la ficha enseñara un reparto que el motor
    // rechaza, la pantalla estaría prometiendo un pago que no ocurre.
    const repartoPorCodigo = agruparPorCodigo(repRes.filas);

    const fichas = new Map(filas.map((f) => [String(f.empleado_codigo), f]));
    // El MISMO traductor que usan Justificaciones, Horarios, el Reporte y los
    // exports. Se arma con las fichas ya leídas: no hay una segunda consulta.
    const directorio = crearDirectorio(filas);

    // Universo = códigos del reloj ∪ fichas guardadas. La unión importa: alguien
    // que dejó de marcar hace meses no debe desaparecer de su propia planilla.
    const codigos = new Set<string>([...vistos.keys(), ...fichas.keys()]);

    // Quién ya no trabaja acá. Los que marcaron y NO tienen ficha (48 a 53) no
    // pasan por acá a propósito: sin ficha no hay baja posible, y quedan como
    // pendientes de configurar, que es lo que son.
    const marcasPosteriores: MarcaPosterior[] = [];

    const personas = [...codigos].map((codigo) => {
      const v = vistos.get(codigo);
      const f = fichas.get(codigo);
      const salario =
        f?.salario_mensual === null || f?.salario_mensual === undefined
          ? null
          : Number(f.salario_mensual);
      const jornada = (Number(f?.jornada_semanal) === 40 ? 40 : 48) as Jornada;

      // La baja de esta persona, si la tiene.
      const vig = f ? vigenciaDeFila(f) : null;
      // 🔴 Sin ficha NO se puede estar fuera de planilla: la bandera vive en la
      // ficha. Un código que marca y nadie configuró sigue siendo un pendiente.
      const servicioProfesional = f ? servicioProfesionalDeFila(f) : false;
      // 🔑 Sin ficha, SÍ paga seguros: es el default de siempre y lo que hace
      // que un código todavía sin configurar no aparezca como una excepción.
      const pagaSeguros = f ? pagaSegurosDeFila(f) : true;
      // 🔑 Sin ficha NO hay base propia: los seguros salen del bruto, que es el
      // default de siempre. Es el monto de UNA QUINCENA — ver `seguros-base.ts`.
      const baseSeguros = f ? baseSegurosDeFila(f) : null;
      // 🔴 Sin ficha NO se puede cobrar fijo: la bandera vive en la ficha. Un
      // código que marca y nadie configuró sigue siendo un pendiente.
      const noMarcaReloj = f ? noMarcaRelojDeFila(f) : false;
      // 🔴 EL REPARTO, ya validado. Vacío = cobra entero en su empresa, que es
      // el caso de 36 de las 37 fichas. `motivoReparto` trae el porqué cuando
      // hay filas cargadas y el guard las rechaza — rechazar sí, esconder no.
      const filasReparto = repartoPorCodigo.get(codigo);
      const reparto: ParteReparto[] = partesDe(salario, filasReparto);
      const motivoReparto =
        filasReparto && filasReparto.length > 0 && reparto.length === 0
          ? (validarReparto(salario, filasReparto) as { ok: false; error: string }).error
          : null;
      const ultimaMarca = v ? diaPanama(v.ultima) : null;
      const etiqueta = directorio.nombre(codigo) ?? v?.nombreReloj ?? `Código ${codigo}`;
      if (vig && marcoDespuesDeLaBaja(vig, ultimaMarca)) {
        marcasPosteriores.push({
          etiqueta,
          fechaSalida: vig.fechaSalida!,
          ultimaMarca: ultimaMarca!,
        });
      }

      return {
        codigo,
        // Del directorio, no de un `??` escrito acá: la regla de respaldo vive
        // en un solo lugar. El nombre del reloj queda de último por si algún día
        // el aparato empieza a mandarlo (hoy viene vacío en las 3.287 filas).
        nombre: directorio.nombre(codigo) ?? v?.nombreReloj ?? null,
        salarioMensual: Number.isFinite(salario as number) ? (salario as number) : null,
        jornadaSemanal: jornada,
        empresa: f?.empresa ?? null,
        // `false` = el código marca en el reloj pero nadie dijo quién es. Es
        // exactamente lo que la pantalla tiene que destacar.
        configurado: !!f,
        // 🔴 «Va en planilla» o «servicio profesional». La segunda mitad del
        // dato: sigue en el control de asistencia, fuera de todo cálculo de pago.
        servicioProfesional,
        // 🔴 ¿Se le descuentan el social y el educativo? Los dos JUNTOS —ver
        // `seguros.ts`—. `true` mientras nadie diga lo contrario: es el
        // comportamiento que la planilla tenía para las 38 fichas.
        pagaSeguros,
        // 🔴 Sobre QUÉ MONTO se le calculan, por quincena. `null` = sobre el
        // bruto, como toda la vida. No enciende nada: con `pagaSeguros` en
        // `false` las dos columnas siguen en $0,00 aunque haya base.
        baseSeguros,
        // 🔴 Cobra fijo y no pasa por el reloj. Sigue en la planilla, con
        // seguros y todo; lo que se le ignora son las marcaciones.
        noMarcaReloj,
        // 🔴 Su sueldo se paga entre dos empresas y sale en las dos planillas.
        // Es de SOLO LECTURA en esta pantalla: la regla la fija la contadora y
        // los montos tienen que sumar el salario de la ficha. Ver `reparto.ts`.
        reparto,
        motivoReparto,
        // Falta el sueldo, pero la empresa ya está: se puede emitir la planilla
        // de las otras y saber a quién le falta el dato.
        //
        // 🔴 A QUIEN NO VA EN PLANILLA NO LE FALTA EL SALARIO: no lo necesita.
        // Sin esta condición, YULISSA saldría para siempre en «les falta el
        // salario» y ese aviso —el que la contable usa para saber cuánto le
        // queda— dejaría de significar algo.
        faltaSalario:
          !!f && !servicioProfesional && (salario === null || !Number.isFinite(salario as number)),
        marcaciones: v?.marcaciones ?? 0,
        ultimaMarca,
        dispositivo: v?.dispositivo ?? null,
        // ── ALTAS Y BAJAS ────────────────────────────────────────────────────
        // 🔑 `activo` es DERIVADO de la fecha, no un campo aparte: dos fuentes
        // para el mismo hecho es la forma de que se contradigan.
        fechaIngreso: vig?.fechaIngreso ?? null,
        // 🔴 EL SALDO DE VACACIONES, y su FECHA DE CORTE. Los dos juntos o
        // ninguno: un saldo sin fecha es un saldo a un día que nadie sabe, y de
        // esa fecha depende qué vacaciones se restan después. Ver
        // `lib/asistencia/saldo-vacaciones.ts`.
        // 🩸 Normalizado a NÚMERO: la columna es `numeric` y PostgREST la manda
        // como texto. Sin esto la pantalla recibiría `"12.5"` donde su tipo
        // dice `number`, y cualquier comparación numérica de acá en adelante
        // fallaría en silencio.
        saldoVacacionesDias: numeroDeDias(f?.saldo_vacaciones_dias),
        saldoVacacionesCorte: f?.saldo_vacaciones_corte ?? null,
        fechaSalida: vig?.fechaSalida ?? null,
        motivoSalida: vig?.motivoSalida ?? null,
        activo: !tieneBaja(vig),
        /** «Renunció el 12 de agosto de 2026». `null` si sigue trabajando. */
        baja: fraseBaja(vig, hoy),
        marcoDespuesDeLaBaja: marcoDespuesDeLaBaja(vig, ultimaMarca),
        // Derivados, solo para mirar: confirman que los números configurados
        // producen una rata creíble antes de que se calcule ninguna planilla.
        //
        // 🔴 `rataPorHoraCalculo` y NO `rataPorHora`: la primera devuelve la
        // rata A CENTAVOS, que es la que multiplica de verdad en `planilla.ts`.
        // La segunda devuelve 4 decimales y la pantalla enseñaba `$3.0201` donde
        // la planilla de la contable dice `$3.02`. Ver `lib/asistencia/rata.ts`.
        // 🔴 LO QUE DEBE EN PRÉSTAMOS. Se muestra al dar de baja, con nombre y
        // monto: rechazar sí, esconder no — y acá ni siquiera se rechaza nada,
        // solo se dice a tiempo. 0 = no debe.
        deudaPrestamo: deudaDe.get(codigo) ?? 0,
        rataHora: rataPorHoraCalculo(salario, jornada, reglas),
        valorMinuto: valorMinuto(salario, jornada, reglas),
      };
    });

    // ⚠️ ACÁ el orden es al revés que en el resto del módulo, y a propósito:
    // primero los que FALTAN, porque esta pantalla es la lista de pendientes.
    // Dentro de cada grupo manda el comparador compartido, que ordena por nombre
    // y —entre los que no tienen— por número de verdad (5 antes que 49).
    personas.sort((a, b) => {
      if (a.configurado !== b.configurado) return a.configurado ? 1 : -1;
      const pa = { codigo: a.codigo, nombre: a.nombre, etiqueta: a.nombre ?? a.codigo, configurado: a.nombre !== null };
      const pb = { codigo: b.codigo, nombre: b.nombre, etiqueta: b.nombre ?? b.codigo, configurado: b.nombre !== null };
      return compararPersonas(pa, pb);
    });

    // 🩸 EL RESUMEN CUENTA SOLO A LOS ACTIVOS. El aviso de pendientes dice
    // «X de N todavía no salen en la planilla», y quien ya no trabaja acá no es
    // trabajo pendiente de nadie: meterlo en la N infla para siempre un número
    // que la contable usa para saber cuánto le falta.
    const activos = personas.filter((p) => p.activo);

    return NextResponse.json({
      personas,
      reglas,
      reglasDefault: REGLAS_DEFAULT,
      resumen: {
        total: activos.length,
        sinConfigurar: activos.filter((p) => !p.configurado).length,
        sinSalario: activos.filter((p) => p.faltaSalario).length,
        conMarcaciones: activos.filter((p) => p.marcaciones > 0).length,
        /** Los que ya no trabajan acá. Se ven aparte, no mezclados. */
        bajas: personas.length - activos.length,
        /** Marcan y no van en planilla. No son pendientes de nadie. */
        servicioProfesional: activos.filter((p) => p.servicioProfesional).length,
        /** Cobran fijo y no pasan por el reloj. Tampoco son pendientes. */
        noMarcaReloj: activos.filter((p) => p.noMarcaReloj).length,
      },
      // ── CONSTANTES desde el 3-sep-2026 (tolerancia a la DDL retirada) ─────
      // Historia: cada par `avisoMigracion*`/`puede*` decía de entrada qué
      // migración faltaba y apagaba el control correspondiente, en vez de
      // dejar fallar el guardado. Las siete migraciones existen; si una lectura
      // falla hoy, esta respuesta no se arma (500 más abajo). Se conservan
      // con su valor «todo bien» porque `ConfiguracionTab` los lee.
      faltaMigracion: false,
      avisoMigracion: null,
      avisoMigracionBajas: null,
      puedeDarDeBaja: true,
      avisoMigracionServicioProfesional: null,
      puedeMarcarServicioProfesional: true,
      avisoMigracionSeguros: null,
      puedeQuitarSeguros: true,
      avisoMigracionBaseSeguros: null,
      puedeCargarBaseSeguros: true,
      avisoMigracionNoMarcaReloj: null,
      puedeMarcarSueldoFijo: true,
      avisoMigracionSaldoVacaciones: null,
      avisoMigracionReparto: null,
      puedeCargarSaldoVacaciones: true,
      // 🩸 El que no se puede esconder: dada de baja y sigue marcando.
      avisoBajas: avisoMarcasPosteriores(marcasPosteriores),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/configuracion GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Guarda la ficha de UNA persona. La validación entera vive en el servidor. */
export async function PUT(req: NextRequest) {
  const auth = requireAsistencia(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "No se entendió lo que se envió." }, { status: 400 });
  }

  // 🔑 El cuerpo del PUT es la ÚNICA fuente: lo que el formulario haya dejado
  // pasar no importa. El validador recibe los valores crudos y convierte él —
  // con `Number()` afuera, un `null` llegaría como 0 y un salario 0 entraría.
  const r = validarPersona(body);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const p = r.valor;

  // La vigencia se valida APARTE de la ficha, y no dentro de `validarPersona`,
  // porque son dos cosas distintas: una dice QUIÉN es la persona y la otra
  // DESDE CUÁNDO y HASTA CUÁNDO trabaja. Guardar un nombre no debería poder
  // fallar por una fecha, y al revés tampoco.
  const rv = validarVigencia(body);
  if (!rv.ok) return NextResponse.json({ error: rv.error }, { status: 400 });
  const v = rv.valor;

  // Lo mismo con "va en planilla / servicio profesional": es OTRA pregunta —cómo
  // se le paga— y no debería poder tumbar el guardado de un nombre.
  const rs = validarServicioProfesional(body);
  if (!rs.ok) return NextResponse.json({ error: rs.error }, { status: 400 });
  const servicioProfesional = rs.valor;

  // Y lo mismo con los seguros: es OTRA pregunta —si se le retiene o no— y no
  // debería poder tumbar el guardado de un nombre.
  const rseg = validarPagaSeguros(body);
  if (!rseg.ok) return NextResponse.json({ error: rseg.error }, { status: 400 });
  const pagaSeguros = rseg.valor;

  // Y lo mismo con la base propia de los seguros: es OTRA pregunta —sobre qué
  // monto se calculan— y no debería poder tumbar el guardado de un nombre.
  const rbase = validarBaseSeguros(body);
  if (!rbase.ok) return NextResponse.json({ error: rbase.error }, { status: 400 });
  const baseSeguros = rbase.valor;

  // Y lo mismo con el reloj: es OTRA pregunta —si se le miden las marcaciones o
  // cobra fijo— y no debería poder tumbar el guardado de un nombre.
  const rrel = validarNoMarcaReloj(body);
  if (!rrel.ok) return NextResponse.json({ error: rrel.error }, { status: 400 });
  const noMarcaRelojValor = rrel.valor;

  // Y lo mismo con el saldo de vacaciones: es OTRA pregunta —cuántos días le
  // quedan— y no debería poder tumbar el guardado de un nombre.
  const rsal = validarSaldoInicial(body);
  if (!rsal.ok) return NextResponse.json({ error: rsal.error }, { status: 400 });
  const saldoVacacionesDias = rsal.valor;

  // ── 🔴 LA FECHA DE CORTE LA PONE EL SERVIDOR, NUNCA EL NAVEGADOR ──────────
  //
  // El campo que llena contabilidad dice «los días que le quedan HOY», así que
  // el corte es hoy — pero SOLO cuando el número CAMBIA. Si vuelve a guardar la
  // ficha sin tocar el saldo, el corte se queda donde estaba: moverlo
  // absorbería en silencio las vacaciones cargadas entre medio y esos días
  // dejarían de restar sin que nadie se entere.
  //
  // Por eso se relee la fila antes de escribir: el corte guardado es el único
  // que protege de contar dos veces los mismos días, y creerle al cuerpo del
  // pedido sería dejar esa protección en manos de quien la puede pisar.
  let saldoVacacionesCorte: string | null = null;
  if (saldoVacacionesDias !== null) {
    const prev = await supabaseServer
      .from(TABLA_PERSONAS)
      .select(COLS_SALDO_VACACIONES.join(", "))
      .eq("empleado_codigo", p.codigo)
      .maybeSingle();
    if (prev.error) {
      // Un error acá es un error (tolerancia a la DDL retirada el 3-sep-2026):
      // NO se guarda a medias — un "guardado" que se traga el saldo dejaría a
      // la persona sin número y nadie sabría por qué.
      return NextResponse.json({ error: prev.error.message }, { status: 500 });
    }
    const anterior = prev.data as unknown as {
      saldo_vacaciones_dias: number | string | null;
      saldo_vacaciones_corte: string | null;
    } | null;
    // 🩸 SE COMPARAN NÚMEROS, NO LO QUE VENGA. La columna es `numeric` y
    // PostgREST la manda como texto: un `"12.0" === 12` da `false`, y con eso
    // CADA guardado de la ficha movería la fecha de corte a hoy sin que nadie
    // tocara el saldo — o sea, absorbería en silencio las vacaciones cargadas
    // entre medio. Es el modo de fallo exacto que el corte existe para evitar.
    const mismoNumero =
      numeroDeDias(anterior?.saldo_vacaciones_dias) === saldoVacacionesDias
      && !!anterior?.saldo_vacaciones_corte;
    saldoVacacionesCorte = mismoNumero ? anterior!.saldo_vacaciones_corte : hoyPanama();
  }

  const base = {
    empleado_codigo: p.codigo,
    nombre: p.nombre,
    salario_mensual: p.salarioMensual,
    jornada_semanal: p.jornadaSemanal,
    empresa: p.empresa,
    updated_at: new Date().toISOString(),
  };
  const conVigencia = {
    ...base,
    fecha_ingreso: v.fechaIngreso,
    fecha_salida: v.fechaSalida,
    motivo_salida: v.motivoSalida,
  };
  const conServicio = {
    ...conVigencia,
    [COLUMNA_SERVICIO_PROFESIONAL]: servicioProfesional,
  };
  const conTodo = {
    ...conServicio,
    [COLUMNA_PAGA_SEGUROS]: pagaSeguros,
  };
  const conSaldo = {
    ...conTodo,
    saldo_vacaciones_dias: saldoVacacionesDias,
    saldo_vacaciones_corte: saldoVacacionesCorte,
  };
  const conReloj = {
    ...conSaldo,
    [COLUMNA_NO_MARCA_RELOJ]: noMarcaRelojValor,
  };
  const conBaseSeguros = {
    ...conReloj,
    [COLUMNA_BASE_SEGUROS]: baseSeguros,
  };

  // ── UN solo upsert, con TODAS las columnas ──────────────────────────────────
  //
  // Historia (ago-2026): acá había una CASCADA de seis reintentos, uno por
  // migración pendiente (base de seguros → sueldo fijo → saldo de vacaciones →
  // seguros → servicio profesional → bajas → tabla). Cada uno, si el error
  // NOMBRABA su columna, bifurcaba: si el dato nuevo era el default se
  // reintentaba SIN la columna para que guardar un nombre siguiera funcionando;
  // si el dato nuevo venía cargado, 503 con el nombre del archivo, porque un
  // "guardado" que se traga la bandera es peor que un error (Edwin sin cobrar,
  // Rodrigo con $25,18 de más por quincena, una baja que no saca a nadie de la
  // planilla). Había también un 22P02 «la columna todavía es integer y le
  // mandaron medio día» para la ventana entre 20260826040000 y 20260826060000.
  //
  // 🔴 Tolerancia retirada el 3-sep-2026: las siete columnas existen y el saldo
  // ya es `numeric` (verificado por PostgREST: acepta `12.5`). Hoy un error de
  // la base es un 500 con el mensaje — reintentar sin una columna guardaría la
  // ficha SIN el dato que la contadora tecleó, en silencio.
  const { error } = await supabaseServer
    .from(TABLA_PERSONAS)
    .upsert(conBaseSeguros, { onConflict: "empleado_codigo" });

  if (error) {
    console.error("[asistencia/configuracion PUT]", error.message);
    return NextResponse.json({ error: "No se pudo guardar. Intenta de nuevo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, persona: { ...p, ...v, servicioProfesional, pagaSeguros, baseSeguros, noMarcaReloj: noMarcaRelojValor, saldoVacacionesDias, saldoVacacionesCorte } });
}
