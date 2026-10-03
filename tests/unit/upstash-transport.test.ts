import { describe, expect, it } from 'vitest';
import { createUpstashTransport, UpstashError } from '@/server/store/upstash-transport';

/**
 * The REST transport, with `fetch` supplied by the test.
 *
 * The contract suite covers what the commands *mean* against a real Redis. What
 * is left here is the envelope: the shape of the request, and — the part worth
 * a test of its own — that nothing in an error message can carry the token or
 * the command's arguments into a log aggregator.
 */

const TOKEN = 'secret-token-value';
const URL_BASE = 'https://example.upstash.io';

function transportWith(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
  calls: { url: string; init: RequestInit }[] = [],
) {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return handler(String(input), init ?? {});
  }) as unknown as typeof fetch;
  return {
    transport: createUpstashTransport({ url: URL_BASE, token: TOKEN, fetchImpl, retries: 0 }),
    calls,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('upstash transport', () => {
  it('posts the command as a JSON array with a bearer token', async () => {
    const { transport, calls } = transportWith(() => json({ result: 'OK' }));

    expect(await transport.exec(['SET', 'k', 'v', 'EX', 60])).toBe('OK');

    const call = calls[0]!;
    expect(call.url).toBe(URL_BASE);
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(String(call.init.body))).toEqual(['SET', 'k', 'v', 'EX', '60']);
    expect((call.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('never caches a reply', async () => {
    // Next patches `fetch` to cache inside a render. A cached Redis read would
    // serve a stale session or a stale stock level.
    const { transport, calls } = transportWith(() => json({ result: null }));
    await transport.exec(['GET', 'k']);
    expect(calls[0]!.init.cache).toBe('no-store');
  });

  it('maps a missing key to null rather than undefined', async () => {
    const { transport } = transportWith(() => json({ result: null }));
    expect(await transport.exec(['GET', 'missing'])).toBeNull();
  });

  it('sends a pipeline to /pipeline and returns results in order', async () => {
    const { transport, calls } = transportWith(() =>
      json([{ result: 1 }, { result: 'OK' }]),
    );

    const results = await transport.pipeline([
      ['SADD', 'set', 'member'],
      ['EXPIRE', 'set', 60],
    ]);

    expect(results).toEqual([1, 'OK']);
    expect(calls[0]!.url).toBe(`${URL_BASE}/pipeline`);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual([
      ['SADD', 'set', 'member'],
      ['EXPIRE', 'set', '60'],
    ]);
  });

  it('does not call out at all for an empty pipeline', async () => {
    const { transport, calls } = transportWith(() => json([]));
    expect(await transport.pipeline([])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  /* --- the leakage tests ------------------------------------------------- */

  it('keeps the token out of an error raised by a failed request', async () => {
    const { transport } = transportWith(() => json({ error: 'nope' }, 500));
    const error = await transport.exec(['GET', 'k']).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UpstashError);
    expect(String((error as Error).message)).not.toContain(TOKEN);
    expect(String((error as Error).message)).not.toContain('example.upstash.io');
  });

  it('keeps command arguments out of an error Redis itself returned', async () => {
    // An Upstash error body echoes the command, and commands carry session ids
    // and order references. Only the command name may survive.
    const { transport } = transportWith(() =>
      json({ error: "ERR value is not an integer: 'OWN-ABC1234567'" }),
    );
    const error = await transport.exec(['INCR', 'order:OWN-ABC1234567']).catch((e: unknown) => e);

    const message = String((error as Error).message);
    expect(message).toContain('INCR');
    expect(message).not.toContain('OWN-ABC1234567');
  });

  it('reports an unreachable store without leaking the host', async () => {
    const { transport } = transportWith(() => {
      throw new TypeError('fetch failed: connect ECONNREFUSED 10.0.0.1:6379');
    });
    const error = await transport.exec(['GET', 'k']).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UpstashError);
    expect(String((error as Error).message)).not.toContain('10.0.0.1');
  });

  it('retries a transport failure, but not a command Redis rejected', async () => {
    const attempts: string[] = [];
    const retrying = createUpstashTransport({
      url: URL_BASE,
      token: TOKEN,
      retries: 1,
      fetchImpl: (async () => {
        attempts.push('call');
        // Fail the first attempt the way a dropped connection does.
        if (attempts.length === 1) throw new TypeError('fetch failed');
        return json({ result: 'OK' });
      }) as unknown as typeof fetch,
    });

    expect(await retrying.exec(['GET', 'k'])).toBe('OK');
    expect(attempts).toHaveLength(2);

    // A rejected command is deterministic: retrying it only doubles the damage.
    const rejectedCalls: { url: string; init: RequestInit }[] = [];
    const rejecting = transportWith(() => json({ error: 'ERR bad command' }), rejectedCalls);
    await rejecting.transport.exec(['GET', 'k']).catch(() => undefined);
    expect(rejectedCalls).toHaveLength(1);
  });
});
