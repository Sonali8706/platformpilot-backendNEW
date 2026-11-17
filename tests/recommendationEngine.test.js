const { getTimeOfDayBucket, getDayType, recencyWeight, computeSlotScore } = require('../utils/recommendationEngine');

describe('getTimeOfDayBucket', () => {
  test('classifies early morning hours', () => {
    expect(getTimeOfDayBucket(0)).toBe('Early Morning');
    expect(getTimeOfDayBucket(5)).toBe('Early Morning');
  });

  test('classifies morning hours', () => {
    expect(getTimeOfDayBucket(6)).toBe('Morning');
    expect(getTimeOfDayBucket(10)).toBe('Morning');
  });

  test('classifies afternoon hours', () => {
    expect(getTimeOfDayBucket(11)).toBe('Afternoon');
    expect(getTimeOfDayBucket(15)).toBe('Afternoon');
  });

  test('classifies evening hours', () => {
    expect(getTimeOfDayBucket(16)).toBe('Evening');
    expect(getTimeOfDayBucket(20)).toBe('Evening');
  });

  test('classifies night hours', () => {
    expect(getTimeOfDayBucket(21)).toBe('Night');
    expect(getTimeOfDayBucket(23)).toBe('Night');
  });
});

describe('getDayType', () => {
  test('classifies Sunday and Saturday as Weekend', () => {
    expect(getDayType(0)).toBe('Weekend');
    expect(getDayType(6)).toBe('Weekend');
  });

  test('classifies Monday through Friday as Weekday', () => {
    expect(getDayType(1)).toBe('Weekday');
    expect(getDayType(3)).toBe('Weekday');
    expect(getDayType(5)).toBe('Weekday');
  });
});

describe('recencyWeight', () => {
  const now = new Date('2026-07-23T00:00:00.000Z');

  test('a trip from today gets essentially full weight', () => {
    const weight = recencyWeight(now, 14, now);
    expect(weight).toBeCloseTo(1, 5);
  });

  test('a trip exactly one half-life old gets half weight', () => {
    const fourteenDaysAgo = new Date('2026-07-09T00:00:00.000Z');
    const weight = recencyWeight(fourteenDaysAgo, 14, now);
    expect(weight).toBeCloseTo(0.5, 2);
  });

  test('a trip two half-lives old gets a quarter weight', () => {
    const twentyEightDaysAgo = new Date('2026-06-25T00:00:00.000Z');
    const weight = recencyWeight(twentyEightDaysAgo, 14, now);
    expect(weight).toBeCloseTo(0.25, 2);
  });
});

describe('computeSlotScore', () => {
  const now = new Date('2026-07-23T00:00:00.000Z');

  test('returns zero score and zero count for an empty slot', () => {
    const result = computeSlotScore([], 14, now);
    expect(result.weightedAvgNetPerKm).toBe(0);
    expect(result.tripCount).toBe(0);
  });

  test("a single trip's net-per-km is the score, regardless of its weight", () => {
    const trips = [
      { netEarning: 50, distanceKm: 5, tripDate: now }, // 10 net/km, today
    ];
    const result = computeSlotScore(trips, 14, now);
    expect(result.weightedAvgNetPerKm).toBeCloseTo(10, 2);
    expect(result.tripCount).toBe(1);
  });

  test('a recent trip outweighs an old trip with a very different value', () => {
    const recentTrip = { netEarning: 100, distanceKm: 5, tripDate: now }; // 20 net/km, today
    const oldTrip = { netEarning: 10, distanceKm: 5, tripDate: new Date('2026-05-01T00:00:00.000Z') }; // 2 net/km, ~83 days ago

    const result = computeSlotScore([recentTrip, oldTrip], 14, now);

    // A simple, unweighted average of 20 and 2 would be 11 — the recency weighting
    // should pull the real result much closer to the recent trip's value instead.
    expect(result.weightedAvgNetPerKm).toBeGreaterThan(15);
  });

  test('two equally-recent trips average their net-per-km evenly', () => {
    const tripA = { netEarning: 40, distanceKm: 4, tripDate: now }; // 10 net/km
    const tripB = { netEarning: 60, distanceKm: 4, tripDate: now }; // 15 net/km

    const result = computeSlotScore([tripA, tripB], 14, now);
    expect(result.weightedAvgNetPerKm).toBeCloseTo(12.5, 2);
  });
});