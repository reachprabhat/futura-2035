const wait = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));
// The SDK's automatic retries remain disabled. Each callback is separately logged in aiCalls.
export async function withImageRateLimitRetry<T>(call: () => Promise<T>, delay: (milliseconds: number) => Promise<void> = wait): Promise<T> {
  try { return await call(); }
  catch (error) {
    if (!error || typeof error !== "object" || !("status" in error) || error.status !== 429) throw error;
    await delay(20_000);
    return await call();
  }
}
