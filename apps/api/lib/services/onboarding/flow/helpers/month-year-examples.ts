const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta"
});

const getCurrentJakartaMonthYear = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jakarta"
  }).formatToParts(new Date());

  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");

  return { month, year };
};

export const getTargetMonthYearExamples = () => {
  const { month, year } = getCurrentJakartaMonthYear();
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const numeric = `${String(nextMonth).padStart(2, "0")}/${nextYear}`;
  const long = MONTH_YEAR_FORMATTER.format(new Date(Date.UTC(nextYear, nextMonth - 1, 1, 12)));

  return { numeric, long };
};
