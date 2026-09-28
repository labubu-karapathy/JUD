/**
 * ==============================================================================
 * JADAVPUR LOVE BIRDS (JLB) — EPHEMERAL ZERO-KNOWLEDGE OFFLINE MESSAGE RELAY
 * ==============================================================================
 * Cloudflare Worker Blind Drop Specification:
 * - Operates as a completely zero-knowledge, ephemeral store-and-drain buffer.
 * - Endpoints:
 *   1. POST   /api/queue/:recipientHash/:msgId  -> Stores encrypted envelope with 7-day TTL
 *   2. GET    /api/queue/:recipientHash        -> Lists and returns all pending envelopes
 *   3. DELETE /api/queue/:recipientHash/:msgId  -> Atomically purges message once retrieved
 *
 * Security & Zero-Knowledge Guarantees:
 * - Client encrypts all payloads with AES-GCM-256 before transmission.
 * - This relay NEVER possesses the decryption key, user names, or phone numbers.
 * - Recipient identifiers are one-way SHA-256 hashes.
 * - Strict 64 KB payload cap prevents media uploads; media is kept on-device.
 * - 7-day auto-drop (expirationTtl: 604,800s) ensures no stale messages linger.
 * ==============================================================================
 */

export interface Env {
  OFFLINE_QUEUE: KVNamespace
}

interface EncryptedEnvelope {
  id: string
  recipientHash: string
  iv: string
  ciphertext: string
  matchId: string
  timestamp: number
  expiresAt: number
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  })
}

function isValidHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash)
}

function isValidMsgId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const pathname = url.pathname

    // Health check
    if (pathname === '/' || pathname === '/health') {
      return jsonResponse({
        service: 'JLB Ephemeral Zero-Knowledge Offline Relay',
        status: 'healthy',
        timestamp: Date.now(),
      })
    }

    // Match route: /api/queue/:recipientHash or /api/queue/:recipientHash/:msgId
    const parts = pathname.split('/').filter(Boolean)
    // parts[0] === 'api', parts[1] === 'queue', parts[2] === recipientHash, parts[3] === msgId (optional)

    if (parts.length < 3 || parts[0] !== 'api' || parts[1] !== 'queue') {
      return jsonResponse({ error: 'Endpoint not found' }, 404)
    }

    const recipientHash = parts[2]
    const msgId = parts[3]

    if (!isValidHash(recipientHash)) {
      return jsonResponse({ error: 'Invalid recipient hash format (expected 64-char SHA-256)' }, 400)
    }

    // --------------------------------------------------------------------------
    // 1. POST /api/queue/:recipientHash/:msgId — Store Encrypted Envelope
    // --------------------------------------------------------------------------
    if (request.method === 'POST') {
      if (!msgId || !isValidMsgId(msgId)) {
        return jsonResponse({ error: 'Valid msgId required in route: /api/queue/:recipientHash/:msgId' }, 400)
      }

      // Check content size (max 64 KB to enforce text-only, no media blobs)
      const contentLength = parseInt(request.headers.get('content-length') || '0', 10)
      if (contentLength > 65536) {
        return jsonResponse({ error: 'Payload exceeds 64KB limit. Media blobs must remain on device.' }, 413)
      }

      try {
        const body: any = await request.json()
        const { iv, ciphertext, matchId, timestamp } = body

        if (!iv || !ciphertext || !matchId) {
          return jsonResponse({ error: 'Missing required cryptographic fields: iv, ciphertext, matchId' }, 400)
        }

        const now = Date.now()
        const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60 // 604,800 seconds
        const expiresAt = now + SEVEN_DAYS_SECONDS * 1000

        const envelope: EncryptedEnvelope = {
          id: msgId,
          recipientHash,
          iv,
          ciphertext,
          matchId,
          timestamp: timestamp || now,
          expiresAt,
        }

        const kvKey = `queue:${recipientHash}:${msgId}`
        await env.OFFLINE_QUEUE.put(kvKey, JSON.stringify(envelope), {
          expirationTtl: SEVEN_DAYS_SECONDS,
        })

        return jsonResponse({
          success: true,
          msgId,
          recipientHash: recipientHash.slice(0, 8),
          expiresAt,
        }, 201)
      } catch (err: any) {
        return jsonResponse({ error: 'Malformed JSON payload', details: err?.message }, 400)
      }
    }

    // --------------------------------------------------------------------------
    // 2. GET /api/queue/:recipientHash — Drain / List User Envelopes
    // --------------------------------------------------------------------------
    if (request.method === 'GET') {
      try {
        const prefix = `queue:${recipientHash}:`
        const listResult = await env.OFFLINE_QUEUE.list({ prefix, limit: 100 })

        const envelopes: EncryptedEnvelope[] = []
        const fetchPromises = listResult.keys.map(async (key) => {
          const raw = await env.OFFLINE_QUEUE.get(key.name)
          if (raw) {
            try {
              envelopes.push(JSON.parse(raw))
            } catch { /* ignore corrupted */ }
          }
        })

        await Promise.all(fetchPromises)

        // Sort ascending by timestamp
        envelopes.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

        return jsonResponse({
          success: true,
          count: envelopes.length,
          envelopes,
        })
      } catch (err: any) {
        return jsonResponse({ error: 'Failed to retrieve queued envelopes', details: err?.message }, 500)
      }
    }

    // --------------------------------------------------------------------------
    // 3. DELETE /api/queue/:recipientHash/:msgId — Atomically Purge Retrieved Message
    // --------------------------------------------------------------------------
    if (request.method === 'DELETE') {
      if (!msgId || !isValidMsgId(msgId)) {
        return jsonResponse({ error: 'Valid msgId required in route: /api/queue/:recipientHash/:msgId' }, 400)
      }

      try {
        const kvKey = `queue:${recipientHash}:${msgId}`
        await env.OFFLINE_QUEUE.delete(kvKey)

        return jsonResponse({
          success: true,
          purged: msgId,
          recipientHash: recipientHash.slice(0, 8),
        })
      } catch (err: any) {
        return jsonResponse({ error: 'Failed to purge envelope', details: err?.message }, 500)
      }
    }

    return jsonResponse({ error: `Method ${request.method} not allowed` }, 405)
  },
}
