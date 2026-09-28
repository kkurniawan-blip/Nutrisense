import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Mascot } from '../../components/Mascot';
import { Text, TextInput } from '../../components/Text';
import { Chip, SourceTag, Wash } from '../../components/ui';
import { api, errorText } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { childEmoji } from '../../lib/fun';
import type { Child } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { colors, radius, shadow, Tone, tones } from '../../theme';

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
      <View style={[{ backgroundColor: '#fff', borderRadius: 18, borderBottomLeftRadius: 6, padding: 12, marginLeft: 6, flexShrink: 1, borderWidth: 1, borderColor: colors.border }, shadow]}>{children}</View>
    </View>
  );
}

/** Nuri's answer as short lines: numbered points become a small list, the first line leads. */
function Answer({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <View style={{ gap: 6 }}>
      {lines.map((l, i) => {
        const m = l.match(/^(\d+)[.)]\s*(.*)$/);
        return m ? (
          <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primaryDark }}>{m[1]}</Text>
            </View>
            <Text style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{m[2]}</Text>
          </View>
        ) : (
          <Text key={i} style={{ fontSize: 15, lineHeight: 22, fontWeight: i === 0 && lines.length > 1 ? '700' : '400' }}>
            {l}
          </Text>
        );
      })}
    </View>
  );
}

type Topic = 'growth' | 'eating' | 'symptoms' | 'development';
const TOPICS: { key: Topic; emoji: string; tone: Tone }[] = [
  { key: 'growth', emoji: '📏', tone: 'blue' },
  { key: 'eating', emoji: '🍽️', tone: 'green' },
  { key: 'symptoms', emoji: '🤒', tone: 'pink' },
  { key: 'development', emoji: '🧸', tone: 'orange' },
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
      <Wash height={300} />
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
            <View style={{ marginBottom: 14 }}>
              <View style={[{ backgroundColor: '#fff', borderRadius: 22, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border }, shadow]}>
                <Mascot size={78} mood="cheer" bounce />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: '900' }}>{t('nuriHello')}</Text>
                  <Text style={{ color: colors.muted, fontWeight: '600' }}>{t('nuriCanHelp')}</Text>
                </View>
              </View>
              <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 13, marginTop: 10, lineHeight: 18 }}>ℹ️ {t('chatDisclaimer')}</Text>
            </View>
          }
          renderItem={({ item }) =>
            item.role === 'user' ? (
              <View style={{ alignSelf: 'flex-end', backgroundColor: colors.primary, borderRadius: 18, borderBottomRightRadius: 6, padding: 12, marginBottom: 10, maxWidth: '82%' }}>
                <Text style={{ color: '#fff', fontSize: 15, lineHeight: 21, fontWeight: '600' }}>{item.content}</Text>
              </View>
            ) : (
              <BotRow>
                {item.generated_by ? <SourceTag kind="ai" /> : null}
                <Answer text={item.content} />
                {item.generated_by && (
                  <Pressable onPress={() => router.push('/guide')} accessibilityRole="button" style={{ minHeight: 36, justifyContent: 'center', marginTop: 4 }}>
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{t('seeFullGuide')} →</Text>
                  </Pressable>
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
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border }}>
          <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingBottom: 8 }}>
            {TOPICS.map((tp) => {
              const on = topic === tp.key;
              return (
                <Pressable
                  key={tp.key}
                  onPress={() => setTopic(tp.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? colors.primary : tones[tp.tone].bg }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#fff' : tones[tp.tone].fg }}>{t(`topic_${tp.key}`)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            {suggestions.map((s) => (
              <Pressable key={s} onPress={() => send(s)} accessibilityRole="button" style={{ backgroundColor: tones.lavender.bg, borderRadius: radius.pill, paddingLeft: 14, paddingRight: 10, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: colors.primaryDark, fontWeight: '700' }}>{s}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <View style={{ flexDirection: 'row', padding: 10, paddingTop: 4, gap: 8, backgroundColor: '#fff' }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('chatPlaceholder')}
            placeholderTextColor="#A09CB5"
            style={{ flex: 1, backgroundColor: '#fff', borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#E4E0F3', paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 }}
            onSubmitEditing={() => send()}
            returnKeyType="send"
          />
          <Pressable onPress={() => send()} accessibilityRole="button" accessibilityLabel={t('send')} style={{ backgroundColor: colors.primary, borderRadius: 24, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="send" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
