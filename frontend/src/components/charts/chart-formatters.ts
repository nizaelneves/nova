// Phibe's finance chart is monthly, so the day is left out.
export const shortDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
});

export const weekdayDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

export const hmsTimeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

// `Intl.NumberFormat.prototype.format` is a bound getter — safe to extract.
export const intFmt = new Intl.NumberFormat("en-US").format;
