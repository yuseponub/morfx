/**
 * Inbox screen (Phase 43 Plan 07).
 *
 * Renders a @shopify/flash-list of ConversationCard rows, fed by
 * useInboxList() and kept live by useRealtimeInbox(refresh).
 *
 * Pattern 1 (43-RESEARCH.md) — Realtime is best-effort; the AppState
 * foreground refetch inside useRealtimeInbox is the reliability mechanism.
 *
 * Header:
 *   [ WorkspaceSwitcher ]                             [ Cerrar sesión ]
 *   (Plan 06 switcher on the left; logout stays accessible on the right
 *    until the settings screen arrives in a later plan.)
 */

import { LogOut, MessageCircle } from 'lucide-react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ConversationCard } from '@/components/inbox/ConversationCard';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import type { CachedConversation } from '@/lib/db/conversations-cache';
import { useInboxList } from '@/hooks/useInboxList';
import { useRealtimeInbox } from '@/lib/realtime/use-realtime-inbox';
import { signOut } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function InboxScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const { conversations, loading, error, refresh, loadMore } = useInboxList();

  // Realtime + AppState foreground refetch. Both converge on the same
  // refresh() so there is no divergence between triggers.
  useRealtimeInbox(refresh);

  // Refresh whenever the inbox regains focus (e.g. user returns from a chat).
  // The chat screen's mark-read POST clears unread_count server-side AND
  // updates the local cached_conversations row synchronously, but a focus
  // refetch also catches any other server-side changes the user may have
  // made from the web while the chat was open.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  async function handleLogout() {
    await signOut();
    // onAuthStateChange in _layout.tsx redirects to /(auth)/login.
  }

  const renderItem = ({ item }: { item: CachedConversation }) => (
    <ConversationCard conversation={item} />
  );

  const keyExtractor = (item: CachedConversation) => item.id;

  // Empty state: only render after the first fetch settles so a fresh
  // install doesn't flash "No hay conversaciones" during cold start.
  const showEmptyState =
    !loading && conversations.length === 0 && error === null;

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
        <View style={styles.headerLeft}>
          <WorkspaceSwitcher />
        </View>
        <Pressable
          onPress={handleLogout}
          hitSlop={12}
          style={({ pressed }) => [
            styles.logoutIconButton,
            { opacity: pressed ? 0.5 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('common.logout')}
        >
          <LogOut size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Body */}
      {error && conversations.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.errorText, { color: colors.danger }]}>
            {error}
          </Text>
          <Pressable
            onPress={() => {
              void refresh();
            }}
            style={[
              styles.retryButton,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[styles.retryText, { color: colors.text }]}>
              {t('common.retry')}
            </Text>
          </Pressable>
        </View>
      ) : showEmptyState ? (
        <View style={styles.centered}>
          <MessageCircle size={56} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {t('inbox.empty')}
          </Text>
        </View>
      ) : (
        <FlashList
          data={conversations}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          onEndReached={() => {
            void loadMore();
          }}
          onEndReachedThreshold={0.5}
          refreshing={loading}
          onRefresh={() => {
            void refresh();
          }}
          ListFooterComponent={
            loading && conversations.length > 0 ? (
              <View style={styles.footer}>
                <ActivityIndicator color={colors.textMuted} />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  logoutIconButton: {
    padding: 4,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
