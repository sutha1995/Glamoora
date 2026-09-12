/**
 * Moderation queue (PRD Phase 15) — reports, content removal, suspensions.
 * Every action goes through the repository so the same rules (and audit
 * trail) apply whichever backend is wired in.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { repo } from '../db';
import type { ReportAction } from '../db/repository';
import type { Report } from '../types';
import { useApp } from '../store';
import { C, SERIF } from '../theme';
import { fmtDate, timeAgo } from '../utils';
import { Avatar, Btn, Card, Chip, Empty, Note, Pill, Row, SectionTitle, Stars } from './ui';

const TARGET_ICON: Record<Report['targetType'], keyof typeof Ionicons.glyphMap> = {
  provider: 'person',
  portfolio: 'images',
  review: 'star',
};

export function ReportsPanel() {
  const app = useApp();
  const d = app.db;
  const v = app.version;
  const [acting, setActing] = useState<string | null>(null);

  const groups = useMemo(() => {
    const open = d.reports.filter((r) => r.status === 'open');
    const closed = d.reports.filter((r) => r.status !== 'open');
    return { open, closed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.reports, v]);

  const describe = (r: Report) => {
    const provider = d.profiles.find((p) => p.id === r.providerId);
    if (r.targetType === 'provider') {
      return { title: provider?.displayName || 'Unknown studio', sub: provider?.addr || '', extra: provider ? `★ ${provider.avg.toFixed(1)} (${provider.reviewCount})` : '' };
    }
    if (r.targetType === 'portfolio') {
      const item = d.portfolio.find((x) => x.id === r.targetId);
      return { title: item?.caption || 'Portfolio item', sub: provider?.displayName || '', extra: item ? 'Artwork ' + item.art : 'Content already removed' };
    }
    const review = d.reviews.find((x) => x.id === r.targetId);
    const customer = review ? d.users.find((u) => u.id === review.customerId) : undefined;
    return {
      title: review ? `Review by ${customer?.name || 'a customer'}` : 'Review',
      sub: provider?.displayName || '',
      extra: review ? `★ ${review.rating} · “${review.comment.slice(0, 60)}${review.comment.length > 60 ? '…' : ''}”` : 'Content already removed',
    };
  };

  const act = (r: Report, action: ReportAction, status: Report['status'], resolution: string) => {
    const res = repo.resolveReport(r.id, resolution, action, status);
    if (res.err) {
      app.showToast(res.err);
      return;
    }
    setActing(null);
    app.bump();
    app.showToast(status === 'dismissed' ? 'Report dismissed' : action === 'suspend_provider' ? 'Studio suspended' : action === 'remove_content' ? 'Content removed' : 'Report resolved');
  };

  return (
    <View>
      <SectionTitle title="Open reports" />
      {groups.open.length ? (
        groups.open.map((r) => {
          const info = describe(r);
          const reporter = d.users.find((u) => u.id === r.reporterId);
          const isOpen = acting === r.id;
          return (
            <Card key={r.id} style={{ marginBottom: 10 }}>
              <Row style={{ gap: 10, alignItems: 'flex-start' }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.redBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={TARGET_ICON[r.targetType]} size={17} color={C.red} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, color: C.plum, fontWeight: '700' }} numberOfLines={1}>{r.reason}</Text>
                  <Text style={{ fontSize: 11.5, color: C.ink3 }} numberOfLines={1}>
                    {r.targetType} · {info.title} {info.sub ? '· ' + info.sub : ''}
                  </Text>
                  {r.detail ? <Text style={{ fontSize: 12.5, color: C.ink2, marginTop: 5 }}>{r.detail}</Text> : null}
                  {info.extra ? <Text style={{ fontSize: 11.5, color: C.ink3, marginTop: 3 }} numberOfLines={2}>{info.extra}</Text> : null}
                  <Text style={{ fontSize: 10.5, color: C.ink3, marginTop: 5 }}>
                    Reported by {reporter?.name || 'a user'} · {timeAgo(r.createdAt)}
                  </Text>
                </View>
              </Row>

              {isOpen ? (
                <View style={{ marginTop: 10, backgroundColor: C.brand50, borderRadius: 12, padding: 11 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: C.ink2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                    Take action
                  </Text>
                  {r.targetType !== 'provider' ? (
                    <Btn
                      label="Remove this content"
                      variant="d"
                      size="sm"
                      block
                      icon="trash-outline"
                      onPress={() => act(r, 'remove_content', 'resolved', 'Content removed after moderation review.')}
                      style={{ marginBottom: 7 }}
                    />
                  ) : null}
                  <Btn
                    label={r.targetType === 'provider' ? 'Suspend studio' : 'Suspend the studio'}
                    variant="d"
                    size="sm"
                    block
                    icon="remove-circle-outline"
                    onPress={() => act(r, 'suspend_provider', 'resolved', 'Studio suspended pending further review.')}
                    style={{ marginBottom: 7 }}
                  />
                  <Btn
                    label="No action needed"
                    variant="o"
                    size="sm"
                    block
                    onPress={() => act(r, 'none', 'resolved', 'Reviewed — no action needed.')}
                    style={{ marginBottom: 7 }}
                  />
                  <Btn label="Dismiss report" variant="o" size="sm" block onPress={() => act(r, 'none', 'dismissed', 'Dismissed as not a violation.')} />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 7, marginTop: 10 }}>
                  <Btn label="Review" variant="p" size="xs" onPress={() => setActing(r.id)} />
                  <Btn label="Dismiss" variant="o" size="xs" onPress={() => act(r, 'none', 'dismissed', 'Dismissed as not a violation.')} />
                </View>
              )}
            </Card>
          );
        })
      ) : (
        <Empty icon="shield-checkmark-outline" title="Queue is clear" text="No open reports. Content reports filed by customers land here." />
      )}

      {groups.closed.length ? (
        <View>
          <SectionTitle title="Handled" />
          <Card flush>
            {groups.closed.slice(0, 12).map((r) => {
              const info = describe(r);
              return (
                <View key={r.id} style={{ padding: 11, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <Row style={{ gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 12.5, color: C.plum, fontWeight: '700' }} numberOfLines={1}>{r.reason}</Text>
                    <Pill status={r.status === 'resolved' ? 'confirmed' : 'cancelled'} label={r.status === 'resolved' ? 'Resolved' : 'Dismissed'} />
                  </Row>
                  <Text style={{ fontSize: 11.5, color: C.ink3, marginTop: 2 }} numberOfLines={2}>
                    {info.title} · {r.resolution}
                    {r.resolvedAt ? ' · ' + fmtDate(new Date(r.resolvedAt).toISOString().slice(0, 10)) : ''}
                  </Text>
                </View>
              );
            })}
          </Card>
        </View>
      ) : null}

      <Note>
        Removing content also recomputes the studio rating. Suspension hides the studio from booking and
        shows an honest warning on the profile — the verified badge is never granted automatically.
      </Note>
    </View>
  );
}

/** Compact verification queue shown at the top of the providers tab. */
export function VerificationQueue() {
  const app = useApp();
  const pending = app.db.profiles.filter((p) => p.verification === 'pending');
  if (!pending.length) return null;
  return (
    <Card style={{ marginBottom: 12, borderColor: C.goldBg, backgroundColor: C.goldBg }}>
      <Row style={{ gap: 8, marginBottom: 4 }}>
        <Ionicons name="shield-checkmark" size={16} color={C.gold} />
        <Text style={{ fontFamily: SERIF, fontSize: 15, color: C.plum, fontWeight: '600' }}>
          {pending.length} awaiting verification
        </Text>
      </Row>
      {pending.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(185,138,62,0.2)' }}>
          <Avatar name={p.displayName} size={34} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13, color: C.plum, fontWeight: '700' }} numberOfLines={1}>{p.displayName}</Text>
            <Row style={{ gap: 5 }}>
              <Stars n={Math.round(p.avg)} size={10} />
              <Text style={{ fontSize: 11, color: C.ink3 }}>
                {p.avg.toFixed(1)} · {app.db.services.filter((s) => s.providerId === p.id && s.active).length} services
              </Text>
            </Row>
          </View>
          <Chip mono onPress={() => { repo.setVerification(p.id, 'verified'); app.bump(); app.showToast(p.displayName + ' verified ✓'); }}>
            Verify
          </Chip>
        </View>
      ))}
    </Card>
  );
}
