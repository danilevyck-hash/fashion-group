// Microsoft Graph, solo para LEER los correos de despacho del buzón (Mail.Read
// de aplicación). Sin credenciales no hace nada: `credencialesGraph()` = null.
// Las variables viven en Vercel: GRAPH_TENANT_ID · GRAPH_CLIENT_ID · GRAPH_CLIENT_SECRET.

const GRAPH = "https://graph.microsoft.com/v1.0";

export interface CredencialesGraph {
  tenant: string;
  clientId: string;
  secret: string;
}

export function credencialesGraph(env: NodeJS.ProcessEnv = process.env): CredencialesGraph | null {
  const tenant = env.GRAPH_TENANT_ID?.trim();
  const clientId = env.GRAPH_CLIENT_ID?.trim();
  const secret = env.GRAPH_CLIENT_SECRET?.trim();
  return tenant && clientId && secret ? { tenant, clientId, secret } : null;
}

export async function tokenGraph(c: CredencialesGraph): Promise<string> {
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`token: ${r.status} ${j.error_description ?? ""}`.trim());
  return j.access_token;
}

async function get<T>(token: string, url: string): Promise<T> {
  const r = await fetch(url.startsWith("http") ? url : `${GRAPH}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`graph ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

export interface CorreoGraph {
  id: string;
  subject: string;
  receivedDateTime: string;
  hasAttachments: boolean;
  from?: { emailAddress?: { address?: string } };
}

/** Los correos recibidos desde `desde` (ISO), con todas las páginas. */
export async function correosDesde(token: string, buzon: string, desde: string): Promise<CorreoGraph[]> {
  const q = new URLSearchParams({
    $filter: `receivedDateTime ge ${desde}`,
    $select: "id,subject,receivedDateTime,hasAttachments,from",
    $top: "100",
  });
  let url: string | undefined = `/users/${encodeURIComponent(buzon)}/messages?${q.toString()}`;
  const todos: CorreoGraph[] = [];
  for (let i = 0; url && i < 20; i++) {
    const p: { value: CorreoGraph[]; "@odata.nextLink"?: string } = await get(token, url);
    todos.push(...p.value);
    url = p["@odata.nextLink"];
  }
  return todos;
}

export interface AdjuntoGraph {
  id: string;
  name: string;
  size: number;
}

export async function adjuntosDe(token: string, buzon: string, correoId: string): Promise<AdjuntoGraph[]> {
  const p = await get<{ value: AdjuntoGraph[] }>(
    token,
    `/users/${encodeURIComponent(buzon)}/messages/${encodeURIComponent(correoId)}/attachments?$select=id,name,size`,
  );
  return p.value;
}

export async function bytesDeAdjunto(token: string, buzon: string, correoId: string, adjuntoId: string): Promise<Uint8Array> {
  const a = await get<{ contentBytes?: string }>(
    token,
    `/users/${encodeURIComponent(buzon)}/messages/${encodeURIComponent(correoId)}/attachments/${encodeURIComponent(adjuntoId)}`,
  );
  return new Uint8Array(Buffer.from(a.contentBytes ?? "", "base64"));
}
