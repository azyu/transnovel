import { describe, expect, it } from 'vitest';
import {
  buildWatchlistWorkUrl,
  formatWatchlistSiteLabel,
  isWatchlistSupportedSite,
} from './watchlist';

describe('watchlist helpers', () => {
  it('accepts syosetu and nocturne as supported sites', () => {
    expect(isWatchlistSupportedSite('syosetu')).toBe(true);
    expect(isWatchlistSupportedSite('nocturne')).toBe(true);
    expect(isWatchlistSupportedSite('hameln')).toBe(false);
  });

  it('builds the correct work url for each supported site', () => {
    expect(buildWatchlistWorkUrl('syosetu', 'n3645ly')).toBe('https://ncode.syosetu.com/n3645ly/');
    expect(buildWatchlistWorkUrl('nocturne', 'n7098lz')).toBe('https://novel18.syosetu.com/n7098lz/');
    expect(buildWatchlistWorkUrl('hameln', '1234')).toBeNull();
  });

  it('formats a human-friendly site label', () => {
    expect(formatWatchlistSiteLabel('syosetu')).toBe('Syosetu');
    expect(formatWatchlistSiteLabel('nocturne')).toBe('Novel18');
    expect(formatWatchlistSiteLabel('unknown')).toBe('unknown');
  });
});
