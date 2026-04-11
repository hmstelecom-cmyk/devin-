import type { User, Conversation, Message, LoginResponse, Language } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function getToken(): string | null {
  return localStorage.getItem('token');
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getApiUrl(): string {
  return API_URL;
}

export function getWsUrl(): string {
  const token = getToken();
  const wsBase = API_URL.replace('http', 'ws');
  return `${wsBase}/ws/${token}`;
}

export function getMediaUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_URL}${path}`;
}

export async function register(
  username: string,
  displayName: string,
  password: string,
  defaultLanguage: string
): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      display_name: displayName,
      password,
      default_language: defaultLanguage,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Registration failed');
  }
  return res.json();
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Login failed');
  }
  return res.json();
}

export async function getMe(): Promise<User> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch user');
  return res.json();
}

export async function updateProfile(data: {
  display_name?: string;
  status_text?: string;
  default_language?: string;
  avatar_url?: string;
}): Promise<User> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json();
}

export async function getUsers(search?: string): Promise<User[]> {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await fetch(`${API_URL}/api/users${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function getConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_URL}/api/conversations`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch conversations');
  return res.json();
}

export async function createConversation(memberIds: number[], name?: string, isGroup?: boolean): Promise<Conversation> {
  const res = await fetch(`${API_URL}/api/conversations`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ member_ids: memberIds, name, is_group: isGroup || false }),
  });
  if (!res.ok) throw new Error('Failed to create conversation');
  return res.json();
}

export async function getMessages(convId: number, limit = 50, offset = 0): Promise<Message[]> {
  const res = await fetch(
    `${API_URL}/api/conversations/${convId}/messages?limit=${limit}&offset=${offset}`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function sendMessage(
  convId: number,
  content: string,
  messageType = 'text',
  file?: File
): Promise<Message> {
  const formData = new FormData();
  formData.append('content', content);
  formData.append('message_type', messageType);
  if (file) formData.append('file', file);

  const res = await fetch(`${API_URL}/api/conversations/${convId}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to send message');
  return res.json();
}

export async function markRead(convId: number): Promise<void> {
  await fetch(`${API_URL}/api/conversations/${convId}/messages/read`, {
    method: 'PUT',
    headers: authHeaders(),
  });
}

export async function getLanguages(): Promise<Language[]> {
  const res = await fetch(`${API_URL}/api/languages`);
  if (!res.ok) throw new Error('Failed to fetch languages');
  return res.json();
}

export async function uploadFile(file: File): Promise<{ url: string; filename: string; size: number }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload file');
  return res.json();
}
