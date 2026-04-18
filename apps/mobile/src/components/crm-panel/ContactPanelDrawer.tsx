/**
 * ContactPanelDrawer — right-edge slide-over drawer shown from the chat
 * screen. Plan 10b entry point.
 *
 * Phase 43 Plan 10b. Structure (top-down, scrollable):
 *   [Header: "Contacto" + close]
 *   [WindowIndicator]
 *   [ContactBlock] (avatar, name+edit, phone, address, tags, Ver en CRM,
 *                   unknown-contact Crear contacto)
 *   [RecentOrders]  — Task 2 plugs this in
 *   [Crear pedido button]  — Task 2 opens the sheet
 *
 * Data source: `useContactPanel(conversationId)` — cache-first + realtime +
 * AppState + 30s polling. All mutations route through mobileApi POST/DELETE
 * calls that hit the Plan 10a endpoints (domain-enforced on the server).
 *
 * Optimistic UX:
 *   - Tag add/remove: immediate local state update via `setPanel`; on error
 *     the state reverts.
 *   - Name save: server returns 200 before we flip back to read mode.
 *   - Stage move: PipelineStagePicker handles the optimistic update.
 *
 * Known-contact vs unknown-contact branches live inside ContactBlock — the
 * drawer is agnostic.
 *
 * Deep link: "Ver en CRM" opens `https://morfx.app/crm/contactos/:id` via
 * react-native Linking. Same URL pattern the web uses.
 *
 * Email is NOT rendered anywhere (user exclusion per 43-CONTEXT).
 * Task creation button is DEFERRED to v1.1 per Research Open Question #4.
 */

import { X as XIcon } from 'lucide-react-native';
import { useCallback } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { mobileApi, MobileApiError } from '@/lib/api-client';
import type {
  MobileOrder,
  MobileTag,
} from '@/lib/api-schemas/contact-panel';
import {
  CreateOrderResponseSchema,
  TagMutationResponseSchema,
} from '@/lib/api-schemas/contact-panel';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';
import { useContactPanel } from '@/hooks/useContactPanel';

import { ContactBlock } from './ContactBlock';
import { CreateOrderSheet } from './CreateOrderSheet';
import { RecentOrders } from './RecentOrders';
import { WindowIndicator } from './WindowIndicator';

interface Props {
  conversationId: string;
  onClose: () => void;
}

export function ContactPanelDrawer({ conversationId, onClose }: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const {
    panel,
    orders,
    stages,
    tags: availableTags,
    loading,
    error,
    refresh,
    setPanel,
    setOrders,
  } = useContactPanel(conversationId);

  // ---------------------------------------------------------------------------
  // Contact mutations — optimistic with server-write fallback.
  // ---------------------------------------------------------------------------

  const handleUpdateName = useCallback(
    async (name: string) => {
      if (!panel?.contact) return;
      const prevName = panel.contact.name;
      // Optimistic.
      setPanel((curr) =>
        curr && curr.contact
          ? { ...curr, contact: { ...curr.contact, name } }
          : curr
      );
      try {
        await mobileApi.post(
          `/api/mobile/contacts/${encodeURIComponent(panel.contact.id)}/name`,
          { name }
        );
      } catch (err) {
        // Revert on failure.
        setPanel((curr) =>
          curr && curr.contact
            ? { ...curr, contact: { ...curr.contact, name: prevName } }
            : curr
        );
        console.warn('[ContactPanelDrawer] updateName failed', err);
      }
    },
    [panel, setPanel]
  );

  const handleAddContactTag = useCallback(
    async (tag: MobileTag) => {
      if (!panel?.contact) return;
      // Optimistic.
      setPanel((curr) =>
        curr && curr.contact
          ? {
              ...curr,
              contact: {
                ...curr.contact,
                tags: [...curr.contact.tags, tag],
              },
            }
          : curr
      );
      try {
        const raw = await mobileApi.post(
          `/api/mobile/contacts/${encodeURIComponent(panel.contact.id)}/tags`,
          { tagId: tag.id }
        );
        TagMutationResponseSchema.parse(raw);
      } catch (err) {
        // Revert.
        setPanel((curr) =>
          curr && curr.contact
            ? {
                ...curr,
                contact: {
                  ...curr.contact,
                  tags: curr.contact.tags.filter((tt) => tt.id !== tag.id),
                },
              }
            : curr
        );
        console.warn('[ContactPanelDrawer] addContactTag failed', err);
      }
    },
    [panel, setPanel]
  );

  const handleRemoveContactTag = useCallback(
    async (tag: MobileTag) => {
      if (!panel?.contact) return;
      // Optimistic.
      setPanel((curr) =>
        curr && curr.contact
          ? {
              ...curr,
              contact: {
                ...curr.contact,
                tags: curr.contact.tags.filter((tt) => tt.id !== tag.id),
              },
            }
          : curr
      );
      try {
        await mobileApi.delete(
          `/api/mobile/contacts/${encodeURIComponent(panel.contact.id)}/tags?tagId=${encodeURIComponent(tag.id)}`
        );
      } catch (err) {
        // Revert.
        setPanel((curr) =>
          curr && curr.contact
            ? {
                ...curr,
                contact: {
                  ...curr.contact,
                  tags: [...curr.contact.tags, tag],
                },
              }
            : curr
        );
        console.warn('[ContactPanelDrawer] removeContactTag failed', err);
      }
    },
    [panel, setPanel]
  );

  // ---------------------------------------------------------------------------
  // Order mutations.
  // ---------------------------------------------------------------------------

  const handleAddOrderTag = useCallback(
    async (orderId: string, tag: MobileTag) => {
      const snapshot = orders;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, tags: [...o.tags, tag] } : o
        )
      );
      try {
        await mobileApi.post(
          `/api/mobile/orders/${encodeURIComponent(orderId)}/tags`,
          { tagId: tag.id }
        );
      } catch (err) {
        setOrders(() => snapshot);
        console.warn('[ContactPanelDrawer] addOrderTag failed', err);
      }
    },
    [orders, setOrders]
  );

  const handleRemoveOrderTag = useCallback(
    async (orderId: string, tag: MobileTag) => {
      const snapshot = orders;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, tags: o.tags.filter((tt) => tt.id !== tag.id) }
            : o
        )
      );
      try {
        await mobileApi.delete(
          `/api/mobile/orders/${encodeURIComponent(orderId)}/tags?tagId=${encodeURIComponent(tag.id)}`
        );
      } catch (err) {
        setOrders(() => snapshot);
        console.warn('[ContactPanelDrawer] removeOrderTag failed', err);
      }
    },
    [orders, setOrders]
  );

  const handleMoveStage = useCallback(
    async (orderId: string, stageId: string) => {
      const snapshot = orders;
      const target = stages.find((s) => s.id === stageId);
      if (!target) return;
      // Optimistic: reflect the stage change locally.
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                stage_id: stageId,
                stage_name: target.name,
                stage_color: target.color,
                pipeline_id: target.pipeline_id,
                pipeline_name: target.pipeline_name,
              }
            : o
        )
      );
      try {
        await mobileApi.post(
          `/api/mobile/orders/${encodeURIComponent(orderId)}/stage`,
          { stageId }
        );
      } catch (err) {
        setOrders(() => snapshot);
        console.warn('[ContactPanelDrawer] moveStage failed', err);
      }
    },
    [orders, stages, setOrders]
  );

  const handleRecompra = useCallback(
    async (orderId: string) => {
      try {
        const raw = await mobileApi.post(
          `/api/mobile/orders/${encodeURIComponent(orderId)}/recompra`,
          {}
        );
        const parsed = CreateOrderResponseSchema.parse(raw);
        // Refresh to pull the new order into the list.
        void refresh();
        // Open the new order on the web for editing (mobile v1 does not ship
        // a full order editor — matches 43-CONTEXT Out of Scope).
        const url = `https://morfx.app/crm/pedidos/${encodeURIComponent(parsed.order.id)}`;
        void Linking.openURL(url).catch((err) => {
          console.warn('[ContactPanelDrawer] open recompra failed', err);
        });
      } catch (err) {
        console.warn('[ContactPanelDrawer] recompra failed', err);
      }
    },
    [refresh]
  );

  // ---------------------------------------------------------------------------
  // Crear pedido (minimal) flow.
  // ---------------------------------------------------------------------------

  const handleCreateOrder = useCallback(async (): Promise<MobileOrder | null> => {
    if (!panel?.contact) return null;
    try {
      const raw = await mobileApi.post(
        '/api/mobile/orders',
        {
          contactId: panel.contact.id,
          conversationId,
        }
      );
      const parsed = CreateOrderResponseSchema.parse(raw);
      void refresh();
      return parsed.order;
    } catch (err) {
      console.warn('[ContactPanelDrawer] createOrder failed', err);
      return null;
    }
  }, [panel, conversationId, refresh]);

  // ---------------------------------------------------------------------------
  // Unknown-contact: open the web "Crear contacto" flow.
  // ---------------------------------------------------------------------------

  const handleCreateContact = useCallback(() => {
    const url = `https://morfx.app/whatsapp?conversation=${encodeURIComponent(conversationId)}`;
    void Linking.openURL(url).catch((err) => {
      console.warn('[ContactPanelDrawer] open createContact failed', err);
    });
  }, [conversationId]);

  // ---------------------------------------------------------------------------
  // Render.
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.bg }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border, backgroundColor: colors.bg },
        ]}
      >
        <Text
          style={[styles.title, { color: colors.text }]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {t('crmPanel.title')}
        </Text>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={({ pressed }) => [
            styles.closeBtn,
            { opacity: pressed ? 0.5 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('crmPanel.close')}
        >
          <XIcon size={22} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {loading && !panel ? (
          <View style={styles.loadingRow}>
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              {t('common.loading')}
            </Text>
          </View>
        ) : null}

        {error && !panel ? (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {error}
            </Text>
            <Pressable
              onPress={() => void refresh()}
              style={({ pressed }) => [
                styles.retryBtn,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.retryText, { color: colors.text }]}>
                {t('common.retry')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {panel ? (
          <>
            <WindowIndicator window={panel.window} />
            <ContactBlock
              contact={panel.contact}
              profileName={panel.profile_name}
              phone={panel.phone}
              availableTags={availableTags}
              onUpdateName={handleUpdateName}
              onAddTag={handleAddContactTag}
              onRemoveTag={handleRemoveContactTag}
              onCreateContact={handleCreateContact}
            />

            <RecentOrders
              orders={orders}
              stages={stages}
              availableTags={availableTags}
              contactId={panel.contact?.id ?? null}
              loading={loading}
              onMoveStage={handleMoveStage}
              onAddOrderTag={handleAddOrderTag}
              onRemoveOrderTag={handleRemoveOrderTag}
              onRecompra={handleRecompra}
            />

            <CreateOrderSheet
              contact={panel.contact}
              onCreate={handleCreateOrder}
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// Narrow `MobileApiError` check kept here for possible future branch logic.
// (Currently unused — mutations swallow errors by reverting state.)
export { MobileApiError };

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    gap: 16,
  },
  loadingRow: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
  },
  errorBox: {
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
