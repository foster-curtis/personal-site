/**
 * Fakes the Supabase JS client shape used across this codebase, so route handlers and
 * lib functions can be tested without a real database. `vi.mock("@/lib/supabase/admin")`
 * (and `/client`, `/server`) should have their factory functions return an instance of
 * this in place of a real client — see the module docblocks on those files for why that
 * works cleanly (they're per-call factories, not singletons).
 *
 * Usage is scripted, not stubbed per-call: queue up what each `.from(table)` / `.rpc(name)`
 * call should return, in the order the code under test will make them, then run the code.
 *
 *   const supabase = createMockSupabaseClient();
 *   supabase.queueFrom("feedback_links", { data: linkRow, error: null });
 *   supabase.queueFrom("feedback_responses", { data: null, error: pgrst116Error() });
 *   // ... call the route handler, which does two sequential `.from()` calls ...
 */

export interface PostgrestErrorLike {
  message: string;
  details: string;
  hint: string;
  code: string;
}

export interface QueuedResult<T = unknown> {
  data: T | null;
  error: PostgrestErrorLike | null;
  count?: number | null;
}

/** PostgREST's code for "no rows returned from `.single()`". */
export function pgrst116Error(message = "JSON object requested, multiple (or no) rows returned"): PostgrestErrorLike {
  return {
    code: "PGRST116",
    message,
    details: "",
    hint: "",
  };
}

function emptyResult<T = unknown>(): QueuedResult<T> {
  return { data: null, error: null };
}

/**
 * A single table's queue of results. Every terminal method in a `.from(table)` chain
 * (`.single()`, or awaiting the builder directly) pops the next queued result — call
 * order in the code under test determines which queued result answers which call.
 */
class TableQueue {
  private queue: QueuedResult[] = [];

  push(result: QueuedResult) {
    this.queue.push(result);
  }

  pop(): QueuedResult {
    const next = this.queue.shift();
    if (!next) {
      throw new Error(
        `supabase-mock: no queued result left for this table — did you queue enough ` +
          `results for every .from() call the code under test makes?`
      );
    }
    return next;
  }
}

/**
 * Chainable, thenable query builder. Every filter/modifier method (`.select()`, `.eq()`,
 * `.in()`, `.order()`, `.limit()`, `.insert()`, `.update()`, `.delete()`, `.single()`)
 * just returns `this` — the queued result already encodes the shape the test wants back,
 * so the builder doesn't need to simulate real filtering logic.
 */
class MockQueryBuilder implements PromiseLike<QueuedResult> {
  private resolved: Promise<QueuedResult> | null = null;

  constructor(private readonly queue: TableQueue) {}

  private resolve(): Promise<QueuedResult> {
    if (!this.resolved) {
      this.resolved = Promise.resolve(this.queue.pop());
    }
    return this.resolved;
  }

  select(_columns?: string, _options?: { count?: string; head?: boolean }): this {
    return this;
  }
  eq(_column: string, _value: unknown): this {
    return this;
  }
  neq(_column: string, _value: unknown): this {
    return this;
  }
  in(_column: string, _values: unknown[]): this {
    return this;
  }
  order(_column: string, _options?: { ascending?: boolean }): this {
    return this;
  }
  limit(_count: number): this {
    return this;
  }
  insert(_values: unknown): this {
    return this;
  }
  update(_values: unknown): this {
    return this;
  }
  delete(): this {
    return this;
  }
  single(): this {
    return this;
  }
  maybeSingle(): this {
    return this;
  }

  then<TResult1 = QueuedResult, TResult2 = never>(
    onfulfilled?: ((value: QueuedResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.resolve().then(onfulfilled, onrejected);
  }
}

class MockStorageBucket {
  constructor(private readonly bucket: string, private readonly storage: MockStorage) {}

  async upload(path: string, _body: unknown, _options?: unknown) {
    return this.storage.popUpload(this.bucket, path);
  }
  async remove(paths: string[]) {
    return this.storage.popRemove(this.bucket, paths);
  }
  async createSignedUrl(path: string, _expiresIn: number) {
    return this.storage.popSignedUrl(this.bucket, path);
  }
}

class MockStorage {
  private uploadQueue: QueuedResult[] = [];
  private removeQueue: QueuedResult[] = [];
  private signedUrlQueue: QueuedResult[] = [];

  from(bucket: string) {
    return new MockStorageBucket(bucket, this);
  }

  queueUpload(result: QueuedResult) {
    this.uploadQueue.push(result);
  }
  queueRemove(result: QueuedResult) {
    this.removeQueue.push(result);
  }
  queueSignedUrl(result: QueuedResult) {
    this.signedUrlQueue.push(result);
  }

  popUpload(_bucket: string, _path: string) {
    return this.uploadQueue.shift() ?? emptyResult();
  }
  popRemove(_bucket: string, _paths: string[]) {
    return this.removeQueue.shift() ?? emptyResult();
  }
  popSignedUrl(_bucket: string, _path: string) {
    return this.signedUrlQueue.shift() ?? emptyResult();
  }
}

export interface MockAuthUser {
  id: string;
  email: string;
  [key: string]: unknown;
}

class MockAuth {
  admin = {
    listUsers: async () => this.listUsersResult,
  };

  private listUsersResult: QueuedResult<{ users: MockAuthUser[] }> = {
    data: { users: [] },
    error: null,
  };
  private userResult: QueuedResult<{ user: MockAuthUser | null }> = {
    data: { user: null },
    error: null,
  };
  private sessionResult: QueuedResult<{ session: unknown }> = {
    data: { session: null },
    error: null,
  };

  setUser(user: MockAuthUser | null) {
    this.userResult = { data: { user }, error: null };
  }
  setSession(session: unknown) {
    this.sessionResult = { data: { session }, error: null };
  }
  setListUsers(users: MockAuthUser[]) {
    this.listUsersResult = { data: { users }, error: null };
  }

  async getUser() {
    return this.userResult;
  }
  async getSession() {
    return this.sessionResult;
  }
  async signOut() {
    return { error: null };
  }
  async exchangeCodeForSession(_code: string) {
    return this.sessionResult;
  }
  onAuthStateChange(_callback: (...args: unknown[]) => void) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
}

export class MockSupabaseClient {
  storage = new MockStorage();
  auth = new MockAuth();

  private tables = new Map<string, TableQueue>();
  private rpcs = new Map<string, QueuedResult[]>();

  private tableQueue(table: string): TableQueue {
    let queue = this.tables.get(table);
    if (!queue) {
      queue = new TableQueue();
      this.tables.set(table, queue);
    }
    return queue;
  }

  /** Queue the result of the next `.from(table)` chain that resolves (in call order). */
  queueFrom<T = unknown>(table: string, result: QueuedResult<T>) {
    this.tableQueue(table).push(result as QueuedResult);
  }

  /** Queue the result of the next `.rpc(name)` call (in call order). */
  queueRpc<T = unknown>(name: string, result: QueuedResult<T>) {
    const queue = this.rpcs.get(name) ?? [];
    queue.push(result as QueuedResult);
    this.rpcs.set(name, queue);
  }

  from(table: string) {
    return new MockQueryBuilder(this.tableQueue(table));
  }

  async rpc(name: string, _params?: Record<string, unknown>) {
    const queue = this.rpcs.get(name);
    const next = queue?.shift();
    if (!next) {
      throw new Error(
        `supabase-mock: no queued result left for rpc "${name}" — call queueRpc("${name}", ...) ` +
          `before invoking the code under test.`
      );
    }
    return next;
  }
}

export function createMockSupabaseClient() {
  return new MockSupabaseClient();
}
