import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Mascot } from '../components/Mascot';
import { Text } from '../components/Text';
import { Button, Card, ErrorBox, Field, PasswordField, Segmented, styles as ui, Wash, Wordmark } from '../components/ui';
import { ApiError, errorText, getBaseUrl, NetworkError, setBaseUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Lang } from '../lib/types';
import { EMAIL_RE } from '../lib/validate';
import { colors, radius, statusColor, tones } from '../theme';

const DEMO = [
  ['ibu.maria@nutrisense.id', '🤱', 'Bunda / Caregiver'],
  ['081300000003', '📱', 'Bunda (HP)'],
  ['kader.oesapa@nutrisense.id', '🏡', 'Kader'],
  ['officer@nutrisense.id', '🏥', 'Dinkes / Officer'],
  ['doctor@nutrisense.id', '🩺', 'Dokter / Doctor'],
];

type Via = 'phone' | 'email';
const PHONE_RE = /^\+?[\d\s-]{9,16}$/;

export default function Login() {
  const { login, t, lang, setLang, user } = useAuth();
  // Many mothers in NTT have a phone but no email: the phone number is the default way in.
  const [via, setVia] = useState<Via>('phone');
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

  const idOk = via === 'email' ? EMAIL_RE.test(email.trim()) : PHONE_RE.test(email.trim());
  const emailError = touched && email && !idOk ? (via === 'email' ? t('emailInvalid') : t('phoneInvalid')) : null;

  const submit = async () => {
    setTouched(true);
    if (!idOk || !password) return;
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
      <Wash height={420} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginVertical: 12 }}>
            <Mascot size={112} mood="cheer" bounce />
            <Wordmark size={36} />
            <Text style={{ color: colors.muted, fontWeight: '600', marginTop: -2 }}>{t('heroTagline')}</Text>
          </View>
          <Segmented<Lang>
            value={lang}
            // Offline the PATCH fails, but the phone already shows and keeps the new language.
            onChange={(l) => void setLang(l).catch(() => undefined)}
            options={[
              { value: 'id', label: '🇮🇩 Indonesia' },
              { value: 'en', label: '🇬🇧 English' },
            ]}
          />

          <Card>
            <Text style={{ fontSize: 20, fontWeight: '900', marginBottom: 12 }}>👋 {t('loginTitle')}</Text>
            <Segmented<Via>
              value={via}
              onChange={(v) => {
                setVia(v);
                setEmail('');
                setTouched(false);
              }}
              options={[
                { value: 'phone', label: `📱 ${t('phoneLbl')}` },
                { value: 'email', label: `✉️ ${t('email')}` },
              ]}
            />
            {via === 'phone' ? (
              <Field
                label={`📱 ${t('phoneLbl')}`}
                value={email}
                onChangeText={setEmail}
                onBlur={() => setTouched(true)}
                error={emailError}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholder={`${t('eg')} 0812 3456 7890`}
                returnKeyType="next"
              />
            ) : (
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
            )}
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
              <Text style={{ color: colors.primary, fontWeight: '800' }}>{t('forgotPassword')}</Text>
            </Pressable>
            {showForgot && (
              <View style={{ backgroundColor: statusColor.info.bg, borderRadius: radius.md, padding: 12, marginBottom: 10 }}>
                <Text style={{ color: statusColor.info.fg, fontWeight: '700', lineHeight: 21 }}>ℹ️ {t('forgotPasswordHelp')}</Text>
              </View>
            )}
            {error && <ErrorBox message={error} />}
            <Button title={t('login')} onPress={submit} loading={busy} disabled={!email || !password} icon="log-in" />
          </Card>

          <Card tint={tones.green.bg}>
            <Text style={{ fontWeight: '900', fontSize: 17 }}>🌱 {t('noAccountTitle')}</Text>
            <Button title={t('signUpMother')} variant="secondary" icon="person-add" onPress={() => router.push('/register')} />
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 6, lineHeight: 19 }}>🩺 {t('staffAccountNote')}</Text>
          </Card>

          <Card tint={tones.lavender.bg}>
            <Text style={{ fontWeight: '800', marginBottom: 8 }}>🎈 {t('demoAccounts')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DEMO.map(([e, emoji, role]) => (
                <Pressable
                  key={e}
                  accessibilityRole="button"
                  onPress={() => {
                    setVia(e.includes('@') ? 'email' : 'phone');
                    setEmail(e);
                    setPassword('Demo1234!');
                    setError(null);
                  }}
                  style={{ backgroundColor: '#fff', borderRadius: 16, padding: 12, flexBasis: '47%', flexGrow: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                  <Text style={{ fontWeight: '800', color: colors.primaryDark }}>{role}</Text>
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
