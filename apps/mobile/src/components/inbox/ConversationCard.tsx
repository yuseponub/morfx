/**
 * ConversationCard — one row in the mobile inbox list.
 *
 * Layout (matches 43-CONTEXT.md "Inbox list layout" + the web's
 * conversation-item.tsx):
 *
 *   +--------------------------------------------------------------+
 *   | [Avatar]  Name                             time  [NN unread] |
 *   |           last message preview ...                            |
 *   |           [SLA] [pipeline chip] [first tag chip]              |
 *   +--------------------------------------------------------------+
 *
 * Tapping the whole row pushes /chat/[id] (Plan 08 will build the real
 * chat screen; until then it may 404 — the checkpoint's Task 4.9 accepts
 * a stub).
 *
 * All colors via useTheme(), all strings via t(). No hardcoded colors.
 */

import { User } from 'lucide-react-native';
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

import type { CachedConversation } from '@/lib/db/conversations-cache';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

import { SlaTimer } from './SlaTimer';
import { UnreadBadge } from './UnreadBadge';

// Minimal tag shape — cached as JSON in sqlite (tagsJson).
interface TagRef {
  id: string;
  name: string;
  color: string;
}

interface ConversationCardProps {
  conversation: CachedConversation;
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();
}

function parseTags(tagsJson: string | null): TagRef[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is TagRef =>
        t != null &&
        typeof t === 'object' &&
        typeof t.id === 'string' &&
        typeof t.name === 'string' &&
        typeof t.color === 'string'
    );
  } catch {
    return [];
  }
}

export function ConversationCard({ conversation }: ConversationCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const displayName =
    conversation.contactName ||
    conversation.contactPhone ||
    t('inbox.noName');

  const preview = conversation.lastMessageBody || t('inbox.noPreview');

  // Prefer last_customer_message_at (matches web ConversationItem): the
  // "time since customer last wrote" is the operational signal. Falls back
  // to last_message_at if the customer never wrote (outbound-only thread).
  const timerMs =
    conversation.lastCustomerMessageAt ?? conversation.lastMessageAt;

  const timerLabel = useMemo(() => {
    if (!timerMs) return null;
    return formatDistanceToNow(new Date(timerMs), {
      locale: es,
      addSuffix: false,
    });
  }, [timerMs]);

  const tags = useMemo(
    () => parseTags(conversation.tagsJson),
    [conversation.tagsJson]
  );
  const firstTag = tags[0] ?? null;
  const extraTagCount = Math.max(0, tags.length - 1);

  const handlePress = () => {
    router.push(`/chat/${conversation.id}` as Href);
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
      accessibilityLabel={`${displayName}. ${preview}`}
    >
      {/* Avatar */}
      <View
        style={[
          styles.avatar,
          { backgroundColor: colors.surfaceAlt },
        ]}
      >
        <Text
          style={[styles.avatarText, { color: colors.text }]}
          numberOfLines={1}
        >
          {getInitials(displayName) || <User size={18} color={colors.textMuted} />}
        </Text>
      </View>

      {/* Middle: name + preview + SLA/chips */}
      <View style={styles.middle}>
        <View style={styles.topRow}>
          <Text
            style={[
              styles.name,
              {
                color: colors.text,
                fontWeight: conversation.unreadCount > 0 ? '700' : '600',
              },
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {displayName}
          </Text>
        </View>

        <Text
          style={[
            styles.preview,
            {
              color:
                conversation.unreadCount > 0
                  ? colors.text
                  : colors.textMuted,
            },
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {preview}
        </Text>

        <View style={styles.chipsRow}>
          <SlaTimer lastCustomerMessageAt={conversation.lastCustomerMessageAt} />
          {firstTag && (
            <View
              style={[
                styles.tagChip,
                {
                  backgroundColor: firstTag.color + '22', // 13% alpha tint
                  borderColor: firstTag.color,
                },
              ]}
            >
              <Text
                style={[styles.tagChipText, { color: firstTag.color }]}
                numberOfLines={1}
              >
                {firstTag.name}
              </Text>
            </View>
          )}
          {extraTagCount > 0 && (
            <Text
              style={[styles.tagOverflow, { color: colors.textMuted }]}
            >
              +{extraTagCount}
            </Text>
          )}
        </View>
      </View>

      {/* Right column: timestamp + unread badge */}
      <View style={styles.right}>
        {timerLabel && (
          <Text
            style={[styles.timestamp, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {timerLabel}
          </Text>
        )}
        <UnreadBadge count={conversation.unreadCount} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '600',
  },
  middle: {
    flex: 1,
    minWidth: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 15,
    flexShrink: 1,
  },
  preview: {
    fontSize: 13,
    marginTop: 2,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    flexWrap: 'nowrap',
  },
  tagChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 120,
  },
  tagChipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  tagOverflow: {
    fontSize: 11,
  },
  right: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  timestamp: {
    fontSize: 11,
  },
});
