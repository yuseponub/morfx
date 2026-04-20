/**
 * TemplatePicker — bottom-sheet list of APPROVED WhatsApp templates.
 *
 * Phase 43 Plan 14.
 *
 * Interaction model:
 *   - Opens as a modal bottom-sheet (same pattern as MuteDurationSheet so the
 *     two sheets feel like one family).
 *   - Search input filters by template name + body substring (case-insensitive).
 *   - Tap a row -> calls `onPick(template)` and closes.
 *   - Close via backdrop tap or X button.
 *
 * Why a plain Modal rather than @gorhom/bottom-sheet: MuteDurationSheet
 * established the pattern (see its header comment for rationale). Picker UX
 * is identical — backdrop + bottom-anchored sheet with a list. Pulling in
 * @gorhom here would not add meaningful value for a bounded list, and keeps
 * gesture surfaces off the message list below.
 *
 * Accessibility: search input is focused on open; rows have accessibilityRole
 * + Spanish label; close button has hitSlop + descriptive label.
 */

import { FileText, Search as SearchIcon, X as XIcon } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTemplates } from '@/hooks/useTemplates';
import type { MobileTemplate } from '@/lib/api-schemas/templates';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

interface TemplatePickerProps {
  visible: boolean;
  onClose: () => void;
  onPick: (template: MobileTemplate) => void;
}

function getBodyPreview(tpl: MobileTemplate): string {
  // The list row shows a truncated BODY preview (like the web). HEADER +
  // FOOTER are rendered on the VariableSheet, not here.
  const body = tpl.components.find((c) => c.type === 'BODY');
  const text = body?.text ?? '';
  if (text.length === 0) return '';
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
}

export function TemplatePicker({
  visible,
  onClose,
  onPick,
}: TemplatePickerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { templates, loading, error, refresh } = useTemplates();

  const [query, setQuery] = useState<string>('');
  const searchRef = useRef<TextInput>(null);

  // Refresh on open — cache-first hook paints instantly but a fresh fetch
  // catches any newly-approved templates since last open.
  useEffect(() => {
    if (visible) {
      setQuery('');
      void refresh();
      // Small delay so the sheet is on-screen before focus steals the keyboard.
      const id = setTimeout(() => searchRef.current?.focus(), 120);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [visible, refresh]);

  const filtered = useMemo<MobileTemplate[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return templates;
    return templates.filter((tpl) => {
      if (tpl.name.toLowerCase().includes(q)) return true;
      const preview = getBodyPreview(tpl).toLowerCase();
      return preview.includes(q);
    });
  }, [templates, query]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <SafeAreaView
          edges={['bottom', 'left', 'right']}
          style={[styles.sheet, { backgroundColor: colors.bg }]}
        >
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text
              style={[styles.title, { color: colors.text }]}
              accessibilityRole="header"
            >
              {t('chat.template.pickerTitle')}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              style={({ pressed }) => [
                styles.closeBtn,
                { opacity: pressed ? 0.5 : 1 },
              ]}
            >
              <XIcon size={20} color={colors.text} />
            </Pressable>
          </View>

          <View
            style={[
              styles.searchRow,
              { backgroundColor: colors.surfaceAlt },
            ]}
          >
            <SearchIcon size={16} color={colors.textMuted} />
            <TextInput
              ref={searchRef}
              style={[styles.searchInput, { color: colors.text }]}
              value={query}
              onChangeText={setQuery}
              placeholder={t('chat.template.searchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={t('chat.template.searchPlaceholder')}
            />
          </View>

          {loading && templates.length === 0 ? (
            <View style={styles.state}>
              <ActivityIndicator color={colors.textMuted} />
              <Text style={[styles.stateText, { color: colors.textMuted }]}>
                {t('common.loading')}
              </Text>
            </View>
          ) : error && templates.length === 0 ? (
            <View style={styles.state}>
              <Text style={[styles.stateText, { color: colors.danger }]}>
                {error}
              </Text>
              <Pressable
                onPress={() => void refresh()}
                style={({ pressed }) => [
                  styles.retryBtn,
                  {
                    borderColor: colors.border,
                    opacity: pressed ? 0.6 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                <Text
                  style={[styles.retryText, { color: colors.text }]}
                >
                  {t('common.retry')}
                </Text>
              </Pressable>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.state}>
              <FileText size={28} color={colors.textMuted} />
              <Text style={[styles.stateText, { color: colors.textMuted }]}>
                {query.trim().length === 0
                  ? t('chat.template.empty')
                  : t('chat.template.noResults')}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const preview = getBodyPreview(item);
                return (
                  <Pressable
                    onPress={() => {
                      onPick(item);
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      {
                        borderColor: colors.border,
                        backgroundColor: pressed
                          ? colors.surfaceAlt
                          : 'transparent',
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                  >
                    <Text
                      style={[styles.rowName, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    {preview.length > 0 ? (
                      <Text
                        style={[
                          styles.rowPreview,
                          { color: colors.textMuted },
                        ]}
                        numberOfLines={2}
                      >
                        {preview}
                      </Text>
                    ) : null}
                    {item.variable_count > 0 ? (
                      <Text
                        style={[
                          styles.rowMeta,
                          { color: colors.textMuted },
                        ]}
                      >
                        {t('chat.template.variableCount', {
                          count: item.variable_count,
                        })}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000066',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    // Bounded max height so the sheet never eats the entire screen.
    maxHeight: '80%',
    minHeight: '50%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  closeBtn: { padding: 4 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    marginTop: 10,
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  stateText: {
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: {
    paddingVertical: 10,
    gap: 6,
    paddingBottom: 20,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowPreview: {
    fontSize: 12,
    lineHeight: 16,
  },
  rowMeta: {
    fontSize: 11,
    marginTop: 2,
  },
});
