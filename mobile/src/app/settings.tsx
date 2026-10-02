import Constants from 'expo-constants';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { LogoutButton } from '../components/LogoutButton';
import { Text } from '../components/Text';
import { Button, Card, Chip, Field, H2, ListRow, PasswordField, Row, Screen, Segmented } from '../components/ui';
import { api, ApiError, errorText, getBaseUrl, setBaseUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { TEXT_SCALE, type TextSize, usePrefs } from '../lib/prefs';
import { useSync } from '../lib/sync';
import type { Lang, Region, User } from '../lib/types';
import { clearApiCache, useApi } from '../lib/useApi';
import { passwordStrength } from '../lib/validate';
import { colors, radius, statusColor } from '../theme';

function Notice({ ok, text }: { ok: boolean; text: string }) {
  const c = ok ? statusColor.ok : statusColor.urgent;
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: c.bg, borderRadius: radius.md, padding: 10, marginBottom: 10 }}>
      <Text style={{ color: c.fg, fontWeight: '800' }}>
        {ok ? '✓' : '⚠️'} {text}
      </Text>
    </View>
  );
}

/** Account details: name, phone and village. Email is the login and stays fixed. */
function AccountCard() {
  const { user } = useAuth();
  // Mount the form only once the account is loaded, so its fields start from the saved values
  // (opening Settings straight after app start must not show, or save, empty fields).
  return user ? <AccountForm key={user.id} user={user} /> : null;
}

function AccountForm({ user }: { user: User }) {
  const { t, updateMe } = useAuth();
  const [name, setName] = useState(user.full_name);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [regionId, setRegionId] = useState<number | null>(user.region_id ?? null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [showRegions, setShowRegions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<Region[]>('/api/regions')
      .then(setRegions)
      .catch(() => setRegions([]));
  }, []);

  const changed = name.trim() !== user.full_name || (phone.trim() || null) !== (user.phone ?? null) || regionId !== user.region_id;
  const region = regions.find((r) => r.id === regionId);

  const save = async () => {
    if (name.trim().length < 2) {
      setMsg({ ok: false, text: t('nameRequired') });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await updateMe({ full_name: name.trim(), phone: phone.trim() || null, region_id: regionId });
      setMsg({ ok: true, text: t('savedChanges') });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <H2 emoji="👤">{t('account')}</H2>
      <Text style={{ color: colors.muted, fontSize: 13, marginTop: -6, marginBottom: 10 }}>
        {user.email ? `✉️ ${user.email}` : `📱 ${user.phone ?? ""}`} · {t(`role_${user.role}`)}
      </Text>
      <Field label={t('fullName')} value={name} onChangeText={setName} autoComplete="name" />
      <Field label={t('phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" hint={t('phoneHint')} />
      {user.role === 'caregiver' && (
        <>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted, marginBottom: 6, marginLeft: 4 }}>📍 {t('region')}</Text>
          <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontWeight: '800', flex: 1 }}>{region ? `${region.name}, ${region.district}` : t('notSet')}</Text>
            <Button small variant="ghost" title={showRegions ? t('close') : t('change')} onPress={() => setShowRegions(!showRegions)} />
          </Row>
          {showRegions && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
              {regions.map((r) => (
                <Chip key={r.id} label={r.name} selected={regionId === r.id} onPress={() => setRegionId(r.id)} />
              ))}
            </View>
          )}
        </>
      )}
      {msg && <Notice ok={msg.ok} text={msg.text} />}
      <Button title={t('saveChanges')} icon="save" onPress={save} loading={busy} disabled={!changed} />
    </Card>
  );
}

function PasswordCard() {
  const { t, changePassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const strength = passwordStrength(next);

  const submit = async () => {
    if (next.length < 8) return setMsg({ ok: false, text: t('passwordMin') });
    if (next !== confirm) return setMsg({ ok: false, text: t('passwordMismatch') });
    setBusy(true);
    setMsg(null);
    try {
      await changePassword(cur, next);
      setCur('');
      setNext('');
      setConfirm('');
      setOpen(false);
      setMsg({ ok: true, text: t('passwordChanged') });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError && e.message.includes('incorrect') ? t('currentPasswordWrong') : errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <H2 emoji="🔑">{t('changePassword')}</H2>
      {msg && <Notice ok={msg.ok} text={msg.text} />}
      {!open ? (
        <Button small variant="secondary" title={t('changePassword')} icon="key" onPress={() => setOpen(true)} />
      ) : (
        <>
          <PasswordField label={t('currentPassword')} value={cur} onChangeText={setCur} autoComplete="current-password" showLabel={t('showPassword')} hideLabel={t('hidePassword')} />
          <PasswordField
            label={t('newPassword')}
            value={next}
            onChangeText={setNext}
            autoComplete="new-password"
            hint={strength ? `${t(`pw_${strength}`)} · ${t('passwordHint')}` : t('passwordHint')}
            showLabel={t('showPassword')}
            hideLabel={t('hidePassword')}
          />
          <PasswordField label={t('confirmPassword')} value={confirm} onChangeText={setConfirm} autoComplete="new-password" showLabel={t('showPassword')} hideLabel={t('hidePassword')} />
          <Row style={{ gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button variant="ghost" title={t('cancel')} onPress={() => setOpen(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title={t('save')} onPress={submit} loading={busy} disabled={!cur || !next || !confirm} />
            </View>
          </Row>
        </>
      )}
    </Card>
  );
}

export default function Settings() {
  const { user, t, lang, setLang } = useAuth();
  const { textSize, setTextSize } = usePrefs();
  const { pending, syncing, syncNow } = useSync();
  const health = useApi<{ ai: { claude_enabled: boolean; model: string | null } }>('/api/health');
  const [server, setServer] = useState(getBaseUrl());
  const [showServer, setShowServer] = useState(false);
  const [cleared, setCleared] = useState<number | null>(null);

  return (
    <Screen>
      <AccountCard />
      <PasswordCard />

      <Card>
        <H2 emoji="🌏">{t('languageDisplay')}</H2>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted, marginBottom: 6, marginLeft: 4 }}>{t('language')}</Text>
        <Segmented<Lang>
          value={lang}
          // Offline the PATCH fails, but the phone already shows and keeps the new language.
          onChange={(l) => void setLang(l).catch(() => undefined)}
          options={[
            { value: 'id', label: '🇮🇩 Indonesia' },
            { value: 'en', label: '🇬🇧 English' },
          ]}
        />
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted, marginBottom: 6, marginLeft: 4 }}>{t('textSize')}</Text>
        <Segmented<TextSize>
          value={textSize}
          onChange={setTextSize}
          options={(Object.keys(TEXT_SCALE) as TextSize[]).map((s) => ({ value: s, label: t(`size_${s}`) }))}
        />
        <View style={{ backgroundColor: colors.bg, borderRadius: radius.md, padding: 12 }}>
          <Text style={{ fontSize: 16, lineHeight: 23 }}>🌱 {t('textSizePreview')}</Text>
        </View>
      </Card>

      <Card>
        <H2 emoji="📶">{t('offlineSync')}</H2>
        <Text style={{ lineHeight: 21, marginBottom: 8 }}>{pending > 0 ? `📶 ${pending} ${t('pendingSync')}` : `✓ ${t('allSynced')}`}</Text>
        {pending > 0 && <Button small variant="secondary" title={t('syncNow')} icon="cloud-upload" loading={syncing} onPress={() => void syncNow()} />}
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 }}>{t('cacheExplain')}</Text>
        {cleared !== null && <Notice ok text={t('cacheCleared')} />}
        <Button
          small
          variant="ghost"
          title={t('clearCache')}
          icon="trash-outline"
          onPress={async () => {
            setCleared(await clearApiCache());
          }}
        />
      </Card>

      <Card>
        {user?.role === 'caregiver' && <ListRow emoji="🔐" title={t('dataPrivacy')} subtitle={t('dataPrivacySub')} onPress={() => router.push('/privacy')} />}
        <ListRow emoji="🔔" title={t('notifications')} onPress={() => router.push('/notifications')} />
        <ListRow emoji="📖" title={t('healthGuide')} subtitle={t('worksOffline')} onPress={() => router.push('/guide')} />
      </Card>

      <Card>
        <H2 emoji="ℹ️">{t('about')}</H2>
        <Text style={{ lineHeight: 22 }}>
          NutriSense & N.E.X.U.S. · {t('version')} {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
        <Text style={{ color: colors.muted, lineHeight: 21 }}>
          🤖 {t('aiMode')}: {health.data ? (health.data.ai.claude_enabled ? t('aiOnline') : t('aiBy_rules')) : '–'}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 }}>{t('notDiagnosis')}</Text>
        <Button small variant="ghost" title={`⚙️ ${t('serverUrl')}`} onPress={() => setShowServer(!showServer)} />
        {showServer && (
          <>
            <Field label={t('serverUrl')} value={server} onChangeText={setServer} autoCapitalize="none" placeholder="http://192.168.1.10:8000" hint={t('serverHint')} />
            <Button
              small
              title={t('save')}
              onPress={async () => {
                await setBaseUrl(server);
                setShowServer(false);
              }}
            />
          </>
        )}
      </Card>

      <LogoutButton />
    </Screen>
  );
}
