const MODE_KEY = 'fairpay.mode'

export type DataMode = 'mock' | 'live'

export function dataMode(): DataMode {
  const saved = localStorage.getItem(MODE_KEY)
  if (saved === 'mock' || saved === 'live') return saved
  return import.meta.env.VITE_USE_MOCK === 'false' ? 'live' : 'mock'
}

export function setDataMode(mode: DataMode) {
  localStorage.setItem(MODE_KEY, mode)
  localStorage.removeItem('fairpay.token')
  window.location.assign('/login')
}

export function apiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
}

export function paypalClientId() {
  return import.meta.env.VITE_PAYPAL_CLIENT_ID || ''
}
