import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Mascot } from '../components/Mascot';
import { Text } from '../components/Text';
import { Button, Card, ErrorBox, Field, IkatPattern, PasswordField, Segmented, styles as ui } from '../components/ui';
import { ApiError, errorText, getBaseUrl, NetworkError, setBaseUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Lang } from '../lib/types';
import { EMAIL_RE } from '../lib/validate';
import { colors, radius, statusColor } from '../theme';

const DEMO = [
  ['ibu.maria@nutrisense.id', '🤱', 'Bunda / Caregiver'],
  ['kader.oesapa@nutrisense.id', '🏡', 'Kader'],
  ['officer@nutrisense.id', '🏥', 'Dinkes / Officer'],
  ['doctor@nutrisense.id', '🩺', 'Dokter / Doctor'],
];

export default function Login() {
  const { login, t, lang, setLang, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [server, setServer] = useState(getBaseUrl());
  const [showServer, setShowServer] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.replace('/');
  }, [user]);

  const emailError = touched && email && !EMAIL_RE.test(email.trim()) ? t('emailInvalid') : null;

  const submit = async () => {
    setTouched(true);
    if (!EMAIL_RE.test(email.trim()) || !password) return;
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace('/');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? t('wrongLogin') : e instanceof NetworkError ? t('cannotReachServer') : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={ui.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginVertical: 12 }}>
            <View style={{ width: 150, height: 150, borderRadius: 32, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <IkatPattern opacity={0.12} />
              <Mascot size={112} mood="cheer" bounce />
            </View>
            <Text style={{ fontSize: 34, fontWeight: '900', color: colors.ink, marginTop: 14 }}>NutriSense</Text>
            <Text style={{ fontSize: 18, fontWeight: '800' }}>{t('loginHello')}</Text>
            <Text style={{ color: colors.muted, textAlign: 'center' }}>{t('appTagline')} 🌱</Text>
          </View>
          <Segmented<Lang>
            value={lang}
            onChange={(l) => void setLang(l)}
            options={[
              { value: 'id', label: '🇮🇩 Indonesia' },
              { value: 'en', label: '🇬🇧 English' },
            ]}
          />

          <Card>
            <Text style={{ fontSize: 20, fontWeight: '900', marginBottom: 12 }}>👋 {t('loginTitle')}</Text>
            <Field
              label={`✉️ ${t('email')}`}
              value={email}
              onChangeText={setEmail}
              onBlur={() => setTouched(true)}
              error={emailError}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              placeholder="nama@email.com"
              returnKeyType="next"
            />
            <PasswordField
              label={`🔑 ${t('password')}`}
              value={password}
              onChangeText={setPassword}
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={submit}
              returnKeyType="go"
              showLabel={t('showPassword')}
              hideLabel={t('hidePassword')}
            />
            <Pressable onPress={() => setShowForgot(!showForgot)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end' }}>
              <Text style={{ color: colors.primaryDark, fontWeight: '800' }}>{t('forgotPassword')}</Text>
            </Pressable>
            {showForgot && (
              <View style={{ backgroundColor: statusColor.info.bg, borderRadius: radius.md, padding: 12, marginBottom: 10 }}>
                <Text style={{ color: statusColor.info.fg, fontWeight: '700', lineHeight: 21 }}>ℹ️ {t('forgotPasswordHelp')}</Text>
              </View>
            )}
            {error && <ErrorBox message={error} />}
            <Button title={t('login')} onPress={submit} loading={busy} disabled={!email || !password} icon="log-in" />
          </Card>

          <Card tint={colors.mintSoft}>
            <Text style={{ fontWeight: '900', fontSize: 17 }}>🌱 {t('noAccountTitle')}</Text>
            <Text style={{ color: colors.muted, marginTop: 2, marginBottom: 6, lineHeight: 20 }}>{t('noAccountSub')}</Text>
            <Button title={t('signUpMother')} variant="secondary" icon="person-add" onPress={() => router.push('/register')} />
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 6, lineHeight: 19 }}>🩺 {t('staffAccountNote')}</Text>
          </Card>

          <Card tint={colors.lavenderSoft}>
            <Text style={{ fontWeight: '800', marginBottom: 8 }}>🎈 {t('demoAccounts')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DEMO.map(([e, emoji, role]) => (
                <Pressable
                  key={e}
                  accessibilityRole="button"
                  onPress={() => {
                    setEmail(e);
                    setPassword('Demo1234!');
                    setError(null);
                  }}
                  style={{ backgroundColor: '#fff', borderRadius: 16, padding: 10, flexBasis: '47%', flexGrow: 1, minHeight: 44 }}
                >
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                  <Text style={{ fontWeight: '800', color: colors.lavender }}>{role}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
          <Pressable onPress={() => setShowServer(!showServer)} accessibilityRole="button" style={{ alignItems: 'center', padding: 8, minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              ⚙️ {t('serverUrl')}: {getBaseUrl()}
            </Text>
          </Pressable>
          {showServer && (
            <Card>
              <Field label={t('serverUrl')} value={server} onChangeText={setServer} autoCapitalize="none" placeholder="http://192.168.1.10:8000" />
              <Button
                small
                title={t('save')}
                onPress={async () => {
                  await setBaseUrl(server);
                  setShowServer(false);
                }}
              />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
