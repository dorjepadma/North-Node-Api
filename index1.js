// North Node API with Swiss Ephemeris and accurate house determination
require("dotenv").config();
const express = require("express");
const swisseph = require("swisseph");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors({ origin: "http://astro-sand-box.local" }));

const PORT = 3000;

// Set Swiss Ephemeris path
swisseph.swe_set_ephe_path(path.join(__dirname, "ephe"));
console.log("📂 Ephemeris path set to:", path.join(__dirname, "ephe"));

// ♈ Zodiac signs
const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
];

// API route
app.get("/north-node", (req, res) => {
  const { year, month, day, hour, lat, lon } = req.query;

  if (!year || !month || !day || !hour || !lat || !lon) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  // Parse inputs
  const jd = swisseph.swe_julday(
    parseInt(year),
    parseInt(month),
    parseInt(day),
    parseFloat(hour),
    swisseph.SE_GREG_CAL
  );
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  console.log("Julian Day:", jd);
  console.log("Parsed lat/lon:", latNum, lonNum);

  // Calculate True Node position
  swisseph.swe_calc_ut(jd, swisseph.SE_TRUE_NODE, swisseph.SEFLG_SWIEPH, (nodeResult) => {
    if (!nodeResult || typeof nodeResult.longitude !== "number") {
      return res.status(500).json({ error: "Failed to calculate North Node" });
    }

    const nodeLon = nodeResult.longitude;
    const nodeLat = nodeResult.latitude;
    const signIndex = Math.floor(nodeLon / 30);
    const sign = SIGNS[signIndex];
    const degrees = Math.floor(nodeLon % 30);
    const minutes = Math.round((nodeLon % 1) * 60);

    console.log("🌀 Node longitude:", nodeLon.toFixed(2));
    console.log("🪐 Node latitude:", nodeLat.toFixed(4));

    // Calculate house cusps
    const houseResult = swisseph.swe_houses(jd, latNum, lonNum, 'P');

    if (!houseResult || !houseResult.house || !houseResult.armc) {
      return res.status(500).json({ error: "House calculation failed" });
    }

    const cusps = houseResult.house;
    console.log("Cusps:", cusps);

    // Determine house manually from cusps

    // cusps[13] = cusps[1] + 360;
    cusps.push(cusps[0] + 360);  // Ensure wraparound

    let house = 12;
    for (let i = 1; i <= 12; i++) {

      // const start = cusps[i - 1];
      const start = cusps[i === 1 ? 12 : i - 1];
      // const end = cusps[i === 12 ? 1 : i + 1];
       // const end = cusps[i % 12 + 1];
       const end = cusps[i];
      // const end = (i === 12) ? cusps[1] + 360 : cusps[i + 1];

      if (typeof start === 'number' && typeof end === 'number') {
        console.log(`🔍 House ${i}: Start ${start.toFixed(2)}°, End ${end.toFixed(2)}°`);}
      // } else {
      //   console.warn(`⚠️ Missing cusp data for house ${i}:`, { start, end });
      //   continue;
      // }
      // let adjustedNodeLon = nodeLon; // <-- declare this OUTSIDE the if
      let adjustedNodeLon = nodeLon;
    let adjustedStart = start;
    let adjustedEnd = end;

    // wrap around 360
    // if (adjustedStart > adjustedEnd) {
    //   if (adjustedNodeLon < adjustedStart) { adjustedNodeLon += 360;}
    //   adjustedEnd += 360;
    // }
    if (adjustedStart > adjustedEnd) {
      if (adjustedNodeLon < adjustedStart) adjustedNodeLon += 360;
      adjustedEnd += 360;
    }
      // const adjustedNodeLon = nodeLon < start ? nodeLon + 360 : nodeLon;

      // if (start > end && nodeLon < start) {
      //   adjustedNodeLon += 360;
      // }
      
      if (adjustedNodeLon >= start && adjustedNodeLon < end) {
        house = i - 1 ;
        console.log(`✅ Node found in house ${house}`);
        break;
      }
     else {
      console.warn(`⚠️ Missing cusp data for house ${i}:`, { start, end });
    }
      // if (
      //   (start < end && nodeLon >= start && nodeLon < end) ||
      //   (start > end && (nodeLon >= start || nodeLon < end))
      // ) {
      //   house = i === 0 ? 12 : i;
      //   console.log(`✅ Node found in house ${house}`);
      //   break;
      // }
      
    }

    // Send result with ordinal suffix
    function getOrdinal(n) {
      const j = n % 10, k = n % 100;
      if (j === 1 && k !== 11) return "st";
      if (j === 2 && k !== 12) return "nd";
      if (j === 3 && k !== 13) return "rd";
      return "th";
    }

      // 📤 Send result with artificial delay for testing
setTimeout(() => {
    res.json({
      sign,
      degrees,
      minutes,
      longitude: nodeLon,
      house,
      formatted: `${sign} ${degrees}°${minutes}′  in the ${house}${getOrdinal(house)} house`
    });}, 2000); // 2 seconds delay to simulate warm-up time
  });
});

app.listen(PORT, () => {
  console.log(`North Node API running on http://localhost:${PORT}`);
});
