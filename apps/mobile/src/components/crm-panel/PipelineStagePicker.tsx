/**
 * PipelineStagePicker — bottom-sheet searchable list of pipeline stages.
 *
 * Phase 43 Plan 10b.
 *
 * Usage:
 *   - Parent passes `visible`, `stages`, `currentPipelineId`, `onPick`, `onClose`.
 *   - Search input filters stages by name or pipeline name.
 *   - By default ONLY stages belonging to the order's current pipeline are
 *     shown (matches the web stage-badge picker). A "Mostrar todas" button
 *     expands the list to every pipeline's stages so a user can intentionally
 *     move an order to a different pipeline (e.g. "Ventas" -> "Recompra").
 *   - Color dot + stage name + pipeline name (as a muted sub-label).
 *   - Optimistic UX is the caller's responsibility — this sheet only calls
 *     `onPick(stageId)` and closes.
 *
 * Rendered via a react-native `Modal` with slide animation. Keeps dark-mode
 * compliance by reading from useTheme().
 */

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

import type { MobilePipelineStage } from '@/lib/api-schemas/contact-panel';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

interface Props {
  visible: boolean;
  stages: MobilePipelineStage[];
  currentStageId: string | null;
  currentPipelineId: string | null;
  onPick: (stageId: string) => void;
  onClose: () => void;
}

export function PipelineStagePicker({
  visible,
  stages,
  currentStageId,
  currentPipelineId,
  onPick,
  onClose,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scoped = showAll
      ? stages
      : currentPipelineId
        ? stages.filter((s) => s.pipeline_id === currentPipelineId)
        : stages;
    if (!q) return scoped;
    return scoped.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.pipeline_name.toLowerCase().includes(q)
    );
  }, [stages, query, showAll, currentPipelineId]);

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.handle}>
          <View
            style={[
              styles.handleBar,
              { backgroundColor: colors.border },
            ]}
          />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('crmPanel.stages.title')}
        </Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('crmPanel.stages.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.surfaceAlt,
              borderColor: colors.border,
            },
          ]}
        />
        {currentPipelineId ? (
          <Pressable
            onPress={() => setShowAll((v) => !v)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.toggleRow,
              { opacity: pressed ? 0.6 : 1 },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.toggleText, { color: colors.textMuted }]}>
              {showAll
                ? t('crmPanel.stages.showCurrentPipeline')
                : t('crmPanel.stages.showAllPipelines')}
            </Text>
          </Pressable>
        ) : null}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isCurrent = item.id === currentStageId;
            return (
              <Pressable
                onPress={() => {
                  onPick(item.id);
                  onClose();
                }}
                disabled={isCurrent}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor: pressed
                      ? colors.surfaceAlt
                      : 'transparent',
                    opacity: isCurrent ? 0.5 : 1,
                  },
                ]}
              >
                <View
                  style={[styles.dot, { backgroundColor: item.color }]}
                />
                <View style={styles.rowText}>
                  <Text
                    style={[styles.rowName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={[styles.rowPipeline, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {item.pipeline_name}
                  </Text>
                </View>
                {isCurrent ? (
                  <Text
                    style={[styles.currentTag, { color: colors.textMuted }]}
                  >
                    {t('crmPanel.stages.current')}
                  </Text>
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text
              style={[styles.empty, { color: colors.textMuted }]}
            >
              {t('crmPanel.stages.empty')}
            </Text>
          }
        />
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.cancelBtn,
            {
              backgroundColor: colors.surfaceAlt,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.cancelText, { color: colors.text }]}>
            {t('common.cancel')}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000080',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '75%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  handle: {
    alignItems: 'center',
    marginBottom: 4,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 14,
  },
  toggleRow: {
    alignItems: 'flex-end',
  },
  toggleText: {
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '500',
  },
  rowPipeline: {
    fontSize: 11,
    marginTop: 2,
  },
  currentTag: {
    fontSize: 11,
  },
  empty: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 24,
  },
  cancelBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
