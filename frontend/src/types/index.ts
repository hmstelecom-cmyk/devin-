export interface User {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  status_text: string;
  default_language: string;
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
  is_read: boolean;
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
  type: 'new_message' | 'typing' | 'read' | 'online_status';
  data: Record<string, unknown>;
}
