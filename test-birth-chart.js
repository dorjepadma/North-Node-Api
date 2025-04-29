const swisseph = require("swisseph");
const path = require("path");

// Set ephemeris path
swisseph.swe_set_ephe_path(path.join(__dirname, "ephe"));
console.log("📂 Ephemeris path set to:", path.join(__dirname, "ephe"));

// Function to convert degrees to zodiac sign and position
function degreesToZodiac(degrees) {
  const SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
  ];
  const sign = SIGNS[Math.floor(degrees / 30)];
  const position = Math.floor(degrees % 30);
  const minutes = Math.floor((degrees % 1) * 60);
  return `${position}°${minutes}' ${sign} (${degrees.toFixed(2)}°)`;
}

// Test with explicit birth data
const birthYear = 1971;
const birthMonth = 8;  // August = 8 in JavaScript
const birthDay = 25;
const birthHour = 16 + (29/60);  // 4:29 PM = 16:29 decimal hours
const timezone = -7;  // Mountain Time (adjust if different in 1971)

// Calculate UT time by adjusting for timezone
const utHour = birthHour - timezone;  // Adjust local time to UT
console.log(`🕒 Birth local time: ${birthHour.toFixed(4)} hours`);
console.log(`🕒 Timezone offset: ${timezone} hours`);
console.log(`🕒 Birth UT time: ${utHour.toFixed(4)} hours`);

// Calculate Julian Day with UT time
const jd = swisseph.swe_julday(
  birthYear,
  birthMonth,
  birthDay,
  utHour,
  swisseph.SE_GREG_CAL
);
console.log(`🧲 Julian Day: ${jd}`);

// Calculate houses
const lat = 36.0441834;  // Truchas, NM latitude
const lon = -105.8127561;  // Truchas, NM longitude (negative for western)
const houseResult = swisseph.swe_houses(jd, lat, lon, 'P');
console.log(`🔺 Ascendant: ${degreesToZodiac(houseResult.ascendant)}`);
console.log(`🌠 Midheaven (MC): ${degreesToZodiac(houseResult.mc)}`);

// Calculate True Node position
swisseph.swe_calc_ut(jd, swisseph.SE_TRUE_NODE, swisseph.SEFLG_SWIEPH, (nodeResult) => {
  if (!nodeResult || typeof nodeResult.longitude !== "number") {
    console.log("Failed to calculate North Node");
    return;
  }

  const nodeLon = nodeResult.longitude;
  console.log(`🌀 North Node: ${degreesToZodiac(nodeLon)}`);
  
  // Log all house cusps
  console.log("🏠 House cusps with zodiac positions:");
  for (let i = 0; i < 12; i++) {
    console.log(`House ${i+1}: ${degreesToZodiac(houseResult.house[i])}`);
  }
  
  // Determine which house the North Node is in
  let nodeHouse = 0;
  for (let i = 0; i < 12; i++) {
    const currentCusp = houseResult.house[i];
    const nextCusp = (i === 11) ? houseResult.house[0] : houseResult.house[i + 1];
    
    if (nextCusp < currentCusp) {
      // House wraps around 0° Aries
      if ((nodeLon >= currentCusp) || (nodeLon < nextCusp)) {
        nodeHouse = i + 1;
        console.log(`🏠 North Node in house ${nodeHouse} (wrap case)`);
        break;
      }
    } else {
      // Normal case
      if (nodeLon >= currentCusp && nodeLon < nextCusp) {
        nodeHouse = i + 1;
        console.log(`🏠 North Node in house ${nodeHouse} (normal case)`);
        break;
      }
    }
  }
});
