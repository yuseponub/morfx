/**
 * MessageInput — bottom composer for the chat screen.
 *
 * Phase 43 Plan 09.
 *
 * Composition:
 *   - Attach button: opens an ActionSheet-style popover with
 *     camera / gallery / audio options.
 *   - TextInput: multi-line, auto-grows up to 5 lines. Detects the
 *     trailing `/trigger` token and renders QuickReplyAutocomplete above.
 *   - Send button: enabled when text is non-empty or a staged media item
 *     is ready.
 *
 * Scope boundaries explicitly called out in the plan:
 *   - TemplatePicker UI is NOT wired here (Plan 14). The server-side
 *     templateName/templateVariables fields exist from Task 1 but the
 *     composer does not expose them yet.
 *   - Emoji picker is NOT wired here — the Plan 09 scope is text + image
 *     + audio + quick replies. A future plan adds emojis.
 *
 * Optimistic UX:
 *   - `sendText` returns immediately after enqueue (Plan 05 ACID contract
 *     guarantees the cached_messages row is visible on next re-render).
 *   - `sendMedia` same shape — the drain loop owns the upload + POST.
 *   - The composer clears text on successful enqueue; the staged media
 *     preview clears on successful enqueue.
 *   - Error path: if enqueue throws (workspace not set, empty text), the
 *     composer surfaces an inline error banner that auto-clears on next
 *     keystroke.
 */

import * as ImagePicker from 'expo-image-picker';
import {
  ImageIcon,
  Mic,
  Paperclip,
  Send,
  X as XIcon,
} from 'lucide-react-native';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  ActionSheetIOS,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';

import { useQuickReplies } from '@/hooks/useQuickReplies';
import { useSendMessage } from '@/hooks/useSendMessage';
import type { MobileQuickReply } from '@/lib/api-schemas/quick-replies';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

import {
  AudioRecorder,
  type AudioRecorderHandle,
  type AudioSendHandler,
} from './AudioRecorder';
import { QuickReplyAutocomplete } from './QuickReplyAutocomplete';

interface StagedImage {
  uri: string;
  mimeType: string;
}

interface MessageInputProps {
  conversationId: string;
  /**
   * Called right after a successful enqueue (text or media). The chat screen
   * wires this to `useConversationMessages.refreshFromCache` so the optimistic
   * bubble paints synchronously, without waiting for the drain round-trip
   * or the Realtime echo. Without this hook the bubble only appears when the
   * user leaves and re-enters the chat.
   */
  onSent?: () => void;
}

/**
 * Extract the active slash-token from the composer text, if any.
 *
 * Matches WhatsApp-web's autocomplete behavior: trigger fires when the
 * caret is at the end of the text AND the last whitespace-delimited word
 * starts with `/`. We lowercase the query for case-insensitive filtering.
 *
 * Returns `null` when no active token. Returns `{ query, start }` where
 * `start` is the index of the `/` char (so the composer can splice the
 * selected reply back in its place).
 */
function extractSlashQuery(
  text: string,
  selectionEnd: number
): { query: string; start: number } | null {
  if (selectionEnd < 1) return null;
  // Walk backwards from the cursor looking for the last `/` at a word boundary.
  let i = selectionEnd - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === ' ' || ch === '\n' || ch === '\t') return null;
    if (ch === '/') {
      // Must be at start-of-string OR preceded by whitespace.
      if (i === 0 || /\s/.test(text[i - 1] ?? '')) {
        const query = text.slice(i + 1, selectionEnd).toLowerCase();
        return { query, start: i };
      }
      return null;
    }
    i -= 1;
  }
  return null;
}

export function MessageInput({ conversationId, onSent }: MessageInputProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { sendText, sendMedia } = useSendMessage();
  const { quickReplies } = useQuickReplies();

  const [text, setText] = useState<string>('');
  const [selection, setSelection] = useState<{ start: number; end: number }>(
    { start: 0, end: 0 }
  );
  const [stagedImage, setStagedImage] = useState<StagedImage | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<TextInput>(null) as RefObject<TextInput>;
  const audioSheetRef = useRef<AudioRecorderHandle>(null);

  // -------------------------------------------------------------------------
  // Quick reply autocomplete filtering.
  // -------------------------------------------------------------------------

  const slash = useMemo(
    () => extractSlashQuery(text, selection.end),
    [text, selection.end]
  );

  const filteredReplies = useMemo<MobileQuickReply[]>(() => {
    if (!slash) return [];
    const q = slash.query;
    if (q.length === 0) return quickReplies.slice(0, 10);
    return quickReplies
      .filter((r) => r.trigger.toLowerCase().includes(q))
      .slice(0, 10);
  }, [slash, quickReplies]);

  const handleQuickReplySelect = useCallback(
    (reply: MobileQuickReply) => {
      if (!slash) return;
      // Splice: replace [slash.start .. selection.end] with the reply body.
      const before = text.slice(0, slash.start);
      const after = text.slice(selection.end);
      const merged = `${before}${reply.body}${after}`;
      setText(merged);
      // Place cursor after the inserted body.
      const newCursor = before.length + reply.body.length;
      setSelection({ start: newCursor, end: newCursor });
      // If the quick reply has media, stage it as the image to send. The
      // body text acts as caption.
      if (reply.mediaUrl && reply.mediaType === 'image') {
        setStagedImage({ uri: reply.mediaUrl, mimeType: 'image/jpeg' });
      }
    },
    [slash, text, selection.end]
  );

  // -------------------------------------------------------------------------
  // Attach button actions.
  // -------------------------------------------------------------------------

  const openCamera = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError(t('chat.attach.permissionDenied'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setStagedImage({
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  }, [t]);

  const openGallery = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t('chat.attach.permissionDenied'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setStagedImage({
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  }, [t]);

  const openAudio = useCallback(() => {
    audioSheetRef.current?.open();
  }, []);

  const handleAttachPress = useCallback(() => {
    setError(null);
    const options = [
      t('chat.attach.camera'),
      t('chat.attach.gallery'),
      t('chat.attach.audio'),
      t('common.cancel'),
    ];
    const cancelButtonIndex = 3;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex },
        (idx) => {
          if (idx === 0) void openCamera();
          else if (idx === 1) void openGallery();
          else if (idx === 2) openAudio();
        }
      );
    } else {
      // Android — simple Alert. Plan 09 scope: no third-party sheet. The
      // audio + image gallery + camera flows work identically.
      Alert.alert(t('chat.attach.title'), undefined, [
        { text: options[0], onPress: () => void openCamera() },
        { text: options[1], onPress: () => void openGallery() },
        { text: options[2], onPress: openAudio },
        { text: options[3], style: 'cancel' },
      ]);
    }
  }, [t, openCamera, openGallery, openAudio]);

  // -------------------------------------------------------------------------
  // Send handlers.
  // -------------------------------------------------------------------------

  const handleSend = useCallback(async () => {
    if (isSending) return;
    setError(null);
    try {
      if (stagedImage) {
        setIsSending(true);
        await sendMedia(conversationId, stagedImage.uri, 'image', {
          mimeType: stagedImage.mimeType,
          caption: text.trim() || null,
        });
        setStagedImage(null);
        setText('');
        setSelection({ start: 0, end: 0 });
        onSent?.();
      } else {
        const body = text.trim();
        if (body.length === 0) return;
        setIsSending(true);
        await sendText(conversationId, body);
        setText('');
        setSelection({ start: 0, end: 0 });
        onSent?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar');
    } finally {
      setIsSending(false);
    }
  }, [
    isSending,
    stagedImage,
    text,
    conversationId,
    sendText,
    sendMedia,
    onSent,
  ]);

  const handleAudioSend = useCallback<AudioSendHandler>(
    async ({ uri, mimeType }) => {
      setError(null);
      try {
        setIsSending(true);
        await sendMedia(conversationId, uri, 'audio', {
          mimeType,
          caption: null,
        });
        onSent?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al enviar');
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, sendMedia, onSent]
  );

  const removeStaged = useCallback(() => {
    setStagedImage(null);
  }, []);

  const canSend =
    !isSending && (text.trim().length > 0 || stagedImage !== null);

  return (
    <>
      <QuickReplyAutocomplete
        visible={Boolean(slash) && filteredReplies.length > 0}
        items={filteredReplies}
        onSelect={handleQuickReplySelect}
      />

      <View
        style={[
          styles.container,
          { borderTopColor: colors.border, backgroundColor: colors.bg },
        ]}
      >
        {stagedImage ? (
          <View
            style={[
              styles.stagedRow,
              { backgroundColor: colors.surfaceAlt },
            ]}
          >
            <Image
              source={{ uri: stagedImage.uri }}
              style={styles.stagedImage}
            />
            <Text
              style={[styles.stagedLabel, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {t('chat.attach.imageStaged')}
            </Text>
            <Pressable
              onPress={removeStaged}
              hitSlop={8}
              accessibilityLabel={t('common.cancel')}
              style={({ pressed }) => [
                styles.stagedRemove,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <XIcon size={16} color={colors.text} />
            </Pressable>
          </View>
        ) : null}

        {error ? (
          <Text
            style={[styles.errorLine, { color: colors.danger }]}
            numberOfLines={2}
          >
            {error}
          </Text>
        ) : null}

        <View style={styles.row}>
          <Pressable
            onPress={handleAttachPress}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconBtn,
              { opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('chat.attach.title')}
          >
            <Paperclip size={22} color={colors.textMuted} />
          </Pressable>

          <TextInput
            ref={inputRef}
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.surfaceAlt,
              },
            ]}
            value={text}
            onChangeText={(next) => {
              setText(next);
              if (error) setError(null);
            }}
            onSelectionChange={(e) => {
              setSelection(e.nativeEvent.selection);
            }}
            placeholder={t('chat.composer.placeholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={1}
            maxLength={4096}
            accessibilityLabel={t('chat.composer.placeholder')}
          />

          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            hitSlop={8}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor: canSend ? colors.primary : colors.border,
                opacity: pressed && canSend ? 0.8 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('chat.send')}
          >
            {canSend ? (
              <Send size={18} color={colors.primaryText} />
            ) : stagedImage ? (
              <ImageIcon size={18} color={colors.textMuted} />
            ) : (
              <Mic size={18} color={colors.textMuted} />
            )}
          </Pressable>
        </View>

      </View>

      <AudioRecorder ref={audioSheetRef} onSend={handleAudioSend} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  iconBtn: {
    padding: 8,
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    fontSize: 15,
    lineHeight: 20,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stagedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  stagedImage: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  stagedLabel: {
    flex: 1,
    fontSize: 12,
  },
  stagedRemove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorLine: {
    fontSize: 12,
    paddingHorizontal: 10,
  },
});
