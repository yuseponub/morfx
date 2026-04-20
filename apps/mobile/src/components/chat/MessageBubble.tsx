/**
 * MessageBubble — single message bubble in the chat screen.
 *
 * Phase 43 Plan 08 (initial) + Plan 14 (image + audio real renderers).
 *
 * Direction
 *   - 'in'  -> left aligned, neutral surface bg, contact/sender text above
 *              the body.
 *   - 'out' -> right aligned, primary bg, delivery status icon in the
 *              bottom-right corner.
 *
 * Media types
 *   - image    -> ImageRenderer (expo-image) with tap-to-fullscreen.
 *   - audio    -> AudioPlayer (expo-audio) with play/pause + progress bar.
 *   - video    -> video placeholder stub (Plan 09 did not ship a video renderer;
 *                 keep a static placeholder for now — future plan wires
 *                 expo-video / Video.getPlayableAsset).
 *   - document -> document icon + filename stub.
 *   - null     -> text only (body string rendered).
 *
 * For image and audio we render the media AND the caption body (if any)
 * underneath — same layout as WhatsApp bubbles.
 *
 * Timestamps always render in America/Bogota (Regla 2) as HH:mm.
 *
 * All colors come from useTheme() so dark mode is honored without any
 * hardcoded hex values.
 */

import {
  AlertCircle,
  Check,
  Clock,
  FileText,
  Loader2,
  Play,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AudioPlayer } from '@/components/media/AudioPlayer';
import { ImageRenderer } from '@/components/media/ImageRenderer';
import type { CachedMessage } from '@/lib/db/messages-cache';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

interface MessageBubbleProps {
  message: CachedMessage;
  /** When true, hides the sender name above the body (inbound only). Used
   *  by MessageList to collapse consecutive inbound messages from the same
   *  sender into a visual group. */
  hideSenderName?: boolean;
  /** Optional override for the inbound sender label (the cache does not
   *  currently store sender_name per-message; MessageList passes the
   *  conversation-level contact name down). */
  senderName?: string | null;
}

// Format ms-epoch as HH:mm in Bogota time. Colombia does not observe DST
// so this is stable year-round — still go through toLocaleString so any
// future policy change (unlikely) updates automatically.
function formatBogotaTime(ms: number): string {
  return new Date(ms).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function StatusIcon({
  status,
  color,
}: {
  status: CachedMessage['status'];
  color: string;
}) {
  // CachedMessage status = 'sent' | 'queued' | 'sending' | 'failed'
  // (see src/lib/db/messages-cache.ts). We map each to a visual icon that
  // mirrors WhatsApp's own conventions so the UI feels familiar.
  switch (status) {
    case 'queued':
      return <Clock size={12} color={color} />;
    case 'sending':
      return <Loader2 size={12} color={color} />;
    case 'sent':
      return <Check size={12} color={color} />;
    case 'failed':
      return <AlertCircle size={12} color={color} />;
    default:
      return null;
  }
}

function MediaPlaceholder({
  message,
  direction,
}: {
  message: CachedMessage;
  direction: 'in' | 'out';
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  switch (message.mediaType) {
    case 'image': {
      // Plan 14: render the real remote image with tap-to-fullscreen. If the
      // URL is missing (should not happen for inbound — the server always
      // surfaces media_url — but defensive for outbound staged-only bubbles),
      // fall back to the placeholder so the bubble doesn't break.
      if (!message.mediaUri) {
        return (
          <View
            style={[
              styles.mediaBox,
              {
                backgroundColor: colors.surfaceAlt,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.mediaLabel, { color: colors.textMuted }]}>
              {t('chat.media.image')}
            </Text>
          </View>
        );
      }
      return (
        <ImageRenderer
          uri={message.mediaUri}
          accessibilityLabel={message.body ?? t('chat.media.image')}
        />
      );
    }
    case 'audio': {
      if (!message.mediaUri) {
        return (
          <View
            style={[
              styles.mediaBox,
              styles.audioBox,
              {
                backgroundColor: colors.surfaceAlt,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.mediaLabel, { color: colors.textMuted }]}>
              {t('chat.media.audio')}
            </Text>
          </View>
        );
      }
      return (
        <AudioPlayer
          uri={message.mediaUri}
          direction={direction}
          accessibilityLabel={t('chat.media.audio')}
        />
      );
    }
    case 'video':
      return (
        <View
          style={[
            styles.mediaBox,
            { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
          ]}
        >
          <Play size={32} color={colors.textMuted} />
          <Text style={[styles.mediaLabel, { color: colors.textMuted }]}>
            {t('chat.media.video')}
          </Text>
        </View>
      );
    case 'document':
      return (
        <View
          style={[
            styles.mediaBox,
            styles.audioBox,
            { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
          ]}
        >
          <FileText size={18} color={colors.textMuted} />
          <Text style={[styles.mediaLabel, { color: colors.textMuted }]}>
            {t('chat.media.document')}
          </Text>
        </View>
      );
    default:
      return null;
  }
}

export function MessageBubble({
  message,
  hideSenderName,
  senderName,
}: MessageBubbleProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const isOut = message.direction === 'out';

  // Bubble colors — keep outbound readable in BOTH themes. In light mode
  // primary is near-black so primaryText (white) gives contrast. In dark
  // mode primary is near-white so primaryText (near-black) still reads.
  const bubbleBg = isOut ? colors.primary : colors.surfaceAlt;
  const bubbleTextColor = isOut ? colors.primaryText : colors.text;
  const metaColor = isOut
    ? colors.primaryText
    : colors.textMuted;

  const timeLabel = useMemo(
    () => formatBogotaTime(message.createdAt),
    [message.createdAt]
  );

  // Accessibility hint: screen readers should get the full narrative
  // ("Juan, 14:32: Hola como estas") rather than just the body.
  const accessibilityLabel = useMemo(() => {
    const parts: string[] = [];
    if (!isOut && senderName) parts.push(senderName);
    parts.push(timeLabel);
    if (message.body) parts.push(message.body);
    else if (message.mediaType) parts.push(t(`chat.media.${message.mediaType}`));
    return parts.join(', ');
  }, [isOut, senderName, timeLabel, message.body, message.mediaType, t]);

  return (
    <View
      style={[
        styles.row,
        { justifyContent: isOut ? 'flex-end' : 'flex-start' },
      ]}
    >
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.bubble,
          { backgroundColor: bubbleBg },
          isOut ? styles.bubbleOut : styles.bubbleIn,
        ]}
      >
        {/* Inbound: sender name (optional) */}
        {!isOut && !hideSenderName && senderName ? (
          <Text
            style={[styles.senderName, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {senderName}
          </Text>
        ) : null}

        {/* Template name label for outbound template messages */}
        {message.mediaType === null &&
        message.body === null &&
        isOut ? null : null}

        {/* Media renderer (image/audio real players; video/document still
            placeholders). Image + audio live renderers land in Plan 14. */}
        {message.mediaType ? (
          <MediaPlaceholder
            message={message}
            direction={isOut ? 'out' : 'in'}
          />
        ) : null}

        {/* Body text (supports multi-line — RN Text honors \n natively) */}
        {message.body ? (
          <Text style={[styles.body, { color: bubbleTextColor }]}>
            {message.body}
          </Text>
        ) : null}

        {/* Meta row: timestamp + (outbound) status icon */}
        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: metaColor }]}>{timeLabel}</Text>
          {isOut ? (
            <View style={styles.statusIconWrap}>
              <StatusIcon status={message.status} color={metaColor} />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    gap: 2,
  },
  bubbleIn: {
    borderTopLeftRadius: 4,
  },
  bubbleOut: {
    borderTopRightRadius: 4,
  },
  senderName: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  body: {
    fontSize: 15,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  meta: {
    fontSize: 10,
  },
  statusIconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mediaBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 160,
  },
  audioBox: {
    flexDirection: 'row',
    paddingVertical: 10,
    minWidth: 200,
  },
  mediaLabel: {
    fontSize: 12,
  },
});
