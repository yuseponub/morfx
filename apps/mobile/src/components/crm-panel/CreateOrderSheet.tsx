/**
 * CreateOrderSheet — minimal "Crear pedido" action inside the CRM drawer.
 *
 * Phase 43 Plan 10b.
 *
 * RATIONALE — why the mobile does NOT ship a full order editor:
 *
 *   43-CONTEXT explicitly states "no standalone CRM screens on mobile" in
 *   v1. The parity inventory (43-RESEARCH) says the "Crear pedido" button
 *   must exist on the drawer, but also says "Full order detail edit lives
 *   in ViewOrderSheet — separate screen, NOT in mobile v1".
 *
 *   So this component is intentionally minimal: a single button that POSTs
 *   to /api/mobile/orders with the bare fields (contactId + conversationId),
 *   lets the server pick pipeline + stage, and then opens the web order
 *   editor via Linking for any further editing (products, shipping, etc.).
 *
 *   Toast: "Pedido creado — edítalo en la web" then Linking.openURL.
 *
 *   Disabled when no contact is linked (unknown-contact state) — the user
 *   has to "Crear contacto" first.
 */

import { Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  MobileContact,
  MobileOrder,
} from '@/lib/api-schemas/contact-panel';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

interface Props {
  contact: MobileContact | null;
  /**
   * Invoked when the user taps "Crear pedido". Parent issues POST
   * /api/mobile/orders and returns the created order (or null on error).
   */
  onCreate: () => Promise<MobileOrder | null>;
}

export function CreateOrderSheet({ contact, onCreate }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);

  const disabled = !contact || isCreating;

  const handlePress = useCallback(async () => {
    if (disabled) return;
    setIsCreating(true);
    try {
      const order = await onCreate();
      if (!order) {
        Alert.alert(
          t('crmPanel.createOrder.failedTitle'),
          t('crmPanel.createOrder.failedBody')
        );
        return;
      }
      Alert.alert(
        t('crmPanel.createOrder.successTitle'),
        t('crmPanel.createOrder.successBody'),
        [
          {
            text: t('crmPanel.createOrder.openWeb'),
            onPress: () => {
              const url = `https://morfx.app/crm/pedidos/${encodeURIComponent(order.id)}`;
              void Linking.openURL(url).catch((err) => {
                console.warn('[CreateOrderSheet] openURL failed', err);
              });
            },
          },
          {
            text: t('common.cancel'),
            style: 'cancel',
          },
        ]
      );
    } finally {
      setIsCreating(false);
    }
  }, [disabled, onCreate, t]);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.button,
          {
            borderColor: colors.border,
            backgroundColor: disabled ? colors.surfaceAlt : colors.primary,
            opacity: pressed && !disabled ? 0.8 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={t('crmPanel.createOrder.cta')}
      >
        <Plus
          size={16}
          color={disabled ? colors.textMuted : colors.primaryText}
        />
        <Text
          style={[
            styles.buttonText,
            {
              color: disabled ? colors.textMuted : colors.primaryText,
            },
          ]}
        >
          {isCreating
            ? t('crmPanel.createOrder.creating')
            : t('crmPanel.createOrder.cta')}
        </Text>
      </Pressable>
      {!contact ? (
        <Text
          style={[styles.hint, { color: colors.textMuted }]}
          numberOfLines={2}
        >
          {t('crmPanel.createOrder.requiresContact')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    fontSize: 11,
    textAlign: 'center',
  },
});
