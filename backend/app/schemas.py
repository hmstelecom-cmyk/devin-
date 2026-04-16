from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# Auth schemas
class UserCreate(BaseModel):
    username: str
    display_name: str
    password: str
    default_language: str = "en"


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
    is_online: bool
    last_seen: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    status_text: Optional[str] = None
    default_language: Optional[str] = None
    avatar_url: Optional[str] = None


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


# WebSocket message schemas
class WSMessage(BaseModel):
    type: str  # "message", "typing", "read", "online_status"
    data: dict = {}
