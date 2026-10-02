import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { ChildPicker } from '../../components/ChildPicker';
import { DiversityCard } from '../../components/Diversity';
import { Mascot } from '../../components/Mascot';
import { Text } from '../../components/Text';
import { Button, Card, Empty, Gradient, Loading, MoreLink, PressScale, Row, Screen } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { groupsToday } from '../../lib/fun';
import type { Child, Meal } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors, radius, shadow } from '../../theme';
import { Icon } from '../../components/Icon';


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
      <Row style={{ gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <Mascot size={56} mood="cheer" bounce />
        <Text style={{ flex: 1, fontSize: 21, fontWeight: '900' }}>{t('scanTitle')}</Text>
      </Row>

      {children.data.length > 1 && (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.muted, marginBottom: 8 }}>{t('forWhom')}</Text>
          <ChildPicker items={children.data} value={childId} onChange={setPicked} />
        </View>
      )}

      {/* One big primary action */}
      <PressScale
        onPress={() => start('camera')}
        accessibilityRole="button"
        accessibilityLabel={t('takePhoto')}
        style={[{ backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 34, paddingHorizontal: 20, alignItems: 'center', marginBottom: 12, overflow: 'hidden' }, shadow]}
      >
        <Gradient from={colors.primaryLight} to={colors.primary} r={radius.lg} />
        <View style={{ backgroundColor: '#ffffff33', width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ backgroundColor: '#fff', width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera" size={32} color={colors.primary} />
          </View>
        </View>
        <Text style={{ color: '#fff', fontSize: 21, fontWeight: '900', marginTop: 14 }}>{t('takePhoto')}</Text>
        <Text style={{ color: '#ffffffe6', fontSize: 14, marginTop: 2 }}>
          {t('forChild')} {name}
        </Text>
      </PressScale>

      <Button title={t('choosePhoto')} icon="images" variant="secondary" onPress={() => start('library')} />
      <View style={{ marginBottom: 12 }}>
        <MoreLink center label={t('noPhotoPick')} onPress={() => start('pick')} />
      </View>

      {/* Today's plate, one line */}
      <Card>
        <DiversityCard groups={groupsToday(meals.data ?? [])} compact />
        <MoreLink label={t('logMealManually')} onPress={() => router.push(`/child/${childId}/meal?action=manual`)} />
      </Card>
    </Screen>
  );
}
