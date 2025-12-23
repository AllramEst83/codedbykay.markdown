import * as crypto from 'crypto';

/**
 * Generates a strong encryption key for AES-256 encryption
 * Outputs the key in base64 format
 */
function generateEncryptionKey(): void {
  // Generate a 32-byte (256-bit) random key for AES-256
  const keyLength = 32; // 32 bytes = 256 bits
  const key = crypto.randomBytes(keyLength);
  
  // Output in different formats
  console.log('=== Encryption Key Generated ===\n');
  console.log('Base64 format (recommended for environment variables):');
  console.log(key.toString('base64'));
  console.log('\nHex format:');
  console.log(key.toString('hex'));
  console.log('\nKey length:', keyLength, 'bytes (', keyLength * 8, 'bits)');
  console.log('\n⚠️  Store this key securely and never commit it to version control!');
}

// Run the generator
generateEncryptionKey();


