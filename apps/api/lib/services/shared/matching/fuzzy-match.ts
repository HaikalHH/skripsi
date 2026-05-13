const tokenize = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const getMaxTypoDistance = (length: number) => {
  if (length <= 4) return 1;
  if (length <= 10) return 2;
  return 3;
};

export const levenshteinDistance = (
  leftRaw: string,
  rightRaw: string,
  maxDistance = Number.POSITIVE_INFINITY
) => {
  const left = leftRaw.trim();
  const right = rightRaw.trim();
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  if (Math.abs(left.length - right.length) > maxDistance) {
    return maxDistance + 1;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let current = [row];
    let rowMin = current[0];

    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      const candidate = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + substitutionCost
      );
      current[column] = candidate;
      if (candidate < rowMin) rowMin = candidate;
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    for (let column = 0; column <= right.length; column += 1) {
      previous[column] = current[column];
    }
  }

  return previous[right.length];
};

export const isFuzzyTokenMatch = (leftRaw: string, rightRaw: string) => {
  const left = leftRaw.trim().toLowerCase();
  const right = rightRaw.trim().toLowerCase();
  if (!left || !right) return false;
  if (left === right) return true;

  const longestLength = Math.max(left.length, right.length);
  if (longestLength < 3) return false;

  const maxDistance = getMaxTypoDistance(longestLength);
  if (Math.abs(left.length - right.length) > maxDistance) return false;

  const leftPrefix = left.slice(0, Math.min(2, left.length));
  const rightPrefix = right.slice(0, Math.min(2, right.length));
  if (leftPrefix !== rightPrefix && left[0] !== right[0]) return false;

  return levenshteinDistance(left, right, maxDistance) <= maxDistance;
};

export const isFuzzyPhraseMatch = (leftRaw: string, rightRaw: string) => {
  const leftTokens = tokenize(leftRaw.toLowerCase());
  const rightTokens = tokenize(rightRaw.toLowerCase());
  if (!leftTokens.length || leftTokens.length !== rightTokens.length) return false;

  let hasTypoCorrection = false;
  for (let index = 0; index < leftTokens.length; index += 1) {
    if (leftTokens[index] === rightTokens[index]) continue;
    if (!isFuzzyTokenMatch(leftTokens[index], rightTokens[index])) return false;
    hasTypoCorrection = true;
  }

  return hasTypoCorrection;
};
