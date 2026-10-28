/** An error whose message is safe to show the writer. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function json(data: unknown, init: { status?: number; cookies?: string[] } = {}): Response {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const cookie of init.cookies ?? []) headers.append('Set-Cookie', cookie);
  return Response.json(data, { status: init.status ?? 200, headers });
}

/** Runs a handler and turns thrown errors into JSON responses. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return json({ error: 'Something went wrong on our side. Try again.' }, { status: 500 });
  }
}

export async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    const body = await request.json();
    if (body && typeof body === 'object') return body as Partial<T>;
  } catch {
    // Fall through
  }
  throw new HttpError(400, 'The request was not valid JSON.');
}

/**
 * Refuse writes sent from other sites. The session cookie is SameSite=Lax,
 * and this also covers browsers that send it anyway.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    // Treated as a mismatch below
  }
  if (originHost !== host) {
    throw new HttpError(403, 'Requests must come from Focus itself.');
  }
}

/** Trimmed, single-spaced text within a length limit, or '' when missing. */
export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: unknown, what: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new HttpError(400, `Missing or invalid ${what}.`);
  }
  return value;
}
