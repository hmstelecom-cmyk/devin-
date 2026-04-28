import { useState, useEffect } from 'react';
import { getUsers, createConversation, getMediaUrl } from '../services/api';
import type { User, Conversation } from '../types';
import { Search, X, UserPlus, ArrowLeft } from 'lucide-react';

interface NewChatDialogProps {
  onClose: () => void;
  onChatCreated: (conv: Conversation) => void;
}

export default function NewChatDialog({ onClose, onChatCreated }: NewChatDialogProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadUsers(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadUsers = async (query?: string) => {
    try {
      const data = await getUsers(query);
      setUsers(data);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = async (user: User) => {
    try {
      const conv = await createConversation([user.id]);
      onChatCreated(conv);
    } catch {
      // handle error
    }
  };

  const getInitials = (name: string): string => {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#075e54' }}>
        <button onClick={onClose} className="text-white">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h2 className="text-lg font-semibold text-white">New Chat</h2>
          <p className="text-xs text-emerald-100">{users.length} contacts</p>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="w-full pl-10 pr-10 py-2.5 bg-gray-100 rounded-xl text-sm outline-none focus:bg-gray-50"
            autoFocus
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <UserPlus className="mx-auto mb-3" size={48} />
            <p className="text-sm">No users found</p>
            <p className="text-xs mt-1">Ask your friends to register!</p>
          </div>
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              onClick={() => handleSelectUser(user)}
              className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 transition-colors"
            >
              <div className="relative">
                {user.avatar_url ? (
                  <img src={getMediaUrl(user.avatar_url)} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: '#25d366' }}>
                    {getInitials(user.display_name)}
                  </div>
                )}
                {user.is_online && (
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white" />
                )}
              </div>
              <div className="ml-3 flex-1">
                <h3 className="font-semibold text-gray-900 text-sm">{user.display_name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{user.status_text}</p>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                <span className="capitalize">{user.default_language}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
