/**
 * script.js — Sales Analytics Dashboard
 * ----------------------------------------
 * Architecture:
 *  1. DATA LAYER  — fetch & cache JSON, derive filtered subset
 *  2. FILTER LAYER — populate selects, listen for changes
 *  3. KPI LAYER   — compute & render KPI cards
 *  4. CHART LAYER — create / update all Chart.js instances
 *
 * All chart instances are stored in `charts{}` so they can be
 * `.update()`-d in-place without recreating the canvas elements.
 */

'use strict';

// =====================================================
// 1. COLOUR PALETTE
//    Shared palette keeps charts visually consistent.
// =====================================================
const PALETTE = {
  indigo:  '#6366f1',
  emerald: '#10b981',
  amber:   '#f59e0b',
  rose:    '#f43f5e',
  sky:     '#0ea5e9',
  violet:  '#8b5cf6',
  teal:    '#14b8a6',
  orange:  '#f97316',
  pink:    '#ec4899',
  lime:    '#84cc16',
};

/** Multi-series colour array (used for categorical charts) */
const COLOR_SET = Object.values(PALETTE);

/** Polar / Pie chart colours with subtle transparency */
const COLOR_SET_ALPHA = COLOR_SET.map(c => c + 'cc'); // 80% opacity

// =====================================================
// 2. DATA LAYER
// =====================================================
let allData    = [];   // full dataset loaded from JSON
let filteredData = []; // subset after applying active filters

/**
 * Fetch data from JSON file and bootstrap the entire dashboard.
 */
async function loadData() {
  try {
    const response = await fetch('sales_data.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    allData = await response.json();

    // Update the header badge
    document.getElementById('last-updated').textContent =
      `${allData.length} records loaded · ${new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}`;

    populateFilters();    // fill <select> options
    applyFilters();       // initial render with no filters active
  } catch (err) {
    console.error('Failed to load sales_data.json:', err);
    document.getElementById('last-updated').textContent = '⚠ Data load failed';
  }
}

// =====================================================
// 3. FILTER LAYER
// =====================================================

/**
 * Read unique values from allData for each filter dimension
 * and populate the corresponding <select> element.
 */
function populateFilters() {
  const fields = {
    'filter-region':   'region',
    'filter-category': 'product_category',
    'filter-customer': 'customer_type',
    'filter-channel':  'sales_channel',
  };

  Object.entries(fields).forEach(([selectId, field]) => {
    const select  = document.getElementById(selectId);
    const values  = [...new Set(allData.map(d => d[field]))].sort();
    values.forEach(val => {
      const opt   = document.createElement('option');
      opt.value   = val;
      opt.textContent = val;
      select.appendChild(opt);
    });
  });

  // Attach change listeners
  ['filter-region','filter-category','filter-customer','filter-channel'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });

  // Reset button
  document.getElementById('btn-reset').addEventListener('click', resetFilters);
}

/** Read current filter values and derive `filteredData`. */
function applyFilters() {
  const region   = document.getElementById('filter-region').value;
  const category = document.getElementById('filter-category').value;
  const customer = document.getElementById('filter-customer').value;
  const channel  = document.getElementById('filter-channel').value;

  filteredData = allData.filter(d =>
    (!region   || d.region            === region)   &&
    (!category || d.product_category  === category) &&
    (!customer || d.customer_type     === customer) &&
    (!channel  || d.sales_channel     === channel)
  );

  updateDashboard(); // re-render all KPIs + charts
}

/** Clear all selects back to the "All …" default. */
function resetFilters() {
  ['filter-region','filter-category','filter-customer','filter-channel'].forEach(id => {
    document.getElementById(id).value = '';
  });
  applyFilters();
}

// =====================================================
// 4. KPI LAYER
// =====================================================

/** Compute summary statistics from `filteredData` and render KPI cards. */
function renderKPIs() {
  const total = filteredData.reduce((acc, d) => {
    acc.revenue  += d.revenue;
    acc.qty      += d.quantity;
    acc.discount += d.discount;
    return acc;
  }, { revenue: 0, qty: 0, discount: 0 });

  const count   = filteredData.length;
  const avgDisc = count ? (total.discount / count) * 100 : 0;

  document.getElementById('kpi-revenue').textContent =
    '$' + total.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.getElementById('kpi-transactions').textContent =
    count.toLocaleString('en-US');
  document.getElementById('kpi-quantity').textContent =
    total.qty.toLocaleString('en-US');
  document.getElementById('kpi-discount').textContent =
    avgDisc.toFixed(1) + '%';
}

// =====================================================
// 5. CHART REGISTRY
//    Each chart instance is stored here so we can
//    update data in-place on filter changes.
// =====================================================
const charts = {};

/**
 * Helper — creates or updates a Chart.js instance.
 * @param {string} id      — canvas element ID
 * @param {string} type    — Chart.js type string
 * @param {object} config  — full Chart.js config object
 */
function upsertChart(id, type, config) {
  if (charts[id]) {
    // Update existing chart data in-place (smooth transition)
    const ch = charts[id];
    ch.data  = config.data;
    if (config.options) ch.options = config.options;
    ch.update('active');
  } else {
    // Create new chart
    const ctx = document.getElementById(id).getContext('2d');
    charts[id] = new Chart(ctx, { type, ...config });
  }
}

// =====================================================
// 6. CHART RENDERERS
// =====================================================

/* ----- 6.1  Sales Trend — Line chart (monthly revenue) ----- */
function renderSalesTrend() {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Aggregate revenue by month
  const monthlyRev = new Array(12).fill(0);
  filteredData.forEach(d => {
    const month = new Date(d.date).getMonth(); // 0-based
    monthlyRev[month] += d.revenue;
  });

  upsertChart('chart-sales-trend', 'line', {
    data: {
      labels: MONTHS,
      datasets: [{
        label: 'Monthly Revenue ($)',
        data: monthlyRev.map(v => +v.toFixed(2)),
        borderColor: PALETTE.indigo,
        backgroundColor: PALETTE.indigo + '22',
        borderWidth: 2.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4,
      }],
    },
    options: defaultLineOptions('Revenue ($)'),
  });
}

/* ----- 6.2  Revenue per Region — Polar Area Chart ----- */
function renderRegionChart() {
  const regionMap = {};
  filteredData.forEach(d => {
    regionMap[d.region] = (regionMap[d.region] || 0) + d.revenue;
  });

  const labels = Object.keys(regionMap);
  const values = labels.map(k => +regionMap[k].toFixed(2));
  const colors = labels.map((_, i) => COLOR_SET[i % COLOR_SET.length]);

  upsertChart('chart-region', 'polarArea', {
    data: {
      labels,
      datasets: [{
        label: 'Revenue ($)',
        data: values,
        backgroundColor: colors.map(c => c + 'bb'),
        borderColor: colors,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => ` $${ctx.parsed.r.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          },
        },
      },
      scales: {
        r: {
          ticks: { font: { size: 10 }, backdropColor: 'transparent' },
          grid:  { color: '#e2e8f0' },
        },
      },
    },
  });
}

/* ----- 6.3  Revenue per Product Category — Horizontal Bar ----- */
function renderCategoryRevenueChart() {
  const catMap = {};
  filteredData.forEach(d => {
    catMap[d.product_category] = (catMap[d.product_category] || 0) + d.revenue;
  });

  const sorted  = Object.entries(catMap).sort((a,b) => b[1] - a[1]);
  const labels  = sorted.map(e => e[0]);
  const values  = sorted.map(e => +e[1].toFixed(2));
  const colors  = labels.map((_, i) => COLOR_SET[i % COLOR_SET.length]);

  upsertChart('chart-category-revenue', 'bar', {
    data: {
      labels,
      datasets: [{
        label: 'Revenue ($)',
        data: values,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor: colors,
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: {
      ...defaultBarOptions('Revenue ($)'),
      indexAxis: 'y',
    },
  });
}

/* ----- 6.4  Sales per Sales Representative — Vertical Bar ----- */
function renderSalesRepChart() {
  const repMap = {};
  filteredData.forEach(d => {
    repMap[d.sales_rep] = (repMap[d.sales_rep] || 0) + d.revenue;
  });

  const sorted  = Object.entries(repMap).sort((a,b) => b[1] - a[1]);
  const labels  = sorted.map(e => e[0].split(' ')[0]); // first name only
  const values  = sorted.map(e => +e[1].toFixed(2));

  upsertChart('chart-sales-rep', 'bar', {
    data: {
      labels,
      datasets: [{
        label: 'Revenue ($)',
        data: values,
        backgroundColor: COLOR_SET.map(c => c + 'cc'),
        borderColor: COLOR_SET,
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: defaultBarOptions('Revenue ($)'),
  });
}

/* ----- 6.5  Customer Type Distribution — Doughnut ----- */
function renderCustomerTypeChart() {
  const typeMap = {};
  filteredData.forEach(d => {
    typeMap[d.customer_type] = (typeMap[d.customer_type] || 0) + 1;
  });

  const labels = Object.keys(typeMap);
  const values = labels.map(k => typeMap[k]);
  const colors = [PALETTE.indigo, PALETTE.emerald, PALETTE.amber];

  upsertChart('chart-customer-type', 'doughnut', {
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: defaultPieOptions(),
  });
}

/* ----- 6.6  Payment Method Usage — Doughnut ----- */
function renderPaymentChart() {
  const pmMap = {};
  filteredData.forEach(d => {
    pmMap[d.payment_method] = (pmMap[d.payment_method] || 0) + 1;
  });

  const labels = Object.keys(pmMap);
  const values = labels.map(k => pmMap[k]);
  const colors = [PALETTE.sky, PALETTE.violet, PALETTE.teal, PALETTE.orange];

  upsertChart('chart-payment', 'doughnut', {
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: defaultPieOptions(),
  });
}

/* ----- 6.7  Sales Channel Distribution — Doughnut ----- */
function renderChannelChart() {
  const chMap = {};
  filteredData.forEach(d => {
    chMap[d.sales_channel] = (chMap[d.sales_channel] || 0) + 1;
  });

  const labels = Object.keys(chMap);
  const values = labels.map(k => chMap[k]);
  const colors = [PALETTE.rose, PALETTE.lime, PALETTE.pink, PALETTE.amber];

  upsertChart('chart-channel', 'doughnut', {
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: defaultPieOptions(),
  });
}

/* ----- 6.8  Discount vs Revenue — Scatter Plot ----- */
function renderScatterChart() {
  const points = filteredData.map(d => ({
    x: +(d.discount * 100).toFixed(1),
    y: +d.revenue.toFixed(2),
  }));

  upsertChart('chart-scatter', 'scatter', {
    data: {
      datasets: [{
        label: 'Transaction',
        data: points,
        backgroundColor: PALETTE.indigo + '55',
        borderColor:     PALETTE.indigo + 'aa',
        pointRadius: 4,
        pointHoverRadius: 7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `Discount: ${ctx.parsed.x}%  |  Revenue: $${ctx.parsed.y.toLocaleString('en-US')}`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Discount (%)', font: { size: 11 }, color: '#64748b' },
          grid:  { color: '#f1f5f9' },
          ticks: { color: '#64748b', font: { size: 11 } },
        },
        y: {
          title: { display: true, text: 'Revenue ($)', font: { size: 11 }, color: '#64748b' },
          grid:  { color: '#f1f5f9' },
          ticks: { color: '#64748b', font: { size: 11 } },
        },
      },
    },
  });
}

/* ----- 6.9  Top 10 Highest Revenue Transactions — Horizontal Bar ----- */
function renderTop10Chart() {
  const sorted = [...filteredData].sort((a,b) => b.revenue - a.revenue).slice(0, 10);
  const labels = sorted.map(d => `#${d.id} ${d.product_name.length > 18 ? d.product_name.slice(0,18)+'…' : d.product_name}`);
  const values = sorted.map(d => +d.revenue.toFixed(2));

  upsertChart('chart-top10', 'bar', {
    data: {
      labels,
      datasets: [{
        label: 'Revenue ($)',
        data: values,
        backgroundColor: values.map((_, i) => COLOR_SET[i % COLOR_SET.length] + 'bb'),
        borderColor:     values.map((_, i) => COLOR_SET[i % COLOR_SET.length]),
        borderWidth: 1.5,
        borderRadius: 5,
      }],
    },
    options: {
      ...defaultBarOptions('Revenue ($)'),
      indexAxis: 'y',
    },
  });
}

/* ----- 6.10  Quantity Sold per Category — Vertical Bar ----- */
function renderCategoryQtyChart() {
  const catMap = {};
  filteredData.forEach(d => {
    catMap[d.product_category] = (catMap[d.product_category] || 0) + d.quantity;
  });

  const sorted = Object.entries(catMap).sort((a,b) => b[1] - a[1]);
  const labels = sorted.map(e => e[0]);
  const values = sorted.map(e => e[1]);

  upsertChart('chart-category-qty', 'bar', {
    data: {
      labels,
      datasets: [{
        label: 'Quantity Sold',
        data: values,
        backgroundColor: labels.map((_, i) => COLOR_SET[i % COLOR_SET.length] + 'cc'),
        borderColor:     labels.map((_, i) => COLOR_SET[i % COLOR_SET.length]),
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: defaultBarOptions('Quantity'),
  });
}

// =====================================================
// 7. SHARED CHART OPTION FACTORIES
// =====================================================

/** Shared options for Bar charts. */
function defaultBarOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => {
            const v = ctx.parsed.y ?? ctx.parsed.x;
            return ` ${v.toLocaleString('en-US')}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { color: '#f1f5f9' }, ticks: { color: '#64748b', font: { size: 11 } } },
      y: {
        grid: { color: '#f1f5f9' },
        ticks: { color: '#64748b', font: { size: 11 } },
        title: { display: true, text: yLabel, font: { size: 11 }, color: '#94a3b8' },
      },
    },
  };
}

/** Shared options for Line charts. */
function defaultLineOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: ctx => ` $${ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: { grid: { color: '#f1f5f9' }, ticks: { color: '#64748b', font: { size: 11 } } },
      y: {
        grid: { color: '#f1f5f9' },
        ticks: { color: '#64748b', font: { size: 11 } },
        title: { display: true, text: yLabel, font: { size: 11 }, color: '#94a3b8' },
      },
    },
  };
}

/** Shared options for Pie/Doughnut charts. */
function defaultPieOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: ctx => {
            const total = ctx.dataset.data.reduce((a,b) => a+b, 0);
            const pct   = ((ctx.parsed / total) * 100).toFixed(1);
            return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
          },
        },
      },
    },
  };
}

// =====================================================
// 8. ORCHESTRATOR — render everything
// =====================================================

/** Called on every filter change. Re-renders KPIs and all charts. */
function updateDashboard() {
  renderKPIs();
  renderSalesTrend();
  renderRegionChart();
  renderCategoryRevenueChart();
  renderSalesRepChart();
  renderCustomerTypeChart();
  renderPaymentChart();
  renderChannelChart();
  renderScatterChart();
  renderTop10Chart();
  renderCategoryQtyChart();
}

// =====================================================
// 9. ENTRY POINT — kick off data load on DOM ready
// =====================================================
document.addEventListener('DOMContentLoaded', loadData);
