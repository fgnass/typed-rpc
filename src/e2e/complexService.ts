export const complexService = {
  startOfEpoch() {
    return new Date(0);
  },
  dayOfWeek(date: Date) {
    return date.toLocaleDateString("en", { weekday: "long" });
  },
};

export type ComplexService = typeof complexService;
