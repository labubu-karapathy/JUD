/**
 * ==============================================================================
 * JADAVPUR LOVE BIRDS (JLB) — WEBRTC ENGINE & CAMPUS NAT TRAVERSAL
 * ==============================================================================
 * Optimized for campus Wi-Fi environments (Symmetric NAT & strict UDP firewalls):
 * 1. Multi-tier ICE candidate gathering:
 *    - Primary: Google STUN endpoints (stun.l.google.com:19302)
 *    - Secondary / Fallback: Free open STUN/TURN servers (Metered.ca open relay)
 * 2. Transport Traversal over ports 80 & 443 (TCP/TLS):
 *    - University firewalls that block standard UDP ports allow TCP over 80/443.
 * 3. Dynamic ICE transport policy:
 *    - 'all': Attempt direct P2P first, seamlessly fall back to TURN relay.
 *    - 'relay': Force TURN relay when campus firewall blocks direct peer binding.
 * ==============================================================================
 */

export interface WebRTCOptions {
  forceTurnRelay?: boolean
}

export const CAMPUS_ICE_SERVERS: RTCIceServer[] = [
  // Google STUN (Fast UDP discovery)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },

  // Metered.ca Open TURN Relay (Standard UDP port 80)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  // Metered.ca Open TURN Relay (Standard UDP port 443)
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  // Metered.ca Open TURN Relay (TCP fallback over port 443 for strict UDP-blocking firewalls)
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  // Secure TLS TURN Relay (TURNS over TCP 443)
  {
    urls: 'turns:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

export function getWebRTCConfig(options?: WebRTCOptions): RTCConfiguration {
  const isForceRelay = options?.forceTurnRelay || false

  return {
    iceServers: CAMPUS_ICE_SERVERS,
    iceTransportPolicy: isForceRelay ? 'relay' : 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 6,
  }
}

/**
 * Creates an RTCPeerConnection configured for campus firewall traversal.
 */
export function createCampusPeerConnection(options?: WebRTCOptions): RTCPeerConnection {
  const config = getWebRTCConfig(options)
  return new RTCPeerConnection(config)
}
