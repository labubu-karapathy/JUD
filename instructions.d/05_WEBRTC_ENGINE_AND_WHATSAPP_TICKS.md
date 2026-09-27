# 05 - WebRTC Engine & WhatsApp Delivery Ticks Protocol

File: `src/services/p2pChat.ts`

## 1. Packet Protocol Specification
All packets exchanged between peers over the WebRTC `RTCDataChannel` conform to:

```typescript
export type P2PPacket = 
  | { 
      type: 'chat'; 
      id: string; 
      senderId: string; 
      text?: string; 
      media?: { blob: string; mimeType: string }; 
      timestamp: number;
    }
  | { 
      type: 'ack'; 
      messageId: string; 
      status: 'delivered' | 'read';
    };
```

---

## 2. WhatsApp Delivery Ticks Protocol Lifecycle

The delivery status lifecycle implements standard WhatsApp messaging semantics:

```
[User Types Message]
         │
         ▼
 1. Status: 'sending'  (Clock icon in message footer)
         │
         ▼ (Written to RTCDataChannel)
 2. Status: 'sent'     (Single Gray Check: ✓)
         │
         ▼ (Over network to Remote Peer)
 3. Status: 'delivered'(Double Gray Check: ✓✓)
    ↳ Remote peer receives packet via `dataChannel.onmessage` and instantly dispatches:
      { type: 'ack', messageId, status: 'delivered' }
         │
         ▼ (When Remote Peer is viewing Chat Window)
 4. Status: 'read'     (Double Green Check: ✓✓)
    ↳ If the recipient's chat window is focused & in viewport (`isChatWindowActive === true`),
      the recipient client dispatches:
      { type: 'ack', messageId, status: 'read' }
```

### React State & IndexedDB Synchronization:
When an ACK packet (`{ type: 'ack', messageId, status }`) is received:
1. `await db.updateMessageStatus(packet.messageId, packet.status)` is called on Dexie.js.
2. The `onAckReceived(messageId, status)` callback updates the React component state in `ChatRoom.tsx`, causing the tick to transition reactively.

---

## 3. Female-First Gating & Media Protection Architecture

### A. Initiation Gate:
- If current user is male and `matchInfo.has_female_initiated === false`:
  The connection engine sets state to `'waiting_for_female_initiation'` and blocks all SDP signaling.
- Only the female client dispatches the initial WebRTC Offer via Supabase Realtime Broadcast.
- Once the female client sends an offer, she automatically sets `has_female_initiated = true` in Supabase.

### B. Media Protection Guard:
1. **Header Toggle**: The female user has a toggle button in `ChatRoom.tsx`: "Allow Media Sharing" (updates `matches.media_allowed` in Supabase).
2. **Client Locking**: If `media_allowed` is `false`, the male user's attachment button is disabled with a locked icon and tooltip: *"Only she can enable media sharing"*.
3. **Defense-in-Depth Drop**: If a male user bypasses the UI and pushes a media packet over the DataChannel while `media_allowed === false`, the female client drops the packet immediately inside `handleIncomingPacket`:
   ```typescript
   if (packet.media && this.isFemale && !this.matchInfo.media_allowed) {
     console.warn('Media guard blocked unauthorized media transmission');
     return; // DROPPED IMMEDIATELY
   }
   ```
