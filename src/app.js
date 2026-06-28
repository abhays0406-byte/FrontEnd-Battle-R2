import { RpaStore } from './store.js';
import { VirtualizedGrid } from './grid.js';

// Instantiate State and Grid
const store = new RpaStore();
let grid = null;

// Hot-path state flags
let isInteractiveChange = true; // Set true initially so baseline chart renders immediately

// DOM Elements
const gridContainer = document.getElementById('grid-container');
const gridSpacer = document.getElementById('grid-spacer');
const searchInput = document.getElementById('search-input');
const playPauseBtn = document.getElementById('play-pause-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

// KPI elements
const kpiProcessedEl = document.getElementById('kpi-processed');
const kpiRobotsEl = document.getElementById('kpi-robots-val');
const kpiSavingsEl = document.getElementById('kpi-savings-val');

// Row counter widget element
const rowCounterEl = document.getElementById('row-counter');

// Chart element
const deptChartSvg = document.getElementById('dept-chart-svg');

// Panel elements for workspace visibility
const panels = {
    'kpi-panel': document.getElementById('kpi-panel-container'),
    'grid-panel': document.getElementById('grid-panel-container'),
    'chart-panel': document.getElementById('chart-panel-container'),
    'filter-panel': document.getElementById('filter-panel-container')
};

// ==========================================
// 1. WORKSPACE LAYOUT PERSISTENCE
// ==========================================
function initLayoutPersistence() {
    const layoutSettingsKey = 'rpa_monitor_layout_v1';
    
    // Default settings
    let settings = {
        'kpi-panel': true,
        'grid-panel': true,
        'chart-panel': true,
        'filter-panel': true
    };
    
    // Load settings from localStorage
    const saved = localStorage.getItem(layoutSettingsKey);
    if (saved) {
        try {
            settings = { ...settings, ...JSON.parse(saved) };
        } catch (e) {
            console.error("Failed to parse layout settings from storage:", e);
        }
    }
    
    // Apply initial settings
    Object.keys(settings).forEach(id => {
        const checkbox = document.getElementById(`toggle-${id}`);
        if (checkbox) {
            checkbox.checked = settings[id];
            
            // Set visibility classes
            if (!settings[id]) {
                panels[id]?.classList.add('hidden-panel');
            } else {
                panels[id]?.classList.remove('hidden-panel');
            }
        }
    });

    adjustGridColumnsLayout(settings['chart-panel']);

    // Attach listeners to switches
    Object.keys(panels).forEach(id => {
        const checkbox = document.getElementById(`toggle-${id}`);
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                const checked = e.target.checked;
                settings[id] = checked;
                
                // Toggle display
                if (checked) {
                    panels[id]?.classList.remove('hidden-panel');
                } else {
                    panels[id]?.classList.add('hidden-panel');
                }
                
                // If chart panel toggled, change workspace-grid column layout
                if (id === 'chart-panel') {
                    adjustGridColumnsLayout(checked);
                }
                
                // Save to localStorage
                localStorage.setItem(layoutSettingsKey, JSON.stringify(settings));
                
                // Force grid recalculate viewport heights
                if (grid) {
                    grid.updateViewport(gridContainer.clientHeight);
                }
            });
        }
    });
}

function adjustGridColumnsLayout(isChartVisible) {
    const workspaceGrid = document.querySelector('.workspace-grid');
    if (workspaceGrid) {
        if (isChartVisible) {
            workspaceGrid.classList.remove('full-grid');
        } else {
            workspaceGrid.classList.add('full-grid');
        }
    }
}

// ==========================================
// 2. CATEGORICAL FILTER DROPDOWNS
// ==========================================
function initFilterDropdowns() {
    const dropdownConfigs = [
        { id: 'select-automation', column: 'automation_type' },
        { id: 'select-department', column: 'department' },
        { id: 'select-industry', column: 'industry' }
    ];
    
    dropdownConfigs.forEach(cfg => {
        const dropdownEl = document.getElementById(cfg.id);
        if (!dropdownEl) return;
        
        const trigger = dropdownEl.querySelector('.select-trigger');
        const optionsContainer = dropdownEl.querySelector('.select-options');
        const categories = store.getUniqueCategories(cfg.column);
        
        // Build list options
        optionsContainer.innerHTML = '';
        categories.forEach(cat => {
            const label = document.createElement('label');
            label.className = 'option-item';
            label.innerHTML = `
                <input type="checkbox" value="${cat.replace(/"/g, '&quot;')}">
                <span>${cat}</span>
            `;
            
            // Listen to checkbox changes
            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', () => {
                const checkedCheckboxes = optionsContainer.querySelectorAll('input:checked');
                const selectedValues = Array.from(checkedCheckboxes).map(cb => cb.value);
                
                // Update trigger label
                const labelText = selectedValues.length === 0 
                    ? 'Select Options' 
                    : selectedValues.length === 1 
                        ? selectedValues[0] 
                        : `${selectedValues.length} Selected`;
                trigger.querySelector('span').textContent = labelText;
                
                // Apply filter to store
                isInteractiveChange = true;
                store.setFilter(cfg.column, selectedValues);
            });
            
            optionsContainer.appendChild(label);
        });
        
        // Trigger dropdown slide and toggle chevron class
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const isOpen = dropdownEl.classList.contains('open');
            
            // Close other dropdowns
            document.querySelectorAll('.custom-select-wrapper').forEach(el => {
                el.classList.remove('open');
                el.querySelector('.select-options').classList.remove('open');
            });
            
            if (!isOpen) {
                dropdownEl.classList.add('open');
                optionsContainer.classList.add('open');
            }
        });
    });
    
    // Close dropdowns on outer click
    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-select-wrapper').forEach(el => {
            el.classList.remove('open');
            el.querySelector('.select-options').classList.remove('open');
        });
    });
}

// ==========================================
// 3. DEPARTMENT ANALYTICS SVG CHARTING
// ==========================================
function updateDepartmentChart() {
    const data = store.getDepartmentSavingsData();
    const svgEl = deptChartSvg;
    
    // Clear SVG
    svgEl.innerHTML = '';
    
    if (data.length === 0) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", "50%");
        text.setAttribute("y", "50%");
        text.setAttribute("class", "chart-text");
        text.setAttribute("text-anchor", "middle");
        text.textContent = "No data matches filters";
        svgEl.appendChild(text);
        return;
    }
    
    // Get actual dimensions
    const svgWidth = svgEl.clientWidth || 300;
    const svgHeight = svgEl.clientHeight || 260;
    
    const margin = { top: 15, right: 60, bottom: 20, left: 110 };
    const chartWidth = svgWidth - margin.left - margin.right;
    const chartHeight = svgHeight - margin.top - margin.bottom;
    
    const maxSavings = Math.max(...data.map(d => d.savings)) || 1;
    const barSpacing = Math.min(26, Math.floor(chartHeight / data.length));
    const barHeight = Math.max(12, barSpacing - 6);
    
    // Y axis line
    const yAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    yAxis.setAttribute("x1", margin.left);
    yAxis.setAttribute("y1", margin.top);
    yAxis.setAttribute("x2", margin.left);
    yAxis.setAttribute("y2", margin.top + chartHeight);
    yAxis.setAttribute("class", "chart-axis-line");
    svgEl.appendChild(yAxis);
    
    // Vertical grid lines (3 intervals)
    for (let i = 1; i <= 3; i++) {
        const x = margin.left + (chartWidth / 3) * i;
        const gridLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        gridLine.setAttribute("x1", x);
        gridLine.setAttribute("y1", margin.top);
        gridLine.setAttribute("x2", x);
        gridLine.setAttribute("y2", margin.top + chartHeight);
        gridLine.setAttribute("class", "chart-grid-line");
        svgEl.appendChild(gridLine);
    }
    
    data.forEach((d, index) => {
        const y = margin.top + index * barSpacing + 3;
        const width = (d.savings / maxSavings) * chartWidth;
        
        // Draw bar
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", margin.left);
        rect.setAttribute("y", y);
        rect.setAttribute("width", Math.max(2, width));
        rect.setAttribute("height", barHeight);
        rect.setAttribute("class", "chart-bar");
        rect.setAttribute("rx", 3);
        
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = `${d.department}: $${d.savings.toLocaleString()}`;
        rect.appendChild(title);
        svgEl.appendChild(rect);
        
        // Label (Department)
        const labelText = d.department.length > 18 
            ? d.department.substring(0, 16) + '..' 
            : d.department;
            
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", margin.left - 8);
        label.setAttribute("y", y + barHeight / 2 + 4);
        label.setAttribute("class", "chart-text label");
        label.setAttribute("text-anchor", "end");
        label.textContent = labelText;
        svgEl.appendChild(label);
        
        // Value (Savings in Thousands/Millions)
        const formattedVal = d.savings >= 1000000 
            ? `$${(d.savings / 1000000).toFixed(1)}M`
            : `$${Math.round(d.savings / 1000)}k`;
            
        const valText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        valText.setAttribute("x", margin.left + width + 6);
        valText.setAttribute("y", y + barHeight / 2 + 4);
        valText.setAttribute("class", "chart-text value");
        valText.setAttribute("text-anchor", "start");
        valText.textContent = formattedVal;
        svgEl.appendChild(valText);
    });
}

// ==========================================
// 4. INTERACTIVE ACTIONS HOOKS
// ==========================================
function initHeaderControls() {
    // Play/Pause Controller
    playPauseBtn.addEventListener('click', () => {
        const isCurrentlyPaused = store.isPaused;
        
        if (isCurrentlyPaused) {
            // Resume
            isInteractiveChange = true;
            store.resume();
            
            playPauseBtn.classList.remove('paused');
            playPauseBtn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1"/>
                    <rect x="14" y="4" width="4" height="16" rx="1"/>
                </svg>
                Pause
            `;
            
            statusDot.classList.add('pulsing');
            statusDot.classList.remove('paused');
            statusText.textContent = "Live stream active";
        } else {
            // Pause
            store.pause();
            
            playPauseBtn.classList.add('paused');
            playPauseBtn.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Resume
            `;
            
            statusDot.classList.remove('pulsing');
            statusDot.classList.add('paused');
            statusText.textContent = "Stream frozen (buffered)";
        }
    });

    // Fuzzy Search Input
    searchInput.addEventListener('input', (e) => {
        isInteractiveChange = true;
        store.setSearchQuery(e.target.value);
    });
}

function initGridSortHeaders() {
    const headers = document.querySelectorAll('.grid-hdr');
    
    headers.forEach(hdr => {
        hdr.addEventListener('click', (e) => {
            const column = hdr.getAttribute('data-col');
            const isMultiSort = e.shiftKey; // Detect shift-click
            
            isInteractiveChange = true;
            store.toggleSort(column, isMultiSort);
            
            // Re-render header sort indicators
            headers.forEach(h => {
                const colName = h.getAttribute('data-col');
                const dir = store.getSortDirection(colName);
                
                h.classList.remove('sort-asc', 'sort-desc');
                if (dir === 'asc') {
                    h.classList.add('sort-asc');
                } else if (dir === 'desc') {
                    h.classList.add('sort-desc');
                }
            });
        });
    });
}

// ==========================================
// 5. STORE SUBSCRIPTION UPDATER (With Smart Throttling)
// ==========================================
function setupStoreUIRelay() {
    let tickCount = 0;
    
    store.subscribe(() => {
        // 1. Update KPIs counters (always immediate)
        kpiProcessedEl.textContent = store.kpis.totalProcessed.toLocaleString();
        kpiRobotsEl.textContent = store.kpis.activeRobots.toLocaleString();
        kpiSavingsEl.textContent = '$' + store.kpis.cumulativeSavings.toLocaleString();
        
        // 2. Update Row coverage count (always immediate)
        const showing = store.filteredRows.length;
        const total = store.allRows.length;
        rowCounterEl.textContent = `Showing ${showing.toLocaleString()} of ${total.toLocaleString()} projects`;
        
        // 3. Redraw SVG Chart with Smart Tick Throttling
        // Interactive changes render instantly. Stream ticks render once per second (every 5th tick).
        if (isInteractiveChange) {
            updateDepartmentChart();
            isInteractiveChange = false;
            tickCount = 0;
        } else {
            tickCount++;
            if (tickCount >= 5) {
                updateDepartmentChart();
                tickCount = 0;
            }
        }
    });
}

// ==========================================
// 6. APPLICATION STARTUP BOOTSTRAP
// ==========================================
async function bootstrap() {
    console.log("🏁 [App] Bootstrapping Terminal Control...");
    
    // Initialize Dashboard UI components first
    initLayoutPersistence();
    initHeaderControls();
    initGridSortHeaders();
    
    // Initialize virtual grid
    grid = new VirtualizedGrid(gridContainer, gridSpacer, store);
    
    // Hook up store notifications for chart & metrics
    setupStoreUIRelay();
    
    try {
        // Load local baseline CSV
        await store.loadBaseline('./automation_projects.csv');
        
        // Setup dropdown filter checkboxes with loaded options
        initFilterDropdowns();
        
        // Render baseline layout
        isInteractiveChange = true;
        store.applyFiltersAndSort();
        store.notify();
        
        // Connect to hackathon telemetry pipeline
        console.log("📡 [App] Attaching to telemetry pipeline simulation...");
        window.initializeRpaStream((incomingBatch) => {
            store.processIncomingBatch(incomingBatch);
        }, './automation_projects.csv');
        
        // Setup SVGs redraw on window resize
        window.addEventListener('resize', () => {
            updateDepartmentChart();
        });
        
    } catch (err) {
        console.error("❌ [App Bootstrap Failed] Critical error initializing components:", err);
    }
}

// Fire on DOM ready
document.addEventListener('DOMContentLoaded', bootstrap);
