import type { User, Conversation, Message, LoginResponse, Language, AdminUser, AdminStats, AdminConversation, AdminMedia, SupabaseConfig, CallSession } from '../types';

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
  notification_sound?: boolean;
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

export async function forwardMessage(
  messageId: number,
  conversationIds: number[]
): Promise<{ forwarded: number; messages: Message[] }> {
  const res = await fetch(`${API_URL}/api/messages/${messageId}/forward`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_ids: conversationIds }),
  });
  if (!res.ok) throw new Error('Failed to forward message');
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

// Admin API calls
export async function getAdminStats(): Promise<AdminStats> {
  const res = await fetch(`${API_URL}/api/admin/stats`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Admin access required');
  return res.json();
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch(`${API_URL}/api/admin/users`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Admin access required');
  return res.json();
}

export async function updateUserRole(userId: number, role: string): Promise<void> {
  const formData = new FormData();
  formData.append('role', role);
  const res = await fetch(`${API_URL}/api/admin/users/${userId}/role`, {
    method: 'PUT', headers: authHeaders(), body: formData,
  });
  if (!res.ok) throw new Error('Failed to update role');
}

export async function getAdminConversations(): Promise<AdminConversation[]> {
  const res = await fetch(`${API_URL}/api/admin/conversations`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Admin access required');
  return res.json();
}

export async function getAdminMedia(): Promise<AdminMedia[]> {
  const res = await fetch(`${API_URL}/api/admin/media`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Admin access required');
  return res.json();
}

export async function getSupabaseConfig(): Promise<SupabaseConfig> {
  const res = await fetch(`${API_URL}/api/admin/supabase`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Admin access required');
  return res.json();
}

export async function updateSupabaseConfig(config: SupabaseConfig): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/supabase`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to update Supabase config');
}

export async function testSupabaseConnection(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_URL}/api/admin/supabase/test`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Admin access required');
  return res.json();
}

// Call API calls
export async function initiateCall(conversationId: number, calleeId: number, callType: 'audio' | 'video'): Promise<CallSession> {
  const res = await fetch(`${API_URL}/api/calls`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId, callee_id: calleeId, call_type: callType }),
  });
  if (!res.ok) throw new Error('Failed to initiate call');
  return res.json();
}

export async function answerCall(callId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/calls/${callId}/answer`, {
    method: 'PUT', headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to answer call');
}

export async function endCall(callId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/calls/${callId}/end`, {
    method: 'PUT', headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to end call');
}

export async function declineCall(callId: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/calls/${callId}/decline`, {
    method: 'PUT', headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to decline call');
}
