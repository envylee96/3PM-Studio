/**********************************************************************
 * api.js - lớp gọi API tới Google Apps Script
 * >>> DÁN URL /exec của bạn vào đây sau khi deploy Web App <<<
 **********************************************************************/
const API_URL = 'https://script.google.com/macros/s/AKfycbzFGVyoiaVzP0YBTR0PCPfjdYBcy1etusnqCKKIH90jAGAYck0D1Erspur5ZPHWTN9mKQ/exec';

/** GET: list, dashboard */
async function apiGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${API_URL}?${qs}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Lỗi không xác định');
  return data.data;
}

/** POST: create, update, updateStatus, delete, upload, login
 *  Dùng text/plain để tránh CORS preflight với Apps Script */
async function apiPost(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Lỗi không xác định');
  return data.data;
}

// ---- Các hàm tiện ích nghiệp vụ ----
const Api = {
  listTransactions: (filters) => apiGet('list', filters),
  dashboard: () => apiGet('dashboard'),
  createTransaction: (tx) => apiPost('create', tx),
  updateTransaction: (tx) => apiPost('update', tx),
  updateStatus: (id, status, extra = {}) => apiPost('updateStatus', { id, status, ...extra }),
  deleteTransaction: (id) => apiPost('delete', { id }),
  login: (username, password) => apiPost('login', { username, password }),

  /** Upload ảnh: nhận File object -> base64 -> Drive */
  uploadImage: (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result.split(',')[1]; // bỏ phần "data:...;base64,"
        const data = await apiPost('upload', {
          fileName: file.name,
          mimeType: file.type,
          base64
        });
        resolve(data);
      } catch (e) { reject(e); }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  })
};

// ---- Tiện ích chung dùng cho cả 2 trang ----
function formatVND(n) {
  return (Number(n) || 0).toLocaleString('vi-VN') + ' ₫';
}

function currentUser() {
  try { return JSON.parse(localStorage.getItem('3pm_user')) || null; }
  catch { return null; }
}

function setUser(u) { localStorage.setItem('3pm_user', JSON.stringify(u)); }
function logout() { localStorage.removeItem('3pm_user'); location.reload(); }
