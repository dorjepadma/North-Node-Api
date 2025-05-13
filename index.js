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

/**
 * Map longitude to IANA timezone identifier
 * This is a simplified version that covers major US and international timezones
 */
function getLikelyTimezoneId(longitude, latitude) {
  // US locations with state-specific handling
  if (latitude >= 24 && latitude <= 50 && longitude >= -125 && longitude <= -66) {
    // Eastern US (includes Connecticut)
    if (longitude >= -83 && longitude <= -66) {
      return "America/New_York";  // UTC-5
    }
    // Central US
    else if (longitude >= -93 && longitude < -83) {
      return "America/Chicago";  // UTC-6
    }
    // Mountain US
    else if (longitude >= -112 && longitude < -93) {
      return "America/Denver";  // UTC-7
    }
    // Pacific US
    else if (longitude >= -125 && longitude < -112) {
      return "America/Los_Angeles";  // UTC-8
    }
  }
  
  // International locations (simplified mapping)
  if (longitude >= -14 && longitude <= 0) {
    return "Europe/London";  // UTC+0
  } else if (longitude > 0 && longitude <= 30) {
    return "Europe/Paris";   // UTC+1
  } else if (longitude > 30 && longitude <= 60) {
    return "Europe/Moscow";  // UTC+3
  } else if (longitude > 60 && longitude <= 90) {
    return "Asia/Kolkata";   // UTC+5:30
  } else if (longitude > 90 && longitude <= 135) {
    return "Asia/Shanghai";  // UTC+8
  } else if (longitude > 135 && longitude <= 150) {
    return "Asia/Tokyo";     // UTC+9
  } else if (longitude > 150 && longitude <= 180) {
    return "Pacific/Auckland"; // UTC+12
  } else if (longitude > -60 && longitude <= -14) {
    return "Atlantic/Azores"; // UTC-1
  } else if (longitude > -150 && longitude <= -125) {
    return "America/Anchorage"; // UTC-9
  } else {
    return "Etc/UTC";
  }
}

/**
 * Process timezone and DST information
 * Combines the best of both approaches: manual DST calculation for reliability
 * with Luxon support for additional verification
 */
function processTimezone(longitude, latitude, year, month, day, hour, tzParam = null) {
  // Debug info for analysis
  const debugDetails = {
    source: "unknown",
    originalParams: { year, month, day, hour, longitude, latitude, tzParam }
  };
  
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
      
      debugDetails.source = "explicit_tz_param";
      return {
        id: code,
        offset: -offset,  // Negate the offset for calculations
        isDST: false,     // Can't determine DST from just the offset
        debug: debugDetails
      };
    }
    
    // Also try to parse simple numeric offsets like "5" or "-5"
    const simpleMatch = tzParam.match(/^([+-])?(\d+)$/);
    if (simpleMatch) {
      const sign = simpleMatch[1] === '-' ? -1 : 1;
      const hours = parseInt(simpleMatch[2]);
      
      console.log(`🌐 Using numeric timezone offset: UTC${sign >= 0 ? '+' : ''}${sign * hours}`);
      
      debugDetails.source = "numeric_offset";
      return {
        id: "UTC",
        offset: sign * hours,
        isDST: false,
        debug: debugDetails
      };
    }
  }
  
  // Use our lookup function to determine the timezone for the given coordinates
  const tzid = getLikelyTimezoneId(longitude, latitude);
  console.log(`🌎 Determined timezone from coordinates: ${tzid}`);
  
  // Try Luxon first for modern DST handling
  try {
    // Get the integer versions of time components for better compatibility
    const intYear = Math.floor(year);
    const intMonth = Math.floor(month);
    const intDay = Math.floor(day);
    const intHour = Math.floor(hour);
    const minuteFloat = (hour - intHour) * 60;
    const intMinute = Math.floor(minuteFloat);
    const intSecond = Math.floor((minuteFloat - intMinute) * 60);
    
    // Create a DateTime object for the given date and timezone
    const dateTime = DateTime.fromObject({
      year: intYear,
      month: intMonth,
      day: intDay,
      hour: intHour,
      minute: intMinute,
      second: intSecond
    }, { 
      zone: tzid,
      offset: "earlier", // For ambiguous times during fall-back transitions
      invalid: "constrain" // For non-existent times during spring-forward transitions
    });
    
    // Check if the date is valid
    if (dateTime.isValid) {
      // Extract timezone information including offset and DST status
      const offset = -dateTime.offset / 60; // Convert minutes to hours and negate for astronomical calculations
      
      // Detailed logging for analysis
      console.log(`🕒 Valid Luxon Date: ${dateTime.toISO()}`);
      console.log(`🕒 UTC Offset: ${offset} hours (including DST: ${dateTime.isInDST})`);
      
      debugDetails.source = "luxon_success";
      return {
        id: tzid,
        offset: offset,
        isDST: dateTime.isInDST,
        luxonObject: dateTime,
        debug: debugDetails
      };
    } else {
      console.log(`⚠️ Warning: Invalid Luxon date: ${dateTime.invalidReason}`);
    }
  } catch (error) {
    console.log(`⚠️ Error with Luxon: ${error.message}`);
  }
  
  // Fallback to our manual DST calculation for reliability
  // Define timezone standard offset based on the ID
  let stdOffset = getStandardOffset(tzid);
  let dstOffset = 0;
  debugDetails.source = "manual_calculation";
  
  // US timezone DST rules by year range
  if (tzid === "America/New_York" || tzid === "America/Chicago" || 
      tzid === "America/Denver" || tzid === "America/Los_Angeles") {
    
    // First, determine if the date is in a range where DST was used in the US
    // No DST before 1966 for our purposes
    if (year < 1966) {
      console.log(`🕒 Date before 1966 - no DST applied`);
    }
    // 1966-1986: Last Sunday in April to Last Sunday in October
    else if (year >= 1966 && year <= 1986) {
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
      const dstStartDay = getNthDayOfMonth(year, 4, 0, 1); // First Sunday in April
      const dstEndDay = getLastDayOfMonth(year, 10, 0); // Last Sunday in October
      
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
      const dstStartDay = getNthDayOfMonth(year, 3, 0, 2); // Second Sunday in March
      const dstEndDay = getNthDayOfMonth(year, 11, 0, 1); // First Sunday in November
      
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
  // Europe DST handling
  else if (tzid.startsWith("Europe/")) {
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
  
  const totalOffset = stdOffset + dstOffset;
  console.log(`🔄 MANUAL CALCULATION:`);
  console.log(`   - Base timezone offset: ${stdOffset}`);
  console.log(`   - DST offset applied: ${dstOffset}`);
  console.log(`   - Total offset: ${totalOffset}`);
  
  return {
    id: tzid,
    offset: totalOffset,
    isDST: dstOffset !== 0,
    debug: debugDetails
  };
}

/**
 * Get the standard (non-DST) offset for a timezone
 */
function getStandardOffset(tzid) {
  // Common timezone standard offsets (without DST)
  const standardOffsets = {
    "America/New_York": -5,
    "America/Chicago": -6,
    "America/Denver": -7,
    "America/Los_Angeles": -8,
    "America/Anchorage": -9,
    "America/Halifax": -4,
    "Europe/London": 0,
    "Europe/Paris": 1,
    "Europe/Berlin": 1,
    "Europe/Moscow": 3,
    "Asia/Dubai": 4,
    "Asia/Kolkata": 5.5,
    "Asia/Shanghai": 8,
    "Asia/Tokyo": 9,
    "Australia/Sydney": 10,
    "Pacific/Auckland": 12,
    "Etc/UTC": 0
  };
  
  return standardOffsets[tzid] || 0;
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
  
  // Debug logging
  console.log(`\n📊 Processing request for ${localYear}-${localMonth}-${localDay} ${localHour} at ${latNum}, ${lonNum}`);
  
  // Process timezone - use explicit timezone if provided, otherwise determine based on location
  const timezone = processTimezone(lonNum, latNum, localYear, localMonth, localDay, localHour, tz);
  console.log(`🕒 Using timezone: ${timezone.id} (UTC${timezone.offset >= 0 ? '+' : ''}${timezone.offset})`);

  // Convert local time to UT (try Luxon first, fallback to manual calculation)
  let utHour, utDay, utMonth, utYear;
  
  // If we have a valid Luxon DateTime object, use it for the UT conversion
  if (timezone.luxonObject && timezone.luxonObject.isValid) {
    const utcDateTime = timezone.luxonObject.toUTC();
    utYear = utcDateTime.year;
    utMonth = utcDateTime.month;
    utDay = utcDateTime.day;
    utHour = utcDateTime.hour + (utcDateTime.minute / 60) + (utcDateTime.second / 3600);
    
    console.log(`🕒 Converting to UT using Luxon: ${utcDateTime.toISO()}`);
  } else {
    // Fallback to manual calculation if Luxon object not available or invalid
    utHour = localHour - timezone.offset;

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
    utYear = localDate.getFullYear();
    utMonth = localDate.getMonth() + 1; // Convert 0-based month to 1-based
    utDay = localDate.getDate();
    
    console.log(`🕒 Converting to UT manually: ${utYear}-${utMonth}-${utDay} ${utHour}`);
  }
  
  // Log the conversion details
  console.log(`\n🕰️ DETAILED TIME CALCULATIONS:`);
  console.log(`   - Local date/time: ${localYear}-${localMonth}-${localDay} ${localHour.toFixed(4)}`);
  console.log(`   - Timezone offset: ${timezone.offset} hours (DST: ${timezone.isDST ? "Yes" : "No"})`);
  console.log(`   - UT date/time: ${utYear}-${utMonth}-${utDay} ${utHour.toFixed(4)}`);

  // Calculate Julian Day with UT time
  const jd = swisseph.swe_julday(utYear, utMonth, utDay, utHour, swisseph.SE_GREG_CAL);
  console.log(`   - Julian Day: ${jd.toFixed(6)}`);
  
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
