const BIO_STORAGE_KEY = 'hosp-bio-unlock'

type BioRecord = {
  credentialId: string
  pin: string
}

function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBuffer(value: string): ArrayBuffer {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function readRecord(): BioRecord | null {
  try {
    const raw = localStorage.getItem(BIO_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BioRecord>
    if (
      typeof parsed.credentialId !== 'string' ||
      typeof parsed.pin !== 'string' ||
      !/^\d{6}$/.test(parsed.pin)
    ) {
      return null
    }
    return { credentialId: parsed.credentialId, pin: parsed.pin }
  } catch {
    return null
  }
}

function writeRecord(record: BioRecord) {
  localStorage.setItem(BIO_STORAGE_KEY, JSON.stringify(record))
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function' &&
    window.isSecureContext
  )
}

export async function canUsePlatformBiometric(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false
  try {
    if (
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable ===
      'function'
    ) {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    }
  } catch {
    return false
  }
  return false
}

export function hasBiometricLogin(): boolean {
  return readRecord() != null
}

export function clearBiometricLogin() {
  localStorage.removeItem(BIO_STORAGE_KEY)
}

export function updateBiometricPin(pin: string) {
  const current = readRecord()
  if (!current || !/^\d{6}$/.test(pin)) return
  writeRecord({ ...current, pin })
}

/** Parmak izi / yüz tanıma kaydı oluşturur; sonraki girişlerde kullanılır. */
export async function registerBiometricLogin(pin: string): Promise<void> {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('Önce geçerli şifre gerekli')
  }
  if (!(await canUsePlatformBiometric())) {
    throw new Error('Bu cihazda biyometrik giriş yok')
  }

  const userId = new TextEncoder().encode('ajan-owner')
  const challenge = crypto.getRandomValues(new Uint8Array(32))

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: 'AJAN',
        id: window.location.hostname,
      },
      user: {
        id: userId,
        name: 'ajan',
        displayName: 'AJAN',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 90_000,
    },
  })) as PublicKeyCredential | null

  if (!credential) {
    throw new Error('Biyometrik kayıt iptal edildi')
  }

  writeRecord({
    credentialId: bufferToBase64url(credential.rawId),
    pin,
  })
}

/** Biyometrik doğrulama sonrası kayıtlı PIN’i döner. */
export async function unlockWithBiometric(): Promise<string> {
  const record = readRecord()
  if (!record) {
    throw new Error('Kayıtlı parmak izi yok')
  }
  if (!(await canUsePlatformBiometric())) {
    throw new Error('Bu cihazda biyometrik giriş yok')
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [
        {
          type: 'public-key',
          id: base64urlToBuffer(record.credentialId),
          transports: ['internal'],
        },
      ],
      userVerification: 'required',
      timeout: 90_000,
    },
  })

  if (!assertion) {
    throw new Error('Doğrulama iptal edildi')
  }

  return record.pin
}
