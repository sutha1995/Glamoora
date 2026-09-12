import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native';
import { TopBar } from '../../components/topbar';
import { Btn, Chip, Stars } from '../../components/ui';
import { AREAS } from '../../data/seed';
import { addPortfolioItem, upsertService, catOf, serviceOf, myProfile, reviewsOf, portfolioOf } from '../../db/core';
import { encodeFilters } from '../../ai/nlsearch';
import {
  askAssistant,
  customerChips,
  draftCaption,
  draftServiceDescription,
  providerChips,
  scoreProfile,
  suggestBundles,
  summariseReviews,
  type AssistantContext,
  type AssistantResultRow,
  type BundleSuggestion,
} from '../../ai/assistant';
import type { SearchCenter, SearchFilters } from '../../domain/search';
import { useApp } from '../../store';
import { C } from '../../theme';
import { fmtRM, uid } from '../../utils';

/* ------------------------------------------------------------------ */

type ChipSpec = { label: string; prompt?: string; action?: Action };

type Action =
  | { kind: 'handoff'; label: string; filters: SearchFilters; center: SearchCenter }
  | { kind: 'pickService'; label: string; then: 'describe' | 'caption' }
  | { kind: 'describe'; label: string; serviceId: string }
  | { kind: 'applyDesc'; label: string; serviceId: string; text: string }
  | { kind: 'caption'; label: string; serviceId: string }
  | { kind: 'addCaption'; label: string; serviceId: string; caption: string }
  | { kind: 'bundles' }
  | { kind: 'createBundle'; label: string; bundle: BundleSuggestion }
  | { kind: 'reviewSummary' }
  | { kind: 'profileScore' }
  | { kind: 'open'; label: string; href: string };

interface Msg {
  id: string;
  from: 'user' | 'ai';
  text: string;
  rows?: { label: string; value: string }[];
  results?: AssistantResultRow[];
  chips?: ChipSpec[];
  actions?: Action[];
  /** Service text the provider can copy or apply, rendered in a monospace-ish block. */
  draft?: string;
}

/** Deep links: /assistant?tool=describe|caption|bundle|reviews|score */
const TOOL_ACTIONS: Record<string, Action> = {
  describe: { kind: 'pickService', label: 'Write a service description for me', then: 'describe' },
  caption: { kind: 'pickService', label: 'Draft a portfolio caption', then: 'caption' },
  bundle: { kind: 'bundles' },
  bundles: { kind: 'bundles' },
  reviews: { kind: 'reviewSummary' },
  score: { kind: 'profileScore' },
};

const WELCOME_CUSTOMER = `I am the Glamoora assistant. I run entirely on your device — no account data leaves this phone, and I only ever quote prices, ratings and availability that exist in the app.\n\nAsk in your own words, for example:\n“nail service under RM100 near me this Saturday”\nor ask how something works: “how do I cancel?”, “what does verified mean?”`;

const WELCOME_PROVIDER = `I am the Glamoora assistant, and for your studio I can write:\n\n• a service description from your real price, duration and location\n• a portfolio caption with tags\n• bundle ideas from your existing services\n• a summary of your reviews, with what people praise and what they flag\n\nI also answer questions about verification, hours, slots, bookings and payments — always from the actual rules in this app, never invented.`;

export default function AssistantScreen() {
  const app = useApp();
  const u = app.user;
  const params = useLocalSearchParams<{ q?: string; tool?: string; svc?: string }>();
  const profile = u?.role === 'provider' ? myProfile() : undefined;
  const scroll = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const v = app.version;

  const center: SearchCenter = useMemo(
    () => ({
      lat: u?.lat ?? AREAS[0].lat,
      lng: u?.lng ?? AREAS[0].lng,
      label: (u?.area || AREAS[0].name).split(',')[0],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [u?.id, u?.lat, u?.lng, u?.area, v]
  );

  const ctx: AssistantContext = useMemo(
    () => ({ db: app.db, user: u, center, areas: AREAS }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.db, u, center, v]
  );

  /** Arriving from Home with ?q=, or from the dashboard with ?tool=. */
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!u) return;
    const q = (params.q || '').trim();
    const tool = (params.tool || '').trim();
    const svc = (params.svc || '').trim();
    const key = q ? `q:${q}` : tool ? `tool:${tool}:${svc}` : '';
    if (!key || asked.current === key) return;
    asked.current = key;
    if (q) {
      send(q);
      return;
    }
    // A specific service arrived with the tool: skip the picker.
    if (svc && tool === 'describe') {
      runAction({ kind: 'describe', label: 'Write a service description for me', serviceId: svc });
      return;
    }
    if (svc && tool === 'caption') {
      runAction({ kind: 'caption', label: 'Draft a portfolio caption', serviceId: svc });
      return;
    }
    const action = TOOL_ACTIONS[tool];
    if (action) runAction(action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q, params.tool, params.svc, u?.id]);

  if (!u) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const isProvider = u.role === 'provider';
  const welcome = isProvider ? WELCOME_PROVIDER : WELCOME_CUSTOMER;
  const shown: Msg[] = msgs.length ? msgs : [{ id: 'welcome', from: 'ai', text: welcome, chips: starterChips(isProvider, !!profile) }];

  const push = (...items: Msg[]) => {
    setMsgs((m) => [...m, ...items]);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
  };

  function send(text: string) {
    const q = text.trim();
    if (!q) return;
    const reply = askAssistant(q, ctx);
    push(
      { id: uid('m'), from: 'user', text: q },
      {
        id: uid('m'),
        from: 'ai',
        text: reply.text,
        rows: reply.rows,
        results: reply.results,
        chips: chipSpecs(reply.chips, !!(profile && isProvider)),
        actions: reply.handoff ? [{ kind: 'handoff', label: 'Show in Discover', filters: reply.handoff.filters, center: reply.handoff.center }] : undefined,
      }
    );
    setDraft('');
    app.track(reply.kind === 'search' ? 'ai_search' : 'ai_assistant', {
      q: q.slice(0, 60),
      intent: reply.intent,
      matches: reply.results?.length ?? 0,
    });
  }

  function runAction(a: Action) {
    if (!profile && a.kind !== 'handoff' && a.kind !== 'open') {
      push({ id: uid('m'), from: 'ai', text: 'That tool is for studio accounts. Sign in as a provider to use it.', chips: starterChips(isProvider, false) });
      return;
    }
    switch (a.kind) {
      case 'handoff':
        app.track('ai_search', { intent: 'handoff', matches: 1 });
        router.push({ pathname: '/discover', params: { ai: encodeFilters(a.filters, a.center) } });
        break;
      case 'open':
        router.push(a.href as never);
        break;
      case 'pickService': {
        const svcs = profile ? app.db.services.filter((s) => s.providerId === profile.id && s.active) : [];
        push(
          { id: uid('m'), from: 'user', text: a.label },
          {
            id: uid('m'),
            from: 'ai',
            text: svcs.length
              ? `Which service? I will build the ${a.then === 'describe' ? 'description' : 'caption'} from its real price, duration and location.`
              : 'You have no active services yet — add one in Services first, then I can write for it.',
            chips: svcs.map((s) => ({
              label: `${s.name} · ${fmtRM(s.price)}`,
              action: a.then === 'describe' ? { kind: 'describe', label: `Describe ${s.name}`, serviceId: s.id } : { kind: 'caption', label: `Caption for ${s.name}`, serviceId: s.id },
            })),
            actions: svcs.length ? undefined : [{ kind: 'open', label: 'Open Services', href: '/services' }],
          }
        );
        break;
      }
      case 'describe': {
        const s = serviceOf(a.serviceId);
        if (!s || !profile) return;
        const text = draftServiceDescription({
          serviceName: s.name,
          categoryName: catOf(s.categoryId)?.name || 'beauty',
          price: s.price,
          duration: s.duration,
          locationType: s.locationType,
          studioName: profile.displayName,
        });
        push(
          { id: uid('m'), from: 'user', text: a.label },
          {
            id: uid('m'),
            from: 'ai',
            text: `Here is a description for ${s.name}, built from your actual price (${fmtRM(s.price)}), duration (${s.duration} min) and location setting. Nothing is saved until you apply it.`,
            draft: text,
            actions: [
              { kind: 'applyDesc', label: 'Apply to this service', serviceId: s.id, text },
              { kind: 'open', label: 'Open Services', href: '/services' },
            ],
          }
        );
        app.track('ai_assistant', { intent: 'draft_service_description', providerId: profile.id });
        break;
      }
      case 'applyDesc': {
        const s = serviceOf(a.serviceId);
        if (!s) return;
        upsertService({ ...s, desc: a.text });
        app.bump();
        app.showToast('Service description updated');
        push({ id: uid('m'), from: 'ai', text: `Saved to ${s.name}. It is live in search immediately — the description is part of what customers match against.`, chips: starterChips(true, true) });
        break;
      }
      case 'caption': {
        const s = serviceOf(a.serviceId);
        if (!s || !profile) return;
        const count = portfolioOf(profile.id).filter((p) => p.serviceId === s.id).length;
        const { caption, tags } = draftCaption({ serviceName: s.name, categoryName: catOf(s.categoryId)?.name || 'beauty', index: count, studioName: profile.displayName });
        push(
          { id: uid('m'), from: 'user', text: a.label },
          {
            id: uid('m'),
            from: 'ai',
            text: 'A caption for this service, plus tags. Keep captions factual — the moderation queue removes work that is not yours.',
            draft: `${caption}\n\n#${tags.join(' #')}`,
            actions: [
              { kind: 'addCaption', label: 'Add to my portfolio', serviceId: s.id, caption },
              { kind: 'open', label: 'Open Studio', href: '/studio' },
            ],
          }
        );
        app.track('ai_assistant', { intent: 'draft_caption', providerId: profile.id });
        break;
      }
      case 'addCaption': {
        if (!profile) return;
        const s = serviceOf(a.serviceId);
        addPortfolioItem(profile.id, a.serviceId, s?.categoryId || profile.categoryIds[0] || 'c1', a.caption);
        app.bump();
        app.showToast('Added to your portfolio');
        push({ id: uid('m'), from: 'ai', text: 'Added. Portfolio images are the first thing a customer scans — keep them unedited and your own work.', chips: starterChips(true, true) });
        break;
      }
      case 'bundles': {
        if (!profile) return;
        const bundles = suggestBundles(app.db, profile.id, (id) => catOf(id)?.name || 'beauty');
        push(
          { id: uid('m'), from: 'user', text: 'Suggest a bundle from my services' },
          bundles.length
            ? {
                id: uid('m'),
                from: 'ai',
                text: `Three bundle ideas from your own catalogue, priced at a 10% saving rounded to the nearest RM5 — honest maths, no invented discounts.`,
                rows: bundles.map((b) => ({
                  label: b.title,
                  value: `${fmtRM(b.normalPrice)} → ${fmtRM(b.bundlePrice)} (save ${fmtRM(b.saving)}) · ${b.duration} min · ${b.rationale}`,
                })),
                chips: bundles.map((b) => ({ label: `Create “${b.title}”`, action: { kind: 'createBundle', label: `Create ${b.title}`, bundle: b } })),
              }
            : {
                id: uid('m'),
                from: 'ai',
                text: 'You need at least two active services (that together fit inside five hours) before I can suggest a bundle.',
                actions: [{ kind: 'open', label: 'Open Services', href: '/services' }],
              }
        );
        app.track('ai_assistant', { intent: 'suggest_bundle' }, { providerId: profile.id });
        break;
      }
      case 'createBundle': {
        if (!profile) return;
        const b = a.bundle;
        const first = serviceOf(b.serviceIds[0]);
        upsertService({
          providerId: profile.id,
          categoryId: first?.categoryId || profile.categoryIds[0] || 'c1',
          name: b.title,
          desc: `${b.services.join(' + ')} in one appointment. ${b.rationale} Normally ${fmtRM(b.normalPrice)}, bundled at ${fmtRM(b.bundlePrice)} — you save ${fmtRM(b.saving)}. Total time about ${b.duration} minutes.`,
          price: b.bundlePrice,
          duration: b.duration,
          locationType: first?.locationType || 'provider',
          active: true,
        });
        app.bump();
        app.showToast('Bundle created as a service');
        push({ id: uid('m'), from: 'ai', text: `“${b.title}” is now a bookable service at ${fmtRM(b.bundlePrice)}. Check the duration against your daily hours — a ${b.duration}-minute service will not be offered in the last hour of your day.`, chips: starterChips(true, true) });
        break;
      }
      case 'reviewSummary': {
        if (!profile) return;
        const rs = summariseReviews(reviewsOf(profile.id), profile.displayName);
        push(
          { id: uid('m'), from: 'user', text: 'Summarise my reviews' },
          {
            id: uid('m'),
            from: 'ai',
            text: rs.strengths.length || rs.watch.length
              ? `${rs.headline}\n\nThis is a keyword count over your actual review text — no invented sentiment.${rs.bestQuote ? `\n\nMost positive: ${rs.bestQuote}` : ''}${rs.worstQuote ? `\n\nWorth reading: ${rs.worstQuote}` : ''}`
              : rs.headline,
            rows: [
              { label: 'Praised for', value: rs.strengths.length ? rs.strengths.join(', ') : 'not enough text yet' },
              { label: 'Flagged', value: rs.watch.length ? rs.watch.join(', ') : 'nothing recurring' },
              ...rs.distribution.map((d) => ({ label: `${d.star}★`, value: `${d.count} review${d.count === 1 ? '' : 's'}` })),
            ],
            chips: [{ label: rs.watch.length ? 'How do I get more bookings?' : 'Suggest a bundle from my services' }],
          }
        );
        app.track('ai_assistant', { intent: 'review_summary', providerId: profile.id });
        break;
      }
      case 'profileScore': {
        if (!profile) return;
        const sc = scoreProfile(app.db, profile.id);
        push(
          { id: uid('m'), from: 'user', text: 'How complete is my studio profile?' },
          {
            id: uid('m'),
            from: 'ai',
            text: sc.tips.length
              ? `Profile strength: ${sc.score}/100. These are the same checks the verification queue uses, plus what actually moves bookings:\n\n${sc.tips.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
              : `Profile strength: ${sc.score}/100 — nothing obvious is missing. Keep photos fresh and answer requests quickly; that is what moves you up the recommended list now.`,
            rows: [{ label: 'Score', value: `${sc.score}/100` }, { label: 'Status', value: profile.verification }],
            actions: [{ kind: 'open', label: 'Open Studio', href: '/studio' }],
            chips: [{ label: 'How do I get verified?' }, { label: 'How do I get more bookings?' }],
          }
        );
        break;
      }
    }
  }

  const quickActions: ChipSpec[] = isProvider && profile
    ? [
        { label: '✍️ Write a service description', action: { kind: 'pickService', label: 'Write a service description for me', then: 'describe' } },
        { label: '🖼️ Portfolio caption', action: { kind: 'pickService', label: 'Draft a portfolio caption', then: 'caption' } },
        { label: '🎁 Suggest a bundle', action: { kind: 'bundles' } },
        { label: '⭐ Summarise my reviews', action: { kind: 'reviewSummary' } },
        { label: '📈 Profile strength', action: { kind: 'profileScore' } },
      ]
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar title="Assistant" sub="On-device AI · nothing leaves your phone" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {shown.map((m) => (
            <Bubble key={m.id} m={m} onChip={(c) => (c.action ? runAction(c.action) : send(c.prompt || c.label))} onAction={runAction} />
          ))}

          {quickActions.length ? (
            <View style={{ marginTop: 6 }}>
              <Text style={hintLabel}>Studio tools</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {quickActions.map((c) => (
                  <Chip key={c.label} onPress={() => (c.action ? runAction(c.action) : send(c.prompt || c.label))}>
                    {c.label}
                  </Chip>
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Ionicons name="lock-closed" size={12} color={C.ink3} />
            <Text style={{ flex: 1, fontSize: 10.5, color: C.ink3, lineHeight: 15 }}>
              Deterministic, offline AI. No API key, no network call, and no medical advice — for anything health-related, see a professional.
            </Text>
          </View>
        </ScrollView>

        <View style={inputBar}>
          <TextInput
            style={input}
            placeholder={isProvider ? 'Ask, or pick a studio tool above…' : 'e.g. lash extensions under RM180 near me tomorrow evening'}
            placeholderTextColor={C.ink3}
            value={draft}
            onChangeText={setDraft}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => send(draft)}
            blurOnSubmit={false}
          />
          <Pressable
            onPress={() => send(draft)}
            disabled={!draft.trim()}
            style={[sendBtn, !draft.trim() && { backgroundColor: C.line2 }]}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <Ionicons name="arrow-up" size={19} color={draft.trim() ? '#fff' : C.ink3} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ------------------------------------------------------------------ */

/** Chips that name a studio tool become tappable actions, not just prompts. */
const TOOL_BY_LABEL: Record<string, Action> = {
  'Write a service description for me': { kind: 'pickService', label: 'Write a service description for me', then: 'describe' },
  'Portfolio caption': { kind: 'pickService', label: 'Draft a portfolio caption', then: 'caption' },
  'Suggest a bundle from my services': { kind: 'bundles' },
  'Suggest a bundle': { kind: 'bundles' },
  'Summarise my reviews': { kind: 'reviewSummary' },
  'How complete is my studio profile?': { kind: 'profileScore' },
};

function chipSpecs(labels: string[], canAct: boolean): ChipSpec[] {
  return labels.map((label) => (canAct && TOOL_BY_LABEL[label] ? { label, action: TOOL_BY_LABEL[label] } : { label }));
}

function starterChips(isProvider: boolean, hasProfile: boolean): ChipSpec[] {
  return chipSpecs(isProvider ? providerChips() : customerChips(false), hasProfile);
}

function Bubble({ m, onChip, onAction }: { m: Msg; onChip: (c: ChipSpec) => void; onAction: (a: Action) => void }) {
  const mine = m.from === 'user';
  return (
    <View style={{ marginBottom: 12, alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View style={mine ? userBubble : aiBubble}>
        {!mine && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: m.text ? 6 : 0 }}>
            <Ionicons name="sparkles" size={12} color={C.brand700} />
            <Text style={{ fontSize: 10, fontWeight: '800', color: C.brand700, letterSpacing: 0.6, textTransform: 'uppercase' }}>Glamoora AI</Text>
          </View>
        )}
        {!!m.text && <Text style={mine ? userText : aiText}>{m.text}</Text>}

        {m.rows?.length ? (
          <View style={{ marginTop: 9, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, gap: 6 }}>
            {m.rows.map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={{ width: 108, fontSize: 11, fontWeight: '700', color: C.ink3 }}>{r.label}</Text>
                <Text style={{ flex: 1, fontSize: 11.5, color: C.ink2, lineHeight: 16 }}>{r.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {m.draft ? (
          <View style={{ marginTop: 9, backgroundColor: C.brand50, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.brand100 }}>
            <Text style={{ fontSize: 12, color: C.ink, lineHeight: 18 }}>{m.draft}</Text>
          </View>
        ) : null}

        {m.results?.length ? (
          <View style={{ marginTop: 9, gap: 7 }}>
            {m.results.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push({ pathname: '/provider/[id]', params: { id: r.id } })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.bg, borderRadius: 11, padding: 9, borderWidth: 1, borderColor: C.line }}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.ink, flexShrink: 1 }} numberOfLines={1}>
                      {r.name}
                    </Text>
                    {r.verified ? <Ionicons name="checkmark-circle" size={13} color={C.green} /> : null}
                  </View>
                  <Text style={{ fontSize: 10.5, color: C.ink3, marginTop: 1 }} numberOfLines={1}>
                    {r.sub}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {r.rating ? <Stars n={r.rating} size={10} /> : null}
                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: C.ink2, marginTop: 2 }}>
                    {r.price ? `from ${fmtRM(r.price)}` : '—'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {m.actions?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
            {m.actions.map((a) => (
              <Btn key={labelOf(a)} label={'label' in a ? a.label : labelOf(a)} variant={a.kind === 'handoff' || a.kind === 'applyDesc' || a.kind === 'createBundle' ? 'p' : 'o'} size="xs" onPress={() => onAction(a)} />
            ))}
          </View>
        ) : null}

        {m.chips?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {m.chips.map((c) => (
              <Chip key={c.label} onPress={() => onChip(c)}>
                {c.label}
              </Chip>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function labelOf(a: Action): string {
  switch (a.kind) {
    case 'bundles':
      return 'Bundle ideas';
    case 'reviewSummary':
      return 'Review summary';
    case 'profileScore':
      return 'Profile strength';
    default:
      return 'label' in a ? a.label : 'Go';
  }
}

const userBubble: ViewStyle = { maxWidth: '86%', backgroundColor: C.plum, borderRadius: 15, borderBottomRightRadius: 5, paddingHorizontal: 12, paddingVertical: 9 };
const aiBubble: ViewStyle = { maxWidth: '94%', backgroundColor: C.white, borderRadius: 15, borderBottomLeftRadius: 5, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.line2 };
const userText: TextStyle = { fontSize: 13.5, color: '#fff', lineHeight: 20 };
const aiText: TextStyle = { fontSize: 13, color: C.ink, lineHeight: 20 };
const hintLabel: TextStyle = { fontSize: 10.5, fontWeight: '800', color: C.ink3, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 };
const inputBar: ViewStyle = { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, paddingBottom: Platform.OS === 'ios' ? 22 : 10, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white };
const input: TextStyle = { flex: 1, maxHeight: 96, minHeight: 42, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line2, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13.5, color: C.ink };
const sendBtn: ViewStyle = { width: 42, height: 42, borderRadius: 13, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center' };
