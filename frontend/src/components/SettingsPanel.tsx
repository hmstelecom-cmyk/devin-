import { useState, useEffect } from 'react';
import { updateProfile, getLanguages } from '../services/api';
import type { User, Language } from '../types';
import { ArrowLeft, Globe, User as UserIcon, MessageSquare, Save } from 'lucide-react';

interface SettingsPanelProps {
  user: User;
  onClose: () => void;
  onUserUpdate: (user: User) => void;
}

export default function SettingsPanel({ user, onClose, onUserUpdate }: SettingsPanelProps) {
  const [displayName, setDisplayName] = useState(user.display_name);
  const [statusText, setStatusText] = useState(user.status_text);
  const [defaultLanguage, setDefaultLanguage] = useState(user.default_language);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getLanguages().then(setLanguages).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile({
        display_name: displayName,
        status_text: statusText,
        default_language: defaultLanguage,
      });
      onUserUpdate(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // handle error
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name: string): string => {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#075e54' }}>
        <button onClick={onClose} className="text-white">
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-lg font-semibold text-white">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Profile section */}
        <div className="bg-white p-6 flex flex-col items-center border-b border-gray-100">
          <div className="w-24 h-24 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4" style={{ backgroundColor: '#25d366' }}>
            {getInitials(displayName)}
          </div>
          <p className="text-lg font-semibold text-gray-900">{user.display_name}</p>
          <p className="text-sm text-gray-500">@{user.username}</p>
        </div>

        {/* Settings form */}
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <UserIcon size={16} className="text-emerald-600" />
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
            />
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <MessageSquare size={16} className="text-emerald-600" />
              Status
            </label>
            <input
              type="text"
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
            />
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Globe size={16} className="text-emerald-600" />
              Default Language
            </label>
            <select
              value={defaultLanguage}
              onChange={(e) => setDefaultLanguage(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-white"
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              All incoming messages will be automatically translated to this language
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
            style={{ backgroundColor: saved ? '#25d366' : '#075e54' }}
          >
            <Save size={18} />
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
