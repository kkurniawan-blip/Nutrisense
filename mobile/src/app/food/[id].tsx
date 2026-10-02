import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BestRecipeCard, CookView, RecipeOptionCard } from '../../components/Cook';
import { DiversityCard } from '../../components/Diversity';
import { Mascot } from '../../components/Mascot';
import { PermissionNotice } from '../../components/PermissionNotice';
import { Text } from '../../components/Text';
import { Bubble, Button, Card, ErrorBox, Loading, PressScale, Row, StepDots, Wash } from '../../components/ui';
import { api, errorText, NetworkError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ensureCamera, ensurePhotos, PermissionState } from '../../lib/camera';
import { FOOD_EMOJI, groupsToday } from '../../lib/fun';
import { KITCHEN_ORDER, pickPhoto, scanPhoto } from '../../lib/nutriscan';
import { enqueue, uuid } from '../../lib/offline';
import { useSync } from '../../lib/sync';
import type { Child, Food, KitchenRecipe, KitchenResult, Meal, MenuIdea } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors, radius, statusColor } from '../../theme';

type Phase = 'check' | 'results' | 'cook' | 'done';
type ScanState = 'idle' | 'scanning' | 'found' | 'nothing' | 'no_ai' | 'failed';

function StepHeader({ step, title }: { step: 1 | 2 | 3; title?: string }) {
  const { t } = useAuth();
  return (
    <View style={{ marginBottom: 16 }}>
      <StepDots total={3} current={step - 1} label={`${t('step')} ${step} ${t('of')} 3`} />
      {title ? <Text style={{ fontSize: 21, fontWeight: '900' }}>{title}</Text> : null}
    </View>
  );
}

/** A big, easy-to-tap food tile with a clear selected state (tick + colour + border). */
function FoodTile({ food, on, onPress }: { food: Food; on: boolean; onPress: () => void }) {
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="checkbox"
      aria-checked={on}
      accessibilityLabel={food.name}
      style={{
        width: '31%',
        minHeight: 86,
        borderRadius: radius.md,
        paddingVertical: 10,
        paddingHorizontal: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: on ? colors.mintSoft : 'rgba(255,255,255,0.8)',
        borderWidth: on ? 2 : 1,
        borderColor: on ? colors.mint : colors.border,
      }}
    >
      {on && (
        <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: colors.mint, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>✓</Text>
        </View>
      )}
      <Text style={{ fontSize: 28 }}>{FOOD_EMOJI[food.key] ?? '🍽️'}</Text>
      <Text numberOfLines={2} style={{ fontSize: 12.5, fontWeight: on ? '700' : '500', textAlign: 'center', marginTop: 4, color: on ? statusColor.ok.fg : colors.text }}>
        {food.name}
      </Text>
    </PressScale>
  );
}

export default function NutriScanFlow() {
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();
  const { t, lang } = useAuth();
  const sync = useSync();
  const child = useApi<Child>(`/api/children/${id}`);
  const foodList = useApi<{ foods: Food[] }>(`/api/foods?lang=${lang}`);
  const name = child.data?.name.split(' ')[0] ?? '';

  const [phase, setPhase] = useState<Phase>('check');
  const [photo, setPhoto] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanState>('idle');
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [detected, setDetected] = useState<string[]>([]);
  const [result, setResult] = useState<KitchenResult | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);
  const [cooking, setCooking] = useState<KitchenRecipe | MenuIdea | null>(null);
  const [savedMeals, setSavedMeals] = useState<Meal[] | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perm, setPerm] = useState<{ kind: 'camera' | 'photos'; state: PermissionState } | null>(null);
  const scroller = useRef<ScrollView>(null);
  const launched = useRef(false);

  const foods = useMemo(() => {
    const all = (foodList.data?.foods ?? []).filter((f) => f.key !== 'asi');
    const rank = (k: string) => (detected.includes(k) ? -100 + detected.indexOf(k) : KITCHEN_ORDER.indexOf(k) === -1 ? 999 : KITCHEN_ORDER.indexOf(k));
    return [...all].sort((a, b) => rank(a.key) - rank(b.key));
  }, [foodList.data, detected]);

  const top = () => scroller.current?.scrollTo({ y: 0, animated: false });

  const takePhoto = useCallback(
    async (camera: boolean) => {
      setError(null);
      setPerm(null);
      // Ask first with the shared helper, so "blocked" (only Settings can fix it) is told apart from a plain "no".
      const state = camera ? await ensureCamera() : await ensurePhotos();
      if (state !== 'granted') {
        setPerm({ kind: camera ? 'camera' : 'photos', state });
        return;
      }
      const asset = await pickPhoto(camera);
      if (asset === 'denied') {
        setPerm({ kind: camera ? 'camera' : 'photos', state: 'denied' });
        return;
      }
      if (!asset) return;
      setPhoto(asset.uri);
      setPhase('check');
      setScan('scanning');
      setScanNote(null);
      try {
        const r = await scanPhoto(id, asset, lang);
        if (!r.available) {
          setScan('no_ai');
          return;
        }
        const keys = [...new Set(r.items.filter((i) => i.known !== false).map((i) => i.food_key))].filter((k) => k !== 'asi');
        setDetected(keys);
        setSelected(keys);
        setScanNote(r.notes || null);
        setScan(keys.length ? 'found' : 'nothing');
      } catch (e) {
        setScan('failed');
        setError(e instanceof NetworkError ? t('needInternetScan') : errorText(e));
      }
    },
    [id, lang, t],
  );

  useEffect(() => {
    if (launched.current || (action !== 'camera' && action !== 'library')) return;
    launched.current = true;
    void takePhoto(action === 'camera');
  }, [action, takePhoto]);

  const toggle = (k: string) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const findRecipes = async () => {
    setPhase('results');
    setLoadingResult(true);
    setError(null);
    top();
    try {
      setResult(await api<KitchenResult>(`/api/children/${id}/nutriscan/recipes?lang=${lang}`, { body: { food_keys: selected }, timeoutMs: 120000 }));
    } catch (e) {
      setError(e instanceof NetworkError ? t('needInternetRecipes') : errorText(e));
    } finally {
      setLoadingResult(false);
    }
  };

  const openRecipe = (r: KitchenRecipe | MenuIdea) => {
    setCooking(r);
    setPhase('cook');
    top();
  };

  const logMeal = async () => {
    if (!cooking || !('foods' in cooking)) return;
    const h = new Date().getHours();
    const body = {
      items: cooking.foods.filter((f) => f !== 'asi').map((f) => ({ food_key: f })),
      meal_type: h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 19 ? 'dinner' : 'snack',
      source: 'nutriscan',
      ai_notes: cooking.name,
      client_uuid: uuid(),
    };
    setBusy(true);
    setError(null);
    try {
      await api(`/api/children/${id}/meals`, { body });
      setSavedMeals(await api<Meal[]>(`/api/children/${id}/meals?limit=100`));
      setSavedOffline(false);
    } catch (e) {
      if (!(e instanceof NetworkError)) {
        setError(errorText(e));
        return;
      }
      await enqueue('meal', Number(id), child.data?.name ?? '', body);
      await sync.refresh();
      setSavedMeals([]);
      setSavedOffline(true);
    } finally {
      setBusy(false);
    }
    setPhase('done');
    top();
  };

  const restart = () => {
    setPhase('check');
    setPhoto(null);
    setScan('idle');
    setSelected([]);
    setDetected([]);
    setResult(null);
    setCooking(null);
    setSavedMeals(null);
    setError(null);
    top();
  };

  // A fixed bottom bar keeps the one next step in view.
  const footer =
    phase === 'check' ? (
      <Button title={`✨ ${t('findBestMenu')}`} onPress={findRecipes} disabled={!selected.length || scan === 'scanning'} />
    ) : phase === 'cook' && cooking && 'foods' in cooking ? (
      <Button title={`✓ ${t('cookedLog')}`} variant="mint" onPress={logMeal} loading={busy} />
    ) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'NutriScan' }} />
      <Wash height={300} fadeTop />
      <ScrollView ref={scroller} contentContainerStyle={{ padding: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {phase === 'check' && (
          <>
            <StepHeader step={1} title={t('checkFoodsTitle')} />
            {photo ? (
              <Image source={{ uri: photo }} style={{ width: '100%', height: 220, borderRadius: radius.lg, marginBottom: 16 }} resizeMode="cover" />
            ) : (
              <Row style={{ gap: 10, marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Button title={t('takePhoto')} icon="camera" onPress={() => takePhoto(true)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title={t('choosePhoto')} icon="images" variant="secondary" onPress={() => takePhoto(false)} />
                </View>
              </Row>
            )}

            {scan === 'scanning' && (
              <Card tint={colors.lavenderSoft}>
                <Row style={{ gap: 12 }}>
                  <Mascot size={56} mood="thinking" bounce />
                  <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: colors.lavender }}>{t('nuriLooking')}</Text>
                </Row>
              </Card>
            )}
            {scan === 'found' && (
              <Bubble mood="cheer">
                {t('nuriSaw')} {detected.length} {t('foodsWord')}. {t('checkThem')}
              </Bubble>
            )}
            {scan === 'nothing' && <Bubble mood="thinking">{t('nuriSawNothing')}</Bubble>}
            {scan === 'no_ai' && <Bubble mood="caring">{t('nuriCannotSee')}</Bubble>}
            {scanNote && scan === 'found' ? <Text style={{ color: colors.muted, fontSize: 16, marginBottom: 12 }}>💬 {scanNote}</Text> : null}
            {error && <ErrorBox message={error} />}
            {perm && <PermissionNotice kind={perm.kind} state={perm.state} />}

            {!foodList.data && <Loading />}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
              {foods.map((f) => (
                <FoodTile key={f.key} food={f} on={selected.includes(f.key)} onPress={() => toggle(f.key)} />
              ))}
              {foods.length % 3 === 2 && <View style={{ width: '31%' }} />}
            </View>
          </>
        )}

        {phase === 'results' && (
          <>
            <StepHeader step={2} title={`${t('bestMenuTitle')} ${name}`} />
            {loadingResult && (
              <Card tint={colors.lavenderSoft}>
                <Row style={{ gap: 12 }}>
                  <Mascot size={56} mood="thinking" bounce />
                  <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: colors.lavender }}>{t('nuriChoosing')}</Text>
                </Row>
              </Card>
            )}
            {error && <ErrorBox message={error} onRetry={findRecipes} />}
            {result?.age_note && <Bubble mood="caring">{result.age_note}</Bubble>}
            {result && (
              <>
                {result.swaps.map((s) => (
                  <Card key={s.key} tint={statusColor.monitor.bg} style={{ padding: 14 }}>
                    <Text style={{ fontSize: 14, lineHeight: 20, color: statusColor.monitor.fg, fontWeight: '600' }}>💡 {s.text}</Text>
                  </Card>
                ))}
                {result.best && <BestRecipeCard recipe={result.best} childName={name} onCook={() => openRecipe(result.best!)} />}
                {result.others.length > 0 && (
                  <>
                    <Text style={{ fontSize: 16, fontWeight: '800', marginTop: 12, marginBottom: 10 }}>{t('otherChoices')}</Text>
                    {result.others.map((r) => (
                      <RecipeOptionCard key={r.key} recipe={r} onPress={() => openRecipe(r)} />
                    ))}
                  </>
                )}
                {result.ai_ideas.map((idea) => (
                  <Card key={idea.name} tint={colors.lavenderSoft} onPress={() => openRecipe(idea)}>
                    <Text style={{ color: statusColor.ai.fg, fontWeight: '800', fontSize: 13 }}>🤖 {t('nuriIdea')}</Text>
                    <Text style={{ fontSize: 17, fontWeight: '800', marginTop: 4 }}>{idea.name}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary, marginTop: 6 }}>{t('seeRecipe')} →</Text>
                  </Card>
                ))}
                <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{result.price_note}</Text>
              </>
            )}
            <Button title={`‹ ${t('changeFoods')}`} variant="ghost" onPress={() => setPhase('check')} />
          </>
        )}

        {phase === 'cook' && cooking && (
          <>
            <StepHeader step={3} />
            <CookView recipe={cooking} />
            {error && <ErrorBox message={error} />}
            <Button title={`‹ ${t('backToMenus')}`} variant="ghost" onPress={() => setPhase('results')} />
          </>
        )}

        {phase === 'done' && (
          <>
            <View style={{ alignItems: 'center', marginVertical: 12 }}>
              <Mascot size={110} mood="cheer" bounce />
              <Text style={{ fontSize: 25, fontWeight: '900', textAlign: 'center', marginTop: 10 }}>{t('greatJob')}</Text>
              <Text style={{ fontSize: 18, textAlign: 'center', color: colors.muted, marginTop: 6, lineHeight: 26 }}>
                {savedOffline ? t('savedOnPhone') : `${t('mealSavedFor')} ${name}.`}
              </Text>
            </View>
            {savedMeals && savedMeals.length > 0 && (
              <Card>
                <DiversityCard groups={groupsToday(savedMeals)} />
              </Card>
            )}
            <Button title={`📸 ${t('scanAgain')}`} onPress={restart} />
            <Button title={`🏠 ${t('backHome')}`} variant="ghost" onPress={() => router.replace('/home')} />
          </>
        )}
      </ScrollView>
      {footer && (
        <View style={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderTopWidth: 1, borderColor: colors.line }}>
          {footer}
        </View>
      )}
    </SafeAreaView>
  );
}
