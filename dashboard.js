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

let chartRef = null;
function renderChart(c) {
  const ctx = document.getElementById('chart');
  if (chartRef) chartRef.destroy();
  chartRef = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: c.labels,
      datasets: [
        { label: 'Thu', data: c.incomes, backgroundColor: '#16a34a' },
        { label: 'Chi', data: c.expenses, backgroundColor: '#dc2626' }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => (v / 1000) + 'K' }
        }
      }
    }
  });
}
