import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Text, TextInput, View } from 'react-native';

import { Button, Card, Chip, ErrorBox, H2, P, Row, Screen, Segmented } from '../../../components/ui';
import { api, errorText } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import type { Food, MealItem } from '../../../lib/types';
import { colors } from '../../../theme';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface ScanResult {
  available: boolean;
  message?: string;
  items: MealItem[];
  notes?: string;
}

export default function MealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const [foods, setFoods] = useState<Food[]>([]);
  const [items, setItems] = useState<MealItem[]>([]);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [photo, setPhoto] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api<{ foods: Food[] }>(`/api/foods?lang=${lang}`).then((r) => setFoods(r.foods)).catch((e) => setError(errorText(e)));
  }, [lang]);

  const foodName = (key: string) => foods.find((f) => f.key === key)?.name ?? key;

  const pick = async (camera: boolean) => {
    setError(null);
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Permission denied');
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, allowsEditing: false };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setPhoto(asset.uri);
    setScanning(true);
    try {
      const form = new FormData();
      const type = asset.mimeType ?? 'image/jpeg';
      if (Platform.OS === 'web') {
        const blob = await (await fetch(asset.uri)).blob();
        form.append('image', blob, asset.fileName ?? 'meal.jpg');
      } else {
        form.append('image', { uri: asset.uri, name: asset.fileName ?? 'meal.jpg', type } as unknown as Blob);
      }
      const r = await api<ScanResult>(`/api/children/${id}/nutriscan?lang=${lang}`, { form, method: 'POST', timeoutMs: 120000 });
      if (r.available) {
        setItems(r.items.filter((i) => i.known !== false));
        setScanNote(r.notes ?? null);
      } else setScanNote(t('noAI'));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setScanning(false);
    }
  };

  const add = (f: Food) => setItems((xs) => [...xs, { food_key: f.key, name: f.name, grams: f.portion_g }]);
  const setGrams = (i: number, g: string) =>
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, grams: Number(g.replace(',', '.')) || 0 } : x)));
  const remove = (i: number) => setItems((xs) => xs.filter((_, j) => j !== i));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/children/${id}/meals`, {
        body: {
          items: items.map((i) => ({ food_key: i.food_key, grams: i.grams || null })),
          meal_type: mealType,
          source: photo ? 'nutriscan' : 'manual',
          ai_notes: scanNote,
        },
      });
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const shown = useMemo(() => foods.filter((f) => f.name.toLowerCase().includes(filter.toLowerCase())), [foods, filter]);

  if (saved)
    return (
      <Screen>
        <Card style={{ backgroundColor: colors.okSoft }}>
          <P>✓ {t('mealSaved')}</P>
        </Card>
        <Button title={t('nutritionPlan')} icon="nutrition-outline" onPress={() => router.replace(`/child/${id}/nutrition`)} />
        <Button
          title={t('logMeal')}
          variant="ghost"
          onPress={() => {
            setSaved(false);
            setItems([]);
            setPhoto(null);
            setScanNote(null);
          }}
        />
      </Screen>
    );

  return (
    <Screen>
      <Card>
        <H2>NutriScan</H2>
        <Row>
          <View style={{ flex: 1 }}>
            <Button title={t('takePhoto')} icon="camera" onPress={() => pick(true)} small />
          </View>
          <View style={{ flex: 1 }}>
            <Button title={t('choosePhoto')} icon="images-outline" variant="secondary" onPress={() => pick(false)} small />
          </View>
        </Row>
        {photo && <Image source={{ uri: photo }} style={{ width: '100%', height: 180, borderRadius: 10, marginTop: 8 }} resizeMode="cover" />}
        {scanning && (
          <Row style={{ marginTop: 8 }}>
            <ActivityIndicator color={colors.primary} />
            <P muted>{t('scanning')}</P>
          </Row>
        )}
        {scanNote && <P muted style={{ marginTop: 6 }}>{scanNote}</P>}
      </Card>

      <Card>
        <Segmented<MealType>
          value={mealType}
          onChange={setMealType}
          options={[
            { value: 'breakfast', label: '🌅' },
            { value: 'lunch', label: '☀️' },
            { value: 'dinner', label: '🌙' },
            { value: 'snack', label: '🍌' },
          ]}
        />
        <H2>{t('detectedFoods')}</H2>
        {items.map((it, i) => (
          <Row key={`${it.food_key}-${i}`} style={{ marginBottom: 6 }}>
            <Text style={{ flex: 1, color: colors.text }}>
              {foodName(it.food_key)}
              {it.confidence !== undefined ? ` (${Math.round(it.confidence * 100)}%)` : ''}
            </Text>
            <TextInput
              value={String(it.grams)}
              onChangeText={(g) => setGrams(i, g)}
              keyboardType="decimal-pad"
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, width: 70, padding: 6, textAlign: 'right', color: colors.text }}
            />
            <Text style={{ color: colors.muted }}>{t('grams')}</Text>
            <Text onPress={() => remove(i)} style={{ color: colors.danger, fontSize: 18, paddingHorizontal: 6 }}>
              ✕
            </Text>
          </Row>
        ))}
        <P muted style={{ marginTop: 8 }}>{t('addFood')}</P>
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder="🔍"
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, marginVertical: 6, color: colors.text }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {shown.map((f) => (
            <Chip key={f.key} label={f.name} onPress={() => add(f)} />
          ))}
        </View>
      </Card>
      {error && <ErrorBox message={error} />}
      <Button title={t('saveMeal')} onPress={save} loading={busy} disabled={!items.length} icon="checkmark" />
    </Screen>
  );
}
