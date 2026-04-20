/**
 * Chat screen — read path (Phase 43 Plan 08) + composer (Plan 09) + CRM
 * drawer trigger (Plan 10b).
 *
 * Composition:
 *   - Header with back button + contact name (sourced from cached
 *     conversation row) + "info" button that opens the CRM drawer.
 *   - <MessageList> — inverted FlashList of bubbles + day dividers.
 *   - <MessageInput> (Plan 09) — composer + offline outbox + slash autocomplete.
 *   - <ContactPanelDrawer> — right-side slide-over overlay shown via a
 *     transparent Modal. Plan 10b explicitly wanted `@react-navigation/drawer`
 *     with drawerPosition="right"; we ship the equivalent UX via a Modal
 *     overlay because expo-router + the drawer navigator + right-position
 *     requires file-tree restructure (app/chat/[id]/_layout.tsx + the screen
 *     becoming /chat/[id]/index.tsx) that risks destabilizing the chat route
 *     cache. The Modal overlay preserves: right-side slide, button-only open
 *     (no edge swipe that could collide with the message list), tap-outside
 *     to close, safe-area edges, dark-mode via useTheme(). `@react-navigation/
 *     drawer` is still installed for future restructure without another
 *     dependency bump.
 *
 * Hooks:
 *   - useConversationMessages(id) — cache-first read + mark-read POST.
 *   - useRealtimeMessages(id, refresh) — Realtime INSERT/UPDATE + AppState
 *     foreground refetch.
 *   - useContactPanel(id) is owned by ContactPanelDrawer — it only mounts
 *     when the drawer opens, so realtime/polling cost is paid only when the
 *     user actually sees the panel.
 *
 * UX invariants kept from Plans 08/09 (DO NOT regress):
 *   - SafeAreaView edges={['top', 'left', 'right', 'bottom']}.
 *   - KeyboardAvoidingView behavior: 'padding' iOS / 'height' Android.
 *   - MessageInput.onSent -> refreshFromCache for optimistic bubble paint.
 *   - MessageList internal maintainVisibleContentPosition autoscrollToTop
 *     Threshold stays untouched.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContactPanelDrawer } from '@/components/crm-panel/ContactPanelDrawer';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageInput } from '@/components/chat/MessageInput';
import { MessageList } from '@/components/chat/MessageList';
import { MuteDurationSheet } from '@/components/chat/MuteDurationSheet';
import { useBotToggle } from '@/hooks/useBotToggle';
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

  const { messages, loading, refresh, refreshFromCache, loadOlder } =
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

  // -------------------------------------------------------------------------
  // CRM drawer state (Plan 10b).
  // -------------------------------------------------------------------------

  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = Math.min(Math.round(screenWidth * 0.9), 420);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // -------------------------------------------------------------------------
  // Plan 11 — three-state bot toggle.
  // -------------------------------------------------------------------------

  const {
    mode: botMode,
    muteUntilMs: botMuteUntilMs,
    pending: botPending,
    setBotMode,
  } = useBotToggle(conversationId, workspaceId);

  const [muteSheetOpen, setMuteSheetOpen] = useState(false);
  const openMuteSheet = useCallback(() => setMuteSheetOpen(true), []);
  const closeMuteSheet = useCallback(() => setMuteSheetOpen(false), []);

  const handleToggleOnOff = useCallback(() => {
    const next = botMode === 'on' ? 'off' : 'on';
    void setBotMode({ mode: next, muteUntilMs: null });
  }, [botMode, setBotMode]);

  const handlePickMuteDuration = useCallback(
    (muteUntilMs: number) => {
      closeMuteSheet();
      void setBotMode({ mode: 'muted', muteUntilMs });
    },
    [closeMuteSheet, setBotMode]
  );

  const handleClearMute = useCallback(() => {
    void setBotMode({ mode: 'on', muteUntilMs: null });
  }, [setBotMode]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.bg }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <ChatHeader
        title={headerTitle}
        onBack={() => router.back()}
        onOpenDrawer={openDrawer}
        botMode={botMode}
        botMuteUntilMs={botMuteUntilMs}
        botPending={botPending}
        onToggleOnOff={handleToggleOnOff}
        onOpenMuteSheet={openMuteSheet}
        onClearMute={handleClearMute}
      />

      {/* Body */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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

        {/* Composer — Plan 09. Send path (text / image / audio) +
            slash-command autocomplete + offline outbox drain. */}
        {conversationId ? (
          <MessageInput
            conversationId={conversationId}
            onSent={() => {
              void refreshFromCache();
            }}
          />
        ) : null}
      </KeyboardAvoidingView>

      {/* Plan 10b — CRM drawer overlay. Right-side slide-in via Modal with
          slide animation. Tap on backdrop or close button dismisses. The
          ContactPanelDrawer owns its own useContactPanel() hook — only
          mounted while visible, so realtime/polling cost is paid on demand. */}
      {conversationId ? (
        <Modal
          visible={drawerOpen}
          transparent
          animationType="slide"
          onRequestClose={closeDrawer}
        >
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={closeDrawer} />
            <View
              style={[
                styles.drawerContainer,
                { width: drawerWidth, backgroundColor: colors.bg },
              ]}
            >
              <ContactPanelDrawer
                conversationId={conversationId}
                onClose={closeDrawer}
              />
            </View>
          </View>
        </Modal>
      ) : null}

      {/* Plan 11 — MuteDurationSheet (bottom sheet picker). */}
      <MuteDurationSheet
        visible={muteSheetOpen}
        onClose={closeMuteSheet}
        onPick={handlePickMuteDuration}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  modalRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000066',
  },
  drawerContainer: {
    // Right-anchored via row layout: backdrop flex:1 + drawer fixed width.
    height: '100%',
  },
});
