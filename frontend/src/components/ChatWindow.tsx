import { useState, useRef, useEffect } from 'react';
import type { Message, User, Conversation } from '../types';
import { sendMessage, getMediaUrl, markRead } from '../services/api';
import { Send, Paperclip, Mic, MicOff, ArrowLeft, Image, FileText, Film, Globe, Play, Pause, Download } from 'lucide-react';

interface ChatWindowProps {
  conversation: Conversation;
  messages: Message[];
  currentUser: User;
  onMessageSent: () => void;
  onBack: () => void;
  onSendTyping: () => void;
  typingUsers: number[];
}

export default function ChatWindow({
  conversation,
  messages,
  currentUser,
  onMessageSent,
  onBack,
  onSendTyping,
  typingUsers,
}: ChatWindowProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showOriginal, setShowOriginal] = useState<number | null>(null);
  const [playingAudio, setPlayingAudio] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();

  const otherMembers = conversation.members.filter((m) => m.id !== currentUser.id);
  const chatName = conversation.name || otherMembers.map((m) => m.display_name).join(', ');
  const otherUser = otherMembers[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    markRead(conversation.id).catch(() => {});
  }, [conversation.id, messages.length]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(conversation.id, text.trim(), 'text');
      setText('');
      onMessageSent();
    } catch {
      // handle error
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTyping = () => {
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    onSendTyping();
    typingTimeout.current = setTimeout(() => {}, 2000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowAttachMenu(false);
    setSending(true);
    try {
      await sendMessage(conversation.id, file.name, type, file);
      onMessageSent();
    } catch {
      // handle error
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], 'voice_message.webm', { type: 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());

        setSending(true);
        try {
          await sendMessage(conversation.id, 'Voice message', 'voice', file);
          onMessageSent();
        } catch {
          // handle error
        } finally {
          setSending(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      alert('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const playAudio = (url: string, msgId: number) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (playingAudio === msgId) {
      setPlayingAudio(null);
      return;
    }
    const audio = new Audio(getMediaUrl(url));
    audioRef.current = audio;
    setPlayingAudio(msgId);
    audio.play();
    audio.onended = () => setPlayingAudio(null);
  };

  const formatTime = (dateStr: string): string => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getTypingNames = (): string => {
    return typingUsers
      .map((uid) => conversation.members.find((m) => m.id === uid)?.display_name || 'Someone')
      .join(', ');
  };

  const renderMessage = (msg: Message) => {
    const isMine = msg.sender_id === currentUser.id;
    const isTranslated = !isMine && msg.content !== msg.original_content && msg.original_language !== currentUser.default_language;
    const showingOriginal = showOriginal === msg.id;

    return (
      <div key={msg.id} className={`flex mb-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-xs lg:max-w-md px-3 py-2 rounded-2xl shadow-sm relative ${
            isMine
              ? 'rounded-br-md text-white'
              : 'bg-white rounded-bl-md text-gray-900'
          }`}
          style={isMine ? { backgroundColor: '#005c4b' } : {}}
        >
          {/* Sender name in groups */}
          {!isMine && conversation.is_group && (
            <p className="text-xs font-semibold mb-1" style={{ color: '#25d366' }}>
              {msg.sender_name}
            </p>
          )}

          {/* Text message */}
          {(msg.message_type === 'text') && (
            <div>
              <p className="text-sm whitespace-pre-wrap break-words">
                {showingOriginal ? msg.original_content : msg.content}
              </p>
              {isTranslated && (
                <button
                  onClick={() => setShowOriginal(showingOriginal ? null : msg.id)}
                  className={`flex items-center gap-1 mt-1 text-xs ${isMine ? 'text-emerald-200' : 'text-emerald-600'} hover:underline`}
                >
                  <Globe size={11} />
                  {showingOriginal ? 'Show translation' : 'Show original'}
                </button>
              )}
            </div>
          )}

          {/* Voice message */}
          {msg.message_type === 'voice' && (
            <div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const audioUrl = !isMine && msg.translated_audio_url
                      ? msg.translated_audio_url
                      : msg.media_url || '';
                    playAudio(audioUrl, msg.id);
                  }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${isMine ? 'bg-emerald-600' : 'bg-emerald-100'}`}
                >
                  {playingAudio === msg.id ? (
                    <Pause size={14} className={isMine ? 'text-white' : 'text-emerald-600'} />
                  ) : (
                    <Play size={14} className={isMine ? 'text-white' : 'text-emerald-600'} />
                  )}
                </button>
                <div className="flex-1">
                  <div className={`h-1 rounded-full ${isMine ? 'bg-emerald-600' : 'bg-emerald-200'}`}>
                    <div className={`h-1 rounded-full w-1/2 ${isMine ? 'bg-emerald-300' : 'bg-emerald-500'}`} />
                  </div>
                </div>
                <Mic size={14} className={isMine ? 'text-emerald-300' : 'text-emerald-500'} />
              </div>
              {msg.content && msg.content !== 'Voice message' && (
                <p className="text-xs mt-1 opacity-80">{showingOriginal ? msg.original_content : msg.content}</p>
              )}
              {isTranslated && (
                <button
                  onClick={() => setShowOriginal(showingOriginal ? null : msg.id)}
                  className={`flex items-center gap-1 mt-1 text-xs ${isMine ? 'text-emerald-200' : 'text-emerald-600'} hover:underline`}
                >
                  <Globe size={11} />
                  {showingOriginal ? 'Translated' : 'Original'}
                </button>
              )}
            </div>
          )}

          {/* Image */}
          {msg.message_type === 'image' && msg.media_url && (
            <div>
              <img
                src={getMediaUrl(msg.media_url)}
                alt="Shared image"
                className="rounded-lg max-w-full cursor-pointer"
                onClick={() => window.open(getMediaUrl(msg.media_url!), '_blank')}
              />
            </div>
          )}

          {/* Video */}
          {msg.message_type === 'video' && msg.media_url && (
            <div>
              <video
                src={getMediaUrl(msg.media_url)}
                controls
                className="rounded-lg max-w-full"
              />
            </div>
          )}

          {/* Document */}
          {msg.message_type === 'document' && msg.media_url && (
            <a
              href={getMediaUrl(msg.media_url)}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 p-2 rounded-lg ${isMine ? 'bg-emerald-700' : 'bg-gray-100'}`}
            >
              <FileText size={24} className={isMine ? 'text-emerald-200' : 'text-emerald-600'} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{msg.media_filename || 'Document'}</p>
              </div>
              <Download size={16} className={isMine ? 'text-emerald-200' : 'text-emerald-600'} />
            </a>
          )}

          {/* Timestamp */}
          <p className={`text-right mt-1 text-[10px] ${isMine ? 'text-emerald-200' : 'text-gray-400'}`}>
            {formatTime(msg.created_at)}
            {isMine && (
              <span className="ml-1">{msg.is_read ? '✓✓' : '✓'}</span>
            )}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center px-4 py-3 shadow-sm" style={{ backgroundColor: '#075e54' }}>
        <button onClick={onBack} className="mr-2 text-white lg:hidden">
          <ArrowLeft size={24} />
        </button>
        <div className="relative">
          {otherUser?.avatar_url ? (
            <img src={getMediaUrl(otherUser.avatar_url)} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: '#25d366' }}>
              {chatName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
          )}
          {otherUser?.is_online && (
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white" />
          )}
        </div>
        <div className="ml-3 flex-1">
          <h2 className="font-semibold text-white text-sm">{chatName}</h2>
          <p className="text-xs text-emerald-100">
            {typingUsers.length > 0
              ? `${getTypingNames()} typing...`
              : otherUser?.is_online
              ? 'online'
              : otherUser?.last_seen
              ? `last seen ${new Date(otherUser.last_seen).toLocaleString()}`
              : ''}
          </p>
        </div>
      </div>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23e5ddd5' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          backgroundColor: '#ece5dd',
        }}
      >
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-3 py-2 bg-gray-100 border-t border-gray-200">
        {/* Attachment menu */}
        {showAttachMenu && (
          <div className="flex gap-4 mb-2 p-3 bg-white rounded-xl shadow-lg">
            <label className="flex flex-col items-center gap-1 cursor-pointer hover:scale-105 transition-transform">
              <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center">
                <Image size={22} className="text-white" />
              </div>
              <span className="text-xs text-gray-600">Photo</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'image')} />
            </label>
            <label className="flex flex-col items-center gap-1 cursor-pointer hover:scale-105 transition-transform">
              <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center">
                <Film size={22} className="text-white" />
              </div>
              <span className="text-xs text-gray-600">Video</span>
              <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e, 'video')} />
            </label>
            <label className="flex flex-col items-center gap-1 cursor-pointer hover:scale-105 transition-transform">
              <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
                <FileText size={22} className="text-white" />
              </div>
              <span className="text-xs text-gray-600">Document</span>
              <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'document')} />
            </label>
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            className="p-2.5 text-gray-500 hover:text-emerald-600 transition-colors"
          >
            <Paperclip size={22} />
          </button>

          <div className="flex-1 bg-white rounded-2xl px-4 py-2 shadow-sm">
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); handleTyping(); }}
              onKeyDown={handleKeyDown}
              placeholder="Type a message"
              rows={1}
              className="w-full outline-none resize-none text-sm max-h-32"
              style={{ lineHeight: '1.5' }}
            />
          </div>

          {text.trim() ? (
            <button
              onClick={handleSend}
              disabled={sending}
              className="p-2.5 rounded-full text-white shadow-lg disabled:opacity-50"
              style={{ backgroundColor: '#075e54' }}
            >
              <Send size={20} />
            </button>
          ) : (
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`p-2.5 rounded-full text-white shadow-lg ${isRecording ? 'bg-red-500 animate-pulse' : ''}`}
              style={!isRecording ? { backgroundColor: '#075e54' } : {}}
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" className="hidden" />
    </div>
  );
}
