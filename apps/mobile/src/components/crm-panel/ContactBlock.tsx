/**
 * ContactBlock — contact header inside the CRM drawer.
 *
 * Phase 43 Plan 10b.
 *
 * Renders (in order):
 *   - Avatar placeholder (initials from name or phone)
 *   - Inline-editable name: tap to open a TextInput, Enter to save, X to cancel.
 *     Calls `onUpdateName` which is wired to POST /api/mobile/contacts/:id/name.
 *   - Phone (read-only, selectable so the user can long-press to copy)
 *   - Address + city (when present)
 *   - TagEditor bound to the contact's tags
 *   - "Ver en CRM" deep-link (opens https://morfx.app/crm/contactos/:id)
 *
 * "Unknown contact" state (contact = null):
 *   - Shows WhatsApp profile name + phone as fallback.
 *   - Renders a "Crear contacto" CTA that, when tapped, calls `onCreateContact`
 *     — the parent drawer handles the sheet. (v1: the sheet is a link to the
 *     web create flow via Linking; a native sheet is a v1.1 follow-up — the
 *     parity inventory requires the button to exist.)
 *
 * Email is INTENTIONALLY not rendered (user exclusion per 43-CONTEXT).
 */

import { Check, ExternalLink, MapPin, Pencil, Plus, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {
  MobileContact,
  MobileTag,
} from '@/lib/api-schemas/contact-panel';
import { useTheme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';

import { TagEditor } from './TagEditor';

interface Props {
  contact: MobileContact | null;
  /** WhatsApp profile fallback when contact is null. */
  profileName: string | null;
  /** Conversation phone — always present from the server. */
  phone: string;
  availableTags: MobileTag[];
  onUpdateName: (name: string) => Promise<void>;
  onAddTag: (tag: MobileTag) => Promise<void>;
  onRemoveTag: (tag: MobileTag) => Promise<void>;
  onCreateContact: () => void;
}

function initialsFor(s: string | null): string {
  if (!s) return '?';
  const trimmed = s.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function openCrmLink(contactId: string) {
  const url = `https://morfx.app/crm/contactos/${encodeURIComponent(contactId)}`;
  void Linking.openURL(url).catch((err) => {
    console.warn('[ContactBlock] openURL failed', err);
  });
}

export function ContactBlock({
  contact,
  profileName,
  phone,
  availableTags,
  onUpdateName,
  onAddTag,
  onRemoveTag,
  onCreateContact,
}: Props) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const displayName =
    contact?.name ?? profileName ?? phone ?? t('crmPanel.contact.unknown');

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(displayName);

  // Keep the draft in sync if the underlying name changes (e.g. after a
  // realtime update from the server).
  useEffect(() => {
    if (!editing) setDraftName(displayName);
  }, [displayName, editing]);

  const saveName = useCallback(async () => {
    const trimmed = draftName.trim();
    if (!contact) {
      setEditing(false);
      return;
    }
    if (!trimmed || trimmed === contact.name) {
      setEditing(false);
      setDraftName(contact.name ?? '');
      return;
    }
    try {
      await onUpdateName(trimmed);
    } finally {
      setEditing(false);
    }
  }, [draftName, contact, onUpdateName]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setDraftName(contact?.name ?? displayName);
  }, [contact, displayName]);

  // ---------------------------------------------------------------------------
  // Unknown-contact state.
  // ---------------------------------------------------------------------------

  if (!contact) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.avatarText, { color: colors.textMuted }]}>
              {initialsFor(profileName ?? phone)}
            </Text>
          </View>
          <View style={styles.headerText}>
            <Text
              style={[styles.name, { color: colors.text }]}
              numberOfLines={1}
            >
              {profileName ?? t('crmPanel.contact.unknown')}
            </Text>
            <Text
              style={[styles.phone, { color: colors.textMuted }]}
              numberOfLines={1}
              selectable
            >
              {phone}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={onCreateContact}
          style={({ pressed }) => [
            styles.createBtn,
            {
              borderColor: colors.border,
              backgroundColor: colors.surfaceAlt,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('crmPanel.contact.createCta')}
        >
          <Plus size={16} color={colors.text} />
          <Text style={[styles.createBtnText, { color: colors.text }]}>
            {t('crmPanel.contact.createCta')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Known contact.
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.avatarText, { color: colors.text }]}>
            {initialsFor(contact.name)}
          </Text>
        </View>
        <View style={styles.headerText}>
          {editing ? (
            <View style={styles.editRow}>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                autoFocus
                onSubmitEditing={saveName}
                returnKeyType="done"
                style={[
                  styles.nameInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceAlt,
                    borderColor: colors.border,
                  },
                ]}
                placeholder={t('crmPanel.contact.namePlaceholder')}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={t('crmPanel.contact.namePlaceholder')}
              />
              <Pressable
                onPress={saveName}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('crmPanel.contact.saveName')}
              >
                <Check size={18} color={colors.success} />
              </Pressable>
              <Pressable
                onPress={cancelEdit}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <X size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setEditing(true)}
              hitSlop={4}
              style={({ pressed }) => [
                styles.nameRow,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('crmPanel.contact.editName')}
            >
              <Text
                style={[styles.name, { color: colors.text }]}
                numberOfLines={1}
              >
                {contact.name ?? profileName ?? phone}
              </Text>
              <Pencil size={14} color={colors.textMuted} />
            </Pressable>
          )}
          <Text
            style={[styles.phone, { color: colors.textMuted }]}
            numberOfLines={1}
            selectable
          >
            {contact.phone ?? phone}
          </Text>
        </View>
      </View>

      {contact.address || contact.city ? (
        <View style={styles.addressRow}>
          <MapPin size={14} color={colors.textMuted} />
          <Text
            style={[styles.addressText, { color: colors.textMuted }]}
            numberOfLines={2}
            selectable
          >
            {[contact.address, contact.city].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : null}

      <TagEditor
        tags={contact.tags}
        availableTags={availableTags}
        onAdd={(tag) => void onAddTag(tag)}
        onRemove={(tag) => void onRemoveTag(tag)}
      />

      <Pressable
        onPress={() => openCrmLink(contact.id)}
        style={({ pressed }) => [
          styles.linkRow,
          {
            borderColor: colors.border,
            backgroundColor: colors.surfaceAlt,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
        accessibilityRole="link"
        accessibilityLabel={t('crmPanel.contact.viewInCrm')}
      >
        <Text style={[styles.linkText, { color: colors.text }]}>
          {t('crmPanel.contact.viewInCrm')}
        </Text>
        <ExternalLink size={14} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '600',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  phone: {
    fontSize: 12,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nameInput: {
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    padding: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  addressText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '500',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
