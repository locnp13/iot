export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error || 'Request failed');
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface User {
  id: number;
  email: string;
}

export interface Device {
  id: number;
  name: string;
  createdAt: string;
  status: 'stable' | 'degrading' | 'replace' | null;
}

export interface DeviceWithToken extends Device {
  token: string;
}

export interface ReadingWithHealth {
  id: number;
  deviceId: number;
  cycle: number;
  vRest: number;
  deltaV: number;
  iMax: number;
  rInt: number;
  createdAt: string;
  percentChangeFromBaseline: number;
  status: 'stable' | 'degrading' | 'replace';
}

export const api = {
  me: () => request<User>('/auth/me'),

  register: (email: string, password: string) =>
    request<User>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),

  login: (email: string, password: string) =>
    request<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  listDevices: () => request<Device[]>('/devices'),

  createDevice: (name: string) =>
    request<DeviceWithToken>('/devices', { method: 'POST', body: JSON.stringify({ name }) }),

  regenerateToken: (deviceId: number) =>
    request<{ token: string }>(`/devices/${deviceId}/regenerate-token`, { method: 'POST' }),

  deleteDevice: (deviceId: number) => request<{ ok: true }>(`/devices/${deviceId}`, { method: 'DELETE' }),

  getReadings: (deviceId: number) => request<ReadingWithHealth[]>(`/devices/${deviceId}/readings`),
};
