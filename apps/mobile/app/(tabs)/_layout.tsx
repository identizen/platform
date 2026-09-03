import { Tabs } from 'expo-router';
import { Globe, House, KeyRound, Settings2, Smartphone } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { tokens } from '../../src/theme/tokens';

/**
 * The five places a signed-up person goes. Tabs sit at the bottom on every one of them, so
 * navigation is never something to scroll for. Stack screens (scan, approve, phrase, onboarding)
 * live above this in the root layout.
 */
export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const t = colorScheme === 'dark' ? tokens.dark : tokens.light;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t['fg-muted'],
        tabBarStyle: {
          backgroundColor: t['surface-0'],
          borderTopColor: t.border,
        },
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
        sceneStyle: { backgroundColor: t['surface-0'] },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="devices"
        options={{
          title: 'Devices',
          tabBarIcon: ({ color, size }) => <Smartphone color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="pairings"
        options={{
          title: 'Browsers',
          tabBarIcon: ({ color, size }) => <Globe color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color, size }) => <KeyRound color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings2 color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
