import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

const ID_STATUS_LABEL: Record<string, string> = {
  unverified: 'Chưa xác minh',
  pending: 'Đang chờ duyệt',
  verified: 'Đã xác minh',
  rejected: 'Bị từ chối',
};

function InfoItem({
  label,
  value,
  palette,
}: {
  label: string;
  value: string;
  palette: typeof Colors['light'];
}) {
  return (
    <View style={infoStyles.item}>
      <Text style={[infoStyles.label, { color: palette.textMuted }]}>{label}</Text>
      <Text style={[infoStyles.value, { color: palette.text }]} numberOfLines={1}>
        {value || '\u2014'}
      </Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  item: { paddingVertical: 11, gap: 3 },
  label: { fontSize: 11, fontFamily: Fonts.sans, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 15, fontFamily: Fonts.sans, fontWeight: '500' },
});

function SectionCard({ title, children, palette }: { title: string; children: React.ReactNode; palette: typeof Colors['light'] }) {
  return (
    <View style={[cardStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Text style={[cardStyles.title, { color: palette.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: { borderRadius: radius._17, borderWidth: 1, paddingHorizontal: spacingX._15, paddingTop: 12, paddingBottom: 4 },
  title: { fontSize: 11, fontFamily: Fonts.sans, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
});

export default function ProfileScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { user, signOut, refreshUser } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setIsRefreshing(true);
    refreshUser().finally(() => setIsRefreshing(false));
  }, []);

  const createdAtLabel = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '\u2014';

  const authProviderLabel = user?.authProvider === 'google' ? 'Google' : 'Email / Mật khẩu';
  const verifiedLabel = user?.isVerified ? 'Đã xác minh ✓' : 'Chưa xác minh';
  const idCardLabel = ID_STATUS_LABEL[user?.identityCardStatus ?? 'unverified'] ?? user?.identityCardStatus ?? '\u2014';
  const initial = (user?.name || user?.email || '?')[0].toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.primary }} edges={['top']}>
      <ScrollView style={{ flex: 1, backgroundColor: palette.background }} contentContainerStyle={styles.container}>

        {/* Header */}
        <View style={[styles.headerCard, { backgroundColor: palette.primary }]}>
          {isRefreshing && (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" style={styles.refreshIndicator} />
          )}
          <View style={[styles.avatarCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
          <Text style={styles.headerName}>{user?.name || 'Cleaner'}</Text>
          <Text style={styles.headerEmail}>{user?.email || ''}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{String(user?.role || 'CLEANER').toUpperCase()}</Text>
            </View>
            {user?.isVerified && (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedBadgeText}>Đã xác minh</Text>
              </View>
            )}
          </View>
        </View>

        {/* Account info */}
        <SectionCard title="THÔNG TIN CÁ NHÂN" palette={palette}>
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
          <InfoItem label="Họ và tên" value={user?.name ?? ''} palette={palette} />
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
          <InfoItem label="Email" value={user?.email ?? ''} palette={palette} />
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
          <InfoItem label="Số điện thoại" value={user?.phone ?? ''} palette={palette} />
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
          <InfoItem label="Đăng nhập qua" value={authProviderLabel} palette={palette} />
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
          <InfoItem label="Định danh (CCCD)" value={idCardLabel} palette={palette} />
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
          <InfoItem label="Ngày tham gia" value={createdAtLabel} palette={palette} />
        </SectionCard>

        {/* Bank info */}
        <SectionCard title="THÔNG TIN NGÂN HÀNG" palette={palette}>
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
          <InfoItem label="Tên ngân hàng" value={user?.bank_name ?? ''} palette={palette} />
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
          <InfoItem label="Số tài khoản" value={user?.bank_account_number ?? ''} palette={palette} />
        </SectionCard>

        {/* Edit button */}
        <Pressable
          onPress={() => router.push('/edit-profile')}
          style={({ pressed }) => [styles.editButton, { backgroundColor: palette.primary, opacity: pressed ? 0.85 : 1 }]}>
          <Text style={[styles.editButtonText, { color: palette.white }]}>Chỉnh sửa thông tin</Text>
        </Pressable>

        {/* Sign out */}
        <Pressable
          onPress={() => {
            Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
              { text: 'Hủy', style: 'cancel' },
              { text: 'Đăng xuất', style: 'destructive', onPress: () => void signOut() },
            ]);
          }}
          style={({ pressed }) => [styles.signOutButton, { borderColor: palette.error, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[styles.signOutText, { color: palette.error }]}>Đăng xuất</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacingX._15, paddingTop: spacingY._12, paddingBottom: spacingY._20, gap: spacingY._12 },
  headerCard: { borderRadius: radius._20, paddingVertical: spacingY._20, paddingHorizontal: spacingX._20, alignItems: 'center', gap: 6 },
  refreshIndicator: { position: 'absolute', top: 12, right: 14 },
  avatarCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  avatarInitial: { fontSize: 34, fontWeight: '700', color: '#ffffff', fontFamily: Fonts.sans },
  headerName: { fontSize: 20, fontWeight: '700', color: '#ffffff', fontFamily: Fonts.sans, textAlign: 'center' },
  headerEmail: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontFamily: Fonts.sans, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' },
  roleBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  roleBadgeText: { fontSize: 11, fontWeight: '700', color: '#ffffff', fontFamily: Fonts.sans, letterSpacing: 0.8 },
  verifiedBadge: { backgroundColor: 'rgba(16,185,129,0.25)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(16,185,129,0.5)' },
  verifiedBadgeText: { fontSize: 11, fontWeight: '600', color: '#10b981', fontFamily: Fonts.sans },
  divider: { height: 1 },
  editButton: { borderRadius: radius._12, paddingVertical: 14, alignItems: 'center' },
  editButtonText: { fontSize: 15, fontWeight: '600', fontFamily: Fonts.sans },
  signOutButton: { borderRadius: radius._12, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  signOutText: { fontSize: 15, fontWeight: '600', fontFamily: Fonts.sans },
});
