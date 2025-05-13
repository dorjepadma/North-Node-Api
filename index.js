// ✯ North Node API with Swiss Ephemeris and accurate house determination
require("dotenv").config();
const express = require("express");
const swisseph = require('swisseph-v2');
const path = require("path");
const cors = require("cors");
const { DateTime } = require("luxon");

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

// Helper function to get the last specified day of a month
function getLastDayOfMonth(year, month, targetDayOfWeek) {
  // Get the last day of the month
  const lastDay = new Date(year, month, 0).getDate();
  
  // Start from the last day of the month
  let date = new Date(year, month - 1, lastDay);
  
  // Move backwards until we find the target day of week
  while (date.getDay() !== targetDayOfWeek) {
    date.setDate(date.getDate() - 1);
  }
  
  return date.getDate();
}

// Helper function to get the nth specified day of a month
function getNthDayOfMonth(year, month, dayOfWeek, n) {
  // Create a date for the first day of the month
  const date = new Date(year, month - 1, 1);
  
  // Find the day of week of the first day
  const firstDayOfWeek = date.getDay();
  
  // Calculate the date of the first occurrence of the specified day
  let firstOccurrence = 1 + ((dayOfWeek - firstDayOfWeek + 7) % 7);
  
  // Calculate the date of the nth occurrence
  return firstOccurrence + (n - 1) * 7;
}

// Process timezone information from request
function processTimezone(longitude, latitude, year, month, day, hour, tzParam = null) {
  // If the user has explicitly provided a timezone, parse and use it
  if (tzParam) {
    // Parse formats like "EST+5:00" or "EST-5:00" or "EST+5" or "+5:00"
    const complexMatch = tzParam.match(/([A-Z]+)?([+-])(\d+)(?::(\d+))?/);
    if (complexMatch) {
      const code = complexMatch[1] || "UTC";
      const sign = complexMatch[2] === '+' ? 1 : -1;
      const hours = parseInt(complexMatch[3]);
      const minutes = complexMatch[4] ? parseInt(complexMatch[4]) : 0;
      const offset = sign * (hours + minutes / 60);
      
      console.log(`🌐 Using explicit timezone: ${code} (UTC${offset >= 0 ? '+' : ''}${offset})`);
      
      return {
        id: code,
        offset: offset
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
  
  // Define timezone boundaries based on longitude
  const timezonesByLongitude = [
    { min: -180, max: -165, id: "Pacific/Midway", stdOffset: -11 },
    { min: -165, max: -150, id: "Pacific/Honolulu", stdOffset: -10 },
    { min: -150, max: -135, id: "America/Anchorage", stdOffset: -9 },
    { min: -135, max: -120, id: "America/Los_Angeles", stdOffset: -8 },
    { min: -120, max: -105, id: "America/Denver", stdOffset: -7 },
    { min: -105, max: -90, id: "America/Chicago", stdOffset: -6 },
    { min: -90, max: -75, id: "America/New_York", stdOffset: -5 },
    { min: -75, max: -60, id: "America/Halifax", stdOffset: -4 },
    { min: -60, max: -45, id: "America/St_Johns", stdOffset: -3.5 },
    { min: -45, max: -30, id: "America/Godthab", stdOffset: -3 },
    { min: -30, max: -15, id: "Atlantic/Azores", stdOffset: -1 },
    { min: -15, max: 0, id: "Europe/London", stdOffset: 0 },
    { min: 0, max: 15, id: "Europe/Paris", stdOffset: 1 },
    { min: 15, max: 30, id: "Europe/Helsinki", stdOffset: 2 },
    { min: 30, max: 45, id: "Europe/Moscow", stdOffset: 3 },
    { min: 45, max: 60, id: "Asia/Dubai", stdOffset: 4 },
    { min: 60, max: 75, id: "Asia/Karachi", stdOffset: 5 },
    { min: 75, max: 90, id: "Asia/Dhaka", stdOffset: 6 },
    { min: 90, max: 105, id: "Asia/Bangkok", stdOffset: 7 },
    { min: 105, max: 120, id: "Asia/Shanghai", stdOffset: 8 },
    { min: 120, max: 135, id: "Asia/Tokyo", stdOffset: 9 },
    { min: 135, max: 150, id: "Australia/Sydney", stdOffset: 10 },
    { min: 150, max: 165, id: "Pacific/Guadalcanal", stdOffset: 11 },
    { min: 165, max: 180, id: "Pacific/Auckland", stdOffset: 12 },
  ];
  
  // Find the timezone entry based on longitude
  let timezoneEntry = timezonesByLongitude.find(
    (tz) => longitude >= tz.min && longitude < tz.max
  ) || { id: "UTC", stdOffset: 0 };
  
  // Known DST rules for specific regions and time periods
  let dstOffset = 0;
  
  // US/Canada DST handling
  if (timezoneEntry.id.startsWith("America/")) {
    // For US East Coast
    if (timezoneEntry.id === "America/New_York") {
      // 1966-1986: Last Sunday in April to Last Sunday in October
      if (year >= 1966 && year <= 1986) {
        const dstStartDay = getLastDayOfMonth(year, 4, 0); // Last Sunday in April
        const dstEndDay = getLastDayOfMonth(year, 10, 0); // Last Sunday in October
        
        console.log(`🔍 US DST 1966-1986: Starts on April ${dstStartDay}, ends on October ${dstEndDay}`);
        console.log(`📅 Checking date: ${month}/${day}/${year}`);
        
        if ((month > 4 && month < 10) ||
            (month === 4 && day >= dstStartDay) ||
            (month === 10 && day < dstEndDay)) {
          dstOffset = 1;
          console.log(`✅ DST applies: +${dstOffset} hour offset`);
        } else {
          console.log(`❌ DST does not apply`);
        }
      }
      // 1987-2006: First Sunday in April to Last Sunday in October
      else if (year >= 1987 && year <= 2006) {
        const dstStartDay = getNthDayOfMonth(year, 4, 0, 1); // First Sunday
        const dstEndDay = getLastDayOfMonth(year, 10, 0);
        
        console.log(`🔍 US DST 1987-2006: Starts on April ${dstStartDay}, ends on October ${dstEndDay}`);
        console.log(`📅 Checking date: ${month}/${day}/${year}`);
        
        if ((month > 4 && month < 10) ||
            (month === 4 && day >= dstStartDay) ||
            (month === 10 && day < dstEndDay)) {
          dstOffset = 1;
          console.log(`✅ DST applies: +${dstOffset} hour offset`);
        } else {
          console.log(`❌ DST does not apply`);
        }
      }
      // 2007-present: Second Sunday in March to First Sunday in November
      else if (year >= 2007) {
        const dstStartDay = getNthDayOfMonth(year, 3, 0, 2); // Second Sunday
        const dstEndDay = getNthDayOfMonth(year, 11, 0, 1); // First Sunday
        
        console.log(`🔍 US DST 2007-present: Starts on March ${dstStartDay}, ends on November ${dstEndDay}`);
        console.log(`📅 Checking date: ${month}/${day}/${year}`);
        
        if ((month > 3 && month < 11) ||
            (month === 3 && day >= dstStartDay) ||
            (month === 11 && day < dstEndDay)) {
          dstOffset = 1;
          console.log(`✅ DST applies: +${dstOffset} hour offset`);
        } else {
          console.log(`❌ DST does not apply`);
        }
      }
    }
    // For Halifax and Atlantic Canada
    else if (timezoneEntry.id === "America/Halifax") {
      // Halifax followed similar rules to US but with some variations
      if (year >= 1966 && year <= 1986) {
        const dstStartDay = getLastDayOfMonth(year, 4, 0); // Last Sunday in April
        const dstEndDay = getLastDayOfMonth(year, 10, 0); // Last Sunday in October
        
        console.log(`🔍 Halifax DST 1966-1986: Starts on April ${dstStartDay}, ends on October ${dstEndDay}`);
        console.log(`📅 Checking date: ${month}/${day}/${year}`);
        
        if ((month > 4 && month < 10) ||
            (month === 4 && day >= dstStartDay) ||
            (month === 10 && day < dstEndDay)) {
          dstOffset = 1;
          console.log(`✅ DST applies: +${dstOffset} hour offset`);
        } else {
          console.log(`❌ DST does not apply`);
        }
      }
    }
  }
  // Europe DST handling
  else if (timezoneEntry.id.startsWith("Europe/")) {
    if (year >= 1980) {
      // 1980-1996: Last Sunday in March to Last Sunday in September
      if (year <= 1996) {
        const dstStartDay = getLastDayOfMonth(year, 3, 0); // Last Sunday in March
        const dstEndDay = getLastDayOfMonth(year, 9, 0); // Last Sunday in September
        
        console.log(`🔍 European DST 1980-1996: Starts on March ${dstStartDay}, ends on September ${dstEndDay}`);
        console.log(`📅 Checking date: ${month}/${day}/${year}`);
        
        if ((month > 3 && month < 9) ||
            (month === 3 && day >= dstStartDay) ||
            (month === 9 && day < dstEndDay)) {
          dstOffset = 1;
          console.log(`✅ DST applies: +${dstOffset} hour offset`);
        } else {
          console.log(`❌ DST does not apply`);
        }
      }
      // 1997-present: Last Sunday in March to Last Sunday in October
      else {
        const dstStartDay = getLastDayOfMonth(year, 3, 0); // Last Sunday in March
        const dstEndDay = getLastDayOfMonth(year, 10, 0); // Last Sunday in October
        
        console.log(`🔍 European DST 1997-present: Starts on March ${dstStartDay}, ends on October ${dstEndDay}`);
        console.log(`📅 Checking date: ${month}/${day}/${year}`);
        
        if ((month > 3 && month < 10) ||
            (month === 3 && day >= dstStartDay) ||
            (month === 10 && day < dstEndDay)) {
          dstOffset = 1;
          console.log(`✅ DST applies: +${dstOffset} hour offset`);
        } else {
          console.log(`❌ DST does not apply`);
        }
      }
    }
  }
  
  // Return timezone info
  return {
    id: timezoneEntry.id,
    offset: timezoneEntry.stdOffset + dstOffset
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
  
  // Process timezone - use explicit timezone if provided, otherwise estimate based on location
  const timezone = processTimezone(lonNum, latNum, localYear, localMonth, localDay, localHour, tz);
  console.log(`🕒 Using timezone: ${timezone.id} (UTC${timezone.offset >= 0 ? '+' : ''}${timezone.offset})`);

  // Convert local time to UT
  let utHour = localHour - timezone.offset;

  // Ensure UT hour is within proper range (0-24)
  while (utHour < 0) utHour += 24;
  while (utHour >= 24) utHour -= 24;

  // Calculate Julian Day with UT time
  const jd = swisseph.swe_julday(localYear, localMonth, localDay, utHour, swisseph.SE_GREG_CAL);
  
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

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 North Node API running on http://localhost:${PORT}`);
});
