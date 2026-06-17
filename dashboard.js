/**********************************************************************
 * dashboard.js
 **********************************************************************/
document.addEventListener('DOMContentLoaded', () => {
  requireLogin();
  loadDashboard();
});

function requireLogin() {
  const u = currentUser();
  if (!u) { location.href = 'transaction.html'; return; }
  document.getElementById('userLabel').textContent =
    `${u.displayName} (${u.role === 'accountant' ? 'Kế toán' : 'Nhân viên'})`;
}

async function loadDashboard() {
  try {
    const d = await Api.dashboard();
    document.getElementById('curMonth').textContent = d.month;
    document.getElementById('statIncome').textContent = formatVND(d.totalIncome);
    document.getElementById('statExpense').textContent = formatVND(d.totalExpense);

    const profitEl = document.getElementById('statProfit');
    profitEl.textContent = formatVND(d.profit);
    profitEl.classList.add(d.profit >= 0 ? 'text-success' : 'text-danger');

    renderChart(d.chart);
  } catch (e) {
    alert('Lỗi tải dashboard: ' + e.message);
  }
}

// rút gọn số tiền: 15.000.000 -> "15tr", 330.000 -> "330K"
function shortMoney(v) {
  v = Number(v) || 0;
  if (v === 0) return '0';
  if (v >= 1e6) return (v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'tr';
  if (v >= 1e3) return Math.round(v / 1e3) + 'K';
  return String(v);
}

// plugin: vẽ số liệu ngay trên đầu mỗi cột (kể cả cột nhỏ)
const barValueLabels = {
  id: 'barValueLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      meta.data.forEach((bar, i) => {
        const v = ds.data[i];
        if (!v) return; // bỏ qua cột bằng 0 cho đỡ rối
        ctx.save();
        ctx.fillStyle = ds.backgroundColor;
        ctx.font = 'bold 10px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(shortMoney(v), bar.x, bar.y - 4);
        ctx.restore();
      });
    });
  }
};

let chartRef = null;
function renderChart(c) {
  const ctx = document.getElementById('chart');
  if (chartRef) chartRef.destroy();
  chartRef = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: c.labels,
      datasets: [
        { label: 'Thu', data: c.incomes, backgroundColor: '#16a34a', minBarLength: 4 },
        { label: 'Chi', data: c.expenses, backgroundColor: '#dc2626', minBarLength: 4 }
      ]
    },
    options: {
      responsive: true,
      layout: { padding: { top: 24 } }, // chừa chỗ cho nhãn số trên đầu cột
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: (item) => `${item.dataset.label}: ${formatVND(item.parsed.y)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => shortMoney(v) }
        }
      }
    },
    plugins: [barValueLabels]
  });
}
