export type Role = 'customer' | 'provider' | 'admin';
export type Verification = 'unverified' | 'pending' | 'verified' | 'suspended';
export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'completed' | 'no_show';
export type LocationType = 'provider' | 'customer' | 'both';

export interface User {
  id: string;
  role: Role;
  email: string;
  password: string;
  name: string;
  phone: string;
  area: string;
  lat: number;
  lng: number;
  createdAt: number;
}

export interface ProviderProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string;
  addr: string;
  lat: number;
  lng: number;
  radiusKm: number;
  verification: Verification;
  avg: number;
  reviewCount: number;
  categoryIds: string[];
  phone: string;
}

export interface Category {
  id: string;
  name: string;
  desc: string;
  icon: string;
  active: boolean;
}

export interface Service {
  id: string;
  providerId: string;
  categoryId: string;
  name: string;
  desc: string;
  price: number;
  duration: number;
  locationType: LocationType;
  active: boolean;
}

export interface PortfolioItem {
  id: string;
  providerId: string;
  serviceId: string | null;
  art: string;
  grad: string;
  caption: string;
}

export interface Availability {
  id: string;
  providerId: string;
  day: number; // 0=Sunday
  start: string;
  end: string;
  active: boolean;
}

export interface BreakSlot {
  id: string;
  providerId: string;
  day: number;
  start: string;
  end: string;
}

export interface BlockedSlot {
  id: string;
  providerId: string;
  start: string; // "YYYY-MM-DD HH:MM"
  end: string;
  reason: string;
}

export interface Booking {
  id: string;
  ref: string;
  customerId: string;
  providerId: string;
  serviceId: string;
  date: string; // YYYY-MM-DD
  start: string | null;
  end: string | null;
  price: number;
  location: string;
  locType: LocationType;
  notes: string;
  status: BookingStatus;
  payment: string;
  createdAt: number;
  updatedAt: number;
}

export interface Review {
  id: string;
  bookingId: string;
  customerId: string;
  providerId: string;
  rating: number;
  comment: string;
  createdAt: number;
}

export interface Favourite {
  customerId: string;
  providerId: string;
  createdAt: number;
}

export interface Notif {
  id: string;
  userId: string;
  type: string;
  title: string;
  msg: string;
  read: boolean;
  createdAt: number;
}

export interface DB {
  v: number;
  session: string | null;
  categories: Category[];
  users: User[];
  profiles: ProviderProfile[];
  services: Service[];
  portfolio: PortfolioItem[];
  availability: Availability[];
  breaks: BreakSlot[];
  blocked: BlockedSlot[];
  bookings: Booking[];
  reviews: Review[];
  favourites: Favourite[];
  notifs: Notif[];
}

export interface Area {
  name: string;
  lat: number;
  lng: number;
}
