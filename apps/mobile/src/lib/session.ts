/**
 * Thin wrappers around supabase.auth so the rest of the app doesn't import
 * the supabase client directly for simple auth operations.
 */

import type { Session, Subscription } from '@supabase/supabase-js';
import { supabase } from './supabase';

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    // Do not throw — a missing/expired session is not an exceptional case.
    return null;
  }
  return data.session ?? null;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Subscribe to auth state changes. Returns the unsubscribe function directly
 * (not the nested `{ data: { subscription } }` that supabase-js exposes) so
 * callers can wire it straight into useEffect cleanup.
 */
export function onAuthStateChange(
  callback: (session: Session | null) => void
): () => void {
  const {
    data: { subscription },
  }: { data: { subscription: Subscription } } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      callback(session);
    }
  );
  return () => subscription.unsubscribe();
}
