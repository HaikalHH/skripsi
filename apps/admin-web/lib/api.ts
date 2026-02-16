import { env } from "./env";

export const fetchAdminApi = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${env.API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": env.ADMIN_API_TOKEN,
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Admin API request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
};

export const fetchPublicApi = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${env.API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Public API request failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
};
