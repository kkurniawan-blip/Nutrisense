import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { TechnicalDetails } from '../../../components/AssessmentView';
import { Card, ErrorBox, Loading, P, Screen, SourceTag } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { formatDate } from '../../../lib/fun';
import type { Child } from '../../../lib/types';
import { useApi } from '../../../lib/useApi';

/** The technical side of the latest AI result (z-scores, confidence, what weighed most), on its own screen. */
export default function Analysis() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useAuth();
  const child = useApi<Child>(`/api/children/${id}`);
  const a = child.data?.latest_assessment;
  if (!child.data) return <Screen>{child.error ? <ErrorBox message={child.error} onRetry={child.reload} /> : <Loading />}</Screen>;
  return (
    <Screen>
      {a ? (
        <Card>
          <SourceTag kind="ai" />
          <P muted>{formatDate(a.created_at, lang, true)}</P>
          <TechnicalDetails a={a} />
        </Card>
      ) : (
        <P muted>{t('notAssessed')}</P>
      )}
      <P muted style={{ fontSize: 12, textAlign: 'center' }}>{t('notDiagnosis')}</P>
    </Screen>
  );
}
