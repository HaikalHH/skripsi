export const getScoreGrade = (score: number) => {
  if (score >= 85) return "A";
  if (score >= 72) return "B";
  if (score >= 58) return "C";
  if (score >= 45) return "D";
  return "E";
};

export const getHealthVerdict = (score: number) => {
  if (score >= 85) return "sangat sehat";
  if (score >= 72) return "cukup sehat";
  if (score >= 58) return "lumayan, tapi masih ada yang perlu dirapikan";
  if (score >= 45) return "perlu perhatian";
  return "sedang kurang sehat dan butuh dibenahi";
};
