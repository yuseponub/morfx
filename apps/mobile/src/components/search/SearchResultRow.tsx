/**
 * SearchResultRow — one result inside the expanded SearchBar overlay.
 *
 * Phase 43 Plan 12. Renders:
 *   - Contact name (bold) + phone (muted)
 *   - Highlighted snippet: `${before}<bold>${match}</bold>${after}`
 *     — built server-side by extractSnippet() in the search route.
 *     When `snippet_match` is empty (contact-only hit), the snippet area
 *     shows just the contact phone as a fallback.
 *   - Timestamp (Bogota timezone per Regla 2) — relative "hace 2h"
 *     formatting via date-fns/locale/es.
 *
 * Tap navigates to /chat/[conversation_id]. We do NOT currently attempt
 * to scroll the chat to the matched message — that is a nice-to-have
 * deferred to a later plan (the chat screen in Plan 08 does not accept
 * a scroll target yet).
 */

import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

import type { MobileSearchResult } from '@/lib/api-schemas/search';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

export interface SearchResultRowProps {
  result: MobileSearchResult;
  /** Called after navigation so the parent can clear the search bar
   *  (UX: tapping a result feels like "submit + go"). */
  onAfterNavigate?: () => void;
}

function formatRelative(iso: string): string {
  // `messages.created_at` is stored via `timezone('America/Bogota', NOW())`
  // in the DB schema (Regla 2) — so the ISO arriving on the wire is a
  // Bogota wall-clock moment. `formatDistanceToNow` computes the diff to
  // `new Date()` (device local), and distance is TZ-agnostic, so the
  // result ("hace 2h") is correct regardless of where the device is.
  // This mirrors how ConversationCard renders timestamps in Plan 07.
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return formatDistanceToNow(date, {
      locale: es,
      addSuffix: false,
    });
  } catch {
    return '';
  }
}

export function SearchResultRow({
  result,
  onAfterNavigate,
}: SearchResultRowProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const displayName =
    result.contact_name?.trim() ||
    result.contact_phone ||
    t('inbox.noName');

  const relative = formatRelative(result.created_at);

  const hasMatch = result.snippet_match.length > 0;

  const handlePress = () => {
    router.push(`/chat/${result.conversation_id}` as Href);
    onAfterNavigate?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.surfaceAlt : colors.bg,
          borderBottomColor: colors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}. ${
        hasMatch
          ? result.snippet_before + result.snippet_match + result.snippet_after
          : result.contact_phone
      }`}
    >
      <View style={styles.middle}>
        <View style={styles.topRow}>
          <Text
            style={[styles.name, { color: colors.text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {displayName}
          </Text>
          {result.contact_name && (
            <Text
              style={[styles.phone, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {result.contact_phone}
            </Text>
          )}
        </View>

        {hasMatch ? (
          <Text
            style={[styles.snippet, { color: colors.textMuted }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {result.snippet_before}
            <Text style={{ color: colors.text, fontWeight: '700' }}>
              {result.snippet_match}
            </Text>
            {result.snippet_after}
          </Text>
        ) : (
          <Text
            style={[styles.snippet, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {t('search.contactMatch')}
          </Text>
        )}
      </View>

      {relative ? (
        <Text
          style={[styles.timestamp, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {relative}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 10,
  },
  middle: {
    flex: 1,
    minWidth: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  phone: {
    fontSize: 12,
  },
  snippet: {
    fontSize: 13,
    marginTop: 2,
  },
  timestamp: {
    fontSize: 11,
    flexShrink: 0,
  },
});
