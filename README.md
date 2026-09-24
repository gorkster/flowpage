# South Platte River Flow Tracker

A lightweight, responsive web application for monitoring real-time streamflows (cfs) along the **South Platte River watershed from the Continental Divide headwaters down to Chatfield Reservoir**.

Built completely without a backend server or persistent database — all telemetry is fetched live directly from the public APIs provided by the **U.S. Geological Survey (USGS)** and the **Colorado Division of Water Resources (CDWR / CDSS HydroBase)**.

---

## 🌊 Watershed Coverage (Headwaters to Chatfield Reservoir)

The application tracks **23 telemetry stations** organized in downstream hydrological order:

### 1. Continental Divide & South Park Headwaters
* **`MFKABMCO` (CDWR)** — Middle Fork South Platte above Montgomery Reservoir near Alma (*10,870 ft*)
* **`MFKBLMCO` (CDWR)** — Middle Fork South Platte below Montgomery Reservoir near Alma
* **`MFKPRICO` (CDWR)** — Middle Fork South Platte at Prince (Fairplay / Como)
* **`MFKSTMCO` (CDWR)** — Middle Fork South Platte at Santa Maria Ranch
* **`SFKANTCO` (CDWR)** — South Fork South Platte above Antero Reservoir
* **`PLAANTCO` (CDWR)** — South Platte River below Antero Reservoir Dam
* **`PLASPICO` (CDWR)** — South Platte River above Spinney Mountain Reservoir
* **`PLAHARCO` (CDWR)** — South Platte River above Elevenmile Reservoir (*Gold Medal "Dream Stream"*)
* **`PLAGEOCO` (CDWR)** — South Platte River near Lake George (*Elevenmile Canyon Tailwater*)

### 2. Cheesman Canyon & Deckers Corridor
* **`06700000` (USGS)** — South Platte River above Cheesman Lake
* **`PLACHECO` (CDWR)** — South Platte River below Cheesman Reservoir Dam (*Gold Medal Cheesman Canyon*)
* **`06701900` (USGS)** — South Platte River below Brush Creek near Trumbull (*Deckers Corridor*)

### 3. North Fork South Platte & Transbasin Diversion
* **`ROBTUNCO` (CDWR)** — Harold D. Roberts Tunnel East Portal (*Dillon Reservoir 23-mile transbasin diversion*)
* **`PLAGRACO` (CDWR)** — North Fork South Platte River at Grant (US-285)
* **`PLABAICO` (CDWR)** — North Fork South Platte River at Bailey

### 4. Waterton Canyon & Chatfield Reservoir
* **`PLASPLCO` (CDWR)** — South Platte River at South Platte (*Confluence of North Fork & Main Stem*)
* **`PLASTRCO` (CDWR)** — South Platte River below Strontia Springs Dam (*Waterton Canyon*)
* **`PLAWATCO` (CDWR)** — South Platte River at Waterton (*Primary Main Stem Inflow to Chatfield Reservoir*)
* **`06709530` (USGS)** — Plum Creek at Titan Road near Louviers (*Plum Creek Inflow to Chatfield Reservoir*)
* **`PLACHACO` (CDWR)** — South Platte River below Chatfield Reservoir (*Chatfield Dam Release into Denver Metro*)

### 5. Watershed Tributaries
* **`06696980` (USGS)** — Tarryall Creek at Upper Station near Como
* **`TARTARCO` (CDWR)** — Tarryall Creek below Tarryall Reservoir
* **`06709000` (USGS)** — Plum Creek near Sedalia

---

## 🚀 Features

* **Zero Backend Required**: Directly queries public CORS-enabled endpoints on `waterservices.usgs.gov` and `dwr.state.co.us`.
* **River Journey View**: Visual downstream cards grouped by river reach with flow metrics, stage (ft), 24h trends, and crisp SVG sparklines.
* **Interactive Watershed Map**: Leaflet map featuring station markers with flow rates, river branch hydrological traces, and interactive popups.
* **Table View**: Compact, sortable matrix ideal for anglers, water managers, and hydrologists.
* **Interactive Hydrograph Modal**: Scrubbable SVG hydrograph with crosshair tooltips (time and cfs), 24h/48h/72h range toggles, and direct links to official USGS & CDWR station pages.
* **Real-time Refresh & Auto-Update**: Background 15-minute polling interval with manual refresh button and relative time indicators.
* **Offline Resilience**: Local caching via `localStorage` enables instantaneous loading and displays cached readings if cell reception drops in deep canyons.
* **Responsive & Accessible**: Mobile-first design, high contrast ratios, semantic HTML5, and native dark/light theme toggle.

---

## 💻 Quick Start / Usage

No build step or compilation is needed. You can open `index.html` directly in any modern browser, or serve it using any local static web server:

```bash
# Using Python
python3 -m http.server 8000

# Using Node / npx
npx serve .
```

Open `http://localhost:8000` in your desktop or mobile browser.

---

## 📡 Public API Documentation References

1. **Colorado Division of Water Resources (CDSS HydroBase REST API)**
   * Endpoint: `https://dwr.state.co.us/Rest/GET/api/v2/telemetrystations/telemetrytimeseriesraw/`
   * Documentation: [CDSS REST Web Services](https://cdss.colorado.gov/)
2. **USGS National Water Information System (NWIS)**
   * Endpoint: `https://waterservices.usgs.gov/nwis/iv/`
   * Documentation: [USGS Water Services API](https://waterservices.usgs.gov/)
