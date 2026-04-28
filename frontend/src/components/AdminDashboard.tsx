import { useState, useEffect } from 'react';
import type { AdminUser, AdminStats, AdminConversation, AdminMedia, SupabaseConfig, User } from '../types';
import {
  getAdminStats, getAdminUsers, updateUserRole, getAdminConversations,
  getAdminMedia, getSupabaseConfig, updateSupabaseConfig, testSupabaseConnection, getMediaUrl,
} from '../services/api';

type AdminView = 'home' | 'users' | 'conversations' | 'media' | 'supabase' | 'system';

interface AdminDashboardProps {
  currentUser: User;
  onClose: () => void;
}

export default function AdminDashboard({ currentUser, onClose }: AdminDashboardProps) {
  const [view, setView] = useState<AdminView>('home');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [media, setMedia] = useState<AdminMedia[]>([]);
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>({
    supabase_url: '', supabase_anon_key: '', supabase_service_role_key: '',
    auth_enabled: false, database_enabled: false, realtime_enabled: false, storage_enabled: false,
  });
  const [supabaseStatus, setSupabaseStatus] = useState<string>('pending');
  const [supabaseMessage, setSupabaseMessage] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [savingSupabase, setSavingSupabase] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => { loadData(); }, [view]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (view === 'home' || !stats) { setStats(await getAdminStats()); }
      if (view === 'users') { setUsers(await getAdminUsers()); }
      if (view === 'conversations') { setConversations(await getAdminConversations()); }
      if (view === 'media') { setMedia(await getAdminMedia()); }
      if (view === 'supabase') { setSupabaseConfig(await getSupabaseConfig()); }
    } catch { /* access denied */ } finally { setLoading(false); }
  };

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      await updateUserRole(userId, newRole);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
    } catch { alert('Failed to update role'); }
  };

  const handleSaveSupabase = async () => {
    setSavingSupabase(true);
    try { await updateSupabaseConfig(supabaseConfig); setSupabaseMessage('Saved successfully'); }
    catch { setSupabaseMessage('Failed to save'); }
    finally { setSavingSupabase(false); }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true); setSupabaseStatus('pending');
    try { const r = await testSupabaseConnection(); setSupabaseStatus(r.status); setSupabaseMessage(r.message); }
    catch { setSupabaseStatus('error'); setSupabaseMessage('Connection test failed'); }
    finally { setTestingConnection(false); }
  };

  const navItems: { id: AdminView; label: string }[] = [
    { id: 'home', label: 'Dashboard' }, { id: 'users', label: 'Users' },
    { id: 'conversations', label: 'Chats' }, { id: 'media', label: 'Media' },
    { id: 'supabase', label: 'Supabase' }, { id: 'system', label: 'System' },
  ];

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="px-4 py-3 flex items-center gap-3 shadow-sm" style={{ backgroundColor: '#075e54' }}>
        <button onClick={onClose} className="text-white text-xl">&larr;</button>
        <div>
          <h2 className="text-lg font-semibold text-white">Admin Dashboard</h2>
          <p className="text-xs text-emerald-100">{currentUser.display_name} (Admin)</p>
        </div>
      </div>

      <div className="flex overflow-x-auto bg-white border-b border-gray-200 px-2">
        {navItems.map((item) => (
          <button key={item.id} onClick={() => setView(item.id)}
            className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              view === item.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {view === 'home' && stats && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">Platform Overview</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { l: 'Total Users', v: stats.total_users, c: 'text-emerald-600' },
                    { l: 'Online Now', v: stats.online_users, c: 'text-green-600' },
                    { l: 'Conversations', v: stats.total_conversations, c: 'text-blue-600' },
                    { l: 'Messages', v: stats.total_messages, c: 'text-indigo-600' },
                    { l: 'Media Files', v: stats.total_media_files, c: 'text-purple-600' },
                    { l: 'Voice Msgs', v: stats.total_voice_messages, c: 'text-red-600' },
                    { l: 'Translations', v: stats.total_translations, c: 'text-orange-600' },
                    { l: 'Languages', v: stats.languages_in_use.length, c: 'text-teal-600' },
                  ].map((s, i) => (
                    <div key={i} className="bg-white rounded-xl p-3.5 shadow-sm border border-gray-100">
                      <p className={`text-2xl font-bold ${s.c}`}>{s.v.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">{s.l}</p>
                    </div>
                  ))}
                </div>
                {stats.languages_in_use.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Active Languages</h4>
                    <div className="flex flex-wrap gap-2">
                      {stats.languages_in_use.map((lang) => (
                        <span key={lang} className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">{lang}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {view === 'users' && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-800">User Management ({users.length})</h3>
                {users.map((user) => (
                  <div key={user.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        {user.avatar_url ? (
                          <img src={getMediaUrl(user.avatar_url)} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-sm">
                            {user.display_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {user.is_online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm text-gray-900 truncate">{user.display_name}</p>
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${user.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                            {(user.role || 'user').toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">@{user.username} · {user.default_language} · {user.message_count} msgs</p>
                      </div>
                      <select value={user.role || 'user'} onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={user.id === currentUser.id}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white disabled:opacity-50">
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {view === 'conversations' && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-800">Conversations ({conversations.length})</h3>
                {conversations.map((conv) => (
                  <div key={conv.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm text-gray-900">
                          {conv.name || conv.members.map((m: { display_name: string }) => m.display_name).join(', ')}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {conv.member_count} members · {conv.message_count} messages
                          {conv.is_group && <span className="ml-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px]">Group</span>}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400">{conv.updated_at ? new Date(conv.updated_at).toLocaleDateString() : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {view === 'media' && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-800">Media Files ({media.length})</h3>
                {media.map((item) => (
                  <div key={item.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                      item.type === 'image' ? 'bg-purple-100 text-purple-600' :
                      item.type === 'video' ? 'bg-red-100 text-red-600' :
                      item.type === 'voice' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                      {item.type === 'image' ? 'IMG' : item.type === 'video' ? 'VID' : item.type === 'voice' ? 'AUD' : 'DOC'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.filename || item.type}</p>
                      <p className="text-xs text-gray-500">By {item.sender} · Conv #{item.conversation_id}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {view === 'supabase' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">Supabase Integration</h3>
                <div className={`flex items-center gap-2 p-3 rounded-xl border ${
                  supabaseStatus === 'connected' ? 'bg-green-50 border-green-200' :
                  supabaseStatus === 'error' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}>
                  <span className={`text-sm font-medium ${
                    supabaseStatus === 'connected' ? 'text-green-700' :
                    supabaseStatus === 'error' ? 'text-red-700' : 'text-yellow-700'}`}>
                    {supabaseStatus === 'connected' ? 'Connected' : supabaseStatus === 'error' ? 'Error' : 'Not Connected'}
                  </span>
                  {supabaseMessage && <span className="text-xs text-gray-500 ml-auto">{supabaseMessage}</span>}
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700">Connection Settings</h4>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Supabase Project URL</label>
                    <input type="url" value={supabaseConfig.supabase_url}
                      onChange={(e) => setSupabaseConfig({ ...supabaseConfig, supabase_url: e.target.value })}
                      placeholder="https://your-project.supabase.co"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Anon Key</label>
                    <input type="password" value={supabaseConfig.supabase_anon_key}
                      onChange={(e) => setSupabaseConfig({ ...supabaseConfig, supabase_anon_key: e.target.value })}
                      placeholder="eyJ..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Service Role Key (Admin Only)</label>
                    <input type="password" value={supabaseConfig.supabase_service_role_key}
                      onChange={(e) => setSupabaseConfig({ ...supabaseConfig, supabase_service_role_key: e.target.value })}
                      placeholder="eyJ..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                    <p className="text-[10px] text-red-500 mt-1">Never expose this key to normal users</p>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700">Enable Modules</h4>
                  {[
                    { key: 'auth_enabled' as const, label: 'Authentication', desc: 'Use Supabase Auth instead of JWT' },
                    { key: 'database_enabled' as const, label: 'Database/Messages', desc: 'Store messages in Supabase Postgres' },
                    { key: 'realtime_enabled' as const, label: 'Realtime/Presence', desc: 'Use Supabase Realtime for WebSocket' },
                    { key: 'storage_enabled' as const, label: 'Storage/Media', desc: 'Store media files in Supabase Storage' },
                  ].map((mod) => (
                    <div key={mod.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{mod.label}</p>
                        <p className="text-[11px] text-gray-500">{mod.desc}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={!!supabaseConfig[mod.key]}
                          onChange={(e) => setSupabaseConfig({ ...supabaseConfig, [mod.key]: e.target.checked })}
                          className="sr-only peer" />
                        <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600" />
                      </label>
                    </div>
                  ))}
                </div>
                {(!supabaseConfig.supabase_url || !supabaseConfig.supabase_anon_key) && (
                  <div className="p-3 bg-yellow-50 rounded-xl border border-yellow-200">
                    <p className="text-xs font-medium text-yellow-800">Missing Configuration</p>
                    <p className="text-[11px] text-yellow-700">Supabase URL and Anon Key are required to enable any module.</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={handleSaveSupabase} disabled={savingSupabase}
                    className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-emerald-700">
                    {savingSupabase ? 'Saving...' : 'Save Configuration'}
                  </button>
                  <button onClick={handleTestConnection} disabled={testingConnection || !supabaseConfig.supabase_url}
                    className="px-4 py-2.5 border border-emerald-600 text-emerald-700 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-emerald-50">
                    {testingConnection ? 'Testing...' : 'Test'}
                  </button>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">Migration Readiness</h4>
                  <div className="space-y-2">
                    {[
                      { label: 'Project URL configured', ok: !!supabaseConfig.supabase_url },
                      { label: 'Anon key configured', ok: !!supabaseConfig.supabase_anon_key },
                      { label: 'Service role key configured', ok: !!supabaseConfig.supabase_service_role_key },
                      { label: 'Connection tested', ok: supabaseStatus === 'connected' },
                      { label: 'Module enabled', ok: supabaseConfig.auth_enabled || supabaseConfig.database_enabled || supabaseConfig.realtime_enabled || supabaseConfig.storage_enabled },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center ${item.ok ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                          {item.ok ? '\u2713' : '\u2717'}
                        </span>
                        <span className={`text-xs ${item.ok ? 'text-gray-800' : 'text-gray-400'}`}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {view === 'system' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">System Status</h3>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
                  {[
                    { name: 'Backend', status: 'Running' },
                    { name: 'Database', status: 'SQLite' },
                    { name: 'WebSocket', status: 'Active' },
                    { name: 'Translation', status: 'Google Translate' },
                    { name: 'TTS Engine', status: 'gTTS' },
                    { name: 'STT Engine', status: 'Google Speech' },
                    { name: 'Supabase', status: 'Optional' },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-700">{s.name}</span>
                      <span className={`text-xs font-medium ${s.status === 'Optional' ? 'text-yellow-600' : 'text-green-600'}`}>{s.status}</span>
                    </div>
                  ))}
                </div>
                {stats && (
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Translation Pipeline</h4>
                    <p className="text-xs text-gray-500">
                      {stats.total_translations} translations across {stats.languages_in_use.length} languages.
                      {stats.total_voice_messages > 0 && ` ${stats.total_voice_messages} voice messages processed.`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
