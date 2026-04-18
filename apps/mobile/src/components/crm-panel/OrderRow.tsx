/**
 * OrderRow — single order card inside RecentOrders.
 *
 * Phase 43 Plan 10b.
 *
 * Layout:
 *   [ Stage badge · Pipeline name subtitle ]   [ Total COP ]
 *   [ Order name OR relative created_at ]
 *   [ Tags (add/remove) ]
 *   [ Recompra button ] [ Ver button ] [ Mover etapa button ]
 *
 * Interactions:
 *   - Stage badge tap -> opens PipelineStagePicker via `onOpenStagePicker`.
 *   - Ver button -> opens `https://morfx.app/crm/pedidos/:id` via Linking.
 *   - Recompra button -> calls `onRecompra(orderId)` (parent hits
 *     POST /api/mobile/orders/:id/recompra).
 *   - Tag add/remove -> propagate via `onAddTag` / `onRemoveTag`.
 *
 * Currency formatting: COP, no decimals (es-CO). Plan 10b parity inventory
 * explicitly lists this.
 *
 * Relative time: `formatDistanceToNow` from date-fns with Spanish locale.
 * date-fns is already a dependency (see package.json).
 */

import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { ExternalLink, RefreshCw, Move } from 'lucide-react-native';
import { useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  MobileOrder,
  MobileTag,
} from '@/lib/api-schemas/contact-panel';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

import { TagEditor } from './TagEditor';

interface Props {
  order: MobileOrder;
  availableTags: MobileTag[];
  onOpenStagePicker: (order: MobileOrder) => void;
  onAddTag: (tag: MobileTag) => void;
  onRemoveTag: (tag: MobileTag) => void;
  onRecompra: () => void;
}

function formatCop(total: number): string {
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(total);
  } catch {
    // Hermes/RN on older Android may not ship full ICU — fall back.
    return `$${Math.round(total).toLocaleString('es-CO')} COP`;
  }
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

function openWebOrder(orderId: string) {
  const url = `https://morfx.app/crm/pedidos/${encodeURIComponent(orderId)}`;
  void Linking.openURL(url).catch((err) => {
    console.warn('[OrderRow] openURL failed', err);
  });
}

export function OrderRow({
  order,
  availableTags,
  onOpenStagePicker,
  onAddTag,
  onRemoveTag,
  onRecompra,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const relativeTime = useMemo(() => {
    const ms = Date.parse(order.created_at);
    if (Number.isNaN(ms)) return '';
    try {
      return formatDistanceToNow(new Date(ms), {
        locale: es,
        addSuffix: true,
      });
    } catch {
      return '';
    }
  }, [order.created_at]);

  const badgeBg = withAlpha(order.stage_color, 0.15);

  return (
    <View
      style={[
        styles.container,
        { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
      ]}
    >
      <View style={styles.topRow}>
        <Pressable
          onPress={() => onOpenStagePicker(order)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.stageBadge,
            {
              backgroundColor: badgeBg,
              borderColor: order.stage_color,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('crmPanel.orders.moveStage')}
        >
          <View
            style={[styles.stageDot, { backgroundColor: order.stage_color }]}
          />
          <Text
            style={[styles.stageText, { color: colors.text }]}
            numberOfLines={1}
          >
            {order.stage_name}
          </Text>
        </Pressable>
        <Text
          style={[styles.total, { color: colors.text }]}
          numberOfLines={1}
        >
          {formatCop(order.total)}
        </Text>
      </View>

      <View style={styles.metaRow}>
        <Text
          style={[styles.pipelineName, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {order.pipeline_name}
        </Text>
        <Text
          style={[styles.dotSep, { color: colors.textMuted }]}
        >
          ·
        </Text>
        <Text
          style={[styles.timeText, { color: colors.textMuted }]}
          numberOfLines={1}
        >
          {relativeTime}
        </Text>
      </View>

      {order.name ? (
        <Text
          style={[styles.name, { color: colors.text }]}
          numberOfLines={2}
        >
          {order.name}
        </Text>
      ) : null}

      <TagEditor
        tags={order.tags}
        availableTags={availableTags}
        onAdd={onAddTag}
        onRemove={onRemoveTag}
      />

      <View style={styles.actionRow}>
        <Pressable
          onPress={onRecompra}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('crmPanel.orders.recompra')}
        >
          <RefreshCw size={14} color={colors.text} />
          <Text
            style={[styles.actionText, { color: colors.text }]}
            numberOfLines={1}
          >
            {t('crmPanel.orders.recompra')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => openWebOrder(order.id)}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
          accessibilityRole="link"
          accessibilityLabel={t('crmPanel.orders.view')}
        >
          <ExternalLink size={14} color={colors.text} />
          <Text
            style={[styles.actionText, { color: colors.text }]}
            numberOfLines={1}
          >
            {t('crmPanel.orders.view')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onOpenStagePicker(order)}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('crmPanel.orders.moveStage')}
        >
          <Move size={14} color={colors.text} />
          <Text
            style={[styles.actionText, { color: colors.text }]}
            numberOfLines={1}
          >
            {t('crmPanel.orders.moveStage')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
  },
  stageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stageText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  total: {
    fontSize: 14,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pipelineName: {
    fontSize: 11,
    flexShrink: 1,
  },
  dotSep: {
    fontSize: 11,
  },
  timeText: {
    fontSize: 11,
    flexShrink: 1,
  },
  name: {
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
