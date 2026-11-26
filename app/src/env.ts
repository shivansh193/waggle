/**
 * Centralised env/config.
 *
 * Dev:  relay runs at ws://localhost:1999  (plain Node WS server)
 * Prod: set VITE_RELAY_HOST=your-partykit-host.partykit.dev in .env.local
 *       and VITE_RELAY_PROTOCOL=wss
 */
const relayHost: string =
  (import.meta.env['VITE_RELAY_HOST'] as string | undefined) ?? 'localhost:1999'

const relayProtocol: string =
  (import.meta.env['VITE_RELAY_PROTOCOL'] as string | undefined) ?? 'ws'

/** Build the WebSocket URL for a given room: ws://HOST/room/ROOMID */
export function relayUrl(roomId: string): string {
  return `${relayProtocol}://${relayHost}/room/${roomId}`
}

/** Legacy alias used by older imports */
export const PARTYKIT_HOST: string = relayHost

export const BASE_URL: string =
  (import.meta.env['VITE_BASE_URL'] as string | undefined) ??
  window.location.origin
