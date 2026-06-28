# Enterprise RPA Telemetry Monitor

A high-performance, responsive single-page B2B SaaS dashboard built to visualize, filter, search, and sort a high-frequency real-time stream of telemetry updates for **50,000+ RPA automation projects**.

This application is engineered with **zero external libraries** (no React, TanStack Table, AG-Grid, react-window, or Chart.js) to comply with strict hackathon performance constraints and design rules. It is fully optimized for layout-thrash-free rendering and zero Garbage Collection (GC) overhead, maintaining a **locked 60 FPS profile** under heavy stream load.

---

## 🚀 Live Demo & Local Setup

The project runs as a static web application and can be hosted on any local web server.

### Prerequisites
- Node.js & npm (installed)

### Running Locally
1. Clone the repository to your local machine.
2. In the project root folder, run:
   ```bash
   npx serve .
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## 🛠️ Features

### 1. High-Density KPIs Dashboard
A top-row KPI strip showcasing three live counters:
- **Streamed Rows**: Total processed updates since connection.
- **Active Robots**: Incremental running sum of all active robots deployed across the database.
- **Cumulative Savings**: Incremental running sum of total savings.

### 2. High-Frequency Virtualized DOM Grid
A custom row-recycling virtual grid that renders only the rows visible inside the viewport height (`viewportHeight / rowHeight + 3`). Swaps node values dynamically on scroll, handling 50,000 items with absolute memory stability.

### 3. Financial & Numeric Sanitation
Currency values (Budget, Savings) format instantly with commas using local financial standards, and percentage fields (ROI %) round to 2 decimal places and strictly clamp to `-100.00%` (total loss floor).

### 4. Compound Multi-Column Sorter
Click header columns to sort, or **Shift-Click** to apply multi-column compound sorting (e.g., sort primary array by Industry alphabetical, then sub-sort rows by ROI descending) with stable tree updates.

### 5. Multi-Field Fuzzy Search Engine
A search parser capable of matching complex, out-of-order partial keywords (e.g., `'Tata Fin Completed'`) concurrently across text fields (`project_name`, `company_id`, `implementation_partner`, and `country`).

### 6. Categorical Dropdown Filters
Custom multi-choice dropdown selectors for categorical variables (`automation_type`, `department`, `industry`) that intersect filter states correctly.

### 7. Pipeline Play/Pause Buffer Control
Toggling "Pause" locks the UI completely. Telemetry chunks continue to integrate into the background data store. Re-engaging "Play" flushes all buffered records instantly to the viewport.

### 8. Operator Layout Persistence
Workspace settings panels can be dynamically toggled visible or hidden via the sidebar. Configurations are cached in `localStorage` and persist through page refreshes.

### 9. Department Savings Analytics SVG Chart
An interactive, responsive SVG horizontal bar chart displaying department-wise savings statistics that updates dynamically.

### 10. Visual Flash Alerts
Newly failed rows or negative ROI elements flash a crimson left-border indicator. The animation class is cleaned up automatically via `animationend` triggers to maintain a clean DOM state.

---

## ⚡ Performance & Profiling Optimizations

The application is structured to achieve maximum scores in Chrome Performance Profiling:

- **Zero innerHTML Writes in Hot Path**: Status badges are created as span elements once at initialization. Values and classes are updated via `textContent` and `className` during ticks/scrolling to prevent browser layout reflows.
- **Pre-tokenized Search**: Splits search keywords only when the user types, storing the terms array in memory rather than running string operations inside the 200ms tick loop.
- **Static Scope Bindings**: Sorter comparators and number formatters are declared in static class/file scopes to avoid function allocations, keeping the heap timeline clean of Garbage Collection (GC) sawtooth spikes.
- **Smart Chart Throttling**: Ticks redraw the SVG analytics chart once per second (every 5th tick) to reduce layout overhead, while manual filter/search clicks bypass the throttle for instant interactive feedback.

---

## 📂 Codebase Structure

```
├── index.html               # Main application template & structure
├── style.css                # Slate B2B styling, layouts, & animations
├── dataStream.js            # Telemetry stream simulator
├── automation_projects.csv  # Baseline dataset
├── src/
│   ├── app.js               # Application Orchestrator & SVG chart logic
│   ├── store.js             # State Engine, CSV parsing, filters, & sorting
│   └── grid.js              # Virtualized Grid recycler & formatter utils
└── README.md                # Documentation
```
