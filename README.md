# SCOPE

Sensor Coverage Optimisation and Placement Engine

A web-based tool for evaluating and optimizing sensor placement for atmospheric detection. This repository contains the SCOPE detection model, interactive UI, and reference documentation.

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- Optional: Node.js for running the model directly

### Using the Web Tool

1. **Clone the repository:**
   ```bash
   git clone https://github.com/tmcascs/SCOPE.git
   cd SCOPE
   ```

2. **Open the tool:**
   - Simply open `index.html` in your browser
   - No build or installation required

3. **Enable Google Maps (optional):**
   - The tool defaults to Esri World basemap
   - To use Google Maps, add your API key:
     - Open `index.html` in a text editor
     - Find the line: `key=YOUR_GOOGLE_MAPS_API_KEY`
     - Replace with your actual Google Maps API key
     - Save and reload in browser

## Using the Tool

### Main Workflow

1. **Define sources:** Click "Add Source" to place emission sources on the map
2. **Configure sensors:** Use "Add 0.3ppm Sensor" or define custom sensors with different detection limits
3. **View coverage:** Color-coded source markers show detection coverage for each source — the percent of hours emissions are expected to be detected (red = poor, orange = fair, green = good)
4. **Optimize placement:** Drag sensors to improve coverage; view overall coverage score updates in real time
5. **Export results:** Save siting as JSON, upload previous sitings, or export PDF reports

### Map Controls

| Element | Purpose |
|---------|---------|
| **Site Name** | Custom label for your analysis site |
| **Go to Location** | Pan map to a specific latitude/longitude |
| **Upload Siting** | Load a previously saved sensor/source configuration |
| **Save Siting** | Export current layout as JSON file |
| **Export PDF** | Generate printable PDF with map, wind rose, and statistics |
| **Basemap Select** | Choose between Esri World (default) or Google Maps |

### Display Checkboxes

| Checkbox | Effect |
|----------|--------|
| **Color sources by coverage** | Color-code sources by detection coverage percentage (percent of hours emissions expected to be detected) |
| **Show sensor discs** | Display detection range circles (blue: 0.3ppm sensors) |
| **Show custom discs** | Display detection range circles for custom sensors |
| **Minimize sources** | Collapse source list for cleaner map view |

### Sensor Controls

#### Standard 0.3ppm Sensor
- Built-in sensor type with fixed 0.3 ppm detection limit
- Shows range circle in blue when "Show sensor discs" is checked

#### Custom Sensors (Slots 1 & 2)
- Define custom detection limits (MDL in ppm)
- Click **"+ Define Sensor"** to configure
- Set detection limit, then click **Add** to place on map
- Click **✕** to remove

### Wind Rose & Detection Timing

| Control | Purpose |
|---------|---------|
| **Fetch (ERA5)** | Download historical wind data (date range is optional; defaults to recent period) |
| **Start / End dates** | Set time range for ERA5 wind data fetch (appears only after fetching) |
| **Wind rose visualization** | Polar histogram showing wind direction frequency and speed distribution |
| **Emission rate selector** | Choose emission rate (1–100 kg/h) for detection model input |
| **Recompute detection timing** | Calculate Time-To-Detection (TTD) statistics based on wind data and sensor placement |

### Detection Timing Results

| Metric | Meaning |
|--------|---------|
| **Mean TTD** | Average hours until detection across all sources and wind conditions |
| **P50 TTD** | Median (50th percentile) detection time |
| **P90 TTD** | 90th percentile detection time (worst case typical scenario) |
| **Sources not detected** | Percentage of source/wind combinations that never reach detection range |
| **Coverage Score** | Percent of hours expected to detect emissions across all sources — overall siting quality based on detection reliability and frequency |

### Coordinate Tables

#### Sources Table
- Lists all emission sources with:
  - **Name & Label:** User-defined identifier
  - **Height (m/ft):** Source height above ground (toggleable units)
  - **Cov%:** Detection coverage — percent of hours emissions from this source are expected to be detected
  - **P50 TTD:** Median time-to-detection for this source
  - **P90 TTD:** 90th percentile time-to-detection
  - **Nearest Sensor:** Distance to closest sensor

#### Sensors Table
- Lists all sensors with:
  - **Type:** Standard (0.3ppm) or custom detection limit
  - **MDL (ppm):** Minimum detection limit
  - **Lat / Lon:** Sensor coordinates

### Interaction Tips

- **Click** on map to place sources or sensors
- **Drag** to reposition any marker
- **Double-click** a marker to delete it
- **Enable "Auto-recompute on drag"** for live coverage updates while dragging (disable on large sites for smoother performance)
- **Check wind data status** badge (green ✓ = active data, yellow ⚠ = stale, gray = none) to see data freshness

---

## Detection Model

SCOPE uses a **Gaussian plume model** to compute atmospheric dispersion and detection ranges based on:

- **Emission rate** (kg/h): source strength
- **Detection limit** (ppm): sensor sensitivity
- **Height difference** (m): vertical separation between source and sensor
- **Wind speed** (m/s): atmospheric mixing conditions

### Model Inputs & Outputs

**Inputs:**
- Emission rate in kg/h
- Concentration detection limit in ppm
- Source-to-sensor height difference in meters (0 to 20m)
- Wind speed in m/s

**Outputs:**
- `maxRangeM`: Outer detection radius (downwind maximum range)
- `minRangeM`: Inner crossing radius (upwind minimum range where concentration exceeds limit)
- `limitHit`: Flag indicating if model reached computational horizon

### Understanding Detection Limits

Common detection limits:
- **0.3 ppm:** Standard environmental monitoring threshold
- **1.0 ppm:** Regulatory reporting levels (varies by jurisdiction)
- **10.0 ppm:** Industrial safety levels

Higher detection limits = shorter detection ranges; lower limits = longer ranges.

### Reviewing the Model

See **`references/Gaussian Plume Model for SCOPE tool.pdf`** for:
- Mathematical formulation of the plume model
- Input parameter ranges and assumptions
- Validation against field data
- Model limitations and applicability

### Programmatic Access

For direct model access in Node.js:

```bash
npm install
npm run example
```

This queries the detection lookup table programmatically and returns:
```json
{
  "maxRangeM": 300,
  "minRangeM": 10.628,
  "limitHit": true,
  "cappedAtM": 300
}
```

See `examples/query-example.mjs` for implementation details.

### Model Files

- **`data/detection_lookup.json`:** Precomputed lookup table (emission rate, detection limit, height, wind speed)
- **`src/model.js`:** Lookup access and interpolation logic
- **`references/Gaussian Plume Model for SCOPE tool.pdf`:** Model background and validation

---

## Included Files

- `index.html`: Interactive web-based siting tool
- `app.js`: Tool logic, map handling, coverage calculations
- `styles.css`: Styling and responsive layout
- `scope_logo.svg`: SCOPE brand logo
- `data/detection_lookup.json`: Detection model lookup table
- `src/model.js`: Model interface
- `examples/query-example.mjs`: Example model queries
- `references/Gaussian Plume Model for SCOPE tool.pdf`: Model reference

---

## License

This project is licensed under **PolyForm Noncommercial License 1.0.0**.

**Commercial use is not permitted.** Authorized non-commercial uses include research, education, and internal organizational analysis.
