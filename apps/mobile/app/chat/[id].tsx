/**
 * Chat screen — read path (Phase 43 Plan 08).
 *
 * Composition:
 *   - Header with back button + contact name (sourced from cached
 *     conversation row; falls back to the id while the cache warms up).
 *   - <MessageList> — inverted FlashList of bubbles + day dividers.
 *   - Placeholder row at the bottom. Plan 09 replaces this with the real
 *     composer (text input + media attach + slash-command quick replies).
 *     We keep a KeyboardAvoidingView around the composer slot so Plan 09
 *     does not need to restructure the layout.
 *
 * Hooks:
 *   - useConversationMessages(id) — cache-first read + mark-read POST
 *     fire-and-forget on mount.
 *   - useRealtimeMessages(id, refresh) — Realtime INSERT/UPDATE + AppState
 *     foreground refetch fallback.
 *
 * Offline / Realtime behavior:
 *   - First paint: cached rows render before the network returns.
 *   - No connectivity: errors are swallowed (user sees the cached list).
 *   - Live message: Realtime INSERT -> refresh() -> sqlite upsert -> re-read
 *     -> FlashList updates. AppState 'active' transitions are the backup
 *     path if the WebSocket missed the event.
 */

import { ChevronLeft } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MessageList } from '@/components/chat/MessageList';
import { useConversationMessages } from '@/hooks/useConversationMessages';
import { getCachedConversation } from '@/lib/db/conversations-cache';
import { useRealtimeMessages } from '@/lib/realtime/use-realtime-messages';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';
import { useWorkspace } from '@/lib/workspace/use-workspace';

export default function ChatScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = typeof id === 'string' ? id : null;

  const workspace = useWorkspace();
  const workspaceId = workspace?.workspaceId ?? null;

  const { messages, loading, refresh, loadOlder } =
    useConversationMessages(conversationId);

  useRealtimeMessages(conversationId, refresh);

  // -------------------------------------------------------------------------
  // Header title: read the cached conversation for the contact name. If the
  // user taps a card, the conversation is already in cache from Plan 07's
  // inbox bootstrap. If they deep-link directly to /chat/:id without the
  // inbox having loaded, we fall back to a generic label.
  // -------------------------------------------------------------------------

  const [contactName, setContactName] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!conversationId || !workspaceId) return;
    (async () => {
      const convo = await getCachedConversation(conversationId, workspaceId);
      if (!mounted) return;
      setContactName(convo?.contactName ?? convo?.contactPhone ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, [conversationId, workspaceId]);

  const headerTitle = contactName ?? t('chat.header.fallback');

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.bg }]}
      edges={['top', 'left', 'right']}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border, backgroundColor: colors.bg },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.5 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('chat.header.back')}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text
          style={[styles.title, { color: colors.text }]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {headerTitle}
        </Text>
        <View style={styles.spacer} />
      </View>

      {/* Body */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        <View style={styles.flex}>
          <MessageList
            messages={messages}
            senderName={contactName}
            loading={loading}
            onEndReached={loadOlder}
            onRefresh={refresh}
          />
        </View>

        {/* Composer placeholder — Plan 09 replaces this with the real
            composer. Leaving a bordered bar so the layout is stable and
            users see the footer affordance exists. */}
        <View
          style={[
            styles.composerPlaceholder,
            { borderTopColor: colors.border, backgroundColor: colors.bg },
          ]}
        >
          <Text
            style={[styles.composerLabel, { color: colors.textMuted }]}
            accessibilityLabel={t('chat.composer.placeholder')}
          >
            {t('chat.composer.placeholder')}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backButton: {
    padding: 4,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  spacer: {
    width: 32,
  },
  composerPlaceholder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  composerLabel: {
    fontSize: 13,
    fontStyle: 'italic',
  },
});
