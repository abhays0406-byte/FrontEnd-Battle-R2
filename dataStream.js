/**
 * ============================================================================
 * OFFICIAL HACKATHON TELEMETRY PIPELINE ENGINE (dataStream.js)
 * ============================================================================
 * * HACKATHON PARTICIPANT INSTRUCTIONS:
 * * 1. FILE LOCATION (CRITICAL FOR DEPLOYMENT):
 * - Put your rpa_database_2026.csv file into your project's PUBLIC folder.
 * • React (Vite / Create React App): /public/rpa_database_2026.csv
 * • Next.js (App or Pages Router): /public/rpa_database_2026.csv
 * - This allows the native Fetch API to resolve the file path correctly both 
 * locally and on cloud deployments (Vercel, Netlify, GitHub Pages).
 * * 2. INTEGRATION INTO SCRIPT TAG:
 * - Load this script in your application root:
 * • React (Vite): Add <script src="/dataStream.js"></script> in index.html.
 * • Next.js: Use the Next.js Script Component in your root layout:
 * <Script src="/dataStream.js" strategy="beforeInteractive" />
 * * 3. REACT / NEXT.JS STATE HOOK EXAMPLE:
 * Inside your high-performance grid component, initialize it like this:
 * * useEffect(() => {
 * if (typeof window !== 'undefined' && window.initializeRpaStream) {
 * window.initializeRpaStream((incomingBatch) => {
 * // FAST STATE ENGINE INTEGRATION
 * YOUR_STATE_ENGINE.process(incomingBatch); 
 * }, '/rpa_database_2026.csv');
 * }
 * }, []);
 * * ============================================================================
 */

(function() {
  let memoryPool = [];
  let isInitialized = false;

  const randomRange = (min, max) => Math.random() * (max - min) + min;

  /**
   * Native, highly-optimized CSV Parser
   * Formats the static vendor spreadsheet matrix into a high-performance memory array.
   */
  const parseCSV = (csvText) => {
    console.log("⚡ [Pipeline Engine] Parsing Official Hackathon CSV into Memory Pool...");
    const lines = csvText.trim().split('\n');
    
    // Auto-detect comma or tab separation based on the headers
    const headers = lines[0].split('\t').length > lines[0].split(',').length 
      ? lines[0].split('\t').map(h => h.trim()) 
      : lines[0].split(',').map(h => h.trim());
    
    const parsedData = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      // Handle both standard CSV and TSV clean strings
      const values = lines[i].includes('\t') ? lines[i].split('\t') : lines[i].split(','); 
      
      if (values.length === headers.length) {
        let rowObject = { internal_uid: `uid-row-${i}` }; // Primary key for unique DOM tracking
        
        headers.forEach((header, index) => {
          let val = values[index].trim();
          
          // Cast values to strict types for proper sorting and mathematical operations
          if (['employee_count', 'annual_revenue_usd', 'customer_count', 'founded_year'].includes(header)) {
            rowObject[header] = parseInt(val, 10) || 0;
          } else if (header === 'market_share_percent') {
            rowObject[header] = parseFloat(val) || 0.00;
          } else {
            rowObject[header] = val; // Metadata strings (Yes/No, Country, URLs)
          }
        });
        parsedData.push(rowObject);
      }
    }
    return parsedData;
  };

  /**
   * Global Stream Initialization Hook
   * Exposed to the window scope to anchor directly to custom front-end viewports.
   */
  window.initializeRpaStream = async function(callback, csvUrl = '/rpa_database_2026.csv') {
    if (typeof callback !== 'function') {
      console.error("❌ [Pipeline Error] initializeRpaStream requires a callback function execution loop.");
      return;
    }

    if (isInitialized) {
      console.warn("⚠️ [Pipeline Warning] Telemetry stream has already been initialized.");
      return;
    }

    try {
      console.log(`📦 [Pipeline Engine] Fetching schema baseline from target destination: ${csvUrl}`);
      const response = await fetch(csvUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP network error! status: ${response.status}`);
      }

      const csvText = await response.text();
      memoryPool = parseCSV(csvText);
      isInitialized = true;
      
      console.log(`✅ [Pipeline Engine] Successfully mapped ${memoryPool.length} rows directly into RAM.`);
      console.log("🚀 [Pipeline Engine] Starting high-frequency 200ms background execution firehose...");

      // Telemetry firehose tick rate matching strict hackathon runtime constraints
      setInterval(() => {
        if (memoryPool.length === 0) return;

        // Fluctuates an active cluster of records every cycle (5 to 50 updates per tick)
        const batchSize = Math.floor(randomRange(5, 50)); 
        const incomingBatch = [];

        for (let i = 0; i < batchSize; i++) {
          const targetIndex = Math.floor(randomRange(0, memoryPool.length));
          const row = { ...memoryPool[targetIndex] }; // Shallow clone to decouple references

          const isAnomaly = Math.random() > 0.95; // 5% chance of critical macro shifts
          
          if (isAnomaly) {
            // Massive macro volatility injection
            row.annual_revenue_usd += Math.floor(randomRange(-5000000, 5000000));
            row.customer_count += Math.floor(randomRange(-50, 50));
            row.market_share_percent = parseFloat((row.market_share_percent + randomRange(-0.05, 0.05)).toFixed(4));
          } else {
            // High-frequency standard operational telemetry noise
            row.annual_revenue_usd += Math.floor(randomRange(-50000, 100000));
            row.employee_count += Math.floor(randomRange(-2, 5));
            row.customer_count += Math.floor(randomRange(-1, 3));
          }

          // Strict downstream constraints: sanitize limits before pushing to components
          row.annual_revenue_usd = Math.max(0, row.annual_revenue_usd);
          row.employee_count = Math.max(1, row.employee_count);
          row.customer_count = Math.max(0, row.customer_count);
          row.market_share_percent = parseFloat(Math.max(0, row.market_share_percent).toFixed(4));

          // Reflect metrics mutation in state cache
          memoryPool[targetIndex] = row;
          incomingBatch.push(row);
        }

        // Blast payload batch array to client-side callback system
        callback(incomingBatch);
      }, 200);

    } catch (error) {
      console.error("❌ [Pipeline Critical Crash] Could not initialize telemetry stream:", error);
      console.error("👉 Fix Checklist: Verify server configuration, absolute path constraints, or check if the asset is missing inside your root public/ directory.");
    }
  };
})();