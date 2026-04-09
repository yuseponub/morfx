/**
 * Empty inbox stub for Plan 43-04. Real conversation list arrives in a
 * later plan. Today this proves: auth works, theme works, i18n works,
 * logout works.
 */

import { useRouter, type Href } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { signOut } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function InboxScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  async function handleLogout() {
    await signOut();
    // Cast: expo-router typed routes regenerate at metro start.
    router.replace('/(auth)/login' as Href);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <View style={styles.container}>
        <MessageCircle size={64} color={colors.textMuted} />
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          {t('inbox.empty')}
        </Text>

        <Pressable
          onPress={handleLogout}
          style={[
            styles.logoutButton,
            { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <Text style={[styles.logoutText, { color: colors.text }]}>
            {t('common.logout')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  empty: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  logoutButton: {
    marginTop: 32,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
