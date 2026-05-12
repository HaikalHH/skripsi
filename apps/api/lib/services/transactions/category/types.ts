export type CategoryOverrideResult = {
  cleanedText: string;
  forcedCategory: string | null;
};

export type ExpenseBucketMatch = {
  alias: string;
  bucket: string;
  index: number;
};
