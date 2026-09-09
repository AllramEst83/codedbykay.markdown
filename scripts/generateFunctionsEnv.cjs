const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Generates ENCRYPTION_KEY and ENCRYPTION_SALT (hex, 32 bytes each) and
 * writes/updates them in supabase/functions/.env, which the local Supabase
 * Edge Functions runtime loads automatically.
 */
function generateHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function upsertEnvVar(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  return content.length && !content.endsWith('\n') ? `${content}\n${line}\n` : `${content}${line}\n`;
}

const envPath = path.join(__dirname, '..', 'supabase', 'functions', '.env');
let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

content = upsertEnvVar(content, 'ENCRYPTION_KEY', generateHex(32));
content = upsertEnvVar(content, 'ENCRYPTION_SALT', generateHex(32));

fs.writeFileSync(envPath, content);

console.log(`Wrote ENCRYPTION_KEY and ENCRYPTION_SALT to ${envPath}`);
console.log('Restart `supabase functions serve` / `supabase start` to pick up the new values.');
