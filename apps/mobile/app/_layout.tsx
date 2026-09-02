import '../src/polyfills';
import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { useBootstrap } from '../src/app/useBootstrap';

export default function RootLayout() {
  const { ready } = useBootstrap();
  if (!ready) return <View className="flex-1 bg-surface-0 dark:bg-surface-0-dark" />;
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
