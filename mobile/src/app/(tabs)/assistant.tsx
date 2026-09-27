import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Child } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors } from '../../theme';

interface Msg {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  generated_by?: string | null;
}

export default function Assistant() {
  const { t } = useAuth();
  const children = useApi<Child[]>('/api/children');
  const [childId, setChildId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);

  useEffect(() => {
    api<Msg[]>(`/api/assistant/history${childId ? `?child_id=${childId}` : ''}`)
      .then(setMessages)
      .catch(() => setMessages([]));
  }, [childId]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || busy) return;
    setText('');
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', content: msg }]);
    setBusy(true);
    try {
      const r = await api<{ reply: string; generated_by: string }>('/api/assistant/chat', { body: { message: msg, child_id: childId }, timeoutMs: 120000 });
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', content: r.reply, generated_by: r.generated_by }]);
    } catch (e) {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: 'assistant', content: `⚠️ ${errorText(e)}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 8, borderBottomWidth: 1, borderColor: colors.border }}>
          <Chip label={t('general')} selected={childId === null} onPress={() => setChildId(null)} />
          {(children.data ?? []).slice(0, 6).map((c) => (
            <Chip key={c.id} label={c.name.split(' ')[0]} selected={childId === c.id} onPress={() => setChildId(c.id)} />
          ))}
        </View>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            <View style={{ backgroundColor: colors.primarySoft, borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <Text style={{ color: colors.primaryDark }}>{t('chatIntro')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={{
                alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
                backgroundColor: item.role === 'user' ? colors.primary : colors.card,
                borderRadius: 14,
                padding: 10,
                marginBottom: 8,
                maxWidth: '85%',
                borderWidth: item.role === 'user' ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: item.role === 'user' ? '#fff' : colors.text, fontSize: 15, lineHeight: 21 }}>{item.content}</Text>
              {item.generated_by && (
                <Text style={{ color: colors.muted, fontSize: 10, marginTop: 4 }}>{item.generated_by === 'claude' ? t('aiBy_claude') : 'FAQ'}</Text>
              )}
            </View>
          )}
        />
        {busy && <ActivityIndicator color={colors.primary} style={{ marginBottom: 6 }} />}
        <View style={{ flexDirection: 'row', padding: 8, gap: 8, borderTopWidth: 1, borderColor: colors.border, backgroundColor: '#fff' }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('chatPlaceholder')}
            placeholderTextColor="#98A6A1"
            style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, color: colors.text }}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable onPress={send} style={{ backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 16, justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{t('send')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
