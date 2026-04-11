import { useState, useEffect, useCallback } from 'react';
import type { User, Conversation, Message, WSMessage } from './types';
import { getMe, getConversations, getMessages } from './services/api';
import { useWebSocket } from './hooks/useWebSocket';
import AuthScreen from './components/AuthScreen';
import ConversationList from './components/ConversationList';
import ChatWindow from './components/ChatWindow';
import NewChatDialog from './components/NewChatDialog';
import SettingsPanel from './components/SettingsPanel';

type View = 'conversations' | 'newchat' | 'settings';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sideView, setSideView] = useState<View>('conversations');
  const [typingUsers, setTypingUsers] = useState<number[]>([]);
  const [isMobileChat, setIsMobileChat] = useState(false);

  const isAuthenticated = !!token && !!currentUser;

  useEffect(() => {
    if (token) {
      getMe()
        .then((user) => {
          setCurrentUser(user);
          localStorage.setItem('user', JSON.stringify(user));
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
        });
    }
  }, [token]);

  const loadConversations = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const convs = await getConversations();
      setConversations(convs);
    } catch {
      // handle error
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 10000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  const loadMessages = useCallback(async () => {
    if (!selectedConv) return;
    try {
      const msgs = await getMessages(selectedConv.id);
      setMessages(msgs);
    } catch {
      // handle error
    }
  }, [selectedConv]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleWsMessage = useCallback(
    (msg: WSMessage) => {
      if (msg.type === 'new_message') {
        const newMsg = msg.data as unknown as Message;
        if (selectedConv && newMsg.conversation_id === selectedConv.id) {
          setMessages((prev) => [...prev, newMsg]);
        }
        loadConversations();
      } else if (msg.type === 'typing') {
        const data = msg.data as { user_id: number; conversation_id: number };
        if (selectedConv && data.conversation_id === selectedConv.id) {
          setTypingUsers((prev) => {
            if (!prev.includes(data.user_id)) return [...prev, data.user_id];
            return prev;
          });
          setTimeout(() => {
            setTypingUsers((prev) => prev.filter((id) => id !== data.user_id));
          }, 3000);
        }
      } else if (msg.type === 'online_status') {
        const data = msg.data as { user_id: number; is_online: boolean };
        setConversations((prev) =>
          prev.map((conv) => ({
            ...conv,
            members: conv.members.map((m) =>
              m.id === data.user_id ? { ...m, is_online: data.is_online } : m
            ),
          }))
        );
        if (selectedConv) {
          setSelectedConv((prev) =>
            prev
              ? {
                  ...prev,
                  members: prev.members.map((m) =>
                    m.id === data.user_id ? { ...m, is_online: data.is_online } : m
                  ),
                }
              : null
          );
        }
      }
    },
    [selectedConv, loadConversations]
  );

  const { sendWsMessage } = useWebSocket(handleWsMessage, isAuthenticated);

  const handleAuth = (newToken: string, user: User) => {
    setToken(newToken);
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setCurrentUser(null);
    setSelectedConv(null);
    setMessages([]);
    setConversations([]);
  };

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConv(conv);
    setIsMobileChat(true);
    setSideView('conversations');
    loadMessages();
  };

  const handleMessageSent = () => {
    loadMessages();
    loadConversations();
  };

  const handleSendTyping = () => {
    if (selectedConv) {
      sendWsMessage('typing', { conversation_id: selectedConv.id });
    }
  };

  const handleChatCreated = (conv: Conversation) => {
    setSelectedConv(conv);
    setIsMobileChat(true);
    setSideView('conversations');
    loadConversations();
  };

  const handleUserUpdate = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('user', JSON.stringify(user));
  };

  if (!isAuthenticated) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  return (
    <div className="h-screen flex bg-gray-200">
      <div
        className={`w-full lg:w-96 lg:min-w-96 flex-shrink-0 border-r border-gray-200 ${
          isMobileChat ? 'hidden lg:block' : 'block'
        }`}
      >
        {sideView === 'conversations' && (
          <ConversationList
            conversations={conversations}
            currentUser={currentUser}
            selectedConvId={selectedConv?.id || null}
            onSelectConversation={handleSelectConversation}
            onNewChat={() => setSideView('newchat')}
            onSettings={() => setSideView('settings')}
            onLogout={handleLogout}
          />
        )}
        {sideView === 'newchat' && (
          <NewChatDialog
            onClose={() => setSideView('conversations')}
            onChatCreated={handleChatCreated}
          />
        )}
        {sideView === 'settings' && (
          <SettingsPanel
            user={currentUser}
            onClose={() => setSideView('conversations')}
            onUserUpdate={handleUserUpdate}
          />
        )}
      </div>

      <div
        className={`flex-1 flex flex-col ${
          !isMobileChat ? 'hidden lg:flex' : 'flex'
        }`}
      >
        {selectedConv ? (
          <ChatWindow
            conversation={selectedConv}
            messages={messages}
            currentUser={currentUser}
            onMessageSent={handleMessageSent}
            onBack={() => setIsMobileChat(false)}
            onSendTyping={handleSendTyping}
            typingUsers={typingUsers}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center" style={{ backgroundColor: '#f0f2f5' }}>
            <div className="text-center max-w-md mx-auto px-8">
              <div className="w-40 h-40 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#00a88420' }}>
                <svg viewBox="0 0 24 24" className="w-20 h-20" fill="#075e54" opacity="0.6">
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5.16-1.34A9.86 9.86 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.67 0-3.24-.51-4.55-1.38l-.32-.19-3.31.87.88-3.22-.21-.33A7.93 7.93 0 014 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
                </svg>
              </div>
              <h2 className="text-3xl font-light text-gray-700 mb-3">SmartComm Web</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Send and receive messages with automatic translation.
                Select a conversation or start a new chat.
              </p>
              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="m7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                End-to-end translated communication
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
