import { useState, useEffect, useCallback, useRef } from 'react';
import type { User, Conversation, Message, WSMessage, CallSession } from './types';
import { getMe, getConversations, getMessages, getMediaUrl, initiateCall } from './services/api';
import { callService } from './services/callService';
import { useWebSocket } from './hooks/useWebSocket';
import AuthScreen from './components/AuthScreen';
import ConversationList from './components/ConversationList';
import ChatWindow from './components/ChatWindow';
import NewChatDialog from './components/NewChatDialog';
import SettingsPanel from './components/SettingsPanel';
import InstallPrompt from './components/InstallPrompt';
import AdminDashboard from './components/AdminDashboard';
import CallDialog from './components/CallDialog';

type View = 'conversations' | 'newchat' | 'settings' | 'admin';

const NOTIFICATION_SOUND_URL = '/notification.wav';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sideView, setSideView] = useState<View>('conversations');
  const [typingUsers, setTypingUsers] = useState<number[]>([]);
  const [isMobileChat, setIsMobileChat] = useState(false);
  const [currentCall, setCurrentCall] = useState<CallSession | null>(null);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);

  const isAuthenticated = !!token && !!currentUser;

  useEffect(() => {
    notificationAudioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    notificationAudioRef.current.volume = 0.5;
  }, []);

  const playNotificationSound = useCallback(() => {
    if (currentUser?.notification_sound !== false && notificationAudioRef.current) {
      notificationAudioRef.current.currentTime = 0;
      notificationAudioRef.current.play().catch(() => {});
    }
  }, [currentUser]);

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
        if (newMsg.sender_id !== currentUser?.id) {
          if (!selectedConv || newMsg.conversation_id !== selectedConv.id) {
            playNotificationSound();
          }
          if ('Notification' in window && Notification.permission === 'granted') {
            const senderName = newMsg.sender_name || 'New Message';
            const body = newMsg.message_type === 'voice' ? 'Voice message' :
                         newMsg.message_type === 'image' ? 'Photo' :
                         newMsg.message_type === 'video' ? 'Video' :
                         newMsg.message_type === 'document' ? 'Document' :
                         newMsg.content?.substring(0, 100) || 'New message';
            const notification = new Notification(senderName, {
              body,
              icon: newMsg.sender_avatar ? getMediaUrl(newMsg.sender_avatar) : '/icon-192.png',
              tag: `msg-${newMsg.id}`,
              silent: true,
            });
            notification.onclick = () => { window.focus(); notification.close(); };
          }
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
      } else if (msg.type === 'read') {
        const data = msg.data as { conversation_id: number; user_id: number };
        if (selectedConv && data.conversation_id === selectedConv.id) {
          setMessages((prev) =>
            prev.map((m) =>
              m.sender_id === currentUser?.id ? { ...m, is_read: true } : m
            )
          );
        }
        loadConversations();
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
      } else if (msg.type === 'call') {
        const callData = msg.data as unknown as CallSession;
        if (callData.status === 'ringing' && callData.callee_id === currentUser?.id) {
          // Incoming call for us
          setCurrentCall(callData);
        } else if (callData.status === 'active' && currentCall) {
          // Call was answered - update with peer IDs
          setCurrentCall((prev) => prev ? { ...prev, ...callData, status: 'active' } : callData);
        } else if (callData.status === 'ended' || callData.status === 'declined' || callData.status === 'missed' || callData.status === 'cancelled') {
          // Call ended by other party
          callService.cleanup();
          setCurrentCall(null);
        } else if (currentCall && callData.callee_peer_id) {
          // Peer ID update from callee
          setCurrentCall((prev) => prev ? { ...prev, callee_peer_id: callData.callee_peer_id } : prev);
        }
      }
    },
    [selectedConv, loadConversations, currentUser, playNotificationSound, currentCall]
  );

  const { sendWsMessage } = useWebSocket(handleWsMessage, isAuthenticated);

  useEffect(() => {
    if (isAuthenticated && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [isAuthenticated]);

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

  const handleInitiateCall = async (calleeId: number, callType: 'audio' | 'video') => {
    if (!selectedConv) return;
    try {
      const call = await initiateCall(selectedConv.id, calleeId, callType);
      setCurrentCall(call);
    } catch {
      alert('Failed to start call');
    }
  };

  const handleCallEnded = useCallback(() => {
    setCurrentCall(null);
    loadConversations();
  }, [loadConversations]);

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
            onAdmin={currentUser.role === 'admin' ? () => setSideView('admin') : undefined}
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
        {sideView === 'admin' && (
          <AdminDashboard
            currentUser={currentUser}
            onClose={() => setSideView('conversations')}
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
            allConversations={conversations}
            onMessageSent={handleMessageSent}
            onBack={() => setIsMobileChat(false)}
            onSendTyping={handleSendTyping}
            typingUsers={typingUsers}
            onInitiateCall={handleInitiateCall}
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
      <InstallPrompt />

      {currentCall && (
        <CallDialog
          callSession={currentCall}
          currentUser={currentUser}
          conversations={conversations}
          onCallEnded={handleCallEnded}
        />
      )}
    </div>
  );
}

export default App;
