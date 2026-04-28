import Peer from 'peerjs';
import type { MediaConnection } from 'peerjs';

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

export interface CallInfo {
  callId: number;
  callType: 'audio' | 'video';
  callerId: number;
  calleeId: number;
  callerName: string;
  callerAvatar: string;
  conversationId: number;
  callerPeerId?: string;
  calleePeerId?: string;
}

interface CallServiceCallbacks {
  onRemoteStream: (stream: MediaStream) => void;
  onCallStateChange: (state: CallState) => void;
  onError: (error: string) => void;
  onCallEnded: (reason: string) => void;
}

class CallService {
  private peer: Peer | null = null;
  private mediaConnection: MediaConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private callbacks: CallServiceCallbacks | null = null;
  private _callState: CallState = 'idle';
  private peerId: string | null = null;

  get callState(): CallState {
    return this._callState;
  }

  get currentPeerId(): string | null {
    return this.peerId;
  }

  get currentLocalStream(): MediaStream | null {
    return this.localStream;
  }

  get currentRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  setCallbacks(callbacks: CallServiceCallbacks) {
    this.callbacks = callbacks;
  }

  private setCallState(state: CallState) {
    this._callState = state;
    this.callbacks?.onCallStateChange(state);
  }

  async initPeer(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.peer && !this.peer.destroyed) {
        if (this.peerId) {
          resolve(this.peerId);
          return;
        }
      }
      const id = `smartcomm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.peer = new Peer(id, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
          ],
        },
      });

      this.peer.on('open', (peerId) => {
        console.log('[CallService] Peer open:', peerId);
        this.peerId = peerId;
        resolve(peerId);
      });

      this.peer.on('error', (err) => {
        console.error('[CallService] Peer error:', err);
        reject(err);
      });

      // Handle incoming calls from PeerJS
      this.peer.on('call', (call) => {
        console.log('[CallService] Incoming PeerJS call from:', call.peer);
        this.mediaConnection = call;
        // We need to answer with our local stream
        if (this.localStream) {
          call.answer(this.localStream);
          this.setupMediaConnection(call);
        }
      });
    });
  }

  async getLocalStream(callType: 'audio' | 'video'): Promise<MediaStream> {
    console.log('[CallService] Acquiring local stream, type:', callType);
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: callType === 'video',
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localStream = stream;
      console.log('[CallService] Local stream acquired, tracks:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
      return stream;
    } catch (err) {
      console.error('[CallService] Failed to get local stream:', err);
      throw err;
    }
  }

  async startOutgoingCall(remotePeerId: string, callType: 'audio' | 'video'): Promise<void> {
    if (!this.peer || this.peer.destroyed) {
      throw new Error('Peer not initialized');
    }
    if (!this.localStream) {
      await this.getLocalStream(callType);
    }
    console.log('[CallService] Calling remote peer:', remotePeerId);
    this.setCallState('connecting');

    const call = this.peer.call(remotePeerId, this.localStream!);
    this.mediaConnection = call;
    this.setupMediaConnection(call);
  }

  async answerIncomingCall(callType: 'audio' | 'video'): Promise<void> {
    if (!this.localStream) {
      await this.getLocalStream(callType);
    }
    // If we already have a media connection pending (from peer.on('call')), answer it
    if (this.mediaConnection) {
      console.log('[CallService] Answering incoming PeerJS call with local stream');
      this.mediaConnection.answer(this.localStream!);
      this.setupMediaConnection(this.mediaConnection);
    }
    this.setCallState('connecting');
  }

  private setupMediaConnection(call: MediaConnection) {
    call.on('stream', (remoteStream) => {
      console.log('[CallService] Remote stream received, tracks:', remoteStream.getTracks().map(t => `${t.kind}:${t.enabled}`));
      this.remoteStream = remoteStream;
      this.setCallState('active');
      this.callbacks?.onRemoteStream(remoteStream);
    });

    call.on('close', () => {
      console.log('[CallService] Media connection closed');
      this.callbacks?.onCallEnded('normal');
    });

    call.on('error', (err) => {
      console.error('[CallService] Media connection error:', err);
      this.callbacks?.onError(String(err));
    });
  }

  toggleMute(): boolean {
    if (!this.localStream) return false;
    const audioTracks = this.localStream.getAudioTracks();
    const newState = !audioTracks[0]?.enabled;
    audioTracks.forEach((track) => {
      track.enabled = newState;
    });
    console.log('[CallService] Mute toggled, audio enabled:', newState);
    return !newState; // returns true if muted
  }

  toggleCamera(): boolean {
    if (!this.localStream) return false;
    const videoTracks = this.localStream.getVideoTracks();
    const newState = !videoTracks[0]?.enabled;
    videoTracks.forEach((track) => {
      track.enabled = newState;
    });
    console.log('[CallService] Camera toggled, video enabled:', newState);
    return !newState; // returns true if camera is off
  }

  cleanup() {
    console.log('[CallService] Cleanup started');

    // Close PeerJS media connection
    if (this.mediaConnection) {
      this.mediaConnection.close();
      this.mediaConnection = null;
    }

    // Stop all local media tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
        console.log('[CallService] Stopped local track:', track.kind);
      });
      this.localStream = null;
    }

    // Stop remote stream tracks
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.remoteStream = null;
    }

    // Destroy peer
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
      this.peer = null;
    }

    this.peerId = null;
    this.setCallState('idle');
    console.log('[CallService] Cleanup finished');
  }
}

// Singleton instance
export const callService = new CallService();
