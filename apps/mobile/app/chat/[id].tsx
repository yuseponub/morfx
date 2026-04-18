/**
 * Chat screen STUB (Phase 43 Plan 07).
 *
 * Plan 07 only needs the tap target from the inbox card to resolve without
 * a 404. Plan 08 (chat screen) replaces this file with the real UI:
 * message list, composer, in-chat CRM slide-over, bot toggle, etc.
 *
 * Until then, show a minimal screen with the conversation id and a back
 * button so testers can verify navigation round-trips work.
 */

import { ChevronLeft } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/lib/theme';

export default function ChatScreenStub() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.bg }]}
      edges={['top', 'left', 'right']}
    >
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border, backgroundColor: colors.bg },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.5 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          Conversación
        </Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.stubLabel, { color: colors.textMuted }]}>
          Vista de chat pendiente (Plan 08)
        </Text>
        <Text style={[styles.idText, { color: colors.textMuted }]} selectable>
          id: {id ?? 'desconocido'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backButton: {
    padding: 4,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  spacer: {
    width: 32,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  stubLabel: {
    fontSize: 15,
  },
  idText: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
});
