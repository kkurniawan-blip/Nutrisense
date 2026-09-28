import React from 'react';
import { View } from 'react-native';

import { useAuth } from '../lib/auth';
import { childEmoji, formatAge } from '../lib/fun';
import type { Child } from '../lib/types';
import { colors, radius } from '../theme';
import { Text } from './Text';
import { PressScale, Row } from './ui';

export function ChildPicker({ items, value, onChange }: { items: Child[]; value: number | null; onChange: (id: number) => void }) {
  const { lang } = useAuth();
  return (
    <Row style={{ flexWrap: 'wrap', marginBottom: 12 }}>
      {items.map((c) => {
        const on = c.id === value;
        return (
          <PressScale
            key={c.id}
            onPress={() => onChange(c.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 6,
              paddingLeft: 6,
              paddingRight: 14,
              borderRadius: radius.pill,
              backgroundColor: on ? colors.ink : '#fff',
              borderWidth: 1.5,
              borderColor: on ? colors.ink : colors.border,
            }}
          >
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: on ? '#ffffff33' : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 18 }}>{childEmoji(c.sex, c.age_months)}</Text>
            </View>
            <View>
              <Text style={{ fontWeight: '800', color: on ? '#fff' : colors.text }}>{c.name.split(' ')[0]}</Text>
              <Text style={{ fontSize: 12, color: on ? '#ffffffcc' : colors.muted }}>{formatAge(c.age_months, lang)}</Text>
            </View>
          </PressScale>
        );
      })}
    </Row>
  );
}
