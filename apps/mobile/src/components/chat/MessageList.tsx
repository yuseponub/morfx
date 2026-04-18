/**
 * MessageList — inverted FlashList of message bubbles with day dividers.
 *
 * Phase 43 Plan 08.
 *
 * Why "inverted" via transform:
 *   The most recent message should sit at the bottom of the screen (chat
 *   app convention). FlashList v2 (v2.0.2 ships with this project) dropped
 *   the `inverted` prop that FlatList/FlashList v1 had. The established
 *   RN workaround is `transform: [{ scaleY: -1 }]` on the list plus the
 *   same transform on each rendered row (to un-flip the text). That gives
 *   the same visual effect and touch events still route correctly.
 *
 * Day dividers:
 *   Inserted AFTER a message when the message's calendar day is different
 *   from the next (older) message's calendar day. Because the list is
 *   visually flipped, "after" in data terms = "above" in visual terms —
 *   so users see "Hoy" above today's messages, "Ayer" above yesterday's
 *   messages, etc. Matches WhatsApp's behavior.
 *
 * Sender name collapsing:
 *   Consecutive inbound messages from the same sender hide the sender
 *   name after the first one, matching WhatsApp. Because the list is
 *   inverted the "first" bubble in a run is the OLDEST one visually at
 *   the top of the run — we compute this by looking at the next item in
 *   the DESC list (which represents an OLDER message).
 */

import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import type { CachedMessage } from '@/lib/db/messages-cache';
import { useTheme } from '@/lib/theme';

import { DayDivider } from './DayDivider';
import { MessageBubble } from './MessageBubble';

// ---------------------------------------------------------------------------
// Row types for the list.
// ---------------------------------------------------------------------------

type ListRow =
  | {
      kind: 'message';
      key: string;
      message: CachedMessage;
      /** Skip sender label (consecutive messages from same inbound sender). */
      hideSenderName: boolean;
    }
  | {
      kind: 'divider';
      key: string;
      dayMs: number;
    };

function toBogotaDateKey(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', {
    timeZone: 'America/Bogota',
  });
}

/**
 * Build the inverted render list from DESC-sorted messages.
 *
 * Input: messages sorted newest-first (DESC by createdAt). Output: rows for
 * FlashList, inverted. A divider row is emitted AFTER (in data order =
 * above in visual order when inverted=true) a message if the NEXT message
 * in the DESC list (i.e. the OLDER one) has a different calendar day.
 */
function buildRows(messages: CachedMessage[]): ListRow[] {
  if (messages.length === 0) return [];
  const rows: ListRow[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    const next = messages[i + 1]; // older message (DESC)

    // hideSenderName: for inbound bubbles, check whether the OLDER
    // neighbor in the DESC list is also inbound. Because the list is
    // inverted, that older neighbor is VISUALLY ABOVE this bubble. So we
    // hide the sender label when "the message just above me in the view
    // is from the same sender" — matches WhatsApp grouping.
    const hideSenderName =
      msg.direction === 'in' && next?.direction === 'in';

    rows.push({
      kind: 'message',
      key: msg.id,
      message: msg,
      hideSenderName,
    });

    // Divider: emit when the calendar day of `msg` differs from the day of
    // the next (older) message. If `next` is undefined (end of list) we
    // also emit one — that's the oldest day in the history.
    const thisDay = toBogotaDateKey(msg.createdAt);
    const nextDay = next ? toBogotaDateKey(next.createdAt) : null;
    if (thisDay !== nextDay) {
      rows.push({
        kind: 'divider',
        key: `divider-${thisDay}-${msg.id}`,
        dayMs: msg.createdAt,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Component.
// ---------------------------------------------------------------------------

interface MessageListProps {
  messages: CachedMessage[];
  senderName: string | null;
  loading: boolean;
  onEndReached?: () => void;
  onRefresh?: () => void;
}

export function MessageList({
  messages,
  senderName,
  loading,
  onEndReached,
  onRefresh,
}: MessageListProps) {
  const { colors } = useTheme();

  const rows = useMemo(() => buildRows(messages), [messages]);

  const renderItem = useCallback(
    ({ item }: { item: ListRow }) => {
      // Un-flip each row so the bubble renders upright even though the
      // parent list is flipped vertically.
      if (item.kind === 'divider') {
        return (
          <View style={styles.unflip}>
            <DayDivider dayMs={item.dayMs} />
          </View>
        );
      }
      return (
        <View style={styles.unflip}>
          <MessageBubble
            message={item.message}
            hideSenderName={item.hideSenderName}
            senderName={senderName}
          />
        </View>
      );
    },
    [senderName]
  );

  const keyExtractor = useCallback((item: ListRow) => item.key, []);

  // With the scaleY=-1 flip, pulling DOWN (in the flipped view) is actually
  // pulling UP in the original coordinate space, and `onEndReached` fires
  // when the user scrolls to the end of `data` — visually the top — which
  // is exactly where we want to paginate in older messages.
  return (
    <View style={[styles.container, styles.flip]}>
      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        // Auto-scroll to newest on new message. With scaleY=-1 flip, the
        // FlashList internal "top" (offset 0) == visual BOTTOM. So the
        // `autoscrollToTopThreshold` we want here is actually the visual
        // "stick to bottom of the chat" behavior. 200px threshold: if the
        // user is within ~2 bubble-heights of the newest message when a new
        // one arrives, snap to it. Scrolled further up reading history?
        // Don't yank them away.
        maintainVisibleContentPosition={{
          autoscrollToTopThreshold: 200,
        }}
        refreshControl={
          onRefresh ? (
            // The RefreshControl needs its own un-flip so the spinner
            // appears at the visually correct edge (bottom of the chat,
            // i.e. newest messages, when the user pulls down).
            <RefreshControl
              refreshing={loading && messages.length > 0}
              onRefresh={onRefresh}
              tintColor={colors.textMuted}
              style={styles.unflip}
            />
          ) : undefined
        }
        ListFooterComponent={
          loading && messages.length > 0 ? (
            <View style={[styles.footer, styles.unflip]}>
              <ActivityIndicator color={colors.textMuted} />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  /** Flip the outer list vertically so newest items render at the bottom. */
  flip: { transform: [{ scaleY: -1 }] },
  /** Un-flip individual rows so text reads the right way up. */
  unflip: { transform: [{ scaleY: -1 }] },
  footer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
});
