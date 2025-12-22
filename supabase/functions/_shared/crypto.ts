// Use built-in Web Crypto API (no imports needed)
// crypto is globally available in Deno

// Helper functions for hex encoding/decoding
function encodeHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function decodeHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Helper functions for base64 encoding/decoding
function encodeBase64(buffer: Uint8Array): string {
  const binString = Array.from(buffer, (byte) => String.fromCodePoint(byte)).join('');
  return btoa(binString);
}

function decodeBase64(base64: string): Uint8Array {
  const binString = atob(base64);
  return Uint8Array.from(binString, (m) => m.codePointAt(0)!);
}

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 32; // 256 bits
const SCRYPT_N = 16384; // CPU/memory cost parameter
const SCRYPT_R = 8; // Block size parameter
const SCRYPT_P = 1; // Parallelization parameter

interface EncryptedData {
  encryptedKey: string;
  iv: string;
  authTag: string;
}

/**
 * Derive encryption key using scrypt KDF from secret and salt
 */
async function deriveKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('ENCRYPTION_KEY');
  const salt = Deno.env.get('ENCRYPTION_SALT');

  if (!secret || !salt) {
    throw new Error('Missing API_KEY_ENCRYPTION_SECRET or ENCRYPTION_SALT');
  }

  // Decode hex strings to Uint8Array
  const secretBytes = decodeHex(secret);
  const saltBytes = decodeHex(salt);

  // Import the secret as a key for PBKDF2 (Deno doesn't support scrypt directly)
  // We'll use PBKDF2 with high iteration count as alternative
  const baseKey = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive the actual encryption key
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000, // High iteration count for security
      hash: 'SHA-256',
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // Not extractable
    ['encrypt', 'decrypt']
  );

  return derivedKey;
}

/**
 * Encrypt API key using AES-256-GCM
 */
/**
 * Encrypt text using AES-256-GCM
 */
export async function encrypt(plaintext: string): Promise<EncryptedData> {
  if (!plaintext || plaintext.trim() === '') {
    // For empty content, use a single space to allow encryption
    plaintext = ' ';
  }

  const key = await deriveKey();

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Convert plaintext to bytes
  const plaintextBytes = new TextEncoder().encode(plaintext);

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv,
    },
    key,
    plaintextBytes
  );

  // In AES-GCM, the authentication tag is appended to the ciphertext
  // Extract the last 16 bytes as the auth tag
  const ciphertextArray = new Uint8Array(ciphertext);
  const authTagLength = 16;
  const encryptedData = ciphertextArray.slice(0, -authTagLength);
  const authTag = ciphertextArray.slice(-authTagLength);

  return {
    encryptedKey: encodeBase64(encryptedData),
    iv: encodeBase64(iv),
    authTag: encodeBase64(authTag),
  };
}

/**
 * Decrypt text using AES-256-GCM
 */
export async function decrypt(encrypted: EncryptedData): Promise<string> {
  if (!encrypted.encryptedKey || !encrypted.iv || !encrypted.authTag) {
    throw new Error('Invalid encrypted data: missing required fields');
  }

  const key = await deriveKey();

  // Decode from base64
  const encryptedBytes = decodeBase64(encrypted.encryptedKey);
  const ivBytes = decodeBase64(encrypted.iv);
  const authTagBytes = decodeBase64(encrypted.authTag);

  // Combine encrypted data and auth tag (GCM expects them together)
  const ciphertext = new Uint8Array(encryptedBytes.length + authTagBytes.length);
  ciphertext.set(encryptedBytes, 0);
  ciphertext.set(authTagBytes, encryptedBytes.length);

  try {
    // Decrypt
    const plaintextBuffer = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: ivBytes,
      },
      key,
      ciphertext
    );

    // Convert bytes to string
    const plaintext = new TextDecoder().decode(plaintextBuffer);
    return plaintext;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data - invalid key or corrupted data');
  }
}

/**
 * Generate a random hex string (for secret/salt generation)
 */
export function generateRandomHex(bytes: number): string {
  const randomBytes = new Uint8Array(bytes);
  crypto.getRandomValues(randomBytes);
  return encodeHex(randomBytes);
}

