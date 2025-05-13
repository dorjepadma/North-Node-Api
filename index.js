require("dotenv").config();
const express = require("express");
const swisseph = require('swisseph-v2');
const path = require("path");
const cors = require("cors");
const { DateTime } = require("luxon");
const geoTz = require('geo-tz'); // Add this package

const app = express();
app.use(cors({
  origin: [
    "https://www.janspiller.com", 
    "http://astro-sand-box.local"
  ]
}));

const PORT = 3000;

// 📂 Set Swiss Ephemeris path
swisseph.swe_set_ephe_path(path.join(__dirname, "ephe"));
console.log("📂 Ephemeris path set to:", path.join(__dirname, "ephe"));

// ♈ Zodiac signs
const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
];

// Function to convert degrees to zodiac sign and position
function degreesToZodiac(degrees) {
  if (degrees === undefined || degrees === null) {
    return "Unknown position";
  }
  const sign = SIGNS[Math.floor(degrees / 30) % 12];
  const position = Math.floor(degrees % 30);
  const minutes = Math.floor((degrees % 1) * 60);
  return `${position}°${minutes}' ${sign} (${degrees.toFixed(2)}°)`;
}

// Function to get ordinal suffix
function getOrdinal(n) {
  const j = n % 10, k = n % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}

/**
 * Process timezone and DST information using modern libraries
 * @param {number} longitude - The longitude coordinate
 * @param {number} latitude - The latitude coordinate
 * @param {number} year - The year
 * @param {number} month - The month (1-12)
 * @param {number} day - The day of month
 * @param {number} hour - The hour (0-24)
 * @param {string|null} tzParam - Optional timezone parameter
 * @returns {Object} Timezone information with id and offset
 */
function processTimezone(longitude, latitude, year, month, day, hour, tzParam = null) {
  // If explicit timezone is provided, parse and use it
  if (tzParam) {
    console.log(`🌐 Parsing explicit timezone parameter: ${tzParam}`);
    
    // Handle formats like "EST+5:00" or "EST-5:00"
    const complexMatch = tzParam.match(/([A-Z]+)?([+-])(\d+)(?::(\d+))?/);
    if (complexMatch) {
      const code = complexMatch[1] || "UTC";
      const sign = complexMatch[2] === '+' ? 1 : -1;
      const hours = parseInt(complexMatch[3]);
      const minutes = complexMatch[4] ? parseInt(complexMatch[4]) : 0;
      const offset = sign * (hours + minutes / 60);
      
      console.log(`🌐 Parsed timezone: ${code} (UTC${offset >= 0 ? '+' : ''}${offset})`);
      
      // For EST+5:00 format, this means EST is 5 hours ahead of UTC, so we need to negate
      return {
        id: code,
        offset: -offset  // Negate the offset for calculations
      };
    }
    
    // Also try to parse simple numeric offsets like "5" or "-5"
    const simpleMatch = tzParam.match(/^([+-])?(\d+)$/);
    if (simpleMatch) {
      const sign = simpleMatch[1] === '-' ? -1 : 1;
      const hours = parseInt(simpleMatch[2]);
      
      console.log(`🌐 Using numeric timezone offset: UTC${sign >= 0 ? '+' : ''}${sign * hours}`);
      
      return {
        id: "UTC",
        offset: sign * hours
      };
    }
  }
  
  // Use geo-tz to determine the timezone for the given coordinates
  const tzid = geoTz(latitude, longitude)[0];
  console.log(`🌎 Determined timezone from coordinates: ${tzid}`);
  
  // Create a DateTime object for the given date and timezone
  const dateTime = DateTime.fromObject({
    year,
    month,
    day,
    hour
  }, { zone: tzid });
  
  // Extract timezone information from the DateTime object
  const offset = -dateTime.offset / 60; // Convert minutes to hours and negate for astronomical calculations
  
  console.log(`🕒 Date: ${year}-${month}-${day} ${hour}:00 in ${tzid}`);
  console.log(`🕒 UTC Offset: ${offset} hours (including DST: ${dateTime.isInDST})`);
  
  return {
    id: tzid,
    offset: offset,
    isDST: dateTime.isInDST
  };
}

// API route handler for North Node calculation
app.get("/north-node", (req, res) => {
  const { year, month, day, hour, lat, lon, tz } = req.query;

  if (!year || !month || !day || !hour || !lat || !lon) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  // 🔢 Parse inputs
  const localYear = parseInt(year);
  const localMonth = parseInt(month);
  const localDay = parseInt(day);
  const localHour = parseFloat(hour);
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  
  // Add test case detection
  if (localYear === 1971 && localMonth === 4) {
    console.log(`\n\n🧪 TEST CASE DETECTED: April ${localDay}, 1971 at ${localHour} hours`);
    console.log(`🌎 Location: ${latNum}° lat, ${lonNum}° lon\n\n`);
  }
  
  // Process timezone - use explicit timezone if provided, otherwise determine based on location
  const timezone = processTimezone(lonNum, latNum, localYear, localMonth, localDay, localHour, tz);
  console.log(`🕒 Using timezone: ${timezone.id} (UTC${timezone.offset >= 0 ? '+' : ''}${timezone.offset})`);

  // Convert local time to UT
  let utHour = localHour - timezone.offset;

  // Ensure UT hour is within proper range (0-24)
  let dayAdjustment = 0;
  while (utHour < 0) {
    utHour += 24;
    dayAdjustment -= 1;
  }
  while (utHour >= 24) {
    utHour -= 24;
    dayAdjustment += 1;
  }

  // Create a Date object to handle date adjustments correctly
  const localDate = new Date(localYear, localMonth - 1, localDay);
  // Apply the day adjustment if any
  if (dayAdjustment !== 0) {
    localDate.setDate(localDate.getDate() + dayAdjustment);
  }
  
  // Get the adjusted date components for UT
  const utYear = localDate.getFullYear();
  const utMonth = localDate.getMonth() + 1; // Convert 0-based month to 1-based
  const utDay = localDate.getDate();
  
  if (dayAdjustment !== 0) {
    console.log(`📅 Date adjusted for UT: ${utYear}-${utMonth}-${utDay}`);
  }

  // Calculate Julian Day with UT time
  const jd = swisseph.swe_julday(utYear, utMonth, utDay, utHour, swisseph.SE_GREG_CAL);
  
  // Enhanced logging for 1971 test case
  if (localYear === 1971 && localMonth === 4) {
    console.log(`\n🕰️ DETAILED TIME CALCULATIONS:`);
    console.log(`   - Local date/time: ${localYear}-${localMonth}-${localDay} ${localHour.toFixed(4)}`);
    console.log(`   - Timezone offset: ${timezone.offset} hours (DST: ${timezone.isDST ? "Yes" : "No"})`);
    console.log(`   - UT date/time: ${utYear}-${utMonth}-${utDay} ${utHour.toFixed(4)}`);
    console.log(`   - Julian Day: ${jd.toFixed(6)}`);
  }
  
  console.log(`🕒 Local time: ${localHour.toFixed(4)} hours`);
  console.log(`🕒 UT time: ${utHour.toFixed(4)} hours`);
  console.log("🧲 Julian Day:", jd);
  console.log("📍 Parsed lat/lon:", latNum, lonNum);

  // Get sidereal time
  const sidtime = swisseph.swe_sidtime(jd);
  console.log("🕒 Sidereal time:", sidtime.siderialTime);
  
  // Debug calculations
  const sidTimeDegrees = sidtime.siderialTime * 15; // hours to degrees
  console.log(`🕒 Sidereal time in degrees: ${sidTimeDegrees.toFixed(2)}°`);
  const calculatedMC = (sidTimeDegrees + 180) % 360;
  console.log(`🔍 Calculated MC from sidereal time (western): ${calculatedMC.toFixed(2)}°`);

  // 🌙 Calculate True Node position
  swisseph.swe_calc_ut(jd, swisseph.SE_TRUE_NODE, swisseph.SEFLG_SWIEPH, (nodeResult) => {
    if (!nodeResult || typeof nodeResult.longitude !== "number") {
      return res.status(500).json({ error: "Failed to calculate North Node" });
    }

    const nodeLon = nodeResult.longitude;
    const nodeLat = nodeResult.latitude;

    // 🏠 Calculate house cusps with Placidus method
    const houseResult = swisseph.swe_houses(jd, latNum, lonNum, 'P');
    
    if (!houseResult || !houseResult.house || !houseResult.armc) {
      return res.status(500).json({ error: "House calculation failed" });
    }

    const ascendant = houseResult.ascendant;
    const mc = houseResult.mc;
    const cusps = houseResult.house;

    // Log all house cusps with zodiac positions
    console.log("🏠 House cusps with zodiac positions:");
    for (let i = 0; i < 12; i++) {
      console.log(`House ${i+1}: ${degreesToZodiac(cusps[i])}`);
    }

    console.log(`🌙 North Node position: ${degreesToZodiac(nodeLon)}`);

    // Initialize house variable and determine which house the North Node falls in
    let house = 0;
    
    // Loop through each house to find where the North Node falls
    for (let i = 0; i < 12; i++) {
      // Get the current cusp position
      const currentCusp = cusps[i];
      
      // Get the next cusp, with wrap-around to the first cusp if needed
      const nextCusp = (i === 11) ? cusps[0] : cusps[i + 1];
      
      // Some house cusps might cross over 0° Aries, so we need special handling
      if (nextCusp < currentCusp) {
        // This house wraps around 0° Aries (e.g. from 350° to 10°)
        console.log(`⭕ House ${i+1} wraps across 0° Aries`);
        
        // Check if Node is after the current cusp OR before the next cusp
        if ((nodeLon >= currentCusp) || (nodeLon < nextCusp)) {
          house = i + 1; // House numbers are 1-12, not 0-11
          console.log(`✅ Node found in house ${house} (wrap case)`);
          break;
        }
      } else {
        // Normal case - house doesn't cross 0° Aries
        if (nodeLon >= currentCusp && nodeLon < nextCusp) {
          house = i + 1; // House numbers are 1-12, not 0-11
          console.log(`✅ Node found in house ${house} (normal case)`);
          break;
        }
      }
    }

    console.log(`🌟 Final house assignment for Node: ${house}`);

    // Prepare results for response
    const signIndex = Math.floor(nodeLon / 30);
    const sign = SIGNS[signIndex];
    const degrees = Math.floor(nodeLon % 30);
    const minutes = Math.round((nodeLon % 1) * 60);

    // Send the response
    res.json({
      sign,
      degrees,
      minutes,
      longitude: nodeLon,
      house,
      formatted: `${degrees}° ${sign} in the ${house}${getOrdinal(house)} house`
    });
  });
});

// Add a test endpoint to check a specific date/time in multiple locations
app.get("/test-timezone", (req, res) => {
  const { year, month, day, hour } = req.query;
  
  if (!year || !month || !day || !hour) {
    return res.status(400).json({ error: "Missing date/time parameters" });
  }
  
  const testYear = parseInt(year);
  const testMonth = parseInt(month);
  const testDay = parseInt(day);
  const testHour = parseFloat(hour);
  
  // Test locations
  const locations = [
    { name: "Manchester, CT", lat: 41.7759, lon: -72.5215 },
    { name: "New York, NY", lat: 40.7128, lon: -74.0060 },
    { name: "Boston, MA", lat: 42.3601, lon: -71.0589 },
    { name: "Halifax, NS", lat: 44.6488, lon: -63.5752 },
    { name: "Chicago, IL", lat: 41.8781, lon: -87.6298 },
    { name: "Los Angeles, CA", lat: 34.0522, lon: -118.2437 },
    { name: "London, UK", lat: 51.5074, lon: -0.1278 },
    { name: "Paris, France", lat: 48.8566, lon: 2.3522 },
    { name: "Tokyo, Japan", lat: 35.6762, lon: 139.6503 }
  ];
  
  const results = locations.map(location => {
    const tz = processTimezone(location.lon, location.lat, testYear, testMonth, testDay, testHour);
    
    return {
      location: location.name,
      coordinates: `${location.lat}, ${location.lon}`,
      timezone: tz.id,
      utcOffset: tz.offset,
      isDST: tz.isDST
    };
  });
  
  res.json({
    title: `Timezone Test for ${testYear}-${testMonth}-${testDay} ${testHour}:00`,
    results
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 North Node API running on http://localhost:${PORT}`);
  console.log(`📌 Test endpoints available at: 
    - http://localhost:${PORT}/test-timezone?year=1971&month=4&day=18&hour=5.25
    - http://localhost:${PORT}/north-node?year=1971&month=4&day=18&hour=5.25&lat=41.7759301&lon=-72.5215008&tz=EST+5:00`);
});
