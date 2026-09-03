import '../src/polyfills';
import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { View } from 'react-native';
import { useBootstrap } from '../src/state/useBootstrap';
import { tokens } from '../src/theme/tokens';

export default function RootLayout() {
  const { ready } = useBootstrap();
  const { colorScheme } = useColorScheme();
  const t = colorScheme === 'dark' ? tokens.dark : tokens.light;
  if (!ready) return <View className="flex-1 bg-surface-0 dark:bg-surface-0-dark" />;
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t['surface-0'] },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
        <Stack.Screen name="approve/[id]" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="phrase" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}
