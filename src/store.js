/**
 * High-Density Enterprise RPA Monitor State Engine
 * Manages 50,000+ data records, real-time KPI streaming accumulators,
 * filters, fuzzy search, and multi-column compound sorting.
 * Optimized for low Garbage Collection overhead and zero-allocation updates.
 */

export class RpaStore {
    constructor() {
        this.allRows = [];
        this.projectMap = new Map(); // O(1) ID lookups for stream updates
        this.filteredRows = [];
        
        // Active states
        this.searchQuery = '';
        this.searchTerms = []; // Pre-tokenized search keywords for O(N) performance
        
        this.activeFilters = {
            automation_type: new Set(),
            department: new Set(),
            industry: new Set()
        };
        this.activeSorts = []; // Array of { column, direction: 'asc'|'desc' }
        
        // Running KPIs
        this.kpis = {
            totalProcessed: 0,
            activeRobots: 0,
            cumulativeSavings: 0
        };

        // Pause buffer queue
        this.isPaused = false;
        this.pausedUpdateQueue = [];
        
        // Listeners for UI state change notifications
        this.listeners = [];
        
        // Pre-bind hot sorting comparator to prevent garbage collection allocation in ticks
        this.compareRows = this.compareRows.bind(this);
    }

    /**
     * Subscribe to store updates
     */
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    notify() {
        // Simple loop, zero allocation
        for (let i = 0; i < this.listeners.length; i++) {
            this.listeners[i]();
        }
    }

    /**
     * Loads the CSV file and builds the baseline data.
     */
    async loadBaseline(csvUrl) {
        console.log(`📦 [Store] Initializing baseline from: ${csvUrl}`);
        const response = await fetch(csvUrl);
        if (!response.ok) {
            throw new Error(`Failed to load baseline CSV: ${response.statusText}`);
        }
        const text = await response.text();
        this.allRows = this.parseCSV(text);
        
        // Populate fast lookup map and compute initial sums
        let robotsSum = 0;
        let savingsSum = 0;
        
        for (let i = 0; i < this.allRows.length; i++) {
            const row = this.allRows[i];
            this.projectMap.set(row.project_id, row);
            robotsSum += row.robots_deployed;
            savingsSum += row.annual_savings_usd;
        }

        this.kpis.activeRobots = robotsSum;
        this.kpis.cumulativeSavings = savingsSum;
        this.kpis.totalProcessed = 0; // Starts from 0 streamed updates

        // Initialize filtered view pool
        this.filteredRows = [...this.allRows];
        console.log(`✅ [Store] Loaded ${this.allRows.length} rows. Initial Active Robots: ${robotsSum}, Savings: $${savingsSum}`);
    }

    /**
     * Custom CSV parser with casting logic
     */
    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = this.splitCSVLine(lines[i]);
            if (values.length === headers.length) {
                const row = { internal_uid: `uid-row-${i}` };
                
                for (let j = 0; j < headers.length; j++) {
                    const header = headers[j];
                    const val = values[j].trim();
                    
                    // Cast numeric and monetary columns to numbers
                    if (['robots_deployed', 'budget_usd', 'annual_savings_usd', 'employee_hours_saved'].includes(header)) {
                        row[header] = parseInt(val, 10) || 0;
                    } else if (header === 'roi_percent') {
                        row[header] = parseFloat(val) || 0.00;
                    } else {
                        row[header] = val;
                    }
                }
                
                row.shouldFlash = false;
                data.push(row);
            }
        }
        return data;
    }

    /**
     * CSV line parser that respects quotes
     */
    splitCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    }

    /**
     * Integrates stream updates from dataStream.js.
     * Handles paused buffers and O(1) running KPI recalculations.
     */
    processIncomingBatch(incomingBatch) {
        this.kpis.totalProcessed += incomingBatch.length;

        if (this.isPaused) {
            // Queue the data updates so that the state matches the timeline, 
            // but we defer UI rendering and keep the UI grid completely locked.
            this.pausedUpdateQueue.push(...incomingBatch);
            // Process internally in the background state
            this.integrateBatchData(incomingBatch);
            return;
        }

        // Standard flow
        this.integrateBatchData(incomingBatch);
        this.applyFiltersAndSort();
        this.notify();
    }

    /**
     * Integrates batch array into store and adjusts KPIs incrementally.
     */
    integrateBatchData(batch) {
        for (let i = 0; i < batch.length; i++) {
            const updatedRow = batch[i];
            const existing = this.projectMap.get(updatedRow.project_id);
            
            const robots = parseInt(updatedRow.robots_deployed, 10) || 0;
            const savings = parseInt(updatedRow.annual_savings_usd, 10) || 0;
            const budget = parseInt(updatedRow.budget_usd, 10) || 0;
            const hours = parseInt(updatedRow.employee_hours_saved, 10) || 0;
            const roi = parseFloat(updatedRow.roi_percent) || 0.00;
            const status = updatedRow.project_status;

            if (existing) {
                // Flash detection: status failure or negative ROI
                const wasAlert = existing.project_status === 'Failed' || existing.roi_percent < 0;
                const isAlert = status === 'Failed' || roi < 0;
                
                if (isAlert && !wasAlert) {
                    existing.shouldFlash = true;
                }

                // O(1) Incremental adjustments
                this.kpis.activeRobots += (robots - existing.robots_deployed);
                this.kpis.cumulativeSavings += (savings - existing.annual_savings_usd);

                // Update properties in place (reduces garbage collection allocations)
                existing.project_status = status;
                existing.robots_deployed = robots;
                existing.annual_savings_usd = savings;
                existing.budget_usd = budget;
                existing.employee_hours_saved = hours;
                existing.roi_percent = roi;
                
                // Copy any additional stream mutations
                const keys = Object.keys(updatedRow);
                for (let k = 0; k < keys.length; k++) {
                    const key = keys[k];
                    if (!['robots_deployed', 'annual_savings_usd', 'budget_usd', 'employee_hours_saved', 'roi_percent'].includes(key)) {
                        existing[key] = updatedRow[key];
                    }
                }
            } else {
                // New record
                const isAlert = status === 'Failed' || roi < 0;
                const newRow = {
                    ...updatedRow,
                    robots_deployed: robots,
                    annual_savings_usd: savings,
                    budget_usd: budget,
                    employee_hours_saved: hours,
                    roi_percent: roi,
                    shouldFlash: isAlert
                };
                
                this.allRows.push(newRow);
                this.projectMap.set(newRow.project_id, newRow);
                
                this.kpis.activeRobots += robots;
                this.kpis.cumulativeSavings += savings;
            }
        }
    }

    /**
     * Pause the UI stream rendering
     */
    pause() {
        this.isPaused = true;
    }

    /**
     * Resume the UI stream rendering and flush the queue in a single batch
     */
    resume() {
        this.isPaused = false;
        this.pausedUpdateQueue = [];
        this.applyFiltersAndSort();
        this.notify();
    }

    /**
     * Set Categorical Filter selection
     */
    setFilter(category, valuesArray) {
        this.activeFilters[category] = new Set(valuesArray);
        this.applyFiltersAndSort();
        this.notify();
    }

    /**
     * Clear all categorical filters
     */
    clearFilters() {
        this.activeFilters.automation_type.clear();
        this.activeFilters.department.clear();
        this.activeFilters.industry.clear();
        this.applyFiltersAndSort();
        this.notify();
    }

    /**
     * Set Search Query for fuzzy text search. Pre-tokenizes string for maximum speed.
     */
    setSearchQuery(query) {
        this.searchQuery = query;
        this.searchTerms = query.toLowerCase().split(/\s+/).filter(t => t);
        this.applyFiltersAndSort();
        this.notify();
    }

    /**
     * Set Sort states. Supports multi-column compound sorting.
     */
    toggleSort(column, isMultiSort = false) {
        const existingIdx = this.activeSorts.findIndex(s => s.column === column);
        
        if (isMultiSort) {
            if (existingIdx > -1) {
                // Toggle direction: asc -> desc -> remove
                const currentDir = this.activeSorts[existingIdx].direction;
                if (currentDir === 'asc') {
                    this.activeSorts[existingIdx].direction = 'desc';
                } else {
                    this.activeSorts.splice(existingIdx, 1);
                }
            } else {
                // Add sub-sort
                this.activeSorts.push({ column, direction: 'asc' });
            }
        } else {
            // Single column sort
            if (existingIdx > -1) {
                const currentDir = this.activeSorts[existingIdx].direction;
                this.activeSorts = [];
                if (currentDir === 'asc') {
                    this.activeSorts.push({ column, direction: 'desc' });
                }
            } else {
                this.activeSorts = [{ column, direction: 'asc' }];
            }
        }
        
        this.applyFiltersAndSort();
        this.notify();
    }

    getSortDirection(column) {
        const sort = this.activeSorts.find(s => s.column === column);
        return sort ? sort.direction : null;
    }

    /**
     * Reusable, non-allocating sorting comparator
     */
    compareRows(a, b) {
        for (let i = 0; i < this.activeSorts.length; i++) {
            const sort = this.activeSorts[i];
            const valA = a[sort.column];
            const valB = b[sort.column];
            
            let cmp = 0;
            if (typeof valA === 'number' && typeof valB === 'number') {
                cmp = valA - valB;
            } else {
                cmp = String(valA || '').localeCompare(String(valB || ''));
            }
            
            if (cmp !== 0) {
                return sort.direction === 'asc' ? cmp : -cmp;
            }
        }
        return 0;
    }

    /**
     * Applies filters, fuzzy search, and sorts in a unified pipeline
     */
    applyFiltersAndSort() {
        let result = this.allRows;

        // 1. Categorical Filters (Intersection logic)
        if (this.activeFilters.automation_type.size > 0) {
            result = result.filter(r => this.activeFilters.automation_type.has(r.automation_type));
        }
        if (this.activeFilters.department.size > 0) {
            result = result.filter(r => this.activeFilters.department.has(r.department));
        }
        if (this.activeFilters.industry.size > 0) {
            result = result.filter(r => this.activeFilters.industry.has(r.industry));
        }

        // 2. Fuzzy Search Matcher (Using pre-tokenized terms list)
        if (this.searchTerms.length > 0) {
            result = result.filter(row => {
                const fields = [
                    row.project_name,
                    row.company_id,
                    row.implementation_partner,
                    row.country
                ].map(f => (f || '').toLowerCase());
                
                return this.searchTerms.every(term => {
                    return fields.some(field => field.includes(term));
                });
            });
        }

        // 3. Multi-column Compound Sorting
        if (this.activeSorts.length > 0) {
            result = [...result].sort(this.compareRows);
        }

        this.filteredRows = result;
    }

    /**
     * Get unique items of a column for filters setup
     */
    getUniqueCategories(columnName) {
        const set = new Set();
        for (let i = 0; i < this.allRows.length; i++) {
            const val = this.allRows[i][columnName];
            if (val) {
                set.add(val);
            }
        }
        return [...set].sort();
    }

    /**
     * Get aggregated Savings by Department for chart
     */
    getDepartmentSavingsData() {
        const map = new Map();
        
        for (let i = 0; i < this.filteredRows.length; i++) {
            const row = this.filteredRows[i];
            const dept = row.department || 'Unknown';
            const savings = row.annual_savings_usd || 0;
            map.set(dept, (map.get(dept) || 0) + savings);
        }

        return [...map.entries()]
            .map(([department, savings]) => ({ department, savings }))
            .sort((a, b) => b.savings - a.savings)
            .slice(0, 10);
    }
}
