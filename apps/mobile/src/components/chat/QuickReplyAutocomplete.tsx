/**
 * QuickReplyAutocomplete — absolute-positioned suggestion list rendered
 * above the composer TextInput when the user is typing a / slash command.
 *
 * Phase 43 Plan 09.
 *
 * Parent responsibilities:
 *   - Detect the `/` prefix in the composer text and compute the trailing
 *     `query` token (e.g. "/hi" => query="hi").
 *   - Pass `visible` = true when a slash token is active AND there are
 *     items after filtering.
 *   - On `onSelect`, splice the chosen quick reply `body` into the
 *     composer text (replacing the slash token).
 *
 * Web parity: matches the logic in
 * src/app/(dashboard)/whatsapp/components/quick-reply-autocomplete.tsx
 * (Slack-style inline autocomplete) but rendered with RN primitives.
 */

import { MessageSquare } from 'lucide-react-native';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { MobileQuickReply } from '@/lib/api-schemas/quick-replies';
import { useTheme } from '@/lib/theme';

interface QuickReplyAutocompleteProps {
  visible: boolean;
  items: MobileQuickReply[];
  onSelect: (reply: MobileQuickReply) => void;
}

const MAX_VISIBLE_ITEMS = 5;

export function QuickReplyAutocomplete({
  visible,
  items,
  onSelect,
}: QuickReplyAutocompleteProps) {
  const { colors } = useTheme();

  if (!visible || items.length === 0) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          shadowColor: colors.text,
        },
      ]}
      accessibilityLabel="Respuestas rapidas"
    >
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {items.slice(0, MAX_VISIBLE_ITEMS).map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onSelect(item)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: pressed ? colors.border : 'transparent',
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Insertar respuesta ${item.trigger}`}
          >
            <MessageSquare
              size={16}
              color={colors.textMuted}
              style={styles.icon}
            />
            <View style={styles.textGroup}>
              <Text
                style={[styles.trigger, { color: colors.text }]}
                numberOfLines={1}
              >
                /{item.trigger}
              </Text>
              <Text
                style={[styles.body, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {item.body}
              </Text>
            </View>
            {item.mediaUrl ? (
              <Text style={[styles.mediaHint, { color: colors.textMuted }]}>
                + media
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    marginHorizontal: 12,
    marginBottom: 6,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    maxHeight: 220,
    overflow: 'hidden',
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  icon: { marginRight: 4 },
  textGroup: { flex: 1, minWidth: 0 },
  trigger: {
    fontSize: 14,
    fontWeight: '600',
  },
  body: {
    fontSize: 12,
    marginTop: 2,
  },
  mediaHint: {
    fontSize: 11,
    fontStyle: 'italic',
    marginLeft: 6,
  },
});
