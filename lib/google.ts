/**
 * Gmail + Calendar read layer (Gate 2 / Flag C). Token-agnostic: every function
 * takes a Google access token (sourced + refreshed in lib/google-auth, next
 * slice). READ-ONLY — scopes are gmail.readonly + calendar.readonly. RO reads to
 * draft; the human sends (you-send via dispatch). No write/send calls here.
 */

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary";

async function gjson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** base64url → text (Gmail encodes bodies base64url). */
function decodeB64Url(data: string): string {
  try {
    const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const bin = atob(b64 + pad);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

interface GPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GPart[];
}

/** Walk the MIME tree for the best text body (prefer text/plain). */
function extractBody(payload: GPart | undefined): string {
  if (!payload) return "";
  const plain = findPart(payload, "text/plain");
  if (plain) return plain;
  const html = findPart(payload, "text/html");
  return html ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : "";
}
function findPart(p: GPart, mime: string): string {
  if (p.mimeType === mime && p.body?.data) return decodeB64Url(p.body.data);
  for (const child of p.parts ?? []) {
    const got = findPart(child, mime);
    if (got) return got;
  }
  return "";
}

export interface RecruiterEmail {
  id: string;
  from: string;
  subject: string;
  date: string;
  body: string;
}

interface GMessage {
  id: string;
  payload?: GPart & { headers?: { name: string; value: string }[] };
}

/** Recent inbox messages (last 30d, primary-ish), parsed for the classifier. */
export async function gmailRecent(token: string, max = 12): Promise<RecruiterEmail[]> {
  const q = encodeURIComponent("newer_than:30d -category:promotions -category:social in:inbox");
  const list = await gjson<{ messages?: { id: string }[] }>(
    `${GMAIL}/messages?maxResults=${max}&q=${q}`,
    token,
  );
  const out: RecruiterEmail[] = [];
  for (const { id } of list.messages ?? []) {
    const m = await gjson<GMessage>(`${GMAIL}/messages/${id}?format=full`, token);
    const headers = m.payload?.headers ?? [];
    const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    out.push({
      id: m.id,
      from: h("from"),
      subject: h("subject"),
      date: h("date"),
      body: extractBody(m.payload).slice(0, 4000),
    });
  }
  return out;
}

export interface CalEvent {
  summary: string;
  start: string;
  end: string;
}

/** Upcoming events — used so RO never offers a time that isn't actually free. */
export async function calendarUpcoming(token: string, max = 12): Promise<CalEvent[]> {
  const timeMin = new Date().toISOString();
  const data = await gjson<{
    items?: { summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }[];
  }>(
    `${CAL}/events?singleEvents=true&orderBy=startTime&maxResults=${max}&timeMin=${encodeURIComponent(timeMin)}`,
    token,
  );
  return (data.items ?? []).map((e) => ({
    summary: e.summary ?? "(busy)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
  }));
}
