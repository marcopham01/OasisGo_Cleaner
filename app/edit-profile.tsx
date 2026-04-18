import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts, radius, spacingX, spacingY } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { updateProfile } from '@/services/auth.service';
import type { UpdateProfileRequest } from '@/types/auth';

function FieldGroup({
  label,
  children,
  palette,
}: {
  label: string;
  children: React.ReactNode;
  palette: typeof Colors['light'];
}) {
  return (
    <View style={fieldGroupStyles.wrap}>
      <Text style={[fieldGroupStyles.label, { color: palette.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

const fieldGroupStyles = StyleSheet.create({
  wrap: { marginBottom: spacingY._15 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Fonts.sans,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default function EditProfileScreen() {
  const theme = useColorScheme() ?? 'light';
  const palette = Colors[theme];
  const { user, token, updateUserState } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [bankName, setBankName] = useState(user?.bank_name ?? '');
  const [bankAccount, setBankAccount] = useState(user?.bank_account_number ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneRef = useRef<TextInput>(null);
  const bankNameRef = useRef<TextInput>(null);
  const bankAccountRef = useRef<TextInput>(null);

  const handleSave = async () => {
    Keyboard.dismiss();
    if (!token) return;
    setError(null);
    setIsSaving(true);
    try {
      const payload: UpdateProfileRequest = {
        name: name.trim() || undefined,
        phone: phone.trim() || null,
        bank_name: bankName.trim() || null,
        bank_account_number: bankAccount.trim() || null,
      };
      const updated = await updateProfile(token, payload);
      await updateUserState(updated);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cập nhật thất bại');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>

            {/* Avatar preview */}
            <View style={styles.avatarSection}>
              <View style={[styles.avatarCircle, { backgroundColor: palette.primary }]}>
                <Text style={styles.avatarInitial}>
                  {(name || user?.email || '?')[0].toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.avatarHint, { color: palette.textMuted }]}>
                {user?.email ?? ''}
              </Text>
            </View>

            {/* Form card */}
            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>THÔNG TIN CÁ NHÂN</Text>

              <FieldGroup label="Họ và tên" palette={palette}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Nhập họ và tên"
                  placeholderTextColor={palette.neutral500}
                  returnKeyType="next"
                  onSubmitEditing={() => phoneRef.current?.focus()}
                  blurOnSubmit={false}
                  style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
                />
              </FieldGroup>

              <FieldGroup label="Số điện thoại" palette={palette}>
                <TextInput
                  ref={phoneRef}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="0xxxxxxxxx"
                  placeholderTextColor={palette.neutral500}
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  blurOnSubmit
                  style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
                />
              </FieldGroup>
            </View>

            {/* Bank card */}
            <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>THÔNG TIN NGÂN HÀNG</Text>

              <FieldGroup label="Tên ngân hàng" palette={palette}>
                <TextInput
                  ref={bankNameRef}
                  value={bankName}
                  onChangeText={setBankName}
                  placeholder="Vietcombank, Techcombank..."
                  placeholderTextColor={palette.neutral500}
                  returnKeyType="next"
                  onSubmitEditing={() => bankAccountRef.current?.focus()}
                  blurOnSubmit={false}
                  style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
                />
              </FieldGroup>

              <FieldGroup label="Số tài khoản ngân hàng" palette={palette}>
                <TextInput
                  ref={bankAccountRef}
                  value={bankAccount}
                  onChangeText={setBankAccount}
                  placeholder="Nhập số tài khoản"
                  placeholderTextColor={palette.neutral500}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  blurOnSubmit
                  style={[styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
                />
              </FieldGroup>
            </View>

            {/* Error */}
            {error ? (
              <View style={[styles.errorBox, { backgroundColor: palette.error + '15', borderColor: palette.error + '40' }]}>
                <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
              </View>
            ) : null}

            {/* Save button */}
            <Pressable
              onPress={handleSave}
              disabled={isSaving}
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: palette.primary },
                (pressed || isSaving) && { opacity: 0.75 },
              ]}>
              {isSaving ? (
                <ActivityIndicator color={palette.white} />
              ) : (
                <Text style={[styles.saveBtnText, { color: palette.white }]}>Lưu thay đổi</Text>
              )}
            </Pressable>

            {/* Cancel */}
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.cancelBtn,
                { borderColor: palette.border },
                pressed && { opacity: 0.6 },
              ]}>
              <Text style={[styles.cancelBtnText, { color: palette.textMuted }]}>Hủy</Text>
            </Pressable>

          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._20,
    paddingBottom: spacingY._20,
    gap: spacingY._12,
  },
  avatarSection: {
    alignItems: 'center',
    gap: 8,
    paddingBottom: spacingY._7,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 30,
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: Fonts.sans,
  },
  avatarHint: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  card: {
    borderRadius: radius._17,
    borderWidth: 1,
    paddingHorizontal: spacingX._15,
    paddingTop: spacingY._15,
    paddingBottom: spacingY._7,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Fonts.sans,
    letterSpacing: 0.8,
    marginBottom: spacingY._12,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius._12,
    paddingHorizontal: spacingX._12,
    paddingVertical: Platform.OS === 'ios' ? 13 : 11,
    fontSize: 15,
    fontFamily: Fonts.sans,
  },
  errorBox: {
    borderRadius: radius._12,
    borderWidth: 1,
    paddingHorizontal: spacingX._15,
    paddingVertical: 12,
  },
  errorText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
  },
  saveBtn: {
    borderRadius: radius._12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
  cancelBtn: {
    borderRadius: radius._12,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Fonts.sans,
  },
});
