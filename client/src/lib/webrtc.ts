/**
 * PALMPLAY WebRTC Peer Connection Manager
 * Handles local media streams, peer-to-peer audio/video negotiation,
 * ICE candidates, and connection state.
 */

import { getSocket } from './socket';

export interface WebRTCConfig {
  iceServers?: RTCIceServer[];
}

export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private roomId: string | null = null;
  private _isInitiator: boolean = false;
  public getIsInitiator(): boolean {
    return this._isInitiator;
  }
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private onRemoteStreamCallbacks: ((stream: MediaStream) => void)[] = [];
  private onConnectionStateCallbacks: ((state: ConnectionState) => void)[] = [];

  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  constructor(customConfig?: WebRTCConfig) {
    if (customConfig?.iceServers && customConfig.iceServers.length > 0) {
      this.iceServers = customConfig.iceServers;
    }
    // Check if custom TURN/STUN are set in env
    const turnUrl = import.meta.env.VITE_TURN_URL;
    const turnUser = import.meta.env.VITE_TURN_USERNAME;
    const turnCred = import.meta.env.VITE_TURN_CREDENTIAL;
    if (turnUrl) {
      this.iceServers.push({
        urls: turnUrl,
        username: turnUser,
        credential: turnCred,
      });
    }
  }

  /**
   * Request user webcam and microphone
   */
  public async getLocalMedia(videoDeviceId?: string, audioDeviceId?: string): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
    }

    const constraints: MediaStreamConstraints = {
      video: videoDeviceId
        ? { deviceId: { exact: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: audioDeviceId ? { deviceId: { exact: audioDeviceId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true },
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      return this.localStream;
    } catch (err: any) {
      console.error('[WebRTC] Error acquiring media devices:', err);
      throw err;
    }
  }

  public getExistingLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getExistingRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  /**
   * Toggle camera video track
   */
  public toggleCamera(enable?: boolean): boolean {
    if (!this.localStream) return false;
    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length === 0) return false;

    const target = enable !== undefined ? enable : !videoTracks[0].enabled;
    videoTracks.forEach((t) => (t.enabled = target));
    return target;
  }

  /**
   * Toggle microphone audio track
   */
  public toggleMic(enable?: boolean): boolean {
    if (!this.localStream) return false;
    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length === 0) return false;

    const target = enable !== undefined ? enable : !audioTracks[0].enabled;
    audioTracks.forEach((t) => (t.enabled = target));
    return target;
  }

  /**
   * Initialize PeerConnection for a specific room
   */
  public initPeerConnection(roomId: string, isInitiator: boolean) {
    this.roomId = roomId;
    this._isInitiator = isInitiator;
    this.pendingCandidates = [];

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 2,
    });
    this.peerConnection = pc;

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Remote track listener
    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote stream track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.onRemoteStreamCallbacks.forEach((cb) => cb(event.streams[0]));
      }
    };

    // ICE Candidate generation
    pc.onicecandidate = (event) => {
      if (event.candidate && this.roomId) {
        const socket = getSocket();
        socket.emit('signal-ice', {
          roomId: this.roomId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Connection state changes
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState as ConnectionState;
      console.log('[WebRTC] Connection state changed:', state);
      this.onConnectionStateCallbacks.forEach((cb) => cb(state));
    };

    // Listen for signaling messages from socket
    this.setupSignalingListeners();

    // If initiator, create and send offer
    if (isInitiator) {
      this.createAndSendOffer();
    }
  }

  private setupSignalingListeners() {
    const socket = getSocket();

    socket.off('signal-offer');
    socket.off('signal-answer');
    socket.off('signal-ice');

    socket.on('signal-offer', async ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
      console.log('[WebRTC] Received remote offer');
      if (!this.peerConnection) return;

      try {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        await this.processPendingCandidates();

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);

        socket.emit('signal-answer', {
          roomId: this.roomId,
          sdp: answer,
        });
        console.log('[WebRTC] Sent answer');
      } catch (err) {
        console.error('[WebRTC] Error handling offer:', err);
      }
    });

    socket.on('signal-answer', async ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
      console.log('[WebRTC] Received remote answer');
      if (!this.peerConnection) return;

      try {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        await this.processPendingCandidates();
      } catch (err) {
        console.error('[WebRTC] Error handling answer:', err);
      }
    });

    socket.on('signal-ice', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      if (!this.peerConnection || !candidate) return;

      if (!this.peerConnection.remoteDescription || !this.peerConnection.remoteDescription.type) {
        this.pendingCandidates.push(candidate);
      } else {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate:', err);
        }
      }
    });
  }

  private async createAndSendOffer() {
    if (!this.peerConnection || !this.roomId) return;
    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await this.peerConnection.setLocalDescription(offer);

      const socket = getSocket();
      socket.emit('signal-offer', {
        roomId: this.roomId,
        sdp: offer,
      });
      console.log('[WebRTC] Sent offer as initiator');
    } catch (err) {
      console.error('[WebRTC] Error creating offer:', err);
    }
  }

  private async processPendingCandidates() {
    if (!this.peerConnection) return;
    while (this.pendingCandidates.length > 0) {
      const candidate = this.pendingCandidates.shift();
      if (candidate) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error applying pending candidate:', err);
        }
      }
    }
  }

  public onRemoteStream(callback: (stream: MediaStream) => void) {
    this.onRemoteStreamCallbacks.push(callback);
    if (this.remoteStream) {
      callback(this.remoteStream);
    }
  }

  public onConnectionState(callback: (state: ConnectionState) => void) {
    this.onConnectionStateCallbacks.push(callback);
    if (this.peerConnection) {
      callback(this.peerConnection.connectionState as ConnectionState);
    }
  }

  /**
   * Release media tracks, close peer connection and socket listeners
   */
  public cleanup() {
    console.log('[WebRTC] Cleaning up resources...');

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
      });
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    const socket = getSocket();
    socket.off('signal-offer');
    socket.off('signal-answer');
    socket.off('signal-ice');

    this.remoteStream = null;
    this.onRemoteStreamCallbacks = [];
    this.onConnectionStateCallbacks = [];
    this.pendingCandidates = [];
    this.roomId = null;
  }
}

export const webrtcManager = new WebRTCManager();
