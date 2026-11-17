function getTimeOfDayBucket(hour) {
  if (hour >= 0 && hour < 6) return 'Early Morning';
  if (hour >= 6 && hour < 11) return 'Morning';
  if (hour >= 11 && hour < 16) return 'Afternoon';
  if (hour >= 16 && hour < 21) return 'Evening';
  return 'Night';
}

function getDayType(dayOfWeek) {
  return (dayOfWeek === 0 || dayOfWeek === 6) ? 'Weekend' : 'Weekday';
}

function recencyWeight(tripDate, halfLifeDays, now = new Date()) {
  const daysAgo = (now.getTime() - new Date(tripDate).getTime()) / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, daysAgo / halfLifeDays);
}

// Takes an array of trips shaped like { netEarning, distanceKm, tripDate }
// and returns a single recency-weighted "net earning per km" score for that group.
function computeSlotScore(trips, halfLifeDays = 14, now = new Date()) {
  let weightedSum = 0;
  let weightTotal = 0;

  for (const trip of trips) {
    const netPerKm = Number(trip.netEarning) / Number(trip.distanceKm);
    const weight = recencyWeight(trip.tripDate, halfLifeDays, now);
    weightedSum += netPerKm * weight;
    weightTotal += weight;
  }

  const weightedAvgNetPerKm = weightTotal > 0 ? weightedSum / weightTotal : 0;

  return {
    weightedAvgNetPerKm: Math.round(weightedAvgNetPerKm * 100) / 100,
    tripCount: trips.length,
  };
}

module.exports = { getTimeOfDayBucket, getDayType, recencyWeight, computeSlotScore };