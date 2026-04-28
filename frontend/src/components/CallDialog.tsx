import { useState, useEffect, useRef, useCallback } from 'react';
import type { User, Conversation, CallSession } from '../types';
import { callService } from '../services/callService';
import { registerPeerId, answerCall as apiAnswerCall, endCall as apiEndCall, declineCall as apiDeclineCall, cancelCall as apiCancelCall, getMediaUrl } from '../services/api';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff } from 'lucide-react';

interface CallDialogProps {
  callSession: CallSession;
  currentUser: User;
  conversations: Conversation[];
  onCallEnded: () => void;
}

type CallPhase = 'ringing' | 'outgoing' | 'connecting' | 'active';

export default function CallDialog({ callSession, currentUser, conversations, onCallEnded }: CallDialogProps) {
  const [phase, setPhase] = useState<CallPhase>(() => {
    if (callSession.caller_id === currentUser.id) return 'outgoing';
    return 'ringing';
  });
  const [elapsed, setElapsed] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const cleanedUpRef = useRef(false);
  const initStartedRef = useRef(false);

  const isIncoming = callSession.callee_id === currentUser.id;
  const isVideo = callSession.call_type === 'video';
  const otherUserId = callSession.caller_id === currentUser.id ? callSession.callee_id : callSession.caller_id;
  const conv = conversations.find((c) => c.id === callSession.conversation_id);
  const otherUser = conv?.members.find((m) => m.id === otherUserId);
  const otherName = otherUser?.display_name || 'Unknown';
  const otherAvatar = otherUser?.avatar_url || null;

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // Comprehensive cleanup function
  const cleanup = useCallback(() => {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;
    console.log('[CallDialog] Cleanup started');

    // Stop ringtone
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
      ringtoneRef.current = null;
      console.log('[CallDialog] Ringtone stopped');
    }

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }

    // Clear video elements srcObject
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    // Cleanup call service (stops tracks, destroys peer)
    callService.cleanup();
    console.log('[CallDialog] Cleanup finished');
  }, []);

  // Start ringtone for incoming calls
  useEffect(() => {
    if (phase === 'ringing') {
      try {
        const audio = new Audio('/ringtone-classic.mp3');
        audio.loop = true;
        audio.volume = 0.7;
        audio.play().catch(() => {
          console.log('[CallDialog] Ringtone autoplay blocked');
        });
        ringtoneRef.current = audio;
        console.log('[CallDialog] Ringtone started');
      } catch {
        console.log('[CallDialog] Failed to create ringtone audio');
      }
    }
    return () => {
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current.currentTime = 0;
      }
    };
  }, [phase]);

  // Attach remote stream to media elements
  const attachRemoteStream = useCallback((stream: MediaStream) => {
    console.log('[CallDialog] Attaching remote stream, tracks:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
    if (isVideo && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
      remoteVideoRef.current.play().catch((e) => console.error('[CallDialog] Remote video play error:', e));
      console.log('[CallDialog] Remote stream attached to video element');
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.play().catch((e) => console.error('[CallDialog] Remote audio play error:', e));
      console.log('[CallDialog] Remote stream attached to audio element');
    }
  }, [isVideo]);

  // Attach local video preview
  const attachLocalPreview = useCallback((stream: MediaStream) => {
    if (isVideo && localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch((e) => console.error('[CallDialog] Local video play error:', e));
      console.log('[CallDialog] Local preview attached');
    }
  }, [isVideo]);

  // Set up callService callbacks
  useEffect(() => {
    callService.setCallbacks({
      onRemoteStream: (stream) => {
        attachRemoteStream(stream);
        setPhase('active');
        // Stop ringtone
        if (ringtoneRef.current) {
          ringtoneRef.current.pause();
          ringtoneRef.current.currentTime = 0;
          console.log('[CallDialog] Ringtone stopped on stream received');
        }
        // Start timer
        timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      },
      onCallStateChange: (state) => {
        console.log('[CallDialog] Call state changed:', state);
        if (state === 'active') {
          setPhase('active');
        }
      },
      onError: (err) => {
        console.error('[CallDialog] Call error:', err);
        setError(err);
      },
      onCallEnded: (reason) => {
        console.log('[CallDialog] Call ended, reason:', reason);
        cleanup();
        onCallEnded();
      },
    });
  }, [attachRemoteStream, cleanup, onCallEnded]);

  // Initialize outgoing call (caller flow)
  useEffect(() => {
    if (!isIncoming && !initStartedRef.current) {
      initStartedRef.current = true;
      const initOutgoing = async () => {
        try {
          console.log('[CallDialog] Initializing outgoing call');
          const stream = await callService.getLocalStream(callSession.call_type);
          attachLocalPreview(stream);
          const peerId = await callService.initPeer();
          console.log('[CallDialog] Peer initialized:', peerId);
          await registerPeerId(callSession.id, peerId);
          console.log('[CallDialog] Peer ID registered with backend');
          setPhase('outgoing');
        } catch (err) {
          console.error('[CallDialog] Outgoing call init failed:', err);
          setError('Failed to start call. Please check microphone/camera permissions.');
        }
      };
      initOutgoing();
    }
  }, [isIncoming, callSession.id, callSession.call_type, attachLocalPreview]);

  // When callee peer ID becomes available, start PeerJS call
  useEffect(() => {
    if (!isIncoming && callSession.callee_peer_id && phase === 'outgoing') {
      console.log('[CallDialog] Callee peer ID available:', callSession.callee_peer_id);
      setPhase('connecting');
      callService.startOutgoingCall(callSession.callee_peer_id, callSession.call_type).catch((err) => {
        console.error('[CallDialog] Failed to call peer:', err);
        setError('Failed to connect to remote user');
      });
    }
  }, [isIncoming, callSession.callee_peer_id, callSession.call_type, phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const handleAnswer = async () => {
    try {
      console.log('[CallDialog] Answering call');
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current.currentTime = 0;
        console.log('[CallDialog] Ringtone stopped on answer');
      }
      setPhase('connecting');
      const stream = await callService.getLocalStream(callSession.call_type);
      attachLocalPreview(stream);
      const peerId = await callService.initPeer();
      console.log('[CallDialog] Callee peer initialized:', peerId);
      await registerPeerId(callSession.id, peerId);
      await apiAnswerCall(callSession.id);
      console.log('[CallDialog] Call answered on backend');
      await callService.answerIncomingCall(callSession.call_type);
    } catch (err) {
      console.error('[CallDialog] Answer failed:', err);
      setError('Failed to answer call. Check microphone/camera permissions.');
    }
  };

  const handleDecline = async () => {
    try {
      console.log('[CallDialog] Declining call');
      await apiDeclineCall(callSession.id);
    } catch { /* ignore */ }
    cleanup();
    onCallEnded();
  };

  const handleCancel = async () => {
    try {
      console.log('[CallDialog] Cancelling call');
      await apiCancelCall(callSession.id);
    } catch { /* ignore */ }
    cleanup();
    onCallEnded();
  };

  const handleEnd = async () => {
    try {
      console.log('[CallDialog] Ending call');
      await apiEndCall(callSession.id);
    } catch { /* ignore */ }
    cleanup();
    onCallEnded();
  };

  const handleToggleMute = () => {
    const muted = callService.toggleMute();
    setMicMuted(muted);
  };

  const handleToggleCamera = () => {
    const off = callService.toggleCamera();
    setCamOff(off);
    if (localVideoRef.current) {
      localVideoRef.current.style.display = off ? 'none' : 'block';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      {/* Hidden audio element for remote audio */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

      {isVideo && phase === 'active' ? (
        /* Full-screen video call layout */
        <div className="w-full h-full relative bg-gray-900">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          {/* Local preview overlay */}
          <div className="absolute top-4 right-4 w-32 h-44 rounded-xl overflow-hidden shadow-2xl border-2 border-white/30 bg-gray-800">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ display: camOff ? 'none' : 'block' }} />
            {camOff && (
              <div className="w-full h-full flex items-center justify-center"><VideoOff size={24} className="text-gray-500" /></div>
            )}
          </div>
          {/* Top bar */}
          <div className="absolute top-4 left-4 right-40 flex items-center gap-3">
            <div className="bg-black/50 rounded-full px-4 py-2 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-bold overflow-hidden">
                {otherAvatar ? <img src={getMediaUrl(otherAvatar)} alt="" className="w-full h-full object-cover" /> : otherName.charAt(0).toUpperCase()}
              </div>
              <span className="text-white text-sm font-medium">{otherName}</span>
              <span className="text-white/70 text-xs">{formatElapsed(elapsed)}</span>
            </div>
          </div>
          {/* Bottom controls */}
          <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-4">
            <button onClick={handleToggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors shadow-lg ${micMuted ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`} title={micMuted ? 'Unmute' : 'Mute'}>
              {micMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <button onClick={handleToggleCamera} className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors shadow-lg ${camOff ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`} title={camOff ? 'Turn on camera' : 'Turn off camera'}>
              {camOff ? <VideoOff size={22} /> : <Video size={22} />}
            </button>
            <button onClick={handleEnd} className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg" title="End call">
              <PhoneOff size={22} />
            </button>
          </div>
        </div>
      ) : (
        /* Card layout for ringing/outgoing/connecting/voice active */
        <div className="w-80 rounded-2xl overflow-hidden shadow-2xl" style={{ backgroundColor: '#075e54' }}>
          <div className="text-center pt-8 pb-4 px-6">
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-400/30 flex items-center justify-center text-white text-2xl font-bold mb-4 overflow-hidden">
              {otherAvatar ? <img src={getMediaUrl(otherAvatar)} alt="" className="w-full h-full object-cover" /> : otherName.charAt(0).toUpperCase()}
            </div>
            <h3 className="text-xl font-semibold text-white">{otherName}</h3>
            <p className="text-emerald-200 text-sm mt-1">
              {phase === 'ringing' && `Incoming ${isVideo ? 'video' : 'voice'} call...`}
              {phase === 'outgoing' && 'Calling...'}
              {phase === 'connecting' && 'Connecting...'}
              {phase === 'active' && formatElapsed(elapsed)}
            </p>
            {error && <p className="text-red-300 text-xs mt-2">{error}</p>}
            {(phase === 'ringing' || phase === 'outgoing') && (
              <div className="mt-3 flex items-center justify-center gap-1">
                {isVideo ? <Video size={16} className="text-emerald-300" /> : <Phone size={16} className="text-emerald-300" />}
                <span className="text-emerald-300 text-xs">{isVideo ? 'Video Call' : 'Voice Call'}</span>
              </div>
            )}
            {(phase === 'ringing' || phase === 'outgoing') && (
              <div className="mt-2 flex justify-center">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
                </div>
              </div>
            )}
          </div>

          {/* Local preview for video during outgoing/connecting */}
          {isVideo && phase !== 'ringing' && (
            <div className="mx-6 mb-4 rounded-xl bg-gray-900 h-40 overflow-hidden">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ display: camOff ? 'none' : 'block' }} />
              {camOff && <div className="w-full h-full flex items-center justify-center"><VideoOff size={32} className="text-gray-600" /></div>}
            </div>
          )}

          <div className="pb-8 px-6">
            {phase === 'ringing' ? (
              <div className="flex justify-center gap-8">
                <button onClick={handleDecline} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg hover:bg-red-600 transition-colors" title="Decline">
                  <PhoneOff size={28} />
                </button>
                <button onClick={handleAnswer} className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg hover:bg-green-600 transition-colors animate-pulse" title="Answer">
                  {isVideo ? <Video size={28} /> : <Phone size={28} />}
                </button>
              </div>
            ) : phase === 'outgoing' ? (
              <div className="flex justify-center">
                <button onClick={handleCancel} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg hover:bg-red-600 transition-colors" title="Cancel call">
                  <PhoneOff size={28} />
                </button>
              </div>
            ) : (
              <div className="flex justify-center gap-4">
                <button onClick={handleToggleMute} className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-colors ${micMuted ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`} title={micMuted ? 'Unmute' : 'Mute'}>
                  {micMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                {isVideo && (
                  <button onClick={handleToggleCamera} className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-colors ${camOff ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`} title={camOff ? 'Turn on camera' : 'Turn off camera'}>
                    {camOff ? <VideoOff size={20} /> : <Video size={20} />}
                  </button>
                )}
                <button onClick={handleEnd} className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-colors" title="End call">
                  <PhoneOff size={20} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
