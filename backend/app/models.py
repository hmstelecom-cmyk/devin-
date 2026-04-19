from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, Table, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base

# Association table for conversation members
conversation_members = Table(
    "conversation_members",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("conversation_id", Integer, ForeignKey("conversations.id"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    avatar_url = Column(String(500), default="")
    status_text = Column(String(200), default="Hey there! I'm using SmartComm")
    default_language = Column(String(10), default="en")
    role = Column(String(20), default="user")  # user, admin
    notification_sound = Column(Boolean, default=True)
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    conversations = relationship(
        "Conversation", secondary=conversation_members, back_populates="members"
    )
    messages = relationship("Message", back_populates="sender")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=True)
    is_group = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    members = relationship(
        "User", secondary=conversation_members, back_populates="conversations"
    )
    messages = relationship("Message", back_populates="conversation", order_by="Message.created_at")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, default="")
    original_content = Column(Text, default="")
    original_language = Column(String(10), default="en")
    message_type = Column(String(20), default="text")  # text, voice, image, video, document
    media_url = Column(String(500), nullable=True)
    media_filename = Column(String(255), nullable=True)
    is_forwarded = Column(Boolean, default=False)
    forwarded_from_name = Column(String(100), nullable=True)
    is_read = Column(Boolean, default=False)
    is_delivered = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    sender = relationship("User", back_populates="messages")
    conversation = relationship("Conversation", back_populates="messages")
    translations = relationship("MessageTranslation", back_populates="message")


class MessageTranslation(Base):
    __tablename__ = "message_translations"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=False)
    language = Column(String(10), nullable=False)
    translated_text = Column(Text, default="")
    translated_audio_url = Column(String(500), nullable=True)

    message = relationship("Message", back_populates="translations")


class AdminSetting(Base):
    __tablename__ = "admin_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, default="")
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class CallSession(Base):
    __tablename__ = "call_sessions"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    caller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    callee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    call_type = Column(String(10), default="audio")  # audio, video
    status = Column(String(20), default="ringing")  # ringing, active, ended, missed, declined
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    caller = relationship("User", foreign_keys=[caller_id])
    callee = relationship("User", foreign_keys=[callee_id])
    conversation = relationship("Conversation")
