/**
 * useWebRTC — browser P2P audio via WebRTC with a lightweight signaling channel.
 *
 * Signaling is done via a simple polling-based channel stored in localStorage
 * (keyed by sessionId). This works for same-browser demos; for cross-device use,
 * the offer/answer strings must be exchanged out-of-band (e.g. copy-paste, QR).
 *
 * Flow:
 *  Caller (user): createOffer() → store offer → poll for answer → connected
 *  Callee (expert): poll for offer → createAnswer() → store answer → connected
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

type SignalRole = 'caller' | 'callee'

interface SignalState {
  offer?: string        // JSON-stringified RTCSessionDescriptionInit
  answer?: string       // JSON-stringified RTCSessionDescriptionInit
  callerCandidates: string[]   // JSON-stringified RTCIceCandidateInit[]
  calleeCandidates: string[]
}

function getSignalKey(sessionId: string) {
  return `vc_signal_${sessionId}`
}

function readSignal(sessionId: string): SignalState {
  try {
    const raw = localStorage.getItem(getSignalKey(sessionId))
    if (raw) return JSON.parse(raw) as SignalState
  } catch {}
  return { callerCandidates: [], calleeCandidates: [] }
}

function writeSignal(sessionId: string, update: Partial<SignalState>) {
  const current = readSignal(sessionId)
  const next: SignalState = { ...current, ...update }
  localStorage.setItem(getSignalKey(sessionId), JSON.stringify(next))
}

function appendCandidate(sessionId: string, role: SignalRole, candidate: string) {
  const current = readSignal(sessionId)
  if (role === 'caller') {
    const list = [...(current.callerCandidates || []), candidate]
    writeSignal(sessionId, { callerCandidates: list })
  } else {
    const list = [...(current.calleeCandidates || []), candidate]
    writeSignal(sessionId, { calleeCandidates: list })
  }
}

export type CallState = 'idle' | 'connecting' | 'connected' | 'ended' | 'error'

export interface UseWebRTCReturn {
  callState: CallState
  isMuted: boolean
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  /** Caller: create offer and store it */
  startCall: () => Promise<void>
  /** Callee: read offer, create answer */
  joinCall: () => Promise<void>
  toggleMute: () => void
  endCall: () => void
  /** The offer string for manual exchange (copy-paste) */
  offerString: string | null
  /** Set the answer string from the callee (for manual exchange) */
  setAnswerFromString: (answer: string) => Promise<void>
  /** Get the offer string from the caller (for manual exchange) */
  getOfferString: () => string | null
  error: string | null
}

export function useWebRTC(sessionId: string, _role: SignalRole): UseWebRTCReturn {
  const [callState, setCallState] = useState<CallState>('idle')
  const [isMuted, setIsMuted] = useState(false)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [offerString, setOfferString] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const addedCandidatesRef = useRef<Set<string>>(new Set())

  const cleanup = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (pcRef.current) {
      pcRef.current.onicecandidate = null
      pcRef.current.ontrack = null
      pcRef.current.close()
      pcRef.current = null
    }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop())
    }
    setLocalStream(null)
    setRemoteStream(null)
  }, [localStream])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const createPC = useCallback((stream: MediaStream): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    stream.getTracks().forEach(t => pc.addTrack(t, stream))

    const remote = new MediaStream()
    setRemoteStream(remote)

    pc.ontrack = (ev) => {
      ev.streams[0]?.getTracks().forEach(t => remote.addTrack(t))
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('connected')
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setCallState('ended')
      }
    }

    pcRef.current = pc
    return pc
  }, [])

  const startCall = useCallback(async () => {
    try {
      setCallState('connecting')
      setError(null)

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      setLocalStream(stream)

      const pc = createPC(stream)

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          appendCandidate(sessionId, 'caller', JSON.stringify(ev.candidate.toJSON()))
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const offerStr = JSON.stringify(offer)
      writeSignal(sessionId, { offer: offerStr })
      setOfferString(offerStr)

      // Poll for answer and callee ICE candidates
      const pollFn = async () => {
        const sig = readSignal(sessionId)
        if (sig.answer && pc.remoteDescription === null) {
          try {
            await pc.setRemoteDescription(JSON.parse(sig.answer) as RTCSessionDescriptionInit)
          } catch {}
        }
        // Apply callee candidates not yet added
        for (const cand of sig.calleeCandidates ?? []) {
          if (!addedCandidatesRef.current.has(cand)) {
            addedCandidatesRef.current.add(cand)
            try { await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(cand) as RTCIceCandidateInit)) } catch {}
          }
        }
      }
      pollRef.current = setInterval(() => { void pollFn() }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start call')
      setCallState('error')
    }
  }, [sessionId, createPC])

  const joinCall = useCallback(async () => {
    try {
      setCallState('connecting')
      setError(null)

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      setLocalStream(stream)

      const pc = createPC(stream)

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          appendCandidate(sessionId, 'callee', JSON.stringify(ev.candidate.toJSON()))
        }
      }

      // Poll until offer arrives, then create answer
      let answered = false
      const joinPollFn = async () => {
        const sig = readSignal(sessionId)

        if (!answered && sig.offer) {
          answered = true
          try {
            await pc.setRemoteDescription(JSON.parse(sig.offer) as RTCSessionDescriptionInit)
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            writeSignal(sessionId, { answer: JSON.stringify(answer) })
          } catch {}
        }

        // Apply caller candidates not yet added
        for (const cand of sig.callerCandidates ?? []) {
          if (!addedCandidatesRef.current.has(cand)) {
            addedCandidatesRef.current.add(cand)
            try { await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(cand) as RTCIceCandidateInit)) } catch {}
          }
        }
      }
      pollRef.current = setInterval(() => { void joinPollFn() }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join call')
      setCallState('error')
    }
  }, [sessionId, createPC])

  const toggleMute = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled })
      setIsMuted(m => !m)
    }
  }, [localStream])

  const endCall = useCallback(() => {
    cleanup()
    setCallState('ended')
  }, [cleanup])

  const setAnswerFromString = useCallback(async (answer: string) => {
    const pc = pcRef.current
    if (!pc) return
    try {
      await pc.setRemoteDescription(JSON.parse(answer) as RTCSessionDescriptionInit)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set answer')
    }
  }, [])

  const getOfferString = useCallback(() => {
    return readSignal(sessionId).offer ?? null
  }, [sessionId])

  return {
    callState,
    isMuted,
    localStream,
    remoteStream,
    startCall,
    joinCall,
    toggleMute,
    endCall,
    offerString,
    setAnswerFromString,
    getOfferString,
    error,
  }
}
