import { useState } from 'react';
import type { Conversation, User } from '../types';
import { getMediaUrl } from '../services/api';
import { Search, MessageSquarePlus, Settings, LogOut, CheckCheck, Shield } from 'lucide-react';

// RTL languages that need right-to-left text direction
const RTL_LANGUAGES = new Set(['he', 'ar', 'ur', 'fa', 'ps', 'sd', 'yi']);
const isRTL = (lang: string) => RTL_LANGUAGES.has(lang);

interface ConversationListProps {
  conversations: Conversation[];
  currentUser: User;
  selectedConvId: number | null;
  onSelectConversation: (conv: Conversation) => void;
  onNewChat: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onAdmin?: () => void;
}

export default function ConversationList({
  conversations,
  currentUser,
  selectedConvId,
  onSelectConversation,
  onNewChat,
  onSettings,
  onLogout,
  onAdmin,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const getConversationName = (conv: Conversation): string => {
    if (conv.name) return conv.name;
    const otherMembers = conv.members.filter((m) => m.id !== currentUser.id);
    return otherMembers.map((m) => m.display_name).join(', ') || 'Unknown';
  };

  const getConversationAvatar = (conv: Conversation): string => {
    if (conv.is_group) return '';
    const other = conv.members.find((m) => m.id !== currentUser.id);
    return other?.avatar_url || '';
  };

  const getInitials = (name: string): string => {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const isOtherOnline = (conv: Conversation): boolean => {
    if (conv.is_group) return false;
    const other = conv.members.find((m) => m.id !== currentUser.id);
    return other?.is_online || false;
  };

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const dayDiff = Math.floor(diff / 86400000);
    if (dayDiff === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (dayDiff === 1) {
      return 'Yesterday';
    } else if (dayDiff < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const filtered = conversations.filter((conv) =>
    getConversationName(conv).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#075e54' }}>
        <h1 className="text-xl font-bold text-white">SmartComm</h1>
        <div className="flex items-center gap-3">
          <button onClick={onNewChat} className="text-white/90 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors" title="New Chat">
            <MessageSquarePlus size={22} />
          </button>
          {onAdmin && (
            <button onClick={onAdmin} className="text-white/90 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors" title="Admin Dashboard">
              <Shield size={22} />
            </button>
          )}
          <button onClick={onSettings} className="text-white/90 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors" title="Settings">
            <Settings size={22} />
          </button>
          <button onClick={onLogout} className="text-white/90 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors" title="Logout">
            <LogOut size={22} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 bg-white border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or start new chat"
            className="w-full pl-10 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm outline-none focus:bg-gray-50 transition-colors"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <MessageSquarePlus className="mx-auto mb-3 text-gray-300" size={48} />
            <p className="text-sm">No conversations yet</p>
            <button onClick={onNewChat} className="mt-2 text-emerald-600 text-sm font-medium hover:underline">
              Start a new chat
            </button>
          </div>
        ) : (
          filtered.map((conv) => {
            const name = getConversationName(conv);
            const avatar = getConversationAvatar(conv);
            const online = isOtherOnline(conv);
            const isSelected = conv.id === selectedConvId;

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv)}
                className={`flex items-center px-4 py-3 cursor-pointer transition-colors border-b border-gray-50 ${isSelected ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  {avatar ? (
                    <img src={getMediaUrl(avatar)} alt={name} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: '#25d366' }}>
                      {getInitials(name)}
                    </div>
                  )}
                  {online && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white" />
                  )}
                </div>

                {/* Content */}
                <div className="ml-3 flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 truncate text-sm">{name}</h3>
                    {conv.last_message && (
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                        {formatTime(conv.last_message.created_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-sm text-gray-500 truncate flex items-center gap-1">
                      {conv.last_message && conv.last_message.sender_id === currentUser.id && (
                        <CheckCheck size={14} className={`flex-shrink-0 ${conv.last_message.is_read ? 'text-blue-500' : 'text-gray-400'}`} />
                      )}
                      <span className="truncate" dir={conv.last_message && conv.last_message.message_type === 'text' && isRTL(currentUser.default_language) ? 'rtl' : 'ltr'}>
                        {conv.last_message
                          ? conv.last_message.message_type === 'voice'
                            ? '🎤 Voice message'
                            : conv.last_message.message_type === 'image'
                            ? '📷 Photo'
                            : conv.last_message.message_type === 'video'
                            ? '🎥 Video'
                            : conv.last_message.message_type === 'document'
                            ? '📄 Document'
                            : conv.last_message.content
                          : 'No messages yet'}
                      </span>
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="ml-2 flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: '#25d366' }}>
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
