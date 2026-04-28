export interface User {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  status_text: string;
  default_language: string;
  role: string;
  notification_sound: boolean;
  is_online: boolean;
  last_seen: string | null;
}

export interface MessageTranslation {
  language: string;
  translated_text: string;
  translated_audio_url: string | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  sender_avatar: string;
  content: string;
  original_content: string;
  original_language: string;
  message_type: 'text' | 'voice' | 'image' | 'video' | 'document';
  media_url: string | null;
  media_filename: string | null;
  is_forwarded?: boolean;
  forwarded_from_name?: string | null;
  is_read: boolean;
  is_delivered: boolean;
  created_at: string;
  translations: MessageTranslation[];
  translated_audio_url?: string;
}

export interface Conversation {
  id: number;
  name: string | null;
  is_group: boolean;
  created_at: string;
  updated_at: string;
  members: User[];
  last_message: Message | null;
  unread_count: number;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Language {
  code: string;
  name: string;
}

export interface WSMessage {
  type: 'new_message' | 'typing' | 'read' | 'online_status' | 'call';
  data: Record<string, unknown>;
}

export interface AdminUser {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  status_text: string;
  default_language: string;
  role: string;
  notification_sound: boolean;
  is_online: boolean;
  last_seen: string | null;
  created_at: string | null;
  message_count: number;
  conversation_count: number;
}

export interface AdminStats {
  total_users: number;
  online_users: number;
  total_conversations: number;
  total_messages: number;
  total_media_files: number;
  total_voice_messages: number;
  total_translations: number;
  languages_in_use: string[];
}

export interface AdminConversation {
  id: number;
  name: string | null;
  is_group: boolean;
  member_count: number;
  members: { id: number; display_name: string; username: string }[];
  message_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminMedia {
  id: number;
  type: string;
  url: string | null;
  filename: string | null;
  sender: string;
  conversation_id: number;
  created_at: string | null;
}

export interface SupabaseConfig {
  supabase_url: string;
  supabase_anon_key: string;
  supabase_service_role_key: string;
  auth_enabled: boolean;
  database_enabled: boolean;
  realtime_enabled: boolean;
  storage_enabled: boolean;
}

export interface CallSession {
  id: number;
  conversation_id: number;
  caller_id: number;
  callee_id: number;
  call_type: 'audio' | 'video';
  provider: string;
  status: 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | 'cancelled' | 'failed' | 'busy';
  caller_peer_id: string | null;
  callee_peer_id: string | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  end_reason: string | null;
  created_at: string;
}

export interface CallPreferences {
  ringtone_type: 'default' | 'custom';
  default_ringtone_key: string;
  custom_ringtone_url: string | null;
  custom_ringtone_filename: string | null;
  custom_ringtone_size_bytes: number | null;
}
