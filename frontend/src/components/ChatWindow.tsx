import { useState, useRef, useEffect } from 'react';
import type { Message, User, Conversation } from '../types';
import { sendMessage, getMediaUrl, markRead, forwardMessage } from '../services/api';
import { Send, Paperclip, Mic, MicOff, ArrowLeft, Image, FileText, Film, Globe, Play, Pause, Download, X, Volume2, Share2, ExternalLink, Forward, Check, CheckCheck } from 'lucide-react';

// RTL languages that need right-to-left text direction
const RTL_LANGUAGES = new Set(['he', 'ar', 'ur', 'fa', 'ps', 'sd', 'yi']);
const isRTL = (lang: string) => RTL_LANGUAGES.has(lang);

interface ChatWindowProps {
  conversation: Conversation;
  messages: Message[];
  currentUser: User;
  allConversations: Conversation[];
  onMessageSent: () => void;
  onBack: () => void;
  onSendTyping: () => void;
  typingUsers: number[];
}

export default function ChatWindow({
  conversation,
  messages,
  currentUser,
  allConversations,
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
  const [speakingMsg, setSpeakingMsg] = useState<number | null>(null);
  const [mediaViewer, setMediaViewer] = useState<{ url: string; type: 'image' | 'video'; filename?: string } | null>(null);
  const [mediaMenu, setMediaMenu] = useState<{ url: string; filename: string; type: string; x: number; y: number } | null>(null);
  const [forwardingMsg, setForwardingMsg] = useState<Message | null>(null);
  const [selectedForwardConvs, setSelectedForwardConvs] = useState<number[]>([]);
  const [forwardSearchQuery, setForwardSearchQuery] = useState('');
  const [isForwarding, setIsForwarding] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
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

  // Close media menu on click outside
  useEffect(() => {
    const handleClick = () => setMediaMenu(null);
    if (mediaMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [mediaMenu]);

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

  const speakMessage = (msg: Message) => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if (speakingMsg === msg.id) {
      setSpeakingMsg(null);
      return;
    }
    let audioUrl = msg.translated_audio_url;
    if (!audioUrl && msg.translations) {
      const trans = msg.translations.find((t) => t.language === currentUser.default_language);
      if (trans?.translated_audio_url) {
        audioUrl = trans.translated_audio_url;
      }
    }
    if (audioUrl) {
      const audio = new Audio(getMediaUrl(audioUrl));
      ttsAudioRef.current = audio;
      setSpeakingMsg(msg.id);
      audio.play();
      audio.onended = () => { setSpeakingMsg(null); ttsAudioRef.current = null; };
    } else {
      const utterance = new SpeechSynthesisUtterance(msg.content);
      utterance.lang = currentUser.default_language;
      setSpeakingMsg(msg.id);
      utterance.onend = () => setSpeakingMsg(null);
      speechSynthesis.speak(utterance);
    }
  };

  const openMediaViewer = (url: string, type: 'image' | 'video', filename?: string) => {
    setMediaViewer({ url: getMediaUrl(url), type, filename });
  };

  const downloadMedia = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = getMediaUrl(url);
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const shareMedia = async (url: string, filename: string) => {
    const fullUrl = getMediaUrl(url);
    if (navigator.share) {
      try {
        await navigator.share({ title: filename, url: fullUrl });
      } catch { /* User cancelled */ }
    } else {
      await navigator.clipboard.writeText(fullUrl);
      alert('Link copied to clipboard!');
    }
  };

  const showMediaOptions = (e: React.MouseEvent, url: string, filename: string, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMediaMenu({ url, filename, type, x: e.clientX, y: e.clientY });
  };

  const openForwardDialog = (msg: Message) => {
    setForwardingMsg(msg);
    setSelectedForwardConvs([]);
    setForwardSearchQuery('');
  };

  const toggleForwardConv = (convId: number) => {
    setSelectedForwardConvs((prev) =>
      prev.includes(convId) ? prev.filter((id) => id !== convId) : prev.length < 5 ? [...prev, convId] : prev
    );
  };

  const handleForward = async () => {
    if (!forwardingMsg || selectedForwardConvs.length === 0) return;
    setIsForwarding(true);
    try {
      await forwardMessage(forwardingMsg.id, selectedForwardConvs);
      setForwardingMsg(null);
      setSelectedForwardConvs([]);
      onMessageSent();
    } catch {
      alert('Failed to forward message');
    } finally {
      setIsForwarding(false);
    }
  };

  const getConvDisplayName = (conv: Conversation): string => {
    if (conv.name) return conv.name;
    const others = conv.members.filter((m) => m.id !== currentUser.id);
    return others.map((m) => m.display_name).join(', ') || 'Chat';
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
    // Determine text direction: for own messages use own language, for received use user's language (or original if showing original)
    const contentLang = isMine ? currentUser.default_language : (showingOriginal ? (msg.original_language || '') : currentUser.default_language);
    const textDir = isRTL(contentLang) ? 'rtl' as const : 'ltr' as const;

    return (
      <div key={msg.id} className={`flex mb-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-xs lg:max-w-md px-3 py-2 rounded-2xl shadow-sm relative group/msg ${
            isMine
              ? 'rounded-br-md text-white'
              : 'bg-white rounded-bl-md text-gray-900'
          }`}
          style={isMine ? { backgroundColor: '#005c4b' } : {}}
        >
          {/* Forward button - appears on hover */}
          <button
            onClick={() => openForwardDialog(msg)}
            className={`absolute -top-2 ${isMine ? '-left-8' : '-right-8'} opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 shadow-sm`}
            title="Forward"
          >
            <Forward size={14} />
          </button>

          {/* Forwarded label */}
          {msg.is_forwarded && (
            <div className={`flex items-center gap-1 mb-1 text-[11px] italic ${isMine ? 'text-emerald-200' : 'text-gray-400'}`}>
              <Forward size={10} />
              <span>Forwarded{msg.forwarded_from_name ? ` from ${msg.forwarded_from_name}` : ''}</span>
            </div>
          )}

          {/* Sender name in groups */}
          {!isMine && conversation.is_group && (
            <p className="text-xs font-semibold mb-1" style={{ color: '#25d366' }}>
              {msg.sender_name}
            </p>
          )}

          {/* Text message */}
          {(msg.message_type === 'text') && (
            <div>
              <p className="text-sm whitespace-pre-wrap break-words" dir={textDir} style={{ textAlign: textDir === 'rtl' ? 'right' : 'left' }}>
                {showingOriginal ? msg.original_content : msg.content}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {isTranslated && (
                  <button
                    onClick={() => setShowOriginal(showingOriginal ? null : msg.id)}
                    className={`flex items-center gap-1 text-xs ${isMine ? 'text-emerald-200' : 'text-emerald-600'} hover:underline`}
                  >
                    <Globe size={11} />
                    {showingOriginal ? 'Show translation' : 'Show original'}
                  </button>
                )}
                {!isMine && (
                  <button
                    onClick={() => speakMessage(msg)}
                    className={`flex items-center gap-1 text-xs ${
                      speakingMsg === msg.id
                        ? (isMine ? 'text-emerald-100' : 'text-emerald-700')
                        : (isMine ? 'text-emerald-200' : 'text-emerald-600')
                    } hover:underline`}
                    title="Listen to message"
                  >
                    <Volume2 size={11} className={speakingMsg === msg.id ? 'animate-pulse' : ''} />
                    {speakingMsg === msg.id ? 'Playing...' : 'Listen'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Voice message */}
          {msg.message_type === 'voice' && (() => {
            const translatedAudioUrl = msg.translated_audio_url || msg.translations?.find((t) => t.language === currentUser.default_language)?.translated_audio_url || '';
            // For voice messages, show translated audio whenever it exists (don't rely on text comparison)
            const hasTranslatedAudio = !isMine && !!translatedAudioUrl && msg.original_language !== currentUser.default_language;
            const translatedPlayId = msg.id + 100000; // unique ID for translated audio player

            return (
              <div>
                {/* Translated voice player - always visible for recipient when translation exists */}
                {hasTranslatedAudio && (
                  <div className="mb-2">
                    <div className="flex items-center gap-2 bg-emerald-50 rounded-lg p-2">
                      <button
                        onClick={() => playAudio(translatedAudioUrl, translatedPlayId)}
                        className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-500 shadow-sm flex-shrink-0"
                      >
                        {playingAudio === translatedPlayId ? (
                          <Pause size={16} className="text-white" />
                        ) : (
                          <Play size={16} className="text-white ml-0.5" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="h-1.5 rounded-full bg-emerald-200">
                          <div className={`h-1.5 rounded-full bg-emerald-500 transition-all ${playingAudio === translatedPlayId ? 'w-1/2' : 'w-0'}`} />
                        </div>
                        <p className="text-[10px] mt-0.5 text-emerald-600 font-medium">🌐 Translated voice</p>
                      </div>
                      <Volume2 size={14} className="text-emerald-500 flex-shrink-0" />
                    </div>
                    {/* Translated text */}
                    {msg.content && msg.content !== 'Voice message' && (
                      <p className="text-xs mt-1 opacity-70 italic px-1" dir={isRTL(currentUser.default_language) ? 'rtl' : 'ltr'} style={{ textAlign: isRTL(currentUser.default_language) ? 'right' : 'left' }}>
                        "{msg.content}"
                      </p>
                    )}
                  </div>
                )}

                {/* Original voice player - always visible */}
                <div className={`flex items-center gap-2 ${hasTranslatedAudio ? 'bg-gray-50 rounded-lg p-2' : ''}`}>
                  <button
                    onClick={() => playAudio(msg.media_url || '', msg.id)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
                      isMine ? 'bg-emerald-600' : hasTranslatedAudio ? 'bg-gray-400' : 'bg-emerald-500'
                    }`}
                  >
                    {playingAudio === msg.id ? (
                      <Pause size={16} className="text-white" />
                    ) : (
                      <Play size={16} className="text-white ml-0.5" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className={`h-1.5 rounded-full ${isMine ? 'bg-emerald-700' : 'bg-gray-200'}`}>
                      <div className={`h-1.5 rounded-full transition-all ${isMine ? 'bg-emerald-300' : 'bg-gray-500'} ${playingAudio === msg.id ? 'w-1/2' : 'w-0'}`} />
                    </div>
                    <p className={`text-[10px] mt-0.5 ${isMine ? 'text-emerald-200' : 'text-gray-400'} font-medium`}>
                      {hasTranslatedAudio ? '🎤 Original voice' : '🎤 Voice message'}
                    </p>
                  </div>
                  <Mic size={14} className={isMine ? 'text-emerald-300' : 'text-gray-400'} />
                </div>

                {/* Original text - show for sender, or when no translated audio and has transcription */}
                {!hasTranslatedAudio && msg.content && msg.content !== 'Voice message' && (
                  <p className={`text-xs mt-1 opacity-70 italic px-1 ${isMine ? '' : ''}`} dir={isRTL(isMine ? currentUser.default_language : (msg.original_language || 'en')) ? 'rtl' : 'ltr'} style={{ textAlign: isRTL(isMine ? currentUser.default_language : (msg.original_language || 'en')) ? 'right' : 'left' }}>
                    "{msg.content}"
                  </p>
                )}

                {/* Show original text toggle for recipient with translation */}
                {hasTranslatedAudio && msg.original_content && msg.original_content !== 'Voice message' && (
                  <p className="text-xs mt-1 opacity-60 italic px-1 text-gray-500" dir={isRTL(msg.original_language || 'en') ? 'rtl' : 'ltr'} style={{ textAlign: isRTL(msg.original_language || 'en') ? 'right' : 'left' }}>
                    "{msg.original_content}"
                  </p>
                )}
              </div>
            );
          })()}

          {/* Image - opens in-app viewer */}
          {msg.message_type === 'image' && msg.media_url && (
            <div className="relative group">
              <img
                src={getMediaUrl(msg.media_url)}
                alt="Shared image"
                className="rounded-lg max-w-full cursor-pointer"
                onClick={() => openMediaViewer(msg.media_url!, 'image', msg.media_filename || 'image')}
              />
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <button
                  onClick={(e) => showMediaOptions(e, msg.media_url!, msg.media_filename || 'image', 'image')}
                  className="p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70"
                  title="More options"
                >
                  <Share2 size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Video - plays in-app */}
          {msg.message_type === 'video' && msg.media_url && (
            <div className="relative group">
              <video
                src={getMediaUrl(msg.media_url)}
                controls
                className="rounded-lg max-w-full"
              />
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <button
                  onClick={(e) => showMediaOptions(e, msg.media_url!, msg.media_filename || 'video', 'video')}
                  className="p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70"
                  title="More options"
                >
                  <Share2 size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Document - in-app options menu */}
          {msg.message_type === 'document' && msg.media_url && (
            <div
              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer ${isMine ? 'bg-emerald-700' : 'bg-gray-100'}`}
              onClick={(e) => showMediaOptions(e, msg.media_url!, msg.media_filename || 'document', 'document')}
            >
              <FileText size={24} className={isMine ? 'text-emerald-200' : 'text-emerald-600'} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{msg.media_filename || 'Document'}</p>
              </div>
              <Share2 size={16} className={isMine ? 'text-emerald-200' : 'text-emerald-600'} />
            </div>
          )}

          {/* Timestamp + read receipts */}
          <p className={`text-right mt-1 text-[10px] flex items-center justify-end gap-0.5 ${isMine ? 'text-emerald-200' : 'text-gray-400'}`}>
            <span>{formatTime(msg.created_at)}</span>
            {isMine && (
              msg.is_read ? (
                <CheckCheck size={14} className="text-blue-400" />
              ) : (
                <CheckCheck size={14} className={isMine ? 'text-emerald-300/70' : 'text-gray-400'} />
              )
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

        {/* Recording indicator bar */}
        {isRecording && (
          <div className="flex items-center gap-3 mb-2 px-4 py-2.5 bg-red-50 rounded-xl border border-red-200 animate-pulse">
            <div className="relative flex items-center justify-center">
              <span className="absolute inline-flex h-4 w-4 rounded-full bg-red-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
            </div>
            <span className="text-red-600 font-medium text-sm flex-1">Recording voice message...</span>
            <div className="flex items-center gap-1">
              <span className="w-1 h-3 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-4 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-3 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="w-1 h-5 bg-red-600 rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
              <span className="w-1 h-3 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '250ms' }} />
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          <button
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            className="p-2.5 text-gray-500 hover:text-emerald-600 transition-colors"
          >
            <Paperclip size={22} />
          </button>

          {isRecording ? (
            <div className="flex-1 bg-red-50 rounded-2xl px-4 py-2 shadow-sm border border-red-200 flex items-center gap-2">
              <div className="relative">
                <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-red-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
              </div>
              <span className="text-red-500 text-sm font-medium">Recording...</span>
            </div>
          ) : (
            <div className="flex-1 bg-white rounded-2xl px-4 py-2 shadow-sm">
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); handleTyping(); }}
                onKeyDown={handleKeyDown}
                placeholder="Type a message"
                rows={1}
                className="w-full outline-none resize-none text-sm max-h-32"
                dir={isRTL(currentUser.default_language) ? 'rtl' : 'ltr'}
                style={{ lineHeight: '1.5', textAlign: isRTL(currentUser.default_language) ? 'right' : 'left' }}
              />
            </div>
          )}

          {text.trim() && !isRecording ? (
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
              className={`p-2.5 rounded-full text-white shadow-lg transition-all ${isRecording ? 'bg-red-500 scale-110' : ''}`}
              style={!isRecording ? { backgroundColor: '#075e54' } : {}}
            >
              {isRecording ? <MicOff size={20} className="animate-pulse" /> : <Mic size={20} />}
            </button>
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" className="hidden" />

      {/* In-app Media Viewer Modal */}
      {mediaViewer && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setMediaViewer(null)}>
          <div className="absolute top-4 right-4 flex gap-3 z-10">
            <button
              onClick={(e) => { e.stopPropagation(); downloadMedia(mediaViewer.url, mediaViewer.filename || 'file'); }}
              className="p-2 bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors"
              title="Download"
            >
              <Download size={20} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); shareMedia(mediaViewer.url, mediaViewer.filename || 'file'); }}
              className="p-2 bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors"
              title="Share"
            >
              <Share2 size={20} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); window.open(mediaViewer.url, '_blank'); }}
              className="p-2 bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink size={20} />
            </button>
            <button
              onClick={() => setMediaViewer(null)}
              className="p-2 bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
          {mediaViewer.filename && (
            <div className="absolute top-4 left-4 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
              {mediaViewer.filename}
            </div>
          )}
          <div onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[85vh]">
            {mediaViewer.type === 'image' ? (
              <img src={mediaViewer.url} alt="" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
            ) : (
              <video src={mediaViewer.url} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg" />
            )}
          </div>
        </div>
      )}

      {/* Forward Dialog */}
      {forwardingMsg && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setForwardingMsg(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ backgroundColor: '#075e54' }}>
              <div className="flex items-center gap-3">
                <button onClick={() => setForwardingMsg(null)} className="text-white">
                  <X size={20} />
                </button>
                <h3 className="text-white font-semibold">Forward message</h3>
              </div>
              {selectedForwardConvs.length > 0 && (
                <span className="text-emerald-200 text-sm">{selectedForwardConvs.length} selected</span>
              )}
            </div>

            {/* Search */}
            <div className="px-4 py-2 border-b">
              <input
                type="text"
                placeholder="Search conversations..."
                value={forwardSearchQuery}
                onChange={(e) => setForwardSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Message preview */}
            <div className="px-4 py-2 bg-gray-50 border-b">
              <p className="text-xs text-gray-400 mb-1">Forwarding:</p>
              <div className="text-sm text-gray-700 truncate">
                {forwardingMsg.message_type === 'text' ? (
                  forwardingMsg.original_content || forwardingMsg.content
                ) : forwardingMsg.message_type === 'voice' ? (
                  '🎤 Voice message'
                ) : forwardingMsg.message_type === 'image' ? (
                  '📷 Photo'
                ) : forwardingMsg.message_type === 'video' ? (
                  '🎥 Video'
                ) : (
                  `📄 ${forwardingMsg.media_filename || 'Document'}`
                )}
              </div>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto">
              {allConversations
                .filter((conv) => {
                  if (!forwardSearchQuery) return true;
                  const name = getConvDisplayName(conv).toLowerCase();
                  return name.includes(forwardSearchQuery.toLowerCase());
                })
                .map((conv) => {
                  const isSelected = selectedForwardConvs.includes(conv.id);
                  const displayName = getConvDisplayName(conv);
                  const others = conv.members.filter((m) => m.id !== currentUser.id);
                  const avatarUser = others[0];

                  return (
                    <div
                      key={conv.id}
                      onClick={() => toggleForwardConv(conv.id)}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                        isSelected ? 'bg-emerald-50' : ''
                      }`}
                    >
                      {/* Avatar */}
                      {avatarUser?.avatar_url ? (
                        <img src={getMediaUrl(avatarUser.avatar_url)} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: '#25d366' }}>
                          {displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">{displayName}</p>
                        {conv.id === conversation.id && (
                          <p className="text-xs text-gray-400">Current chat</p>
                        )}
                      </div>
                      {/* Checkbox */}
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'
                      }`}>
                        {isSelected && <Check size={14} className="text-white" />}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Forward button */}
            {selectedForwardConvs.length > 0 && (
              <div className="px-4 py-3 border-t bg-gray-50">
                <button
                  onClick={handleForward}
                  disabled={isForwarding}
                  className="w-full py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: '#075e54' }}
                >
                  {isForwarding ? 'Forwarding...' : `Forward to ${selectedForwardConvs.length} chat${selectedForwardConvs.length > 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context Menu for Media Options */}
      {mediaMenu && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 min-w-[180px]"
          style={{ top: Math.min(mediaMenu.y, window.innerHeight - 200), left: Math.min(mediaMenu.x, window.innerWidth - 200) }}
          onClick={(e) => e.stopPropagation()}
        >
          {(mediaMenu.type === 'image' || mediaMenu.type === 'video') && (
            <button
              onClick={() => { openMediaViewer(mediaMenu.url, mediaMenu.type as 'image' | 'video', mediaMenu.filename); setMediaMenu(null); }}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
            >
              <ExternalLink size={16} className="text-emerald-600" />
              Open in viewer
            </button>
          )}
          <button
            onClick={() => { downloadMedia(mediaMenu.url, mediaMenu.filename); setMediaMenu(null); }}
            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
          >
            <Download size={16} className="text-emerald-600" />
            Download
          </button>
          <button
            onClick={() => { shareMedia(mediaMenu.url, mediaMenu.filename); setMediaMenu(null); }}
            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
          >
            <Share2 size={16} className="text-emerald-600" />
            Share
          </button>
        </div>
      )}
    </div>
  );
}
