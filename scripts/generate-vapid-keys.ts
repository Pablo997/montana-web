#!/usr/bin/env tsx
/**
 * Generates a fresh VAPID keypair for Web Push.
 *
 * Run this once when you set the project up, or again whenever you
 * want to invalidate every existing push subscription at once
 * (useful if the private key ever leaks). Every client that had
 * subscribed with the old public key will silently stop receiving
 * pushes — an acceptable trade-off for a security rotation.
 *
 * Usage: `npm run vapid:generate`
 *
 * Output:
 *   - NEXT_PUBLIC_VAPID_PUBLIC_KEY → safe in the browser bundle; add
 *     to `.env.local` and Vercel (Production + Preview).
 *   - VAPID_PRIVATE_KEY            → server-only; add to the Supabase
 *     Edge Function secrets, nowhere else. NEVER commit.
 *   - VAPID_SUBJECT                → a mailto: URI identifying the
 *     sender; required by the VAPID spec. Use a real inbox you
 *     monitor so push providers can contact you about abuse/limits.
 */
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log('\nGenerated VAPID keypair.');
console.log('─'.repeat(60));
console.log('\nAdd to .env.local AND Vercel (Production + Preview):');
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log('\nAdd to Supabase → Edge Functions → Secrets:');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:your-real-email@domain.com');
console.log('\nNEVER commit the private key. NEVER prefix it with NEXT_PUBLIC_.');
console.log('─'.repeat(60));
console.log('');
