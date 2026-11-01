/**
 * useProfile — manages per-address profile data stored in localStorage.
 *
 * What's stored:  avatar (base64 data URL), displayName, bio (mirrored locally).
 * Contract data (rate, sessions, rating) is read onchain via useExpert.
 *
 * Note: localStorage is per-browser. Avatars uploaded on one device are
 * visible only in that browser. For a production app, store avatars on IPFS
 * or a CDN and record the CID/URL onchain or in a shared database.
 */

import { useState, useCallback } from 'react'

const STORAGE_KEY = (address: string) => `vc_profile_${address.toLowerCase()}`

export interface LocalProfile {
  avatar: string | null   // base64 data URL or null
}

function loadProfile(address: string): LocalProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(address))
    if (raw) return JSON.parse(raw) as LocalProfile
  } catch { /* ignore */ }
  return { avatar: null }
}

function saveProfile(address: string, data: LocalProfile) {
  try {
    localStorage.setItem(STORAGE_KEY(address), JSON.stringify(data))
  } catch { /* ignore quota errors */ }
}

/** Read + write the local profile for a given address. */
export function useProfile(address: string | undefined) {
  // Lazy initializer reads localStorage once at mount (no effect needed)
  const [profile, setProfileState] = useState<LocalProfile>(() =>
    address ? loadProfile(address) : { avatar: null }
  )

  const setAvatar = useCallback((dataUrl: string | null) => {
    if (!address) return
    const next = { avatar: dataUrl }
    saveProfile(address, next)
    setProfileState(next)
  }, [address])

  return { profile, setAvatar }
}

/** Read-only: load any address's local profile (for viewing other profiles). */
export function useReadProfile(address: string | undefined) {
  // Lazy initializer — no effect, no cascading renders
  const [profile] = useState<LocalProfile>(() =>
    address ? loadProfile(address) : { avatar: null }
  )
  return profile
}

/**
 * Compress + convert a File to a base64 data URL small enough for localStorage.
 * Resizes to max 256×256 and encodes as JPEG at 80% quality.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 256
      const scale = Math.min(1, MAX / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('canvas')); return }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = reject
    img.src = url
  })
}
