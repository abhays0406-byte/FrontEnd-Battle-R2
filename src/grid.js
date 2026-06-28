/**
 * High-Performance Virtualized DOM Grid
 * Manages low-level row recycling, scroll synchronizations,
 * financial formatting sanitations, and animation triggers.
 * Optimized to prevent layout thrashing and eliminate hot-path innerHTML writes.
 */

export class VirtualizedGrid {
    constructor(containerEl, spacerEl, store, rowHeight = 40) {
        this.container = containerEl;
        this.spacer = spacerEl;
        this.store = store;
        this.rowHeight = rowHeight;
        
        this.visibleCount = 0;
        this.rowPool = []; // Recycled DOM row elements
        this.viewportHeight = 0;
        
        // Bind event handlers
        this.onScroll = this.onScroll.bind(this);
        this.render = this.render.bind(this);
        
        this.init();
    }

    // ==========================================
    // STATIC FORMATTING HELPERS (Defined once to prevent GC overhead)
    // ==========================================
    static formatCurrency(val) {
        return '$' + (parseInt(val, 10) || 0).toLocaleString();
    }

    static formatPercent(val) {
        const num = parseFloat(val) || 0;
        // Clamping: ROI cannot be less than -100% (total loss)
        const clamped = Math.max(-100, num);
        return clamped.toFixed(2) + '%';
    }

    static formatNumber(val) {
        return (parseInt(val, 10) || 0).toLocaleString();
    }

    init() {
        // Setup scroll listener
        this.container.addEventListener('scroll', this.onScroll, { passive: true });
        
        // Subscribe to store updates
        this.store.subscribe(this.render);
        
        // Initialize resize observer to adjust pool size on layout shifts
        this.resizeObserver = new ResizeObserver(entries => {
            for (let i = 0; i < entries.length; i++) {
                this.updateViewport(entries[i].contentRect.height);
            }
        });
        this.resizeObserver.observe(this.container);
        
        // First viewport calculation
        this.updateViewport(this.container.clientHeight || 500);
    }

    updateViewport(height) {
        if (height === 0) return;
        this.viewportHeight = height;
        
        // Calculate required row elements (+3 buffers for scrolling overlap)
        const targetPoolSize = Math.ceil(height / this.rowHeight) + 3;
        
        // Grow or shrink the DOM row pool
        if (this.rowPool.length < targetPoolSize) {
            const diff = targetPoolSize - this.rowPool.length;
            for (let i = 0; i < diff; i++) {
                const rowEl = this.createRowDOM();
                this.container.appendChild(rowEl);
                this.rowPool.push(rowEl);
            }
        }
        
        this.render();
    }

    createRowDOM() {
        const rowEl = document.createElement('div');
        rowEl.className = 'grid-row';
        rowEl.style.display = 'none';
        
        // Clean up row flash animation once it completes
        rowEl.addEventListener('animationend', () => {
            rowEl.classList.remove('row-alert-flash');
        }, { passive: true });
        
        const cellClasses = [
            'project_id', 'project_name', 'project_status', 'automation_type', 
            'robots_deployed', 'budget_usd', 'annual_savings_usd', 'roi_percent', 
            'employee_hours_saved', 'department', 'industry', 'country'
        ];
        
        for (let i = 0; i < cellClasses.length; i++) {
            const className = cellClasses[i];
            const cell = document.createElement('div');
            
            // Align numbers right
            if (['robots_deployed', 'budget_usd', 'annual_savings_usd', 'roi_percent', 'employee_hours_saved'].includes(className)) {
                cell.className = `grid-cell numeric ${className}`;
            } else {
                cell.className = `grid-cell ${className}`;
            }

            // Create inner span once for status pill (prevents innerHTML re-evaluations later)
            if (className === 'project_status') {
                const span = document.createElement('span');
                span.className = 'status-pill';
                cell.appendChild(span);
            }

            rowEl.appendChild(cell);
        }
        
        return rowEl;
    }

    onScroll() {
        this.render();
    }

    render() {
        const data = this.store.filteredRows;
        
        // Update height spacer for native scrollbar
        const totalHeight = data.length * this.rowHeight;
        this.spacer.style.height = `${totalHeight}px`;

        if (data.length === 0) {
            // Hide row elements
            for (let i = 0; i < this.rowPool.length; i++) {
                this.rowPool[i].style.display = 'none';
            }
            this.showEmptyState();
            return;
        }

        this.hideEmptyState();

        const scrollTop = this.container.scrollTop;
        const startIndex = Math.max(0, Math.floor(scrollTop / this.rowHeight) - 1);
        const endIndex = Math.min(data.length - 1, startIndex + this.rowPool.length - 1);

        // Map recycled elements to data offsets
        for (let i = 0; i < this.rowPool.length; i++) {
            const rowEl = this.rowPool[i];
            const dataIndex = startIndex + i;

            if (dataIndex <= endIndex) {
                const rowData = data[dataIndex];
                rowEl.style.display = 'grid';
                rowEl.style.transform = `translateY(${dataIndex * this.rowHeight}px)`;
                
                this.updateRowData(rowEl, rowData);
            } else {
                rowEl.style.display = 'none';
            }
        }
    }

    updateRowData(rowEl, rowData) {
        const cells = rowEl.children;
        
        // 0. Project ID
        cells[0].textContent = rowData.project_id || 'N/A';
        cells[0].title = rowData.project_id || '';
        
        // 1. Project Name
        cells[1].textContent = rowData.project_name || 'N/A';
        cells[1].title = rowData.project_name || '';
        
        // 2. Status (Mutate span text and class directly, no innerHTML)
        const status = rowData.project_status || 'Unknown';
        const pill = cells[2].firstElementChild;
        if (pill) {
            pill.textContent = status;
            pill.className = `status-pill ${status.toLowerCase()}`;
        }
        
        // 3. Automation Type
        cells[3].textContent = rowData.automation_type || 'N/A';
        cells[3].title = rowData.automation_type || '';
        
        // 4. Robots Deployed
        cells[4].textContent = VirtualizedGrid.formatNumber(rowData.robots_deployed);
        
        // 5. Budget (USD)
        cells[5].textContent = VirtualizedGrid.formatCurrency(rowData.budget_usd);
        
        // 6. Annual Savings (USD)
        cells[6].textContent = VirtualizedGrid.formatCurrency(rowData.annual_savings_usd);
        
        // 7. ROI %
        cells[7].textContent = VirtualizedGrid.formatPercent(rowData.roi_percent);
        if (rowData.roi_percent < 0) {
            cells[7].style.color = 'var(--status-failed)';
        } else {
            cells[7].style.color = '';
        }
        
        // 8. Hours Saved
        cells[8].textContent = VirtualizedGrid.formatNumber(rowData.employee_hours_saved);
        
        // 9. Department
        cells[9].textContent = rowData.department || 'N/A';
        cells[9].title = rowData.department || '';
        
        // 10. Industry
        cells[10].textContent = rowData.industry || 'N/A';
        cells[10].title = rowData.industry || '';
        
        // 11. Country
        cells[11].textContent = rowData.country || 'N/A';
        cells[11].title = rowData.country || '';

        // ⚠️ FLASH ALERT RESOLVER
        if (rowData.shouldFlash) {
            rowEl.classList.remove('row-alert-flash');
            void rowEl.offsetWidth; // Force trigger reflow to restart CSS animation keyframes
            rowEl.classList.add('row-alert-flash');
            
            // Consume the state flag in store
            rowData.shouldFlash = false;
        }
    }

    showEmptyState() {
        let emptyEl = this.container.querySelector('.empty-state');
        if (!emptyEl) {
            emptyEl = document.createElement('div');
            emptyEl.className = 'empty-state';
            emptyEl.innerHTML = `
                <div class="empty-state-icon">🔍</div>
                <h3>No Matching Projects</h3>
                <p>Try adjusting your search criteria or filters.</p>
            `;
            this.container.appendChild(emptyEl);
        }
        emptyEl.style.display = 'flex';
        this.spacer.style.height = '0px';
    }

    hideEmptyState() {
        const emptyEl = this.container.querySelector('.empty-state');
        if (emptyEl) {
            emptyEl.style.display = 'none';
        }
    }

    destroy() {
        this.container.removeEventListener('scroll', this.onScroll);
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
    }
}
