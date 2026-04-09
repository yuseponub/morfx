import { Link, Stack, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/lib/theme';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: '404' }} />
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={[styles.title, { color: colors.text }]}>404</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Pantalla no encontrada
        </Text>
        <Link href={'/(tabs)/inbox' as Href} style={[styles.link, { color: colors.primary }]}>
          Ir al inbox
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
  },
  link: {
    marginTop: 24,
    fontSize: 16,
    fontWeight: '600',
  },
});
