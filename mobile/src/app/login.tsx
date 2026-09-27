import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Mascot } from '../components/Mascot';
import { Text } from '../components/Text';
import { Button, Card, ErrorBox, Field, Segmented, styles as ui } from '../components/ui';
import { errorText, getBaseUrl, setBaseUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Lang } from '../lib/types';
import { colors } from '../theme';

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
  const [server, setServer] = useState(getBaseUrl());
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.replace('/');
  }, [user]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace('/');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={ui.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, maxWidth: 480, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginVertical: 12 }}>
            <View style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: colors.primarySoft, top: -10 }} />
            <View style={{ position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accentSoft, top: 0, right: 40 }} />
            <View style={{ position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: colors.mintSoft, top: 110, left: 50 }} />
            <Mascot size={130} mood="cheer" bounce />
            <Text style={{ fontSize: 34, fontWeight: '900', color: colors.primary, marginTop: 4 }}>NutriSense</Text>
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
            <Field label={`✉️ ${t('email')}`} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Field label={`🔑 ${t('password')}`} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
            {error && <ErrorBox message={error} />}
            <Button title={t('login')} onPress={submit} loading={busy} disabled={!email || !password} icon="log-in" />
            <Button title={t('noAccount')} variant="ghost" onPress={() => router.push('/register')} />
          </Card>
          <Card tint={colors.lavenderSoft}>
            <Text style={{ fontWeight: '800', marginBottom: 8 }}>🎈 {t('demoAccounts')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DEMO.map(([e, emoji, role]) => (
                <Pressable
                  key={e}
                  onPress={() => {
                    setEmail(e);
                    setPassword('Demo1234!');
                  }}
                  style={{ backgroundColor: '#fff', borderRadius: 16, padding: 10, flexBasis: '47%', flexGrow: 1 }}
                >
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                  <Text style={{ fontWeight: '800', color: colors.lavender }}>{role}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
          <Pressable onPress={() => setShowServer(!showServer)} style={{ alignItems: 'center', padding: 8 }}>
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
