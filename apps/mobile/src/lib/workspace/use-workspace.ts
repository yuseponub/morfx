/**
 * Convenience hook for consuming WorkspaceContext.
 *
 * Throws if called outside WorkspaceProvider — this is intentional so we
 * get an immediate dev-time error rather than a mysterious `undefined`.
 */

import { useContext } from 'react';

import { WorkspaceContext, type WorkspaceContextValue } from './context';

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error(
      'useWorkspace must be used within <WorkspaceProvider>. ' +
        'Make sure the provider is mounted in app/_layout.tsx.'
    );
  }
  return ctx;
}
