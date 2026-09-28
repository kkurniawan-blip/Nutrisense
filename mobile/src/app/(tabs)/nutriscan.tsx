import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { ChildPicker } from '../../components/ChildPicker';
import { DiversityCard } from '../../components/Diversity';
import { Mascot } from '../../components/Mascot';
import { Text } from '../../components/Text';
import { Button, Card, Empty, Loading, PressScale, Row, Screen } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { groupsToday } from '../../lib/fun';
import type { Child, Meal } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors, radius, shadow } from '../../theme';

const HOW = [
  { emoji: '📸', key: 'howStep1' },
  { emoji: '✅', key: 'howStep2' },
  { emoji: '👩‍🍳', key: 'howStep3' },
];

/** NutriScan start: one big photo button, two alternatives, and how it works in three steps. */
export default function NutriScanTab() {
  const { t } = useAuth();
  const children = useApi<Child[]>('/api/children');
  const { child: childParam } = useLocalSearchParams<{ child?: string }>();
  const [picked, setPicked] = useState<number | null>(null);
  const childId = picked ?? (childParam ? Number(childParam) : null) ?? children.data?.[0]?.id ?? null;
  const meals = useApi<Meal[]>(childId ? `/api/children/${childId}/meals?limit=100` : null);
  const child = children.data?.find((c) => c.id === childId);
  const name = child?.name.split(' ')[0] ?? '';

  if (!children.data) return <Screen>{children.loading ? <Loading /> : null}</Screen>;
  if (!children.data.length)
    return (
      <Screen>
        <Empty text={t('addFirstChild')} />
      </Screen>
    );

  const start = (action: 'camera' | 'library' | 'pick') => router.push(`/food/${childId}?action=${action}`);

  return (
    <Screen refreshing={meals.loading} onRefresh={meals.reload}>
      <Row style={{ gap: 14, marginBottom: 18, alignItems: 'center' }}>
        <Mascot size={76} mood="cheer" bounce />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', lineHeight: 30 }}>{t('scanTitle')}</Text>
          <Text style={{ fontSize: 17, color: colors.muted, marginTop: 4, lineHeight: 24 }}>{t('scanSubtitle')}</Text>
        </View>
      </Row>

      {children.data.length > 1 && (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 17, fontWeight: '900', marginBottom: 8 }}>{t('forWhom')}</Text>
          <ChildPicker items={children.data} value={childId} onChange={setPicked} />
        </View>
      )}

      <PressScale
        onPress={() => start('camera')}
        accessibilityRole="button"
        accessibilityLabel={t('takePhoto')}
        style={{ backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 26, paddingHorizontal: 20, alignItems: 'center', marginBottom: 14, ...shadow }}
      >
        <View style={{ backgroundColor: '#ffffff33', width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="camera" size={40} color="#fff" />
        </View>
        <Text style={{ color: '#fff', fontSize: 23, fontWeight: '900', marginTop: 12 }}>{t('takePhoto')}</Text>
        <Text style={{ color: '#fff', fontSize: 16, marginTop: 4, textAlign: 'center', lineHeight: 22 }}>
          {t('scanPhotoHint')} {name}
        </Text>
      </PressScale>

      <Row style={{ gap: 12, marginBottom: 20 }}>
        <View style={{ flex: 1 }}>
          <Button title={t('choosePhoto')} icon="images" variant="secondary" onPress={() => start('library')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={t('noPhotoPick')} icon="list" variant="ghost" onPress={() => start('pick')} />
        </View>
      </Row>

      <Card>
        <Text style={{ fontSize: 20, fontWeight: '900', marginBottom: 14 }}>{t('howItWorks')}</Text>
        {HOW.map((s, i) => (
          <Row key={s.key} style={{ gap: 14, marginBottom: i < HOW.length - 1 ? 16 : 0, alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 26 }}>{s.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.primaryDark }}>
                {t('step')} {i + 1}
              </Text>
              <Text style={{ fontSize: 17, lineHeight: 24 }}>{t(s.key)}</Text>
            </View>
          </Row>
        ))}
      </Card>

      <Card tint={colors.accentSoft}>
        <Text style={{ fontSize: 17, lineHeight: 25, fontWeight: '700' }}>💡 {t('cheapPromise')}</Text>
      </Card>

      <Card>
        <Text style={{ fontSize: 19, fontWeight: '900', marginBottom: 12 }}>
          🍽️ {t('mealsTodayOf')} {name}
        </Text>
        <DiversityCard groups={groupsToday(meals.data ?? [])} compact />
        <Button title={t('logMealManually')} icon="create-outline" variant="ghost" onPress={() => router.push(`/child/${childId}/meal?action=manual`)} />
      </Card>
    </Screen>
  );
}
