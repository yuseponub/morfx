/**
 * Tabs layout. Plan 43-04 ships a single tab (Inbox). Additional tabs
 * (Settings, etc.) arrive in later plans.
 */

import { Tabs } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="inbox"
        options={{
          title: t('inbox.title'),
          tabBarIcon: ({ color, size }) => (
            <MessageCircle color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
