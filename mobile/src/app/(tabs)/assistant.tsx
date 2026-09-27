import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Mascot } from '../../components/Mascot';
import { Text, TextInput } from '../../components/Text';
import { Chip, SourceTag } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { childEmoji } from '../../lib/fun';
import type { Child } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors, radius, shadow } from '../../theme';

interface Msg {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  generated_by?: string | null;
}

function TypingDots() {
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.3)));
  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [dots]);
  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 4 }}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lavender, opacity: d }} />
      ))}
    </View>
  );
}

function BotRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, maxWidth: '88%' }}>
      <Mascot size={36} />
      <View style={{ backgroundColor: '#fff', borderRadius: 20, borderBottomLeftRadius: 6, padding: 12, marginLeft: 6, flexShrink: 1, ...shadow }}>{children}</View>
    </View>
  );
}

type Topic = 'growth' | 'eating' | 'symptoms' | 'development';
const TOPICS: { key: Topic; emoji: string }[] = [
  { key: 'growth', emoji: '📏' },
  { key: 'eating', emoji: '🍽️' },
  { key: 'symptoms', emoji: '🤒' },
  { key: 'development', emoji: '🧸' },
];
/** Suggested questions per topic; {n} is replaced with the child's first name. */
const QUESTIONS: Record<'id' | 'en', Record<Topic, string[]>> = {
  id: {
    growth: ['Kenapa berat {n} tidak naik?', 'Apakah tinggi {n} normal untuk usianya?', 'Seberapa sering {n} perlu ditimbang?'],
    eating: ['Apa menu untuk anak susah makan?', 'Makanan murah apa yang tinggi protein?', 'Berapa kali {n} harus makan sehari?'],
    symptoms: ['{n} diare, apa yang harus saya lakukan?', '{n} demam, kapan harus ke Puskesmas?', 'Bagaimana tahu {n} kurang minum?'],
    development: ['Apa yang biasanya bisa dilakukan anak seusia {n}?', 'Permainan apa yang bagus untuk {n}?', 'Bagaimana membantu {n} belajar bicara?'],
  },
  en: {
    growth: ["Why isn't {n} gaining weight?", "Is {n}'s height normal for their age?", 'How often should {n} be weighed?'],
    eating: ['What can I cook for a picky eater?', 'Which cheap foods are high in protein?', 'How many meals a day does {n} need?'],
    symptoms: ['{n} has diarrhoea, what should I do?', '{n} has a fever, when should we go to the Puskesmas?', 'How can I tell if {n} is dehydrated?'],
    development: ['What can children {n}\'s age usually do?', 'Which games are good for {n}?', 'How can I help {n} learn to talk?'],
  },
};

export default function Assistant() {
  const { t, lang } = useAuth();
  const { child: childParam } = useLocalSearchParams<{ child?: string }>();
  const children = useApi<Child[]>('/api/children');
  const [chosen, setChosen] = useState<number | null | undefined>(undefined);
  const [topic, setTopic] = useState<Topic>('growth');
  // Default to the child passed in, else the first child; "general" is an explicit choice (null).
  const childId = chosen !== undefined ? chosen : childParam ? Number(childParam) : (children.data?.[0]?.id ?? null);
  const setChildId = setChosen;
  const childName = children.data?.find((c) => c.id === childId)?.name.split(' ')[0];
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);

  useEffect(() => {
    api<Msg[]>(`/api/assistant/history${childId ? `?child_id=${childId}` : ''}`)
      .then(setMessages)
      .catch(() => setMessages([]));
  }, [childId]);

  const send = async (override?: string) => {
    const msg = (override ?? text).trim();
    if (!msg || busy) return;
    setText('');
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', content: msg }]);
    setBusy(true);
    try {
      const r = await api<{ reply: string; generated_by: string }>('/api/assistant/chat', { body: { message: msg, child_id: childId }, timeoutMs: 120000 });
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', content: r.reply, generated_by: r.generated_by }]);
    } catch (e) {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: 'assistant', content: `😥 ${errorText(e)}` }]);
    } finally {
      setBusy(false);
    }
  };

  const suggestions = QUESTIONS[lang][topic].map((q) => q.split('{n}').join(childName ?? (lang === 'id' ? 'anak saya' : 'my child')));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 4 }}>
          <Chip emoji="💬" label={t('general')} selected={childId === null} onPress={() => setChildId(null)} />
          {(children.data ?? []).slice(0, 6).map((c) => (
            <Chip key={c.id} emoji={childEmoji(c.sex, c.age_months)} label={c.name.split(' ')[0]} selected={childId === c.id} onPress={() => setChildId(c.id)} />
          ))}
        </View>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <Mascot size={90} mood="cheer" bounce />
              <View style={{ backgroundColor: colors.lavenderSoft, borderRadius: 20, padding: 14, marginTop: 8 }}>
                <Text style={{ textAlign: 'center', fontWeight: '700', lineHeight: 21 }}>{t('chatIntro')}</Text>
              </View>
              <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 13, marginTop: 8, lineHeight: 18 }}>ℹ️ {t('chatDisclaimer')}</Text>
            </View>
          }
          renderItem={({ item }) =>
            item.role === 'user' ? (
              <View style={{ alignSelf: 'flex-end', backgroundColor: colors.primary, borderRadius: 20, borderBottomRightRadius: 6, padding: 12, marginBottom: 10, maxWidth: '82%' }}>
                <Text style={{ color: '#fff', fontSize: 15, lineHeight: 21, fontWeight: '600' }}>{item.content}</Text>
              </View>
            ) : (
              <BotRow>
                {item.generated_by ? <SourceTag kind="ai" /> : null}
                <Text style={{ fontSize: 15, lineHeight: 22 }}>{item.content}</Text>
                {item.generated_by && (
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{item.generated_by === 'claude' ? `✨ ${t('aiBy_claude')}` : '📚 FAQ'}</Text>
                )}
              </BotRow>
            )
          }
          ListFooterComponent={
            busy ? (
              <BotRow>
                <TypingDots />
              </BotRow>
            ) : null
          }
        />
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, gap: 6, paddingBottom: 6 }}>
          {TOPICS.map((tp) => {
            const on = topic === tp.key;
            return (
              <Pressable
                key={tp.key}
                onPress={() => setTopic(tp.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{ flex: 1, minHeight: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.lavender : '#fff', borderWidth: 2, borderColor: on ? colors.lavender : colors.lavenderSoft }}
              >
                <Text style={{ fontSize: 16 }}>{tp.emoji}</Text>
                <Text style={{ fontSize: 12, fontWeight: '800', color: on ? '#fff' : colors.text }}>{t(`topic_${tp.key}`)}</Text>
              </Pressable>
            );
          })}
        </View>
        <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
          {suggestions.map((s) => (
            <Pressable key={s} onPress={() => send(s)} accessibilityRole="button" style={{ backgroundColor: '#fff', borderRadius: radius.pill, borderWidth: 2, borderColor: colors.lavenderSoft, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: colors.lavender, fontWeight: '800' }}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', padding: 10, gap: 8, backgroundColor: '#fff', ...shadow }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('chatPlaceholder')}
            placeholderTextColor="#BCAEB6"
            style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 }}
            onSubmitEditing={() => send()}
            returnKeyType="send"
          />
          <Pressable onPress={() => send()} accessibilityRole="button" accessibilityLabel={t('send')} style={{ backgroundColor: colors.primary, borderRadius: 24, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
