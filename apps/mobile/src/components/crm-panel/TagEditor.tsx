/**
 * TagEditor — tag pills with add/remove for a contact or order.
 *
 * Phase 43 Plan 10b.
 *
 * Layout: wrap of pills. Each pill has a tiny X to remove. A `+` pill at
 * the end opens a bottom sheet with the full workspace tag list + search,
 * and tapping one adds it.
 *
 * Optimistic UX:
 *   - `onAdd(tag)` and `onRemove(tag)` are fire-and-forget (caller handles
 *     the server write). Caller is responsible for reverting the local
 *     state if the write fails — this component only renders.
 *   - The caller passes the current `tags` array. When a tag is selected in
 *     the picker the component invokes `onAdd` and closes the sheet; the
 *     parent updates state optimistically.
 *
 * Theming: all colors come from useTheme(). Tag pills use the tag's own
 * color as a faint background + border for visual distinctiveness.
 */

import { Plus, X as XIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { MobileTag } from '@/lib/api-schemas/contact-panel';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

interface Props {
  tags: MobileTag[];
  availableTags: MobileTag[];
  onAdd: (tag: MobileTag) => void;
  onRemove: (tag: MobileTag) => void;
  /**
   * Optional test-only label for the add button (screen readers read it).
   */
  addLabel?: string;
}

export function TagEditor({
  tags,
  availableTags,
  onAdd,
  onRemove,
  addLabel,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');

  const currentIds = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return availableTags
      .filter((t) => !currentIds.has(t.id))
      .filter((t) => (q ? t.name.toLowerCase().includes(q) : true));
  }, [availableTags, currentIds, query]);

  const handlePick = (tag: MobileTag) => {
    onAdd(tag);
    setPickerOpen(false);
    setQuery('');
  };

  return (
    <View>
      <View style={styles.pillRow}>
        {tags.map((tag) => (
          <View
            key={tag.id}
            style={[
              styles.pill,
              {
                borderColor: tag.color,
                backgroundColor: withAlpha(tag.color, 0.12),
              },
            ]}
          >
            <Text
              style={[styles.pillText, { color: colors.text }]}
              numberOfLines={1}
            >
              {tag.name}
            </Text>
            <Pressable
              onPress={() => onRemove(tag)}
              hitSlop={6}
              accessibilityLabel={t('crmPanel.tags.remove', { name: tag.name })}
              style={({ pressed }) => [
                styles.pillRemove,
                { opacity: pressed ? 0.5 : 1 },
              ]}
            >
              <XIcon size={12} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}

        <Pressable
          onPress={() => setPickerOpen(true)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={addLabel ?? t('crmPanel.tags.add')}
          style={({ pressed }) => [
            styles.addPill,
            {
              borderColor: colors.border,
              backgroundColor: colors.surfaceAlt,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Plus size={14} color={colors.textMuted} />
          <Text style={[styles.pillText, { color: colors.textMuted }]}>
            {t('crmPanel.tags.add')}
          </Text>
        </Pressable>
      </View>

      <Modal
        animationType="slide"
        transparent
        visible={pickerOpen}
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setPickerOpen(false)}
        />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.sheetHandle}>
            <View
              style={[
                styles.sheetHandleBar,
                { backgroundColor: colors.border },
              ]}
            />
          </View>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>
            {t('crmPanel.tags.pickerTitle')}
          </Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('crmPanel.tags.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoFocus
            style={[
              styles.searchInput,
              {
                color: colors.text,
                backgroundColor: colors.surfaceAlt,
                borderColor: colors.border,
              },
            ]}
          />
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handlePick(item)}
                style={({ pressed }) => [
                  styles.suggestionRow,
                  {
                    backgroundColor: pressed
                      ? colors.surfaceAlt
                      : 'transparent',
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[styles.suggestionDot, { backgroundColor: item.color }]}
                />
                <Text
                  style={[styles.suggestionText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text
                style={[
                  styles.emptyText,
                  { color: colors.textMuted },
                ]}
              >
                {t('crmPanel.tags.empty')}
              </Text>
            }
          />
          <Pressable
            onPress={() => {
              setPickerOpen(false);
              setQuery('');
            }}
            style={({ pressed }) => [
              styles.closeBtn,
              {
                backgroundColor: colors.surfaceAlt,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.closeBtnText, { color: colors.text }]}>
              {t('common.cancel')}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function withAlpha(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${h}${a}`;
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '500',
    maxWidth: 140,
  },
  pillRemove: {
    padding: 2,
  },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#00000080',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '70%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  sheetHandle: {
    alignItems: 'center',
    marginBottom: 4,
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  searchInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 14,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  suggestionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  suggestionText: {
    fontSize: 14,
    flex: 1,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  closeBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
