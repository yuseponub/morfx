/**
 * TemplateVariableSheet — step 2 of the mobile template send flow.
 *
 * Phase 43 Plan 14. Opens after the user picks a template from TemplatePicker.
 *
 * Interaction model:
 *   - Renders one TextInput per `{{n}}` variable (sorted numerically).
 *   - Shows a live preview of HEADER + BODY + FOOTER with tokens substituted
 *     (identical UX to web template-preview.tsx).
 *   - Submit button is disabled until every variable has a value (empty
 *     strings are blocked so we never send `{{1}}` literally to WhatsApp).
 *   - Cancel returns to the picker (parent component controls that).
 *
 * Send strategy (Regla 6):
 *   - Calls the existing POST /api/mobile/conversations/:id/messages with
 *     `templateName` + `templateVariables` (contract from Plan 09, already
 *     wired server-side in `domain/messages-send-idempotent.ts`).
 *   - Does NOT go through the outbox. Templates are an online-only action
 *     (server validates approved list, Meta needs live delivery). The outbox
 *     schema would need new columns for template fields, which is out of
 *     scope for Plan 14; direct api-client call keeps the change surface
 *     minimal and does not touch the web's send path.
 *   - On success, calls `onSent()` which the parent wires to
 *     `useConversationMessages.refreshFromCache` for an immediate paint, then
 *     closes the sheet. The server-side `messages` row will appear on the
 *     next GET /messages refresh (the mark-read + realtime loops in the
 *     chat screen already cover this).
 *
 * Note: this sheet does NOT optimistically insert a cached_messages row
 * because templates don't have a clean cache shape in v1 (no `type='template'`
 * support in the cache taxonomy — see messages-cache.ts). The chat screen's
 * refresh will pick up the real row; trade-off is a ~1s latency between
 * tap and bubble appearing, acceptable for a rare action.
 */

import { Send, X as XIcon } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { randomUUID } from 'expo-crypto';

import { mobileApi, MobileApiError } from '@/lib/api-client';
import type { MobileTemplate } from '@/lib/api-schemas/templates';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

interface TemplateVariableSheetProps {
  visible: boolean;
  template: MobileTemplate | null;
  conversationId: string;
  onClose: () => void;
  onSent: () => void;
}

// Extract sorted unique `{{n}}` keys from HEADER + BODY text (mirrors the
// server's countTemplateVariables — we derive the keys on the client so
// each TextInput is bound to a known index).
function extractVariableKeys(tpl: MobileTemplate): string[] {
  let allText = '';
  for (const c of tpl.components) {
    if ((c.type === 'HEADER' || c.type === 'BODY') && c.text) {
      allText += c.text;
    }
  }
  const matches = allText.match(/\{\{(\d+)\}\}/g) ?? [];
  const uniq = new Set(matches.map((m) => m.replace(/[{}]/g, '')));
  return Array.from(uniq).sort(
    (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10)
  );
}

function substituteText(
  text: string,
  values: Record<string, string>
): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_m, key: string) => {
    const v = values[key];
    return v && v.length > 0 ? v : `{{${key}}}`;
  });
}

export function TemplateVariableSheet({
  visible,
  template,
  conversationId,
  onClose,
  onSent,
}: TemplateVariableSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const firstInputRef = useRef<TextInput>(null);

  const variableKeys = useMemo<string[]>(
    () => (template ? extractVariableKeys(template) : []),
    [template]
  );

  // Reset state when the sheet opens with a new template.
  useEffect(() => {
    if (!visible || !template) return;
    // Seed from variable_mapping when present — identical to the web flow
    // which also stores the mapping (e.g. {"1": "contact.name"}); on mobile
    // we do not have the contact record at hand (no per-call contact fetch
    // here), so we initialize to the mapping label as a placeholder HINT
    // rather than auto-fill. Empty string so the user fills in meaningful
    // values instead of sending the literal path text.
    const initial: Record<string, string> = {};
    for (const k of variableKeys) {
      initial[k] = '';
    }
    setValues(initial);
    setError(null);
    setSending(false);
    const id = setTimeout(() => firstInputRef.current?.focus(), 140);
    return () => clearTimeout(id);
  }, [visible, template, variableKeys]);

  const canSend = useMemo<boolean>(() => {
    if (!template || sending) return false;
    if (variableKeys.length === 0) return true;
    return variableKeys.every((k) => (values[k] ?? '').trim().length > 0);
  }, [template, sending, variableKeys, values]);

  const renderedBody = useMemo<{
    header: string | null;
    body: string | null;
    footer: string | null;
  }>(() => {
    if (!template) return { header: null, body: null, footer: null };
    const header = template.components.find((c) => c.type === 'HEADER');
    const body = template.components.find((c) => c.type === 'BODY');
    const footer = template.components.find((c) => c.type === 'FOOTER');
    return {
      header: header?.text ? substituteText(header.text, values) : null,
      body: body?.text ? substituteText(body.text, values) : null,
      footer: footer?.text ?? null,
    };
  }, [template, values]);

  const handleSend = async (): Promise<void> => {
    if (!template || !canSend) return;
    setSending(true);
    setError(null);
    try {
      // Build the variables map (keys are sorted numeric strings, values
      // are trimmed user input). Plan 09's domain wrapper
      // (`messages-send-idempotent.ts::buildTemplateBodyComponents`)
      // consumes this shape directly.
      const templateVariables: Record<string, string> = {};
      for (const k of variableKeys) {
        templateVariables[k] = (values[k] ?? '').trim();
      }

      // Rendered body (with substitutions) is sent as the preview text so
      // the server can persist a readable snapshot in the message row. The
      // domain layer pipes this into `renderedText` (see
      // messages-send-idempotent.ts line ~285).
      const previewBody = renderedBody.body ?? null;

      await mobileApi.post(
        `/api/mobile/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          idempotencyKey: randomUUID(),
          body: previewBody,
          mediaKey: null,
          mediaType: null,
          templateName: template.name,
          templateVariables,
        }
      );

      // Success — let the parent refresh the message list.
      onSent();
      onClose();
    } catch (err) {
      const msg =
        err instanceof MobileApiError
          ? extractApiErrorMessage(err) ?? `API ${err.status}`
          : err instanceof Error
            ? err.message
            : 'Error al enviar template';
      setError(msg);
      // Surface as a native alert too — this is a rare action and failures
      // deserve a prominent signal.
      Alert.alert(t('chat.template.sendFailed'), msg);
    } finally {
      setSending(false);
    }
  };

  if (!template) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <SafeAreaView
          edges={['bottom', 'left', 'right']}
          style={[styles.sheet, { backgroundColor: colors.bg }]}
        >
          <View
            style={[styles.header, { borderBottomColor: colors.border }]}
          >
            <View style={styles.headerTitleWrap}>
              <Text
                style={[styles.title, { color: colors.text }]}
                numberOfLines={1}
                accessibilityRole="header"
              >
                {template.name}
              </Text>
              <Text
                style={[styles.subtitle, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {t('chat.template.previewTitle')}
              </Text>
            </View>
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

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {variableKeys.length > 0 ? (
              <View style={styles.section}>
                <Text
                  style={[styles.sectionTitle, { color: colors.textMuted }]}
                >
                  {t('chat.template.variables')}
                </Text>
                {variableKeys.map((k, idx) => {
                  const mapping = template.variable_mapping[k] ?? '';
                  return (
                    <View key={k} style={styles.varRow}>
                      <View
                        style={[
                          styles.varBadge,
                          { backgroundColor: colors.surfaceAlt },
                        ]}
                      >
                        <Text
                          style={[
                            styles.varBadgeText,
                            { color: colors.textMuted },
                          ]}
                        >
                          {`{{${k}}}`}
                        </Text>
                      </View>
                      <TextInput
                        ref={idx === 0 ? firstInputRef : undefined}
                        style={[
                          styles.varInput,
                          {
                            color: colors.text,
                            backgroundColor: colors.surfaceAlt,
                            borderColor: colors.border,
                          },
                        ]}
                        value={values[k] ?? ''}
                        onChangeText={(next) => {
                          setValues((prev) => ({ ...prev, [k]: next }));
                          if (error) setError(null);
                        }}
                        placeholder={
                          mapping.length > 0
                            ? mapping
                            : t('chat.template.variablePlaceholder')
                        }
                        placeholderTextColor={colors.textMuted}
                        autoCorrect={false}
                        accessibilityLabel={`Variable ${k}`}
                      />
                    </View>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text
                style={[styles.sectionTitle, { color: colors.textMuted }]}
              >
                {t('chat.template.preview')}
              </Text>
              <View
                style={[
                  styles.previewBox,
                  {
                    backgroundColor: colors.surfaceAlt,
                    borderColor: colors.border,
                  },
                ]}
              >
                {renderedBody.header ? (
                  <Text
                    style={[styles.previewHeader, { color: colors.text }]}
                  >
                    {renderedBody.header}
                  </Text>
                ) : null}
                {renderedBody.body ? (
                  <Text
                    style={[styles.previewBody, { color: colors.text }]}
                  >
                    {renderedBody.body}
                  </Text>
                ) : null}
                {renderedBody.footer ? (
                  <Text
                    style={[
                      styles.previewFooter,
                      { color: colors.textMuted },
                    ]}
                  >
                    {renderedBody.footer}
                  </Text>
                ) : null}
              </View>
            </View>

            {error ? (
              <Text style={[styles.errorLine, { color: colors.danger }]}>
                {error}
              </Text>
            ) : null}
          </ScrollView>

          <View
            style={[styles.footer, { borderTopColor: colors.border }]}
          >
            <Pressable
              onPress={onClose}
              disabled={sending}
              style={({ pressed }) => [
                styles.cancelBtn,
                {
                  borderColor: colors.border,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.cancelText, { color: colors.text }]}>
                {t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSend()}
              disabled={!canSend}
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor: canSend ? colors.primary : colors.border,
                  opacity: pressed && canSend ? 0.85 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('chat.template.send')}
            >
              {sending ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <>
                  <Send size={16} color={colors.primaryText} />
                  <Text
                    style={[
                      styles.sendText,
                      { color: colors.primaryText },
                    ]}
                  >
                    {t('chat.template.send')}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function extractApiErrorMessage(err: MobileApiError): string | null {
  if (err.body && typeof err.body === 'object') {
    const maybe = (err.body as Record<string, unknown>).error;
    if (typeof maybe === 'string' && maybe.length > 0) return maybe;
  }
  return null;
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
    maxHeight: '92%',
    minHeight: '60%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerTitleWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 12,
  },
  closeBtn: { padding: 4 },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 12,
    gap: 16,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  varRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  varBadge: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 54,
    alignItems: 'center',
  },
  varBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  varInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 14,
  },
  previewBox: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  previewHeader: {
    fontSize: 14,
    fontWeight: '700',
  },
  previewBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  previewFooter: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  errorLine: {
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sendText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
