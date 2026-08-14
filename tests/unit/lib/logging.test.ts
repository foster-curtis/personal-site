import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/logging";

describe("logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function setNodeEnv(value: string) {
    vi.stubEnv("NODE_ENV", value);
  }

  it("routes info to console.log", () => {
    logger.info("test.event", "hello");
    expect(logSpy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry).toMatchObject({
      level: "info",
      event: "test.event",
      message: "hello",
    });
  });

  it("routes warn to console.warn", () => {
    logger.warn("test.event", "careful");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(entry.level).toBe("warn");
  });

  it("routes error to console.error", () => {
    logger.error("test.event", new Error("boom"));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(entry.level).toBe("error");
  });

  it("swallows debug calls unless NODE_ENV === 'development'", () => {
    setNodeEnv("production");
    logger.debug("test.event", "quiet");
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("emits debug calls when NODE_ENV === 'development'", () => {
    setNodeEnv("development");
    logger.debug("test.event", "loud");
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });

  it("serializes an Error instance to {name, message, stack}, with stack only in development", () => {
    setNodeEnv("production");
    const err = new Error("boom");
    logger.error("test.event", err);
    const prodEntry = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(prodEntry.context.error).toEqual({
      name: "Error",
      message: "boom",
    });
    expect(prodEntry.context.error.stack).toBeUndefined();

    errorSpy.mockClear();
    setNodeEnv("development");
    logger.error("test.event", err);
    const devEntry = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(devEntry.context.error.name).toBe("Error");
    expect(devEntry.context.error.message).toBe("boom");
    expect(typeof devEntry.context.error.stack).toBe("string");
  });

  it("serializes non-Error values via String(error)", () => {
    logger.error("test.event", "a plain string failure");
    const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(entry.context.error).toBe("a plain string failure");

    errorSpy.mockClear();
    logger.error("test.event", { code: 500 });
    const entry2 = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(entry2.context.error).toBe("[object Object]");
  });

  it("omits optional fields (message, context, duration_ms) entirely when absent, rather than serializing them as undefined", () => {
    logger.info("test.event");
    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect("message" in entry).toBe(false);
    expect("context" in entry).toBe(false);
    expect("duration_ms" in entry).toBe(false);
    expect(Object.keys(entry).sort()).toEqual(
      ["event", "level", "timestamp"].sort()
    );
  });

  it("includes context when provided", () => {
    logger.info("test.event", "msg", { userId: "123" });
    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry.context).toEqual({ userId: "123" });
  });

  describe("timed", () => {
    it("logs success for a synchronous operation and returns its result", () => {
      const result = logger.timed("sync.op", () => 42);
      expect(result).toBe(42);
      const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(entry.level).toBe("info");
      expect(entry.message).toBe("completed");
      expect(typeof entry.duration_ms).toBe("number");
    });

    it("logs success for an async operation that resolves and returns its result", async () => {
      const result = await logger.timed("async.op", async () => "done");
      expect(result).toBe("done");
      const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(entry.level).toBe("info");
      expect(entry.message).toBe("completed");
    });

    it("logs failure and rethrows the original error for an async operation that rejects", async () => {
      const err = new Error("async failure");
      await expect(
        logger.timed("async.op", async () => {
          throw err;
        })
      ).rejects.toBe(err);
      const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(entry.level).toBe("error");
      expect(entry.message).toBe("failed");
      expect(entry.context.success).toBe(false);
    });

    it("logs failure and rethrows the original error for a synchronous operation that throws", () => {
      const err = new Error("sync failure");
      expect(() =>
        logger.timed("sync.op", () => {
          throw err;
        })
      ).toThrow(err);
      const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(entry.level).toBe("error");
      expect(entry.message).toBe("failed");
    });
  });
});
