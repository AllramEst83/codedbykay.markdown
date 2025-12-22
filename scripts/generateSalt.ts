import * as crypto from 'crypto';

/**
 * Generates a cryptographic salt for use in key derivation functions
 * Outputs the salt in base64 format
 */
function generateSalt(): void {
  // Generate a 32-byte random salt (recommended size for strong security)
  const saltLength = 32; // 32 bytes = 256 bits
  const salt = crypto.randomBytes(saltLength);
  
  // Output in different formats
  console.log('=== Salt Generated ===\n');
  console.log('Base64 format (recommended for environment variables):');
  console.log(salt.toString('base64'));
  console.log('\nHex format:');
  console.log(salt.toString('hex'));
  console.log('\nSalt length:', saltLength, 'bytes (', saltLength * 8, 'bits)');
  console.log('\n⚠️  Store this salt securely and never commit it to version control!');
}

// Run the generator
generateSalt();

