import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthProvider } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Chỉ dùng trên Android + edgeToEdgeEnabled: true.
// NativeStack (react-native-screens) không tự áp status bar insets vào header trên Android.
// Component này dùng useSafeAreaInsets() để đẩy title và nút Back xuống dưới
// status bar / camera notch. Dùng navigation.goBack() trực tiếp thay vì
// CommonActions.goBack() để tránh lỗi "GO_BACK was not handled".
function AndroidHeader({
  options,
  navigation,
  back,
}: {
  options: { title?: string; headerTintColor?: string };
  navigation: { canGoBack(): boolean; goBack(): void };
  back?: { title: string };
}) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const bg = isDark ? 'rgb(18,18,18)' : 'rgb(255,255,255)';
  const borderColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
  const tint = options.headerTintColor ?? (isDark ? '#ffffff' : '#000000');
  const canGoBack = !!back && navigation.canGoBack();

  return (
    <View
      style={[
        androidHeaderStyles.container,
        { paddingTop: insets.top, height: insets.top + 56, backgroundColor: bg, borderBottomColor: borderColor },
      ]}
    >
      <View style={androidHeaderStyles.side}>
        {canGoBack ? (
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={androidHeaderStyles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color={tint} />
          </Pressable>
        ) : null}
      </View>
      <Text style={[androidHeaderStyles.title, { color: tint }]} numberOfLines={1}>
        {options.title ?? ''}
      </Text>
      <View style={androidHeaderStyles.side} />
    </View>
  );
}

const androidHeaderStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: { width: 56, alignItems: 'center', justifyContent: 'center' },
  backBtn: { padding: 8 },
  title: { flex: 1, fontSize: 17, fontWeight: '600', textAlign: 'center' },
});

function AppNavigator() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        initialRouteName="login"
        screenOptions={
          Platform.OS === 'android'
            ? { header: (props: any) => <AndroidHeader {...props} /> }
            : undefined
        }
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="task/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="task/before-photo" options={{ title: 'Chụp ảnh trước khi dọn', headerBackTitle: 'Quay lại' }} />
        <Stack.Screen name="task/checklist" options={{ title: 'Dọn dẹp Pod', headerBackTitle: 'Quay lại' }} />
        <Stack.Screen name="task/after-photo" options={{ title: 'Chụp ảnh sau khi dọn', headerBackTitle: 'Quay lại' }} />
        <Stack.Screen
          name="task/summary"
          options={{
            title: 'Kết quả dọn dẹp',
            headerBackTitle: 'Quay lại',
            gestureEnabled: false,
          }}
        />
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
        <Stack.Screen
          name="incident/list"
          options={{ title: 'Các hư hại cần xử lý gấp', headerBackTitle: 'Sự cố' }}
        />
        <Stack.Screen
          name="incident/[id]"
          options={{ title: 'Chi tiết sự cố', headerBackTitle: 'Xử lý hư hại gấp' }}
        />
        <Stack.Screen
          name="incident/repair"
          options={{ title: 'Sửa chữa hư hại', headerBackTitle: 'Chi tiết sự cố' }}
        />
        <Stack.Screen
          name="incident/result"
          options={{ title: 'Kết quả xử lý', gestureEnabled: false }}
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen
          name="notifications/[category]"
          options={{ title: 'Thông báo', headerBackTitle: 'Quay lại' }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
