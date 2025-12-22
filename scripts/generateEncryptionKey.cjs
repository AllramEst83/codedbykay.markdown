const crypto = require('crypto');

/**
 * Generates a strong encryption key for AES-256 encryption
 * IMPORTANT: The crypto.ts file expects HEX format for ENCRYPTION_KEY
 */
function generateEncryptionKey() {
  // Generate a 32-byte (256-bit) random key for AES-256
  const keyLength = 32; // 32 bytes = 256 bits
  const key = crypto.randomBytes(keyLength);
  
  // Output in different formats
  console.log('=== Encryption Key Generated ===\n');
  console.log('Hex format (REQUIRED for ENCRYPTION_KEY environment variable):');
  console.log(key.toString('hex'));
  console.log('\nBase64 format (alternative):');
  console.log(key.toString('base64'));
  console.log('\nKey length:', keyLength, 'bytes (', keyLength * 8, 'bits)');
  console.log('\n⚠️  Store this key securely and never commit it to version control!');
  console.log('⚠️  Use the HEX format value for your ENCRYPTION_KEY environment variable');
}

// Run the generator
generateEncryptionKey();

