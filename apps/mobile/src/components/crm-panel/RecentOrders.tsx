/**
 * RecentOrders — "Pedidos recientes" section of the drawer.
 *
 * Phase 43 Plan 10b.
 *
 * Renders up to 5 OrderRow cards (matches the web default). Additional
 * scroll-through is handled by the parent ScrollView. A "Ver todos" link at
 * the bottom opens `https://morfx.app/crm/pedidos?contactId=:id` via
 * Linking — the standalone orders list screen is OUT OF SCOPE for mobile v1
 * per 43-CONTEXT.
 *
 * Empty state + loading skeleton both use Spanish copy from i18n.
 *
 * The Stage picker is controlled by this component: one sheet, one target
 * order at a time. State is lifted from OrderRow so we don't mount a picker
 * per row.
 */

import { ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  MobileOrder,
  MobilePipelineStage,
  MobileTag,
} from '@/lib/api-schemas/contact-panel';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

import { OrderRow } from './OrderRow';
import { PipelineStagePicker } from './PipelineStagePicker';

const MAX_VISIBLE = 5;

interface Props {
  orders: MobileOrder[];
  stages: MobilePipelineStage[];
  availableTags: MobileTag[];
  contactId: string | null;
  loading: boolean;
  onMoveStage: (orderId: string, stageId: string) => Promise<void>;
  onAddOrderTag: (orderId: string, tag: MobileTag) => Promise<void>;
  onRemoveOrderTag: (orderId: string, tag: MobileTag) => Promise<void>;
  onRecompra: (orderId: string) => Promise<void>;
}

function openWebOrders(contactId: string | null) {
  const url = contactId
    ? `https://morfx.app/crm/pedidos?contactId=${encodeURIComponent(contactId)}`
    : 'https://morfx.app/crm/pedidos';
  void Linking.openURL(url).catch((err) => {
    console.warn('[RecentOrders] openURL failed', err);
  });
}

function SkeletonRow({ color }: { color: string }) {
  return (
    <View
      style={[
        skeleton.row,
        { backgroundColor: color },
      ]}
    />
  );
}

export function RecentOrders({
  orders,
  stages,
  availableTags,
  contactId,
  loading,
  onMoveStage,
  onAddOrderTag,
  onRemoveOrderTag,
  onRecompra,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [pickerTarget, setPickerTarget] = useState<MobileOrder | null>(null);

  const visible = orders.slice(0, MAX_VISIBLE);
  const isInitialLoading = loading && orders.length === 0;

  return (
    <View style={styles.container}>
      <Text
        style={[styles.heading, { color: colors.text }]}
        accessibilityRole="header"
      >
        {t('crmPanel.orders.title')}
      </Text>

      {isInitialLoading ? (
        <View style={styles.list}>
          <SkeletonRow color={colors.surfaceAlt} />
          <SkeletonRow color={colors.surfaceAlt} />
          <SkeletonRow color={colors.surfaceAlt} />
        </View>
      ) : visible.length === 0 ? (
        <View
          style={[
            styles.emptyBox,
            { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
          ]}
        >
          <Text
            style={[styles.emptyText, { color: colors.textMuted }]}
            numberOfLines={2}
          >
            {t('crmPanel.orders.empty')}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {visible.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              availableTags={availableTags}
              onOpenStagePicker={setPickerTarget}
              onAddTag={(tag) => void onAddOrderTag(order.id, tag)}
              onRemoveTag={(tag) => void onRemoveOrderTag(order.id, tag)}
              onRecompra={() => void onRecompra(order.id)}
            />
          ))}
        </View>
      )}

      <Pressable
        onPress={() => openWebOrders(contactId)}
        style={({ pressed }) => [
          styles.viewAllRow,
          { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
        ]}
        accessibilityRole="link"
      >
        <Text
          style={[styles.viewAllText, { color: colors.text }]}
          numberOfLines={1}
        >
          {t('crmPanel.orders.viewAll')}
        </Text>
        <ExternalLink size={14} color={colors.textMuted} />
      </Pressable>

      <PipelineStagePicker
        visible={pickerTarget !== null}
        stages={stages}
        currentStageId={pickerTarget?.stage_id ?? null}
        currentPipelineId={pickerTarget?.pipeline_id ?? null}
        onPick={(stageId) => {
          if (pickerTarget) void onMoveStage(pickerTarget.id, stageId);
        }}
        onClose={() => setPickerTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  heading: {
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    gap: 10,
  },
  emptyBox: {
    padding: 16,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

const skeleton = StyleSheet.create({
  row: {
    height: 78,
    borderRadius: 12,
    opacity: 0.8,
  },
});
