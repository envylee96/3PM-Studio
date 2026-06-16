/**********************************************************************
 * transaction.js
 **********************************************************************/
let txModal, actionModal, uploadedImageUrl = '', actionMode = '';

document.addEventListener('DOMContentLoaded', () => {
  txModal = new bootstrap.Modal(document.getElementById('txModal'));
  actionModal = new bootstrap.Modal(document.getElementById('actionModal'));
  // mặc định lọc theo tháng hiện tại
  document.getElementById('fMonth').value = new Date().toISOString().substring(0, 7);

  // preview ảnh hóa đơn (form thêm/sửa)
  document.getElementById('fImage').addEventListener('change', (e) => {
    const f = e.target.files[0];
    const prev = document.getElementById('imgPreview');
    if (f) {
      prev.src = URL.createObjectURL(f);
      prev.classList.remove('d-none');
    } else prev.classList.add('d-none');
  });

  // preview ảnh chuyển tiền (form duyệt)
  document.getElementById('proofImage').addEventListener('change', (e) => {
    const f = e.target.files[0];
    const prev = document.getElementById('proofPreview');
    if (f) {
      prev.src = URL.createObjectURL(f);
      prev.classList.remove('d-none');
    } else prev.classList.add('d-none');
  });

  initView();
});

// ---- LOGIN / VIEW ----
function initView() {
  const u = currentUser();
  if (u) {
    document.getElementById('loginView').classList.add('d-none');
    document.getElementById('appView').classList.remove('d-none');
    document.getElementById('userLabel').textContent =
      `${u.displayName} (${u.role === 'accountant' ? 'Kế toán' : 'Nhân viên'})`;
    loadTable();
  } else {
    document.getElementById('loginView').classList.remove('d-none');
    document.getElementById('appView').classList.add('d-none');
  }
}

async function doLogin() {
  const err = document.getElementById('liErr');
  err.textContent = '';
  try {
    const user = await Api.login(
      document.getElementById('liUser').value.trim(),
      document.getElementById('liPass').value.trim()
    );
    setUser(user);
    initView();
  } catch (e) { err.textContent = e.message; }
}

// ---- LOAD TABLE ----
async function loadTable() {
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted py-4">Đang tải…</td></tr>`;
  try {
    const rows = await Api.listTransactions({
      search: document.getElementById('fSearch').value.trim(),
      month: document.getElementById('fMonth').value,
      status: document.getElementById('fStatus').value
    });
    renderRows(rows);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="12" class="text-center text-danger py-4">Lỗi: ${e.message}</td></tr>`;
  }
}

function renderRows(rows) {
  const u = currentUser();
  const isAcct = u && u.role === 'accountant';
  const tbody = document.getElementById('tbody');

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted py-4">Không có giao dịch.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const typeCls = r.type === 'Income' ? 'type-income' : 'type-expense';
    const typeTxt = r.type === 'Income' ? 'Thu' : 'Chi';
    // badge trạng thái + thông tin kèm theo (ảnh chuyển tiền / lý do từ chối)
    let st = statusBadge(r.status);
    if (r.status === 'Đã chi' && r.proofImage) {
      st += ` <a href="${r.proofImage}" target="_blank" title="Ảnh đã chuyển tiền"><i class="bi bi-receipt text-success"></i></a>`;
    }
    if (r.status === 'Từ chối' && r.rejectReason) {
      st += ` <i class="bi bi-info-circle text-danger" title="Lý do: ${esc(r.rejectReason)}"></i>`;
    }

    const img = r.imageUrl
      ? `<img src="${r.imageUrl}" class="thumb" onclick="window.open('${r.imageUrl}','_blank')">`
      : '<span class="text-muted small">—</span>';

    // nút duyệt/từ chối chỉ hiện với kế toán & khi đang Chờ duyệt
    let approveBtns = '';
    if (isAcct && r.status === 'Chờ duyệt') {
      approveBtns = `
        <button class="btn btn-sm btn-success" title="Duyệt - đã chi" onclick="openApprove('${r.id}')"><i class="bi bi-check-lg"></i></button>
        <button class="btn btn-sm btn-warning" title="Từ chối" onclick="openReject('${r.id}')"><i class="bi bi-x-lg"></i></button>`;
    }

    return `<tr>
      <td>${r.id}</td>
      <td class="${typeCls}">${typeTxt}</td>
      <td>${esc(r.title)}</td>
      <td>${st}</td>
      <td class="text-end">${r.quantity}</td>
      <td class="text-end">${formatVND(r.unitPrice)}</td>
      <td class="text-end fw-bold">${formatVND(r.total)}</td>
      <td>${esc(r.note)}</td>
      <td class="text-center">${img}</td>
      <td><small>${r.createdAt}</small></td>
      <td>${esc(r.createdBy)}</td>
      <td class="text-nowrap">
        ${approveBtns}
        <button class="btn btn-sm btn-outline-primary" title="Sửa" onclick='openEdit(${JSON.stringify(r)})'><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" title="Xóa" onclick="delTx('${r.id}')"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function statusBadge(s) {
  const map = { 'Chờ duyệt': 'st-pending', 'Đã chi': 'st-approved', 'Từ chối': 'st-rejected' };
  return `<span class="badge badge-status ${map[s] || ''}">${s}</span>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---- MODAL THÊM ----
function openForm(type) {
  resetForm();
  document.getElementById('modalTitle').textContent = type === 'Income' ? 'Thêm khoản Thu' : 'Thêm khoản Chi';
  document.getElementById('fType').value = type;
  calcTotal();
  txModal.show();
}

// ---- MODAL SỬA ----
function openEdit(r) {
  resetForm();
  document.getElementById('modalTitle').textContent = 'Sửa giao dịch ' + r.id;
  document.getElementById('fId').value = r.id;
  document.getElementById('fType').value = r.type;
  document.getElementById('fTitle').value = r.title;
  document.getElementById('fQty').value = r.quantity;
  document.getElementById('fPrice').value = r.unitPrice;
  document.getElementById('fNote').value = r.note;
  uploadedImageUrl = r.imageUrl || '';
  if (uploadedImageUrl) {
    const prev = document.getElementById('imgPreview');
    prev.src = uploadedImageUrl; prev.classList.remove('d-none');
  }
  calcTotal();
  txModal.show();
}

function resetForm() {
  ['fId', 'fTitle', 'fNote'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fQty').value = 1;
  document.getElementById('fPrice').value = 0;
  document.getElementById('fImage').value = '';
  document.getElementById('imgPreview').classList.add('d-none');
  uploadedImageUrl = '';
}

function calcTotal() {
  const q = Number(document.getElementById('fQty').value) || 0;
  const p = Number(document.getElementById('fPrice').value) || 0;
  document.getElementById('fTotal').value = formatVND(q * p);
}

// ---- LƯU (CREATE / UPDATE) ----
async function saveTx() {
  const btn = document.getElementById('saveBtn');
  const u = currentUser();
  const id = document.getElementById('fId').value;
  const title = document.getElementById('fTitle').value.trim();
  if (!title) { alert('Vui lòng nhập khoản thu/chi'); return; }

  btn.disabled = true; btn.textContent = 'Đang lưu…';
  try {
    // upload ảnh nếu có chọn file mới
    const file = document.getElementById('fImage').files[0];
    if (file) {
      btn.textContent = 'Đang tải ảnh…';
      const up = await Api.uploadImage(file);
      uploadedImageUrl = up.url;
    }

    const payload = {
      id,
      type: document.getElementById('fType').value,
      title,
      quantity: document.getElementById('fQty').value,
      unitPrice: document.getElementById('fPrice').value,
      note: document.getElementById('fNote').value.trim(),
      imageUrl: uploadedImageUrl,
      createdBy: u ? u.username : 'staff'
    };

    if (id) await Api.updateTransaction(payload);
    else await Api.createTransaction(payload);

    txModal.hide();
    loadTable();
  } catch (e) {
    alert('Lỗi khi lưu: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Lưu';
  }
}

// ---- DUYỆT (Đã chi) / TỪ CHỐI ----
function openApprove(id) {
  actionMode = 'approve';
  document.getElementById('actId').value = id;
  document.getElementById('actionTitle').textContent = 'Duyệt chi — tải ảnh đã chuyển tiền';
  document.getElementById('proofImage').value = '';
  document.getElementById('proofPreview').classList.add('d-none');
  document.getElementById('rejectReason').value = '';
  document.getElementById('approveSection').classList.remove('d-none');
  document.getElementById('rejectSection').classList.add('d-none');
  actionModal.show();
}

function openReject(id) {
  actionMode = 'reject';
  document.getElementById('actId').value = id;
  document.getElementById('actionTitle').textContent = 'Từ chối chi tiền';
  document.getElementById('rejectReason').value = '';
  document.getElementById('proofImage').value = '';
  document.getElementById('proofPreview').classList.add('d-none');
  document.getElementById('approveSection').classList.add('d-none');
  document.getElementById('rejectSection').classList.remove('d-none');
  actionModal.show();
}

async function confirmAction() {
  const id = document.getElementById('actId').value;
  const btn = document.getElementById('actSaveBtn');
  btn.disabled = true;
  try {
    if (actionMode === 'approve') {
      const f = document.getElementById('proofImage').files[0];
      if (!f) { alert('Vui lòng chọn ảnh xác nhận đã chuyển tiền'); btn.disabled = false; return; }
      btn.textContent = 'Đang tải ảnh…';
      const up = await Api.uploadImage(f);
      await Api.updateStatus(id, 'Đã chi', { proofImage: up.url });
    } else {
      const reason = document.getElementById('rejectReason').value.trim();
      if (!reason) { alert('Vui lòng nhập lý do từ chối'); btn.disabled = false; return; }
      await Api.updateStatus(id, 'Từ chối', { reason });
    }
    actionModal.hide();
    loadTable();
  } catch (e) {
    alert('Lỗi: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Lưu';
  }
}

// ---- XÓA ----
async function delTx(id) {
  if (!confirm('Xóa giao dịch ' + id + '?')) return;
  try {
    await Api.deleteTransaction(id);
    loadTable();
  } catch (e) { alert('Lỗi: ' + e.message); }
}
