import { afterEach, describe, expect, it, vi } from "vitest";
import { withImageRateLimitRetry } from "./imageRetry";
afterEach(() => vi.useRealTimers());
describe("One image retry for HTTP 429", () => {
  it("waits exactly 20 seconds before the single retry", async () => {
    vi.useFakeTimers();
    const call = vi.fn().mockRejectedValueOnce({ status: 429 }).mockResolvedValue("image");
    const result = withImageRateLimitRetry(call);
    await vi.advanceTimersByTimeAsync(19999);
    expect(call).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe("image"); expect(call).toHaveBeenCalledTimes(2);
  });
  it("does not retry a second 429", async () => {
    const error = { status: 429, message: "Still rate limited" };
    const call = vi.fn().mockRejectedValue(error), delay = vi.fn().mockResolvedValue(undefined);
    await expect(withImageRateLimitRetry(call, delay)).rejects.toBe(error);
    expect(call).toHaveBeenCalledTimes(2); expect(delay).toHaveBeenCalledExactlyOnceWith(20000);
  });
  it("never retries other errors", async () => {
    const error = { status: 500 }, call = vi.fn().mockRejectedValue(error), delay = vi.fn();
    await expect(withImageRateLimitRetry(call, delay)).rejects.toBe(error);
    expect(call).toHaveBeenCalledTimes(1); expect(delay).not.toHaveBeenCalled();
  });
});
