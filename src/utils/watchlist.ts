import type { WatchlistItem } from '../types';

export const isWatchlistSupportedSite = (site: string): boolean =>
  site === 'syosetu' || site === 'nocturne';

export const buildWatchlistWorkUrl = (site: string, novelId: string): string | null => {
  if (site === 'syosetu') {
    return `https://ncode.syosetu.com/${novelId}/`;
  }

  if (site === 'nocturne') {
    return `https://novel18.syosetu.com/${novelId}/`;
  }

  return null;
};

export const formatWatchlistSiteLabel = (site: string): string => {
  if (site === 'syosetu') {
    return 'Syosetu';
  }

  if (site === 'nocturne') {
    return 'Novel18';
  }

  return site;
};

export const getWatchlistItemKey = (
  itemOrSite: Pick<WatchlistItem, 'site' | 'novelId'> | string,
  novelId?: string,
): string => {
  if (typeof itemOrSite === 'string') {
    return `${itemOrSite}:${novelId ?? ''}`;
  }

  return `${itemOrSite.site}:${itemOrSite.novelId}`;
};
