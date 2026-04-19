import { useState, useEffect } from 'react';
import type { User, Conversation, CallSession } from '../types';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff } from 'lucide-react';

interface CallDialogProps {
  type: 'incoming' | 'active';
  callSession: CallSession;
  currentUser: User;
  conversations: Conversation[];
  onAnswer: () => void;
  onDecline: () => void;
  onEnd: () => void;
}

export default function CallDialog({ type, callSession, currentUser, conversations, onAnswer, onDecline, onEnd }: CallDialogProps) {
  const [elapsed, setElapsed] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  const otherUserId = callSession.caller_id === currentUser.id ? callSession.callee_id : callSession.caller_id;
  const conv = conversations.find((c) => c.id === callSession.conversation_id);
  const otherUser = conv?.members.find((m) => m.id === otherUserId);
  const otherName = otherUser?.display_name || 'Unknown';
  const isVideo = callSession.call_type === 'video';

  useEffect(() => {
    if (type !== 'active') return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [type]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-80 rounded-2xl overflow-hidden shadow-2xl" style={{ backgroundColor: '#075e54' }}>
        {/* Header */}
        <div className="text-center pt-8 pb-4 px-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-emerald-400/30 flex items-center justify-center text-white text-2xl font-bold mb-4">
            {otherName.charAt(0).toUpperCase()}
          </div>
          <h3 className="text-xl font-semibold text-white">{otherName}</h3>
          <p className="text-emerald-200 text-sm mt-1">
            {type === 'incoming'
              ? `Incoming ${isVideo ? 'video' : 'audio'} call...`
              : formatElapsed(elapsed)}
          </p>
          {type === 'incoming' && (
            <div className="mt-2 flex items-center justify-center gap-1">
              {isVideo ? <Video size={16} className="text-emerald-300" /> : <Phone size={16} className="text-emerald-300" />}
              <span className="text-emerald-300 text-xs">{isVideo ? 'Video Call' : 'Audio Call'}</span>
            </div>
          )}
        </div>

        {/* Video placeholder for active video calls */}
        {type === 'active' && isVideo && (
          <div className="mx-6 mb-4 rounded-xl bg-gray-900 h-40 flex items-center justify-center">
            {camOff ? (
              <VideoOff size={32} className="text-gray-600" />
            ) : (
              <p className="text-gray-500 text-xs">Camera preview</p>
            )}
          </div>
        )}

        {/* Translated captions placeholder */}
        {type === 'active' && (
          <div className="mx-6 mb-4 p-3 bg-black/20 rounded-xl">
            <p className="text-emerald-200 text-[11px] text-center">
              Live translated captions will appear here
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="pb-8 px-6">
          {type === 'incoming' ? (
            <div className="flex justify-center gap-8">
              <button onClick={onDecline} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg hover:bg-red-600 transition-colors" title="Decline">
                <PhoneOff size={28} />
              </button>
              <button onClick={onAnswer} className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg hover:bg-green-600 transition-colors animate-pulse" title="Answer">
                {isVideo ? <Video size={28} /> : <Phone size={28} />}
              </button>
            </div>
          ) : (
            <div className="flex justify-center gap-4">
              <button onClick={() => setMicMuted(!micMuted)} className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-colors ${micMuted ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`} title={micMuted ? 'Unmute' : 'Mute'}>
                {micMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              {isVideo && (
                <button onClick={() => setCamOff(!camOff)} className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-colors ${camOff ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`} title={camOff ? 'Turn on camera' : 'Turn off camera'}>
                  {camOff ? <VideoOff size={20} /> : <Video size={20} />}
                </button>
              )}
              <button onClick={onEnd} className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-colors" title="End call">
                <PhoneOff size={20} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
