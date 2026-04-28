from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
import re


# Auth schemas
class UserCreate(BaseModel):
    username: str
    display_name: str
    password: str
    default_language: str = "en"

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        if len(v) < 3 or len(v) > 30:
            raise ValueError('Username must be between 3 and 30 characters')
        if not re.match(r'^[a-zA-Z0-9._-]+$', v):
            raise ValueError('Username can only contain letters, numbers, dots, hyphens, and underscores')
        return v

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v

    @field_validator('display_name')
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        if len(v.strip()) < 1 or len(v) > 50:
            raise ValueError('Display name must be between 1 and 50 characters')
        return v.strip()


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str
    avatar_url: str
    status_text: str
    default_language: str
    role: str = "user"
    notification_sound: bool = True
    is_online: bool
    last_seen: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    status_text: Optional[str] = None
    default_language: Optional[str] = None
    avatar_url: Optional[str] = None
    notification_sound: Optional[bool] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Message schemas
class MessageCreate(BaseModel):
    content: str = ""
    message_type: str = "text"


class TranslationResponse(BaseModel):
    language: str
    translated_text: str
    translated_audio_url: Optional[str] = None

    class Config:
        from_attributes = True


class ForwardRequest(BaseModel):
    conversation_ids: List[int]


class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    sender_name: str = ""
    sender_avatar: str = ""
    content: str
    original_content: str
    original_language: str
    message_type: str
    media_url: Optional[str] = None
    media_filename: Optional[str] = None
    is_forwarded: bool = False
    forwarded_from_name: Optional[str] = None
    is_read: bool
    is_delivered: bool = False
    created_at: datetime
    translations: List[TranslationResponse] = []
    translated_audio_url: Optional[str] = None

    class Config:
        from_attributes = True


# Conversation schemas
class ConversationCreate(BaseModel):
    member_ids: List[int]
    name: Optional[str] = None
    is_group: bool = False


class ConversationResponse(BaseModel):
    id: int
    name: Optional[str] = None
    is_group: bool
    created_at: datetime
    updated_at: datetime
    members: List[UserResponse] = []
    last_message: Optional[MessageResponse] = None
    unread_count: int = 0

    class Config:
        from_attributes = True


class LanguageResponse(BaseModel):
    code: str
    name: str


# Admin schemas
class AdminUserResponse(BaseModel):
    id: int
    username: str
    display_name: str
    avatar_url: str
    status_text: str
    default_language: str
    role: str
    notification_sound: bool
    is_online: bool
    last_seen: Optional[datetime] = None
    created_at: Optional[datetime] = None
    message_count: int = 0
    conversation_count: int = 0

    class Config:
        from_attributes = True


class AdminStatsResponse(BaseModel):
    total_users: int
    online_users: int
    total_conversations: int
    total_messages: int
    total_media_files: int
    total_voice_messages: int
    total_translations: int
    languages_in_use: List[str] = []


class AdminSettingUpdate(BaseModel):
    key: str
    value: str


class AdminSettingResponse(BaseModel):
    key: str
    value: str
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SupabaseConfig(BaseModel):
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    auth_enabled: bool = False
    database_enabled: bool = False
    realtime_enabled: bool = False
    storage_enabled: bool = False


class CallSessionCreate(BaseModel):
    conversation_id: int
    callee_id: int
    call_type: str = "audio"  # audio, video
    caller_peer_id: Optional[str] = None


class CallSessionResponse(BaseModel):
    id: int
    conversation_id: int
    caller_id: int
    callee_id: int
    call_type: str
    provider: str = "peerjs"
    status: str
    caller_peer_id: Optional[str] = None
    callee_peer_id: Optional[str] = None
    started_at: Optional[datetime] = None
    answered_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    end_reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CallPeerIdUpdate(BaseModel):
    peer_id: str


class UserCallPreferenceResponse(BaseModel):
    ringtone_type: str = "default"
    default_ringtone_key: str = "classic"
    custom_ringtone_url: Optional[str] = None
    custom_ringtone_filename: Optional[str] = None
    custom_ringtone_size_bytes: Optional[int] = None

    class Config:
        from_attributes = True


class UserCallPreferenceUpdate(BaseModel):
    ringtone_type: Optional[str] = None  # default, custom
    default_ringtone_key: Optional[str] = None  # classic, modern, soft, digital, minimal


# WebSocket message schemas
class WSMessage(BaseModel):
    type: str  # "message", "typing", "read", "online_status", "call"
    data: dict = {}
