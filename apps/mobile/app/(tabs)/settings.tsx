/**
 * Settings tab — hosts the Settings screen (Plan 43-14).
 *
 * The heavy lifting lives in src/components/settings/SettingsScreen so the
 * (tabs) route file is just a thin export. Matches the inbox.tsx <->
 * InboxScreen separation pattern.
 */

import { SettingsScreen } from '@/components/settings/SettingsScreen';

export default function SettingsTab() {
  return <SettingsScreen />;
}
