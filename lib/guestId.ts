'use client'

const STORAGE_KEY_ID = 'livevault_guest_user_id'
const STORAGE_KEY_NAME = 'livevault_guest_name'

function randomDigits(n: number) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('')
}

function randomUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export function getGuestIdentity(): { guestUserId: string; guestName: string } {
  let guestUserId = localStorage.getItem(STORAGE_KEY_ID)
  let guestName = localStorage.getItem(STORAGE_KEY_NAME)

  if (!guestUserId || !guestName) {
    guestUserId = randomUUID()
    guestName = `ゲスト${randomDigits(4)}`
    localStorage.setItem(STORAGE_KEY_ID, guestUserId)
    localStorage.setItem(STORAGE_KEY_NAME, guestName)
  }

  return { guestUserId, guestName }
}
