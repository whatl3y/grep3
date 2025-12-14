export async function sleep(timeoutMs = 1000): Promise<void> {
  return await new Promise((resolve: Function) =>
    setTimeout(resolve, timeoutMs)
  );
}
