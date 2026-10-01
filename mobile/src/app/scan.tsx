import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { Text } from '../components/Text';
import { Button, Card, Chip, ErrorBox, Field, H2, MoreLink, Screen } from '../components/ui';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Locker } from '../lib/types';
import { colors, statusColor } from '../theme';

/** Kader-side locker pickup: scan the caregiver's QR (or type the 6-digit code) to release the package. */
export default function Scan() {
  const { t, user } = useAuth();
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [lockerCode, setLockerCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);
  const [pickLocker, setPickLocker] = useState(false);

  useEffect(() => {
    api<Locker[]>('/api/lockers?kind=locker')
      .then((ls) => {
        setLockers(ls);
        const mine = ls.find((l) => user?.region_id && l.code && l.name.includes(user.region?.name ?? '###'));
        setLockerCode((mine ?? ls[0])?.code ?? null);
      })
      .catch((e) => setError(errorText(e)));
  }, [user]);

  const submit = async (body: { pickup_code?: string; qr_payload?: string }, locker = lockerCode) => {
    if (!locker) return;
    setError(null);
    setResult(null);
    try {
      const r = await api<{ supply_request: { child_name: string; items: { quantity: number; name: string }[] } }>(
        `/api/lockers/by-code/${locker}/pickup`,
        { body },
      );
      setResult(`${r.supply_request.child_name} – ${r.supply_request.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}`);
      setCode('');
    } catch (e) {
      setError(errorText(e));
    }
  };

  const startScan = async () => {
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) return;
    }
    handled.current = false;
    setScanning(true);
  };

  const current = lockers.find((l) => l.code === lockerCode);

  return (
    // A new result re-opens the screen at the top, where the outcome is shown.
    <Screen key={result ?? error ?? 'scan'}>
      {/* The outcome first: did the locker open? */}
      {error && <ErrorBox message={error} />}
      {result && (
        <Card tint={statusColor.ok.bg} style={{ borderColor: colors.ok, borderWidth: 2 }}>
          <Text style={{ color: statusColor.ok.fg, fontWeight: '900', fontSize: 17 }}>🔓 {t('pickupOk')}</Text>
          <Text style={{ color: statusColor.ok.fg, marginTop: 4 }}>{result}</Text>
        </Card>
      )}
      {/* The Kader's own locker by default; the others only when asked. */}
      <Card>
        <H2>{t('lockerCode')}</H2>
        {current && (
          <Text style={{ fontWeight: '700', fontSize: 16 }}>
            📍 {current.name} · {current.code}
          </Text>
        )}
        <MoreLink label={t('changeLocker')} open={pickLocker} onPress={() => setPickLocker(!pickLocker)} />
        {pickLocker && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {lockers.map((l) => (
              <Chip
                key={l.code}
                label={`${l.code} · ${l.name.replace('Loker Posyandu ', '')}`}
                selected={lockerCode === l.code}
                onPress={() => {
                  setLockerCode(l.code);
                  setPickLocker(false);
                }}
              />
            ))}
          </View>
        )}
      </Card>
      <Card>
        {scanning ? (
          <View style={{ height: 320, borderRadius: 12, overflow: 'hidden' }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (handled.current || !data.startsWith('NEXUS:')) return;
                handled.current = true;
                setScanning(false);
                void submit({ qr_payload: data });
              }}
            />
          </View>
        ) : (
          <Button title={t('scanQR')} icon="scan-outline" onPress={startScan} disabled={Platform.OS === 'web' && !navigator?.mediaDevices} />
        )}
        {scanning && <Button small variant="ghost" title={t('cancel')} onPress={() => setScanning(false)} />}
      </Card>
      <Card>
        <Field label={t('enterCode')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
        <Button title={t('confirmPickup')} icon="lock-open-outline" onPress={() => submit({ pickup_code: code })} disabled={code.length !== 6 || !lockerCode} />
      </Card>
    </Screen>
  );
}
