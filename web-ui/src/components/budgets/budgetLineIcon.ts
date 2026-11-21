/**
 * Budgets C (core): one line icon per budget row, from the category's name matched on WHOLE words, else a generic tag.
 *
 * Lucide only (house design standard: no emoji in our UI). Whole words because substrings mislead: "car" is inside
 * "Healthcare" and "cards", "pet" inside "carpet". Core's stored category icon is still an emoji on main (the move to
 * icon keys is its own change), so it is not read here yet.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Baby, Briefcase, Car, Clapperboard, Coffee, CreditCard, Dumbbell, Gift, GraduationCap, HeartPulse, House, Landmark,
  PawPrint, PiggyBank, Plane, Receipt, Shield, Shirt, ShoppingBag, ShoppingCart, Smartphone, Sparkles, Tag, Utensils,
  Wifi, Wrench, Zap,
} from 'lucide-react';

/** Whole words (with their usual plurals), first match wins, so the more specific words come first. */
const WORDS: Array<[string[], LucideIcon]> = [
  [['grocery', 'groceries', 'supermarket'], ShoppingCart],
  [['coffee', 'cafe', 'café'], Coffee],
  [['credit card', 'credit cards', 'debt', 'loan', 'loans'], CreditCard],
  [['food', 'dining', 'restaurant', 'restaurants', 'meals', 'takeaway', 'takeout'], Utensils],
  [['rent', 'mortgage', 'housing', 'home', 'house'], House],
  [['electric', 'electricity', 'utilities', 'utility', 'power', 'energy', 'water'], Zap],
  [['internet', 'wifi', 'broadband'], Wifi],
  [['phone', 'mobile'], Smartphone],
  [['transportation', 'transport', 'car', 'cars', 'fuel', 'gas', 'petrol', 'parking', 'transit', 'commute', 'taxi'], Car],
  [['travel', 'flights', 'holiday', 'holidays', 'vacation', 'trip', 'trips'], Plane],
  [['entertainment', 'movies', 'cinema', 'streaming', 'music', 'games'], Clapperboard],
  [['shopping', 'clothes', 'clothing', 'apparel'], ShoppingBag],
  [['health', 'healthcare', 'medical', 'doctor', 'pharmacy', 'dental'], HeartPulse],
  [['gym', 'fitness', 'sport', 'sports'], Dumbbell],
  [['insurance'], Shield],
  [['gifts', 'gift', 'presents', 'donations', 'charity'], Gift],
  [['education', 'school', 'tuition', 'courses', 'books'], GraduationCap],
  [['pet', 'pets', 'vet'], PawPrint],
  [['childcare', 'kids', 'children', 'baby'], Baby],
  [['beauty', 'personal care', 'hair'], Sparkles],
  [['subscriptions', 'subscription', 'bills', 'fees'], Receipt],
  [['savings', 'saving'], PiggyBank],
  [['tax', 'taxes'], Landmark],
  [['repairs', 'maintenance'], Wrench],
  [['work', 'business'], Briefcase],
  [['fashion', 'shoes'], Shirt],
];

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BY_NAME: Array<[RegExp, LucideIcon]> = WORDS.map(([words, icon]) => [
  new RegExp(`(^|[^\\p{L}])(${words.map(escape).join('|')})(?=$|[^\\p{L}])`, 'u'), icon,
]);

export function budgetLineIcon(name: string | null | undefined): LucideIcon {
  const label = (name ?? '').toLowerCase();
  for (const [pattern, icon] of BY_NAME) if (pattern.test(label)) return icon;
  return Tag;
}
