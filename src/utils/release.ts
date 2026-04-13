const parseVersion = (version: string): number[] | null => {
  const normalized = version.startsWith('v') ? version.slice(1) : version;
  const parts = normalized.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => Number.isNaN(part))) {
    return null;
  }

  return numbers;
};

export const isReleaseNewer = (currentVersion: string, latestVersion: string): boolean => {
  const current = parseVersion(currentVersion);
  const latest = parseVersion(latestVersion);

  if (!current || !latest) {
    return false;
  }

  for (let index = 0; index < 3; index += 1) {
    if (latest[index] > current[index]) {
      return true;
    }
    if (latest[index] < current[index]) {
      return false;
    }
  }

  return false;
};
