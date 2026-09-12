import { AnalyticsEventName, Area, BookingStatus, DB } from '../types';
import { addDays, dISO, uid } from '../utils';

export const AREAS: Area[] = [
  { name: 'Bukit Bintang, KL', lat: 3.145, lng: 101.71 },
  { name: 'KLCC, KL', lat: 3.1579, lng: 101.7117 },
  { name: 'Bangsar, KL', lat: 3.136, lng: 101.675 },
  { name: 'Mont Kiara, KL', lat: 3.167, lng: 101.652 },
  { name: 'Damansara, KL', lat: 3.158, lng: 101.613 },
  { name: 'Cheras, KL', lat: 3.0987, lng: 101.74 },
  { name: 'Petaling Jaya, SY', lat: 3.125, lng: 101.625 },
  { name: 'Subang Jaya, SY', lat: 3.075, lng: 101.587 },
];

const WORK: Record<string, number[]> = {
  p1: [1, 1, 1, 1, 1, 1, 0], // Mon–Sat
  p2: [0, 1, 1, 1, 1, 1, 1], // Tue–Sun
  p3: [0, 0, 1, 1, 1, 1, 1], // Wed–Sun
  p4: [1, 1, 1, 1, 1, 1, 0],
  p5: [1, 1, 1, 1, 1, 1, 0],
  p6: [1, 0, 0, 1, 1, 1, 1], // Thu–Mon
  p7: [1, 1, 1, 1, 1, 1, 1],
  p8: [0, 1, 1, 1, 1, 1, 0], // Tue–Sat
};

function nextWorkDayOffset(pid: string, from: number): number {
  const av = WORK[pid] || WORK.p1;
  for (let i = from; i < 14; i++) {
    if (av[addDays(new Date(), i).getDay()]) return i;
  }
  return from;
}

export function seed(): DB {
  const db: DB = {
    v: 4,
    session: null,
    categories: [
      { id: 'c1', name: 'Lash Extensions', desc: 'Classic, volume & hybrid lash sets', icon: 'eye', active: true },
      { id: 'c2', name: 'Brow Embroidery', desc: 'Powder, microblading & ombré brows', icon: 'brush', active: true },
      { id: 'c3', name: 'Massage', desc: 'Relaxation, deep tissue & spa therapies', icon: 'hand-left', active: true },
      { id: 'c4', name: 'Nail Services', desc: 'Manicure, pedicure & hand-painted art', icon: 'color-palette', active: true },
      { id: 'c5', name: 'Saree Draping', desc: 'Traditional & contemporary styling', icon: 'ribbon', active: true },
      { id: 'c6', name: 'Waxing / Hair Removal', desc: 'Precision waxing & smooth skin care', icon: 'leaf', active: true },
      { id: 'c7', name: 'Hair Styling', desc: 'Cuts, colour, events & everyday looks', icon: 'cut', active: true },
    ],
    users: [],
    profiles: [],
    services: [],
    portfolio: [],
    availability: [],
    breaks: [],
    blocked: [],
    bookings: [],
    reviews: [],
    favourites: [],
    notifs: [],
    events: [],
    reports: [],
    conversations: [],
    messages: [],
  };

  const mkUser = (id: string, role: 'customer' | 'provider' | 'admin', email: string, name: string, phone: string, area: string) => {
    const a = AREAS.find((x) => x.name === area) || AREAS[0];
    db.users.push({ id, role, email, password: 'demo123', name, phone, area: a.name, lat: a.lat, lng: a.lng, createdAt: Date.now() - 90 * 864e5 });
  };
  const mkProfile = (
    id: string,
    userId: string,
    displayName: string,
    bio: string,
    area: string,
    radiusKm: number,
    verification: 'unverified' | 'pending' | 'verified' | 'suspended',
    avg: number,
    reviewCount: number,
    categoryIds: string[]
  ) => {
    const a = AREAS.find((x) => x.name === area) || AREAS[0];
    db.profiles.push({
      id, userId, displayName, bio,
      addr: a.name + ' area, Kuala Lumpur',
      lat: a.lat, lng: a.lng, radiusKm, verification, avg, reviewCount, categoryIds,
      phone: '+60 12-000 0000',
    });
  };

  mkUser('uadmin', 'admin', 'admin@glamoora.my', 'Glamoora Admin', '+60 3-2181 8000', 'Bukit Bintang, KL');
  mkUser('umaya', 'customer', 'maya@glamoora.my', 'Maya Wong', '+60 12-345 6789', 'Bukit Bintang, KL');
  mkUser('ulina', 'customer', 'lina@glamoora.my', 'Lina Ahmad', '+60 17-882 4410', 'KLCC, KL');
  mkUser('ucindy', 'customer', 'cindy@glamoora.my', 'Cindy Teo', '+60 16-990 2231', 'Bangsar, KL');
  mkUser('unadia', 'customer', 'nadia@glamoora.my', 'Nadia Ibrahim', '+60 19-220 7714', 'Cheras, KL');
  mkUser('uaina', 'provider', 'aina@glamoora.my', 'Aina Faridah', '+60 11-2345 8890', 'Bukit Bintang, KL');
  mkUser('umelissa', 'provider', 'melissa@glamoora.my', 'Melissa Tan', '+60 12-778 9034', 'Bangsar, KL');
  mkUser('upriya', 'provider', 'priya@glamoora.my', 'Priya Nair', '+60 18-334 6621', 'Damansara, KL');
  mkUser('usarah', 'provider', 'sarah@glamoora.my', 'Sarah Lim', '+60 17-660 1123', 'KLCC, KL');
  mkUser('unurul', 'provider', 'nurul@glamoora.my', 'Nurul Huda', '+60 19-445 8872', 'Cheras, KL');
  mkUser('umei', 'provider', 'mei@glamoora.my', 'Mei Chen', '+60 16-221 9905', 'Petaling Jaya, SY');
  mkUser('ufarah', 'provider', 'farah@glamoora.my', 'Farah Aziz', '+60 12-887 3345', 'Mont Kiara, KL');
  mkUser('uzul', 'provider', 'zul@glamoora.my', 'Zulaikha Omar', '+60 11-556 7789', 'Subang Jaya, SY');

  mkProfile('p1', 'uaina', 'Aina Lash Studio', 'Senior lash & brow artist with 8+ years of experience. Soft, expressive, made-for-you designs — never cookie-cutter. Certified in Russian volume and ombré powder brows.', 'Bukit Bintang, KL', 15, 'verified', 4.9, 128, ['c1', 'c2']);
  mkProfile('p2', 'umelissa', 'Tan Nails & Spa', 'Hygiene-obsessed nail studio in Bangsar. Gel, acrylic, spa pedicure and massage. Walk-ins welcome, bookings prioritised.', 'Bangsar, KL', 10, 'verified', 4.8, 96, ['c4', 'c3']);
  mkProfile('p3', 'upriya', "Priya's Saree Atelier", 'Second-generation drape artist. I bring the drape, the pins and the patience — weddings, engagement days, office styling and everything in between.', 'Damansara, KL', 30, 'verified', 5.0, 61, ['c5', 'c7']);
  mkProfile('p4', 'usarah', 'Glow Skin & Wax', 'Gentle, precise hair removal with premium hard wax. Skin-first approach: prep, wax, soothe. Private studio, one client at a time.', 'KLCC, KL', 8, 'pending', 4.7, 43, ['c6', 'c2']);
  mkProfile('p5', 'unurul', 'Huda Hair Studio', 'Ladies salon specialising in low-porosity hair, balayage and blowouts that survive KL humidity. Walk in messy, leave polished.', 'Cheras, KL', 12, 'verified', 4.6, 88, ['c7', 'c3']);
  mkProfile('p6', 'umei', 'Chen Nail Art', 'Mobile nail artist — I come to you. Hand-painted art, clean cuts, no chips. Serving PJ, Damansara & surrounding areas.', 'Petaling Jaya, SY', 25, 'unverified', 4.9, 21, ['c4']);
  mkProfile('p7', 'ufarah', 'Serenity Touch Massage', 'Registered massage therapist. Aromatherapy, deep tissue and reflexology in a quiet one-room studio.', 'Mont Kiara, KL', 20, 'verified', 4.8, 112, ['c3']);
  mkProfile('p8', 'uzul', 'Zul Brows & Beyond', 'Brow specialist focused on symmetry and soft, feathered results. Also doing classic lashes for a complete look.', 'Subang Jaya, SY', 10, 'unverified', 4.5, 30, ['c2', 'c1']);

  const S = (
    providerId: string, categoryId: string, name: string, desc: string,
    price: number, duration: number, locationType: 'provider' | 'customer' | 'both', id?: string
  ) => {
    const s = { id: id || uid('s'), providerId, categoryId, name, desc, price, duration, locationType, active: true };
    db.services.push(s);
    return s.id;
  };
  const s11 = S('p1', 'c1', 'Russian Volume Lash Set', 'Feather-light custom volume fans, 120–150 lashes. Full set with aftercare kit.', 220, 120, 'provider');
  const s12 = S('p1', 'c1', 'Classic Lash Set', 'Natural lengthening, one-extension per lash. Perfect first set.', 180, 90, 'provider');
  const s13 = S('p1', 'c1', 'Lash Fill (2–3 weeks)', 'Refill within 3 weeks of your set to keep volume fresh.', 120, 60, 'provider');
  const s14 = S('p1', 'c2', 'Powder Brow Embroidery', 'Ombré powder brows, 6–8 month retention. Patch test included.', 350, 120, 'provider');
  S('p1', 'c2', 'Brow Lamination', 'Fluffy, brushed-up brows for 4–6 weeks. No needles.', 150, 60, 'provider');
  const s21 = S('p2', 'c4', 'Gel Manicure', 'Cuticle care, shape, gel polish in 40+ shades.', 85, 60, 'provider');
  S('p2', 'c4', 'Spa Pedicure', 'Soak, scrub, mask, massage and polish. Towel provided.', 120, 90, 'provider');
  S('p2', 'c4', 'Hand-painted Nail Art', 'Per-set custom art. Bring a reference or let me design it.', 45, 30, 'provider');
  S('p2', 'c3', 'Deep Tissue Massage (studio)', '60 minutes of targeted pressure on knots and tension.', 180, 60, 'provider');
  const s31 = S('p3', 'c5', 'Saree Draping — Ceremony', 'Classic/Nivi drape with dupatta styling, jewellery arrangement and hair pinning. I travel to you.', 150, 45, 'customer');
  S('p3', 'c5', 'Saree Draping — Everyday', 'Effortless office or brunch drape. Quick, neat, all-day secure.', 100, 30, 'customer');
  S('p3', 'c5', 'Bridal Hair & Saree', 'Full bridal package: drape, hair, bindi and dupatta. Includes one trial consultation.', 450, 150, 'customer');
  S('p3', 'c7', 'Event Hairstyling', 'Updos, loose waves or braids for gatherings and shoots.', 180, 60, 'both');
  S('p4', 'c6', 'Full Body Wax', 'Legs, arms, underarms & bikini line with hard wax and aftercare balm.', 220, 90, 'provider');
  S('p4', 'c6', 'Leg Wax', 'Full leg wax with soothing aloe finish.', 95, 45, 'provider');
  S('p4', 'c2', 'Brow Shaping & Tint', 'Wax shape matched to your bone structure + semi-permanent tint.', 85, 30, 'provider');
  S('p4', 'c6', 'Facial Wax (lip / chin)', 'Quick, gentle precision waxing for the face.', 45, 15, 'provider');
  S('p5', 'c7', 'Ladies Haircut & Blowdry', 'Consultation, wash, cut and humidity-proof blowout.', 120, 60, 'provider');
  S('p5', 'c7', 'Root Touch-up Colour', 'Ammonia-free colour to roots with gloss finish.', 300, 150, 'provider');
  S('p5', 'c3', 'Hair Spa & Scalp Massage', 'Steam, oil treatment and 15-minute scalp massage.', 150, 60, 'provider');
  S('p5', 'c3', 'Traditional Malay Massage', 'Ubat tradisional massage for deep relaxation.', 140, 60, 'provider');
  S('p6', 'c4', 'Mobile Manicure', 'I come to you: cuticle care, shape and polish or gel.', 90, 60, 'customer');
  S('p6', 'c4', 'Mobile Spa Pedicure', 'Portable spa setup, exfoliation, massage and polish at your place.', 130, 75, 'customer');
  S('p6', 'c4', 'Hand-painted Nail Art', 'Detailed hand-painted designs, 1–3 nails or full set.', 60, 45, 'customer');
  S('p7', 'c3', 'Aromatherapy Massage', '60 minutes with your choice of essential oil blend.', 160, 60, 'provider');
  S('p7', 'c3', 'Deep Tissue Massage', 'Slow, firm pressure to release chronic tension.', 200, 60, 'provider');
  S('p7', 'c3', 'Full Body Massage (90 min)', 'Extended session combining aromatherapy and deep tissue.', 240, 90, 'provider');
  S('p7', 'c3', 'Foot Reflexology', '45 minutes of targeted foot and lower-leg pressure work.', 120, 45, 'provider');
  S('p8', 'c2', 'Microblading', 'Hair-like strokes for a natural, feathered brow. 8–12 month retention.', 450, 150, 'provider');
  S('p8', 'c2', 'Ombré Powder Brows', 'Soft shaded brows, low-maintenance. Touch-up at 4 weeks included.', 380, 120, 'provider');
  S('p8', 'c1', 'Classic Lash Set', 'Natural classic lashes, one per natural lash.', 170, 90, 'provider');

  const av = (providerId: string, days: number[], start: string, end: string) =>
    days.forEach((d) => db.availability.push({ id: uid('a'), providerId, day: d, start, end, active: true }));
  av('p1', [1, 2, 3, 4, 5, 6], '10:00', '19:00');
  db.breaks.push(
    { id: uid('b'), providerId: 'p1', day: 1, start: '13:00', end: '14:00' },
    { id: uid('b'), providerId: 'p1', day: 3, start: '13:00', end: '14:00' },
    { id: uid('b'), providerId: 'p1', day: 5, start: '13:00', end: '14:00' }
  );
  av('p2', [2, 3, 4, 5, 6, 0], '11:00', '20:00');
  db.breaks.push({ id: uid('b'), providerId: 'p2', day: 3, start: '14:00', end: '15:00' });
  av('p3', [3, 4, 5, 6, 0], '09:00', '17:00');
  db.breaks.push({ id: uid('b'), providerId: 'p3', day: 5, start: '12:30', end: '13:30' });
  av('p4', [1, 2, 3, 4, 5, 6], '10:00', '18:00');
  db.breaks.push({ id: uid('b'), providerId: 'p4', day: 2, start: '13:00', end: '14:00' });
  av('p5', [1, 2, 3, 4, 5, 6], '10:00', '20:00');
  av('p6', [4, 5, 6, 0, 1], '10:00', '18:00');
  db.breaks.push({ id: uid('b'), providerId: 'p6', day: 5, start: '13:00', end: '14:00' });
  av('p7', [0, 1, 2, 3, 4, 5, 6], '09:00', '21:00');
  [0, 3, 6].forEach((d) => db.breaks.push({ id: uid('b'), providerId: 'p7', day: d, start: '13:30', end: '14:30' }));
  av('p8', [2, 3, 4, 5, 6], '11:00', '18:00');

  const oA = nextWorkDayOffset('p1', 2);
  db.blocked.push({
    id: uid('k'), providerId: 'p1',
    start: dISO(addDays(new Date(), oA)) + ' 15:00',
    end: dISO(addDays(new Date(), oA)) + ' 17:00',
    reason: 'Personal appointment',
  });

  const PF = (providerId: string, serviceName: string, cat: string, variant: number, caption: string) => {
    const s = db.services.find((x) => x.providerId === providerId && x.name === serviceName);
    db.portfolio.push({ id: uid('pf'), providerId, serviceId: s ? s.id : null, art: cat, grad: 'g' + ((variant % 6) + 1), caption });
  };
  PF('p1', 'Russian Volume Lash Set', 'lash', 0, 'Volume set — soft wing');
  PF('p1', 'Classic Lash Set', 'lash', 1, 'Classic set, natural day look');
  PF('p1', 'Powder Brow Embroidery', 'brow', 2, 'Ombré powder brows, 2 weeks post-heal');
  PF('p1', 'Russian Volume Lash Set', 'lash', 3, 'Hybrid set with brow lamination');
  PF('p1', 'Brow Lamination', 'brow', 4, 'Lamination + tint');
  PF('p1', 'Classic Lash Set', 'lash', 5, 'Cat-eye mapping');
  PF('p2', 'Gel Manicure', 'nail', 0, 'Nude almond gel set');
  PF('p2', 'Hand-painted Nail Art', 'nail', 1, 'Cherry hand-painted art');
  PF('p2', 'Spa Pedicure', 'nail', 2, 'French tips, hand-painted');
  PF('p2', 'Gel Manicure', 'nail', 3, 'Soft pink chrome');
  PF('p2', 'Deep Tissue Massage (studio)', 'massage', 4, 'Studio setup');
  PF('p3', 'Saree Draping — Ceremony', 'saree', 0, 'Banarasi Nivi drape, wedding');
  PF('p3', 'Bridal Hair & Saree', 'saree', 1, 'Bridal drape + side bun');
  PF('p3', 'Saree Draping — Everyday', 'saree', 2, 'Office-friendly drape');
  PF('p3', 'Event Hairstyling', 'hair', 3, 'Loose waves for sangeet');
  PF('p3', 'Saree Draping — Ceremony', 'saree', 4, 'Preeta drape, engagement');
  PF('p4', 'Full Body Wax', 'wax', 0, 'Studio, private one-on-one');
  PF('p4', 'Brow Shaping & Tint', 'brow', 1, 'Soft arch + tint');
  PF('p4', 'Leg Wax', 'wax', 2, 'Smooth leg finish');
  PF('p4', 'Facial Wax (lip / chin)', 'wax', 3, 'Precision facial wax');
  PF('p5', 'Ladies Haircut & Blowdry', 'hair', 0, 'Blowout that beats humidity');
  PF('p5', 'Root Touch-up Colour', 'hair', 1, 'Balayage, root melt');
  PF('p5', 'Hair Spa & Scalp Massage', 'massage', 2, 'Oil treatment + spa');
  PF('p5', 'Ladies Haircut & Blowdry', 'hair', 3, 'New bob, glass finish');
  PF('p6', 'Mobile Manicure', 'nail', 0, 'At-home gel set, Damansara');
  PF('p6', 'Hand-painted Nail Art', 'nail', 1, 'Mini florals, hand-painted');
  PF('p6', 'Mobile Spa Pedicure', 'nail', 2, 'Home spa pedicure setup');
  PF('p6', 'Mobile Manicure', 'nail', 3, 'Chrome accents at your place');
  PF('p7', 'Aromatherapy Massage', 'massage', 0, 'Calm one-room studio');
  PF('p7', 'Full Body Massage (90 min)', 'massage', 1, 'Deep tissue, 90 min');
  PF('p7', 'Foot Reflexology', 'massage', 2, 'Reflexology corner');
  PF('p7', 'Deep Tissue Massage', 'massage', 3, 'Warm oil prep');
  PF('p8', 'Microblading', 'brow', 0, 'Feathered microblades, 3 weeks');
  PF('p8', 'Ombré Powder Brows', 'brow', 1, 'Ombré soft powder');
  PF('p8', 'Classic Lash Set', 'lash', 2, 'Complete look — brows + lashes');
  PF('p8', 'Microblading', 'brow', 3, 'Symmetry mapping session');

  const bk = (customerId: string, providerId: string, serviceId: string, off: number, start: string, status: BookingStatus, notes: string) => {
    const s = db.services.find((x) => x.id === serviceId)!;
    const off2 = nextWorkDayOffset(providerId, off);
    const date = dISO(addDays(new Date(), off2));
    const end = minAdd(start, s.duration);
    const u = db.users.find((x) => x.id === customerId);
    db.bookings.push({
      id: uid('bkg'), ref: newRefSeed(),
      customerId, providerId, serviceId, date, start, end,
      price: s.price,
      location: s.locationType === 'customer' ? (u ? u.area : 'Customer location') : 'Provider studio',
      locType: s.locationType, notes: notes || '', status,
      payment: status === 'completed' ? 'Paid (mock)' : 'Pay after service',
      paymentStatus: status === 'completed' ? 'mock_paid' : 'unpaid',
      createdAt: Date.now() + off2 * 864e5 - 36e5, updatedAt: Date.now() + off2 * 864e5,
    });
  };
  const minAdd = (t: string, n: number) => {
    const [h, m] = t.split(':').map(Number);
    const total = h * 60 + m + n;
    return String(Math.floor(total / 60) % 24).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  };
  const newRefSeed = () => 'GLM-' + Math.random().toString(36).slice(2, 7).toUpperCase();

  bk('umaya', 'p1', s11, 0, '15:00', 'confirmed', 'Sensitive eyes — please use hypoallergenic adhesive.');
  bk('umaya', 'p1', s12, 1, '11:00', 'pending', 'First set, prefer natural length.');
  bk('umaya', 'p1', s13, -6, '10:00', 'completed', '');
  bk('ulina', 'p1', s11, -12, '14:00', 'completed', '');
  bk('ulina', 'p1', s14, -20, '11:00', 'completed', '');
  bk('ucindy', 'p1', s13, -2, '16:00', 'completed', '');
  bk('unadia', 'p1', s12, -9, '10:00', 'rejected', '');
  bk('ulina', 'p2', s21, 2, '12:00', 'confirmed', '');
  bk('umaya', 'p3', s31, -4, '10:00', 'completed', 'Engagement day.');

  const RV = (bookingIdx: number, customerId: string, providerId: string, rating: number, comment: string, off: number) => {
    const b = db.bookings[bookingIdx];
    db.reviews.push({ id: uid('r'), bookingId: b.id, customerId, providerId, rating, comment, createdAt: Date.now() + off * 864e5 });
  };
  RV(3, 'ulina', 'p1', 5, 'Aina is a gem. My volume set is so light I forget I have them. Worth every ringgit.', -11);
  RV(4, 'ulina', 'p1', 4, 'Powder brows turned out beautifully soft. Healing was easy with her aftercare.', -19);
  RV(5, 'ucindy', 'p1', 5, 'Fill was quick and painless, my set looks brand new.', -1);
  db.reviews.push({ id: uid('r'), bookingId: db.bookings[7].id, customerId: 'ulina', providerId: 'p2', rating: 5, comment: 'Cleanest nail studio I have been to. Gel lasted 3 full weeks.', createdAt: Date.now() - 2 * 864e5 });
  db.reviews.push({ id: uid('r'), bookingId: db.bookings[8].id, customerId: 'umaya', providerId: 'p3', rating: 5, comment: 'Priya made my mum look stunning for the engagement. The drape held all night!', createdAt: Date.now() - 3 * 864e5 });
  db.reviews.push({ id: uid('r'), bookingId: 'seed-x1', customerId: 'ucindy', providerId: 'p2', rating: 4, comment: 'Lovely pedicure, a bit long wait but worth it.', createdAt: Date.now() - 6 * 864e5 });
  db.reviews.push({ id: uid('r'), bookingId: 'seed-x2', customerId: 'unadia', providerId: 'p5', rating: 5, comment: 'Blowout survived a full day of KL rain. Magic.', createdAt: Date.now() - 8 * 864e5 });
  db.reviews.push({ id: uid('r'), bookingId: 'seed-x3', customerId: 'ucindy', providerId: 'p7', rating: 5, comment: 'Best deep tissue in Mont Kiara, hands down.', createdAt: Date.now() - 5 * 864e5 });
  db.reviews.push({ id: uid('r'), bookingId: 'seed-x4', customerId: 'umaya', providerId: 'p4', rating: 4, comment: 'Gentle and professional, no redness after my leg wax.', createdAt: Date.now() - 4 * 864e5 });
  db.reviews.push({ id: uid('r'), bookingId: 'seed-x5', customerId: 'ulina', providerId: 'p6', rating: 5, comment: 'The nail art is SO cute. Came to my house with a full setup.', createdAt: Date.now() - 3 * 864e5 });
  db.reviews.push({ id: uid('r'), bookingId: 'seed-x6', customerId: 'unadia', providerId: 'p8', rating: 4, comment: 'Brows look natural, touch-up booking was smooth.', createdAt: Date.now() - 7 * 864e5 });

  db.favourites.push(
    { customerId: 'umaya', providerId: 'p1', createdAt: Date.now() - 30 * 864e5 },
    { customerId: 'umaya', providerId: 'p3', createdAt: Date.now() - 20 * 864e5 }
  );

  const NT = (userId: string, type: string, title: string, msg: string, off: number, read: boolean) =>
    db.notifs.push({ id: uid('n'), userId, type, title, msg, read, createdAt: Date.now() + off * 36e5 });
  NT('uaina', 'booking_new', 'New booking request', 'Maya Wong requested a Classic Lash Set tomorrow at 11:00.', 1, false);
  NT('uaina', 'booking_new', 'New booking request', 'Lina Ahmad requested a Gel Manicure.', -2, false);
  NT('uaina', 'review', 'New review ★ 5', 'Cindy Teo left you a 5-star review.', -1, true);
  NT('umaya', 'booking_confirmed', 'Booking confirmed', 'Aina Lash Studio confirmed your Russian Volume Lash Set today at 15:00.', -3, false);
  NT('umaya', 'review_reminder', 'Share your experience', 'Enjoyed your Lash Fill? Leave a quick review for Aina Lash Studio.', -5, false);
  NT('umaya', 'booking_completed', 'Booking completed', 'Your Saree Draping — Ceremony with Priya was marked completed.', -4, true);

  /* ================= messaging seed (PRD Phase 13) ================= */
  const CONV = (id: string, customerId: string, providerId: string, bookingId: string | null, hoursAgo: number) => {
    db.conversations.push({ id, customerId, providerId, bookingId, createdAt: Date.now() - hoursAgo * 36e5, lastAt: Date.now() - hoursAgo * 36e5 });
    return id;
  };
  const MSG = (conversationId: string, senderId: string, body: string, hoursAgo: number, read: boolean) => {
    db.messages.push({
      id: uid('m'), conversationId, senderId, body,
      readBy: read ? ['umaya', 'ulina', 'ucindy', 'uaina', 'umelissa', 'umei'] : [senderId],
      createdAt: Date.now() - hoursAgo * 36e5,
    });
    const c = db.conversations.find((x) => x.id === conversationId);
    if (c) c.lastAt = Math.max(c.lastAt, Date.now() - hoursAgo * 36e5);
  };

  CONV('cv1', 'umaya', 'p1', db.bookings[0].id, 30);
  MSG('cv1', 'umaya', 'Hi Aina! I booked the Russian volume set for Saturday — is parking available nearby?', 29, true);
  MSG('cv1', 'uaina', 'Hi Maya! Yes, there is covered parking at the back, entrance B. See you Saturday ✨', 28, true);
  MSG('cv1', 'umaya', 'Perfect. My eyes are quite sensitive — is the adhesive fume-free?', 5, true);
  MSG('cv1', 'uaina', 'I use a low-fume sensitive adhesive. Avoid caffeine beforehand and come with clean, makeup-free lashes.', 4, true);

  CONV('cv2', 'ulina', 'p2', db.bookings[7].id, 52);
  MSG('cv2', 'ulina', 'Hi! Do you have any slots left this week for a gel manicure?', 51, true);
  MSG('cv2', 'umelissa', 'Yes — Thursday 12:00 and 15:30 are still open. Shall I hold one for you?', 50, true);
  MSG('cv2', 'ulina', 'Thursday 12:00 please 💅', 49, true);

  CONV('cv3', 'ucindy', 'p6', null, 3);
  MSG('cv3', 'ucindy', 'Hi Mei — do you travel to Bangsar for the hand-painted nail art set?', 3, false);
  MSG('cv3', 'ucindy', 'Happy to pay the travel fee if it is within your service area.', 2.5, false);

  /* ================= moderation seed (PRD Phase 15) ================= */
  const repPortfolio = db.portfolio.find((x) => x.providerId === 'p6');
  db.reports.push(
    {
      id: uid('rep'), reporterId: 'ucindy', targetType: 'portfolio', targetId: repPortfolio ? repPortfolio.id : 'pf-missing',
      providerId: 'p6', reason: 'Photos do not match the actual work',
      detail: 'The portfolio shows chrome art but the artist delivered a plain gel set.',
      status: 'open', resolution: '', createdAt: Date.now() - 26 * 36e5, resolvedAt: null,
    },
    {
      id: uid('rep'), reporterId: 'unadia', targetType: 'provider', targetId: 'p8', providerId: 'p8',
      reason: 'Price changed after booking',
      detail: 'Quoted RM170 for classic lashes, then asked for RM220 on arrival.',
      status: 'open', resolution: '', createdAt: Date.now() - 9 * 36e5, resolvedAt: null,
    },
    {
      id: uid('rep'), reporterId: 'ulina', targetType: 'review', targetId: db.reviews[0].id, providerId: 'p1',
      reason: 'Suspected fake review', detail: 'Same wording as another review on the same profile.',
      status: 'dismissed', resolution: 'Checked — two different customers, no action needed.',
      createdAt: Date.now() - 60 * 36e5, resolvedAt: Date.now() - 55 * 36e5,
    }
  );

  /* ================= analytics seed (PRD §16) =================
     Synthesises a believable funnel over the seeded bookings so marketplace
     metrics (conversion, acceptance, cancellation, completion, repeat rate)
     are non-trivial on day one. Timestamps sit just before each booking. */
  const EV = (name: AnalyticsEventName, actorId: string, hoursAgo: number, providerId?: string, bookingId?: string, meta?: Record<string, string | number | boolean>) => {
    const actor = db.users.find((u) => u.id === actorId);
    db.events.push({ id: uid('ev'), name, actorId, role: actor ? actor.role : 'system', providerId, bookingId, meta, createdAt: Date.now() - hoursAgo * 36e5 });
  };

  const CATS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
  const CUSTOMERS = ['umaya', 'ulina', 'ucindy', 'unadia'];
  db.bookings.forEach((b, i) => {
    const t = 90 + i * 7;
    EV('category_view', b.customerId, t + 6, b.providerId);
    EV('search', b.customerId, t + 5, b.providerId, undefined, { q: 'lash' });
    EV('provider_view', b.customerId, t + 4, b.providerId);
    EV('service_view', b.customerId, t + 3, b.providerId, undefined, { price: b.price });
    EV('booking_started', b.customerId, t + 2, b.providerId);
    EV('booking_created', b.customerId, t + 1, b.providerId, b.id, { price: b.price });
    EV('booking_received', b.providerId === 'p1' ? 'uaina' : b.providerId === 'p2' ? 'umelissa' : 'upriya', t + 1, b.providerId, b.id);
    if (b.status !== 'pending' && b.status !== 'rejected') {
      EV('booking_accepted', b.providerId === 'p1' ? 'uaina' : b.providerId === 'p2' ? 'umelissa' : 'upriya', t, b.providerId, b.id);
    }
    if (b.status === 'completed') {
      EV('booking_completed', b.customerId, t - 40, b.providerId, b.id, { price: b.price });
      EV('review_submitted', b.customerId, t - 36, b.providerId, b.id);
    }
    if (b.status === 'cancelled') EV('booking_cancelled', b.customerId, t - 5, b.providerId, b.id);
  });
  // Browsing that did not convert, so funnel rates stay realistic.
  CUSTOMERS.forEach((cid, i) => {
    EV('category_view', cid, 40 + i * 9, undefined, undefined, { cat: CATS[i % CATS.length] });
    EV('provider_view', cid, 38 + i * 9, i % 2 ? 'p5' : 'p7');
    EV('favourite_added', cid, 36 + i * 9, i % 2 ? 'p5' : 'p7');
  });
  EV('provider_view', 'unadia', 20, 'p8');
  EV('service_view', 'unadia', 19, 'p8');
  EV('signup', 'unadia', 200);
  EV('provider_signup', 'uzul', 260);
  EV('profile_completed', 'uzul', 258, 'p8');
  EV('service_created', 'uzul', 256, 'p8');
  EV('availability_created', 'uzul', 255, 'p8');
  db.events.sort((a, b) => b.createdAt - a.createdAt);


  return db;
}
