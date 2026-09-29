import { router } from 'expo-router';
import React, { useState } from 'react';

import { MotherRow, RISK_ORDER } from '../components/MotherRow';
import { SyncBanner } from '../components/SyncBanner';
import { Text } from '../components/Text';
import { Button, Card, ErrorBox, Loading, Screen, Segmented, Source } from '../components/ui';
import { useAuth } from '../lib/auth';
import type { Pregnancy } from '../lib/types';
import { useApi } from '../lib/useApi';
import { colors, statusColor } from '../theme';

type Filter = 'all' | 'risk' | 'unchecked' | 'nifas';

/** Ibu hamil in the Kader's area: the most at-risk first, with filters and "Tambah ibu hamil". */
export default function Mothers() {
  const { t } = useAuth();
  const q = useApi<Pregnancy[]>('/api/pregnancies');
  const [filter, setFilter] = useState<Filter>('all');
  const all = [...(q.data ?? [])].sort((a, b) => RISK_ORDER[a.risk.key] - RISK_ORDER[b.risk.key] || b.gestational_weeks - a.gestational_weeks);
  const rows = all.filter((p) =>
    filter === 'risk' ? p.status === 'active' && p.risk.contact : filter === 'unchecked' ? p.status === 'active' && p.risk.key === 'unknown' : filter === 'nifas' ? p.status === 'delivered' : true,
  );
  return (
    <Screen refreshing={q.loading} onRefresh={q.reload}>
      <SyncBanner stale={q.stale} />
      <Button title={t('addMother')} icon="person-add" onPress={() => router.push('/mother/new')} />
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('filterAll') },
          { value: 'risk', label: t('filterRisk') },
          { value: 'unchecked', label: t('filterUnchecked') },
          { value: 'nifas', label: t('filterNifas') },
        ]}
      />
      {q.error && <ErrorBox message={q.error} onRetry={q.reload} />}
      {!q.data && q.loading && <Loading />}
      {q.data && (
        <Text style={{ color: colors.muted, fontWeight: '800', marginBottom: 8 }} accessibilityLiveRegion="polite">
          {rows.length} {t('mothersCount')}
        </Text>
      )}
      {q.data && rows.length === 0 && (
        <Card tint={statusColor.ok.bg}>
          <Text style={{ color: statusColor.ok.fg, fontWeight: '800' }}>🎉 {t('noMothersMatch')}</Text>
        </Card>
      )}
      {rows.map((p) => (
        <MotherRow key={p.id} p={p} />
      ))}
      <Source label={{ id: 'Data NutriSense (demo)', en: 'NutriSense data (demo)' }} year={new Date().getFullYear()} />
    </Screen>
  );
}
