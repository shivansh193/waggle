/**
 * DOM helpers for the host screen — QR code, player list, debug overlay.
 */

import QRCode from 'qrcode'
import type { Player } from '@waggle/kit'

export function renderQR(url: string): void {
  const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement
  QRCode.toCanvas(canvas, url, {
    width: 220,
    color: { dark: '#f1f5f9', light: '#12122a' },
    errorCorrectionLevel: 'M',
  }).catch(console.error)
}

export function setRoomCode(code: string): void {
  const el = document.getElementById('room-code')!
  el.textContent = code
  el.classList.remove('pulsing')
}

export function setJoinHint(url: string): void {
  const el = document.getElementById('join-hint')!
  el.textContent = url
}

export function renderPlayers(players: Player[]): void {
  const list = document.getElementById('player-list')!
  list.innerHTML = ''
  for (const p of players) {
    if (p.role === 'host') continue
    const card = document.createElement('div')
    card.className = 'player-card fade-up'
    card.style.setProperty('--player-color', p.color)
    card.innerHTML = `
      <div class="player-dot" style="background:${p.color};color:${p.color}"></div>
      <span class="player-name">${escHtml(p.name)}</span>
    `
    list.appendChild(card)
  }

  const btn = document.getElementById('start-btn') as HTMLButtonElement
  const count = players.filter(p => p.role !== 'host').length
  if (count >= 1) {
    btn.disabled = false
    btn.textContent = `Start Game (${count} player${count === 1 ? '' : 's'})`
  } else {
    btn.disabled = true
    btn.textContent = 'Waiting for players…'
  }

  const dbgPlayers = document.getElementById('dbg-players')!
  dbgPlayers.textContent = String(count)
}

export function updateDebug(opts: {
  relay?: 'ok' | 'connecting' | 'error'
  p50?: number
  p95?: number
}): void {
  if (opts.relay !== undefined) {
    const el = document.getElementById('dbg-relay')!
    el.textContent = opts.relay === 'ok' ? 'connected' : opts.relay
    el.className = opts.relay === 'ok' ? 'ok' : opts.relay === 'connecting' ? 'warn' : 'bad'
  }
  if (opts.p50 !== undefined) {
    const el = document.getElementById('dbg-p50')!
    el.textContent = opts.p50.toFixed(0)
    el.className = opts.p50 < 50 ? 'ok' : opts.p50 < 100 ? 'warn' : 'bad'
  }
  if (opts.p95 !== undefined) {
    const el = document.getElementById('dbg-p95')!
    el.textContent = opts.p95.toFixed(0)
    el.className = opts.p95 < 100 ? 'ok' : opts.p95 < 200 ? 'warn' : 'bad'
  }
}

export function showLobby(visible: boolean): void {
  const el = document.getElementById('lobby-overlay')!
  el.style.display = visible ? '' : 'none'
}

export function showGamePicker(visible: boolean): void {
  const el = document.getElementById('game-picker')!
  el.style.display = visible ? 'flex' : 'none'
}

export function showReturnBtn(visible: boolean): void {
  const el = document.getElementById('return-btn')!
  el.style.display = visible ? '' : 'none'
}

export function renderGameCards(
  games: Array<{ key: string; name: string; emoji: string; players: string; tag: string; tagClass: string; desc: string }>,
  onSelect: (key: string) => void,
): void {
  const grid = document.getElementById('game-cards-grid')!
  grid.innerHTML = ''
  for (const g of games) {
    const card = document.createElement('div')
    card.className = 'game-card'
    card.innerHTML = `
      <div class="game-card-emoji">${g.emoji}</div>
      <div class="game-card-name">${escHtml(g.name)}</div>
      <div class="game-card-tags">
        <span class="game-tag ${g.tagClass}">${escHtml(g.tag)}</span>
        <span class="game-tag">${escHtml(g.players)}</span>
      </div>
      <div class="game-card-desc">${escHtml(g.desc)}</div>
    `
    card.addEventListener('click', () => onSelect(g.key))
    grid.appendChild(card)
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
