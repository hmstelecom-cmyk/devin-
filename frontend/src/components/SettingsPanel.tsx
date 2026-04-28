import { useState, useEffect, useRef } from 'react';
import { updateProfile, getLanguages, getMediaUrl, getCallPreferences, updateCallPreferences, uploadRingtone, deleteRingtone } from '../services/api';
import type { User, Language, CallPreferences } from '../types';
import { ArrowLeft, Globe, User as UserIcon, MessageSquare, Save, Camera, Bell, Phone, Upload, Play, Trash2, RotateCcw } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
  const [notificationSound, setNotificationSound] = useState(user.notification_sound !== false);
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const ringtoneInputRef = useRef<HTMLInputElement>(null);
  const [callPrefs, setCallPrefs] = useState<CallPreferences | null>(null);
  const [selectedRingtone, setSelectedRingtone] = useState('classic');
  const [previewingRingtone, setPreviewingRingtone] = useState<string | null>(null);
  const [uploadingRingtone, setUploadingRingtone] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const DEFAULT_RINGTONES = [
    { key: 'classic', label: 'Classic' },
    { key: 'modern', label: 'Modern' },
    { key: 'soft', label: 'Soft' },
    { key: 'digital', label: 'Digital' },
    { key: 'minimal', label: 'Minimal' },
  ];

  useEffect(() => {
    getLanguages().then(setLanguages).catch(() => {});
    getCallPreferences().then((prefs) => {
      setCallPrefs(prefs);
      setSelectedRingtone(prefs.default_ringtone_key || 'classic');
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateProfile({
        display_name: displayName,
        status_text: statusText,
        default_language: defaultLanguage,
        notification_sound: notificationSound,
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/upload/avatar`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setAvatarUrl(data.avatar_url);
      const updated = await updateProfile({ avatar_url: data.avatar_url });
      onUserUpdate(updated);
    } catch {
      alert('Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
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
          <div className="relative">
            {avatarUrl ? (
              <img src={getMediaUrl(avatarUrl)} alt="" className="w-24 h-24 rounded-full object-cover" />
            ) : (
              <div className="w-24 h-24 rounded-full flex items-center justify-center text-white text-2xl font-bold" style={{ backgroundColor: '#25d366' }}>
                {getInitials(displayName)}
              </div>
            )}
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center text-white shadow-lg"
              style={{ backgroundColor: '#075e54' }}
              title="Change profile photo"
            >
              {uploadingAvatar ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera size={16} />
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>
          <p className="text-lg font-semibold text-gray-900 mt-4">{user.display_name}</p>
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

          {/* Notification sound toggle */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-emerald-600" />
                <span className="text-sm font-medium text-gray-700">Notification Sound</span>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={notificationSound}
                  onChange={(e) => setNotificationSound(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-11 h-6 rounded-full transition-colors ${notificationSound ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform mt-0.5 ${notificationSound ? 'translate-x-5.5 ml-[22px]' : 'translate-x-0.5 ml-[2px]'}`} />
                </div>
              </div>
            </label>
            <p className="text-xs text-gray-500 mt-2">
              Play a sound when receiving new messages
            </p>
          </div>

          {/* Call Ringtone Settings */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Phone size={16} className="text-emerald-600" />
              <span className="text-sm font-medium text-gray-700">Call Ringtone</span>
            </div>

            {/* Default ringtone selector */}
            <div className="space-y-2 mb-3">
              {DEFAULT_RINGTONES.map((rt) => (
                <div key={rt.key} className="flex items-center justify-between py-1.5">
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <input
                      type="radio"
                      name="ringtone"
                      checked={selectedRingtone === rt.key && (!callPrefs || callPrefs.ringtone_type === 'default')}
                      onChange={() => {
                        setSelectedRingtone(rt.key);
                        updateCallPreferences({ ringtone_type: 'default', default_ringtone_key: rt.key })
                          .then(setCallPrefs).catch(() => {});
                      }}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-gray-700">{rt.label}</span>
                  </label>
                  <button
                    onClick={() => {
                      if (previewingRingtone === rt.key) {
                        previewAudioRef.current?.pause();
                        setPreviewingRingtone(null);
                      } else {
                        if (previewAudioRef.current) previewAudioRef.current.pause();
                        const audio = new Audio(`/ringtone-${rt.key}.mp3`);
                        audio.onended = () => setPreviewingRingtone(null);
                        audio.play().catch(() => {});
                        previewAudioRef.current = audio;
                        setPreviewingRingtone(rt.key);
                      }
                    }}
                    className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                    title="Preview"
                  >
                    <Play size={14} className={previewingRingtone === rt.key ? 'text-emerald-600' : 'text-gray-400'} />
                  </button>
                </div>
              ))}
            </div>

            {/* Custom ringtone */}
            <div className="border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Custom Ringtone</span>
                {callPrefs?.custom_ringtone_url && (
                  <button
                    onClick={() => {
                      deleteRingtone().then(() => {
                        setCallPrefs((prev) => prev ? { ...prev, ringtone_type: 'default', custom_ringtone_url: null, custom_ringtone_filename: null, custom_ringtone_size_bytes: null } : prev);
                      }).catch(() => {});
                    }}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
                    title="Remove custom ringtone"
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                )}
              </div>

              {callPrefs?.custom_ringtone_url ? (
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <input
                      type="radio"
                      name="ringtone"
                      checked={callPrefs.ringtone_type === 'custom'}
                      onChange={() => {
                        updateCallPreferences({ ringtone_type: 'custom' })
                          .then(setCallPrefs).catch(() => {});
                      }}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="text-sm text-gray-700">{callPrefs.custom_ringtone_filename}</p>
                      <p className="text-xs text-gray-400">
                        {callPrefs.custom_ringtone_size_bytes
                          ? `${(callPrefs.custom_ringtone_size_bytes / 1024).toFixed(1)} KB`
                          : ''}
                      </p>
                    </div>
                  </label>
                  <button
                    onClick={() => {
                      if (previewingRingtone === 'custom') {
                        previewAudioRef.current?.pause();
                        setPreviewingRingtone(null);
                      } else {
                        if (previewAudioRef.current) previewAudioRef.current.pause();
                        const audio = new Audio(getMediaUrl(callPrefs.custom_ringtone_url!));
                        audio.onended = () => setPreviewingRingtone(null);
                        audio.play().catch(() => {});
                        previewAudioRef.current = audio;
                        setPreviewingRingtone('custom');
                      }
                    }}
                    className="p-1.5 rounded-full hover:bg-gray-100"
                    title="Preview"
                  >
                    <Play size={14} className={previewingRingtone === 'custom' ? 'text-emerald-600' : 'text-gray-400'} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => ringtoneInputRef.current?.click()}
                  disabled={uploadingRingtone}
                  className="w-full py-2 px-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors flex items-center justify-center gap-2"
                >
                  {uploadingRingtone ? (
                    <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  {uploadingRingtone ? 'Uploading...' : 'Upload custom ringtone'}
                </button>
              )}

              {/* Reset to default */}
              {callPrefs?.ringtone_type === 'custom' && (
                <button
                  onClick={() => {
                    updateCallPreferences({ ringtone_type: 'default', default_ringtone_key: 'classic' })
                      .then((prefs) => {
                        setCallPrefs(prefs);
                        setSelectedRingtone('classic');
                      }).catch(() => {});
                  }}
                  className="mt-2 flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
                >
                  <RotateCcw size={12} /> Reset to default
                </button>
              )}

              <input
                ref={ringtoneInputRef}
                type="file"
                accept=".mp3,.wav,.ogg,.m4a,audio/mpeg,audio/wav,audio/ogg,audio/mp4"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) {
                    alert('Ringtone file must be under 2 MB');
                    return;
                  }
                  setUploadingRingtone(true);
                  try {
                    await uploadRingtone(file);
                    const prefs = await getCallPreferences();
                    setCallPrefs(prefs);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Upload failed');
                  } finally {
                    setUploadingRingtone(false);
                    if (ringtoneInputRef.current) ringtoneInputRef.current.value = '';
                  }
                }}
              />

              <p className="text-xs text-gray-400 mt-2">
                Supported: .mp3, .wav, .ogg (max 2 MB)
              </p>
            </div>
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
