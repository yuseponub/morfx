/**
 * Supabase client for the mobile app.
 *
 * Plan 43-04: session is persisted via AsyncStorage so the user stays logged
 * in across cold starts. `detectSessionInUrl` is OFF because React Native has
 * no URL bar — it's a web-only flow.
 *
 * Env vars (set in apps/mobile/.env.local — see .env.example):
 *   EXPO_PUBLIC_SUPABASE_URL       same Supabase project as the web app
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY  anon key (safe to ship in client bundles)
 *
 * We throw at module-load time if either is missing so the login screen
 * doesn't render a broken form against an undefined client.
 */

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy apps/mobile/.env.example to apps/mobile/.env.local and fill in ' +
      'the values from the web app (Vercel env vars NEXT_PUBLIC_SUPABASE_URL / ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY).'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
