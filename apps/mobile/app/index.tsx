/**
 * Root index — redirects to auth or tabs based on session state.
 *
 * expo-router loads this as the initial route. The _layout.tsx has already
 * resolved isAuthed by the time this renders (splash is hidden only after
 * auth check completes), so we can safely redirect.
 */

import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { getCurrentSession } from '@/lib/session';

export default function Index() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    getCurrentSession().then((session) => setIsAuthed(!!session));
  }, []);

  if (isAuthed === null) return null; // still checking

  if (isAuthed) {
    return <Redirect href="/(tabs)/inbox" />;
  }
  return <Redirect href="/(auth)/login" />;
}
