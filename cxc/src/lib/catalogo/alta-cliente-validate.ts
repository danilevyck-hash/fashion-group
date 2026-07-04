// Validación PURA del alta de cliente Switch desde el catálogo (POST
// /api/catalogo/reebok/clientes-switch). Separada del route para poder
// testearla con vitest sin tocar red ni DB.
//
// Reglas (spec doc Switch pág 27-28 + decisión del flujo):
//   - nombre: requerido, 2..120 caracteres (trim).
//   - codigo: requerido, [a-zA-Z0-9-] de 2 a 20 — el regex que exige Switch,
//     acotado para que el código sea legible en el panel.
//   - telefono: opcional; si viene, solo dígitos / + / - / espacios, y entre
//     7 y 20 caracteres una vez quitados los espacios.

export interface AltaClienteInput {
  nombre?: unknown;
  telefono?: unknown;
  codigo?: unknown;
}

export interface AltaClienteValidada {
  nombre: string;
  codigo: string;
  telefono: string | null;
}

export type AltaClienteResultado =
  | { ok: true; value: AltaClienteValidada }
  | { ok: false; error: string };

const CODIGO_RE = /^[a-zA-Z0-9-]{2,20}$/;
const TELEFONO_RE = /^[0-9+-]{7,20}$/;

export function validarAltaCliente(body: AltaClienteInput): AltaClienteResultado {
  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  if (nombre.length < 2 || nombre.length > 120) {
    return { ok: false, error: "El nombre debe tener entre 2 y 120 caracteres" };
  }

  const codigo = typeof body.codigo === "string" ? body.codigo.trim() : "";
  if (!CODIGO_RE.test(codigo)) {
    return {
      ok: false,
      error: "El código debe tener de 2 a 20 caracteres: solo letras, números y guiones (sin espacios)",
    };
  }

  let telefono: string | null = null;
  const rawTel = typeof body.telefono === "string" ? body.telefono.trim() : "";
  if (rawTel.length > 0) {
    const compacto = rawTel.replace(/\s+/g, "");
    if (!TELEFONO_RE.test(compacto)) {
      return {
        ok: false,
        error: "El teléfono debe tener de 7 a 20 caracteres: solo números, + y guiones",
      };
    }
    telefono = compacto;
  }

  return { ok: true, value: { nombre, codigo, telefono } };
}
