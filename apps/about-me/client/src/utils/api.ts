// API base URL - in production/docker, use environment variable; in dev, use proxy (empty string)
const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`);

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export function getSSEUrl(endpoint: string): string {
  return `${API_BASE_URL}${endpoint}`;
}
