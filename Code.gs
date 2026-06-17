/**********************************************************************
 * 3PM - Quản lý Thu/Chi shop thời trang
 * Backend: Google Apps Script (Web App)
 * Database: Google Sheet  | Upload ảnh: Google Drive
 *
 * CÁCH DEPLOY:
 *  1. Mở Google Sheet -> Extensions -> Apps Script -> dán file này.
 *  2. Chạy hàm setup() 1 lần (tạo sheet + dữ liệu mẫu, xin quyền Drive).
 *  3. Deploy -> New deployment -> Web app
 *        - Execute as: Me
 *        - Who has access: Anyone
 *  4. Copy URL /exec dán vào api.js (biến API_URL).
 **********************************************************************/

// ===== CẤU HÌNH =====
var SHEET_ID   = '1I8WoK64q2rg9lIsbjMgmcY92mYJejo01UDpAG4cCpoM';
var SHEET_TX   = 'transactions';
var SHEET_USER = 'users';
var DRIVE_FOLDER_NAME = '3PM_Receipts'; // folder lưu ảnh hóa đơn

// Thứ tự cột trong sheet transactions
var TX_HEADERS = [
  'id', 'type', 'title', 'status', 'quantity', 'unitPrice',
  'total', 'note', 'imageUrl', 'createdAt', 'createdBy',
  'proofImage',   // ảnh xác nhận đã chuyển tiền (khi trạng thái = Đã chi)
  'rejectReason', // lý do từ chối chi tiền (khi trạng thái = Từ chối)
  'txDate',       // ngày thu/chi - do người tạo nhập
  'approver'      // người duyệt - username kế toán đã duyệt/từ chối
];
var USER_HEADERS = ['username', 'password', 'displayName', 'role'];

// ===================================================================
//  ROUTER
// ===================================================================
function doGet(e) {
  e = e || {};
  return handle(e, (e.parameter || {}));
}

function doPost(e) {
  e = e || {};
  var params = {};
  try {
    // Frontend gửi JSON dưới dạng text/plain để tránh CORS preflight
    if (e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    }
  } catch (err) {
    params = e.parameter || {};
  }
  return handle(e, params);
}

function handle(e, params) {
  var action = params.action || '';
  try {
    var data;
    switch (action) {
      case 'list':         data = apiList(params);        break;
      case 'dashboard':    data = apiDashboard(params);   break;
      case 'create':       data = apiCreate(params);      break;
      case 'updateStatus': data = apiUpdateStatus(params);break;
      case 'update':       data = apiUpdate(params);      break;
      case 'delete':       data = apiDelete(params);      break;
      case 'upload':       data = apiUpload(params);       break;
      case 'login':        data = apiLogin(params);       break;
      default: throw new Error('Action không hợp lệ: ' + action);
    }
    return json({ ok: true, data: data });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===================================================================
//  HELPERS
// ===================================================================
function ss() { return SpreadsheetApp.openById(SHEET_ID); }

function getSheet(name) {
  var sheet = ss().getSheetByName(name);
  if (!sheet) throw new Error('Không tìm thấy sheet: ' + name);
  return sheet;
}

/** Đảm bảo sheet transactions có đủ các cột trong TX_HEADERS (tự thêm nếu thiếu) */
function ensureTxHeaders() {
  var sheet = getSheet(SHEET_TX);
  var lastCol = sheet.getLastColumn();
  var headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var changed = false;
  TX_HEADERS.forEach(function (h) {
    if (headers.indexOf(h) === -1) { headers.push(h); changed = true; }
  });
  if (changed) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

/** Đọc toàn bộ sheet -> mảng object theo header dòng 1 */
function readAll(sheetName) {
  if (sheetName === SHEET_TX) ensureTxHeaders();
  var sheet = getSheet(sheetName);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var val = values[i][c];
      // Google Sheet hay tự ép chuỗi ngày thành Date -> chuẩn hóa lại về text
      if (val instanceof Date) val = fmtDate(val);
      obj[headers[c]] = val;
    }
    obj._row = i + 1; // số dòng thực tế trong sheet
    rows.push(obj);
  }
  return rows;
}

function genId() {
  return 'TX' + new Date().getTime();
}

function fmtDate(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function num(v) {
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ===================================================================
//  API: LIST TRANSACTIONS  (hỗ trợ search + lọc tháng + lọc trạng thái)
// ===================================================================
function apiList(p) {
  var rows = readAll(SHEET_TX);
  var search = (p.search || '').toString().toLowerCase().trim();
  var month  = (p.month  || '').toString().trim(); // 'yyyy-MM'
  var status = (p.status || '').toString().trim();
  var type   = (p.type   || '').toString().trim();

  var out = rows.filter(function (r) {
    if (status && r.status !== status) return false;
    if (type && r.type !== type) return false;
    if (month) {
      var d = String(r.createdAt || '');
      if (d.indexOf(month) !== 0) return false; // 'yyyy-MM' đầu chuỗi
    }
    if (search) {
      var hay = [r.id, r.title, r.note, r.createdBy].join(' ').toLowerCase();
      if (hay.indexOf(search) === -1) return false;
    }
    return true;
  });

  // mới nhất lên đầu
  out.sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return out;
}

// ===================================================================
//  API: DASHBOARD  (chỉ tính giao dịch Đã duyệt)
// ===================================================================
function apiDashboard(p) {
  var rows = readAll(SHEET_TX).filter(function (r) {
    return r.status === 'Đã chi';
  });

  var now = new Date();
  var curMonth = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM');

  var incomeMonth = 0, expenseMonth = 0;
  var byMonth = {}; // { 'yyyy-MM': {income, expense} }

  rows.forEach(function (r) {
    var m = String(r.createdAt || '').substring(0, 7); // yyyy-MM
    if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0 };
    var total = num(r.total);
    if (r.type === 'Income') {
      byMonth[m].income += total;
      if (m === curMonth) incomeMonth += total;
    } else if (r.type === 'Expense') {
      byMonth[m].expense += total;
      if (m === curMonth) expenseMonth += total;
    }
  });

  // 6 tháng gần nhất cho biểu đồ
  var labels = [], incomes = [], expenses = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var key = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM');
    labels.push(key);
    incomes.push(byMonth[key] ? byMonth[key].income : 0);
    expenses.push(byMonth[key] ? byMonth[key].expense : 0);
  }

  // 30 ngày gần nhất (theo txDate - ngày thu/chi thực tế, fallback createdAt)
  var byDay = {}; // { 'yyyy-MM-dd': {income, expense} }
  rows.forEach(function (r) {
    var ds = String(r.txDate || r.createdAt || '').substring(0, 10);
    if (!ds) return;
    if (!byDay[ds]) byDay[ds] = { income: 0, expense: 0 };
    var total = num(r.total);
    if (r.type === 'Income') byDay[ds].income += total;
    else if (r.type === 'Expense') byDay[ds].expense += total;
  });

  var dayLabels = [], dayIncomes = [], dayExpenses = [];
  for (var k = 29; k >= 0; k--) {
    var dd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - k);
    var key = Utilities.formatDate(dd, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    dayLabels.push(Utilities.formatDate(dd, Session.getScriptTimeZone(), 'dd/MM'));
    dayIncomes.push(byDay[key] ? byDay[key].income : 0);
    dayExpenses.push(byDay[key] ? byDay[key].expense : 0);
  }

  return {
    month: curMonth,
    totalIncome: incomeMonth,
    totalExpense: expenseMonth,
    profit: incomeMonth - expenseMonth,
    chart: { labels: labels, incomes: incomes, expenses: expenses },
    chartDaily: { labels: dayLabels, incomes: dayIncomes, expenses: dayExpenses }
  };
}

// ===================================================================
//  API: CREATE TRANSACTION
// ===================================================================
function apiCreate(p) {
  var actor = requireUser(p);          // phải là user hợp lệ trong sheet users
  var sheet = getSheet(SHEET_TX);
  var qty = num(p.quantity);
  var price = num(p.unitPrice);
  var total = qty * price;

  var row = {
    id: genId(),
    type: p.type === 'Expense' ? 'Expense' : 'Income',
    title: p.title || '',
    status: 'Chờ duyệt',           // mặc định luôn là Chờ duyệt
    quantity: qty,
    unitPrice: price,
    total: total,
    note: p.note || '',
    imageUrl: p.imageUrl || '',
    createdAt: fmtDate(new Date()),
    createdBy: actor.username,       // lấy từ user đã xác thực, không tin client
    proofImage: '',
    rejectReason: '',
    txDate: p.txDate || fmtDate(new Date()).substring(0, 10), // ngày thu/chi do người tạo nhập
    approver: ''
  };

  sheet.appendRow(TX_HEADERS.map(function (h) { return row[h]; }));
  return row;
}

// ===================================================================
//  API: UPDATE (sửa nội dung giao dịch)
// ===================================================================
function apiUpdate(p) {
  requireUser(p);                      // phải là user hợp lệ
  var rows = readAll(SHEET_TX);
  var target = findById(rows, p.id);
  var sheet = getSheet(SHEET_TX);

  var qty = num(p.quantity);
  var price = num(p.unitPrice);

  var updated = {
    id: target.id,
    type: p.type === 'Expense' ? 'Expense' : 'Income',
    title: p.title || '',
    status: p.status || target.status,
    quantity: qty,
    unitPrice: price,
    total: qty * price,
    note: p.note || '',
    imageUrl: p.imageUrl || target.imageUrl || '',
    createdAt: target.createdAt,        // giữ nguyên ngày tạo
    createdBy: target.createdBy,
    proofImage: target.proofImage || '',     // giữ nguyên chứng từ duyệt
    rejectReason: target.rejectReason || '',  // giữ nguyên lý do từ chối
    txDate: p.txDate || target.txDate || '',  // ngày thu/chi (cho sửa)
    approver: target.approver || ''           // giữ nguyên người duyệt
  };

  var values = TX_HEADERS.map(function (h) { return updated[h]; });
  sheet.getRange(target._row, 1, 1, TX_HEADERS.length).setValues([values]);
  return updated;
}

// ===================================================================
//  API: UPDATE STATUS  (Kế toán duyệt / từ chối)
// ===================================================================
function apiUpdateStatus(p) {
  var actor = requireUser(p, ['accountant']);  // chỉ Kế toán được duyệt / từ chối
  var allow = ['Chờ duyệt', 'Đã chi', 'Từ chối'];
  if (allow.indexOf(p.status) === -1) throw new Error('Trạng thái không hợp lệ');

  var rows = readAll(SHEET_TX);
  var target = findById(rows, p.id);
  var sheet = getSheet(SHEET_TX);
  var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  function setCol(name, val) {
    var i = headerRow.indexOf(name);
    if (i >= 0) sheet.getRange(target._row, i + 1).setValue(val);
  }

  setCol('status', p.status);
  // Đã chi -> bắt buộc có ảnh chuyển tiền; Từ chối -> bắt buộc có lý do
  if (p.status === 'Đã chi') {
    if (!p.proofImage) throw new Error('Thiếu ảnh xác nhận đã chuyển tiền');
    setCol('proofImage', p.proofImage);
  }
  if (p.status === 'Từ chối') {
    if (!p.reason) throw new Error('Thiếu lý do từ chối');
    setCol('rejectReason', p.reason);
  }
  // ghi nhận người duyệt khi Kế toán xử lý (Đã chi / Từ chối)
  if (p.status === 'Đã chi' || p.status === 'Từ chối') {
    setCol('approver', actor.username);
  }

  return { id: p.id, status: p.status, approver: actor.username, proofImage: p.proofImage || '', reason: p.reason || '' };
}

// ===================================================================
//  API: DELETE
// ===================================================================
function apiDelete(p) {
  requireUser(p);                      // phải là user hợp lệ
  var rows = readAll(SHEET_TX);
  var target = findById(rows, p.id);
  getSheet(SHEET_TX).deleteRow(target._row);
  return { id: p.id, deleted: true };
}

function findById(rows, id) {
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) return rows[i];
  }
  throw new Error('Không tìm thấy giao dịch id=' + id);
}

// ===================================================================
//  API: UPLOAD IMAGE -> Google Drive -> trả link
//  Nhận: { fileName, mimeType, base64 }
// ===================================================================
function apiUpload(p) {
  if (!p.base64) throw new Error('Thiếu dữ liệu ảnh');
  var folder = getOrCreateFolder(DRIVE_FOLDER_NAME);

  var bytes = Utilities.base64Decode(p.base64);
  var blob = Utilities.newBlob(bytes, p.mimeType || 'image/jpeg', p.fileName || 'receipt.jpg');
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var id = file.getId();
  return {
    fileId: id,
    // link xem trực tiếp dùng cho thẻ <img>
    url: 'https://drive.google.com/uc?export=view&id=' + id,
    viewUrl: 'https://drive.google.com/file/d/' + id + '/view'
  };
}

function getOrCreateFolder(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

// ===================================================================
//  API: LOGIN (đơn giản – kiểm tra username/password trong sheet users)
// ===================================================================
function apiLogin(p) {
  var u = findUser(p.username, p.password);
  if (!u) throw new Error('Sai tài khoản hoặc mật khẩu');
  return { username: u.username, displayName: u.displayName, role: u.role };
}

// ===================================================================
//  PHÂN QUYỀN - tất cả dựa trên dữ liệu sheet "users"
// ===================================================================

/** Tìm user khớp username + password (dùng cho login) */
function findUser(username, password) {
  var users = readAll(SHEET_USER);
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].username) === String(username) &&
        String(users[i].password) === String(password)) {
      return users[i];
    }
  }
  return null;
}

/** Tìm user theo username (dùng để xác thực actor mỗi request ghi) */
function getUserByName(username) {
  if (!username) return null;
  var users = readAll(SHEET_USER);
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].username) === String(username)) return users[i];
  }
  return null;
}

/**
 * Bắt buộc người gọi (p.actor) phải là user hợp lệ trong sheet users.
 * Nếu truyền 'roles' thì role của user phải nằm trong danh sách đó.
 * Trả về object user (đã lấy role thật từ sheet).
 */
function requireUser(p, roles) {
  var u = getUserByName(p.actor);
  if (!u) throw new Error('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
  if (roles && roles.indexOf(String(u.role)) === -1) {
    throw new Error('Tài khoản "' + u.username + '" (' + u.role + ') không có quyền thực hiện thao tác này.');
  }
  return u;
}

// ===================================================================
//  SETUP: chạy 1 lần để tạo cấu trúc + dữ liệu mẫu
// ===================================================================
// AN TOÀN: chạy lại bao nhiêu lần cũng được, KHÔNG xóa dữ liệu thật.
// - Tạo sheet nếu chưa có
// - Ghi header nếu sheet trống; tự thêm cột mới còn thiếu (giữ nguyên data)
// - Chỉ nạp dữ liệu mẫu khi sheet CHƯA có giao dịch nào (lần đầu)
function setup() {
  var book = ss();

  // ----- sheet transactions -----
  var tx = book.getSheetByName(SHEET_TX) || book.insertSheet(SHEET_TX);
  if (tx.getLastRow() === 0) {
    tx.getRange(1, 1, 1, TX_HEADERS.length).setValues([TX_HEADERS]).setFontWeight('bold');
    tx.setFrozenRows(1);
  }
  ensureTxHeaders(); // thêm cột mới (proofImage, rejectReason...) mà KHÔNG đụng dữ liệu

  // chỉ nạp dữ liệu mẫu khi chưa có dòng giao dịch nào
  if (tx.getLastRow() < 2) {
    var today = fmtDate(new Date()).substring(0, 10);
    var sample = [
      ['TX1001', 'Income',  'Bán váy hoa',       'Đã chi',    3, 350000, 1050000, 'Khách lẻ',        '', fmtDate(new Date()), 'staff', '', '', today, 'ketoan'],
      ['TX1002', 'Expense', 'Nhập lô áo thun',   'Đã chi',    20, 80000, 1600000, 'Nhà cung cấp A',  '', fmtDate(new Date()), 'staff', '', '', today, 'ketoan'],
      ['TX1003', 'Income',  'Bán combo set',     'Chờ duyệt', 2, 500000, 1000000, 'Đơn online',      '', fmtDate(new Date()), 'staff', '', '', today, '']
    ];
    tx.getRange(2, 1, sample.length, TX_HEADERS.length).setValues(sample);
  }

  // ----- sheet users -----
  var us = book.getSheetByName(SHEET_USER) || book.insertSheet(SHEET_USER);
  if (us.getLastRow() === 0) {
    us.getRange(1, 1, 1, USER_HEADERS.length).setValues([USER_HEADERS]).setFontWeight('bold');
    us.setFrozenRows(1);
  }
  if (us.getLastRow() < 2) {
    var users = [
      ['staff', '123', 'Nhân viên bán hàng', 'staff'],
      ['ketoan', '123', 'Kế toán 3PM',        'accountant']
    ];
    us.getRange(2, 1, users.length, USER_HEADERS.length).setValues(users);
  }

  // tạo folder Drive sẵn
  getOrCreateFolder(DRIVE_FOLDER_NAME);

  Logger.log('Setup xong (giữ nguyên dữ liệu hiện có)!');
}
