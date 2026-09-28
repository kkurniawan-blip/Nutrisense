import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, View } from 'react-native';

import { Mascot } from '../../../components/Mascot';
import { MenuSuggestionsView } from '../../../components/Recipes';
import { Text, TextInput } from '../../../components/Text';
import { Bubble, Button, Card, Chip, ErrorBox, H2, Loading, PressScale, RainbowPlate, Row, Screen, Segmented } from '../../../components/ui';
import { DiversityCard } from '../../../components/Diversity';
import { api, errorText, NetworkError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { FOOD_EMOJI, FOOD_GROUPS, GROUP_PLAIN, groupsToday, mealStreak } from '../../../lib/fun';
import { enqueue, uuid } from '../../../lib/offline';
import { useSync } from '../../../lib/sync';
import { useApi } from '../../../lib/useApi';
import type { Child, Food, Meal, MealItem, MenuSuggestions } from '../../../lib/types';
import { colors, radius, statusColor } from '../../../theme';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface ScanResult {
  available: boolean;
  message?: string;
  items: MealItem[];
  notes?: string;
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const btn = (label: string, d: number) => (
    <PressScale
      onPress={() => onChange(Math.max(5, value + d))}
      style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontSize: 18, fontWeight: '900', color: colors.primaryDark }}>{label}</Text>
    </PressScale>
  );
  return (
    <Row style={{ gap: 6 }}>
      {btn('−', -10)}
      <Text style={{ fontWeight: '800', minWidth: 48, textAlign: 'center' }}>{value} g</Text>
      {btn('+', 10)}
    </Row>
  );
}

export default function MealScreen() {
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();
  const { t, lang } = useAuth();
  const [foods, setFoods] = useState<Food[]>([]);
  const [items, setItems] = useState<MealItem[]>([]);
  const [mealType, setMealType] = useState<MealType>(() => {
    const h = new Date().getHours();
    return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 19 ? 'dinner' : 'snack';
  });
  const [photo, setPhoto] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<null | 'online' | 'offline'>(null);
  const [savedGroups, setSavedGroups] = useState<string[]>([]);
  const [showIdeas, setShowIdeas] = useState(false);
  const sync = useSync();
  const child = useApi<Child>(`/api/children/${id}`);
  const childName = child.data?.name.split(' ')[0] ?? '';
  const [filter, setFilter] = useState('');
  const [menus, setMenus] = useState<MenuSuggestions | null>(null);
  const [menusLoading, setMenusLoading] = useState(false);
  const [todayMeals, setTodayMeals] = useState<Meal[]>([]);
  const autoLaunched = useRef(false);

  useEffect(() => {
    api<{ foods: Food[] }>(`/api/foods?lang=${lang}`).then((r) => setFoods(r.foods)).catch((e) => setError(errorText(e)));
  }, [lang]);

  const foodName = (key: string) => foods.find((f) => f.key === key)?.name ?? key;
  const groupOf = (key: string) => foods.find((f) => f.key === key)?.group;
  const mealGroups = useMemo(() => [...new Set(items.map((i) => groupOf(i.food_key)).filter(Boolean) as string[])], [items, foods]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMenus = useCallback(
    async (pending: MealItem[]) => {
      setMenusLoading(true);
      try {
        setMenus(
          await api<MenuSuggestions>(`/api/children/${id}/menu-suggestions?lang=${lang}`, {
            body: { items: pending.map((i) => ({ food_key: i.food_key, grams: i.grams })) },
            timeoutMs: 120000,
          }),
        );
      } catch (e) {
        setError(errorText(e));
      } finally {
        setMenusLoading(false);
      }
    },
    [id, lang],
  );

  const pick = useCallback(
    async (camera: boolean) => {
      setError(null);
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError('Izin kamera/galeri ditolak / Permission denied');
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
      const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      setPhoto(asset.uri);
      setScanning(true);
      setMenus(null);
      try {
        const form = new FormData();
        if (Platform.OS === 'web') {
          form.append('image', await (await fetch(asset.uri)).blob(), asset.fileName ?? 'meal.jpg');
        } else {
          form.append('image', { uri: asset.uri, name: asset.fileName ?? 'meal.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
        }
        const r = await api<ScanResult>(`/api/children/${id}/nutriscan?lang=${lang}`, { form, method: 'POST', timeoutMs: 120000 });
        if (r.available) {
          const found = r.items.filter((i) => i.known !== false);
          setItems(found);
          setScanNote(r.notes ?? null);
          if (found.length) void loadMenus(found);
        } else setScanNote(t('noAI'));
      } catch (e) {
        setError(errorText(e));
      } finally {
        setScanning(false);
      }
    },
    [id, lang, loadMenus, t],
  );

  useEffect(() => {
    if (autoLaunched.current || (action !== 'camera' && action !== 'library')) return;
    autoLaunched.current = true;
    void pick(action === 'camera');
  }, [action, pick]);

  const add = (f: Food) => setItems((xs) => (xs.some((x) => x.food_key === f.key) ? xs : [...xs, { food_key: f.key, name: f.name, grams: f.portion_g }]));
  const setGrams = (i: number, g: number) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, grams: g } : x)));
  const remove = (i: number) => setItems((xs) => xs.filter((_, j) => j !== i));

  const save = async () => {
    const body = {
      items: items.map((i) => ({ food_key: i.food_key, grams: i.grams || null })),
      meal_type: mealType,
      source: photo ? 'nutriscan' : 'manual',
      ai_notes: scanNote,
      client_uuid: uuid(),
    };
    setBusy(true);
    setError(null);
    setSavedGroups(mealGroups);
    try {
      await api(`/api/children/${id}/meals`, { body });
      setSaved('online');
      setTodayMeals(await api<Meal[]>(`/api/children/${id}/meals?limit=100`));
      void loadMenus([]);
    } catch (e) {
      if (e instanceof NetworkError) {
        await enqueue('meal', Number(id), child.data?.name ?? '', body);
        await sync.refresh();
        setSaved('offline');
      } else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const shown = useMemo(() => foods.filter((f) => f.name.toLowerCase().includes(filter.toLowerCase())), [foods, filter]);

  if (saved) {
    const streak = mealStreak(todayMeals);
    const present = FOOD_GROUPS.filter((g) => savedGroups.includes(g.key));
    const reset = () => {
      setSaved(null);
      setItems([]);
      setPhoto(null);
      setScanNote(null);
      setMenus(null);
      setShowIdeas(false);
    };
    return (
      <Screen>
        <Row style={{ marginBottom: 8 }}>
          <Mascot size={64} mood="cheer" bounce />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: colors.primaryDark }}>
              🍽️ {t(mealType)} {childName}
            </Text>
            <Text style={{ color: colors.muted }}>{saved === 'offline' ? t('savedOnPhone') : t('greatJob')}</Text>
            {streak > 1 && <Text style={{ fontWeight: '800', color: colors.warn }}>🔥 {streak} {t('streak')}</Text>}
          </View>
        </Row>

        <Card>
          <Text style={{ fontWeight: '900', fontSize: 16, marginBottom: 6 }}>✓ {t('alreadyThere')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {present.map((g) => (
              <View key={g.key} style={{ backgroundColor: statusColor.ok.bg, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: statusColor.ok.fg, fontWeight: '800' }}>
                  ✓ {g.emoji} {GROUP_PLAIN[g.key][lang]}
                </Text>
              </View>
            ))}
          </View>
          {menus && menus.missing_groups.length > 0 && (
            <>
              <Text style={{ fontWeight: '900', fontSize: 16, marginTop: 14, marginBottom: 6 }}>➕ {t('couldAdd')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {menus.missing_groups.map((mg) => {
                  const g = FOOD_GROUPS.find((x) => x.key === mg.key);
                  return (
                    <View key={mg.key} style={{ backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: g?.color ?? colors.border }}>
                      <Text style={{ fontWeight: '700' }}>
                        {g?.emoji} {GROUP_PLAIN[mg.key]?.[lang] ?? mg.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </Card>

        {menus?.simple_idea && (
          <Card tint={colors.accentSoft}>
            <Text style={{ fontWeight: '900', fontSize: 16 }}>💡 {t('simpleIdea')}</Text>
            <Text style={{ fontSize: 17, marginTop: 4, lineHeight: 24 }}>{menus.simple_idea.text}</Text>
            <Button small variant="ghost" title={showIdeas ? t('hideIdeas') : t('seeMenuIdeas')} onPress={() => setShowIdeas(!showIdeas)} />
          </Card>
        )}
        {menusLoading && !menus && <Loading />}
        {showIdeas && menus && <MenuSuggestionsView data={menus} />}

        <Card>
          <DiversityCard groups={groupsToday(todayMeals)} compact />
        </Card>
        <Button title={t('scanAgain')} icon="camera" onPress={reset} />
        <Button title={t('nutritionPlan')} variant="secondary" icon="nutrition" onPress={() => router.replace(`/child/${id}/nutrition`)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {photo ? (
          <Image source={{ uri: photo }} style={{ width: '100%', height: 210 }} resizeMode="cover" />
        ) : (
          <View style={{ backgroundColor: colors.primarySoft, padding: 18, alignItems: 'center' }}>
            <Mascot size={80} mood="happy" bounce />
            <Text style={{ fontWeight: '800', textAlign: 'center', marginTop: 6 }}>{t('scanHero')}</Text>
            <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 13 }}>{t('scanHint')}</Text>
          </View>
        )}
        <View style={{ padding: 12 }}>
          <Row>
            <View style={{ flex: 1 }}>
              <Button small title={t('takePhoto')} icon="camera" onPress={() => pick(true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button small variant="secondary" title={t('choosePhoto')} icon="images" onPress={() => pick(false)} />
            </View>
          </Row>
        </View>
      </Card>

      {scanning && (
        <Row style={{ justifyContent: 'center', marginBottom: 10 }}>
          <Mascot size={48} mood="thinking" bounce />
          <Text style={{ fontWeight: '700', color: colors.lavender }}>{t('scanning')}</Text>
        </Row>
      )}
      {scanNote && <Bubble tint={colors.lavenderSoft}>{scanNote}</Bubble>}

      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <H2 emoji="🍽️">{t('detectedFoods')}</H2>
          <RainbowPlate groups={mealGroups} size={54} />
        </Row>
        {!items.length && <Text style={{ color: colors.muted }}>{t('pickFoodsHint')}</Text>}
        {items.map((it, i) => (
          <Row key={`${it.food_key}-${i}`} style={{ marginBottom: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>{FOOD_EMOJI[it.food_key] ?? '🍽️'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700' }}>{foodName(it.food_key)}</Text>
              {it.confidence !== undefined && <Text style={{ fontSize: 12, color: colors.muted }}>AI {Math.round(it.confidence * 100)}%</Text>}
            </View>
            <Stepper value={Math.round(it.grams)} onChange={(g) => setGrams(i, g)} />
            <Text onPress={() => remove(i)} style={{ color: colors.danger, fontSize: 18, paddingHorizontal: 4 }}>
              ✕
            </Text>
          </Row>
        ))}
        <Text style={{ fontWeight: '700', color: colors.muted, marginTop: 6, marginBottom: 6 }}>{t('mealTime')}</Text>
        <Segmented<MealType>
          value={mealType}
          onChange={setMealType}
          options={[
            { value: 'breakfast', label: `🌅 ${t('breakfast')}` },
            { value: 'lunch', label: `☀️ ${t('lunch')}` },
            { value: 'dinner', label: `🌙 ${t('dinner')}` },
            { value: 'snack', label: `🍌 ${t('snack')}` },
          ]}
        />
      </Card>

      {error && <ErrorBox message={error} />}
      <Button title={t('saveMeal')} onPress={save} loading={busy} disabled={!items.length} icon="checkmark-circle" />
      {items.length > 0 && (
        <Button title={`💡 ${t('nextMealIdeas')}`} variant="ghost" onPress={() => loadMenus(items)} loading={menusLoading} />
      )}
      {menus && <MenuSuggestionsView data={menus} />}

      <Card>
        <H2 emoji="➕">{t('addFood')}</H2>
        <TextInput
          value={filter}
          onChangeText={setFilter}
          placeholder="🔍 telur, ikan, kelor…"
          placeholderTextColor="#A09CB5"
          style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 10, fontSize: 16 }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {shown.map((f) => (
            <Chip key={f.key} emoji={FOOD_EMOJI[f.key]} label={f.name} selected={items.some((i) => i.food_key === f.key)} onPress={() => add(f)} />
          ))}
        </View>
      </Card>
    </Screen>
  );
}
