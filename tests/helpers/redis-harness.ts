import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createConnection, type Socket } from 'node:net';
import type { RedisArg, RedisTransport } from '@/server/store/redis-store';

/**
 * A real `redis-server`, for the store contract suite.
 *
 * Production talks to Redis over Upstash's REST API, which cannot be exercised
 * without a network and an account. But the part of the Redis driver worth
 * testing is not the HTTP plumbing — it is the Lua, which is where every
 * atomicity guarantee in this application now lives. A mocked transport would
 * test my idea of what Redis does with those scripts, which is exactly the
 * thing I could be wrong about.
 *
 * So this speaks RESP to a `redis-server` on loopback. The commands and the
 * scripts are the same bytes the Upstash transport sends; only the envelope
 * differs. If `redis-server` is not installed, the suite skips rather than
 * silently testing nothing.
 */

export interface RedisHarness extends RedisTransport {
  stop(): Promise<void>;
}

export function redisAvailable(): boolean {
  // Run it rather than looking for it on PATH: a binary that will not start is
  // not available, however present it is on disk.
  const probe = spawnSync('redis-server', ['--version'], { stdio: 'ignore' });
  return probe.error === undefined && probe.status === 0;
}

/** Start a server on an ephemeral port with persistence off. */
export async function startRedis(port: number): Promise<RedisHarness> {
  const server = spawn(
    'redis-server',
    [
      '--port', String(port),
      '--bind', '127.0.0.1',
      // No disk I/O: these databases live for the length of one test file.
      '--save', '',
      '--appendonly', 'no',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  await waitForReady(server, port);
  const client = await connectRedis(port, 'redis-harness');

  return {
    ...client,
    async stop() {
      await client.stop();
      server.kill('SIGKILL');
      await new Promise<void>((resolve) => server.once('exit', () => resolve()));
    },
  };
}

/**
 * A second client on an existing server.
 *
 * This is what makes "two serverless instances" testable: two transports with
 * their own sockets, sharing nothing in process, talking to one database.
 * Connecting a second *server* instead would prove nothing — which is a mistake
 * worth recording, because the first version of this helper did exactly that
 * and the tests failed for a reason that looked like a bug in the store.
 */
export async function connectRedis(port: number, label: string): Promise<RedisHarness> {
  const socket = await connect(port);
  const client = createClient(socket);

  return {
    label,
    exec: client.exec,
    pipeline: async (commands) => {
      const results: unknown[] = [];
      for (const command of commands) results.push(await client.exec(command));
      return results;
    },
    async stop() {
      socket.destroy();
    },
  };
}

function waitForReady(server: ChildProcess, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`redis-server did not start on ${port}`)), 10_000);
    const onData = (chunk: Buffer) => {
      if (chunk.toString().includes('Ready to accept connections')) {
        clearTimeout(timer);
        server.stdout?.off('data', onData);
        resolve();
      }
    };
    server.stdout?.on('data', onData);
    server.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`redis-server exited with ${code}`));
    });
  });
}

function connect(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

/**
 * Minimal RESP2 client.
 *
 * Commands are serialised one at a time and replies are consumed in order, so
 * there is no need to match responses to requests. Enough of the protocol for
 * the commands this store issues, and no more.
 */
function createClient(socket: Socket) {
  let buffer = Buffer.alloc(0);
  const waiting: { resolve: (value: unknown) => void; reject: (error: Error) => void }[] = [];

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const parsed = parse(buffer, 0);
      if (!parsed) return;
      buffer = buffer.subarray(parsed.offset);
      const pending = waiting.shift();
      if (!pending) continue;
      if (parsed.value instanceof Error) pending.reject(parsed.value);
      else pending.resolve(parsed.value);
    }
  });

  return {
    exec(command: readonly RedisArg[]): Promise<unknown> {
      const parts = command.map((arg) => Buffer.from(String(arg)));
      const chunks: Buffer[] = [Buffer.from(`*${parts.length}\r\n`)];
      for (const part of parts) {
        chunks.push(Buffer.from(`$${part.length}\r\n`), part, Buffer.from('\r\n'));
      }
      return new Promise((resolve, reject) => {
        waiting.push({ resolve, reject });
        socket.write(Buffer.concat(chunks));
      });
    },
  };
}

interface Parsed {
  value: unknown;
  offset: number;
}

function parse(buffer: Buffer, start: number): Parsed | null {
  if (start >= buffer.length) return null;
  const end = buffer.indexOf('\r\n', start);
  if (end === -1) return null;

  const type = String.fromCharCode(buffer[start]!);
  const payload = buffer.toString('utf8', start + 1, end);
  const after = end + 2;

  switch (type) {
    case '+':
      return { value: payload, offset: after };
    case '-':
      return { value: new Error(payload), offset: after };
    case ':':
      return { value: Number(payload), offset: after };
    case '$': {
      const length = Number(payload);
      if (length === -1) return { value: null, offset: after };
      if (buffer.length < after + length + 2) return null;
      return { value: buffer.toString('utf8', after, after + length), offset: after + length + 2 };
    }
    case '*': {
      const count = Number(payload);
      if (count === -1) return { value: null, offset: after };
      const items: unknown[] = [];
      let cursor = after;
      for (let i = 0; i < count; i += 1) {
        const item = parse(buffer, cursor);
        if (!item) return null;
        items.push(item.value);
        cursor = item.offset;
      }
      return { value: items, offset: cursor };
    }
    default:
      return { value: null, offset: after };
  }
}
