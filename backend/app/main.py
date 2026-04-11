from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, update
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import datetime, timezone
import json
import os
import uuid
import logging

from app.database import get_db, init_db
from app.models import User, Conversation, Message, MessageTranslation, conversation_members
from app.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    SECRET_KEY,
    ALGORITHM,
)
from app.schemas import (
    UserCreate,
    UserLogin,
    UserResponse,
    UserUpdate,
    TokenResponse,
    MessageResponse,
    TranslationResponse,
    ConversationCreate,
    ConversationResponse,
    LanguageResponse,
    ForwardRequest,
)
from app.translation_service import (
    translate_text,
    text_to_speech,
    transcribe_audio,
    get_supported_languages,
    UPLOAD_DIR,
)
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

app = FastAPI(title="SmartComm API")

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Create upload directories
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "media"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "voice"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "voice_translations"), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_DIR, "avatars"), exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: int):
        self.active_connections.pop(user_id, None)

    async def send_personal_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
            except Exception:
                self.disconnect(user_id)

    async def broadcast_to_conversation(self, message: dict, member_ids: list[int], exclude_id: int = -1):
        for member_id in member_ids:
            if member_id != exclude_id and member_id in self.active_connections:
                try:
                    await self.active_connections[member_id].send_json(message)
                except Exception:
                    self.disconnect(member_id)


manager = ConnectionManager()


@app.on_event("startup")
async def startup():
    await init_db()


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/api/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == user_data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")
    user = User(
        username=user_data.username,
        display_name=user_data.display_name,
        hashed_password=get_password_hash(user_data.password),
        default_language=user_data.default_language,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(data={"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@app.post("/api/auth/login", response_model=TokenResponse)
async def login(form_data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == form_data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    user.is_online = True
    user.last_seen = datetime.now(timezone.utc)
    await db.commit()
    token = create_access_token(data={"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@app.get("/api/auth/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@app.put("/api/auth/me", response_model=UserResponse)
async def update_me(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user_update.display_name is not None:
        current_user.display_name = user_update.display_name
    if user_update.status_text is not None:
        current_user.status_text = user_update.status_text
    if user_update.default_language is not None:
        current_user.default_language = user_update.default_language
    if user_update.avatar_url is not None:
        current_user.avatar_url = user_update.avatar_url
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)


@app.get("/api/users", response_model=list[UserResponse])
async def get_users(
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(User).where(User.id != current_user.id)
    if search:
        query = query.where(or_(User.username.ilike(f"%{search}%"), User.display_name.ilike(f"%{search}%")))
    result = await db.execute(query.order_by(User.display_name))
    users = result.scalars().all()
    return [UserResponse.model_validate(u) for u in users]


@app.get("/api/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse.model_validate(user)


@app.post("/api/conversations", response_model=ConversationResponse)
async def create_conversation(
    conv_data: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not conv_data.is_group and len(conv_data.member_ids) == 1:
        other_id = conv_data.member_ids[0]
        stmt = (
            select(Conversation).join(conversation_members)
            .where(Conversation.is_group == False)
            .where(conversation_members.c.user_id.in_([current_user.id, other_id]))
            .group_by(Conversation.id)
            .having(func.count(conversation_members.c.user_id) == 2)
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            await db.refresh(existing, ["members"])
            return await _build_conversation_response(existing, current_user, db)
    conv = Conversation(name=conv_data.name, is_group=conv_data.is_group)
    db.add(conv)
    await db.flush()
    all_member_ids = set(conv_data.member_ids)
    all_member_ids.add(current_user.id)
    for member_id in all_member_ids:
        await db.execute(conversation_members.insert().values(user_id=member_id, conversation_id=conv.id))
    await db.commit()
    # Re-fetch with eager loading
    stmt = select(Conversation).where(Conversation.id == conv.id).options(selectinload(Conversation.members))
    result = await db.execute(stmt)
    conv = result.scalar_one()
    return await _build_conversation_response(conv, current_user, db)


@app.get("/api/conversations", response_model=list[ConversationResponse])
async def get_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Conversation).join(conversation_members)
        .where(conversation_members.c.user_id == current_user.id)
        .options(selectinload(Conversation.members))
        .order_by(Conversation.updated_at.desc())
    )
    result = await db.execute(stmt)
    conversations = result.scalars().unique().all()
    responses = []
    for conv in conversations:
        resp = await _build_conversation_response(conv, current_user, db)
        responses.append(resp)
    return responses


@app.get("/api/conversations/{conv_id}", response_model=ConversationResponse)
async def get_conversation(
    conv_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await _get_conversation(conv_id, current_user, db)
    return await _build_conversation_response(conv, current_user, db)


async def _get_conversation(conv_id: int, current_user: User, db: AsyncSession) -> Conversation:
    stmt = (
        select(Conversation).join(conversation_members)
        .where(and_(Conversation.id == conv_id, conversation_members.c.user_id == current_user.id))
        .options(selectinload(Conversation.members))
    )
    result = await db.execute(stmt)
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


async def _build_conversation_response(conv: Conversation, current_user: User, db: AsyncSession) -> ConversationResponse:
    if not conv.members:
        await db.refresh(conv, ["members"])
    msg_stmt = select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at.desc()).limit(1)
    msg_result = await db.execute(msg_stmt)
    last_msg = msg_result.scalar_one_or_none()
    unread_stmt = select(func.count(Message.id)).where(
        and_(Message.conversation_id == conv.id, Message.sender_id != current_user.id, Message.is_read == False)
    )
    unread_result = await db.execute(unread_stmt)
    unread_count = unread_result.scalar() or 0
    last_message = None
    if last_msg:
        trans_stmt = select(MessageTranslation).where(
            and_(MessageTranslation.message_id == last_msg.id, MessageTranslation.language == current_user.default_language)
        )
        trans_result = await db.execute(trans_stmt)
        translation = trans_result.scalar_one_or_none()
        display_content = last_msg.content
        if translation and translation.translated_text:
            display_content = translation.translated_text
        sender_result = await db.execute(select(User).where(User.id == last_msg.sender_id))
        sender = sender_result.scalar_one_or_none()
        last_message = MessageResponse(
            id=last_msg.id, conversation_id=last_msg.conversation_id, sender_id=last_msg.sender_id,
            sender_name=sender.display_name if sender else "", sender_avatar=sender.avatar_url if sender else "",
            content=display_content, original_content=last_msg.original_content or last_msg.content,
            original_language=last_msg.original_language, message_type=last_msg.message_type,
            media_url=last_msg.media_url, media_filename=last_msg.media_filename,
            is_read=last_msg.is_read, created_at=last_msg.created_at,
        )
    return ConversationResponse(
        id=conv.id, name=conv.name, is_group=conv.is_group,
        created_at=conv.created_at, updated_at=conv.updated_at,
        members=[UserResponse.model_validate(m) for m in conv.members],
        last_message=last_message, unread_count=unread_count,
    )


@app.get("/api/conversations/{conv_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    conv_id: int, limit: int = 50, offset: int = 0,
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await _get_conversation(conv_id, current_user, db)
    stmt = (
        select(Message).where(Message.conversation_id == conv_id)
        .options(selectinload(Message.translations))
        .order_by(Message.created_at.desc()).limit(limit).offset(offset)
    )
    result = await db.execute(stmt)
    messages = result.scalars().all()
    responses = []
    for msg in reversed(messages):
        sender_result = await db.execute(select(User).where(User.id == msg.sender_id))
        sender = sender_result.scalar_one_or_none()
        display_content = msg.content
        translations = []
        for t in msg.translations:
            translations.append(TranslationResponse(language=t.language, translated_text=t.translated_text, translated_audio_url=t.translated_audio_url))
            if t.language == current_user.default_language:
                display_content = t.translated_text
        responses.append(MessageResponse(
            id=msg.id, conversation_id=msg.conversation_id, sender_id=msg.sender_id,
            sender_name=sender.display_name if sender else "", sender_avatar=sender.avatar_url if sender else "",
            content=display_content, original_content=msg.original_content or msg.content,
            original_language=msg.original_language, message_type=msg.message_type,
            media_url=msg.media_url, media_filename=msg.media_filename,
            is_read=msg.is_read, created_at=msg.created_at, translations=translations,
        ))
    return responses


@app.post("/api/conversations/{conv_id}/messages", response_model=MessageResponse)
async def send_message(
    conv_id: int, content: str = Form(""), message_type: str = Form("text"),
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    conv = await _get_conversation(conv_id, current_user, db)
    media_url = None
    media_filename = None
    filepath = None
    if file:
        ext = os.path.splitext(file.filename)[1] if file.filename else ""
        unique_name = f"{uuid.uuid4().hex}{ext}"
        subdir = "voice" if message_type == "voice" else "media"
        filepath = os.path.join(UPLOAD_DIR, subdir, unique_name)
        file_content = await file.read()
        with open(filepath, "wb") as f:
            f.write(file_content)
        media_url = f"/uploads/{subdir}/{unique_name}"
        media_filename = file.filename
    # For voice messages, transcribe the audio to get actual text content
    if message_type == "voice" and file and filepath:
        transcribed = transcribe_audio(filepath, current_user.default_language)
        if transcribed:
            content = transcribed
            logger.info(f"Voice transcription success ({current_user.default_language}): {transcribed[:100]}")
        else:
            logger.warning(f"Voice transcription failed for {current_user.default_language}, content stays as: '{content}'")
            # Set a default content so voice messages without transcription still get sent
            if not content:
                content = "Voice message"

    msg = Message(
        conversation_id=conv_id, sender_id=current_user.id, content=content,
        original_content=content, original_language=current_user.default_language,
        message_type=message_type, media_url=media_url, media_filename=media_filename,
    )
    db.add(msg)
    await db.flush()
    translations = []
    member_languages = set()
    for member in conv.members:
        if member.id != current_user.id:
            member_languages.add(member.default_language)
    if content and message_type in ("text", "voice"):
        for target_lang in member_languages:
            if target_lang != current_user.default_language:
                try:
                    translated_text = translate_text(content, current_user.default_language, target_lang)
                    logger.info(f"Translation {current_user.default_language}->{target_lang}: '{content[:50]}' -> '{translated_text[:50] if translated_text else ''}'")
                except Exception as e:
                    logger.error(f"Translation failed {current_user.default_language}->{target_lang}: {e}")
                    translated_text = content
                translated_audio_url = None
                # Generate TTS audio for both text and voice messages
                if translated_text:
                    try:
                        audio_path = text_to_speech(translated_text, target_lang)
                        if audio_path:
                            translated_audio_url = f"/uploads/voice_translations/{os.path.basename(audio_path)}"
                            logger.info(f"TTS generated for {target_lang}: {translated_audio_url}")
                        else:
                            logger.warning(f"TTS returned empty path for {target_lang}")
                    except Exception as e:
                        logger.error(f"TTS failed for {target_lang}: {e}")
                trans = MessageTranslation(
                    message_id=msg.id, language=target_lang,
                    translated_text=translated_text, translated_audio_url=translated_audio_url,
                )
                db.add(trans)
                translations.append(TranslationResponse(
                    language=target_lang, translated_text=translated_text, translated_audio_url=translated_audio_url,
                ))
    conv.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)
    sender_result = await db.execute(select(User).where(User.id == msg.sender_id))
    sender = sender_result.scalar_one_or_none()
    msg_response = MessageResponse(
        id=msg.id, conversation_id=msg.conversation_id, sender_id=msg.sender_id,
        sender_name=sender.display_name if sender else "", sender_avatar=sender.avatar_url if sender else "",
        content=content, original_content=content, original_language=current_user.default_language,
        message_type=msg.message_type, media_url=msg.media_url, media_filename=msg.media_filename,
        is_read=False, created_at=msg.created_at, translations=translations,
    )
    for member in conv.members:
        if member.id == current_user.id:
            continue
        personalized = msg_response.model_dump(mode="json")
        for t in translations:
            if t.language == member.default_language:
                personalized["content"] = t.translated_text
                if t.translated_audio_url:
                    personalized["translated_audio_url"] = t.translated_audio_url
                break
        await manager.send_personal_message({"type": "new_message", "data": personalized}, member.id)
    return msg_response


@app.post("/api/messages/{message_id}/forward")
async def forward_message(
    message_id: int,
    forward_data: ForwardRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Forward a message to one or more conversations (max 5, like WhatsApp)."""
    if len(forward_data.conversation_ids) > 5:
        raise HTTPException(status_code=400, detail="Can only forward to up to 5 chats at a time")
    if not forward_data.conversation_ids:
        raise HTTPException(status_code=400, detail="Must specify at least one conversation")

    # Get the original message
    stmt = select(Message).where(Message.id == message_id).options(selectinload(Message.translations))
    result = await db.execute(stmt)
    original_msg = result.scalar_one_or_none()
    if not original_msg:
        raise HTTPException(status_code=404, detail="Message not found")

    # Get original sender name for the "Forwarded" label
    sender_result = await db.execute(select(User).where(User.id == original_msg.sender_id))
    original_sender = sender_result.scalar_one_or_none()
    forwarded_from = original_sender.display_name if original_sender else "Unknown"

    forwarded_messages = []
    for conv_id in forward_data.conversation_ids:
        # Verify user is a member of target conversation
        conv = await _get_conversation(conv_id, current_user, db)

        # Create a new message in the target conversation
        new_msg = Message(
            conversation_id=conv_id,
            sender_id=current_user.id,
            content=original_msg.original_content or original_msg.content,
            original_content=original_msg.original_content or original_msg.content,
            original_language=original_msg.original_language,
            message_type=original_msg.message_type,
            media_url=original_msg.media_url,
            media_filename=original_msg.media_filename,
            is_forwarded=True,
            forwarded_from_name=forwarded_from,
        )
        db.add(new_msg)
        await db.flush()

        # Translate for members of target conversation
        translations = []
        member_languages = set()
        for member in conv.members:
            if member.id != current_user.id:
                member_languages.add(member.default_language)

        text_content = original_msg.original_content or original_msg.content
        if text_content and original_msg.message_type in ("text", "voice"):
            for target_lang in member_languages:
                if target_lang != original_msg.original_language:
                    translated_text = translate_text(text_content, original_msg.original_language, target_lang)
                    translated_audio_url = None
                    if translated_text:
                        audio_path = text_to_speech(translated_text, target_lang)
                        if audio_path:
                            translated_audio_url = f"/uploads/voice_translations/{os.path.basename(audio_path)}"
                    trans = MessageTranslation(
                        message_id=new_msg.id, language=target_lang,
                        translated_text=translated_text, translated_audio_url=translated_audio_url,
                    )
                    db.add(trans)
                    translations.append(TranslationResponse(
                        language=target_lang, translated_text=translated_text, translated_audio_url=translated_audio_url,
                    ))

        conv.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(new_msg)

        msg_response = MessageResponse(
            id=new_msg.id, conversation_id=new_msg.conversation_id, sender_id=new_msg.sender_id,
            sender_name=current_user.display_name, sender_avatar=current_user.avatar_url or "",
            content=text_content, original_content=text_content,
            original_language=original_msg.original_language,
            message_type=new_msg.message_type, media_url=new_msg.media_url, media_filename=new_msg.media_filename,
            is_forwarded=True, forwarded_from_name=forwarded_from,
            is_read=False, created_at=new_msg.created_at, translations=translations,
        )

        # Send via WebSocket to conversation members
        for member in conv.members:
            if member.id == current_user.id:
                continue
            personalized = msg_response.model_dump(mode="json")
            for t in translations:
                if t.language == member.default_language:
                    personalized["content"] = t.translated_text
                    if t.translated_audio_url:
                        personalized["translated_audio_url"] = t.translated_audio_url
                    break
            await manager.send_personal_message({"type": "new_message", "data": personalized}, member.id)

        forwarded_messages.append(msg_response)

    return {"forwarded": len(forwarded_messages), "messages": forwarded_messages}


@app.put("/api/conversations/{conv_id}/messages/read")
async def mark_messages_read(
    conv_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Message).where(and_(
            Message.conversation_id == conv_id, Message.sender_id != current_user.id, Message.is_read == False,
        )).values(is_read=True)
    )
    await db.commit()
    return {"status": "ok"}


@app.get("/api/languages", response_model=list[LanguageResponse])
async def list_languages():
    languages = get_supported_languages()
    return [LanguageResponse(code=code, name=name) for code, name in sorted(languages.items(), key=lambda x: x[1])]


@app.post("/api/translate")
async def translate_endpoint(text: str = Form(...), source_lang: str = Form("auto"), target_lang: str = Form("en")):
    translated = translate_text(text, source_lang, target_lang)
    return {"original": text, "translated": translated, "target_lang": target_lang}


@app.post("/api/tts")
async def tts_endpoint(text: str = Form(...), lang: str = Form("en")):
    filepath = text_to_speech(text, lang)
    if not filepath:
        raise HTTPException(status_code=500, detail="TTS generation failed")
    filename = os.path.basename(filepath)
    return {"audio_url": f"/uploads/voice_translations/{filename}"}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    unique_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, "media", unique_name)
    file_content = await file.read()
    with open(filepath, "wb") as f:
        f.write(file_content)
    return {"url": f"/uploads/media/{unique_name}", "filename": file.filename, "size": len(file_content)}


@app.post("/api/upload/avatar")
async def upload_avatar(
    file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, "avatars", unique_name)
    file_content = await file.read()
    with open(filepath, "wb") as f:
        f.write(file_content)
    avatar_url = f"/uploads/avatars/{unique_name}"
    current_user.avatar_url = avatar_url
    await db.commit()
    return {"avatar_url": avatar_url}


@app.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            await websocket.close(code=4001)
            return
        user_id = int(sub)
    except (JWTError, ValueError):
        await websocket.close(code=4001)
        return
    await manager.connect(websocket, user_id)
    async for db in get_db():
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            user.is_online = True
            await db.commit()
        conv_stmt = (
            select(Conversation).join(conversation_members)
            .where(conversation_members.c.user_id == user_id)
            .options(selectinload(Conversation.members))
        )
        conv_result = await db.execute(conv_stmt)
        conversations = conv_result.scalars().unique().all()
        notified = set()
        for conv in conversations:
            for member in conv.members:
                if member.id != user_id and member.id not in notified:
                    await manager.send_personal_message(
                        {"type": "online_status", "data": {"user_id": user_id, "is_online": True}}, member.id,
                    )
                    notified.add(member.id)
        break
    try:
        while True:
            data = await websocket.receive_text()
            msg_data = json.loads(data)
            if msg_data.get("type") == "typing":
                conv_id = msg_data["data"].get("conversation_id")
                async for db in get_db():
                    conv_stmt = select(Conversation).where(Conversation.id == conv_id).options(selectinload(Conversation.members))
                    conv_result = await db.execute(conv_stmt)
                    conv = conv_result.scalar_one_or_none()
                    if conv:
                        for member in conv.members:
                            if member.id != user_id:
                                await manager.send_personal_message(
                                    {"type": "typing", "data": {"user_id": user_id, "conversation_id": conv_id}}, member.id,
                                )
                    break
            elif msg_data.get("type") == "read":
                conv_id = msg_data["data"].get("conversation_id")
                async for db in get_db():
                    await db.execute(
                        update(Message).where(and_(
                            Message.conversation_id == conv_id, Message.sender_id != user_id, Message.is_read == False,
                        )).values(is_read=True)
                    )
                    await db.commit()
                    # Notify other members that messages were read
                    conv_stmt = select(Conversation).where(Conversation.id == conv_id).options(selectinload(Conversation.members))
                    conv_result = await db.execute(conv_stmt)
                    conv = conv_result.scalar_one_or_none()
                    if conv:
                        for member in conv.members:
                            if member.id != user_id:
                                await manager.send_personal_message(
                                    {"type": "read", "data": {"conversation_id": conv_id, "user_id": user_id}}, member.id,
                                )
                    break
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        async for db in get_db():
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user:
                user.is_online = False
                user.last_seen = datetime.now(timezone.utc)
                await db.commit()
            conv_stmt = (
                select(Conversation).join(conversation_members)
                .where(conversation_members.c.user_id == user_id)
                .options(selectinload(Conversation.members))
            )
            conv_result = await db.execute(conv_stmt)
            conversations = conv_result.scalars().unique().all()
            notified = set()
            for conv in conversations:
                for member in conv.members:
                    if member.id != user_id and member.id not in notified:
                        await manager.send_personal_message(
                            {"type": "online_status", "data": {"user_id": user_id, "is_online": False}}, member.id,
                        )
                        notified.add(member.id)
            break
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(user_id)
