const API_BASE = '/api';

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || 'Request failed');
  }

  return response.json();
}

export interface User {
  id: number;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Recording {
  id: number;
  filename: string;
  title: string;
  duration_seconds: number | null;
  file_size: number | null;
  created_at: string;
}

export interface Preferences {
  name_card_text: string;
  name_card_title: string;
  pip_position: string;
  pip_size: string;
}

export const authApi = {
  signup: (email: string, password: string) =>
    api<AuthResponse>('/auth/signup', { method: 'POST', body: { email, password } }),

  login: (email: string, password: string) =>
    api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }),

  me: (token: string) =>
    api<User>('/auth/me', { token }),
};

export const recordingsApi = {
  list: (token: string) =>
    api<Recording[]>('/recordings', { token }),

  get: (token: string, id: number) =>
    api<Recording>(`/recordings/${id}`, { token }),

  upload: async (token: string, file: Blob, title: string, durationSeconds?: number): Promise<Recording> => {
    const formData = new FormData();
    formData.append('file', file, 'recording.webm');
    formData.append('title', title);
    if (durationSeconds !== undefined) {
      formData.append('duration_seconds', durationSeconds.toString());
    }

    const response = await fetch(`${API_BASE}/recordings/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail || 'Upload failed');
    }

    return response.json();
  },

  update: (token: string, id: number, title: string) =>
    api<Recording>(`/recordings/${id}`, { method: 'PUT', token, body: { title } }),

  delete: (token: string, id: number) =>
    api<{ message: string }>(`/recordings/${id}`, { method: 'DELETE', token }),

  downloadUrl: (id: number) => `${API_BASE}/recordings/${id}/download`,
};

export const preferencesApi = {
  get: (token: string) =>
    api<Preferences>('/preferences', { token }),

  update: (token: string, prefs: Partial<Preferences>) =>
    api<Preferences>('/preferences', { method: 'PUT', token, body: prefs }),
};
