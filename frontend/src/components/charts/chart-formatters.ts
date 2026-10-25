// Phibe's finance chart is monthly, so the day is left out.
export const shortDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

export const weekdayDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

// `Intl.NumberFormat.prototype.format` is a bound getter — safe to extract.
export const intFmt = new Intl.NumberFormat("en-US").format;
