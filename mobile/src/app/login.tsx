import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, ErrorBox, Field, P, Segmented, styles as ui } from '../components/ui';
import { errorText, getBaseUrl, setBaseUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Lang } from '../lib/types';
import { colors } from '../theme';

const DEMO = [
  ['ibu.maria@nutrisense.id', 'Caregiver / Orang tua'],
  ['kader.oesapa@nutrisense.id', 'Kader'],
  ['officer@nutrisense.id', 'Health officer / Dinkes'],
  ['doctor@nutrisense.id', 'Doctor / Dokter'],
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
        <View style={{ flex: 1, padding: 20, justifyContent: 'center', maxWidth: 480, width: '100%', alignSelf: 'center' }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{ backgroundColor: colors.primary, borderRadius: 24, padding: 14, marginBottom: 10 }}>
              <Ionicons name="leaf" size={40} color="#fff" />
            </View>
            <Text style={{ fontSize: 30, fontWeight: '800', color: colors.primaryDark }}>NutriSense</Text>
            <P muted>{t('appTagline')}</P>
          </View>
          <Segmented<Lang>
            value={lang}
            onChange={(l) => void setLang(l)}
            options={[
              { value: 'id', label: 'Bahasa Indonesia' },
              { value: 'en', label: 'English' },
            ]}
          />
          <Card>
            <Field label={t('email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={submit} />
            {error && <ErrorBox message={error} />}
            <Button title={t('login')} onPress={submit} loading={busy} disabled={!email || !password} icon="log-in-outline" />
            <Button title={t('noAccount')} variant="ghost" onPress={() => router.push('/register')} />
          </Card>
          <Card>
            <P muted style={{ marginBottom: 6 }}>{t('demoAccounts')}</P>
            {DEMO.map(([e, role]) => (
              <Pressable
                key={e}
                onPress={() => {
                  setEmail(e);
                  setPassword('Demo1234!');
                }}
                style={{ paddingVertical: 6 }}
              >
                <Text style={{ color: colors.primary, fontWeight: '600' }}>{role}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{e}</Text>
              </Pressable>
            ))}
          </Card>
          <Pressable onPress={() => setShowServer(!showServer)} style={{ alignItems: 'center', padding: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {t('serverUrl')}: {getBaseUrl()}
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
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
