const crypto = require('crypto');

/**
 * Generates a cryptographic salt for use in key derivation functions
 * IMPORTANT: The crypto.ts file expects HEX format for ENCRYPTION_SALT
 */
function generateSalt() {
  // Generate a 32-byte random salt (recommended size for strong security)
  const saltLength = 32; // 32 bytes = 256 bits
  const salt = crypto.randomBytes(saltLength);
  
  // Output in different formats
  console.log('=== Salt Generated ===\n');
  console.log('Hex format (REQUIRED for ENCRYPTION_SALT environment variable):');
  console.log(salt.toString('hex'));
  console.log('\nBase64 format (alternative):');
  console.log(salt.toString('base64'));
  console.log('\nSalt length:', saltLength, 'bytes (', saltLength * 8, 'bits)');
  console.log('\n⚠️  Store this salt securely and never commit it to version control!');
  console.log('⚠️  Use the HEX format value for your ENCRYPTION_SALT environment variable');
}

// Run the generator
generateSalt();

