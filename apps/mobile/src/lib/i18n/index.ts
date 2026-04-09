/**
 * i18n scaffold. Forces Spanish for now.
 *
 * Plan 43-12 will add a language switcher UI and use expo-localization's
 * getLocales() to detect the device default. The import is kept here so the
 * hook-up is trivial when that plan lands.
 */

import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import es from './es.json';

// Plan 12 will add language switching UI. For now we force 'es' regardless
// of device locale so strings are stable during development.
void Localization.getLocales;

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      es: { translation: es },
    },
    lng: 'es',
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });
}

const t = i18n.t.bind(i18n);

export { i18n, t, useTranslation };
