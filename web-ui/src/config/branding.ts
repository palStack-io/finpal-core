/**
 * Branding Configuration
 * Handles currency-based branding (DollarPal vs EuroPal)
 */

export type Currency = 'USD' | 'EUR' | 'GBP' | 'INR' | 'CAD' | 'AUD';

export interface BrandingConfig {
  appName: string;
  internalName: string;
  parentBrand: string;
  currencySymbol: string;
  currencyCode: string;
  locale: string;
}

const brandingMap: Record<Currency, BrandingConfig> = {
  USD: {
    appName: 'DollarPal',
    internalName: 'finPal',
    parentBrand: 'palStack',
    currencySymbol: '$',
    currencyCode: 'USD',
    locale: 'en-US',
  },
  EUR: {
    appName: 'EuroPal',
    internalName: 'finPal',
    parentBrand: 'palStack',
    currencySymbol: '€',
    currencyCode: 'EUR',
    locale: 'en-GB',
  },
  GBP: {
    appName: 'PoundPal',
    internalName: 'finPal',
    parentBrand: 'palStack',
    currencySymbol: '£',
    currencyCode: 'GBP',
    locale: 'en-GB',
  },
  INR: {
    appName: 'RupeePal',
    internalName: 'finPal',
    parentBrand: 'palStack',
    currencySymbol: '₹',
    currencyCode: 'INR',
    locale: 'en-IN',
  },
  CAD: {
    appName: 'DollarPal',
    internalName: 'finPal',
    parentBrand: 'palStack',
    currencySymbol: 'C$',
    currencyCode: 'CAD',
    locale: 'en-CA',
  },
  AUD: {
    appName: 'DollarPal',
    internalName: 'finPal',
    parentBrand: 'palStack',
    currencySymbol: 'A$',
    currencyCode: 'AUD',
    locale: 'en-AU',
  },
};

export const getBranding = (currency: Currency = 'USD'): BrandingConfig => {
  return brandingMap[currency] || brandingMap.USD;
};

export const getDefaultCurrency = (): Currency => {
  // Try to get from localStorage first
  const stored = localStorage.getItem('defaultCurrency');
  if (stored && stored in brandingMap) {
    return stored as Currency;
  }

  // Try to get from environment variable
  const envCurrency = import.meta.env.VITE_DEFAULT_CURRENCY;
  if (envCurrency && envCurrency in brandingMap) {
    return envCurrency as Currency;
  }

  // Default to USD
  return 'USD';
};

export const setDefaultCurrency = (currency: Currency): void => {
  localStorage.setItem('defaultCurrency', currency);
};

export const supportedCurrencies: Currency[] = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'];
