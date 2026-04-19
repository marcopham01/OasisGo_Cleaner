import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack initialRouteName="login">
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="task/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="task/before-photo" options={{ title: 'Chụp ảnh trước khi dọn', headerBackTitle: 'Quay lại' }} />
            <Stack.Screen name="task/checklist" options={{ title: 'Dọn dẹp & Báo cáo', headerBackTitle: 'Quay lại' }} />
            <Stack.Screen name="task/after-photo" options={{ title: 'Chụp ảnh sau khi dọn', headerBackTitle: 'Quay lại' }} />
            <Stack.Screen name="task/summary" options={{ title: 'Kết quả dọn dẹp', headerBackTitle: 'Quay lại' }} />
            <Stack.Screen
              name="edit-profile"
              options={{ title: 'Chỉnh sửa thông tin', headerBackTitle: 'Tài khoản' }}
            />
            <Stack.Screen
              name="damage-report"
              options={{ title: 'Tạo báo cáo hư hại', headerBackTitle: 'Sự cố' }}
            />
            <Stack.Screen
              name="report-lost-found"
              options={{ title: 'Ghi nhận món đồ bị thất lạc', headerBackTitle: 'Sự cố' }}
            />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
