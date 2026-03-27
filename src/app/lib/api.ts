const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

type RequestOptions = RequestInit & {
  token?: string | null;
};

export async function apiRequest(path: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.message || "Error en la solicitud");
  }

  return data;
}
