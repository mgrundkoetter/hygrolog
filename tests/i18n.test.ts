import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectLanguage, setLanguage, t } from '../src/i18n';

const stubLanguages = (languages: string[]) =>
  vi.stubGlobal('navigator', { languages, language: languages[0] });

describe('detectLanguage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('picks the first supported preferred language', () => {
    stubLanguages(['fr-FR', 'de-AT', 'en-US']);
    expect(detectLanguage()).toBe('de');
  });

  it('tells Simplified from Traditional Chinese', () => {
    for (const [tag, lang] of [['zh-CN', 'zh'], ['zh', 'zh'], ['zh-Hans-SG', 'zh'], ['zh-TW', 'zh-TW'], ['zh-Hant', 'zh-TW'], ['zh-HK', 'zh-TW']]) {
      stubLanguages([tag]);
      expect(detectLanguage(), tag).toBe(lang);
    }
  });

  it('falls back to English', () => {
    stubLanguages(['fr-FR', 'it']);
    expect(detectLanguage()).toBe('en');
  });

  it('resolves "auto" via detection and explicit settings directly', () => {
    stubLanguages(['de-DE']);
    expect(setLanguage('auto')).toBe('de');
    expect(setLanguage('en')).toBe('en');
  });
});

describe('static markup', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const keys = [
    ...[...html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((m) => m[1].split(';').map((p) => p.split(':')[1])),
  ];

  it.each(['en', 'de', 'zh', 'zh-TW'] as const)('only references keys that exist (%s)', (lang) => {
    setLanguage(lang);
    const messages = t() as unknown as Record<string, unknown>;
    expect(keys.length).toBeGreaterThan(40);
    for (const key of keys) expect(typeof messages[key], key).toBe('string');
  });
});
