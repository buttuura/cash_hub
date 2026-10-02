const handlers = new Set();

export function registerRefreshHandler(handler) {
  if (typeof handler !== 'function') return () => {};
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export async function runRefresh() {
  const active = Array.from(handlers);
  if (active.length === 0) return;
  await Promise.allSettled(active.map((handler) => handler()));
}