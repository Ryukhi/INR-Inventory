// ============================================================================
// INR Inventory Management System — Standalone Frontend Application (app.js)
// Decoupled Client for GitHub Pages + Google Apps Script REST API
// ============================================================================

window.__INR_MAIN_PARSED = true;

    // ===== BACKEND API CONFIGURATION =====
    // Replace with your deployed Google Apps Script Web App URL (/exec)
    const API_URL = 'https://script.google.com/macros/s/AKfycby4WK84FCoGDUYFtQVIPE_EA538YteuhEX2qqMT2Gv2QtJEeuro2fvYutXDFnVjLpYS/exec';
    const API_TIMEOUT_MS = 30000;

    function sanitizeApiUrl(rawUrl) {
      if (!rawUrl) return '';
      let clean = String(rawUrl).trim();
      // Auto-correct /dev test URLs to /exec production Web App URL
      if (clean.endsWith('/dev')) {
        console.warn('API_URL ends with /dev (dev mode requires Google login). Auto-switching to /exec for production Web App access.');
        clean = clean.slice(0, -4) + '/exec';
      }
      return clean;
    }

    function getConfiguredApiUrl() {
      try {
        const customUrl = localStorage.getItem('inr_api_url');
        if (customUrl && customUrl.trim()) return sanitizeApiUrl(customUrl);
      } catch (e) {}
      return sanitizeApiUrl(API_URL);
    }

    function isApiConfigured() {
      const url = getConfiguredApiUrl();
      return Boolean(url && url !== 'YOUR_APPS_SCRIPT_DEPLOYMENT_URL' && /^https?:\/\//i.test(url));
    }

    function setApiUrl(newUrl) {
      if (!newUrl) {
        localStorage.removeItem('inr_api_url');
        console.log('Reset API_URL to default:', API_URL);
      } else {
        const cleaned = sanitizeApiUrl(newUrl);
        localStorage.setItem('inr_api_url', cleaned);
        console.log('Saved custom API_URL:', cleaned);
      }
      location.reload();
    }
    window.setApiUrl = setApiUrl;

    async function callApi(action, payload = {}) {
      const url = getConfiguredApiUrl();
      if (!url || url === 'YOUR_APPS_SCRIPT_DEPLOYMENT_URL') {
        throw new Error('Backend API_URL is not configured in app.js.');
      }
      if (!url.endsWith('/exec')) {
        console.warn('API_URL does not end with /exec. Google Apps Script Web Apps require /exec for external access:', url);
      }

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), API_TIMEOUT_MS)
        : null;

      try {
        const response = await fetch(url, {
          method: 'POST',
          mode: 'cors',
          headers: {
            // Strictly use text/plain;charset=utf-8 to prevent browser CORS preflight (OPTIONS) blocking on Apps Script redirects
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify({ action, payload }),
          redirect: 'follow',
          signal: controller ? controller.signal : undefined
        });

        if (!response.ok) {
          throw new Error('HTTP Error ' + response.status + ': ' + response.statusText);
        }

        const text = await response.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch (parseErr) {
          throw new Error('Invalid JSON response from server (ensure Web App access is set to "Anyone").');
        }

        if (!json || json.success === false) {
          throw new Error((json && (json.error || json.message)) || 'API request failed.');
        }

        // Normalize response so both res.data.* and top-level res.* fields are accessible
        if (json.data && typeof json.data === 'object' && !Array.isArray(json.data)) {
          return Object.assign({}, json.data, json);
        }
        return json;
      } catch (err) {
        if (err && err.name === 'AbortError') {
          throw new Error('Request timed out after ' + (API_TIMEOUT_MS / 1000) + 's.');
        }
        if (err && String(err.message || '').includes('Failed to fetch')) {
          console.error(
            'Failed to fetch Google Apps Script API.\n' +
            'Troubleshooting Checklist:\n' +
            '1. In Google Apps Script -> Deploy -> Manage deployments -> Edit:\n' +
            '   - Ensure "Execute as" is "Me"\n' +
            '   - Ensure "Who has access" is "Anyone" (NOT "Only myself" or "Anyone with a Google account")\n' +
            '   - Create a "New version" if Code.gs was edited.\n' +
            '2. Ensure the URL ends with /exec (not /dev).\n' +
            '3. Check browser DevTools Network tab: if redirected to accounts.google.com, access is not set to Anyone.'
          );
        }
        throw err;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    // Client API convenience wrappers for dry-run checks and procedure lookups
    function fetchRecentProcedures() {
      return callApi('getRecentProcedures', {});
    }
    function fetchProcedureDetails(transactionId) {
      return callApi('getProcedureDetails', { transactionId });
    }
    function checkStockMovementApi(payload) {
      return callApi('checkStockMovement', payload);
    }
    function submitStockMovementApi(payload) {
      return callApi('submitStockMovement', payload);
    }
    function checkAdjustmentApi(payload) {
      return callApi('checkAdjustment', payload);
    }
    function submitAdjustmentApi(payload) {
      return callApi('submitAdjustment', payload);
    }

    // ===== STATE MANAGEMENT =====
    const state = {
      currentLang: (function() {
        try { return localStorage.getItem('inr_app_lang') || 'en'; } catch(e) { return 'en'; }
      })(),
      currentTab: 'dashboard',
      inventory: [],
      transactions: [],
      settings: { diseases: [], procedures: [], shifts: [], categories: [], departments: [], users: [] },
      exchangeQuotas: [],
      consignments: [],
      loans: [],
      assets: [],
      assetSubTab: 'active',
      activeAssetDetailId: null,
      pendingAssetPhoto: null,
      pendingDamagePhoto: null,
      exchangeSubTab: 'quota',
      cart: [],
      adjBatch: [], // Array of { itemId, loc, count, diff }
      stockLines: [{ itemId: '', qty: 1, loc: 'Main', notes: '' }],
      stockType: 'Stock In',
      invSort: { key: 'category', dir: 'asc' },
      settingsSection: 'groups',
      editingSettingIdx: -1,
      settingsDirty: { diseases: false, procedures: false, shifts: false, categories: false, departments: false, users: false },
      statSubTab: 'device',
      procEditId: null,
      procEditDevices: [],
      announcements: [],
      groups: [],
      hoReconcileDraft: {},
      // Module 8: Procurement state
      procurementSubTab: 'ebidding',
      procurementFy: '',
      ebiddings: [],
      contracts: [],
      contractPOs: [],
      specificPurchases: [],
      receivings: [],
      companyList: [],
      fiscalYearList: [],
      expandedContracts: {},
      receivingAllocations: []
    };

    // ===== BILINGUAL TRANSLATION DICTIONARY (TH / EN) =====
    const i18n = {
      en: {
        // 1. Navigation Tabs (Sidebar)
        nav_dashboard: 'Dashboard',
        nav_inventory: 'Inventory',
        nav_procedure: 'Procedure Use',
        nav_exchange: 'Exchange and Consignment',
        nav_transfer: 'Transfer',
        nav_loan: 'Transfer',
        nav_procurement: 'Procurement',
        nav_transactions: 'Transactions',
        nav_statistics: 'Statistics',
        nav_assets: 'Assets',
        nav_settings: 'Settings',
        proc_sub_ebidding: 'E-Bidding',
        proc_sub_contracts: 'Contracts',
        proc_sub_po: 'Contract POs',
        proc_sub_sp: 'Specific Purchase',
        proc_sub_receiving: 'Receiving',
        proc_fy_label: 'Fiscal Year (BE):',
        proc_add_ebidding: 'Add E-Bidding Plan',
        proc_add_contract: 'Create Contract',
        proc_add_po: 'Create Contract PO (Lot)',
        proc_add_sp: 'Add Specific Purchase',
        proc_add_receiving: 'Record Goods Receiving',

        // 2. Action Buttons
        btn_add_device: 'Add Device',
        btn_stock_in_out: 'Stock In / Out',
        btn_adjustment: 'Adjustment',
        btn_ho_reconcile: 'กระทบยอด HO',
        btn_export_csv: 'Export CSV',
        btn_export_pdf: 'Export PDF',
        btn_print: 'Print',
        btn_save: 'Save / Submit',
        btn_cancel: 'Cancel / Close',
        btn_edit: 'Edit',
        btn_delete: 'Delete',
        btn_search: 'Search',
        btn_default: 'Default',
        btn_filter: 'Filter',
        btn_more_actions: 'More Actions ▾',

        // 3. Stock & Locations
        stock_main: 'Main Stock',
        stock_retail: 'Retail Stock',
        stock_buffer: 'Buffer Stock',
        stock_total: 'Total Stock',
        stock_on_hand: 'Remain',
        stock_qty: 'Quantity',
        stock_out_of_stock: 'Out of Stock',
        stock_low_alert: 'Low Stock Alert',

        // 4. Procedure Use & Patient Details
        lbl_hn: 'Patient HN',
        lbl_disease: 'Disease',
        lbl_procedure: 'Procedure',
        lbl_shift: 'Shift',
        lbl_tech: 'Technologist',
        lbl_complication: 'Complication',
        lbl_contrast: 'Contrast Media',
        lbl_selected_devices: 'Selected Devices',
        proc_case_history: 'Procedure Case History ▾',

        // 5. Exchange & Consignment
        ex_sub_quotas: 'Substitution Quotas',
        ex_physical_item: 'Physical Item',
        ex_substituted_item: 'Substituted Item',
        ex_used_total: 'Current Used / Total Quota',
        ex_vendor: 'Vendor / Company',
        ex_awaiting_return: 'Awaiting Return',
        ex_mark_returned: 'Mark as Returned',

        // 6. Loan & Transfer
        tr_borrowed: 'Borrowing list',
        tr_lent: 'Lending list',
        tr_internal: 'Internal Departments',
        tr_external: 'External Departments',
        tr_doc_no: 'Transfer No.',
        tr_pending: 'Pending / Overdue',
        tr_partial: 'Partial Returned',
        tr_fully: 'Fully Returned',

        // 7. Assets Management
        ast_code: 'Asset Code',
        ast_sn: 'Serial Number (S/N)',
        ast_name: 'Asset Name',
        ast_medical_device: 'Medical Device',
        ast_active: 'Active',
        ast_repair: 'Under Repair',
        ast_damaged: 'Damaged / Condemn',
        ast_pm: 'Preventive Maintenance (PM)',
        ast_cal: 'Calibration',
        ast_radiation: 'Radiation Survey',
        ast_qr_scan: 'Scan QR Code',

        // General Table Headers & Filters
        tbl_date: 'Date / Time',
        tbl_type: 'Transaction Type',
        tbl_details: 'Case Details',
        tbl_device: 'Device Name',
        tbl_action: 'Action',
        tbl_status: 'Status',
        inv_all_cats: 'All Categories',
        inv_all_status: 'All Status',
        ann_board_title: 'Announcement',
        ann_btn_add: 'New Announcement'
      },
      th: {
        // 1. Navigation Tabs (Sidebar)
        nav_dashboard: 'หน้าแรก',
        nav_inventory: 'คลังเวชภัณฑ์',
        nav_procedure: 'บันทึกการใช้ของ',
        nav_exchange: 'การแลกและฝากของ',
        nav_transfer: 'การโอนย้าย',
        nav_loan: 'การโอนย้าย',
        nav_procurement: 'การจัดซื้อและตรวจรับ',
        nav_transactions: 'ประวัติรายการ',
        nav_statistics: 'สถิติ',
        nav_assets: 'ครุภัณฑ์',
        nav_settings: 'ตั้งค่า',
        proc_sub_ebidding: 'แผน E-Bidding',
        proc_sub_contracts: 'สัญญาจะซื้อจะขาย',
        proc_sub_po: 'ใบสั่งซื้อตามสัญญา (PO)',
        proc_sub_sp: 'จัดซื้อวิธีเฉพาะเจาะจง',
        proc_sub_receiving: 'การตรวจรับพัสดุ',
        proc_fy_label: 'ปีงบประมาณ (พ.ศ.):',
        proc_add_ebidding: 'เพิ่มแผน E-Bidding',
        proc_add_contract: 'สร้างสัญญาจะซื้อจะขาย',
        proc_add_po: 'ออกใบสั่งซื้อตามสัญญา (PO)',
        proc_add_sp: 'เพิ่มรายการจัดซื้อเฉพาะเจาะจง',
        proc_add_receiving: 'บันทึกการตรวจรับพัสดุ',

        // 2. Action Buttons
        btn_add_device: 'เพิ่มรายการ',
        btn_stock_in_out: 'นำเข้า / จ่ายออก',
        btn_adjustment: 'กระทบยอด',
        btn_ho_reconcile: 'กระทบยอด HO',
        btn_export_csv: 'Export CSV',
        btn_export_pdf: 'Export PDF',
        btn_print: 'พิมพ์',
        btn_save: 'บันทึกรายการ',
        btn_cancel: 'ยกเลิก / ปิด',
        btn_edit: 'แก้ไข',
        btn_delete: 'ลบ',
        btn_search: 'ค้นหา',
        btn_default: 'ค่าเริ่มต้น',
        btn_filter: 'กรอง',
        btn_more_actions: 'เพิ่มเติม',

        // 3. Stock & Locations
        stock_main: 'คลัง INR',
        stock_retail: 'คลังปลีก',
        stock_buffer: 'คลังสำรอง',
        stock_total: 'รวม',
        stock_on_hand: 'ยอดคงเหลือ',
        stock_qty: 'จำนวน',
        stock_out_of_stock: 'ของหมด',
        stock_low_alert: 'ของใกล้หมด',

        // 4. Procedure Use & Patient Details
        lbl_hn: 'HN ผู้ป่วย',
        lbl_disease: 'การวินิจฉัย',
        lbl_procedure: 'หัตถการ',
        lbl_shift: 'เวร',
        lbl_tech: 'นักรังสีการแพทย์',
        lbl_complication: 'ภาวะแทรกซ้อน',
        lbl_contrast: 'สารทึบรังสี',
        lbl_selected_devices: 'รายการอุปกรณ์ที่ใช้',
        proc_case_history: 'ประวัติเคสหัตถการ ▾',

        // 5. Exchange & Consignment
        ex_sub_quotas: 'รายการตัดของทดแทน',
        ex_physical_item: 'รายการที่ใช้จริง',
        ex_substituted_item: 'รายการตัดทดแทน',
        ex_used_total: 'ใช้แล้ว / เหลือทั้งหมด',
        ex_vendor: 'บริษัท / ตัวแทน',
        ex_awaiting_return: 'รอส่งคืน',
        ex_mark_returned: 'ส่งคืนแล้ว',

        // 6. Loan & Transfer
        tr_borrowed: 'รายการขอยืม',
        tr_lent: 'รายการให้ยืม',
        tr_internal: 'หน่วยงานภายใน',
        tr_external: 'หน่วยงานภายนอก',
        tr_doc_no: 'เลขที่ใบโอน',
        tr_pending: 'ค้างส่ง / เกินกำหนด',
        tr_partial: 'คืนแล้วบางส่วน',
        tr_fully: 'คืนครบแล้ว',

        // 7. Assets Management
        ast_code: 'รหัสครุภัณฑ์',
        ast_sn: 'หมายเลขเครื่อง (S/N)',
        ast_name: 'ชื่อครุภัณฑ์',
        ast_medical_device: 'เครื่องมือแพทย์',
        ast_active: 'ใช้งานปกติ',
        ast_repair: 'ส่งซ่อม',
        ast_damaged: 'แทงชำรุด / รอจำหน่าย',
        ast_pm: 'ตรวจบำรุงรักษาเชิงป้องกัน (PM)',
        ast_cal: 'สอบเทียบเครื่อง',
        ast_radiation: 'ตรวจวัดรังสี',
        ast_qr_scan: 'สแกนคิวอาร์โค้ด',

        // General Table Headers & Filters
        tbl_date: 'วัน/เวลา',
        tbl_type: 'ประเภทรายการ',
        tbl_details: 'รายละเอียดเคส',
        tbl_device: 'ชื่ออุปกรณ์',
        tbl_action: 'การกระทำ',
        tbl_status: 'สถานะ',
        inv_all_cats: 'ทุกหมวดหมู่',
        inv_all_status: 'ทุกสถานะ',
        ann_board_title: 'ประกาศ',
        ann_btn_add: 'เพิ่มประกาศ'
      }
    };

    function t(key, defaultEn) {
      const lang = state.currentLang || 'en';
      if (i18n[lang] && i18n[lang][key] !== undefined && i18n[lang][key] !== '') {
        return i18n[lang][key];
      }
      if (i18n['en'] && i18n['en'][key] !== undefined && i18n['en'][key] !== '') {
        return i18n['en'][key];
      }
      return defaultEn !== undefined ? defaultEn : (key || '');
    }

    function setLanguage(lang) {
      if (lang !== 'th' && lang !== 'en') lang = 'en';
      state.currentLang = lang;
      try {
        localStorage.setItem('inr_app_lang', lang);
        document.documentElement.lang = lang;
      } catch (e) {}
      updateLangSwitcherUI();
      applyI18nToDom();
      initTabs();
      renderCurrentTab();
    }

    function toggleLanguage() {
      setLanguage(state.currentLang === 'th' ? 'en' : 'th');
    }

    function updateLangSwitcherUI() {
      const btnTh = document.getElementById('btn-lang-th');
      const btnEn = document.getElementById('btn-lang-en');
      if (btnTh && btnEn) {
        btnTh.classList.toggle('active', state.currentLang === 'th');
        btnEn.classList.toggle('active', state.currentLang === 'en');
      }
    }

    function applyI18nToDom() {
      tabs.forEach(tab => {
        const titleEl = document.getElementById('tab-title-' + tab.id);
        if (titleEl) {
          titleEl.innerText = getTabLabel(tab);
        }
      });
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translated = t(key, '');
        if (!translated) return;
        const target = el.querySelector('[data-i18n-text]') || (el.querySelector('svg') ? el.querySelector('span:not(.badge):not(.status-dot):not(.sync-dot)') : null);
        if (target) {
          target.innerText = translated;
        } else if (!el.querySelector('svg')) {
          el.innerText = translated;
        } else {
          for (let node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim().length > 0) {
              node.nodeValue = ' ' + translated;
              break;
            }
          }
        }
      });
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const translated = t(key);
        if (translated) el.placeholder = translated;
      });
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const translated = t(key);
        if (translated) el.title = translated;
      });
    }

    function initLanguage() {
      let saved = 'en';
      try {
        saved = localStorage.getItem('inr_app_lang') || 'en';
      } catch (e) {}
      state.currentLang = (saved === 'th') ? 'th' : 'en';
      try { document.documentElement.lang = state.currentLang; } catch (e) {}
      updateLangSwitcherUI();
      applyI18nToDom();
    }

    // Solid-color monochrome SVG icons (fill="currentColor")
    const ICONS = {
      dashboard: '<svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M3 4a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm8 0a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V4zm0 7a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1v-5zm-8 2a1 1 0 011-1h5a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3z"/></svg>',
      inventory: '<svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2L3 5.5v9L10 18l7-3.5v-9L10 2zm0 2.24L14.52 6.5 10 8.76 5.48 6.5 10 4.24zM4.5 7.79l4.75 2.38v5.59L4.5 13.38V7.79zm11 5.59l-4.75 2.38v-5.59l4.75-2.38v5.59z"/></svg>',
      procedure: '<svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-3 3a1 1 0 012 0v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1H8a1 1 0 110-2h1v-1z" clip-rule="evenodd"/></svg>',
      exchange: '<svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z"/></svg>',
      loan: '<svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z"/></svg>',
      procurement: '<svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/></svg>',
      transactions: '<svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/></svg>',
      statistic: '<svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>',
      assets: '<svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clip-rule="evenodd"/></svg>',
      settings: '<svg class="nav-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>',
      edit: '<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>',
      trash: '<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>',
      up: '<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>',
      down: '<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>',
      plus: '<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd"/></svg>',
      minus: '<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/></svg>',
      refresh: '<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.047a1 1 0 011.885-.666A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.608-1.286z" clip-rule="evenodd"/></svg>',
      check: '<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>',
      print: '<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 1h6v2H7V5zm8 6a1 1 0 11-2 0 1 1 0 012 0zM7 13h6v3H7v-3z" clip-rule="evenodd"/></svg>',
      export: '<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>',
      eye: '<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>',
      list: '<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/></svg>'
    };

    function debounce(fn, delay) {
      let timer = null;
      return function(...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
      };
    }

    const tabs = [
      { id: 'dashboard',    labelKey: 'nav_dashboard',    label: 'Dashboard',                icon: ICONS.dashboard },
      { id: 'inventory',    labelKey: 'nav_inventory',    label: 'Inventory',                icon: ICONS.inventory },
      { id: 'procedure',    labelKey: 'nav_procedure',    label: 'Procedure Use',            icon: ICONS.procedure },
      { id: 'exchange',     labelKey: 'nav_exchange',     label: 'Exchange and Consignment', icon: ICONS.exchange },
      { id: 'loan',         labelKey: 'nav_transfer',     label: 'Transfer',                 icon: ICONS.loan },
      { id: 'procurement',  labelKey: 'nav_procurement',  label: 'Procurement',              icon: ICONS.procurement },
      { id: 'transactions', labelKey: 'nav_transactions', label: 'Transactions',             icon: ICONS.transactions },
      { id: 'statistic',    labelKey: 'nav_statistics',   label: 'Statistics',               icon: ICONS.statistic },
      { id: 'assets',       labelKey: 'nav_assets',       label: 'Assets',                   icon: ICONS.assets },
      { id: 'settings',     labelKey: 'nav_settings',     label: 'Settings',                 icon: ICONS.settings }
    ];

    function getTabLabel(tab) {
      if (!tab) return '';
      return tab.labelKey ? t(tab.labelKey, tab.label) : (tab.label || '');
    }

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const currentYear = new Date().getFullYear();

    // ===== UI ELEMENTS =====
    const appLoading = document.getElementById('app-loading');
    const appContent = document.getElementById('app-content');
    const toast = document.getElementById('app-toast');

    // ===== HELPER FUNCTIONS =====
    function closeAllActionDropdowns() {
      document.querySelectorAll('.action-dropdown.open').forEach(el => el.classList.remove('open'));
    }

    function toggleActionDropdown(btn, event) {
      if (event) event.stopPropagation();
      const wrap = btn ? btn.closest('.action-dropdown') : null;
      if (!wrap) return;
      const wasOpen = wrap.classList.contains('open');
      closeAllActionDropdowns();
      if (!wasOpen) wrap.classList.add('open');
    }

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.action-dropdown')) {
        closeAllActionDropdowns();
      }
    });

    function showToast(msg) {
      toast.innerText = msg;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 3500);
    }

    function getToday() {
      return new Date().toISOString().split('T')[0];
    }

    function formatDate(dateStr) {
      if (!dateStr) return '';
      try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB');
      } catch (e) {
        return dateStr;
      }
    }

    function formatDateDDMMYYYY(dateStr) {
      if (!dateStr) return '-';
      const s = String(dateStr).trim();
      if (!s || s === '-') return '-';
      const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) {
        return `${String(m[3]).padStart(2, '0')}/${String(m[2]).padStart(2, '0')}/${m[1]}`;
      }
      const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m2) {
        return `${String(m2[1]).padStart(2, '0')}/${String(m2[2]).padStart(2, '0')}/${m2[3]}`;
      }
      try {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
          return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        }
      } catch (e) {}
      return s;
    }

    function getDeviceName(itemId) {
      const item = (state.inventory || []).find(i => String(i.itemId) === String(itemId));
      if (item) return item.deviceName;
      const grp = (state.groups || []).find(g => String(g.groupId) === String(itemId));
      if (grp) return grp.groupName;
      return itemId;
    }

    function getDeviceCategory(itemId) {
      const item = (state.inventory || []).find(i => String(i.itemId) === String(itemId));
      if (item) return item.category;
      const grp = (state.groups || []).find(g => String(g.groupId) === String(itemId));
      return grp ? (grp.category || '') : '';
    }

    function populateUserNicknameSelect(selectId, preserveValue) {
      const sel = document.getElementById(selectId);
      if (!sel) return;
      const cur = preserveValue !== undefined ? preserveValue : sel.value;
      const users = (typeof getUsersList === 'function') ? getUsersList() : ((state.settings && state.settings.users) || []);
      sel.innerHTML = `<option value="">-- Select User (Nickname) --</option>` +
        users.map(u => {
          const nick = String((u && (u.nickname || u.name)) || u || '').trim();
          if (!nick) return '';
          return `<option value="${escapeHtml(nick)}" ${nick === cur ? 'selected' : ''}>${escapeHtml(nick)}</option>`;
        }).filter(Boolean).join('');
    }

    function generateClientItemId(category) {
      const prefixMap = {
        'Sheath'         : 'SH',
        'Guidewire'      : 'GW',
        'Catheter'       : 'CATH',
        'Stent'          : 'STENT',
        'Coil'           : 'COIL',
        'Microcatheter'  : 'MICRO',
        'Balloon'        : 'BALL',
        'Accessory'      : 'ACC',
        'Contrast Media' : 'CM'
      };
      const prefix = prefixMap[category] || 'OTH';
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      const stamp = String(d.getFullYear()).slice(-2) +
        pad(d.getMonth() + 1) +
        pad(d.getDate()) +
        pad(d.getHours()) +
        pad(d.getMinutes()) +
        pad(d.getSeconds());
      return prefix + '-' + stamp;
    }

    function getTransactableInventory() {
      return state.inventory || [];
    }

    function recalculateInventoryHierarchy() {
      if (!Array.isArray(state.inventory)) state.inventory = [];
      if (!Array.isArray(state.groups)) state.groups = [];

      // Filter out any legacy virtual parent rows if present in local cache
      state.inventory = state.inventory.filter(i => !i.isParent);

      const groupById = {};
      const groupByHoId = {};
      state.groups.forEach(g => {
        if (!g || !g.groupId) return;
        const gid = String(g.groupId).trim();
        g.groupId = gid;
        g.groupName = String(g.groupName || gid).trim();
        g.hoItemId = String(g.hoItemId || '').trim();
        g.buyPrice = Number(g.buyPrice) || 0;
        g.sellPrice = Number(g.sellPrice) || 0;
        g.hoStock = Number(g.hoStock) || 0;
        g.hoLastChecked = g.hoLastChecked || '';
        g.mainStock = 0;
        g.retailStock = 0;
        g.bufferStock = 0;
        g.totalStock = 0;
        g.safetyStock = 0;
        g.orderEstimate = 0;
        g.category = '';
        g.company = '';
        groupById[gid] = g;
        if (g.hoItemId && !groupByHoId[g.hoItemId]) {
          groupByHoId[g.hoItemId] = g;
        }
      });

      // Rule 2.2: Auto-group ungrouped items (not manually removed) sharing the same non-empty HO Item ID
      const ungroupedByHo = {};
      state.inventory.forEach(item => {
        const rawGid = String(item.groupId || '').trim();
        if (rawGid.toUpperCase() === 'UNGROUPED') {
          item.groupId = '';
          item.ungroupedManual = true;
          return;
        }
        if (item.ungroupedManual) {
          item.groupId = '';
          return;
        }
        if (rawGid && groupById[rawGid]) {
          item.groupId = rawGid;
          return;
        }
        item.groupId = '';
        const hoId = String(item.hoItemId || '').trim();
        if (!hoId) return;
        if (!ungroupedByHo[hoId]) ungroupedByHo[hoId] = [];
        ungroupedByHo[hoId].push(item);
      });

      Object.keys(ungroupedByHo).forEach(hoId => {
        const list = ungroupedByHo[hoId];
        let targetGrp = groupByHoId[hoId] || null;
        if (!targetGrp && list.length >= 2) {
          const first = list[0];
          const newGid = 'GRP-' + Date.now() + '-' + Math.floor(Math.random() * 90 + 10);
          let maxHo = 0;
          list.forEach(it => {
            const h = Number(it.ownHoStock !== undefined ? it.ownHoStock : it.hoStock) || 0;
            if (h > maxHo) maxHo = h;
          });
          targetGrp = {
            groupId: newGid,
            groupName: first.deviceName || hoId,
            hoItemId: hoId,
            buyPrice: Number(first.buyPrice) || 0,
            sellPrice: Number(first.sellPrice) || 0,
            hoStock: maxHo,
            hoLastChecked: first.hoLastChecked || '',
            mainStock: 0,
            retailStock: 0,
            bufferStock: 0,
            totalStock: 0,
            safetyStock: 0,
            orderEstimate: 0,
            category: first.category || '',
            company: first.company || ''
          };
          state.groups.push(targetGrp);
          groupById[newGid] = targetGrp;
          groupByHoId[hoId] = targetGrp;
        }
        if (targetGrp) {
          list.forEach(it => {
            it.groupId = targetGrp.groupId;
          });
        }
      });

      // Rule 2.3: Compute Sub-Item and Standalone Item metrics, and accumulate Group totals
      state.inventory.forEach(item => {
        item.isFreeItem = Boolean(item.isFreeItem);
        const grp = (item.groupId && groupById[item.groupId]) ? groupById[item.groupId] : null;
        if (!grp) item.groupId = '';

        const m = Number(item.mainStock) || 0;
        const r = Number(item.retailStock) || 0;
        const b = Number(item.bufferStock) || 0;
        const tot = m + r;
        const safety = Number(item.safetyStock) || 0;
        const orderEst = Number(item.orderEstimate) || 0;

        item.mainStock = m;
        item.retailStock = r;
        item.bufferStock = b;
        item.totalStock = tot;
        item.safetyStock = safety;
        item.orderEstimate = orderEst;
        item.buyPoint = safety * 2;
        item.stockMonth = safety > 0 ? Number((tot / safety).toFixed(2)) : 0;
        item.exceedPercent = orderEst > 0 ? Math.round(((tot - orderEst) / orderEst) * 100) : 0;

        if (grp) {
          item.buyPrice = grp.buyPrice;
          item.sellPrice = grp.sellPrice;
          item.hoStock = 0;
          item.stockDiff = null; // Blank / "-" on Sub-Item Row
          grp.mainStock += m;
          grp.retailStock += r;
          grp.bufferStock += b;
          grp.totalStock += tot;
          grp.safetyStock += safety;
          grp.orderEstimate += orderEst;
          if (!grp.category && item.category) grp.category = item.category;
          if (!grp.company && item.company) grp.company = item.company;
        } else {
          if (item.isFreeItem) {
            item.buyPrice = 0;
            item.hoStock = 0;
            item.stockDiff = 0;
          } else {
            const ownHo = Number(item.ownHoStock !== undefined ? item.ownHoStock : item.hoStock) || 0;
            item.ownHoStock = ownHo;
            item.hoStock = ownHo;
            item.stockDiff = tot - ownHo;
          }
        }
      });

      // Finalize Group Summary Row metrics (Section 2.3)
      state.groups.forEach(g => {
        g.totalStock = g.mainStock + g.retailStock;
        g.stockDiff = g.totalStock - g.hoStock;
        g.buyPoint = g.safetyStock * 2;
        g.stockMonth = g.safetyStock > 0 ? Number((g.totalStock / g.safetyStock).toFixed(2)) : 0;
        g.exceedPercent = g.orderEstimate > 0 ? Math.round(((g.totalStock - g.orderEstimate) / g.orderEstimate) * 100) : 0;
      });
    }

    function getAllCategories() {
      const fromSettings = (state.settings && Array.isArray(state.settings.categories))
        ? state.settings.categories.map(c => String(c).trim()).filter(Boolean)
        : [];
      const fromInv = state.inventory.map(i => String(i.category || '').trim()).filter(Boolean);
      const extraInv = Array.from(new Set(fromInv.filter(c => !fromSettings.some(s => s.toLowerCase() === c.toLowerCase())))).sort();
      return Array.from(new Set([...fromSettings, ...extraInv]));
    }

    function printStageHtml(htmlContent) {
      const stage = document.getElementById('print-stage');
      if (!stage) return;
      stage.innerHTML = htmlContent;
      document.body.classList.add('printing-stage');
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-stage');
      }, 500);
    }

    // ===== RENDER ENGINES =====

    function initTabs() {
      const container = document.getElementById('nav-tabs-container');
      if (!container) return;
      container.innerHTML = tabs.map(tab => 
        `<button class="nav-tab ${state.currentTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">${tab.icon}<span>${getTabLabel(tab)}</span></button>`
      ).join('');

      document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          switchTab(btn.dataset.tab);
          if (window.innerWidth <= 768) setSidebarHidden(true);
        });
      });

      // Restore sidebar show/hide preference (hidden by default on small screens)
      let hidden = window.innerWidth <= 768;
      try {
        const saved = localStorage.getItem('inr-sidebar-hidden');
        if (saved !== null && window.innerWidth > 768) hidden = saved === '1';
      } catch (e) {}
      setSidebarHidden(hidden, true);
      const curTab = tabs.find(x => x.id === state.currentTab);
      const tt0 = document.getElementById('topbar-title');
      if (tt0 && curTab) tt0.innerText = getTabLabel(curTab);
    }

    function setSidebarHidden(hidden, skipSave) {
      const root = document.getElementById('app-root');
      if (root) root.classList.toggle('sidebar-hidden', hidden);
      const btn = document.getElementById('btn-toggle-sidebar');
      if (btn) btn.title = hidden ? 'Show menu' : 'Hide menu';
      if (!skipSave) {
        try { localStorage.setItem('inr-sidebar-hidden', hidden ? '1' : '0'); } catch (e) {}
      }
    }

    function toggleSidebar() {
      const root = document.getElementById('app-root');
      setSidebarHidden(!(root && root.classList.contains('sidebar-hidden')));
    }

    function switchTab(tabId) {
      state.currentTab = tabId;
      const tab = tabs.find(x => x.id === tabId);
      const tt = document.getElementById('topbar-title');
      if (tt) tt.innerText = tab ? getTabLabel(tab) : '';
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      const activePanel = document.getElementById('tab-' + tabId);
      if (activePanel) activePanel.classList.remove('hidden');
      renderCurrentTab();
    }

    function renderCurrentTab() {
      window.__INR_MAIN_READY = true;
      try {
        switch (state.currentTab) {
          case 'dashboard':
            renderDashboard();
            break;
          case 'inventory':
            renderInventoryTab();
            break;
          case 'exchange':
            renderExchangeTab();
            break;
          case 'loan':
            renderLoanTab();
            break;
          case 'procurement':
            renderProcurementTab();
            break;
          case 'transactions':
            renderTransactions();
            break;
          case 'procedure':
            renderProcedureTab();
            break;
          case 'statistic':
            renderStatisticTab();
            break;
          case 'assets':
            renderAssetsTab();
            break;
          case 'settings':
            renderSettingsTab();
            break;
        }
      } catch (err) {
        console.error('Error rendering current tab (' + state.currentTab + '):', err);
      }
    }

    // --- Inventory Modals & Tab ---
    const invCols = [
      { id: 'inv-col-name', cls: 'col-inv-name' },
      { id: 'inv-col-hoid', cls: 'col-inv-hoid' },
      { id: 'inv-col-itemid', cls: 'col-inv-itemid' },
      { id: 'inv-col-cat', cls: 'col-inv-cat' },
      { id: 'inv-col-buyprice', cls: 'col-inv-buyprice' },
      { id: 'inv-col-sellprice', cls: 'col-inv-sellprice' },
      { id: 'inv-col-main', cls: 'col-inv-main' },
      { id: 'inv-col-retail', cls: 'col-inv-retail' },
      { id: 'inv-col-buffer', cls: 'col-inv-buffer' },
      { id: 'inv-col-total', cls: 'col-inv-total' },
      { id: 'inv-col-ho', cls: 'col-inv-ho' },
      { id: 'inv-col-diff', cls: 'col-inv-diff' },
      { id: 'inv-col-stockmonth', cls: 'col-inv-stockmonth' },
      { id: 'inv-col-exceed', cls: 'col-inv-exceed' },
      { id: 'inv-col-orderest', cls: 'col-inv-orderest' },
      { id: 'inv-col-buypoint', cls: 'col-inv-buypoint' },
      { id: 'inv-col-safetystock', cls: 'col-inv-safetystock' },
      { id: 'inv-col-company', cls: 'col-inv-company' }
    ];

    function openModal(id) {
      document.getElementById('modal-overlay').classList.remove('hidden');
      document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
      document.getElementById(id).classList.remove('hidden');
      if (id === 'modal-adjust') {
        populateUserNicknameSelect('adj-modal-user');
        renderAdjustmentTab();
      }
      if (id === 'modal-stock') {
        populateUserNicknameSelect('stock-modal-user');
        renderStockTab();
      }
    }
    function closeModal() {
      stopQrScannerInstance();
      document.getElementById('modal-overlay').classList.add('hidden');
    }

    // ===== MODAL ENTER KEY SUBMISSION =====
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      // Allow normal Enter behavior inside multiline textarea
      if (e.target && e.target.tagName === 'TEXTAREA') return;

      // Check if modal overlay is visible
      const overlay = document.getElementById('modal-overlay');
      if (!overlay || overlay.classList.contains('hidden')) return;

      // Find the currently active modal
      const activeModal = document.querySelector('.modal:not(.hidden)');
      if (!activeModal) return;

      // Ensure the target is inside the active modal
      if (!activeModal.contains(e.target)) return;

      // Specific sub-form actions inside modals:
      // In Procedure Edit modal, if pressing Enter in the Add Supply Item inputs, trigger Add Item
      if (activeModal.id === 'modal-proc-edit' && (e.target.id === 'proc-edit-add-item' || e.target.id === 'proc-edit-add-qty' || e.target.id === 'proc-edit-add-vol' || e.target.id === 'proc-edit-add-piece')) {
        e.preventDefault();
        if (typeof addProcEditDevice === 'function') addProcEditDevice();
        return;
      }

      // In QR scanner modal manual code input
      if (e.target && e.target.id === 'qr-manual-code') {
        e.preventDefault();
        if (typeof handleManualQrLookup === 'function') handleManualQrLookup();
        return;
      }

      // In Passcode confirm modal
      if (e.target && e.target.id === 'passcode-input') {
        e.preventDefault();
        if (typeof submitPasscodeConfirm === 'function') submitPasscodeConfirm();
        return;
      }

      // In Procurement item search/allocation pickers, do not submit the whole modal on Enter
      if (e.target && (e.target.id === 'eb-item-picker-input' || e.target.id === 'sp-item-picker-input' || e.target.id === 'rc-alloc-search-input')) {
        e.preventDefault();
        return;
      }

      // In Stock Adjustment modal
      if (activeModal.id === 'modal-adjust') {
        e.preventDefault();
        const submitAdjBtn = document.getElementById('btn-submit-adjustments');
        if (submitAdjBtn) submitAdjBtn.click();
        return;
      }

      // Find the primary Save / Submit / OK action button in the modal
      // Usually the rightmost button with .btn-brand or .btn-danger in the modal footer or body
      const actionButtons = Array.from(activeModal.querySelectorAll('button.btn-brand, button.btn-danger'));
      const primaryBtn = actionButtons.length > 0 ? actionButtons[actionButtons.length - 1] : null;

      if (primaryBtn && !primaryBtn.disabled && typeof primaryBtn.click === 'function') {
        e.preventDefault();
        primaryBtn.click();
      }
    });

    // ===== UNIVERSAL DELETION PASSCODE =====
    function getDeletePasscode() {
      try {
        return localStorage.getItem('inr_delete_passcode') || (state.settings && state.settings.deletePasscode) || '1234';
      } catch (e) {
        return '1234';
      }
    }
    function setDeletePasscode(newCode) {
      try {
        localStorage.setItem('inr_delete_passcode', String(newCode).trim());
      } catch (e) {}
    }

    let pendingPasscodeAction = null;

    function verifyPasscodeThen(description, callback) {
      pendingPasscodeAction = callback;
      const descEl = document.getElementById('passcode-action-desc');
      if (descEl) descEl.innerText = description || 'Security passcode required to confirm deletion.';
      const inputEl = document.getElementById('passcode-input');
      if (inputEl) {
        inputEl.value = '';
        setTimeout(() => inputEl.focus(), 150);
      }
      const errEl = document.getElementById('passcode-error');
      if (errEl) errEl.classList.add('hidden');
      openModal('modal-passcode-confirm');
    }

    function submitPasscodeConfirm() {
      const inputEl = document.getElementById('passcode-input');
      const val = inputEl ? inputEl.value.trim() : '';
      const correctCode = getDeletePasscode();
      if (val === correctCode) {
        closePasscodeModal();
        if (typeof pendingPasscodeAction === 'function') {
          const act = pendingPasscodeAction;
          pendingPasscodeAction = null;
          act();
        }
      } else {
        const errEl = document.getElementById('passcode-error');
        if (errEl) {
          errEl.innerText = state.currentLang === 'th' ? 'รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' : 'Incorrect passcode. Please try again.';
          errEl.classList.remove('hidden');
        }
        if (inputEl) {
          inputEl.value = '';
          inputEl.focus();
        }
      }
    }

    function closePasscodeModal() {
      pendingPasscodeAction = null;
      document.getElementById('modal-passcode-confirm')?.classList.add('hidden');
      document.getElementById('modal-overlay')?.classList.add('hidden');
    }

    function saveNewPasscode() {
      const curInput = document.getElementById('settings-cur-passcode');
      const newInput = document.getElementById('settings-new-passcode');
      const confInput = document.getElementById('settings-confirm-passcode');
      const cur = curInput ? curInput.value.trim() : '';
      const nw = newInput ? newInput.value.trim() : '';
      const cf = confInput ? confInput.value.trim() : '';

      if (cur !== getDeletePasscode()) {
        showToast(state.currentLang === 'th' ? 'รหัสผ่านปัจจุบันไม่ถูกต้อง' : 'Current passcode is incorrect');
        return;
      }
      if (!nw || nw.length < 4) {
        showToast(state.currentLang === 'th' ? 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' : 'New passcode must be at least 4 characters');
        return;
      }
      if (nw !== cf) {
        showToast(state.currentLang === 'th' ? 'รหัสผ่านใหม่ไม่ตรงกัน' : 'New passcodes do not match');
        return;
      }

      setDeletePasscode(nw);
      if (curInput) curInput.value = '';
      if (newInput) newInput.value = '';
      if (confInput) confInput.value = '';
      showToast(state.currentLang === 'th' ? 'บันทึกรหัสผ่านใหม่สำเร็จ' : 'Passcode updated successfully');
    }

    function setStockActionMode(mode) {
      const m = mode === 'Stock Out' ? 'Stock Out' : 'Stock In';
      const inRadio = document.querySelector('input[name="stock-action"][value="Stock In"]');
      const outRadio = document.querySelector('input[name="stock-action"][value="Stock Out"]');
      if (inRadio) inRadio.checked = (m === 'Stock In');
      if (outRadio) outRadio.checked = (m === 'Stock Out');

      const btnIn = document.getElementById('stock-mode-btn-in');
      const btnOut = document.getElementById('stock-mode-btn-out');
      if (btnIn) btnIn.className = m === 'Stock In' ? 'btn btn-brand' : 'btn btn-outline';
      if (btnOut) btnOut.className = m === 'Stock Out' ? 'btn btn-brand' : 'btn btn-outline';

      const submitLabel = document.getElementById('btn-submit-stock-label');
      if (submitLabel) submitLabel.innerText = m === 'Stock In' ? 'Save Stock In' : 'Save Stock Out';
      renderStockTab();
    }

    function openStockModal(defaultMode) {
      state.stockLines = [{ itemId: '', qty: 1, loc: 'Main', notes: '' }];
      setStockActionMode(defaultMode || 'Stock In');
      openModal('modal-stock');
    }

    function resetInventoryDefault() {
      const searchInput = document.getElementById('inv-tab-search-input');
      if (searchInput) searchInput.value = '';
      const catSelect = document.getElementById('inv-tab-cat-filter');
      if (catSelect) catSelect.value = '';
      applyDefaultInvCols();
      state.invSort = { key: 'category', dir: 'asc' };
      renderInventoryTab();
      showToast(state.currentLang === 'th' ? 'รีเซ็ตตารางแสดงผลเป็น 6 คอลัมน์เริ่มต้นและเรียงตามหมวดหมู่แล้ว' : 'Reset table view to 6 default columns and category sort');
    }

    function exportInventoryCSV() {
      const table = document.getElementById('inv-print-area');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length === 0) {
        showToast('No inventory data to export');
        return;
      }
      const csvLines = rows.map(tr => {
        const cells = Array.from(tr.querySelectorAll('th, td')).filter(c => !c.classList.contains('no-print') && !c.classList.contains('hidden'));
        return cells.map(cell => {
          let text = cell.innerText.trim();
          text = text.replace(/[⇅▲▼]/g, '').trim();
          text = text.replace(/[\r\n]+/g, ' ');
          return '"' + text.replace(/"/g, '""') + '"';
        }).join(',');
      });
      const filename = `INR_Inventory_${getToday()}.csv`;
      const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Exported CSV: ' + filename);
    }

    function exportInventoryPDF() {
      const origTitle = document.title;
      document.title = `INR_Inventory_${getToday()}`;
      printInventory();
      setTimeout(() => { document.title = origTitle; }, 1500);
    }

    function printInventoryTable() {
      printInventory();
    }

    function printCurrentView() {
      const tab = state.currentTab || 'dashboard';
      if (tab === 'inventory') {
        printInventory();
        return;
      }
      if (tab === 'statistic' && typeof printStatistics === 'function') {
        printStatistics();
        return;
      }
      if (tab === 'assets' && typeof printAssetsList === 'function') {
        printAssetsList();
        return;
      }
      const panel = document.getElementById('tab-' + tab);
      if (panel) {
        const clone = panel.cloneNode(true);
        clone.querySelectorAll('.no-print, .hidden, .mobile-cart-bar').forEach(el => el.remove());
        const html = `
          <div style="padding:16px; font-family:'Noto Sans', 'Noto Sans Thai', sans-serif;">
            <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #111827; padding-bottom:8px; margin-bottom:12px;">
              <div>
                <h2 style="margin:0; font-size:18px; color:#111827;">INR Interventional Neuroradiology</h2>
              </div>
              <div style="text-align:right; font-size:11px; color:#6b7280;">
                <div><strong>Printed:</strong> ${new Date().toLocaleString('en-GB')}</div>
              </div>
            </div>
            ${clone.innerHTML}
          </div>
        `;
        printStageHtml(html);
      } else {
        window.print();
      }
    }

    function printInventory() {
      const table = document.getElementById('inv-print-area');
      if (!table) return;
      const clone = table.cloneNode(true);
      clone.querySelectorAll('.no-print, .hidden').forEach(el => el.remove());
      clone.querySelectorAll('.sort-icon').forEach(el => el.remove());
      const html = `
        <div style="padding:16px; font-family:'Noto Sans', 'Noto Sans Thai', sans-serif;">
          <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #111827; padding-bottom:8px; margin-bottom:12px;">
            <div>
              <h2 style="margin:0; font-size:18px; color:#111827;">INR Interventional Neuroradiology</h2>
              <div style="font-size:14px; font-weight:600; color:#374151; margin-top:2px;">Inventory Report</div>
            </div>
            <div style="text-align:right; font-size:11px; color:#6b7280;">
              <div><strong>Printed:</strong> ${new Date().toLocaleString('en-GB')}</div>
            </div>
          </div>
          <div class="table-wrap" style="max-height:none;">
            ${clone.outerHTML}
          </div>
        </div>
      `;
      printStageHtml(html);
    }

    function toggleInvColsPanel() {
      const panel = document.getElementById('inv-cols-panel');
      if (panel) panel.classList.toggle('hidden');
    }

    function setAllInvCols(checked) {
      invCols.forEach(col => {
        const cb = document.getElementById(col.id);
        if (cb) cb.checked = checked;
      });
      renderInventoryTab();
    }

    const invDefaultCols = ['inv-col-name', 'inv-col-main', 'inv-col-retail', 'inv-col-buffer', 'inv-col-total', 'inv-col-ho'];

    function applyDefaultInvCols() {
      invCols.forEach(col => {
        const cb = document.getElementById(col.id);
        if (cb) cb.checked = invDefaultCols.indexOf(col.id) !== -1;
      });
    }

    function resetDefaultInvCols() {
      applyDefaultInvCols();
      renderInventoryTab();
    }

    function sortInventory(key) {
      if (state.invSort.key === key) {
        state.invSort.dir = state.invSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.invSort.key = key;
        state.invSort.dir = 'asc';
      }
      renderInventoryTab();
    }

    function calcModalStock() {
      const isFree = Boolean(document.getElementById('inv-modal-is-free')?.checked);
      const m = Number(document.getElementById('inv-modal-main').value) || 0;
      const r = Number(document.getElementById('inv-modal-retail').value) || 0;
      const ho = isFree ? 0 : (Number(document.getElementById('inv-modal-hostock').value) || 0);
      const totInput = document.getElementById('inv-modal-total');
      const diffInput = document.getElementById('inv-modal-diff');
      const tot = m + r;
      if (totInput) totInput.value = tot;
      if (diffInput) diffInput.value = isFree ? 0 : (tot - ho);
    }

    function renderInventoryTab() {
      recalculateInventoryHierarchy();

      const searchInput = document.getElementById('inv-tab-search-input');
      const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
      const catSelect = document.getElementById('inv-tab-cat-filter');
      const catVal = catSelect ? catSelect.value.toLowerCase().trim() : '';
      const body = document.getElementById('inv-tab-table-body');
      if (!body) return;

      // Update category filter dropdown options & datalist
      const allCats = getAllCategories();
      if (catSelect) {
        const curCat = catSelect.value;
        catSelect.innerHTML = `<option value="">All Categories</option>` +
          allCats.map(c => `<option value="${c}" ${c === curCat ? 'selected' : ''}>${c}</option>`).join('');
      }
      const catDatalist = document.getElementById('inv-cat-list');
      if (catDatalist) {
        catDatalist.innerHTML = allCats.map(c => `<option value="${c}">`).join('');
      }

      function matchesItemFilter(i) {
        if (catVal && (i.category || '').toLowerCase() !== catVal) return false;
        if (!searchVal) return true;
        return (
          String(i.itemId || '').toLowerCase().includes(searchVal) ||
          String(i.hoItemId || '').toLowerCase().includes(searchVal) ||
          String(i.deviceName || '').toLowerCase().includes(searchVal) ||
          String(i.category || '').toLowerCase().includes(searchVal) ||
          String(i.company || '').toLowerCase().includes(searchVal) ||
          (i.isFreeItem && 'free ของแถม'.includes(searchVal))
        );
      }

      function matchesGroupFilter(g) {
        if (catVal && (g.category || '').toLowerCase() !== catVal) return false;
        if (!searchVal) return true;
        return (
          String(g.groupId || '').toLowerCase().includes(searchVal) ||
          String(g.hoItemId || '').toLowerCase().includes(searchVal) ||
          String(g.groupName || '').toLowerCase().includes(searchVal) ||
          String(g.category || '').toLowerCase().includes(searchVal) ||
          String(g.company || '').toLowerCase().includes(searchVal)
        );
      }

      // Sort helper
      const numCols = ['buyPrice', 'sellPrice', 'mainStock', 'retailStock', 'bufferStock', 'totalStock', 'hoStock', 'stockDiff', 'stockMonth', 'exceedPercent', 'orderEstimate', 'buyPoint', 'safetyStock'];
      const sortKey = state.invSort.key || 'category';
      const sortDir = state.invSort.dir === 'desc' ? -1 : 1;

      function compareEntries(a, b) {
        const nameA = a.isGroupSummary ? (a.groupName || '') : (a.deviceName || '');
        const nameB = b.isGroupSummary ? (b.groupName || '') : (b.deviceName || '');
        if (sortKey === 'category') {
          const catOrder = getAllCategories().map(c => c.toLowerCase());
          const catA = String(a.category || '').trim().toLowerCase();
          const catB = String(b.category || '').trim().toLowerCase();
          let idxA = catOrder.indexOf(catA);
          let idxB = catOrder.indexOf(catB);
          if (idxA === -1) idxA = 9999;
          if (idxB === -1) idxB = 9999;
          if (idxA !== idxB) {
            return (idxA - idxB) * sortDir;
          }
          return nameA.toLowerCase().localeCompare(nameB.toLowerCase());
        } else if (sortKey === 'deviceName') {
          return nameA.toLowerCase().localeCompare(nameB.toLowerCase()) * sortDir;
        } else if (numCols.includes(sortKey)) {
          const valA = Number(a[sortKey]) || 0;
          const valB = Number(b[sortKey]) || 0;
          return (valA - valB) * sortDir;
        } else {
          const valA = String(a[sortKey] || '').toLowerCase();
          const valB = String(b[sortKey] || '').toLowerCase();
          return valA.localeCompare(valB) * sortDir;
        }
      }

      // Organize Groups and Standalone items (Section 2.3 & 4.1)
      const groupMap = new Map();
      (state.groups || []).forEach(g => {
        if (g && g.groupId) groupMap.set(String(g.groupId), g);
      });

      const membersByGroup = new Map();
      const topLevelEntries = [];

      (state.inventory || []).forEach(i => {
        const gid = String(i.groupId || '').trim();
        if (gid && groupMap.has(gid)) {
          if (!membersByGroup.has(gid)) membersByGroup.set(gid, []);
          membersByGroup.get(gid).push(i);
        } else {
          topLevelEntries.push(Object.assign({}, i, { isGroupSummary: false }));
        }
      });

      groupMap.forEach((g, gid) => {
        const members = membersByGroup.get(gid) || [];
        if (members.length > 0) {
          topLevelEntries.push(Object.assign({}, g, { isGroupSummary: true }));
        }
      });

      topLevelEntries.sort(compareEntries);
      membersByGroup.forEach(list => list.sort(compareEntries));

      const displayRows = [];
      topLevelEntries.forEach(entry => {
        if (entry.isGroupSummary) {
          const members = membersByGroup.get(String(entry.groupId)) || [];
          const matchingMembers = members.filter(matchesItemFilter);
          const groupMatches = matchesGroupFilter(entry);
          if (groupMatches || matchingMembers.length > 0) {
            // Section 4.1: Always expanded; show Group Summary Row followed by all Sub-Item Rows
            displayRows.push({ rowType: 'group', group: entry });
            const subItemsToShow = (searchVal && !groupMatches) ? matchingMembers : members;
            subItemsToShow.forEach(sub => {
              displayRows.push({ rowType: 'sub', item: sub, group: entry });
            });
          }
        } else if (matchesItemFilter(entry)) {
          displayRows.push({ rowType: 'standalone', item: entry });
        }
      });

      // Update sort indicators in header
      const allSortKeys = ['itemId', 'hoItemId', 'deviceName', 'category', 'buyPrice', 'sellPrice', 'mainStock', 'retailStock', 'bufferStock', 'totalStock', 'hoStock', 'stockDiff', 'stockMonth', 'exceedPercent', 'orderEstimate', 'buyPoint', 'safetyStock', 'company'];
      allSortKeys.forEach(k => {
        const icon = document.getElementById('sort-' + k);
        if (icon) {
          if (state.invSort.key === k) {
            icon.innerText = state.invSort.dir === 'asc' ? '▲' : '▼';
            icon.style.opacity = '1';
            icon.style.color = 'var(--brand)';
          } else {
            icon.innerText = '⇅';
            icon.style.opacity = '0.35';
            icon.style.color = 'inherit';
          }
        }
      });

      // Render Rows (Section 2.3 & Section 4.1)
      body.innerHTML = displayRows.map(rowObj => {
        if (rowObj.rowType === 'group') {
          const g = rowObj.group;
          const diffVal = Number(g.stockDiff) || 0;
          let diffColor = 'inherit';
          let diffDisplay = String(diffVal);
          if (diffVal < 0) { diffColor = 'var(--red)'; }
          else if (diffVal > 0) { diffColor = 'var(--brand)'; diffDisplay = '+' + diffVal; }

          const exceedVal = Number(g.exceedPercent) || 0;
          const exceedDisplay = exceedVal > 0 ? ('+' + exceedVal + '%') : (exceedVal + '%');

          return `
            <tr class="inv-parent-row">
              <td class="col-inv-name">
                <a href="javascript:void(0)" class="device-name-link font-bold" onclick="openGroupModal('${escapeHtml(String(g.groupId))}')">${escapeHtml(g.groupName || '')}</a>
              </td>
              <td class="col-inv-hoid text-gray text-xs font-mono">${escapeHtml(g.hoItemId || '-')}</td>
              <td class="col-inv-itemid text-gray text-xs font-mono">-</td>
              <td class="col-inv-cat text-gray">${escapeHtml(g.category || '')}</td>
              <td class="col-inv-buyprice num">฿${(Number(g.buyPrice) || 0).toLocaleString()}</td>
              <td class="col-inv-sellprice num">฿${(Number(g.sellPrice) || 0).toLocaleString()}</td>
              <td class="col-inv-main num font-bold">${Number(g.mainStock) || 0}</td>
              <td class="col-inv-retail num font-bold">${Number(g.retailStock) || 0}</td>
              <td class="col-inv-buffer num" style="color:#6d28d9;">${Number(g.bufferStock) || 0}</td>
              <td class="col-inv-total num font-bold">${Number(g.totalStock) || 0}</td>
              <td class="col-inv-ho num font-semibold">${Number(g.hoStock) || 0}</td>
              <td class="col-inv-diff num font-semibold" style="color:${diffColor}">${diffDisplay}</td>
              <td class="col-inv-stockmonth num">${Number(g.stockMonth) || 0}</td>
              <td class="col-inv-exceed num">${exceedDisplay}</td>
              <td class="col-inv-orderest num">${Number(g.orderEstimate) || 0}</td>
              <td class="col-inv-buypoint num">${Number(g.buyPoint) || 0}</td>
              <td class="col-inv-safetystock num">${Number(g.safetyStock) || 0}</td>
              <td class="col-inv-company text-gray text-sm">${escapeHtml(g.company || '—')}</td>
            </tr>
          `;
        }

        const i = rowObj.item;
        const isSub = rowObj.rowType === 'sub';
        const isFree = Boolean(i.isFreeItem);
        const exceedVal = Number(i.exceedPercent) || 0;
        const exceedDisplay = exceedVal > 0 ? ('+' + exceedVal + '%') : (exceedVal + '%');

        // Sub-Item Row inside a Group: HO Stock and Stock Diff are Blank / "-"
        let hoDisplay = '-';
        let diffDisplay = '-';
        let diffColor = 'var(--gray-400)';

        if (!isSub) {
          hoDisplay = isFree ? '-' : String(Number(i.hoStock) || 0);
          if (!isFree) {
            const diffVal = i.stockDiff !== undefined && i.stockDiff !== null ? Number(i.stockDiff) : (Number(i.totalStock || 0) - Number(i.hoStock || 0));
            diffDisplay = diffVal > 0 ? ('+' + diffVal) : String(diffVal);
            diffColor = diffVal < 0 ? 'var(--red)' : (diffVal > 0 ? 'var(--brand)' : 'inherit');
          }
        }

        const displayName = isSub ? (`- ${i.deviceName || ''}`) : (i.deviceName || '');
        const freeBadgeHtml = isFree ? ` <span class="badge-free" title="Free Item">FREE</span>` : '';

        return `
          <tr class="${isSub ? 'inv-child-row' : ''}">
            <td class="col-inv-name">
              <a href="javascript:void(0)" class="device-name-link font-medium" onclick="openDeviceDetailModal('${escapeHtml(String(i.itemId))}')">${escapeHtml(displayName)}</a>${freeBadgeHtml}
            </td>
            <td class="col-inv-hoid text-gray text-xs font-mono">${escapeHtml(i.hoItemId || '-')}</td>
            <td class="col-inv-itemid text-gray text-xs font-mono">${escapeHtml(i.itemId || '-')}</td>
            <td class="col-inv-cat text-gray">${escapeHtml(i.category || '')}</td>
            <td class="col-inv-buyprice num">฿${(Number(i.buyPrice) || 0).toLocaleString()}</td>
            <td class="col-inv-sellprice num">฿${(Number(i.sellPrice) || 0).toLocaleString()}</td>
            <td class="col-inv-main num">${Number(i.mainStock) || 0}</td>
            <td class="col-inv-retail num font-bold">${Number(i.retailStock) || 0}</td>
            <td class="col-inv-buffer num" style="color:#6d28d9;">${Number(i.bufferStock) || 0}</td>
            <td class="col-inv-total num font-bold">${Number(i.totalStock) || 0}</td>
            <td class="col-inv-ho num text-gray">${hoDisplay}</td>
            <td class="col-inv-diff num font-semibold" style="color:${diffColor}">${diffDisplay}</td>
            <td class="col-inv-stockmonth num">${Number(i.stockMonth) || 0}</td>
            <td class="col-inv-exceed num">${exceedDisplay}</td>
            <td class="col-inv-orderest num">${Number(i.orderEstimate) || 0}</td>
            <td class="col-inv-buypoint num">${Number(i.buyPoint) || 0}</td>
            <td class="col-inv-safetystock num">${Number(i.safetyStock) || 0}</td>
            <td class="col-inv-company text-gray text-sm">${escapeHtml(i.company || '—')}</td>
          </tr>
        `;
      }).join('');

      // Update Column Visibility
      let visibleCount = 0;
      invCols.forEach(col => {
        const cb = document.getElementById(col.id);
        const isVisible = cb ? cb.checked : true;
        if (isVisible) visibleCount++;
        document.querySelectorAll('.' + col.cls).forEach(el => {
          el.classList.toggle('hidden', !isVisible);
        });
      });

      const countEl = document.getElementById('inv-cols-count');
      if (countEl) countEl.innerText = visibleCount;
    }

    function openAddDeviceModal() {
      if (typeof refreshCompanyDatalist === 'function') refreshCompanyDatalist();
      populateUserNicknameSelect('inv-modal-user', '');
      document.getElementById('modal-device-title').innerText = 'Add New Device';
      document.getElementById('inv-modal-is-edit').value = 'false';
      document.getElementById('inv-modal-orig-id').value = '';
      document.getElementById('inv-modal-itemid').value = '';
      document.getElementById('inv-modal-name').value = '';
      document.getElementById('inv-modal-cat').value = '';
      document.getElementById('inv-modal-hoid').value = '';
      document.getElementById('inv-modal-buy').value = '';
      document.getElementById('inv-modal-sell').value = '';
      document.getElementById('inv-modal-main').value = '0';
      document.getElementById('inv-modal-retail').value = '0';
      document.getElementById('inv-modal-total').value = '0';
      document.getElementById('inv-modal-hostock').value = '0';
      document.getElementById('inv-modal-diff').value = '0';
      document.getElementById('inv-modal-stockmonth').value = '0';
      document.getElementById('inv-modal-exceed').value = '0';
      document.getElementById('inv-modal-orderest').value = '0';
      document.getElementById('inv-modal-buypoint').value = '0';
      document.getElementById('inv-modal-safety').value = '0';

      const freeEl = document.getElementById('inv-modal-is-free');
      const grpEl  = document.getElementById('inv-modal-group-id');
      const noteEl = document.getElementById('inv-modal-notes');
      const compEl = document.getElementById('inv-modal-company');
      if (freeEl) { if (freeEl.type === 'checkbox') freeEl.checked = false; else freeEl.value = 'false'; }
      if (grpEl)  { grpEl.value = ''; }
      if (noteEl) { noteEl.value = ''; }
      if (compEl) { compEl.value = ''; }

      document.querySelectorAll('#modal-device .inv-edit-only').forEach(el => el.style.display = 'none');
      openModal('modal-device');
    }

    function openEditDeviceModal(itemId) {
      if (typeof refreshCompanyDatalist === 'function') refreshCompanyDatalist();
      populateUserNicknameSelect('inv-modal-user', '');
      const item = state.inventory.find(i => String(i.itemId) === String(itemId));
      if (!item) return;
      document.getElementById('modal-device-title').innerText = 'Edit Device: ' + (item.deviceName || '');
      document.getElementById('inv-modal-is-edit').value = 'true';
      document.getElementById('inv-modal-orig-id').value = item.itemId;
      document.getElementById('inv-modal-itemid').value = item.itemId || '';
      document.getElementById('inv-modal-name').value = item.deviceName || '';
      document.getElementById('inv-modal-cat').value = item.category || '';
      document.getElementById('inv-modal-hoid').value = item.hoItemId || '';
      document.getElementById('inv-modal-buy').value = item.buyPrice !== undefined ? item.buyPrice : '';
      document.getElementById('inv-modal-sell').value = item.sellPrice !== undefined ? item.sellPrice : '';
      document.getElementById('inv-modal-main').value = item.mainStock !== undefined ? item.mainStock : 0;
      document.getElementById('inv-modal-retail').value = item.retailStock !== undefined ? item.retailStock : 0;
      document.getElementById('inv-modal-total').value = item.totalStock !== undefined ? item.totalStock : 0;
      document.getElementById('inv-modal-hostock').value = (item.ownHoStock !== undefined ? item.ownHoStock : item.hoStock) || 0;
      document.getElementById('inv-modal-diff').value = item.stockDiff !== undefined && item.stockDiff !== null ? item.stockDiff : 0;
      document.getElementById('inv-modal-stockmonth').value = item.stockMonth !== undefined ? item.stockMonth : 0;
      document.getElementById('inv-modal-exceed').value = item.exceedPercent !== undefined ? item.exceedPercent : 0;
      document.getElementById('inv-modal-orderest').value = item.orderEstimate !== undefined ? item.orderEstimate : 0;
      document.getElementById('inv-modal-buypoint').value = item.buyPoint !== undefined ? item.buyPoint : 0;
      document.getElementById('inv-modal-safety').value = item.safetyStock !== undefined ? item.safetyStock : 0;

      const freeEl = document.getElementById('inv-modal-is-free');
      const grpEl  = document.getElementById('inv-modal-group-id');
      const noteEl = document.getElementById('inv-modal-notes');
      const compEl = document.getElementById('inv-modal-company');
      if (freeEl) { if (freeEl.type === 'checkbox') freeEl.checked = Boolean(item.isFreeItem); else freeEl.value = item.isFreeItem ? 'true' : 'false'; }
      if (grpEl)  { grpEl.value = item.ungroupedManual ? 'UNGROUPED' : (item.groupId || ''); }
      if (noteEl) { noteEl.value = item.notes || ''; }
      if (compEl) { compEl.value = item.company || ''; }

      document.querySelectorAll('#modal-device .inv-edit-only').forEach(el => el.style.display = '');
      openModal('modal-device');
    }

    function openDeviceDetailModal(itemId) {
      recalculateInventoryHierarchy();
      const i = state.inventory.find(item => String(item.itemId) === String(itemId));
      if (!i) return;
      const titleEl = document.getElementById('dev-detail-title');
      const contentEl = document.getElementById('dev-detail-content');
      if (titleEl) titleEl.innerText = i.deviceName || 'Device Details';

      const isFree = Boolean(i.isFreeItem);
      const grp = i.groupId ? (state.groups || []).find(g => String(g.groupId) === String(i.groupId)) : null;
      const diffVal = grp ? null : (isFree ? 0 : (i.stockDiff !== undefined && i.stockDiff !== null ? Number(i.stockDiff) : (Number(i.totalStock || 0) - Number(i.hoStock || 0))));
      let diffDisplay = grp ? `— (Tracked on Group: ${grp.groupName})` : (isFree ? '0 (Free Item)' : (diffVal > 0 ? ('+' + diffVal) : String(diffVal)));
      let diffColor = grp ? 'var(--gray-600)' : (isFree ? '#15803d' : (diffVal < 0 ? 'var(--red)' : (diffVal > 0 ? 'var(--brand)' : 'inherit')));
      const exceedVal = i.exceedPercent !== undefined ? Number(i.exceedPercent) : 0;
      const exceedDisplay = exceedVal > 0 ? ('+' + exceedVal + '%') : (exceedVal + '%');

      const groupRowHtml = grp ? `
        <tr>
          <th>Assigned Group</th>
          <td>
            <strong>${escapeHtml(grp.groupName)}</strong> <span class="text-xs font-mono text-gray">(${escapeHtml(grp.groupId)})</span>
            <div class="text-xs text-gray mt-1">Group HO Stock: <strong>${grp.hoStock || 0}</strong> | Group Total Stock: <strong>${grp.totalStock || 0}</strong> | Group Stock Diff: <strong>${grp.stockDiff > 0 ? ('+' + grp.stockDiff) : (grp.stockDiff || 0)}</strong></div>
          </td>
        </tr>
      ` : '';

      if (contentEl) {
        contentEl.innerHTML = `
          <table class="device-detail-table">
            <tbody>
              <tr><th>Device Name</th><td><strong>${escapeHtml(i.deviceName || '')}</strong> ${isFree ? '<span class="badge-free">FREE</span>' : ''}</td></tr>
              ${groupRowHtml}
              <tr><th>HO Item ID</th><td><span class="font-mono">${escapeHtml(i.hoItemId || '—')}</span></td></tr>
              <tr><th>Permanent Item ID</th><td><span class="font-mono text-gray">${escapeHtml(i.itemId || '—')}</span></td></tr>
              <tr><th>Category</th><td><span class="badge badge-gray">${escapeHtml(i.category || '—')}</span></td></tr>
              <tr><th>Company / Vendor</th><td>${i.company ? `<strong>${escapeHtml(i.company)}</strong>` : '<span class="text-gray text-xs">—</span>'}</td></tr>
              <tr><th>Note / Remarks</th><td style="white-space:pre-wrap;">${i.notes ? escapeHtml(i.notes) : '<span class="text-gray text-xs">No notes recorded</span>'}</td></tr>
              <tr><th>Pricing ${grp ? '(Shared from Group)' : ''}</th><td>Buy: <strong>฿${(Number(i.buyPrice)||0).toLocaleString()}</strong> &nbsp;|&nbsp; Sell: <strong>฿${(Number(i.sellPrice)||0).toLocaleString()}</strong></td></tr>
              <tr style="background:#f0fdf4;">
                <th>Stock Breakdown</th>
                <td>
                  <div>Main Stock: <strong>${Number(i.mainStock)||0}</strong></div>
                  <div>Retail Stock: <strong>${Number(i.retailStock)||0}</strong></div>
                  <div style="color:#6d28d9;">Buffer Stock: <strong>${Number(i.bufferStock)||0}</strong> <span class="text-xs text-gray">(Consignment/Quarantine)</span></div>
                  <div>Total Clinical Stock: <strong style="color:var(--brand-dark);">${Number(i.totalStock)||0}</strong></div>
                  <div>HO Stock: <strong>${grp ? '— (Group Level)' : (isFree ? '— (Free)' : (Number(i.hoStock)||0))}</strong></div>
                  <div>Stock Diff: <strong style="color:${diffColor};">${diffDisplay}</strong></div>
                  ${!grp ? `<div class="text-xs text-gray mt-1">HO Last Checked: <strong>${formatDateDDMMYYYY(i.hoLastChecked)}</strong></div>` : ''}
                </td>
              </tr>
              <tr><th>Stock / Month</th><td>${Number(i.stockMonth)||0}</td></tr>
              <tr><th>Exceed %</th><td>${exceedDisplay}</td></tr>
              <tr><th>Order Estimate</th><td>${Number(i.orderEstimate)||0}</td></tr>
              <tr><th>Buy Point / Safety</th><td>Buy Point: <strong>${Number(i.buyPoint)||0}</strong> &nbsp;|&nbsp; Safety: <strong>${Number(i.safetyStock)||0}</strong></td></tr>
            </tbody>
          </table>
        `;
      }

      const btnEdit = document.getElementById('dev-detail-btn-edit');
      if (btnEdit) {
        btnEdit.onclick = function() {
          closeModal();
          openEditDeviceModal(i.itemId);
        };
      }
      const btnDelete = document.getElementById('dev-detail-btn-delete');
      if (btnDelete) {
        btnDelete.onclick = function() {
          closeModal();
          removeDevice(i.itemId);
        };
      }
      openModal('modal-device-detail');
    }

    function removeDevice(itemId) {
      const inv = state.inventory.find(i => String(i.itemId) === String(itemId));
      const devName = inv ? inv.deviceName : itemId;
      verifyPasscodeThen(state.currentLang === 'th' ? `ยืนยันการลบเวชภัณฑ์ "${devName}"?` : `Delete inventory device "${devName}"?`, async () => {
        if (isApiConfigured()) {
          appLoading.classList.remove('hidden');
          appContent.classList.add('hidden');
          try {
            await callApi('deleteInventoryItem', { itemId });
            showToast('Device removed');
            fetchDataFromServer();
          } catch (err) {
            showToast('Failed: ' + (err.message || err));
            appLoading.classList.add('hidden');
            appContent.classList.remove('hidden');
          }
        } else {
          state.inventory = state.inventory.filter(i => String(i.itemId) !== String(itemId));
          recalculateInventoryHierarchy();
          showToast('Device removed (mock)');
          renderCurrentTab();
        }
      });
    }

    function saveDevice() {
      const isEdit = document.getElementById('inv-modal-is-edit').value === 'true';
      const origId = document.getElementById('inv-modal-orig-id').value;
      let customId = document.getElementById('inv-modal-itemid').value.trim();
      const name = document.getElementById('inv-modal-name').value.trim();
      const cat = document.getElementById('inv-modal-cat').value.trim();
      const userNick = (document.getElementById('inv-modal-user')?.value || '').trim();

      if (!userNick) {
        showToast('Please select User (Nickname)');
        return;
      }
      if (!name || !cat) {
        showToast('Device Name and Category are required');
        return;
      }

      if (!customId) {
        if (isEdit && origId) {
          customId = origId;
        } else {
          customId = generateClientItemId(cat);
        }
      }

      const isFreeEl   = document.getElementById('inv-modal-is-free');
      const isFreeItem = isFreeEl ? (isFreeEl.type === 'checkbox' ? isFreeEl.checked : isFreeEl.value === 'true') : false;
      const groupId    = String(document.getElementById('inv-modal-group-id')?.value || '').trim();
      const notes      = String(document.getElementById('inv-modal-notes')?.value || '').trim();
      const company    = String(document.getElementById('inv-modal-company')?.value || '').trim();

      const mainStock = Number(document.getElementById('inv-modal-main').value) || 0;
      const retailStock = Number(document.getElementById('inv-modal-retail').value) || 0;
      const hoStock = isFreeItem ? 0 : (Number(document.getElementById('inv-modal-hostock').value) || 0);
      let totalStock = Number(document.getElementById('inv-modal-total').value);
      if (isNaN(totalStock)) totalStock = mainStock + retailStock;
      let stockDiff = isFreeItem ? 0 : Number(document.getElementById('inv-modal-diff').value);
      if (isNaN(stockDiff) && !isFreeItem) stockDiff = totalStock - hoStock;

      const data = {
        itemId: isEdit ? (origId || customId) : customId,
        hoItemId: document.getElementById('inv-modal-hoid').value.trim(),
        deviceName: name,
        category: cat,
        buyPrice: isFreeItem ? 0 : (Number(document.getElementById('inv-modal-buy').value) || 0),
        sellPrice: Number(document.getElementById('inv-modal-sell').value) || 0,
        mainStock: mainStock,
        retailStock: retailStock,
        totalStock: totalStock,
        hoStock: hoStock,
        ownHoStock: hoStock,
        stockDiff: stockDiff,
        stockMonth: Number(document.getElementById('inv-modal-stockmonth').value) || 0,
        exceedPercent: Number(document.getElementById('inv-modal-exceed').value) || 0,
        orderEstimate: Number(document.getElementById('inv-modal-orderest').value) || 0,
        buyPoint: Number(document.getElementById('inv-modal-buypoint').value) || 0,
        safetyStock: Number(document.getElementById('inv-modal-safety').value) || 0,
        isFreeItem: isFreeItem,
        groupId: groupId === 'UNGROUPED' ? 'UNGROUPED' : groupId,
        ungroupedManual: groupId === 'UNGROUPED',
        notes: notes,
        company: company,
        user: userNick,
        tech: userNick
      };

      let origItem = null;
      if (isEdit) {
        origItem = state.inventory.find(i => String(i.itemId) === String(origId));
        if (origItem) {
          data.currentMain = origItem.mainStock;
          data.currentRetail = origItem.retailStock;
        }
      }

      if (isApiConfigured()) {
        appLoading.classList.remove('hidden');
        appContent.classList.add('hidden');

        callApi(isEdit ? 'editInventoryItem' : 'addInventoryItem', data)
          .then(() => {
            showToast(isEdit ? 'Device updated!' : 'Device added!');
            closeModal();
            fetchDataFromServer();
          })
          .catch(err => {
            showToast('Failed: ' + (err.message || err));
            appLoading.classList.add('hidden');
            appContent.classList.remove('hidden');
          });
      } else {
        const todayStr = getToday();
        if (isEdit) {
          const changes = [];
          if (origItem) {
            if (origItem.deviceName !== data.deviceName) changes.push(`Name: ${origItem.deviceName} -> ${data.deviceName}`);
            if ((origItem.hoItemId || '') !== data.hoItemId) changes.push(`HO ID: ${origItem.hoItemId || '-'} -> ${data.hoItemId || '-'}`);
            if ((Number(origItem.buyPrice) || 0) !== data.buyPrice) changes.push(`Buy Price: ${origItem.buyPrice || 0} -> ${data.buyPrice}`);
            if ((Number(origItem.sellPrice) || 0) !== data.sellPrice) changes.push(`Sell Price: ${origItem.sellPrice || 0} -> ${data.sellPrice}`);
            if ((Number(origItem.ownHoStock ?? origItem.hoStock) || 0) !== data.hoStock) changes.push(`HO Stock: ${origItem.ownHoStock ?? origItem.hoStock ?? 0} -> ${data.hoStock}`);
            if ((Number(origItem.safetyStock) || 0) !== data.safetyStock) changes.push(`Safety Stock: ${origItem.safetyStock || 0} -> ${data.safetyStock}`);
            if ((Number(origItem.orderEstimate) || 0) !== data.orderEstimate) changes.push(`Order Estimate: ${origItem.orderEstimate || 0} -> ${data.orderEstimate}`);
          }
          const summary = changes.length > 0 ? ('Updated ' + changes.join(', ')) : ('Edited Device: ' + data.deviceName);
          state.transactions.push({
            id: 'EDT-' + Date.now(),
            date: todayStr,
            type: 'Edit Device',
            hn: '',
            itemId: data.itemId,
            qty: 0,
            fromLoc: '',
            toLoc: '',
            disease: '',
            procedure: '',
            shift: '',
            tech: userNick,
            complication: summary,
            contrast: ''
          });
          const idx = state.inventory.findIndex(i => String(i.itemId) === String(origId || customId));
          if (idx >= 0) state.inventory[idx] = Object.assign({}, state.inventory[idx], data);
        } else {
          state.transactions.push({
            id: 'ADD-' + Date.now(),
            date: todayStr,
            type: 'Add Device',
            hn: '',
            itemId: data.itemId,
            qty: 0,
            fromLoc: '',
            toLoc: '',
            disease: '',
            procedure: '',
            shift: '',
            tech: userNick,
            complication: `Added Device: ${data.deviceName} (HO ID: ${data.hoItemId || '-'}, Safety: ${data.safetyStock})`,
            contrast: ''
          });
          state.inventory.push(data);
        }
        recalculateInventoryHierarchy();
        showToast(isEdit ? 'Device updated (mock)' : 'Device added (mock)');
        closeModal();
        renderCurrentTab();
      }
    }

    // ════════════════════════════════════════════════════════════════
    // HO STOCK RECONCILIATION ("กระทบยอด HO")
    // ════════════════════════════════════════════════════════════════
    function openHoReconcileModal() {
      recalculateInventoryHierarchy();
      state.hoReconcileDraft = {};
      populateUserNicknameSelect('ho-rec-user', '');
      const dateEl = document.getElementById('ho-rec-date');
      if (dateEl) dateEl.value = getToday();
      const searchEl = document.getElementById('ho-rec-search');
      if (searchEl) searchEl.value = '';
      renderHoReconcileTable();
      openModal('modal-ho-reconcile');
    }

    function onHoRecInput(key, val) {
      if (!state.hoReconcileDraft) state.hoReconcileDraft = {};
      if (val === '' || val === null || val === undefined) {
        delete state.hoReconcileDraft[key];
      } else {
        state.hoReconcileDraft[key] = val;
      }
    }

    function renderHoReconcileTable() {
      recalculateInventoryHierarchy();
      const tbody = document.getElementById('ho-rec-table-body');
      if (!tbody) return;
      const q = (document.getElementById('ho-rec-search')?.value || '').trim().toLowerCase();

      // Section 5: 1 row per Group and 1 row per standalone item (sub-items inside a Group are NOT listed separately)
      const rows = [];
      (state.groups || []).forEach(g => {
        if (!g || !g.groupId) return;
        rows.push({
          key: 'group::' + g.groupId,
          targetType: 'group',
          id: g.groupId,
          name: g.groupName || g.groupId,
          hoItemId: g.hoItemId || '-',
          hoStock: Number(g.hoStock) || 0,
          hoLastChecked: g.hoLastChecked || ''
        });
      });

      (state.inventory || []).forEach(i => {
        if (i.groupId) return; // skip sub-items inside a Group
        rows.push({
          key: 'item::' + i.itemId,
          targetType: 'item',
          id: i.itemId,
          name: i.deviceName || i.itemId,
          hoItemId: i.hoItemId || '-',
          hoStock: Number(i.hoStock) || 0,
          hoLastChecked: i.hoLastChecked || ''
        });
      });

      const filtered = rows.filter(r => {
        if (!q) return true;
        return r.name.toLowerCase().includes(q) || String(r.hoItemId).toLowerCase().includes(q) || String(r.id).toLowerCase().includes(q);
      });

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No groups or standalone items match your filter.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(r => {
        const draftVal = (state.hoReconcileDraft && state.hoReconcileDraft[r.key] !== undefined) ? state.hoReconcileDraft[r.key] : '';
        const typeTag = r.targetType === 'group' ? ` <span class="badge badge-blue" style="font-size:10px; margin-left:4px;">GROUP</span>` : '';
        return `
          <tr>
            <td class="font-medium">${escapeHtml(r.name)}${typeTag}</td>
            <td class="font-mono text-xs text-gray">${escapeHtml(r.hoItemId || '-')}</td>
            <td class="center font-semibold">${r.hoStock}</td>
            <td class="center">
              <input type="number" class="adj-input" min="0" value="${escapeHtml(String(draftVal))}" placeholder="—" oninput="onHoRecInput('${escapeHtml(r.key)}', this.value)">
            </td>
            <td class="center text-sm text-gray">${escapeHtml(formatDateDDMMYYYY(r.hoLastChecked))}</td>
          </tr>
        `;
      }).join('');
    }

    function submitHoReconciliationModal() {
      const userNick = (document.getElementById('ho-rec-user')?.value || '').trim();
      const recDate  = (document.getElementById('ho-rec-date')?.value || '').trim() || getToday();
      if (!userNick) {
        showToast('Please select User (Nickname)');
        return;
      }

      const draft = state.hoReconcileDraft || {};
      const items = [];
      Object.keys(draft).forEach(k => {
        const rawVal = draft[k];
        if (rawVal === '' || rawVal === null || rawVal === undefined) return;
        const num = Number(rawVal);
        if (isNaN(num) || num < 0) return;
        const parts = k.split('::');
        const targetType = parts[0];
        const id = parts.slice(1).join('::');
        if (id) items.push({ targetType, id, newHoStock: num });
      });

      if (items.length === 0) {
        showToast('Please enter New HO Stock for at least one row');
        return;
      }

      closeModal();
      setSyncIndicator(true);

      if (isApiConfigured()) {
        callApi('submitHoReconciliation', { user: userNick, date: recDate, items })
          .then(res => {
            setSyncIndicator(false);
            showToast(`HO Stock reconciled (${res.updatedCount || items.length} item(s))!`);
            fetchDataFromServer();
          })
          .catch(err => {
            setSyncIndicator(false);
            showToast('Failed: ' + (err.message || err));
          });
      } else {
        setSyncIndicator(false);
        const baseTxn = 'HOC-' + Date.now();
        items.forEach((entry, idx) => {
          const txnId = items.length > 1 ? `${baseTxn}-${idx + 1}` : baseTxn;
          if (entry.targetType === 'group') {
            const grp = (state.groups || []).find(g => String(g.groupId) === String(entry.id));
            if (grp) {
              const oldHo = Number(grp.hoStock) || 0;
              grp.hoStock = entry.newHoStock;
              grp.hoLastChecked = recDate;
              state.transactions.push({
                id: txnId,
                date: recDate,
                type: 'HO Check',
                hn: '',
                itemId: grp.groupId,
                qty: 0,
                fromLoc: '',
                toLoc: '',
                disease: '',
                procedure: '',
                shift: '',
                tech: userNick,
                complication: `HO Stock: ${oldHo} -> ${entry.newHoStock}`,
                contrast: ''
              });
            }
          } else {
            const inv = (state.inventory || []).find(i => String(i.itemId) === String(entry.id));
            if (inv) {
              const oldHo = Number(inv.hoStock) || 0;
              inv.hoStock = entry.newHoStock;
              inv.ownHoStock = entry.newHoStock;
              inv.hoLastChecked = recDate;
              state.transactions.push({
                id: txnId,
                date: recDate,
                type: 'HO Check',
                hn: '',
                itemId: inv.itemId,
                qty: 0,
                fromLoc: '',
                toLoc: '',
                disease: '',
                procedure: '',
                shift: '',
                tech: userNick,
                complication: `HO Stock: ${oldHo} -> ${entry.newHoStock}`,
                contrast: ''
              });
            }
          }
        });
        recalculateInventoryHierarchy();
        showToast(`HO Stock reconciled (${items.length} item(s)) (Mock)`);
        renderCurrentTab();
      }
    }

    // ════════════════════════════════════════════════════════════════
    // ANNOUNCEMENT BOARD (Dashboard Top Row)
    // ════════════════════════════════════════════════════════════════
    function renderAnnouncementsBoard() {
      const container = document.getElementById('dash-announcements-list');
      const countBadge = document.getElementById('dash-ann-count-badge');
      if (!container) return;

      const list = Array.isArray(state.announcements) ? state.announcements.slice() : [];
      list.sort((a, b) => (Number(a.priority) || 99) - (Number(b.priority) || 99));

      if (countBadge) countBadge.innerText = String(list.length);

      if (list.length === 0) {
        container.innerHTML = `<div class="empty-state text-sm" style="padding:12px;">${state.currentLang === 'th' ? 'ยังไม่มีประกาศสำคัญ คลิก "+ New Announcement" เพื่อเพิ่มบันทึกข้อตกลงหรือวิธีตัดของแถม' : 'No active announcements. Click "+ New Announcement" to post clinical or stock notes.'}</div>`;
        return;
      }

      container.innerHTML = `<div class="ann-list">` + list.map((ann, idx) => {
        const badgeType = String(ann.badge || 'Info').trim();
        const isCrit = badgeType.toLowerCase().includes('critical') || badgeType.includes('สำคัญ');
        const isWarn = badgeType.toLowerCase().includes('notice') || badgeType.includes('แจ้งเตือน');
        const itemCls = isCrit ? 'ann-item-critical' : (isWarn ? 'ann-item-notice' : 'ann-item-info');
        const badgeCls = isCrit ? 'ann-badge-critical' : (isWarn ? 'ann-badge-notice' : 'ann-badge-info');
        const badgeLabel = isCrit ? 'สำคัญ / Critical' : (isWarn ? 'แจ้งเตือน / Notice' : 'ทั่วไป / Info');

        return `
          <div class="ann-item ${itemCls}">
            <div style="flex:1; min-width:0;">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <span class="badge ${badgeCls}" style="font-size:10.5px;">#${idx + 1} · ${escapeHtml(badgeLabel)}</span>
                <strong class="text-sm" style="color:var(--gray-900);">${escapeHtml(ann.title || '')}</strong>
                ${ann.updatedAt ? `<span class="text-xs text-gray">(${escapeHtml(String(ann.updatedAt))})</span>` : ''}
              </div>
              <div class="text-xs" style="color:var(--gray-700); white-space:pre-wrap; line-height:1.5;">${escapeHtml(ann.content || '')}</div>
            </div>
            <div class="flex items-center gap-1" style="flex-shrink:0;">
              <button type="button" class="ann-reorder-btn" onclick="moveAnnouncement('${escapeHtml(ann.id)}', -1)" ${idx === 0 ? 'disabled' : ''} title="Move Up">▲</button>
              <button type="button" class="ann-reorder-btn" onclick="moveAnnouncement('${escapeHtml(ann.id)}', 1)" ${idx === list.length - 1 ? 'disabled' : ''} title="Move Down">▼</button>
              <button type="button" class="btn-ghost" onclick="openAnnouncementModal('${escapeHtml(ann.id)}')" title="Edit">${ICONS.edit}</button>
              <button type="button" class="btn-ghost" style="color:var(--red);" onclick="removeAnnouncement('${escapeHtml(ann.id)}')" title="Delete">${ICONS.trash}</button>
            </div>
          </div>
        `;
      }).join('') + `</div>`;
    }

    function openAnnouncementModal(annId) {
      const isEdit = Boolean(annId);
      const ann = isEdit ? (state.announcements || []).find(a => String(a.id) === String(annId)) : null;
      const titleEl = document.getElementById('modal-ann-title');
      if (titleEl) titleEl.innerText = isEdit ? 'Edit Announcement' : 'New Announcement';

      document.getElementById('ann-modal-id').value = ann ? ann.id : '';
      document.getElementById('ann-modal-title').value = ann ? (ann.title || '') : '';
      document.getElementById('ann-modal-badge').value = ann ? (ann.badge || 'Info') : 'Info';
      document.getElementById('ann-modal-priority').value = ann ? (ann.priority || 1) : ((state.announcements || []).length + 1);
      document.getElementById('ann-modal-content').value = ann ? (ann.content || '') : '';
      openModal('modal-announcement');
    }

    function saveAnnouncementModal() {
      const id = document.getElementById('ann-modal-id').value.trim();
      const title = document.getElementById('ann-modal-title').value.trim();
      const badge = document.getElementById('ann-modal-badge').value || 'Info';
      const priority = parseInt(document.getElementById('ann-modal-priority').value) || 1;
      const content = document.getElementById('ann-modal-content').value.trim();

      if (!title) {
        showToast('Please enter an Announcement Title');
        return;
      }

      const payload = { id, title, badge, priority, content };
      closeModal();

      if (isApiConfigured()) {
        setSyncIndicator(true);
        callApi('saveAnnouncement', payload)
          .then(() => {
            setSyncIndicator(false);
            showToast(id ? 'Announcement updated!' : 'Announcement created!');
            fetchDataFromServer();
          })
          .catch(err => {
            setSyncIndicator(false);
            showToast('Failed: ' + (err.message || err));
          });
      } else {
        if (!Array.isArray(state.announcements)) state.announcements = [];
        const nowStr = getToday();
        if (id) {
          const idx = state.announcements.findIndex(a => String(a.id) === String(id));
          if (idx >= 0) state.announcements[idx] = Object.assign({}, state.announcements[idx], payload, { updatedAt: nowStr });
        } else {
          state.announcements.push({
            id: 'ANN-' + Date.now().toString().slice(-6),
            title, badge, priority, content, updatedAt: nowStr
          });
        }
        renderAnnouncementsBoard();
        showToast(id ? 'Announcement updated (mock)' : 'Announcement created (mock)');
      }
    }

    function removeAnnouncement(annId) {
      const ann = (state.announcements || []).find(a => String(a.id) === String(annId));
      const label = ann ? ann.title : annId;
      verifyPasscodeThen(state.currentLang === 'th' ? `ยืนยันการลบประกาศ "${label}"?` : `Delete announcement "${label}"?`, () => {
        if (isApiConfigured()) {
          setSyncIndicator(true);
          callApi('deleteAnnouncement', { id: annId })
            .then(() => {
              setSyncIndicator(false);
              showToast('Announcement deleted');
              fetchDataFromServer();
            })
            .catch(err => {
              setSyncIndicator(false);
              showToast('Failed: ' + (err.message || err));
            });
        } else {
          state.announcements = (state.announcements || []).filter(a => String(a.id) !== String(annId));
          renderAnnouncementsBoard();
          showToast('Announcement deleted (mock)');
        }
      });
    }

    function moveAnnouncement(annId, dir) {
      if (!Array.isArray(state.announcements) || state.announcements.length < 2) return;
      state.announcements.sort((a, b) => (Number(a.priority) || 99) - (Number(b.priority) || 99));
      const idx = state.announcements.findIndex(a => String(a.id) === String(annId));
      if (idx === -1) return;
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= state.announcements.length) return;

      const tmp = state.announcements[idx];
      state.announcements[idx] = state.announcements[targetIdx];
      state.announcements[targetIdx] = tmp;

      const reorderItems = state.announcements.map((a, i) => {
        a.priority = i + 1;
        return { id: a.id, priority: a.priority };
      });

      renderAnnouncementsBoard();
      if (isApiConfigured()) {
        callApi('reorderAnnouncements', { items: reorderItems }).catch(err => console.error('Reorder failed:', err));
      }
    }

    // --- Tab 1: Dashboard ---
    function renderDashboard() {
      // 0. Top Row: Announcement Board
      renderAnnouncementsBoard();

      // 1. Priority 1: Substitution Quotas (Active items showing currentUsed / totalQuota)
      const quotaContainer = document.getElementById('dash-quota-list');
      const quotas = state.exchangeQuotas || [];
      const activeQuotas = quotas.filter(q => String(q.status || 'Active') === 'Active');
      const activeRemainingQuotas = activeQuotas.filter(q => {
        const total = Number(q.totalQuota) || 1;
        const used  = Number(q.currentUsed) || 0;
        return (total - used) > 0;
      });

      if (quotaContainer) {
        if (activeRemainingQuotas.length === 0) {
          quotaContainer.innerHTML = `<div class="empty-state text-sm" style="padding:16px;">No active substitution quotas.</div>`;
        } else {
          quotaContainer.innerHTML = activeRemainingQuotas.map(q => {
            const total = Number(q.totalQuota) || 1;
            const used  = Number(q.currentUsed) || 0;
            const physName = getDeviceName(q.physicalItemId);
            const subName  = getDeviceName(q.substitutedItemId);
            return `
              <div class="dash-item-row">
                <div class="min-w-0" style="flex:1;">
                  <div class="font-medium text-sm truncate" title="${escapeHtml(physName)}">${escapeHtml(physName)}</div>
                  <div class="text-xs text-gray truncate">${t('ex_substituted_item', 'sub for')} ${escapeHtml(subName)}</div>
                </div>
                <span class="badge badge-purple" style="font-size:12px; font-weight:700;">${used}/${total}</span>
              </div>
            `;
          }).join('');
        }
      }

      // 2. Priority 2: Loan & Transfer (Active pending/partial loans with remaining balance)
      const loanContainer = document.getElementById('dash-loan-list');
      const loanBadge = document.getElementById('dash-loan-badge');
      const loans = state.loans || [];
      const pendingLoans = loans.filter(l => {
        if (l.status === 'Fully Returned') return false;
        const tot = Number(l.totalQty) || 0;
        const ret = Number(l.returnedQty) || 0;
        return (tot - ret) > 0;
      });

      if (loanBadge) {
        loanBadge.innerText = `${pendingLoans.length} ${t('tr_pending', 'Pending')}`;
      }

      if (loanContainer) {
        if (pendingLoans.length === 0) {
          loanContainer.innerHTML = `<div class="empty-state text-sm" style="padding:16px;">${state.currentLang === 'th' ? 'ไม่มีรายการโอนย้ายค้างส่ง' : 'No pending loan or transfer returns.'}</div>`;
        } else {
          loanContainer.innerHTML = pendingLoans.map(l => {
            const tot = Number(l.totalQty) || 0;
            const ret = Number(l.returnedQty) || 0;
            const rem = Math.max(0, tot - ret);
            const isWeOwe = String(l.direction || '').includes('Inward') || String(l.direction || '').includes('We Borrowed');
            const dirBadge = isWeOwe
              ? `<span class="badge badge-amber" style="font-size:10px; padding:1px 6px;">${t('tr_borrowed', 'We Owe')}</span>`
              : `<span class="badge badge-blue" style="font-size:10px; padding:1px 6px;">${t('tr_lent', 'They Owe')}</span>`;
            const itemName = l.itemName || getDeviceName(l.itemId);

            return `
              <div class="dash-item-row">
                <div class="min-w-0" style="flex:1;">
                  <div class="font-medium text-sm truncate" title="${escapeHtml(itemName)}">${escapeHtml(itemName)}</div>
                  <div class="text-xs text-gray truncate" style="display:flex; align-items:center; gap:4px; margin-top:2px;">
                    ${dirBadge}
                    <span class="truncate">${escapeHtml(l.department || '')}</span>
                  </div>
                </div>
                <span class="badge ${isWeOwe ? 'badge-amber' : 'badge-blue'}" style="font-size:12px; font-weight:700;">${rem}</span>
              </div>
            `;
          }).join('');
        }
      }

      // 3. Priority 3: Contrast Media Stock (Remaining on-hand)
      const contrastContainer = document.getElementById('dash-contrast-list');
      const contrastBadge = document.getElementById('dash-contrast-badge');
      const contrastItems = (state.inventory || []).filter(i => String(i.category || '').trim().toLowerCase() === 'contrast media');

      if (contrastBadge) {
        contrastBadge.innerText = `${contrastItems.length} ${t('stock_total', 'Items')}`;
      }

      if (contrastContainer) {
        if (contrastItems.length === 0) {
          contrastContainer.innerHTML = `<div class="empty-state text-sm" style="padding:16px;">${state.currentLang === 'th' ? 'ไม่มีรายการสารทึบรังสีในคลัง' : 'No contrast media items in Inventory.'}</div>`;
        } else {
          contrastContainer.innerHTML = contrastItems.map(device => {
            const totalStock = Number(device.totalStock) || 0;
            let badgeCls = 'badge-ok';
            if (totalStock <= 0) {
              badgeCls = 'badge-low';
            } else if (totalStock < 5) {
              badgeCls = 'badge-amber';
            }
            return `
              <div class="dash-item-row">
                <span class="font-medium text-sm truncate" style="max-width:70%;" title="${escapeHtml(device.deviceName)}">${escapeHtml(device.deviceName)}</span>
                <span class="badge ${badgeCls}" style="font-size:12px; font-weight:700;">${totalStock} ${t('stock_on_hand', 'remain')}</span>
              </div>
            `;
          }).join('');
        }
      }

      // Current Date Helpers
      const now = new Date();
      const curMonth = now.getMonth();
      const curYear = now.getFullYear();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const curMonthName = monthNames[curMonth];

      const monthLabelEl = document.getElementById('dash-month-label');
      if (monthLabelEl) monthLabelEl.innerText = `(${curMonthName} ${curYear})`;
      const yearLabelEl = document.getElementById('dash-year-label');
      if (yearLabelEl) yearLabelEl.innerText = `(${curYear})`;
      const procMonthLabelEl = document.getElementById('dash-proc-month-label');
      if (procMonthLabelEl) procMonthLabelEl.innerText = `(${curMonthName} ${curYear})`;

      // 4A. Priority 4A: Total Cases Current Month
      const monthCasesBody = document.getElementById('dash-month-case-body');
      const casesBadge = document.getElementById('dash-cases-badge');

      // Tally unique cases in current month
      const monthCasesMap = new Map(); // key = hn + '|' + date
      let inTimeCases = 0;
      let onCallCases = 0;
      let otherShiftCases = 0;

      // Group procedure types in current month
      const monthProcCounts = {};

      (state.transactions || []).forEach(t => {
        if (t.type === 'Procedure Use' && t.date) {
          const td = new Date(t.date);
          if (td.getMonth() === curMonth && td.getFullYear() === curYear) {
            const caseKey = (t.hn || '') + '|' + formatDate(t.date);
            if (!monthCasesMap.has(caseKey)) {
              monthCasesMap.set(caseKey, {
                shift: t.shift || '',
                disease: t.disease || '',
                procedures: new Set()
              });
              const sh = String(t.shift || '').toLowerCase();
              if (sh.includes('in-time') || sh.includes('intime') || sh.includes('regular')) {
                inTimeCases++;
              } else if (sh.includes('on-call') || sh.includes('oncall')) {
                onCallCases++;
              } else {
                otherShiftCases++;
              }
            }

            const cData = monthCasesMap.get(caseKey);
            // Collect procedure types (can be multiple separated by comma)
            const pTypes = String(t.procedure || '').split(',').map(s => s.trim()).filter(Boolean);
            pTypes.forEach(p => {
              cData.procedures.add(p);
            });
          }
        }
      });

      const totalMonthCases = monthCasesMap.size;
      if (casesBadge) casesBadge.innerText = `${totalMonthCases} Cases`;

      // Aggregate procedure counts across current month cases
      monthCasesMap.forEach(c => {
        c.procedures.forEach(p => {
          monthProcCounts[p] = (monthProcCounts[p] || 0) + 1;
        });
      });

      if (monthCasesBody) {
        monthCasesBody.innerHTML = `
          <div class="flex items-center justify-between" style="padding:4px 0 12px; border-bottom:1px solid var(--gray-100);">
            <div>
              <div class="text-xs text-gray font-semibold uppercase tracking-wider">${curMonthName} ${curYear}</div>
              <div style="font-size:32px; font-weight:800; color:var(--brand); line-height:1.1; margin-top:2px;">
                ${totalMonthCases} <span style="font-size:15px; font-weight:600; color:var(--gray-600);">Cases Logged</span>
              </div>
            </div>
            <div class="text-right">
              <span class="badge badge-blue" style="font-size:12px; font-weight:700; padding:4px 10px;">${monthCasesMap.size} Clinical Cases</span>
            </div>
          </div>
          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin-top:12px;">
            <div style="background:var(--gray-50); border:1px solid var(--gray-200); border-radius:6px; padding:8px 6px; text-align:center;">
              <div class="text-xs text-gray font-medium">In-time Shift</div>
              <div style="font-size:18px; font-weight:700; color:var(--blue); margin-top:2px;">${inTimeCases}</div>
            </div>
            <div style="background:var(--gray-50); border:1px solid var(--gray-200); border-radius:6px; padding:8px 6px; text-align:center;">
              <div class="text-xs text-gray font-medium">On-call Shift</div>
              <div style="font-size:18px; font-weight:700; color:var(--brand-dark); margin-top:2px;">${onCallCases}</div>
            </div>
            <div style="background:var(--gray-50); border:1px solid var(--gray-200); border-radius:6px; padding:8px 6px; text-align:center;">
              <div class="text-xs text-gray font-medium">SMC / Other</div>
              <div style="font-size:18px; font-weight:700; color:#d97706; margin-top:2px;">${otherShiftCases}</div>
            </div>
          </div>
        `;
      }

      // 4B. Priority 4B: Disease in Current Year in Piechart (SVG Donut Chart + Legend)
      const diseaseChartBody = document.getElementById('dash-disease-chart-body');
      const yearBadge = document.getElementById('dash-year-badge');

      const yearCasesMap = new Map();
      (state.transactions || []).forEach(t => {
        if (t.type === 'Procedure Use' && t.date) {
          const td = new Date(t.date);
          if (td.getFullYear() === curYear) {
            const caseKey = (t.hn || '') + '|' + formatDate(t.date);
            if (!yearCasesMap.has(caseKey)) {
              yearCasesMap.set(caseKey, t.disease || 'Unspecified');
            }
          }
        }
      });

      const totalYearCases = yearCasesMap.size;
      if (yearBadge) yearBadge.innerText = `${totalYearCases} Cases`;

      if (diseaseChartBody) {
        if (totalYearCases === 0) {
          diseaseChartBody.innerHTML = `<div class="empty-state text-sm" style="padding:24px;">No procedure records logged in ${curYear}.</div>`;
        } else {
          // Count by disease
          const diseaseCounts = {};
          yearCasesMap.forEach(d => {
            const cleanD = (d || 'Unspecified').trim();
            diseaseCounts[cleanD] = (diseaseCounts[cleanD] || 0) + 1;
          });

          const sortedDiseases = Object.keys(diseaseCounts)
            .sort((a, b) => diseaseCounts[b] - diseaseCounts[a]);

          const PALETTE = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#6366f1', '#ef4444', '#14b8a6', '#84cc16'];
          
          // Generate SVG Donut Chart
          // Radius r = 62, Circumference = 2 * PI * 62 = 389.56
          const r = 62;
          const circum = 2 * Math.PI * r;
          let offsetAcc = 0;

          const svgSlices = sortedDiseases.map((dName, idx) => {
            const count = diseaseCounts[dName];
            const frac = count / totalYearCases;
            const strokeDash = `${(frac * circum).toFixed(2)} ${circum.toFixed(2)}`;
            const strokeOffset = (-offsetAcc).toFixed(2);
            offsetAcc += frac * circum;
            const color = PALETTE[idx % PALETTE.length];
            return `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${color}" stroke-width="32" stroke-dasharray="${strokeDash}" stroke-dashoffset="${strokeOffset}" stroke-linecap="butt" transform="rotate(-90 100 100)"><title>${escapeHtml(dName)}: ${count} (${Math.round(frac * 100)}%)</title></circle>`;
          }).join('');

          const legendHtml = sortedDiseases.map((dName, idx) => {
            const count = diseaseCounts[dName];
            const pct = Math.round((count / totalYearCases) * 100);
            const color = PALETTE[idx % PALETTE.length];
            return `
              <div class="flex items-center justify-between text-xs py-1" style="border-bottom:1px solid var(--gray-100);">
                <div class="flex items-center gap-2 truncate" style="max-width:70%;">
                  <span style="width:10px; height:10px; border-radius:50%; background:${color}; flex-shrink:0; display:inline-block;"></span>
                  <span class="truncate font-medium" title="${escapeHtml(dName)}">${escapeHtml(dName)}</span>
                </div>
                <div class="font-semibold text-right" style="white-space:nowrap;">
                  <span>${count}</span> <span class="text-gray font-normal">(${pct}%)</span>
                </div>
              </div>
            `;
          }).join('');

          diseaseChartBody.innerHTML = `
            <div class="flex items-center gap-4 flex-wrap" style="justify-content:center;">
              <div style="width:170px; height:170px; flex-shrink:0; position:relative;">
                <svg viewBox="0 0 200 200" style="width:100%; height:100%; display:block;">
                  <circle cx="100" cy="100" r="${r}" fill="none" stroke="var(--gray-100)" stroke-width="32"></circle>
                  ${svgSlices}
                  <text x="100" y="96" text-anchor="middle" font-size="22" font-weight="800" fill="var(--black)">${totalYearCases}</text>
                  <text x="100" y="114" text-anchor="middle" font-size="11" font-weight="600" fill="var(--gray-500)">${curYear} CASES</text>
                </svg>
              </div>
              <div style="flex:1; min-width:180px; max-height:190px; overflow-y:auto;">
                ${legendHtml}
              </div>
            </div>
          `;
        }
      }

      // 4C. Priority 4C: Procedure Types in Current Month (Horizontal Bar Chart)
      const procsChartBody = document.getElementById('dash-procedures-chart-body');
      const procsBadge = document.getElementById('dash-procs-badge');

      const sortedProcs = Object.keys(monthProcCounts)
        .sort((a, b) => monthProcCounts[b] - monthProcCounts[a]);

      if (procsBadge) {
        procsBadge.innerText = `${sortedProcs.length} Procedure Types`;
      }

      if (procsChartBody) {
        if (sortedProcs.length === 0) {
          procsChartBody.innerHTML = `<div class="empty-state text-sm" style="padding:24px;">No procedure records logged in ${curMonthName} ${curYear}.</div>`;
        } else {
          const BAR_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#6366f1'];

          procsChartBody.innerHTML = sortedProcs.map((pName, idx) => {
            const count = monthProcCounts[pName];
            const pct = Math.min(100, Math.round((count / Math.max(1, totalMonthCases)) * 100));
            const barColor = BAR_COLORS[idx % BAR_COLORS.length];
            return `
              <div style="margin-bottom:12px;">
                <div class="flex justify-between items-center text-xs font-semibold mb-1">
                  <span class="truncate" style="max-width:75%;" title="${escapeHtml(pName)}">
                    <span class="text-xs text-gray font-normal" style="margin-right:4px;">#${idx + 1}</span>${escapeHtml(pName)}
                  </span>
                  <span style="color:var(--gray-700);">${count} cases <span class="text-gray font-normal">(${pct}%)</span></span>
                </div>
                <div class="progress-track" style="height:7px; background:var(--gray-200); border-radius:99px; overflow:hidden;">
                  <div class="progress-fill" style="width:${pct}%; background:${barColor}; height:100%; border-radius:99px; transition:width 0.3s ease;"></div>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    }

    // --- Tab 2: Transactions ---
    function formatTxType(type) {
      if (type === 'Procedure Use') return t('nav_procedure', 'Procedure Use');
      if (type === 'Stock In') return state.currentLang === 'th' ? 'นำเข้า' : 'Stock In';
      if (type === 'Stock Out') return state.currentLang === 'th' ? 'จ่ายออก' : 'Stock Out';
      if (type === 'Adjustment') return t('btn_adjustment', 'Adjustment');
      if (type === 'HO Check') return state.currentLang === 'th' ? 'กระทบยอด HO' : 'HO Check';
      if (type === 'Add Device') return state.currentLang === 'th' ? 'เพิ่มอุปกรณ์' : 'Add Device';
      if (type === 'Edit Device') return state.currentLang === 'th' ? 'แก้ไขอุปกรณ์' : 'Edit Device';
      return type;
    }

    function formatLoc(loc) {
      if (!loc) return '';
      if (loc === 'Main') return t('stock_main', 'Main Stock');
      if (loc === 'Retail') return t('stock_retail', 'Retail Stock');
      if (loc === 'Buffer') return t('stock_buffer', 'Buffer Stock');
      return loc;
    }

    function renderTransactions() {
      const typeFilter = document.getElementById('tx-filter-type').value;
      const searchFilter = document.getElementById('tx-filter-search').value.toLowerCase();
      const body = document.getElementById('tx-table-body');

      const filtered = state.transactions.filter(t => {
        const matchesType = !typeFilter || t.type === typeFilter;
        const devName = getDeviceName(t.itemId).toLowerCase();
        const matchesSearch = !searchFilter || 
          (t.hn || '').toLowerCase().includes(searchFilter) || 
          (t.tech || '').toLowerCase().includes(searchFilter) ||
          (t.complication || '').toLowerCase().includes(searchFilter) ||
          devName.includes(searchFilter);
        return matchesType && matchesSearch;
      }).reverse(); // Newest first

      body.innerHTML = filtered.map(t => {
        const typeColor = t.type === 'Procedure Use' ? 'var(--red)'
          : t.type === 'Stock In' ? 'var(--brand)'
          : t.type === 'HO Check' ? '#7c3aed'
          : (t.type === 'Add Device' || t.type === 'Edit Device') ? '#d97706'
          : 'var(--blue)';
        const detailPrimary = t.hn ? escapeHtml(t.hn) : (t.complication ? `<span class="text-xs">${escapeHtml(t.complication)}</span>` : '');
        const detailSub = t.procedure ? `<span class="text-xs text-gray" style="display:block;">${escapeHtml(t.procedure)}</span>` : '';
        const userTag = t.tech ? `<span class="text-xs text-gray" style="display:block;">User: <strong>${escapeHtml(t.tech)}</strong></span>` : '';
        const locStr = `${formatLoc(t.fromLoc)}${t.toLoc ? ' → ' + formatLoc(t.toLoc) : ''}` || '—';
        return `
        <tr>
          <td>${formatDate(t.date)}</td>
          <td class="font-medium" style="color:${typeColor}">${formatTxType(t.type)}</td>
          <td>${detailPrimary}${detailSub}${userTag}</td>
          <td>${escapeHtml(getDeviceName(t.itemId))}</td>
          <td class="num font-bold">${t.qty}</td>
          <td class="text-gray text-sm">${locStr}</td>
          <td class="center"><button class="btn-ghost" onclick="handleDeleteTx('${t.id}')" style="color:var(--red);" title="${t('btn_delete', 'Delete')}">${ICONS.trash}</button></td>
        </tr>
      `;
      }).join('');
    }

    function handleDeleteTx(txId) {
      verifyPasscodeThen(state.currentLang === 'th' ? `ยืนยันการลบรายการ ${txId}?` : `Delete transaction ${txId}?`, async () => {
        appLoading.classList.remove('hidden');
        appContent.classList.add('hidden');
        
        if (isApiConfigured()) {
          try {
            await callApi('deleteTransaction', { transactionId: txId });
            showToast('Deleted!');
            fetchDataFromServer();
          } catch (err) {
            showToast('Failed to delete: ' + (err.message || err));
            appLoading.classList.add('hidden');
            appContent.classList.remove('hidden');
          }
        } else {
          state.transactions = state.transactions.filter(t => t.id !== txId);
          (state.exchangeQuotas || []).forEach(q => {
            if (Array.isArray(q.history)) {
              q.history = q.history.filter(h => String(h.txnId) !== String(txId));
              q.usedPieces = getQuotaUsedPieces(q);
              q.currentUsed = q.usedPieces.length;
              if (q.currentUsed < (Number(q.totalQuota) || 0) && q.status === 'Completed') {
                q.status = 'Active';
              }
            }
          });
          showToast('Deleted (mock)');
          appLoading.classList.add('hidden');
          appContent.classList.remove('hidden');
          renderTransactions();
        }
      });
    }

    // --- Tab 3: Procedure Use ---
    function getUsersList() {
      if (state.settings && Array.isArray(state.settings.users) && state.settings.users.length > 0) {
        return state.settings.users;
      }
      if (state.settings && Array.isArray(state.settings.techs) && state.settings.techs.length > 0) {
        return state.settings.techs;
      }
      return [];
    }

    function getShiftsList() {
      if (state.settings && Array.isArray(state.settings.shifts) && state.settings.shifts.length > 0) {
        return state.settings.shifts;
      }
      return ['In-time', 'On-call', 'SMC'];
    }

    function updateProcCountBadge() {
      const countEl = document.getElementById('proc-procedure-count');
      if (!countEl) return;
      const cnt = document.querySelectorAll('#proc-procedures-list input[type="checkbox"]:checked').length;
      countEl.innerText = `${cnt} selected`;
      countEl.style.color = cnt > 0 ? 'var(--brand)' : 'var(--gray-500)';
    }

    function updateProcEditCountBadge() {
      const countEl = document.getElementById('proc-edit-procedure-count');
      if (!countEl) return;
      const cnt = document.querySelectorAll('#proc-edit-procedures-list input[type="checkbox"]:checked').length;
      countEl.innerText = `${cnt} selected`;
      countEl.style.color = cnt > 0 ? 'var(--brand)' : 'var(--gray-500)';
    }

    function renderProcedureTab() {
      // 1. Populate Dropdowns while preserving current selections
      const diseaseSelect = document.getElementById('proc-disease');
      const curDisease = diseaseSelect ? diseaseSelect.value : '';
      if (diseaseSelect) {
        diseaseSelect.innerHTML = `<option value="">-- Select Disease --</option>` + 
          (state.settings.diseases || []).map(d => `<option value="${d}" ${d === curDisease ? 'selected' : ''}>${d}</option>`).join('');
      }

      // Populate Procedure Type Checkboxes (supporting multiple selections)
      const procContainer = document.getElementById('proc-procedures-list');
      if (procContainer) {
        const checkedProcs = new Set(Array.from(procContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value));
        const procs = (state.settings && Array.isArray(state.settings.procedures)) ? state.settings.procedures : [];
        if (procs.length === 0) {
          procContainer.innerHTML = '<div class="text-xs text-gray" style="padding:4px;">No procedures configured in Settings.</div>';
        } else {
          procContainer.innerHTML = procs.map(p => {
            const isChecked = checkedProcs.has(p) ? 'checked' : '';
            return `<label><input type="checkbox" name="proc-procedure-cb" value="${escapeHtml(p)}" ${isChecked} onchange="updateProcCountBadge()"> <span>${escapeHtml(p)}</span></label>`;
          }).join('');
        }
        updateProcCountBadge();
      }

      const shiftSelect = document.getElementById('proc-shift');
      const curShift = shiftSelect ? shiftSelect.value : '';
      const shiftsList = getShiftsList();
      if (shiftSelect) {
        shiftSelect.innerHTML = shiftsList.map(s => `<option value="${s}" ${s === curShift ? 'selected' : ''}>${s}</option>`).join('');
      }

      // Techs checkboxes (preserve checked state, using unified Nicknames)
      const techContainer = document.getElementById('proc-techs');
      const checkedTechs = new Set(Array.from(techContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value));
      const users = getUsersList();
      if (users.length === 0) {
        techContainer.innerHTML = '<div class="text-xs text-gray" style="padding:4px;">No users configured in Settings.</div>';
      } else {
        techContainer.innerHTML = users.map(u => {
          const nick = String(u.nickname || u.name || '').trim();
          const isChecked = checkedTechs.has(nick) ? 'checked' : '';
          return `<label><input type="checkbox" name="proc-tech-cb" value="${escapeHtml(nick)}" ${isChecked}> <span>${escapeHtml(nick)}</span></label>`;
        }).join('');
      }

      // Populate Device Category dropdown (preserve selected category)
      const catSelect = document.getElementById('proc-device-cat');
      const curCat = catSelect ? catSelect.value : '';
      const allCats = getAllCategories();
      if (catSelect) {
        catSelect.innerHTML = `<option value="">All Categories</option>` +
          allCats.map(c => `<option value="${c}" ${c === curCat ? 'selected' : ''}>${c}</option>`).join('');
      }

      // 2. Render Search Results
      renderProcDeviceResults();

      // 3. Render Cart
      renderCart();

      // 4. Refresh Procedure History if open
      const histCard = document.getElementById('proc-history-card');
      if (histCard && !histCard.classList.contains('hidden')) {
        renderProcHistory();
      }
    }

    function getActiveExchangeRule(itemId) {
      if (!state.exchangeQuotas || !Array.isArray(state.exchangeQuotas)) return null;
      return state.exchangeQuotas.find(q =>
        String(q.physicalItemId) === String(itemId) &&
        String(q.status || 'Active') === 'Active' &&
        (Number(q.currentUsed) || 0) < (Number(q.totalQuota) || 0)
      ) || null;
    }

    function getQuotaUsedPieces(q) {
      if (!q) return [];
      if (Array.isArray(q.usedPieces) && q.usedPieces.length > 0) {
        return q.usedPieces.slice().map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
      }
      const hist = Array.isArray(q.history) ? q.history : [];
      const pieces = [];
      hist.forEach(h => {
        if (h && h.pieceNo !== undefined && h.pieceNo !== null && h.pieceNo !== '') {
          const p = Number(h.pieceNo);
          if (!isNaN(p) && !pieces.includes(p)) pieces.push(p);
        }
      });
      return pieces.sort((a, b) => a - b);
    }

    function getQuotaAvailablePieces(q) {
      if (!q) return [];
      const total = Number(q.totalQuota) || 0;
      const used = getQuotaUsedPieces(q);
      const avail = [];
      for (let k = 1; k <= total; k++) {
        if (!used.includes(k)) avail.push(k);
      }
      return avail;
    }

    function getExchangeRuleForEdit(itemId) {
      if (!state.exchangeQuotas || !Array.isArray(state.exchangeQuotas)) return null;
      const active = state.exchangeQuotas.find(q =>
        String(q.physicalItemId) === String(itemId) &&
        String(q.status || 'Active') === 'Active'
      );
      if (active) return active;
      return state.exchangeQuotas.find(q => String(q.physicalItemId) === String(itemId)) || null;
    }

    function getQuotaAvailablePiecesForEdit(q, currentPieceNo) {
      if (!q) return [];
      const total = Number(q.totalQuota) || 0;
      const used = getQuotaUsedPieces(q);
      const avail = [];
      const curP = (currentPieceNo !== undefined && currentPieceNo !== null && currentPieceNo !== '') ? Number(currentPieceNo) : null;
      for (let k = 1; k <= total; k++) {
        if (!used.includes(k) || (curP && k === curP)) {
          avail.push(k);
        }
      }
      return avail.sort((a, b) => a - b);
    }

    function formatPiecesList(pieces) {
      if (!pieces || pieces.length === 0) return '—';
      return pieces.join(', ');
    }

    function isConsignmentOnlyItem(item) {
      if (!item) return false;
      const cat = String(item.category || '').trim().toLowerCase();
      if (cat === 'consignment' || cat === 'quarantine' || cat === 'buffer') return true;
      // If item has 0 Main and 0 Retail stock, and only has Buffer stock from an active Consignment Hold, lock it from Procedure Use
      const main = Number(item.mainStock) || 0;
      const retail = Number(item.retailStock) || 0;
      const buffer = Number(item.bufferStock) || 0;
      if (main <= 0 && retail <= 0 && buffer > 0) {
        const hasActiveHold = (state.consignments || []).some(c => String(c.itemId) === String(item.itemId) && c.status === 'Holding');
        if (hasActiveHold) return true;
      }
      return false;
    }

    function renderProcDeviceResults() {
      const searchEl = document.getElementById('proc-device-search');
      const catEl = document.getElementById('proc-device-cat');
      const searchVal = searchEl ? searchEl.value.toLowerCase().trim() : '';
      const catVal = catEl ? catEl.value.toLowerCase().trim() : '';
      const resultsContainer = document.getElementById('proc-device-results');
      if (!resultsContainer) return;

      const filtered = state.inventory.filter(i => {
        // Strict Hierarchy Rule: Parent Device Groups cannot be deducted directly in Procedure Use
        if (i.isParent) return false;
        // Module 3 Rule: Consignment & Vendor Quarantine Hold items in Buffer are locked/hidden from Procedure Use
        if (isConsignmentOnlyItem(i)) return false;
        if (catVal && String(i.category || '').toLowerCase() !== catVal) return false;
        if (!searchVal) return true;
        return String(i.deviceName || '').toLowerCase().includes(searchVal) ||
               String(i.category || '').toLowerCase().includes(searchVal) ||
               String(i.itemId || '').toLowerCase().includes(searchVal);
      });

      resultsContainer.innerHTML = filtered.map(i => {
        const retail = Number(i.retailStock) || 0;
        const main = Number(i.mainStock) || 0;
        const oosText = t('stock_out_of_stock', 'Out of stock');
        const mainLabel = t('stock_main', 'Main Stock');
        const retailLabel = t('stock_retail', 'Retail Stock');
        const addLabel = t('btn_add_device', 'Add');
        const retailBadge = retail <= 0
          ? `<span style="color:var(--red); font-weight:600;">${retailLabel}: ${retail} (${oosText})</span>`
          : `${retailLabel}: <strong>${retail}</strong>`;
        const freeBadgeHtml = i.isFreeItem ? ` <span class="badge-free">FREE</span>` : '';
        const exRule = getActiveExchangeRule(i.itemId);
        const exBadgeHtml = exRule
          ? `<div style="margin-top:4px;"><span class="badge badge-purple">${t('ex_substituted_item', 'Substituted for')} ${getDeviceName(exRule.substitutedItemId)} [Quota: ${exRule.currentUsed}/${exRule.totalQuota}]</span></div>`
          : '';
        return `
          <div class="flex justify-between items-center" style="padding:8px 12px; border-bottom:1px solid var(--gray-100);">
            <div>
              <div class="font-medium text-sm">${i.deviceName}${freeBadgeHtml}</div>
              <div class="text-xs text-gray">${i.category || 'Uncategorized'} · ${mainLabel}: ${main} · ${retailBadge}</div>
              ${exBadgeHtml}
            </div>
            <button class="btn btn-outline btn-sm" onclick="addToCart('${escapeHtml(String(i.itemId))}', '${escapeHtml(String(i.deviceName))}')">${ICONS.plus} ${addLabel}</button>
          </div>
        `;
      }).join('');
      if (filtered.length === 0) {
        resultsContainer.innerHTML = '<div class="empty-state text-sm">No devices found in this category</div>';
      }
    }

    function escapeHtml(str) {
      return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    function setCartVolume(idx, val) {
      if (!state.cart[idx]) return;
      state.cart[idx].volumeMl = parseFloat(val) || '';
    }

    function setCartPieceNo(idx, val) {
      if (!state.cart[idx]) return;
      state.cart[idx].pieceNo = parseInt(val) || '';
    }

    function addToCart(itemId, deviceName) {
      const inv = state.inventory.find(i => String(i.itemId) === String(itemId));
      if (inv && inv.isParent) {
        showToast('Cannot deduct stock directly from a Parent Device Group. Please select a Child Sub-Device.');
        return;
      }
      const isContrast = inv && String(inv.category || '').toLowerCase().includes('contrast');
      const exRule = getActiveExchangeRule(itemId);
      let defaultPieceNo = '';
      if (exRule) {
        const avail = getQuotaAvailablePieces(exRule);
        if (avail.length > 0) defaultPieceNo = avail[0];
      }

      const exist = state.cart.find(c => String(c.itemId) === String(itemId));
      if (exist) {
        exist.qty++;
      } else {
        state.cart.push({
          itemId,
          deviceName,
          qty: 1,
          fromLoc: 'Retail',
          isContrast: !!isContrast,
          volumeMl: '',
          pieceNo: defaultPieceNo
        });
      }
      renderCart();
    }

    function renderCart() {
      const container = document.getElementById('cart-items-container');
      const totalItems = state.cart.reduce((s, c) => s + (Number(c.qty) || 0), 0);
      const countEl = document.getElementById('cart-count');
      if (countEl) countEl.innerText = state.cart.length + ' items';
      const mobCountEl = document.getElementById('mobile-cart-count');
      if (mobCountEl) mobCountEl.innerText = totalItems;

      if (state.cart.length === 0) {
        container.innerHTML = `<div class="empty-state">No items selected yet. Add from the left panel.</div>`;
        return;
      }

      container.innerHTML = state.cart.map((ci, idx) => {
        const inv = state.inventory.find(i => String(i.itemId) === String(ci.itemId));
        const retail = inv ? (Number(inv.retailStock) || 0) : 0;
        const warn = retail <= 0 || (retail - ci.qty < 0);
        const isContrast = ci.isContrast || (inv && String(inv.category || '').toLowerCase().includes('contrast'));
        const exRule = getActiveExchangeRule(ci.itemId);
        const freeBadgeHtml = (inv && inv.isFreeItem) || ci.isFreeItem ? ' <span class="badge-free">FREE</span>' : '';

        // 1. Substituted Item Layout
        if (exRule) {
          const availPieces = getQuotaAvailablePieces(exRule);
          if (!ci.pieceNo && availPieces.length > 0) {
            ci.pieceNo = availPieces[0];
          } else if (ci.pieceNo && !availPieces.includes(Number(ci.pieceNo)) && availPieces.length > 0) {
            ci.pieceNo = availPieces[0];
          }

          const targetName = getDeviceName(exRule.substitutedItemId);
          const quotaText = `Substituted for ${escapeHtml(targetName)} [Quota: ${exRule.currentUsed}/${exRule.totalQuota}]`;

          const pieceOptionsHtml = availPieces.length > 0
            ? availPieces.map(p => `<option value="${p}" ${String(ci.pieceNo) === String(p) ? 'selected' : ''}>Piece #${p} of ${exRule.totalQuota}</option>`).join('')
            : '<option value="">No quota available</option>';

          return `
            <div class="cart-item">
              <div class="cart-item-header">
                <span class="cart-item-title truncate" title="${escapeHtml(ci.deviceName)}">${escapeHtml(ci.deviceName)}${freeBadgeHtml}</span>
                <button class="btn-ghost cart-item-remove" onclick="removeFromCart(${idx})" title="Remove">✕</button>
              </div>
              <div class="cart-sub-notice">
                ${quotaText}
              </div>
              <div class="cart-controls-row">
                <span class="badge ${warn ? 'badge-low' : 'badge-ok'} cart-stock-badge ${warn ? 'stock-low' : 'stock-ok'}" title="Available Retail: ${retail}">Retail (${retail})</span>
                <div class="cart-piece-control">
                  <label class="cart-control-label">Piece No:</label>
                  <select class="form-select cart-piece-select" onchange="setCartPieceNo(${idx}, this.value)">
                    ${pieceOptionsHtml}
                  </select>
                </div>
                <div class="qty-control">
                  <button onclick="updateCartQty(${idx}, -1)">−</button>
                  <input type="number" value="${ci.qty}" onchange="setCartQty(${idx}, this.value)">
                  <button onclick="updateCartQty(${idx}, 1)">+</button>
                </div>
              </div>
            </div>
          `;
        }

        // 2. Contrast Media Category Card Layout
        if (isContrast) {
          return `
            <div class="cart-item">
              <div class="cart-item-header">
                <span class="cart-item-title truncate" title="${escapeHtml(ci.deviceName)}">${escapeHtml(ci.deviceName)}${freeBadgeHtml}</span>
                <button class="btn-ghost cart-item-remove" onclick="removeFromCart(${idx})" title="Remove">✕</button>
              </div>
              <div class="cart-controls-row">
                <span class="badge ${warn ? 'badge-low' : 'badge-ok'} cart-stock-badge ${warn ? 'stock-low' : 'stock-ok'}" title="Available Retail: ${retail}">Retail (${retail})</span>
                <div class="cart-contrast-fields">
                  <div class="cart-field-group">
                    <label class="cart-control-label">Volume (ml) <span style="color:var(--red);">*</span></label>
                    <input type="number" step="any" min="1" placeholder="e.g. 50" value="${ci.volumeMl || ''}" oninput="setCartVolume(${idx}, this.value)" class="form-input cart-vol-input" required>
                  </div>
                  <div class="cart-field-group">
                    <label class="cart-control-label">Quantity (ขวด) <span style="color:var(--red);">*</span></label>
                    <input type="number" min="1" value="${ci.qty || 1}" onchange="setCartQty(${idx}, this.value)" class="form-input cart-qty-input" required>
                  </div>
                </div>
              </div>
            </div>
          `;
        }

        // 3. Standard Item Layout
        return `
          <div class="cart-item">
            <div class="cart-item-header">
              <span class="cart-item-title truncate" title="${escapeHtml(ci.deviceName)}">${escapeHtml(ci.deviceName)}${freeBadgeHtml}</span>
              <button class="btn-ghost cart-item-remove" onclick="removeFromCart(${idx})" title="Remove">✕</button>
            </div>
            <div class="cart-controls-row">
              <span class="badge ${warn ? 'badge-low' : 'badge-ok'} cart-stock-badge ${warn ? 'stock-low' : 'stock-ok'}" title="Available Retail: ${retail}">Retail (${retail})</span>
              <div class="qty-control">
                <button onclick="updateCartQty(${idx}, -1)">−</button>
                <input type="number" value="${ci.qty}" onchange="setCartQty(${idx}, this.value)">
                <button onclick="updateCartQty(${idx}, 1)">+</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function removeFromCart(idx) {
      state.cart.splice(idx, 1);
      renderCart();
    }
    function updateCartLoc(idx, val) {
      state.cart[idx].fromLoc = val;
    }
    function updateCartQty(idx, delta) {
      state.cart[idx].qty = Math.max(1, state.cart[idx].qty + delta);
      renderCart();
    }
    function setCartQty(idx, val) {
      state.cart[idx].qty = Math.max(1, parseInt(val) || 1);
      renderCart();
    }

    // --- Procedure History (Search, View, Edit, Print) ---
    function getProcedureGroups() {
      const map = new Map();
      state.transactions.forEach(t => {
        if (t.type !== 'Procedure Use') return;
        const key = t.id || `${t.date}|${t.hn}|${t.procedure}`;
        if (!map.has(key)) {
          map.set(key, {
            id: t.id,
            date: t.date || '',
            hn: t.hn || '',
            disease: t.disease || '',
            procedure: t.procedure || '',
            shift: t.shift || '',
            tech: t.tech || '',
            complication: t.complication || '',
            contrast: t.contrast || '',
            items: []
          });
        }
        const g = map.get(key);
        if (t.itemId && Number(t.qty) > 0) {
          const existingItem = g.items.find(it => String(it.itemId) === String(t.itemId));
          if (existingItem) {
            existingItem.qty += Number(t.qty) || 0;
            if (!existingItem.pieceNo && t.pieceNo) existingItem.pieceNo = t.pieceNo;
            if (!existingItem.volumeMl && t.volumeMl) existingItem.volumeMl = t.volumeMl;
          } else {
            const devName = getDeviceName(t.itemId);
            const devCat = getDeviceCategory(t.itemId);
            const isContrast = String(devCat || '').toLowerCase().includes('contrast');

            // Find pieceNo if recorded in exchangeQuotas
            let pNo = t.pieceNo || '';
            if (!pNo) {
              for (const q of (state.exchangeQuotas || [])) {
                if (String(q.physicalItemId) === String(t.itemId)) {
                  const hist = Array.isArray(q.history) ? q.history : [];
                  const match = hist.find(h => String(h.txnId) === String(t.id));
                  if (match && match.pieceNo !== undefined && match.pieceNo !== null && match.pieceNo !== '') {
                    pNo = match.pieceNo;
                    break;
                  }
                }
              }
            }

            // Find volumeMl from contrast string or t.volumeMl
            let vol = t.volumeMl || '';
            if (!vol && t.contrast && isContrast) {
              const safeName = devName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const nameMatch = String(t.contrast).match(new RegExp(safeName + '\\s*\\((\\d+(?:\\.\\d+)?)\\s*ml', 'i'));
              if (nameMatch) {
                vol = nameMatch[1];
              } else {
                const genericMatch = String(t.contrast).match(/(\d+(?:\.\d+)?)\s*ml/i);
                if (genericMatch) vol = genericMatch[1];
              }
            }

            g.items.push({
              itemId: t.itemId,
              deviceName: devName,
              category: devCat,
              qty: Number(t.qty) || 0,
              pieceNo: pNo,
              volumeMl: vol,
              isContrast: isContrast
            });
          }
        }
      });
      return Array.from(map.values()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }

    function toggleProcHistory() {
      const card = document.getElementById('proc-history-card');
      const btn = document.getElementById('btn-toggle-proc-history');
      if (!card) return;
      const isHidden = card.classList.toggle('hidden');
      if (btn) {
        const spanEl = btn.querySelector('span') || btn;
        spanEl.innerText = isHidden ? `${t('proc_case_history', 'Procedure Case History ▾')}` : 'Hide Case History ▲';
      }
      if (!isHidden) renderProcHistory();
    }

    function formatLongDate(dateStr) {
      if (!dateStr) return '—';
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      } catch (e) {
        return dateStr;
      }
    }

    function renderProcHistory() {
      const body = document.getElementById('proc-history-body');
      if (!body) return;
      const q = (document.getElementById('proc-hist-search')?.value || '').toLowerCase().trim();
      const fromD = document.getElementById('proc-hist-from')?.value || '';
      const toD = document.getElementById('proc-hist-to')?.value || '';

      const groups = getProcedureGroups().filter(g => {
        const dStr = String(g.date).slice(0, 10);
        if (fromD && dStr < fromD) return false;
        if (toD && dStr > toD) return false;
        if (!q) return true;
        const itemNames = g.items.map(i => i.deviceName).join(' ').toLowerCase();
        return (
          String(g.hn).toLowerCase().includes(q) ||
          String(g.procedure).toLowerCase().includes(q) ||
          String(g.disease).toLowerCase().includes(q) ||
          String(g.tech).toLowerCase().includes(q) ||
          String(g.shift).toLowerCase().includes(q) ||
          String(g.complication || '').toLowerCase().includes(q) ||
          itemNames.includes(q)
        );
      });

      if (groups.length === 0) {
        body.innerHTML = '<tr><td colspan="7" class="empty-state">No procedure records found.</td></tr>';
        return;
      }

      body.innerHTML = groups.map(g => {
        const notes = [g.complication, g.contrast ? `Contrast: ${g.contrast}` : ''].filter(Boolean).join(' | ');
        return `
          <tr>
            <td>${formatDate(g.date)}</td>
            <td>
              <button type="button" class="btn-link font-semibold" style="color:var(--brand-dark); text-decoration:underline; cursor:pointer; background:none; border:none; padding:0; font-size:inherit; text-align:left;" onclick="openProcViewModal('${escapeHtml(g.id)}')" title="View Procedure Details">
                ${escapeHtml(g.hn || '—')}
              </button>
            </td>
            <td>${escapeHtml(g.procedure || '—')}</td>
            <td>${escapeHtml(g.disease || '—')}</td>
            <td><span class="badge badge-blue">${escapeHtml(g.shift || '—')}</span></td>
            <td class="text-sm text-gray">${escapeHtml(g.tech || '—')}</td>
            <td class="text-sm text-gray">${escapeHtml(notes || '—')}</td>
          </tr>
        `;
      }).join('');
    }

    function buildProcDetailHtml(g) {
      let totalCost = 0;
      let totalQty = 0;
      const rowsHtml = (!g.items || g.items.length === 0)
        ? `<tr><td colspan="5" class="empty-state text-sm">No supply items logged for this case (e.g. Activate INR Code / Off case).</td></tr>`
        : g.items.map((it, idx) => {
            const inv = state.inventory.find(i => String(i.itemId) === String(it.itemId));
            const sellPrice = inv ? (Number(inv.sellPrice) || 0) : 0;
            const lineTotal = sellPrice * it.qty;
            totalCost += lineTotal;
            totalQty += it.qty;
            let metaHtml = '';
            if (it.pieceNo) {
              metaHtml += ` <span class="badge badge-purple" style="font-size:10px; margin-left:4px;">Piece #${it.pieceNo}</span>`;
            }
            if (it.volumeMl) {
              metaHtml += ` <span class="badge badge-blue" style="font-size:10px; margin-left:4px;">${it.volumeMl} ml</span>`;
            }
            if (inv && inv.isFreeItem) {
              metaHtml += ` <span class="badge-free" style="margin-left:4px;">FREE</span>`;
            }
            return `
              <tr>
                <td class="center">${idx + 1}</td>
                <td class="font-medium">${escapeHtml(it.deviceName)}${metaHtml}</td>
                <td class="center font-bold">${it.qty}</td>
                <td class="num">฿${sellPrice.toLocaleString()}</td>
                <td class="num font-semibold">฿${lineTotal.toLocaleString()}</td>
              </tr>
            `;
          }).join('');

      // Procedure names: primary on top, secondary indented / stacked below
      const procs = String(g.procedure || '').split(',').map(s => s.trim()).filter(Boolean);
      let procHtml = '—';
      if (procs.length > 0) {
        procHtml = procs.map((p, idx) => {
          if (idx === 0) {
            return `<div>${escapeHtml(p)}</div>`;
          }
          return `<div class="text-gray text-xs" style="padding-left:14px; margin-top:3px;">↳ ${escapeHtml(p)}</div>`;
        }).join('');
      }

      // Notes content
      const notesContent = [
        g.complication ? escapeHtml(g.complication) : '',
        g.contrast ? `<span class="text-gray" style="font-size:12px;">(Contrast: ${escapeHtml(g.contrast)})</span>` : ''
      ].filter(Boolean).join(' ');

      return `
        <div class="space-y">
          <!-- Metadata Header: Two-Column Alignment (Transaction ID Hidden) -->
          <div class="proc-detail-header-card">
            <!-- Left Column -->
            <div style="display:flex; flex-direction:column; gap:8px;">
              <div style="font-size:1.2em; font-weight:700; color:var(--gray-900); line-height:1.3;">
                <span class="text-gray" style="font-weight:600;">Patient HN:</span> ${escapeHtml(g.hn || '—')}
              </div>
              <div>
                <span class="text-gray font-medium">Date:</span> <strong>${formatLongDate(g.date)}</strong>
              </div>
              <div>
                <span class="text-gray font-medium">Procedure:</span>
                <div class="font-medium" style="margin-top:2px;">${procHtml}</div>
              </div>
              <div>
                <span class="text-gray font-medium">Disease:</span> <strong>${escapeHtml(g.disease || '—')}</strong>
              </div>
            </div>

            <!-- Right Column -->
            <div style="display:flex; flex-direction:column; gap:8px;">
              <div>
                <span class="text-gray font-medium">Shift:</span> <span class="badge badge-blue font-semibold">${escapeHtml(g.shift || '—')}</span>
              </div>
              <div>
                <span class="text-gray font-medium">Tech/Staff:</span> <strong>${escapeHtml(g.tech || '—')}</strong>
              </div>
              <div>
                <span class="text-gray font-medium">Notes:</span> <strong>${notesContent || '—'}</strong>
              </div>
            </div>
          </div>

          <!-- Devices & Billing Table: Exactly 5 Columns (No., Device Name, Qty., Unit Price, Total) -->
          <div class="table-wrap" style="max-height:none;">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="center" style="width:45px;">No.</th>
                  <th>Device Name</th>
                  <th class="center" style="width:70px;">Qty.</th>
                  <th class="num" style="width:115px;">Unit Price</th>
                  <th class="num" style="width:125px;">Total</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
              <tfoot>
                <tr style="background:var(--gray-50); font-weight:700;">
                  <td colspan="2" style="text-align:right;">Total</td>
                  <td class="center font-bold">${totalQty}</td>
                  <td></td>
                  <td class="num font-bold">฿${totalCost.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    }

    function openProcViewModal(txId) {
      const g = getProcedureGroups().find(x => String(x.id) === String(txId));
      if (!g) return;
      document.getElementById('proc-view-body').innerHTML = buildProcDetailHtml(g);
      document.getElementById('btn-proc-view-print').onclick = () => printProcedureCase(txId);
      document.getElementById('btn-proc-view-edit').onclick = () => {
        closeModal();
        openProcEditModal(txId);
      };
      openModal('modal-proc-view');
    }

    function printProcedureCase(txId) {
      const g = getProcedureGroups().find(x => String(x.id) === String(txId));
      if (!g) return;
      const html = `
        <div style="padding:16px; font-family:'Noto Sans', 'Noto Sans Thai', sans-serif;">
          <h2 style="margin:0 0 4px 0; font-size:18px;">INR Interventional Neuroradiology — Procedure Usage Slip</h2>
          <div style="font-size:11px; color:#6b7280; margin-bottom:12px;">Printed: ${new Date().toLocaleString('en-GB')}</div>
          ${buildProcDetailHtml(g)}
        </div>
      `;
      printStageHtml(html);
    }

    function openProcEditModal(txId) {
      const g = getProcedureGroups().find(x => String(x.id) === String(txId));
      if (!g) return;
      state.procEditId = g.id;
      state.procEditDevices = g.items.map(it => {
        const inv = state.inventory.find(i => String(i.itemId) === String(it.itemId));
        const isContrast = (inv && String(inv.category || '').toLowerCase().includes('contrast')) || String(it.category || '').toLowerCase().includes('contrast');
        return {
          itemId: it.itemId,
          deviceName: it.deviceName,
          category: it.category,
          qty: it.qty,
          isContrast: !!isContrast,
          volumeMl: it.volumeMl || '',
          pieceNo: it.pieceNo || '',
          isFreeItem: !!(inv && inv.isFreeItem)
        };
      });

      document.getElementById('proc-edit-txid').innerText = `(${g.id})`;
      document.getElementById('proc-edit-date').value = String(g.date || '').slice(0, 10);
      document.getElementById('proc-edit-hn').value = g.hn || '';
      document.getElementById('proc-edit-complications').value = g.complication || '';

      // Populate Disease dropdown
      const diseases = Array.from(new Set([...(state.settings.diseases || []), g.disease].filter(Boolean)));
      document.getElementById('proc-edit-disease').innerHTML = '<option value="">Select...</option>' +
        diseases.map(d => `<option value="${d}" ${d === g.disease ? 'selected' : ''}>${d}</option>`).join('');

      // Populate Procedure Type Checkboxes (supporting multiple selection)
      const existingProcs = String(g.procedure || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const allProcs = Array.from(new Set([...(state.settings.procedures || []), ...String(g.procedure || '').split(',').map(s => s.trim())].filter(Boolean)));
      const procEditContainer = document.getElementById('proc-edit-procedures-list');
      if (procEditContainer) {
        procEditContainer.innerHTML = allProcs.map(p => {
          const isChecked = existingProcs.includes(p.toLowerCase()) ? 'checked' : '';
          return `<label><input type="checkbox" name="proc-edit-proc-cb" value="${escapeHtml(p)}" ${isChecked} onchange="updateProcEditCountBadge()"> <span>${escapeHtml(p)}</span></label>`;
        }).join('');
        updateProcEditCountBadge();
      }

      // Populate Shift dropdown
      const shifts = Array.from(new Set([...getShiftsList(), g.shift].filter(Boolean)));
      document.getElementById('proc-edit-shift').innerHTML =
        shifts.map(s => `<option value="${s}" ${s === g.shift ? 'selected' : ''}>${s}</option>`).join('');

      // Populate Techs checkboxes (unified Nicknames)
      const existingTechs = String(g.tech || '').split(',').map(s => s.trim()).filter(Boolean);
      const users = getUsersList();
      const allTechNames = new Set(users.map(u => String(u.nickname || u.name || '').trim()));
      let techHtml = users.map(u => {
        const nick = String(u.nickname || u.name || '').trim();
        const checked = existingTechs.includes(nick) ? 'checked' : '';
        return `<label><input type="checkbox" name="proc-edit-tech-cb" value="${escapeHtml(nick)}" ${checked}> <span>${escapeHtml(nick)}</span></label>`;
      }).join('');
      // Also include any historic tech names not in current user list
      existingTechs.forEach(tName => {
        if (!allTechNames.has(tName)) {
          techHtml += `<label><input type="checkbox" name="proc-edit-tech-cb" value="${escapeHtml(tName)}" checked> <span>${escapeHtml(tName)}</span></label>`;
        }
      });
      document.getElementById('proc-edit-techs').innerHTML = techHtml || '<div class="text-xs text-gray">No users configured</div>';

      // Populate Category filter in edit modal
      const allCats = getAllCategories();
      const editCatSelect = document.getElementById('proc-edit-add-cat');
      editCatSelect.innerHTML = '<option value="">All Categories</option>' +
        allCats.map(c => `<option value="${c}">${c}</option>`).join('');

      renderProcEditDeviceOptions();
      onProcEditItemSelect();
      renderProcEditDevicesTable();
      openModal('modal-proc-edit');
    }

    function onProcEditItemSelect() {
      const itemSelect = document.getElementById('proc-edit-add-item');
      const contrastWrap = document.getElementById('proc-edit-add-contrast-fields');
      const pieceWrap = document.getElementById('proc-edit-add-piece-fields');
      const pieceSelect = document.getElementById('proc-edit-add-piece');
      if (!itemSelect) return;
      const itemId = itemSelect.value;
      const inv = state.inventory.find(i => String(i.itemId) === String(itemId));
      const isContrast = inv && String(inv.category || '').toLowerCase().includes('contrast');
      const exRule = getExchangeRuleForEdit(itemId);

      if (contrastWrap) contrastWrap.classList.toggle('hidden', !isContrast);
      if (pieceWrap) {
        if (exRule) {
          pieceWrap.classList.remove('hidden');
          const avail = getQuotaAvailablePieces(exRule);
          if (pieceSelect) {
            pieceSelect.innerHTML = avail.map(p => `<option value="${p}">Piece #${p} of ${exRule.totalQuota}</option>`).join('');
          }
        } else {
          pieceWrap.classList.add('hidden');
        }
      }
    }

    function renderProcEditDeviceOptions() {
      const cat = (document.getElementById('proc-edit-add-cat')?.value || '').toLowerCase().trim();
      const itemSelect = document.getElementById('proc-edit-add-item');
      if (!itemSelect) return;
      const items = state.inventory.filter(i => !isConsignmentOnlyItem(i) && (!cat || String(i.category || '').toLowerCase() === cat));
      itemSelect.innerHTML = items.map(i => {
        const r = Number(i.retailStock) || 0;
        const freeTag = i.isFreeItem ? ' [FREE]' : '';
        return `<option value="${escapeHtml(String(i.itemId))}">${i.deviceName}${freeTag} (${i.category || '—'} · Retail: ${r})</option>`;
      }).join('');
      onProcEditItemSelect();
    }

    function renderProcEditDevicesTable() {
      const tbody = document.getElementById('proc-edit-devices');
      const countEl = document.getElementById('proc-edit-dev-count');
      if (countEl) countEl.innerText = `${state.procEditDevices.length} items`;
      if (!tbody) return;
      if (state.procEditDevices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state text-sm">No supply items logged in this procedure (e.g. Activate INR Code / Off case).</td></tr>';
        return;
      }

      tbody.innerHTML = state.procEditDevices.map((d, idx) => {
        const inv = state.inventory.find(i => String(i.itemId) === String(d.itemId));
        const isContrast = d.isContrast || (inv && String(inv.category || '').toLowerCase().includes('contrast'));
        const exRule = getExchangeRuleForEdit(d.itemId);

        let exBadgeHtml = '';
        let detailHtml = '';

        if (exRule) {
          const availPieces = getQuotaAvailablePiecesForEdit(exRule, d.pieceNo);
          if (!d.pieceNo && availPieces.length > 0) d.pieceNo = availPieces[0];
          exBadgeHtml = `
            <div style="margin-top:2px;">
              <span class="badge badge-purple" style="font-size:10px;">Substituted for ${getDeviceName(exRule.substitutedItemId)} [Quota: ${exRule.currentUsed}/${exRule.totalQuota}]</span>
            </div>
          `;
          detailHtml = `
            <div class="flex items-center justify-center gap-2 flex-wrap">
              <div class="flex items-center gap-1">
                <label class="text-xs text-gray font-medium">Piece No:</label>
                <select class="form-select form-input-sm" onchange="setProcEditDevicePieceNo(${idx}, this.value)" style="width:auto; min-width:65px; text-align:center; padding:3px 8px; font-size:12px; font-weight:700; color:var(--purple-dark); background:#f5f3ff; border-color:#ddd6fe;">
                  ${availPieces.map(p => `<option value="${p}" ${String(d.pieceNo) === String(p) ? 'selected' : ''}>Piece #${p} of ${exRule.totalQuota}</option>`).join('')}
                </select>
              </div>
              <div class="flex items-center gap-1">
                <label class="text-xs text-gray font-medium">Qty:</label>
                <input type="number" min="1" value="${d.qty}" class="form-input form-input-sm" style="width:58px; text-align:center; padding:3px 6px;" onchange="updateProcEditDeviceQty(${idx}, this.value)">
              </div>
            </div>
          `;
        } else if (isContrast) {
          detailHtml = `
            <div class="flex items-center justify-center gap-2 flex-wrap">
              <div class="flex items-center gap-1">
                <label class="text-xs text-gray font-medium">Vol:</label>
                <input type="number" step="any" min="1" value="${d.volumeMl || ''}" placeholder="ml *" class="form-input form-input-sm" style="width:80px; text-align:center; padding:3px 6px;" onchange="setProcEditDeviceVolume(${idx}, this.value)" required>
                <span class="text-xs text-gray">ml</span>
              </div>
              <div class="flex items-center gap-1">
                <label class="text-xs text-gray font-medium">Qty:</label>
                <input type="number" min="1" value="${d.qty}" class="form-input form-input-sm" style="width:58px; text-align:center; padding:3px 6px;" onchange="updateProcEditDeviceQty(${idx}, this.value)" required>
                <span class="text-xs text-gray">ขวด</span>
              </div>
            </div>
          `;
        } else {
          detailHtml = `
            <div class="flex items-center justify-center gap-2">
              <label class="text-xs text-gray font-medium">Qty:</label>
              <input type="number" min="1" value="${d.qty}" class="form-input form-input-sm" style="width:65px; text-align:center; padding:3px 6px;" onchange="updateProcEditDeviceQty(${idx}, this.value)">
            </div>
          `;
        }

        const freeBadgeHtml = (inv && inv.isFreeItem) || d.isFreeItem ? ' <span class="badge-free">FREE</span>' : '';

        return `
          <tr>
            <td>
              <div class="font-medium text-sm">${d.deviceName}${freeBadgeHtml}</div>
              ${exBadgeHtml}
            </td>
            <td class="text-gray text-xs">${d.category || ''}</td>
            <td class="center">${detailHtml}</td>
            <td class="center">
              <button class="btn-ghost" style="color:var(--red);" onclick="removeProcEditDevice(${idx})" title="Remove">✕</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function setProcEditDeviceVolume(idx, val) {
      if (!state.procEditDevices[idx]) return;
      state.procEditDevices[idx].volumeMl = parseFloat(val) || '';
    }

    function setProcEditDevicePieceNo(idx, val) {
      if (!state.procEditDevices[idx]) return;
      state.procEditDevices[idx].pieceNo = parseInt(val) || '';
    }

    function updateProcEditDeviceQty(idx, val) {
      state.procEditDevices[idx].qty = Math.max(1, parseInt(val) || 1);
      renderProcEditDevicesTable();
    }

    function removeProcEditDevice(idx) {
      state.procEditDevices.splice(idx, 1);
      renderProcEditDevicesTable();
    }

    function addProcEditDevice() {
      const itemId = document.getElementById('proc-edit-add-item')?.value;
      const qty = Math.max(1, parseInt(document.getElementById('proc-edit-add-qty')?.value) || 1);
      if (!itemId) return;

      const inv = state.inventory.find(i => String(i.itemId) === String(itemId));
      const isContrast = inv && String(inv.category || '').toLowerCase().includes('contrast');
      const exRule = getExchangeRuleForEdit(itemId);

      let vol = '';
      if (isContrast) {
        const volInput = document.getElementById('proc-edit-add-vol');
        vol = volInput ? (parseFloat(volInput.value) || '') : '';
        if (!vol) {
          showToast('Please enter Volume (ml) for contrast media');
          if (volInput) volInput.focus();
          return;
        }
      }

      let pieceNo = '';
      if (exRule) {
        const pieceSel = document.getElementById('proc-edit-add-piece');
        pieceNo = pieceSel ? (parseInt(pieceSel.value) || '') : '';
        if (!pieceNo) {
          const avail = getQuotaAvailablePieces(exRule);
          if (avail.length > 0) pieceNo = avail[0];
        }
      }

      const exist = state.procEditDevices.find(d => String(d.itemId) === String(itemId));
      if (exist) {
        exist.qty += qty;
        if (vol) exist.volumeMl = vol;
        if (pieceNo) exist.pieceNo = pieceNo;
      } else {
        state.procEditDevices.push({
          itemId,
          deviceName: getDeviceName(itemId),
          category: getDeviceCategory(itemId),
          qty,
          isContrast: !!isContrast,
          volumeMl: vol,
          pieceNo: pieceNo,
          isFreeItem: !!(inv && inv.isFreeItem)
        });
      }

      const qtyEl = document.getElementById('proc-edit-add-qty');
      if (qtyEl) qtyEl.value = '1';
      const volEl = document.getElementById('proc-edit-add-vol');
      if (volEl) volEl.value = '';

      renderProcEditDevicesTable();
    }

    function saveProcEdit() {
      const txId = state.procEditId;
      if (!txId) return;
      const hn = document.getElementById('proc-edit-hn').value.trim();
      if (!hn) { showToast('Please enter Patient HN'); return; }

      const checkedProcs = Array.from(document.querySelectorAll('#proc-edit-procedures-list input[type="checkbox"]:checked')).map(cb => cb.value);
      if (checkedProcs.length === 0) {
        showToast('Please select at least one procedure type');
        return;
      }
      const procedureName = checkedProcs.join(', ');

      const checkedTechs = Array.from(document.querySelectorAll('#proc-edit-techs input[type="checkbox"]:checked')).map(cb => cb.value);
      const origGroup = getProcedureGroups().find(g => String(g.id) === String(txId));

      // Validate Contrast Media (Volume and Quantity required)
      for (const d of state.procEditDevices) {
        const inv = state.inventory.find(i => String(i.itemId) === String(d.itemId));
        const isContrast = d.isContrast || (inv && String(inv.category || '').toLowerCase().includes('contrast'));
        if (isContrast) {
          const vol = Number(d.volumeMl);
          const btl = Number(d.qty);
          if (!vol || vol <= 0) {
            showToast(`Please enter Volume (ml) for contrast media: "${d.deviceName}"`);
            return;
          }
          if (!btl || btl <= 0) {
            showToast(`Please enter Quantity / Bottle count for contrast media: "${d.deviceName}"`);
            return;
          }
        }
      }

      // Format Contrast Media summary string
      const contrastItems = state.procEditDevices.filter(d => {
        const inv = state.inventory.find(i => String(i.itemId) === String(d.itemId));
        return d.isContrast || (inv && String(inv.category || '').toLowerCase().includes('contrast'));
      });
      const contrastSummary = contrastItems.map(c => `${c.deviceName} (${c.volumeMl} ml, ${c.qty} btl)`).join(', ');

      const payload = {
        date: document.getElementById('proc-edit-date').value || getToday(),
        patientHN: hn,
        disease: document.getElementById('proc-edit-disease').value,
        procedure: procedureName,
        shift: document.getElementById('proc-edit-shift').value,
        tech: checkedTechs.join(', '),
        complication: document.getElementById('proc-edit-complications').value,
        contrast: contrastSummary,
        devices: state.procEditDevices.map(d => ({
          itemId: d.itemId,
          quantity: d.qty,
          volumeMl: d.volumeMl || '',
          pieceNo: d.pieceNo || ''
        }))
      };

      closeModal();
      appLoading.classList.remove('hidden');
      appContent.classList.add('hidden');

      if (isApiConfigured()) {
        callApi('editProcedure', { transactionId: txId, payload })
          .then(() => {
            showToast('Procedure updated!');
            fetchDataFromServer();
          })
          .catch(err => {
            showToast('Failed: ' + (err.message || err));
            appLoading.classList.add('hidden');
            appContent.classList.remove('hidden');
          });
      } else {
        // Offline mock: revert old items, clean old quota history, push new tx rows
        if (origGroup && origGroup.items) {
          origGroup.items.forEach(oldIt => {
            const inv = state.inventory.find(i => String(i.itemId) === String(oldIt.itemId));
            if (inv) inv.retailStock += oldIt.qty;
          });
        }

        // Clean up quota history for old txId
        (state.exchangeQuotas || []).forEach(q => {
          if (Array.isArray(q.history)) {
            const beforeLen = q.history.length;
            q.history = q.history.filter(h => String(h.txnId) !== String(txId));
            if (q.history.length !== beforeLen) {
              q.usedPieces = getQuotaUsedPieces(q);
              q.currentUsed = q.usedPieces.length;
              if (q.currentUsed < (Number(q.totalQuota) || 0) && q.status === 'Completed') {
                q.status = 'Active';
              }
            }
          }
        });

        state.transactions = state.transactions.filter(t => String(t.id) !== String(txId));
        const newId = 'TXN-' + Date.now();
        if (payload.devices.length === 0) {
          state.transactions.push({
            id: newId,
            date: payload.date,
            type: 'Procedure Use',
            hn: payload.patientHN,
            itemId: '',
            qty: 0,
            fromLoc: 'Retail',
            toLoc: '',
            disease: payload.disease,
            procedure: payload.procedure,
            shift: payload.shift,
            tech: payload.tech,
            complication: payload.complication,
            contrast: payload.contrast
          });
        } else {
          payload.devices.forEach(d => {
            state.transactions.push({
              id: newId,
              date: payload.date,
              type: 'Procedure Use',
              hn: payload.patientHN,
              itemId: d.itemId,
              qty: d.quantity,
              fromLoc: 'Retail',
              toLoc: '',
              disease: payload.disease,
              procedure: payload.procedure,
              shift: payload.shift,
              tech: payload.tech,
              complication: payload.complication,
              contrast: payload.contrast,
              volumeMl: d.volumeMl,
              pieceNo: d.pieceNo
            });
            const inv = state.inventory.find(i => String(i.itemId) === String(d.itemId));
            if (inv) {
              inv.retailStock = Math.max(0, inv.retailStock - d.quantity);
              inv.totalStock = (Number(inv.mainStock) || 0) + inv.retailStock;
              inv.stockDiff = inv.totalStock - (Number(inv.hoStock) || 0);
            }

            // Assign piece to exchange quota
            const exRule = getExchangeRuleForEdit(d.itemId);
            if (exRule) {
              if (!Array.isArray(exRule.usedPieces)) exRule.usedPieces = getQuotaUsedPieces(exRule);
              let pNo = d.pieceNo ? Number(d.pieceNo) : null;
              if (pNo && !isNaN(pNo)) {
                if (!exRule.usedPieces.includes(pNo)) exRule.usedPieces.push(pNo);
              } else {
                for (let k = 1; k <= (Number(exRule.totalQuota) || 0); k++) {
                  if (!exRule.usedPieces.includes(k)) {
                    pNo = k;
                    exRule.usedPieces.push(k);
                    break;
                  }
                }
              }
              exRule.currentUsed = exRule.usedPieces.length;
              if (!Array.isArray(exRule.history)) exRule.history = [];
              exRule.history.push({
                txnId: newId,
                date: payload.date,
                hn: payload.patientHN,
                qty: Number(d.quantity) || 0,
                procedure: payload.procedure,
                pieceNo: pNo
              });
              if (exRule.currentUsed >= exRule.totalQuota) {
                exRule.status = 'Completed';
              }
            }
          });
        }
        recalculateInventoryHierarchy();
        showToast('Procedure updated (mock)');
        appLoading.classList.add('hidden');
        appContent.classList.remove('hidden');
        renderCurrentTab();
      }
    }

    // --- Tab 4: Stock In/Out (Add Device-style form grid) ---
    function getStockPreviewText(line) {
      const inv = state.inventory.find(i => String(i.itemId) === String(line.itemId));
      if (!inv) return { main: '0', retail: '0' };
      const actionEl = document.querySelector('input[name="stock-action"]:checked');
      const action = actionEl ? actionEl.value : 'Stock In';
      const curMain = Number(inv.mainStock) || 0;
      const curRetail = Number(inv.retailStock) || 0;
      const q = Math.max(1, Number(line.qty) || 1);
      let afterMain = curMain;
      let afterRetail = curRetail;
      if (action === 'Stock In') {
        if (line.loc === 'Main') afterMain = curMain + q;
        else if (line.loc === 'Retail') {
          afterMain = curMain - q;
          afterRetail = curRetail + q;
        }
      } else {
        if (line.loc === 'Main') afterMain = curMain - q;
        else if (line.loc === 'Retail') afterRetail = curRetail - q;
      }
      return {
        main: `${curMain} → ${afterMain}`,
        retail: `${curRetail} → ${afterRetail}`
      };
    }

    function renderStockTab() {
      const container = document.getElementById('stock-lines-container');
      if (!container) return;
      const actionEl = document.querySelector('input[name="stock-action"]:checked');
      const action = actionEl ? actionEl.value : 'Stock In';
      const locLabel = action === 'Stock In' ? 'Destination Location' : 'Source Location';

      container.innerHTML = state.stockLines.map((line, idx) => {
        const preview = getStockPreviewText(line);
        return `
        <div class="${idx > 0 ? 'stock-item-card' : ''}">
          ${state.stockLines.length > 1 ? `
            <div class="flex justify-between items-center mb-2">
              <span class="text-xs font-bold text-gray">Item #${idx + 1}</span>
              <button type="button" class="btn-ghost text-xs" onclick="removeStockLine(${idx})" style="color:var(--red);">✕ Remove</button>
            </div>
          ` : ''}
          <div class="device-modal-grid">
            <div class="form-group col-span-2">
              <label class="form-label"><span>Device Name</span> <span style="color:var(--red);">*</span></label>
              <select class="form-select" onchange="updateStockItem(${idx}, this.value)">
                <option value="">Select Device...</option>
                ${getTransactableInventory().map(item => `<option value="${item.itemId}" ${line.itemId === item.itemId ? 'selected' : ''}>${item.deviceName}${item.isFreeItem ? ' [FREE]' : ''}</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="form-label"><span>Quantity</span> <span style="color:var(--red);">*</span></label>
              <input type="number" value="${line.qty}" min="1" class="form-input" placeholder="1" oninput="updateStockQty(${idx}, this.value)">
            </div>
            <div class="form-group">
              <label class="form-label"><span>${locLabel}</span> <span style="color:var(--red);">*</span></label>
              <select class="form-select" onchange="updateStockLoc(${idx}, this.value)">
                <option value="Main" ${line.loc === 'Main' ? 'selected' : ''}>Main</option>
                <option value="Retail" ${line.loc === 'Retail' ? 'selected' : ''}>Retail</option>
                <option value="Buffer" ${line.loc === 'Buffer' ? 'selected' : ''}>Buffer (Staging)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Main Stock (Main)</label>
              <input type="text" id="stock-prev-main-${idx}" class="form-input" value="${preview.main}" readonly style="background:var(--gray-50); color:var(--gray-600);">
            </div>
            <div class="form-group">
              <label class="form-label">Retail Stock (Retail)</label>
              <input type="text" id="stock-prev-retail-${idx}" class="form-input" value="${preview.retail}" readonly style="background:var(--gray-50); color:var(--gray-600);">
            </div>

            <div class="form-group col-span-2">
              <label class="form-label">Notes</label>
              <input type="text" value="${line.notes || ''}" class="form-input" placeholder="Notes..." oninput="updateStockNotes(${idx}, this.value)">
            </div>
          </div>
        </div>
      `}).join('');
    }

    function refreshStockPreview(idx) {
      const line = state.stockLines[idx];
      if (!line) return;
      const preview = getStockPreviewText(line);
      const mEl = document.getElementById(`stock-prev-main-${idx}`);
      const rEl = document.getElementById(`stock-prev-retail-${idx}`);
      if (mEl) mEl.value = preview.main;
      if (rEl) rEl.value = preview.retail;
    }

    function updateStockItem(idx, val) { state.stockLines[idx].itemId = val; refreshStockPreview(idx); }
    function updateStockQty(idx, val) { state.stockLines[idx].qty = Math.max(1, parseInt(val) || 1); refreshStockPreview(idx); }
    function updateStockLoc(idx, val) { state.stockLines[idx].loc = val; refreshStockPreview(idx); }
    function updateStockNotes(idx, val) { state.stockLines[idx].notes = val; }
    function removeStockLine(idx) {
      state.stockLines.splice(idx, 1);
      renderStockTab();
    }

    // --- Tab 5: Adjustment ---
    function renderAdjustmentTab() {
      const searchVal = document.getElementById('adj-search-input').value.toLowerCase();
      const body = document.getElementById('adj-table-body');
      
      const filtered = getTransactableInventory().filter(i => !searchVal || i.deviceName.toLowerCase().includes(searchVal));

      body.innerHTML = filtered.map(i => {
        const valMain = getAdjValue(i.itemId, 'Main');
        const valRetail = getAdjValue(i.itemId, 'Retail');
        const valBuffer = getAdjValue(i.itemId, 'Buffer');
        const bufStock = Number(i.bufferStock) || 0;
        const freeBadge = i.isFreeItem ? ` <span class="badge-free">FREE</span>` : '';
        return `
          <tr>
            <td class="font-medium">${i.deviceName}${freeBadge}</td>
            <td class="center text-gray">${i.mainStock}</td>
            <td class="center">
              <input type="number" class="adj-input" value="${valMain}" oninput="handleSetAdj('${i.itemId}', 'Main', this.value, ${i.mainStock})" placeholder="—">
            </td>
            <td class="center text-gray">${i.retailStock}</td>
            <td class="center">
              <input type="number" class="adj-input" value="${valRetail}" oninput="handleSetAdj('${i.itemId}', 'Retail', this.value, ${i.retailStock})" placeholder="—">
            </td>
            <td class="center text-gray">${bufStock}</td>
            <td class="center">
              <input type="number" class="adj-input" style="background:#f5f3ff;" value="${valBuffer}" oninput="handleSetAdj('${i.itemId}', 'Buffer', this.value, ${bufStock})" placeholder="—">
            </td>
          </tr>
        `;
      }).join('');
    }

    function getAdjValue(itemId, loc) {
      const item = state.adjBatch.find(x => x.itemId === itemId && x.loc === loc);
      return item ? item.count : '';
    }

    function handleSetAdj(itemId, loc, val, current) {
      if (val === '' || val === null) {
        state.adjBatch = state.adjBatch.filter(x => !(x.itemId === itemId && x.loc === loc));
      } else {
        const count = parseInt(val);
        const diff = count - current;
        const exist = state.adjBatch.find(x => x.itemId === itemId && x.loc === loc);
        if (exist) {
          exist.count = count;
          exist.diff = diff;
        } else {
          state.adjBatch.push({ itemId, loc, count, diff });
        }
      }
    }

    // --- Tab 6: Statistic ---
    function initStatYearSelects() {
      const fromY = document.getElementById('stat-from-year');
      const toY = document.getElementById('stat-to-year');
      const fromM = document.getElementById('stat-from-month');
      const toM = document.getElementById('stat-to-month');
      if (!fromY || !toY) return;
      if (fromY.options.length === 0) {
        const years = [];
        for (let y = currentYear - 3; y <= currentYear + 2; y++) years.push(y);
        const opts = years.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('');
        fromY.innerHTML = opts;
        toY.innerHTML = opts;
        if (fromM) fromM.value = '1';
        if (toM) toM.value = '12';
      }
    }

    function switchStatSubTab(sub) {
      state.statSubTab = sub;
      document.querySelectorAll('#stat-subtabs .sub-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.stat === sub);
      });
      const searchInput = document.getElementById('stat-search-input');
      if (searchInput) {
        if (sub === 'procedure' || sub === 'stroke') {
          searchInput.classList.add('hidden');
          searchInput.value = '';
        } else {
          searchInput.classList.remove('hidden');
        }
      }
      renderStatisticTab();
    }

    function getStatDayMode() {
      const sub = state.statSubTab;
      if (sub !== 'contrast' && sub !== 'shift') return false;
      const sel = document.getElementById('stat-view-select');
      return !!sel && sel.value === 'day';
    }

    function getStatMonthsRange() {
      initStatYearSelects();
      let fm = parseInt(document.getElementById('stat-from-month')?.value) || 1;
      let fy = parseInt(document.getElementById('stat-from-year')?.value) || currentYear;
      let tm = parseInt(document.getElementById('stat-to-month')?.value) || 12;
      let ty = parseInt(document.getElementById('stat-to-year')?.value) || currentYear;

      if (fy > ty || (fy === ty && fm > tm)) {
        [fy, ty] = [ty, fy];
        [fm, tm] = [tm, fm];
      }

      const months = [];
      let y = fy, m = fm;
      let guard = 0;
      while ((y < ty || (y === ty && m <= tm)) && guard < 36) {
        const key = `${y}-${String(m).padStart(2, '0')}`;
        const label = (fy === ty) ? monthNames[m - 1] : `${monthNames[m - 1]} ${String(y).slice(-2)}`;
        months.push({ year: y, month: m, key, label });
        m++;
        if (m > 12) { m = 1; y++; }
        guard++;
      }
      return months;
    }

    function renderStatisticTab() {
      let months = getStatMonthsRange();
      const dayMode = getStatDayMode();
      let keyOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      // View selector (Contrast Media + Shift only): each month in period OR each day in a month
      const viewSel = document.getElementById('stat-view-select');
      if (viewSel) {
        const showView = state.statSubTab === 'contrast' || state.statSubTab === 'shift';
        viewSel.classList.toggle('hidden', !showView);
      }
      ['stat-to-label', 'stat-to-month', 'stat-to-year'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', dayMode);
      });
      const fromLabel = document.getElementById('stat-from-label');
      if (fromLabel) fromLabel.innerText = dayMode ? 'Month:' : 'From:';

      if (dayMode) {
        const dm = parseInt(document.getElementById('stat-from-month')?.value) || 1;
        const dy = parseInt(document.getElementById('stat-from-year')?.value) || currentYear;
        const dim = new Date(dy, dm, 0).getDate();
        months = [];
        for (let day = 1; day <= dim; day++) {
          months.push({ year: dy, month: dm, key: String(day), label: String(day) });
        }
        keyOf = d => (d.getFullYear() === dy && d.getMonth() + 1 === dm) ? String(d.getDate()) : null;
      }
      const monthKeys = new Set(months.map(m => m.key));
      const searchInput = document.getElementById('stat-search-input');
      const isProc = state.statSubTab === 'procedure';
      const isStroke = state.statSubTab === 'stroke';
      if (searchInput) {
        if (isProc || isStroke) {
          searchInput.classList.add('hidden');
        } else {
          searchInput.classList.remove('hidden');
        }
      }
      const searchQ = (!isProc && !isStroke && searchInput) ? searchInput.value.toLowerCase().trim() : '';
      const head = document.getElementById('stat-table-head');
      const body = document.getElementById('stat-table-body');
      const titleEl = document.getElementById('stat-report-title');
      const rangeEl = document.getElementById('stat-range-label');
      const chartTitleEl = document.getElementById('stat-chart-title');
      const chartSubEl = document.getElementById('stat-chart-subtitle');
      const chartBodyEl = document.getElementById('stat-chart-body');
      if (!head || !body) return;

      const titles = {
        device: 'Device Usage',
        procedure: 'Procedure Type Cases by Month',
        disease: 'Disease Cases by Month',
        stroke: 'Stroke & Activate INR Code Conversion Analysis',
        contrast: 'Contrast Media Usage',
        shift: 'Shift Summary'
      };

      // Shift selector (only visible on the Shift sub-tab)
      const shiftSel = document.getElementById('stat-shift-select');
      let activeShift = '';
      if (shiftSel) {
        const isShiftTab = state.statSubTab === 'shift';
        shiftSel.classList.toggle('hidden', !isShiftTab);
        const shiftList = (state.settings.shifts && state.settings.shifts.length > 0) ? state.settings.shifts : ['In-time', 'On-call', 'SMC'];
        const prev = shiftSel.value;
        const sig = shiftList.join('|');
        if (shiftSel.dataset.sig !== sig) {
          shiftSel.innerHTML = shiftList.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
          shiftSel.dataset.sig = sig;
          shiftSel.value = shiftList.indexOf(prev) !== -1 ? prev : (shiftList.indexOf('On-call') !== -1 ? 'On-call' : shiftList[0]);
        }
        activeShift = shiftSel.value;
      }
      const periodText = (months.length > 0)
        ? (dayMode
            ? `${monthNames[months[0].month - 1]} ${months[0].year} (daily)`
            : `${monthNames[months[0].month - 1]} ${months[0].year} – ${monthNames[months[months.length - 1].month - 1]} ${months[months.length - 1].year}`)
        : '';
      if (titleEl) titleEl.innerText = state.statSubTab === 'shift' ? `Shift Summary — ${activeShift}` : (titles[state.statSubTab] || 'Statistics');
      if (rangeEl) rangeEl.innerText = periodText;
      if (chartSubEl) chartSubEl.innerText = periodText;

      const shiftNote = document.getElementById('stat-shift-note');
      if (shiftNote) shiftNote.classList.toggle('hidden', state.statSubTab !== 'shift');

      // ── SUB-TAB: STROKE (ACTIVATE INR CODE & DOWNSTREAM PROCEDURES) ──
      if (state.statSubTab === 'stroke') {
        if (chartTitleEl) chartTitleEl.innerText = 'Activate INR Code Volume & Procedure Pathway Breakdown';

        head.innerHTML = `
          <tr>
            <th>Activate INR Code &amp; Downstream Procedure Pathway</th>
            ${months.map(m => `<th class="center">${m.label}</th>`).join('')}
            <th class="center">Total Cases</th>
            <th class="center">% of Activated</th>
          </tr>
        `;

        // Collect unique cases in period
        const casesById = new Map();
        state.transactions.forEach(t => {
          if (t.type !== 'Procedure Use' || !t.date) return;
          const d = new Date(t.date);
          if (isNaN(d.getTime())) return;
          const mKey = keyOf(d);
          if (!monthKeys.has(mKey)) return;
          const caseId = t.id || `${t.hn}|${formatDate(t.date)}`;
          if (!casesById.has(caseId)) {
            casesById.set(caseId, {
              caseId,
              mKey,
              hn: t.hn || '',
              disease: String(t.disease || '').trim(),
              procs: new Set()
            });
          }
          const cObj = casesById.get(caseId);
          String(t.procedure || '').split(',').map(s => s.trim()).filter(Boolean).forEach(p => cObj.procs.add(p));
        });

        const activatedMonthSets = {};
        let totalActivated = 0;

        // Standard downstream pathways to track when Activate INR Code is triggered
        const pathwayDefs = [
          { key: 'mt',        label: '↳ Mechanical Thrombectomy',                     color: '#10b981', match: p => p.includes('mechanical thrombectomy') || p.includes('thrombectomy') },
          { key: 'angio',     label: '↳ Angioplasty',                                 color: '#3b82f6', match: p => p.includes('angioplasty') },
          { key: 'nimo',      label: '↳ Transarterial Nimodipine',                    color: '#8b5cf6', match: p => p.includes('nimodipine') },
          { key: 'diag_emg',  label: '↳ Cerebral Angiography (Emergency)',            color: '#f59e0b', match: p => p.includes('angiogram') || p.includes('angiography') },
          { key: 'other_int', label: '↳ Other Intervention after Activation',         color: '#06b6d4', match: null },
          { key: 'off',       label: '↳ Off Case / Activate Only (No Intervention)',  color: '#6b7280', match: null }
        ];

        const pathwayStats = {};
        pathwayDefs.forEach(pd => {
          pathwayStats[pd.key] = { def: pd, months: {}, total: 0 };
        });

        // Also track Direct Mechanical Thrombectomy (without Activate INR code) for completeness
        const directMtMonths = {};
        let directMtTotal = 0;

        casesById.forEach(c => {
          const procArr = Array.from(c.procs);
          const procLower = procArr.map(p => p.toLowerCase());
          const isActivated = procLower.some(p => p.includes('activate'));

          if (isActivated) {
            totalActivated++;
            activatedMonthSets[c.mKey] = (activatedMonthSets[c.mKey] || 0) + 1;

            // Check non-activate procedures on this case
            const followProcs = procLower.filter(p => !p.includes('activate'));
            const isExplicitOff = followProcs.some(p => p.includes('off case'));
            const activeFollowProcs = followProcs.filter(p => !p.includes('off case'));

            if (activeFollowProcs.length === 0 || (isExplicitOff && activeFollowProcs.length === 0)) {
              pathwayStats.off.months[c.mKey] = (pathwayStats.off.months[c.mKey] || 0) + 1;
              pathwayStats.off.total++;
            } else {
              let matchedKnown = false;
              ['mt', 'angio', 'nimo', 'diag_emg'].forEach(k => {
                const pd = pathwayStats[k].def;
                if (activeFollowProcs.some(pd.match)) {
                  pathwayStats[k].months[c.mKey] = (pathwayStats[k].months[c.mKey] || 0) + 1;
                  pathwayStats[k].total++;
                  matchedKnown = true;
                }
              });
              // Check if there are other procedures not matching the 4 primary ones
              const hasUnmatched = activeFollowProcs.some(p =>
                !['mt', 'angio', 'nimo', 'diag_emg'].some(k => pathwayStats[k].def.match(p))
              );
              if (hasUnmatched || !matchedKnown) {
                pathwayStats.other_int.months[c.mKey] = (pathwayStats.other_int.months[c.mKey] || 0) + 1;
                pathwayStats.other_int.total++;
              }
            }
          } else {
            if (procLower.some(p => p.includes('thrombectomy'))) {
              directMtMonths[c.mKey] = (directMtMonths[c.mKey] || 0) + 1;
              directMtTotal++;
            }
          }
        });

        const fmtPct = (cnt) => totalActivated > 0 ? ((cnt / totalActivated) * 100).toFixed(1) + '%' : '0.0%';

        // Build Table Rows
        const totalActRowHtml = `
          <tr style="font-weight:700; border-bottom:2px solid var(--gray-200);">
            <td style="color:#065f46;">Total Activate INR Code Cases</td>
            ${months.map(m => `<td class="center" style="color:#065f46;">${activatedMonthSets[m.key] || 0}</td>`).join('')}
            <td class="center" style="color:#065f46; font-size:13px; font-weight:700;">${totalActivated}</td>
            <td class="center" style="color:#065f46;">${totalActivated > 0 ? '100%' : '—'}</td>
          </tr>
        `;

        const pathwayRowsHtml = pathwayDefs
          .filter(pd => pd.key !== 'other_int' || pathwayStats.other_int.total > 0)
          .map(pd => {
            const st = pathwayStats[pd.key];
            return `
              <tr>
                <td class="font-medium" style="padding-left:18px;">
                  <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${pd.color}; margin-right:6px;"></span>${escapeHtml(pd.label)}
                </td>
                ${months.map(m => `<td class="center">${st.months[m.key] || 0}</td>`).join('')}
                <td class="center font-bold">${st.total}</td>
                <td class="center font-semibold text-gray">${fmtPct(st.total)}</td>
              </tr>
            `;
          }).join('');

        const directMtRowHtml = directMtTotal > 0 ? `
          <tr style="color:var(--gray-600);">
            <td class="font-medium">Mechanical Thrombectomy (Direct / Non-Activated Code)</td>
            ${months.map(m => `<td class="center">${directMtMonths[m.key] || 0}</td>`).join('')}
            <td class="center font-bold">${directMtTotal}</td>
            <td class="center text-xs text-gray">—</td>
          </tr>
        ` : '';

        body.innerHTML = totalActRowHtml + pathwayRowsHtml + directMtRowHtml;

        // Render Stroke Chart in #stat-chart-body
        if (chartBodyEl) {
          const mtCnt = pathwayStats.mt.total;
          const angioNimoCnt = pathwayStats.angio.total + pathwayStats.nimo.total + pathwayStats.diag_emg.total + pathwayStats.other_int.total;
          const offCnt = pathwayStats.off.total;
          const maxMonthAct = Math.max(1, ...months.map(m => activatedMonthSets[m.key] || 0));

          chartBodyEl.innerHTML = `
            <div class="space-y">
              <div class="grid-4" style="grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap:12px;">
                <div style="padding:12px; border-radius:8px; background:var(--white); border:1px solid var(--gray-200);">
                  <div class="text-xs font-semibold" style="color:#065f46;">Total Activate INR Code</div>
                  <div class="text-2xl font-bold mt-1" style="color:#047857;">${totalActivated} <span class="text-xs font-normal">cases</span></div>
                </div>
                <div style="padding:12px; border-radius:8px; background:var(--white); border:1px solid var(--gray-200);">
                  <div class="text-xs font-semibold" style="color:#1e40af;">→ Mechanical Thrombectomy</div>
                  <div class="text-2xl font-bold mt-1" style="color:#1d4ed8;">${mtCnt} <span class="text-xs font-semibold">(${fmtPct(mtCnt)})</span></div>
                </div>
                <div style="padding:12px; border-radius:8px; background:var(--white); border:1px solid var(--gray-200);">
                  <div class="text-xs font-semibold" style="color:#5b21b6;">→ Angioplasty / Nimodipine / Other</div>
                  <div class="text-2xl font-bold mt-1" style="color:#6d28d9;">${angioNimoCnt} <span class="text-xs font-semibold">(${fmtPct(angioNimoCnt)})</span></div>
                </div>
                <div style="padding:12px; border-radius:8px; background:var(--white); border:1px solid var(--gray-200);">
                  <div class="text-xs font-semibold text-gray">→ Off Case / Activate Only</div>
                  <div class="text-2xl font-bold mt-1 text-gray-dark">${offCnt} <span class="text-xs font-semibold">(${fmtPct(offCnt)})</span></div>
                </div>
              </div>

              <div class="grid-2" style="gap:20px; align-items:start;">
                <div style="background:var(--gray-50); border:1px solid var(--gray-200); border-radius:8px; padding:14px;">
                  <div class="text-xs font-bold text-gray-dark mb-2">IF ACTIVATED: DOWNSTREAM PROCEDURE CONVERSION</div>
                  <div class="space-y-sm">
                    ${pathwayDefs.filter(pd => pd.key !== 'other_int' || pathwayStats.other_int.total > 0).map(pd => {
                      const c = pathwayStats[pd.key].total;
                      const pctNum = totalActivated > 0 ? Math.round((c / totalActivated) * 100) : 0;
                      return `
                        <div>
                          <div class="flex justify-between text-xs mb-1">
                            <span class="font-medium">${escapeHtml(pd.label.replace('↳ ', ''))}</span>
                            <span class="font-bold">${c} cases (${fmtPct(c)})</span>
                          </div>
                          <div class="progress-track" style="height:8px;">
                            <div class="progress-fill" style="width:${pctNum}%; background:${pd.color};"></div>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>

                <div style="background:var(--gray-50); border:1px solid var(--gray-200); border-radius:8px; padding:14px;">
                  <div class="text-xs font-bold text-gray-dark mb-2">MONTHLY ACTIVATE INR CODE VS. THROMBECTOMY</div>
                  <div style="display:flex; align-items:flex-end; gap:8px; height:150px; padding-top:16px; border-bottom:1px solid var(--gray-300); overflow-x:auto;">
                    ${months.map(m => {
                      const actC = activatedMonthSets[m.key] || 0;
                      const mtC  = pathwayStats.mt.months[m.key] || 0;
                      const hAct = actC > 0 ? Math.max(8, Math.round((actC / maxMonthAct) * 110)) : 2;
                      const hMt  = mtC > 0 ? Math.max(6, Math.round((mtC / maxMonthAct) * 110)) : 0;
                      return `
                        <div style="flex:1; min-width:34px; display:flex; flex-direction:column; align-items:center;">
                          <div style="font-size:10px; font-weight:700; color:#047857; margin-bottom:2px;">${actC > 0 ? actC : ''}</div>
                          <div style="display:flex; align-items:flex-end; gap:2px; height:112px;">
                            <div title="${m.label} Activated: ${actC}" style="width:12px; height:${hAct}px; background:#10b981; border-radius:3px 3px 0 0;"></div>
                            <div title="${m.label} Thrombectomy: ${mtC}" style="width:12px; height:${hMt}px; background:#3b82f6; border-radius:3px 3px 0 0;"></div>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                  <div style="display:flex; gap:8px; margin-top:4px; overflow-x:auto;">
                    ${months.map(m => `<div style="flex:1; min-width:34px; text-align:center; font-size:10px; color:var(--gray-600);">${m.label}</div>`).join('')}
                  </div>
                  <div class="flex gap-4 justify-center mt-2 text-xs">
                    <span class="flex items-center gap-1"><span style="width:10px; height:10px; background:#10b981; display:inline-block; border-radius:2px;"></span> Activate INR Code</span>
                    <span class="flex items-center gap-1"><span style="width:10px; height:10px; background:#3b82f6; display:inline-block; border-radius:2px;"></span> Mechanical Thrombectomy</span>
                  </div>
                </div>
              </div>
            </div>
          `;
        }
        return;
      }

      if (state.statSubTab === 'shift') {
        if (chartTitleEl) chartTitleEl.innerText = `Technologist Workload Distribution — ${activeShift}`;
        // Shift summary: collect only from Radiological technologist's shift
        head.innerHTML = `
          <tr>
            <th>Name</th>
            ${months.map(m => `<th class="center">${m.label}</th>`).join('')}
            <th class="center">Total Cases</th>
          </tr>
        `;

        const users = getUsersList();
        function isRadTechUser(u) {
          if (!u) return false;
          const p = String(u.position || '').trim().toLowerCase();
          if (!p) return true;
          return p.includes('radiological') || p.includes('technologist') || p === 'rt' || p === 'tech';
        }

        const radTechUsers = users.filter(isRadTechUser);
        const staffMap = new Map();
        radTechUsers.forEach(u => {
          const fullName = `${u.name || ''} ${u.surname || ''}`.trim();
          if (fullName) {
            staffMap.set(fullName, {
              name: fullName,
              first: String(u.name || '').trim() || fullName,
              nickname: u.nickname || '',
              months: {},
              cases: new Set()
            });
          }
        });

        state.transactions.forEach(t => {
          if (t.type !== 'Procedure Use' || !t.date || !t.tech) return;
          if (String(t.shift || '').trim() !== activeShift) return;
          const d = new Date(t.date);
          if (isNaN(d.getTime())) return;
          const mKey = keyOf(d);
          if (!monthKeys.has(mKey)) return;
          const caseId = t.id || `${t.hn}|${formatDate(t.date)}`;
          String(t.tech).split(',').map(s => s.trim()).filter(Boolean).forEach(nm => {
            const nmL = nm.toLowerCase();
            // Exclude users known to be non-RT (e.g. Registered Nurse)
            const isNonRT = users.some(u => !isRadTechUser(u) && (
              nmL === `${u.name || ''} ${u.surname || ''}`.trim().toLowerCase() ||
              nmL === String(u.name || '').trim().toLowerCase()
            ));
            if (isNonRT) return;

            const matchedUser = radTechUsers.find(u => {
              const fn = `${u.name || ''} ${u.surname || ''}`.trim().toLowerCase();
              const fst = String(u.name || '').trim().toLowerCase();
              return nmL === fn || nmL === fst || nmL.includes(fn) || (fn && fn.includes(nmL));
            });

            if (radTechUsers.length > 0 && !matchedUser) return;

            let key = matchedUser ? `${matchedUser.name || ''} ${matchedUser.surname || ''}`.trim() : nm;
            if (!staffMap.has(key)) {
              staffMap.set(key, { name: key, first: nm.split(/\s+/)[0], nickname: '', months: {}, cases: new Set() });
            }
            const e = staffMap.get(key);
            if (!e.months[mKey]) e.months[mKey] = new Set();
            e.months[mKey].add(caseId);
            e.cases.add(caseId);
          });
        });

        let rows = Array.from(staffMap.values());
        if (searchQ) rows = rows.filter(r => r.name.toLowerCase().includes(searchQ) || r.first.toLowerCase().includes(searchQ) || r.nickname.toLowerCase().includes(searchQ));

        if (rows.length === 0) {
          body.innerHTML = `<tr><td colspan="${months.length + 2}" class="empty-state">No Radiological Technologists found for ${escapeHtml(activeShift)}.</td></tr>`;
          if (chartBodyEl) chartBodyEl.innerHTML = `<div class="empty-state text-sm" style="padding:12px;">No shift case records to chart.</div>`;
          return;
        }

        const monthTotals = {};
        let grand = 0;
        const htmlRows = rows.map(r => {
          grand += r.cases.size;
          return `
            <tr>
              <td class="font-medium">${escapeHtml(r.first)}</td>
              ${months.map(m => {
                const count = r.months[m.key] ? r.months[m.key].size : 0;
                monthTotals[m.key] = (monthTotals[m.key] || 0) + count;
                return `<td class="center">${count > 0 ? count : '<span style="color:var(--gray-400); font-weight:600;">X</span>'}</td>`;
              }).join('')}
              <td class="center font-bold" style="background:var(--gray-50);">${r.cases.size > 0 ? r.cases.size : '<span style="color:var(--gray-400); font-weight:600;">X</span>'}</td>
            </tr>
          `;
        }).join('');

        body.innerHTML = htmlRows + `
          <tr style="background:var(--gray-100); font-weight:700;">
            <td style="text-align:right;">Total (person-cases)</td>
            ${months.map(m => {
              const total = monthTotals[m.key] || 0;
              return `<td class="center">${total > 0 ? total : '<span style="color:var(--gray-400);">X</span>'}</td>`;
            }).join('')}
            <td class="center">${grand > 0 ? grand : '<span style="color:var(--gray-400);">X</span>'}</td>
          </tr>
        `;

        if (chartBodyEl) {
          const maxStaffCases = Math.max(1, ...rows.map(r => r.cases.size));
          chartBodyEl.innerHTML = `
            <div class="space-y-sm">
              ${rows.map((r, idx) => {
                const c = r.cases.size;
                const pct = Math.round((c / maxStaffCases) * 100);
                const share = grand > 0 ? ((c / grand) * 100).toFixed(1) : '0.0';
                const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899'];
                const barColor = colors[idx % colors.length];
                return `
                  <div>
                    <div class="flex justify-between text-xs mb-1">
                      <span class="font-semibold">${escapeHtml(r.first)}</span>
                      <span class="font-bold">${c} cases (${share}%)</span>
                    </div>
                    <div class="progress-track" style="height:10px;">
                      <div class="progress-fill" style="width:${pct}%; background:${barColor};"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        }
        return;
      }

      if (state.statSubTab === 'device' || state.statSubTab === 'contrast') {
        const isContrastOnly = state.statSubTab === 'contrast';
        if (chartTitleEl) {
          chartTitleEl.innerText = isContrastOnly ? 'Contrast Media Consumption Breakdown & Trend' : 'Top Used Devices & Category Distribution';
        }
        if (isContrastOnly) {
          // Contrast Media: remove Category column and remove Est. Buy Cost
          head.innerHTML = `
            <tr>
              <th>Device Name</th>
              ${months.map(m => `<th class="center">${m.label}</th>`).join('')}
              <th class="center">Total Qty</th>
            </tr>
          `;
        } else {
          // Device Usage: Category + Device Name, remove Est. Buy Cost
          head.innerHTML = `
            <tr>
              <th>Category</th>
              <th>Device Name</th>
              ${months.map(m => `<th class="center">${m.label}</th>`).join('')}
              <th class="center">Total Qty</th>
            </tr>
          `;
        }

        const items = state.inventory.filter(i => {
          const isCm = String(i.category || '').trim().toLowerCase() === 'contrast media';
          return isContrastOnly ? isCm : !isCm;
        });

        const rowMap = new Map();
        items.forEach(i => {
          rowMap.set(String(i.itemId), {
            itemId: i.itemId,
            cat: i.category || '',
            name: i.deviceName || i.itemId,
            months: {},
            total: 0
          });
        });

        state.transactions.forEach(t => {
          if (t.type !== 'Procedure Use' || !t.date) return;
          const d = new Date(t.date);
          if (isNaN(d.getTime())) return;
          const mKey = keyOf(d);
          if (!monthKeys.has(mKey)) return;
          const row = rowMap.get(String(t.itemId));
          if (row) {
            const q = Number(t.qty) || 0;
            row.months[mKey] = (row.months[mKey] || 0) + q;
            row.total += q;
          }
        });

        let rows = Array.from(rowMap.values()).filter(r => {
          if (searchQ && !r.name.toLowerCase().includes(searchQ) && !r.cat.toLowerCase().includes(searchQ)) return false;
          return isContrastOnly ? true : (r.total > 0 || Boolean(searchQ));
        }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

        if (rows.length === 0) {
          const colspan = isContrastOnly ? (months.length + 2) : (months.length + 3);
          body.innerHTML = `<tr><td colspan="${colspan}" class="empty-state">No usage records found for the selected period.</td></tr>`;
          if (chartBodyEl) chartBodyEl.innerHTML = `<div class="empty-state text-sm" style="padding:12px;">No usage data to chart for the selected period.</div>`;
          return;
        }

        let grandQty = 0;
        const monthTotals = {};

        const htmlRows = rows.map(r => {
          grandQty += r.total;
          months.forEach(m => {
            monthTotals[m.key] = (monthTotals[m.key] || 0) + (r.months[m.key] || 0);
          });
          if (isContrastOnly) {
            return `
              <tr>
                <td class="font-medium">${r.name}</td>
                ${months.map(m => `<td class="center">${r.months[m.key] || 0}</td>`).join('')}
                <td class="center font-bold" style="background:var(--gray-50);">${r.total}</td>
              </tr>
            `;
          } else {
            return `
              <tr>
                <td class="text-gray">${r.cat}</td>
                <td class="font-medium">${r.name}</td>
                ${months.map(m => `<td class="center">${r.months[m.key] || 0}</td>`).join('')}
                <td class="center font-bold" style="background:var(--gray-50);">${r.total}</td>
              </tr>
            `;
          }
        }).join('');

        const footerRow = isContrastOnly ? `
          <tr style="background:var(--gray-100); font-weight:700;">
            <td style="text-align:right;">Total</td>
            ${months.map(m => `<td class="center">${monthTotals[m.key] || 0}</td>`).join('')}
            <td class="center">${grandQty}</td>
          </tr>
        ` : `
          <tr style="background:var(--gray-100); font-weight:700;">
            <td colspan="2" style="text-align:right;">Total</td>
            ${months.map(m => `<td class="center">${monthTotals[m.key] || 0}</td>`).join('')}
            <td class="center">${grandQty}</td>
          </tr>
        `;
        body.innerHTML = htmlRows + footerRow;

        // Render Chart for Device Usage or Contrast Media
        if (chartBodyEl) {
          const topRows = rows.slice(0, 8);
          const maxRowQty = Math.max(1, ...topRows.map(r => r.total));
          const maxMonthQty = Math.max(1, ...months.map(m => monthTotals[m.key] || 0));
          chartBodyEl.innerHTML = `
            <div class="grid-2" style="gap:20px; align-items:start;">
              <div style="background:var(--gray-50); border:1px solid var(--gray-200); border-radius:8px; padding:14px;">
                <div class="text-xs font-bold text-gray-dark mb-2">${isContrastOnly ? 'CONTRAST MEDIA USAGE BY AGENT' : 'TOP USED DEVICES (QUANTITY)'}</div>
                <div class="space-y-sm">
                  ${topRows.map((r, idx) => {
                    const pct = Math.round((r.total / maxRowQty) * 100);
                    const share = grandQty > 0 ? ((r.total / grandQty) * 100).toFixed(1) : '0.0';
                    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#14b8a6', '#6366f1'];
                    return `
                      <div>
                        <div class="flex justify-between text-xs mb-1">
                          <span class="font-medium truncate" style="max-width:70%;" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</span>
                          <span class="font-bold">${r.total} units (${share}%)</span>
                        </div>
                        <div class="progress-track" style="height:8px;">
                          <div class="progress-fill" style="width:${pct}%; background:${colors[idx % colors.length]};"></div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
              <div style="background:var(--gray-50); border:1px solid var(--gray-200); border-radius:8px; padding:14px;">
                <div class="text-xs font-bold text-gray-dark mb-2">TOTAL UNITS CONSUMED PER ${dayMode ? 'DAY' : 'MONTH'} (TOTAL: ${grandQty})</div>
                <div style="display:flex; align-items:flex-end; gap:6px; height:140px; padding-top:16px; border-bottom:1px solid var(--gray-300); overflow-x:auto;">
                  ${months.map(m => {
                    const q = monthTotals[m.key] || 0;
                    const h = q > 0 ? Math.max(8, Math.round((q / maxMonthQty) * 108)) : 2;
                    return `
                      <div style="flex:1; min-width:24px; display:flex; flex-direction:column; align-items:center;">
                        <div style="font-size:10px; font-weight:700; color:#374151; margin-bottom:2px;">${q > 0 ? q : ''}</div>
                        <div title="${m.label}: ${q} units" style="width:14px; height:${h}px; background:${isContrastOnly ? '#3b82f6' : '#10b981'}; border-radius:3px 3px 0 0;"></div>
                      </div>
                    `;
                  }).join('')}
                </div>
                <div style="display:flex; gap:6px; margin-top:4px; overflow-x:auto;">
                  ${months.map(m => `<div style="flex:1; min-width:24px; text-align:center; font-size:9px; color:var(--gray-600);">${m.label}</div>`).join('')}
                </div>
              </div>
            </div>
          `;
        }
      } else {
        // 'procedure' or 'disease'
        const isProc = state.statSubTab === 'procedure';
        const colLabel = isProc ? 'Procedure Type' : 'Disease';
        if (chartTitleEl) {
          chartTitleEl.innerText = isProc ? 'Procedure Type Case Volume & Share' : 'Disease Distribution (Pie / Donut Chart)';
        }
        head.innerHTML = `
          <tr>
            <th>${colLabel}</th>
            ${months.map(m => `<th class="center">${m.label}</th>`).join('')}
            <th class="center">Total Cases</th>
          </tr>
        `;

        const seedList = isProc ? (state.settings.procedures || []) : (state.settings.diseases || []);
        const caseMap = new Map();
        seedList.forEach(name => {
          if (name) caseMap.set(name, { name, months: {}, allCases: new Set() });
        });

        state.transactions.forEach(t => {
          if (t.type !== 'Procedure Use' || !t.date) return;
          const rawVal = isProc ? t.procedure : t.disease;
          if (!rawVal) return;
          const d = new Date(t.date);
          if (isNaN(d.getTime())) return;
          const mKey = keyOf(d);
          if (!monthKeys.has(mKey)) return;

          const caseId = t.id || `${t.hn}|${formatDate(t.date)}`;
          // If Procedure Type, split comma-separated multi-select procedures so each selected procedure is counted
          const keysToRecord = isProc
            ? String(rawVal).split(',').map(s => s.trim()).filter(Boolean)
            : [String(rawVal).trim()];

          keysToRecord.forEach(keyName => {
            if (!caseMap.has(keyName)) {
              caseMap.set(keyName, { name: keyName, months: {}, allCases: new Set() });
            }
            const entry = caseMap.get(keyName);
            if (!entry.months[mKey]) entry.months[mKey] = new Set();
            entry.months[mKey].add(caseId);
            entry.allCases.add(caseId);
          });
        });

        let rows = Array.from(caseMap.values());
        if (isProc) {
          // Procedure type: DO NOT filter and DO NOT sort by total case (preserves settings order)
        } else {
          // Disease: filter by search and sort by total case
          if (searchQ) rows = rows.filter(r => r.name.toLowerCase().includes(searchQ));
          rows.sort((a, b) => b.allCases.size - a.allCases.size || a.name.localeCompare(b.name));
        }

        if (rows.length === 0) {
          body.innerHTML = `<tr><td colspan="${months.length + 2}" class="empty-state">No records found for the selected period.</td></tr>`;
          if (chartBodyEl) chartBodyEl.innerHTML = `<div class="empty-state text-sm" style="padding:12px;">No records found to chart.</div>`;
          return;
        }

        const monthTotals = {};
        let grandTotal = 0;

        const htmlRows = rows.map(r => {
          const rowTotal = r.allCases.size;
          grandTotal += rowTotal;
          months.forEach(m => {
            const c = r.months[m.key] ? r.months[m.key].size : 0;
            monthTotals[m.key] = (monthTotals[m.key] || 0) + c;
          });
          return `
            <tr>
              <td class="font-medium">${r.name}</td>
              ${months.map(m => `<td class="center">${r.months[m.key] ? r.months[m.key].size : 0}</td>`).join('')}
              <td class="center font-bold" style="background:var(--gray-50);">${rowTotal}</td>
            </tr>
          `;
        }).join('');

        const footerRow = `
          <tr style="background:var(--gray-100); font-weight:700;">
            <td style="text-align:right;">Total Cases</td>
            ${months.map(m => `<td class="center">${monthTotals[m.key] || 0}</td>`).join('')}
            <td class="center">${grandTotal}</td>
          </tr>
        `;
        body.innerHTML = htmlRows + footerRow;

        // Render Chart for Procedure Type or Disease
        if (chartBodyEl) {
          const palette = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#6366f1'];
          if (!isProc) {
            // Disease SVG Donut / Pie Chart + Legend
            const nonZeroRows = rows.filter(r => r.allCases.size > 0);
            if (nonZeroRows.length === 0) {
              chartBodyEl.innerHTML = `<div class="empty-state text-sm" style="padding:12px;">No disease cases in selected period.</div>`;
            } else {
              const rRadius = 54;
              const circum = 2 * Math.PI * rRadius;
              let accLen = 0;
              const circles = nonZeroRows.map((r, idx) => {
                const cnt = r.allCases.size;
                const frac = grandTotal > 0 ? (cnt / grandTotal) : 0;
                const segLen = frac * circum;
                const dashArray = `${segLen} ${circum - segLen}`;
                const dashOffset = -accLen;
                accLen += segLen;
                const col = palette[idx % palette.length];
                return `<circle cx="70" cy="70" r="${rRadius}" fill="transparent" stroke="${col}" stroke-width="22" stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 70 70)"/>`;
              }).join('');

              chartBodyEl.innerHTML = `
                <div class="flex items-center gap-4 flex-wrap" style="justify-content:space-around;">
                  <div style="position:relative; width:140px; height:140px; flex-shrink:0;">
                    <svg width="140" height="140" viewBox="0 0 140 140">
                      <circle cx="70" cy="70" r="${rRadius}" fill="transparent" stroke="#f3f4f6" stroke-width="22"/>
                      ${circles}
                      <text x="70" y="66" text-anchor="middle" font-size="18" font-weight="700" fill="#111827">${grandTotal}</text>
                      <text x="70" y="82" text-anchor="middle" font-size="10" fill="#6b7280">Total Cases</text>
                    </svg>
                  </div>
                  <div style="flex:1; min-width:240px; max-width:520px;" class="space-y-sm">
                    ${rows.map((r, idx) => {
                      const cnt = r.allCases.size;
                      const pct = grandTotal > 0 ? ((cnt / grandTotal) * 100).toFixed(1) : '0.0';
                      const col = palette[idx % palette.length];
                      return `
                        <div class="flex justify-between items-center text-xs" style="padding:4px 8px; background:var(--gray-50); border-radius:6px;">
                          <span class="flex items-center gap-2 font-medium">
                            <span style="width:10px; height:10px; border-radius:50%; background:${col}; display:inline-block;"></span>
                            ${escapeHtml(r.name)}
                          </span>
                          <span class="font-bold">${cnt} cases (${pct}%)</span>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }
          } else {
            // Procedure Type Horizontal Bar Chart
            const maxProc = Math.max(1, ...rows.map(r => r.allCases.size));
            chartBodyEl.innerHTML = `
              <div class="space-y-sm">
                ${rows.map((r, idx) => {
                  const cnt = r.allCases.size;
                  const barW = Math.round((cnt / maxProc) * 100);
                  const pct = grandTotal > 0 ? ((cnt / grandTotal) * 100).toFixed(1) : '0.0';
                  const col = palette[idx % palette.length];
                  return `
                    <div>
                      <div class="flex justify-between text-xs mb-1">
                        <span class="font-semibold">${escapeHtml(r.name)}</span>
                        <span class="font-bold">${cnt} cases (${pct}%)</span>
                      </div>
                      <div class="progress-track" style="height:10px;">
                        <div class="progress-fill" style="width:${barW}%; background:${col};"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `;
          }
        }
      }
    }

function exportStatisticsCSV() {
      const table = document.querySelector('#stat-print-card table');
      if (!table) return;
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length === 0) {
        showToast('No data to export');
        return;
      }
      const csvLines = rows.map(tr => {
        const cells = Array.from(tr.querySelectorAll('th, td'));
        return cells.map(cell => {
          let text = cell.innerText.trim();
          text = text.replace(/[\r\n]+/g, ' ');
          return '"' + text.replace(/"/g, '""') + '"';
        }).join(',');
      });
      if (state.statSubTab === 'shift') {
        csvLines.push('"P.S. X = no case"');
      }
      const sub = state.statSubTab || 'statistic';
      const rangeEl = document.getElementById('stat-range-label');
      const rangeText = (rangeEl ? rangeEl.innerText : '').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `INR_${sub}_${rangeText || getToday()}.csv`;
      const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Exported CSV: ' + filename);
    }

    function exportStatisticsPDF() {
      const sub = state.statSubTab || 'statistic';
      const rangeEl = document.getElementById('stat-range-label');
      const rangeText = (rangeEl ? rangeEl.innerText : '').replace(/[^a-zA-Z0-9]/g, '_');
      const origTitle = document.title;
      document.title = `INR_${sub}_${rangeText || getToday()}`;
      printStatistics();
      setTimeout(() => { document.title = origTitle; }, 1500);
    }

    function printStatistics() {
      const card = document.getElementById('stat-print-card');
      if (!card) return;
      const title = document.getElementById('stat-report-title')?.innerText || 'Statistics Report';
      const range = document.getElementById('stat-range-label')?.innerText || '';
      const table = card.querySelector('table');
      const tableHtml = table ? table.outerHTML : '';
      const isShift = state.statSubTab === 'shift';
      const noteHtml = isShift ? '<div style="font-size:11px; color:#6b7280; font-style:italic; margin-top:8px;">P.S. X = no case</div>' : '';
      const html = `
        <div style="padding:16px; font-family:'Noto Sans', 'Noto Sans Thai', sans-serif;">
          <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #111827; padding-bottom:8px; margin-bottom:12px;">
            <div>
              <h2 style="margin:0; font-size:18px; color:#111827;">Interventional Neuroradiology</h2>
              <div style="font-size:12px; color:#4b5563;">รังสีร่วมรักษาระบบประสาท</div>
              <div style="font-size:14px; font-weight:600; color:#374151; margin-top:4px;">${title}</div>
            </div>
            <div style="text-align:right; font-size:11px; color:#6b7280;">
              <div><strong>Period:</strong> ${range}</div>
              <div><strong>Printed:</strong> ${new Date().toLocaleString('en-GB')}</div>
            </div>
          </div>
          <div class="table-wrap" style="max-height:none;">
            ${tableHtml}
          </div>
          ${noteHtml}
        </div>
      `;
      printStageHtml(html);
    }

    // --- Tab 8: Settings ---
    const settingsTitles = {
      diseases: 'Disease',
      procedures: 'Procedure Types',
      shifts: 'Shift',
      users: 'User',
      categories: 'Category',
      departments: 'Departments (Internal Rooms & External Facilities)'
    };

    function switchSettingsSection(sec) {
      state.settingsSection = sec;
      state.editingSettingIdx = -1;
      cancelAddSettingItem();
      document.querySelectorAll('#settings-subtabs .sub-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sec === sec);
      });
      renderSettingsTab();
    }

    function renderSettingsTab() {
      const sec = state.settingsSection || 'diseases';
      const listCard = document.getElementById('settings-list-card');
      const userCard = document.getElementById('settings-user-card');
      const secCard  = document.getElementById('settings-security-card');
      const hierCard = document.getElementById('settings-hierarchy-card');
      const scopeSel = document.getElementById('settings-add-dept-scope');
      if (scopeSel) scopeSel.classList.toggle('hidden', sec !== 'departments');

      if (sec === 'hierarchy') {
        if (listCard) listCard.classList.add('hidden');
        if (userCard) userCard.classList.add('hidden');
        if (secCard)  secCard.classList.add('hidden');
        if (hierCard) hierCard.classList.remove('hidden');
        renderHierarchySettings();
        return;
      } else {
        if (hierCard) hierCard.classList.add('hidden');
      }

      if (sec === 'security') {
        if (listCard) listCard.classList.add('hidden');
        if (userCard) userCard.classList.add('hidden');
        if (secCard) secCard.classList.remove('hidden');
        return;
      } else {
        if (secCard) secCard.classList.add('hidden');
      }

      if (sec === 'users') {
        if (listCard) listCard.classList.add('hidden');
        if (userCard) userCard.classList.remove('hidden');
        const dirtyBadge = document.getElementById('settings-user-dirty');
        if (dirtyBadge) dirtyBadge.classList.toggle('hidden', !state.settingsDirty.users);

        const tbody = document.getElementById('settings-users-body');
        const users = state.settings.users || [];
        if (users.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No users configured yet. Click "+ Add" to add a user.</td></tr>';
        } else {
          tbody.innerHTML = users.map((u, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === users.length - 1;
            return `
            <tr>
              <td class="font-medium">${u.name || ''}</td>
              <td>${u.surname || ''}</td>
              <td class="text-gray">${u.nickname || ''}</td>
              <td><span class="badge badge-blue">${u.position || '—'}</span></td>
              <td><span class="badge badge-ok">${u.authorization || '—'}</span></td>
              <td class="text-gray">${u.phone || u.tel || ''}</td>
              <td class="text-gray">${u.dob ? formatDate(u.dob) : ''}</td>
              <td class="center" style="white-space:nowrap;">
                <button class="btn-ghost" onclick="moveUser(${idx}, -1)" ${isFirst ? 'disabled style="opacity:0.25; cursor:default;"' : ''} title="Move Up">▲</button>
                <button class="btn-ghost" onclick="moveUser(${idx}, 1)" ${isLast ? 'disabled style="opacity:0.25; cursor:default;"' : ''} title="Move Down">▼</button>
                <button class="btn-ghost" onclick="openUserModal(${idx})" title="Edit">${ICONS.edit}</button>
                <button class="btn-ghost" style="color:var(--red);" onclick="removeUser(${idx})" title="Remove">${ICONS.trash}</button>
              </td>
            </tr>
          `;
          }).join('');
        }
      } else {
        if (listCard) listCard.classList.remove('hidden');
        if (userCard) userCard.classList.add('hidden');
        document.getElementById('settings-list-title').innerText = settingsTitles[sec] || sec;
        const dirtyBadge = document.getElementById('settings-list-dirty');
        if (dirtyBadge) dirtyBadge.classList.toggle('hidden', !state.settingsDirty[sec]);

        const list = state.settings[sec] || [];
        const container = document.getElementById('settings-list-container');
        if (list.length === 0) {
          container.innerHTML = `<div class="empty-state">No ${settingsTitles[sec] || sec} items configured yet. Click "+ Add" to add one.</div>`;
        } else {
          container.innerHTML = list.map((item, idx) => {
            if (state.editingSettingIdx === idx) {
              return `
                <div class="settings-item" style="gap:8px;">
                  <input type="text" id="settings-edit-input-${idx}" class="form-input form-input-sm" value="${escapeHtml(item)}" style="flex:1;" onkeydown="if(event.key==='Enter') saveEditSettingItem(${idx})">
                  <div class="flex gap-2">
                    <button class="btn btn-brand btn-sm" onclick="saveEditSettingItem(${idx})">OK</button>
                    <button class="btn btn-outline btn-sm" onclick="cancelEditSettingItem()">Cancel</button>
                  </div>
                </div>
              `;
            }
            const isFirst = idx === 0;
            const isLast = idx === list.length - 1;
            let displayHtml = `<span class="font-medium">${item}</span>`;
            if (sec === 'departments' && item.includes('|')) {
              const parts = item.split('|').map(s => s.trim());
              const sc = parts[0];
              const nm = parts.slice(1).join(' | ');
              const badgeCls = sc.toLowerCase() === 'external' ? 'badge-amber' : 'badge-blue';
              displayHtml = `<span class="badge ${badgeCls}">${sc}</span> <span class="font-medium">${nm}</span>`;
            }
            return `
              <div class="settings-item">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray font-mono" style="min-width:20px;">${idx + 1}.</span>
                  ${displayHtml}
                </div>
                <div class="flex gap-1 items-center">
                  <button class="btn-ghost" onclick="moveSettingItem(${idx}, -1)" ${isFirst ? 'disabled style="opacity:0.25; cursor:default;"' : ''} title="Move Up">▲</button>
                  <button class="btn-ghost" onclick="moveSettingItem(${idx}, 1)" ${isLast ? 'disabled style="opacity:0.25; cursor:default;"' : ''} title="Move Down">▼</button>
                  <button class="btn-ghost" onclick="startEditSettingItem(${idx})" title="Edit">${ICONS.edit}</button>
                  <button class="btn-ghost" style="color:var(--red);" onclick="removeSettingItem(${idx})" title="Remove">${ICONS.trash}</button>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    }

    function startAddSettingItem() {
      const row = document.getElementById('settings-add-row');
      const input = document.getElementById('settings-add-input');
      const scopeSel = document.getElementById('settings-add-dept-scope');
      if (scopeSel) scopeSel.classList.toggle('hidden', state.settingsSection !== 'departments');
      if (row) row.classList.remove('hidden');
      if (input) {
        input.placeholder = state.settingsSection === 'departments' ? 'e.g. BIR Room, Operating Room (OR), Siriraj Hospital...' : 'New item...';
        input.value = '';
        input.focus();
      }
    }

    function cancelAddSettingItem() {
      const row = document.getElementById('settings-add-row');
      const input = document.getElementById('settings-add-input');
      if (row) row.classList.add('hidden');
      if (input) input.value = '';
    }

    function confirmAddSettingItem() {
      const sec = state.settingsSection || 'diseases';
      const input = document.getElementById('settings-add-input');
      let val = (input ? input.value : '').trim();
      if (!val) return;
      if (sec === 'departments' && !val.includes('|')) {
        const scopeSel = document.getElementById('settings-add-dept-scope');
        const sc = scopeSel ? scopeSel.value : 'Internal';
        val = `${sc} | ${val}`;
      }
      if (!Array.isArray(state.settings[sec])) state.settings[sec] = [];
      state.settings[sec].push(val);
      state.settingsDirty[sec] = true;
      cancelAddSettingItem();
      renderSettingsTab();
    }

    function startEditSettingItem(idx) {
      state.editingSettingIdx = idx;
      renderSettingsTab();
      setTimeout(() => {
        const el = document.getElementById('settings-edit-input-' + idx);
        if (el) el.focus();
      }, 20);
    }

    function saveEditSettingItem(idx) {
      const sec = state.settingsSection || 'diseases';
      const el = document.getElementById('settings-edit-input-' + idx);
      const val = (el ? el.value : '').trim();
      if (!val) return;
      state.settings[sec][idx] = val;
      state.editingSettingIdx = -1;
      state.settingsDirty[sec] = true;
      renderSettingsTab();
    }

    function cancelEditSettingItem() {
      state.editingSettingIdx = -1;
      renderSettingsTab();
    }

    function removeSettingItem(idx) {
      const sec = state.settingsSection || 'diseases';
      const item = (state.settings[sec] || [])[idx];
      const name = (typeof item === 'object' ? item.name : item) || 'item';
      verifyPasscodeThen(state.currentLang === 'th' ? `ยืนยันการลบ "${name}"?` : `Delete "${name}" from ${sec}?`, () => {
        state.settings[sec].splice(idx, 1);
        state.settingsDirty[sec] = true;
        renderSettingsTab();
      });
    }

    function moveSettingItem(idx, dir) {
      const sec = state.settingsSection || 'diseases';
      const list = state.settings[sec];
      if (!list) return;
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= list.length) return;
      const temp = list[idx];
      list[idx] = list[targetIdx];
      list[targetIdx] = temp;
      state.settingsDirty[sec] = true;
      renderSettingsTab();
    }

    function moveUser(idx, dir) {
      const users = state.settings.users;
      if (!users) return;
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= users.length) return;
      const temp = users[idx];
      users[idx] = users[targetIdx];
      users[targetIdx] = temp;
      state.settings.techs = state.settings.users;
      state.settingsDirty.users = true;
      renderSettingsTab();
    }

    function saveSettingsList() {
      const sec = state.settingsSection || 'diseases';
      const btn = document.getElementById('btn-save-settings-list');
      if (btn) { btn.innerText = 'Saving...'; btn.disabled = true; }

      if (isApiConfigured()) {
        callApi('saveOthersList', { key: sec, list: state.settings[sec] || [] })
          .then(() => {
            if (btn) { btn.innerText = 'Save Order'; btn.disabled = false; }
            state.settingsDirty[sec] = false;
            showToast((settingsTitles[sec] || sec) + ' saved to Others sheet!');
            renderSettingsTab();
          })
          .catch(err => {
            if (btn) { btn.innerText = 'Save Order'; btn.disabled = false; }
            showToast('Save failed: ' + (err.message || err));
          });
      } else {
        if (btn) { btn.innerText = 'Save Order'; btn.disabled = false; }
        state.settingsDirty[sec] = false;
        showToast((settingsTitles[sec] || sec) + ' saved (mock)');
        renderSettingsTab();
      }
    }

    function openUserModal(idx) {
      const isEdit = idx >= 0;
      document.getElementById('modal-user-title').innerText = isEdit ? 'Edit User' : 'Add User';
      document.getElementById('user-modal-idx').value = String(idx);

      // Populate Position datalist (standard + any custom positions)
      const defaultPositions = ['Radiological Technologist', 'Registered Nurse', 'Practical Nurse'];
      const customPositions = (state.settings.users || []).map(u => u.position).filter(Boolean);
      const allPositions = Array.from(new Set([...defaultPositions, ...customPositions]));
      const posList = document.getElementById('user-position-list');
      if (posList) {
        posList.innerHTML = allPositions.map(p => `<option value="${escapeHtml(p)}">`).join('');
      }

      const u = isEdit ? (state.settings.users[idx] || {}) : {};
      document.getElementById('user-modal-name').value = u.name || '';
      document.getElementById('user-modal-surname').value = u.surname || '';
      document.getElementById('user-modal-nickname').value = u.nickname || '';
      document.getElementById('user-modal-position').value = u.position || 'Radiological Technologist';
      document.getElementById('user-modal-auth').value = u.authorization || 'Operational Staff';
      document.getElementById('user-modal-phone').value = u.phone || u.tel || '';
      document.getElementById('user-modal-dob').value = u.dob ? String(u.dob).slice(0, 10) : '';

      openModal('modal-user');
    }

    function applyUserModal() {
      const idx = parseInt(document.getElementById('user-modal-idx').value);
      const name = document.getElementById('user-modal-name').value.trim();
      if (!name) {
        showToast('User name is required');
        return;
      }
      const userObj = {
        name,
        surname: document.getElementById('user-modal-surname').value.trim(),
        nickname: document.getElementById('user-modal-nickname').value.trim(),
        position: document.getElementById('user-modal-position').value.trim(),
        authorization: document.getElementById('user-modal-auth').value,
        phone: document.getElementById('user-modal-phone').value.trim(),
        dob: document.getElementById('user-modal-dob').value
      };
      userObj.tel = userObj.phone;

      if (!Array.isArray(state.settings.users)) state.settings.users = [];
      if (idx >= 0 && idx < state.settings.users.length) {
        state.settings.users[idx] = userObj;
      } else {
        state.settings.users.push(userObj);
      }
      state.settings.techs = state.settings.users;
      state.settingsDirty.users = true;
      closeModal();
      renderSettingsTab();
    }

    function removeUser(idx) {
      const u = (state.settings.users || [])[idx];
      const uName = u ? (u.name + ' ' + (u.surname || '')) : 'staff member';
      verifyPasscodeThen(state.currentLang === 'th' ? `ยืนยันการลบผู้ใช้ "${uName}"?` : `Remove staff user "${uName}"?`, () => {
        state.settings.users.splice(idx, 1);
        state.settings.techs = state.settings.users;
        state.settingsDirty.users = true;
        renderSettingsTab();
      });
    }

    function saveUsersList() {
      const btn = document.getElementById('btn-save-users');
      if (btn) { btn.innerText = 'Saving...'; btn.disabled = true; }

      if (isApiConfigured()) {
        callApi('saveUsers', { users: state.settings.users || [] })
          .then(() => {
            if (btn) { btn.innerText = 'Save Order'; btn.disabled = false; }
            state.settingsDirty.users = false;
            showToast('Users saved to User sheet!');
            renderSettingsTab();
          })
          .catch(err => {
            if (btn) { btn.innerText = 'Save Order'; btn.disabled = false; }
            showToast('Save failed: ' + (err.message || err));
          });
      } else {
        if (btn) { btn.innerText = 'Save Order'; btn.disabled = false; }
        state.settingsDirty.users = false;
        showToast('Users saved (mock)');
        renderSettingsTab();
      }
    }

    // ════════════════════════════════════════════════════════════════
    // SETTINGS: DEVICE & SUB-DEVICE HIERARCHY MANAGEMENT
    // ════════════════════════════════════════════════════════════════
    function renderHierarchySettings() {
      recalculateInventoryHierarchy();
      const childSel  = document.getElementById('hier-assign-child-select');
      const parentSel = document.getElementById('hier-assign-parent-select');
      const treeEl    = document.getElementById('settings-hierarchy-tree');

      const parents  = (state.inventory || []).filter(i => i.isParent);
      const children = (state.inventory || []).filter(i => !i.isParent);

      if (childSel) {
        const curChild = childSel.value;
        childSel.innerHTML = `<option value="">-- Select Sub-Device --</option>` +
          children.map(c => {
            const pObj = c.parentId ? parents.find(p => String(p.itemId) === String(c.parentId)) : null;
            const pTag = pObj ? ` [in ${pObj.deviceName}]` : ' [Standalone]';
            const fTag = c.isFreeItem ? ' [FREE]' : '';
            return `<option value="${escapeHtml(String(c.itemId))}" ${String(c.itemId) === String(curChild) ? 'selected' : ''}>${escapeHtml(c.deviceName)}${fTag}${escapeHtml(pTag)}</option>`;
          }).join('');
      }

      if (parentSel) {
        const curParent = parentSel.value;
        parentSel.innerHTML = `<option value="">-- Standalone (No Parent Group) --</option>` +
          parents.map(p => `<option value="${escapeHtml(String(p.itemId))}" ${String(p.itemId) === String(curParent) ? 'selected' : ''}>${escapeHtml(p.deviceName)} (${escapeHtml(p.category || '—')})</option>`).join('');
      }

      if (!treeEl) return;

      if (parents.length === 0) {
        treeEl.innerHTML = `<div class="empty-state text-sm">No Parent Device Groups created yet. Click "+ New Parent Device Group" above to create a group (e.g., Solitaire Platinum, Rebar Microcatheter).</div>`;
        return;
      }

      treeEl.innerHTML = parents.map(p => {
        const groupKids = children.filter(c => String(c.parentId) === String(p.itemId));
        return `
          <div class="hierarchy-group-card">
            <div class="hierarchy-group-header">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="badge-parent">PARENT GROUP</span>
                  <strong class="text-sm">${escapeHtml(p.deviceName)}</strong>
                  <span class="badge badge-gray">${escapeHtml(p.category || '—')}</span>
                  <span class="text-xs font-mono text-gray">ID: ${escapeHtml(p.itemId)}</span>
                  ${p.hoItemId ? `<span class="text-xs font-mono text-gray">· HO ID: ${escapeHtml(p.hoItemId)}</span>` : ''}
                </div>
                <div class="text-xs text-gray mt-1">
                  Aggregated Stock — Main: <strong>${p.mainStock || 0}</strong> · Retail: <strong>${p.retailStock || 0}</strong> · Total: <strong style="color:var(--brand-dark);">${p.totalStock || 0}</strong> · HO Stock: <strong>${p.hoStock || 0}</strong> · Diff: <strong>${p.stockDiff > 0 ? ('+' + p.stockDiff) : (p.stockDiff || 0)}</strong>
                </div>
              </div>
              <div class="flex gap-1">
                <button type="button" class="btn btn-outline btn-sm" onclick="openEditDeviceModal('${escapeHtml(p.itemId)}')">${ICONS.edit} Edit Group</button>
                <button type="button" class="btn-ghost" style="color:var(--red);" onclick="removeDevice('${escapeHtml(p.itemId)}')" title="Delete Parent Group">${ICONS.trash}</button>
              </div>
            </div>
            <div class="hierarchy-children-list">
              ${groupKids.length === 0
                ? `<div class="text-xs text-gray" style="padding:4px 8px;">No Sub-Devices assigned to this group yet. Use the Quick Assign box above to attach sizes or free items.</div>`
                : groupKids.map(c => `
                  <div class="hierarchy-child-item">
                    <div>
                      <span style="color:#64748b; font-family:monospace; margin-right:4px;">└</span>
                      <strong>${escapeHtml(c.deviceName)}</strong>
                      ${c.isFreeItem ? `<span class="badge-free" style="margin-left:4px;">FREE</span>` : ''}
                      <span class="text-xs font-mono text-gray" style="margin-left:6px;">(${escapeHtml(c.itemId)})</span>
                      <span class="text-xs text-gray" style="margin-left:8px;">Main: ${c.mainStock || 0} · Retail: <strong>${c.retailStock || 0}</strong> · Total: <strong>${c.totalStock || 0}</strong></span>
                    </div>
                    <div class="flex gap-1 items-center">
                      <button type="button" class="btn btn-outline btn-sm" style="padding:2px 8px; font-size:11px;" onclick="toggleItemFreeStatus('${escapeHtml(c.itemId)}')" title="Toggle Free Item status">${c.isFreeItem ? 'Set Paid' : 'Set Free'}</button>
                      <button type="button" class="btn-ghost text-xs" onclick="openEditDeviceModal('${escapeHtml(c.itemId)}')" title="Edit Sub-Device">${ICONS.edit}</button>
                      <button type="button" class="btn btn-outline btn-sm" style="padding:2px 8px; font-size:11px;" onclick="quickAssignChildParent('${escapeHtml(c.itemId)}', '')">Unassign</button>
                    </div>
                  </div>
                `).join('')
              }
            </div>
          </div>
        `;
      }).join('');

      const standaloneKids = children.filter(c => !c.parentId);
      if (standaloneKids.length > 0) {
        treeEl.innerHTML += `
          <div class="hierarchy-group-card" style="margin-top:16px; border-color:var(--gray-300);">
            <div class="hierarchy-group-header" style="background:var(--gray-100);">
              <div>
                <strong class="text-sm">Standalone Sub-Devices (${standaloneKids.length})</strong>
                <div class="text-xs text-gray">Devices currently not assigned to any Parent Group. Manage Free Item status or assign to a Parent Group above.</div>
              </div>
            </div>
            <div class="hierarchy-children-list">
              ${standaloneKids.map(c => `
                <div class="hierarchy-child-item">
                  <div>
                    <span style="color:#94a3b8; font-family:monospace; margin-right:4px;">•</span>
                    <strong>${escapeHtml(c.deviceName)}</strong>
                    ${c.isFreeItem ? `<span class="badge-free" style="margin-left:4px;">FREE</span>` : `<span class="badge badge-blue" style="margin-left:4px;">PO</span>`}
                    <span class="badge badge-gray" style="margin-left:4px;">${escapeHtml(c.category || '—')}</span>
                    <span class="text-xs font-mono text-gray" style="margin-left:6px;">(${escapeHtml(c.itemId)})</span>
                    <span class="text-xs text-gray" style="margin-left:8px;">Main: ${c.mainStock || 0} · Retail: <strong>${c.retailStock || 0}</strong> · Total: <strong>${c.totalStock || 0}</strong></span>
                  </div>
                  <div class="flex gap-1 items-center">
                    <button type="button" class="btn btn-outline btn-sm" style="padding:2px 8px; font-size:11px;" onclick="toggleItemFreeStatus('${escapeHtml(c.itemId)}')" title="Toggle Free Item status">${c.isFreeItem ? 'Set Paid' : 'Set Free'}</button>
                    <button type="button" class="btn-ghost text-xs" onclick="openEditDeviceModal('${escapeHtml(c.itemId)}')" title="Edit Device">${ICONS.edit}</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    }

    function toggleItemFreeStatus(itemId) {
      const item = state.inventory.find(i => String(i.itemId) === String(itemId));
      if (!item) return;
      const newFree = !item.isFreeItem;
      const confirmMsg = newFree
        ? (state.currentLang === 'th' ? `กำหนด "${item.deviceName}" เป็นของแถม (Free Item: Buy Price = 0, ไม่ตรวจ HO Stock)?` : `Mark "${item.deviceName}" as Free item (Buy Price = 0, no HO tracking)?`)
        : (state.currentLang === 'th' ? `เปลี่ยน "${item.deviceName}" กลับเป็นอุปกรณ์ซื้อขาดปกติ (PO Item)?` : `Set "${item.deviceName}" as standard PO item?`);
      if (!confirm(confirmMsg)) return;

      if (isApiConfigured()) {
        setSyncIndicator(true);
        callApi('setItemFreeStatus', { itemId: item.itemId, isFreeItem: newFree })
          .then(() => {
            setSyncIndicator(false);
            showToast(newFree ? `Marked "${item.deviceName}" as Free item` : `Set "${item.deviceName}" as PO item`);
            fetchDataFromServer();
          })
          .catch(err => {
            setSyncIndicator(false);
            showToast('Failed: ' + (err.message || err));
          });
      } else {
        item.isFreeItem = newFree;
        if (newFree) item.buyPrice = 0;
        recalculateInventoryHierarchy();
        renderHierarchySettings();
        showToast(newFree ? `Marked "${item.deviceName}" as Free item (mock)` : `Set "${item.deviceName}" as PO item (mock)`);
      }
    }

    function submitQuickHierarchyAssign() {
      const childId  = document.getElementById('hier-assign-child-select')?.value || '';
      const parentId = document.getElementById('hier-assign-parent-select')?.value || '';
      if (!childId) {
        showToast('Please select a Child Sub-Device first');
        return;
      }
      quickAssignChildParent(childId, parentId);
    }

    function quickAssignChildParent(childItemId, parentId) {
      if (isApiConfigured()) {
        setSyncIndicator(true);
        callApi('assignChildParent', { childItemId, parentId })
          .then(() => {
            setSyncIndicator(false);
            showToast(parentId ? 'Assigned Sub-Device to Parent Group!' : 'Unassigned Sub-Device (now Standalone)');
            fetchDataFromServer();
          })
          .catch(err => {
            setSyncIndicator(false);
            showToast('Failed: ' + (err.message || err));
          });
      } else {
        const child = state.inventory.find(i => String(i.itemId) === String(childItemId));
        if (child) {
          child.parentId = parentId || '';
          recalculateInventoryHierarchy();
          renderHierarchySettings();
          showToast(parentId ? 'Assigned Sub-Device (mock)' : 'Unassigned Sub-Device (mock)');
        }
      }
    }

    // ════════════════════════════════════════════════════════════════
    // MODULE 2 & 3: EXCHANGE QUOTA TRACKER & CONSIGNMENT HOLD (BUFFER)
    // ════════════════════════════════════════════════════════════════
    function switchExchangeSubTab(sub) {
      state.exchangeSubTab = sub;
      document.querySelectorAll('#ex-subtabs .sub-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.ex === sub);
      });
      const qPanel = document.getElementById('ex-panel-quota');
      const cPanel = document.getElementById('ex-panel-consignment');
      if (qPanel) qPanel.classList.toggle('hidden', sub !== 'quota');
      if (cPanel) cPanel.classList.toggle('hidden', sub !== 'consignment');
      renderExchangeTab();
    }

    function renderExchangeTab() {
      // Update badge counts
      const quotas = state.exchangeQuotas || [];
      const consignments = state.consignments || [];
      const activeQuotaCount = quotas.filter(q => String(q.status || 'Active') === 'Active').length;
      const holdingCsgCount  = consignments.filter(c => String(c.status || 'Holding') === 'Holding').length;

      const qCountEl = document.getElementById('ex-quota-active-count');
      if (qCountEl) qCountEl.innerText = activeQuotaCount;
      const cCountEl = document.getElementById('ex-csg-holding-count');
      if (cCountEl) cCountEl.innerText = holdingCsgCount;

      // 1. Render Exchange Quota Tracker Table
      const qBody = document.getElementById('ex-quota-table-body');
      if (qBody) {
        const statusFilter = document.getElementById('ex-quota-filter-status')?.value || '';
        const searchQ = (document.getElementById('ex-quota-search')?.value || '').toLowerCase().trim();

        const filteredQuotas = quotas.filter(q => {
          if (statusFilter && String(q.status) !== statusFilter) return false;
          if (!searchQ) return true;
          const physName = getDeviceName(q.physicalItemId).toLowerCase();
          const subName  = getDeviceName(q.substitutedItemId).toLowerCase();
          return physName.includes(searchQ) || subName.includes(searchQ) || String(q.notes || '').toLowerCase().includes(searchQ) || String(q.quotaId || '').toLowerCase().includes(searchQ);
        });

        if (filteredQuotas.length === 0) {
          qBody.innerHTML = '<tr><td colspan="8" class="empty-state">No substitution quota rules found. Click "+ New Exchange Rule" to create one.</td></tr>';
        } else {
          qBody.innerHTML = filteredQuotas.map(q => {
            const total = Number(q.totalQuota) || 1;
            const used  = Number(q.currentUsed) || 0;
            const rem   = Math.max(0, total - used);
            const pct   = Math.min(100, Math.round((used / total) * 100));
            const isDone = q.status === 'Completed' || used >= total;
            const histCount = Array.isArray(q.history) ? q.history.length : 0;
            const physInv = state.inventory.find(i => String(i.itemId) === String(q.physicalItemId));
            const retailNow = physInv ? (Number(physInv.retailStock) || 0) : 0;
            const usedPieces = getQuotaUsedPieces(q);
            const availPieces = getQuotaAvailablePieces(q);

            return `
              <tr>
                <td class="text-xs text-gray">${formatDate(q.createdDate)}<div class="font-mono">${q.quotaId || ''}</div></td>
                <td>
                  <div class="font-semibold">${getDeviceName(q.physicalItemId)}</div>
                  <div class="text-xs text-gray">Retail stock: <strong>${retailNow}</strong></div>
                </td>
                <td>
                  <span class="badge badge-purple">${getDeviceName(q.substitutedItemId)}</span>
                </td>
                <td>
                  <div class="flex justify-between text-xs font-semibold mb-2">
                    <span>${used} / ${total} units</span>
                    <span>${pct}%</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill ${isDone ? 'done' : ''}" style="width:${pct}%;"></div>
                  </div>
                  <div class="text-xs text-gray mt-1" style="font-size:11px;">
                    <span>Used: <strong>${formatPiecesList(usedPieces)}</strong></span>
                    &nbsp;|&nbsp;
                    <span style="color:var(--brand-dark);">Available: <strong>${formatPiecesList(availPieces)}</strong></span>
                  </div>
                </td>
                <td class="center font-bold" style="color:${rem === 0 ? 'var(--gray-400)' : 'var(--brand-dark)'};">${rem}</td>
                <td class="center">
                  <span class="badge ${isDone ? 'badge-purple' : 'badge-ok'}">${isDone ? 'Completed' : 'Active'}</span>
                </td>
                <td class="text-sm text-gray">${q.notes || '—'}</td>
                <td class="center" style="white-space:nowrap;">
                  <button class="btn btn-outline btn-sm" onclick="openExchangeHistoryModal('${escapeHtml(q.quotaId)}')" title="View Case History">${ICONS.list} Cases (${histCount})</button>
                  <button class="btn-ghost" onclick="openExchangeQuotaModal('${escapeHtml(q.quotaId)}')" title="Edit Rule">${ICONS.edit}</button>
                  <button class="btn-ghost" style="color:var(--red);" onclick="removeExchangeQuota('${escapeHtml(q.quotaId)}')" title="Delete">${ICONS.trash}</button>
                </td>
              </tr>
            `;
          }).join('');
        }
      }

      // 2. Render Consignment & Vendor Quarantine Hold Table
      const cBody = document.getElementById('csg-table-body');
      if (cBody) {
        const cStatus = document.getElementById('csg-filter-status')?.value || '';
        const cSearch = (document.getElementById('csg-search')?.value || '').toLowerCase().trim();

        const filteredCsg = consignments.filter(c => {
          if (cStatus && String(c.status) !== cStatus) return false;
          if (!cSearch) return true;
          return (
            String(c.vendorName || '').toLowerCase().includes(cSearch) ||
            String(c.itemName || '').toLowerCase().includes(cSearch) ||
            String(c.contactPerson || '').toLowerCase().includes(cSearch) ||
            String(c.pickupRep || '').toLowerCase().includes(cSearch) ||
            String(c.holdId || '').toLowerCase().includes(cSearch)
          );
        });

        if (filteredCsg.length === 0) {
          cBody.innerHTML = '<tr><td colspan="8" class="empty-state">No consignment or vendor quarantine hold items found.</td></tr>';
        } else {
          cBody.innerHTML = filteredCsg.map(c => {
            const isHolding = String(c.status || 'Holding') === 'Holding';
            const pickupInfo = (!isHolding && (c.pickupDate || c.pickupRep))
              ? `<div class="text-xs" style="color:var(--brand-dark); margin-top:2px;">Picked up on <strong>${formatDate(c.pickupDate)}</strong> by <strong>${c.pickupRep || '—'}</strong></div>`
              : '';
            return `
              <tr>
                <td class="text-xs text-gray">${formatDate(c.dateDeposited)}<div class="font-mono">${c.holdId || ''}</div></td>
                <td class="font-semibold">${c.vendorName || '—'}</td>
                <td>
                  <div>${c.contactPerson || '—'}</div>
                  <div class="text-xs text-gray">${c.contactPhone || ''}</div>
                </td>
                <td>
                  <div class="font-medium">${c.itemName || getDeviceName(c.itemId)}</div>
                  <span class="badge badge-purple" style="margin-top:2px;">Buffer (Locked from Procedure Use)</span>
                </td>
                <td class="center font-bold">${c.quantity}</td>
                <td class="center">
                  <span class="badge ${isHolding ? 'badge-amber' : 'badge-ok'}">${isHolding ? 'Holding' : 'Returned'}</span>
                </td>
                <td class="text-sm">
                  <div class="text-gray">${c.notes || '—'}</div>
                  ${pickupInfo}
                </td>
                <td class="center" style="white-space:nowrap;">
                  ${isHolding ? `<button class="btn btn-brand btn-sm" onclick="openConsignmentReturnModal('${escapeHtml(c.holdId)}')">${ICONS.check} Mark as Returned</button>` : ''}
                  <button class="btn-ghost" style="color:var(--red);" onclick="removeConsignmentHold('${escapeHtml(c.holdId)}')" title="Delete">${ICONS.trash}</button>
                </td>
              </tr>
            `;
          }).join('');
        }
      }
    }

    function openExchangeQuotaModal(quotaId) {
      const isEdit = Boolean(quotaId);
      const q = isEdit ? (state.exchangeQuotas || []).find(x => String(x.quotaId) === String(quotaId)) : null;
      document.getElementById('modal-ex-quota-title').innerText = isEdit ? 'Edit Substitution Quota Rule' : 'New Substitution Quota Rule';
      document.getElementById('ex-modal-quota-id').value = q ? q.quotaId : '';

      const optsHtml = '<option value="">— Select Device —</option>' + getTransactableInventory().map(i =>
        `<option value="${escapeHtml(String(i.itemId))}">${i.deviceName}${i.isFreeItem ? ' [FREE]' : ''} (${i.category || '—'} · Retail: ${i.retailStock || 0})</option>`
      ).join('');
      const physSel = document.getElementById('ex-modal-phys-item');
      const subSel  = document.getElementById('ex-modal-sub-item');
      physSel.innerHTML = optsHtml;
      subSel.innerHTML  = optsHtml;

      if (q) {
        physSel.value = String(q.physicalItemId || '');
        subSel.value  = String(q.substitutedItemId || '');
        document.getElementById('ex-modal-total-quota').value  = q.totalQuota || 20;
        document.getElementById('ex-modal-current-used').value = q.currentUsed || 0;
        document.getElementById('ex-modal-status').value       = q.status || 'Active';
        document.getElementById('ex-modal-notes').value        = q.notes || '';
      } else {
        physSel.value = '';
        subSel.value  = '';
        document.getElementById('ex-modal-total-quota').value  = 20;
        document.getElementById('ex-modal-current-used').value = 0;
        document.getElementById('ex-modal-status').value       = 'Active';
        document.getElementById('ex-modal-notes').value        = '';
      }
      openModal('modal-exchange-quota');
    }

    function saveExchangeQuotaModal() {
      const quotaId           = document.getElementById('ex-modal-quota-id').value.trim();
      const physicalItemId    = document.getElementById('ex-modal-phys-item').value;
      const substitutedItemId = document.getElementById('ex-modal-sub-item').value;
      const totalQuota        = parseInt(document.getElementById('ex-modal-total-quota').value) || 0;
      const currentUsed       = Math.max(0, parseInt(document.getElementById('ex-modal-current-used').value) || 0);
      let status              = document.getElementById('ex-modal-status').value || 'Active';
      const notes             = document.getElementById('ex-modal-notes').value.trim();

      if (!physicalItemId || !substitutedItemId) {
        showToast('Please select both Physical Item and Substituted Item');
        return;
      }
      if (physicalItemId === substitutedItemId) {
        showToast('Physical Item and Substituted Item must be different');
        return;
      }
      if (totalQuota <= 0) {
        showToast('Total Quota must be greater than 0');
        return;
      }
      if (currentUsed >= totalQuota) status = 'Completed';

      const payload = {
        quotaId,
        createdDate: getToday(),
        physicalItemId,
        substitutedItemId,
        totalQuota,
        currentUsed,
        status,
        notes
      };

      closeModal();
      if (isApiConfigured()) {
        appLoading.classList.remove('hidden');
        appContent.classList.add('hidden');
        callApi('saveExchangeQuota', payload)
          .then(() => {
            showToast(quotaId ? 'Quota rule updated!' : 'Quota rule created!');
            fetchDataFromServer();
          })
          .catch(err => {
            showToast('Failed: ' + (err.message || err));
            appLoading.classList.add('hidden');
            appContent.classList.remove('hidden');
          });
      } else {
        if (!Array.isArray(state.exchangeQuotas)) state.exchangeQuotas = [];
        if (quotaId) {
          const idx = state.exchangeQuotas.findIndex(x => String(x.quotaId) === String(quotaId));
          if (idx >= 0) state.exchangeQuotas[idx] = Object.assign({}, state.exchangeQuotas[idx], payload);
        } else {
          payload.quotaId = 'EXQ-' + Date.now().toString().slice(-6);
          payload.history = [];
          state.exchangeQuotas.unshift(payload);
        }
        showToast(quotaId ? 'Quota rule updated (mock)' : 'Quota rule created (mock)');
        renderCurrentTab();
      }
    }

    function openExchangeHistoryModal(quotaId) {
      const q = (state.exchangeQuotas || []).find(x => String(x.quotaId) === String(quotaId));
      if (!q) return;
      const usedPieces = getQuotaUsedPieces(q);
      const availPieces = getQuotaAvailablePieces(q);
      document.getElementById('modal-ex-hist-title').innerText = `Case History — ${q.quotaId}`;
      document.getElementById('modal-ex-hist-summary').innerHTML = `
        <div class="flex justify-between items-center flex-wrap gap-2">
          <div>
            <strong>Physical Item:</strong> ${getDeviceName(q.physicalItemId)} &nbsp;→&nbsp;
            <strong>Substituted For:</strong> <span class="badge badge-purple">${getDeviceName(q.substitutedItemId)}</span>
          </div>
          <div>
            <strong>Quota Used:</strong> ${q.currentUsed} / ${q.totalQuota} units
            (<span class="badge ${q.status === 'Completed' ? 'badge-purple' : 'badge-ok'}">${q.status}</span>)
          </div>
        </div>
        <div class="text-xs mt-2 pt-2" style="border-top:1px dashed var(--gray-200);">
          <span>Used Pieces: <strong>${formatPiecesList(usedPieces)}</strong></span> &nbsp;|&nbsp;
          <span style="color:var(--brand-dark);">Available Pieces: <strong>${formatPiecesList(availPieces)}</strong></span>
        </div>
      `;
      const tbody = document.getElementById('modal-ex-hist-body');
      const hist = Array.isArray(q.history) ? q.history : [];
      if (hist.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No procedure cases recorded under this quota yet.</td></tr>';
      } else {
        tbody.innerHTML = hist.map((h, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${formatDate(h.date)}</td>
            <td class="font-mono text-xs text-gray">${h.txnId || '—'}</td>
            <td class="font-semibold">${h.hn || '—'}</td>
            <td>${h.procedure || '—'}</td>
            <td class="center font-mono font-bold" style="color:var(--purple-dark);">${h.pieceNo ? h.pieceNo : '—'}</td>
            <td class="center font-bold">${h.qty || 0}</td>
          </tr>
        `).join('');
      }
      openModal('modal-exchange-history');
    }

    function removeExchangeQuota(quotaId) {
      verifyPasscodeThen(state.currentLang === 'th' ? `ยืนยันการลบกฎโควตา ${quotaId}?` : `Remove substitution quota rule ${quotaId}?`, () => {
        if (isApiConfigured()) {
          appLoading.classList.remove('hidden');
          appContent.classList.add('hidden');
          callApi('deleteExchangeQuota', { quotaId })
            .then(() => {
              showToast('Quota rule removed');
              fetchDataFromServer();
            })
            .catch(err => {
              showToast('Failed: ' + (err.message || err));
              appLoading.classList.add('hidden');
              appContent.classList.remove('hidden');
            });
        } else {
          state.exchangeQuotas = (state.exchangeQuotas || []).filter(x => String(x.quotaId) !== String(quotaId));
          showToast('Quota rule removed (mock)');
          renderExchangeTab();
        }
      });
    }

    function openConsignmentModal() {
      document.getElementById('csg-modal-vendor').value   = '';
      document.getElementById('csg-modal-date').value     = getToday();
      document.getElementById('csg-modal-contact').value  = '';
      document.getElementById('csg-modal-phone').value    = '';
      document.getElementById('csg-modal-itemname').value = '';
      document.getElementById('csg-modal-qty').value      = '1';
      document.getElementById('csg-modal-notes').value    = '';

      const itemSel = document.getElementById('csg-modal-itemid');
      itemSel.innerHTML = '<option value="">— Custom / Non-Inventory Vendor Item —</option>' +
        getTransactableInventory().map(i => `<option value="${escapeHtml(String(i.itemId))}">${i.deviceName}${i.isFreeItem ? ' [FREE]' : ''} (${i.category || '—'})</option>`).join('');
      itemSel.value = '';
      openModal('modal-consignment-new');
    }

    function onConsignmentItemSelect() {
      const itemId = document.getElementById('csg-modal-itemid').value;
      const nameInput = document.getElementById('csg-modal-itemname');
      if (itemId) {
        const inv = state.inventory.find(i => String(i.itemId) === String(itemId));
        if (inv && nameInput) nameInput.value = inv.deviceName;
      }
    }

    function saveConsignmentModal() {
      const vendorName    = document.getElementById('csg-modal-vendor').value.trim();
      const dateDeposited = document.getElementById('csg-modal-date').value || getToday();
      const contactPerson = document.getElementById('csg-modal-contact').value.trim();
      const contactPhone  = document.getElementById('csg-modal-phone').value.trim();
      const itemId        = document.getElementById('csg-modal-itemid').value;
      const itemName      = document.getElementById('csg-modal-itemname').value.trim() || (itemId ? getDeviceName(itemId) : '');
      const quantity      = parseInt(document.getElementById('csg-modal-qty').value) || 0;
      const notes         = document.getElementById('csg-modal-notes').value.trim();

      if (!vendorName || !itemName) {
        showToast('Vendor Name and Item Name are required');
        return;
      }
      if (quantity <= 0) {
        showToast('Quantity must be greater than 0');
        return;
      }

      const payload = {
        vendorName, dateDeposited, contactPerson, contactPhone,
        itemId, itemName, quantity, notes
      };

      closeModal();
      if (isApiConfigured()) {
        appLoading.classList.remove('hidden');
        appContent.classList.add('hidden');
        callApi('addConsignmentHold', payload)
          .then(() => {
            showToast('Consignment hold recorded in Buffer!');
            fetchDataFromServer();
          })
          .catch(err => {
            showToast('Failed: ' + (err.message || err));
            appLoading.classList.add('hidden');
            appContent.classList.remove('hidden');
          });
      } else {
        const holdId = 'CSG-' + Date.now().toString().slice(-6);
        if (!Array.isArray(state.consignments)) state.consignments = [];
        state.consignments.unshift({
          holdId, dateDeposited, vendorName, contactPerson, contactPhone,
          itemId, itemName, quantity, status: 'Holding', notes, pickupDate: '', pickupRep: ''
        });
        if (itemId) {
          const inv = state.inventory.find(i => String(i.itemId) === String(itemId));
          if (inv) inv.bufferStock = (Number(inv.bufferStock) || 0) + quantity;
        }
        showToast('Consignment hold recorded in Buffer (mock)');
        switchExchangeSubTab('consignment');
      }
    }

    function openConsignmentReturnModal(holdId) {
      const c = (state.consignments || []).find(x => String(x.holdId) === String(holdId));
      if (!c) return;
      document.getElementById('csg-ret-hold-id').value = c.holdId;
      document.getElementById('csg-ret-date').value    = getToday();
      document.getElementById('csg-ret-rep').value     = c.contactPerson || '';
      document.getElementById('csg-ret-summary').innerHTML = `
        <div><strong>Vendor:</strong> ${c.vendorName}</div>
        <div><strong>Item (Buffer):</strong> ${c.itemName || getDeviceName(c.itemId)} &times; <strong>${c.quantity}</strong></div>
        <div class="text-xs text-gray mt-2">Confirming pickup will transition status to <strong>Returned</strong> and deduct ${c.quantity} unit(s) from Buffer stock.</div>
      `;
      openModal('modal-consignment-return');
    }

    function confirmConsignmentReturn() {
      const holdId     = document.getElementById('csg-ret-hold-id').value;
      const pickupDate = document.getElementById('csg-ret-date').value || getToday();
      const pickupRep  = document.getElementById('csg-ret-rep').value.trim();

      if (!pickupDate || !pickupRep) {
        showToast('Pickup Date and Representative Name are required');
        return;
      }

      closeModal();
      if (isApiConfigured()) {
        appLoading.classList.remove('hidden');
        appContent.classList.add('hidden');
        callApi('returnConsignmentHold', { holdId, pickupDate, pickupRep })
          .then(() => {
            showToast('Marked as Returned / Picked Up!');
            fetchDataFromServer();
          })
          .catch(err => {
            showToast('Failed: ' + (err.message || err));
            appLoading.classList.add('hidden');
            appContent.classList.remove('hidden');
          });
      } else {
        const c = (state.consignments || []).find(x => String(x.holdId) === String(holdId));
        if (c) {
          c.status     = 'Returned';
          c.pickupDate = pickupDate;
          c.pickupRep  = pickupRep;
          if (c.itemId) {
            const inv = state.inventory.find(i => String(i.itemId) === String(c.itemId));
            if (inv) inv.bufferStock = Math.max(0, (Number(inv.bufferStock) || 0) - (Number(c.quantity) || 0));
          }
        }
        showToast('Marked as Returned / Picked Up (mock)');
        renderExchangeTab();
      }
    }

    function removeConsignmentHold(holdId) {
      verifyPasscodeThen(state.currentLang === 'th' ? `ต้องการลบรายการฝากของ ${holdId} หรือไม่?` : `Delete consignment hold record ${holdId}?`, () => {
        if (isApiConfigured()) {
          appLoading.classList.remove('hidden');
          appContent.classList.add('hidden');
          callApi('deleteConsignmentHold', { holdId })
            .then(() => {
              showToast('Consignment hold deleted');
              fetchDataFromServer();
            })
            .catch(err => {
              showToast('Failed: ' + (err.message || err));
              appLoading.classList.add('hidden');
              appContent.classList.remove('hidden');
            });
        } else {
          state.consignments = (state.consignments || []).filter(x => String(x.holdId) !== String(holdId));
          showToast('Consignment hold deleted (mock)');
          renderExchangeTab();
        }
      });
    }

    // ════════════════════════════════════════════════════════════════
    // MODULE 4: LOAN & TRANSFER MANAGEMENT
    // ════════════════════════════════════════════════════════════════
    function getDepartmentsForScope(scope) {
      const rawList = (state.settings && Array.isArray(state.settings.departments)) ? state.settings.departments : [];
      const target = String(scope || 'Internal').toLowerCase();
      const matched = [];
      rawList.forEach(entry => {
        const s = String(entry || '').trim();
        if (!s) return;
        if (s.includes('|')) {
          const parts = s.split('|').map(p => p.trim());
          if (parts[0].toLowerCase() === target) matched.push(parts.slice(1).join(' | '));
        } else {
          matched.push(s);
        }
      });
      if (matched.length === 0) {
        return target === 'external'
          ? ['Operating Room (OR)', 'Siriraj Hospital', 'Chulalongkorn Hospital', 'Ramathibodi Hospital']
          : ['BIR Room', 'Angio Suite', 'CT Room'];
      }
      return matched;
    }

    function renderLoanTab() {
      const loans = state.loans || [];

      // Split active loans into Card 1 (We Owe Others — Inward) & Card 2 (Others Owe Us — Outward)
      const weOweList   = loans.filter(l => l.status !== 'Fully Returned' && (String(l.direction).includes('Inward') || String(l.direction).includes('We Borrowed')));
      const theyOweList = loans.filter(l => l.status !== 'Fully Returned' && (String(l.direction).includes('Outward') || String(l.direction).includes('They Borrowed')));

      const weOweUnits   = weOweList.reduce((s, l) => s + Math.max(0, (Number(l.totalQty) || 0) - (Number(l.returnedQty) || 0)), 0);
      const theyOweUnits = theyOweList.reduce((s, l) => s + Math.max(0, (Number(l.totalQty) || 0) - (Number(l.returnedQty) || 0)), 0);

      const weBadge = document.getElementById('loan-we-owe-badge');
      if (weBadge) weBadge.innerText = `${weOweList.length} active (${weOweUnits} ${t('stock_qty', 'pcs')})`;
      const theyBadge = document.getElementById('loan-they-owe-badge');
      if (theyBadge) theyBadge.innerText = `${theyOweList.length} active (${theyOweUnits} ${t('stock_qty', 'pcs')})`;

      function formatLoanStatusText(st) {
        if (st === 'Partial') return t('tr_partial', 'Partial');
        if (st === 'Fully Returned') return t('tr_fully', 'Fully Returned');
        return t('tr_pending', st || 'Pending');
      }

      function formatLoanScopeText(sc) {
        if (sc === 'External') return t('tr_external', 'External');
        if (sc === 'Internal') return t('tr_internal', 'Internal');
        return sc || '';
      }

      function buildActiveCardRows(list, emptyMsg, btnLabel) {
        if (list.length === 0) {
          return `<tr><td colspan="5" class="empty-state text-sm">${emptyMsg}</td></tr>`;
        }
        return list.map(l => {
          const tot = Number(l.totalQty) || 0;
          const ret = Number(l.returnedQty) || 0;
          const rem = Math.max(0, tot - ret);
          const scBadge = l.scope === 'External' ? 'badge-amber' : 'badge-blue';
          const stBadge = l.status === 'Partial' ? 'badge-amber' : 'badge-low';
          return `
            <tr>
              <td>
                <div class="font-semibold">${l.department}</div>
                <div class="text-xs text-gray">
                  <span class="badge ${scBadge}" style="font-size:10px; padding:1px 6px;">${formatLoanScopeText(l.scope)}</span>
                  ${formatDate(l.date)}
                  ${l.docNo ? ` · <span class="font-mono">${t('tr_doc_no', 'Doc')}: ${l.docNo}</span>` : ''}
                </div>
              </td>
              <td class="font-medium">${l.itemName || getDeviceName(l.itemId)}</td>
              <td class="center">
                <strong style="font-size:14px;">${rem}</strong>
                <span class="text-xs text-gray">/ ${tot}</span>
              </td>
              <td class="center"><span class="badge ${stBadge}">${formatLoanStatusText(l.status)}</span></td>
              <td class="center" style="white-space:nowrap;">
                ${btnLabel === returnBtnTxt ? `<button class="btn btn-outline btn-sm" onclick="registerLoanItemAsInventory('${escapeHtml(l.loanId)}')" title="Register into Inventory with (Borrow) tag" style="margin-right:4px;">+ Inventory</button>` : ''}
                <button class="btn btn-outline btn-sm" onclick="openLoanReturnModal('${escapeHtml(l.loanId)}')">${ICONS.check} ${btnLabel}</button>
              </td>
            </tr>
          `;
        }).join('');
      }

      const returnBtnTxt = state.currentLang === 'th' ? 'ส่งคืน' : 'Return';
      const receiveBtnTxt = state.currentLang === 'th' ? 'รับคืน' : 'Receive';
      const weEmptyMsg = state.currentLang === 'th' ? 'ไม่มีรายการขอยืมค้างส่ง' : 'No pending inward loans.';
      const theyEmptyMsg = state.currentLang === 'th' ? 'ไม่มีรายการให้ยืมค้างรับคืน' : 'No pending outward loans.';

      const weBody = document.getElementById('loan-we-owe-body');
      if (weBody) weBody.innerHTML = buildActiveCardRows(weOweList, weEmptyMsg, returnBtnTxt);

      const theyBody = document.getElementById('loan-they-owe-body');
      if (theyBody) theyBody.innerHTML = buildActiveCardRows(theyOweList, theyEmptyMsg, receiveBtnTxt);

      // Render Historical & All Loans Table
      const hBody = document.getElementById('loan-history-body');
      if (hBody) {
        const statusFilter = document.getElementById('loan-filter-status')?.value || '';
        const scopeFilter  = document.getElementById('loan-filter-scope')?.value || '';
        const searchQ      = (document.getElementById('loan-search')?.value || '').toLowerCase().trim();

        const filtered = loans.filter(l => {
          if (statusFilter === 'Active' && l.status === 'Fully Returned') return false;
          if (statusFilter === 'Fully Returned' && l.status !== 'Fully Returned') return false;
          if (scopeFilter && l.scope !== scopeFilter) return false;
          if (!searchQ) return true;
          return (
            String(l.department || '').toLowerCase().includes(searchQ) ||
            String(l.docNo || '').toLowerCase().includes(searchQ) ||
            String(l.itemName || getDeviceName(l.itemId)).toLowerCase().includes(searchQ) ||
            String(l.loanId || '').toLowerCase().includes(searchQ) ||
            String(l.notes || '').toLowerCase().includes(searchQ)
          );
        });

        if (filtered.length === 0) {
          hBody.innerHTML = '<tr><td colspan="9" class="empty-state">No loan or transfer records match the current filter.</td></tr>';
        } else {
          hBody.innerHTML = filtered.map(l => {
            const tot = Number(l.totalQty) || 1;
            const ret = Number(l.returnedQty) || 0;
            const pct = Math.min(100, Math.round((ret / tot) * 100));
            const isInward = String(l.direction).includes('Inward') || String(l.direction).includes('We Borrowed');
            const isDone = l.status === 'Fully Returned';
            const stBadge = isDone ? 'badge-ok' : (l.status === 'Partial' ? 'badge-amber' : 'badge-low');
            const scBadge = l.scope === 'External' ? 'badge-amber' : 'badge-blue';
            const histLogs = (Array.isArray(l.returnHistory) ? l.returnHistory : []).map(h =>
              `<div class="text-xs" style="color:var(--brand-dark);">• ${formatDate(h.date)}: <strong>${h.qty} pcs</strong> by ${h.returnedBy}${h.notes ? ` (${h.notes})` : ''}</div>`
            ).join('');

            return `
              <tr>
                <td class="text-xs text-gray">${formatDate(l.date)}<div class="font-mono">${l.loanId || ''}</div></td>
                <td>
                  <span class="badge ${scBadge}">${l.scope}</span>
                  <div class="text-xs font-semibold mt-2" style="color:${isInward ? '#dc2626' : 'var(--brand-dark)'};">
                    ${isInward ? 'We Borrowed (Inward)' : 'They Borrowed (Outward)'}
                  </div>
                </td>
                <td class="font-semibold">${l.department}</td>
                <td class="font-mono text-xs">${l.docNo ? `<span class="badge badge-gray">${l.docNo}</span>` : '<span class="text-gray">—</span>'}</td>
                <td>
                  <div class="font-medium">${l.itemName || getDeviceName(l.itemId)}</div>
                  <div class="text-xs text-gray">Location: ${l.location || 'Main'}</div>
                </td>
                <td class="center" style="min-width:120px;">
                  <div class="font-bold text-xs mb-2">${ret} / ${tot} pcs</div>
                  <div class="progress-track">
                    <div class="progress-fill ${isDone ? 'done' : ''}" style="width:${pct}%;"></div>
                  </div>
                </td>
                <td class="center"><span class="badge ${stBadge}">${l.status}</span></td>
                <td>
                  ${l.notes ? `<div class="text-xs text-gray mb-2">${l.notes}</div>` : ''}
                  ${histLogs || '<span class="text-xs text-gray">No returns logged yet</span>'}
                </td>
                <td class="center" style="white-space:nowrap;">
                  ${!isDone ? `<button class="btn btn-outline btn-sm" onclick="openLoanReturnModal('${escapeHtml(l.loanId)}')">${ICONS.check} Record Return</button>` : ''}
                  <button class="btn-ghost" style="color:var(--red);" onclick="removeLoanTransfer('${escapeHtml(l.loanId)}')" title="Delete">${ICONS.trash}</button>
                </td>
              </tr>
            `;
          }).join('');
        }
      }
    }

    function onLoanScopeChange() {
      const scope = document.getElementById('loan-modal-scope')?.value || 'Internal';
      const reqBadge = document.getElementById('loan-doc-req-badge');
      if (reqBadge) reqBadge.classList.toggle('hidden', scope !== 'External');

      const depts = getDepartmentsForScope(scope);
      const deptSel = document.getElementById('loan-modal-dept');
      if (deptSel) {
        deptSel.innerHTML = depts.map(d => `<option value="${escapeHtml(d)}">${d}</option>`).join('');
      }
    }

    function onLoanItemSelect() {
      // Optional hook when selecting device
    }

    function registerLoanItemAsInventory(loanId) {
      const l = (state.loans || []).find(x => String(x.loanId) === String(loanId));
      if (!l) return;
      const borrowSuffix = state.currentLang === 'th' ? '(ยืม)' : '(Borrow)';
      let baseName = l.itemName || getDeviceName(l.itemId) || 'Borrowed Item';
      if (!baseName.includes('(Borrow)') && !baseName.includes('(ยืม)')) {
        baseName = `${baseName} ${borrowSuffix}`;
      }
      const remQty = Math.max(0, (Number(l.totalQty) || 0) - (Number(l.returnedQty) || 0));

      openAddDeviceModal();
      const modalTitleEl = document.getElementById('modal-device-title');
      if (modalTitleEl) modalTitleEl.innerText = state.currentLang === 'th' ? 'ลงทะเบียนเวชภัณฑ์จากการยืม' : 'Register Borrowed Device to Inventory';
      const nameEl = document.getElementById('inv-modal-name');
      if (nameEl) nameEl.value = baseName;
      const hoEl = document.getElementById('inv-modal-hoid');
      if (hoEl) hoEl.value = l.docNo ? `BRW-${l.docNo}` : `BRW-${l.loanId}`;

      const existingInv = state.inventory.find(i => String(i.itemId) === String(l.itemId));
      const catEl = document.getElementById('inv-modal-cat');
      if (catEl && existingInv && existingInv.category) {
        catEl.value = existingInv.category;
      }
      const mainEl = document.getElementById('inv-modal-main');
      if (mainEl) mainEl.value = String(remQty);
      const totalEl = document.getElementById('inv-modal-total');
      if (totalEl) totalEl.value = String(remQty);
      showToast(state.currentLang === 'th' ? `กรอกข้อมูลเวชภัณฑ์จากการยืม "${baseName}" เรียบร้อยแล้ว` : `Pre-filled inventory registration for "${baseName}"`);
    }

    function openLoanModal() {
      document.getElementById('loan-modal-scope').value     = 'Internal';
      document.getElementById('loan-modal-direction').value = 'We Borrowed (Inward)';
      document.getElementById('loan-modal-docno').value     = '';
      document.getElementById('loan-modal-qty').value       = '1';
      document.getElementById('loan-modal-loc').value       = 'Main';
      document.getElementById('loan-modal-date').value      = getToday();
      document.getElementById('loan-modal-tech').value      = '';
      document.getElementById('loan-modal-notes').value     = '';
      const regCheck = document.getElementById('loan-register-inv-check');
      if (regCheck) regCheck.checked = false;

      onLoanScopeChange();

      const itemSel = document.getElementById('loan-modal-itemid');
      itemSel.innerHTML = '<option value="">— Select Inventory Device —</option>' +
        getTransactableInventory().map(i => `<option value="${escapeHtml(String(i.itemId))}">${i.deviceName}${i.isFreeItem ? ' [FREE]' : ''} (${i.category || '—'} · Main: ${i.mainStock || 0}, Retail: ${i.retailStock || 0})</option>`).join('');

      const uList = document.getElementById('loan-user-datalist');
      if (uList) {
        uList.innerHTML = getUsersList().map(u => {
          const fn = `${u.name || ''} ${u.surname || ''}`.trim();
          return `<option value="${escapeHtml(fn)}">`;
        }).join('');
      }

      openModal('modal-loan-new');
    }

    function saveNewLoanModal() {
      const scope      = document.getElementById('loan-modal-scope').value;
      const direction  = document.getElementById('loan-modal-direction').value;
      const department = document.getElementById('loan-modal-dept').value.trim();
      const docNo      = document.getElementById('loan-modal-docno').value.trim();
      const itemId     = document.getElementById('loan-modal-itemid').value;
      const totalQty   = parseInt(document.getElementById('loan-modal-qty').value) || 0;
      const location   = document.getElementById('loan-modal-loc').value;
      const date       = document.getElementById('loan-modal-date').value || getToday();
      const tech       = document.getElementById('loan-modal-tech').value.trim();
      const notes      = document.getElementById('loan-modal-notes').value.trim();

      if (!department) { showToast('Please select a Department / Facility'); return; }
      if (!itemId)     { showToast('Please select a Device / Item'); return; }
      if (totalQty <= 0) { showToast('Quantity must be greater than 0'); return; }
      if (scope === 'External' && !docNo) {
        showToast('Transfer Slip / Doc No. is mandatory for External loans/transfers!');
        document.getElementById('loan-modal-docno').focus();
        return;
      }

      const itemName = getDeviceName(itemId);
      const shouldRegisterInv = document.getElementById('loan-register-inv-check')?.checked;
      if (shouldRegisterInv) {
        const borrowSuffix = state.currentLang === 'th' ? '(ยืม)' : '(Borrow)';
        let regName = itemName;
        if (!regName.includes('(Borrow)') && !regName.includes('(ยืม)')) {
          regName = `${regName} ${borrowSuffix}`;
        }
        const existingInv = state.inventory.find(i => String(i.itemId) === String(itemId));
        const newDevPayload = {
          deviceName: regName,
          category: existingInv ? existingInv.category : 'Other',
          hoItemId: docNo ? `BRW-${docNo}` : `BRW-${itemId}`,
          buyPrice: existingInv ? existingInv.buyPrice : 0,
          sellPrice: existingInv ? existingInv.sellPrice : 0,
          mainStock: totalQty,
          retailStock: 0,
          bufferStock: 0,
          totalStock: totalQty,
          hoStock: 0,
          stockDiff: totalQty,
          stockMonth: 0,
          exceedPercent: 0,
          orderEstimate: 0,
          buyPoint: 0,
          safetyStock: 0
        };
        if (isApiConfigured()) {
          callApi('addInventoryItem', newDevPayload).catch(e => console.error('Auto register borrowed item failed:', e));
        } else {
          newDevPayload.itemId = 'BRW-' + Date.now().toString().slice(-6);
          state.inventory.push(newDevPayload);
        }
      }

      const payload = {
        scope, direction, department, docNo,
        itemId, itemName, totalQty, location, date, tech, notes
      };

      closeModal();
      if (isApiConfigured()) {
        appLoading.classList.remove('hidden');
        appContent.classList.add('hidden');
        callApi('addLoanTransfer', payload)
          .then(() => {
            showToast('Loan / Transfer recorded!');
            fetchDataFromServer();
          })
          .catch(err => {
            showToast('Failed: ' + (err.message || err));
            appLoading.classList.add('hidden');
            appContent.classList.remove('hidden');
          });
      } else {
        const loanId = 'LN-' + Date.now().toString().slice(-6);
        if (!Array.isArray(state.loans)) state.loans = [];
        state.loans.unshift({
          loanId, date, scope, direction, department, docNo,
          itemId, itemName, totalQty, returnedQty: 0, status: 'Pending',
          notes, returnHistory: [], tech, location
        });
        const inv = state.inventory.find(i => String(i.itemId) === String(itemId));
        if (inv && (location === 'Main' || location === 'Retail' || location === 'Buffer')) {
          const isInward = direction.includes('Inward') || direction.includes('We Borrowed');
          const delta = isInward ? totalQty : -totalQty;
          if (location === 'Main') inv.mainStock += delta;
          else if (location === 'Retail') inv.retailStock += delta;
          else if (location === 'Buffer') inv.bufferStock = (Number(inv.bufferStock) || 0) + delta;
          inv.totalStock = inv.mainStock + inv.retailStock;
          inv.stockDiff  = inv.totalStock - inv.hoStock;
        }
        showToast('Loan / Transfer recorded (mock)');
        renderLoanTab();
      }
    }

    function openLoanReturnModal(loanId) {
      const l = (state.loans || []).find(x => String(x.loanId) === String(loanId));
      if (!l) return;
      const tot = Number(l.totalQty) || 0;
      const ret = Number(l.returnedQty) || 0;
      const rem = Math.max(0, tot - ret);

      document.getElementById('loan-ret-id').value    = l.loanId;
      document.getElementById('loan-ret-date').value  = getToday();
      const qtyInput = document.getElementById('loan-ret-qty');
      qtyInput.value = rem;
      qtyInput.max   = rem;
      document.getElementById('loan-ret-by').value    = '';
      document.getElementById('loan-ret-notes').value = '';

      document.getElementById('loan-ret-summary').innerHTML = `
        <div class="flex justify-between items-center">
          <strong>${l.itemName || getDeviceName(l.itemId)}</strong>
          <span class="badge ${l.scope === 'External' ? 'badge-amber' : 'badge-blue'}">${l.scope} · ${l.department}</span>
        </div>
        <div class="text-xs text-gray mt-2">
          Direction: <strong>${l.direction}</strong> &nbsp;|&nbsp;
          Total: <strong>${tot}</strong> &nbsp;|&nbsp;
          Returned so far: <strong>${ret}</strong> &nbsp;|&nbsp;
          <span style="color:var(--red); font-weight:700;">Remaining Balance: ${rem}</span>
        </div>
      `;
      openModal('modal-loan-return');
    }

    function confirmLoanReturn() {
      const loanId     = document.getElementById('loan-ret-id').value;
      const returnDate = document.getElementById('loan-ret-date').value || getToday();
      const returnQty  = parseInt(document.getElementById('loan-ret-qty').value) || 0;
      const returnedBy = document.getElementById('loan-ret-by').value.trim();
      const notes      = document.getElementById('loan-ret-notes').value.trim();

      const l = (state.loans || []).find(x => String(x.loanId) === String(loanId));
      if (!l) return;
      const rem = Math.max(0, (Number(l.totalQty) || 0) - (Number(l.returnedQty) || 0));

      if (returnQty <= 0 || returnQty > rem) {
        showToast(`Return Quantity must be between 1 and ${rem}`);
        return;
      }
      if (!returnedBy) {
        showToast('Please enter Returned By (Staff / Representative name)');
        return;
      }

      closeModal();
      if (isApiConfigured()) {
        appLoading.classList.remove('hidden');
        appContent.classList.add('hidden');
        callApi('recordLoanReturn', { loanId, returnDate, returnQty, returnedBy, notes, location: l.location })
          .then(res => {
            showToast(`Return logged (${res.newStatus || 'Updated'})!`);
            fetchDataFromServer();
          })
          .catch(err => {
            showToast('Failed: ' + (err.message || err));
            appLoading.classList.add('hidden');
            appContent.classList.remove('hidden');
          });
      } else {
        l.returnedQty = (Number(l.returnedQty) || 0) + returnQty;
        l.status = l.returnedQty >= l.totalQty ? 'Fully Returned' : 'Partial';
        if (!Array.isArray(l.returnHistory)) l.returnHistory = [];
        l.returnHistory.push({ date: returnDate, qty: returnQty, returnedBy, notes });

        const inv = state.inventory.find(i => String(i.itemId) === String(l.itemId));
        const loc = l.location || 'Main';
        if (inv && (loc === 'Main' || loc === 'Retail' || loc === 'Buffer')) {
          const isInward = String(l.direction).includes('Inward') || String(l.direction).includes('We Borrowed');
          const delta = isInward ? -returnQty : returnQty;
          if (loc === 'Main') inv.mainStock += delta;
          else if (loc === 'Retail') inv.retailStock += delta;
          else if (loc === 'Buffer') inv.bufferStock = Math.max(0, (Number(inv.bufferStock) || 0) + delta);
          inv.totalStock = inv.mainStock + inv.retailStock;
          inv.stockDiff  = inv.totalStock - inv.hoStock;
        }
        showToast(`Return logged: ${l.status} (mock)`);
        renderLoanTab();
      }
    }

    function removeLoanTransfer(loanId) {
      verifyPasscodeThen(state.currentLang === 'th' ? `ต้องการลบรายการยืม/โอนย้าย ${loanId} หรือไม่?` : `Delete loan/transfer record ${loanId}?`, () => {
        if (isApiConfigured()) {
          appLoading.classList.remove('hidden');
          appContent.classList.add('hidden');
          callApi('deleteLoanTransfer', { loanId })
            .then(() => {
              showToast('Loan record deleted');
              fetchDataFromServer();
            })
            .catch(err => {
              showToast('Failed: ' + (err.message || err));
              appLoading.classList.add('hidden');
              appContent.classList.remove('hidden');
            });
        } else {
          state.loans = (state.loans || []).filter(x => String(x.loanId) !== String(loanId));
          showToast('Loan record deleted (mock)');
          renderLoanTab();
        }
      });
    }

    // ════════════════════════════════════════════════════════════════
    // MODULE 5: HOSPITAL FIXED ASSET & MEDICAL EQUIPMENT MANAGEMENT
    // ════════════════════════════════════════════════════════════════
    // (QR scanner state is declared in the QR CODE & BARCODE CAMERA SCANNER section below)

    function getAssetStatusBadge(status) {
      const s = String(status || 'Active').trim();
      const map = {
        'Active':       { cls: 'status-active',    key: 'ast_active',  label: 'Active' },
        'Under Repair': { cls: 'status-repair',    key: 'ast_repair',  label: 'Under Repair' },
        'Standby':      { cls: 'status-standby',   key: null,          label: 'Standby' },
        'Damaged':      { cls: 'status-damaged',   key: 'ast_damaged', label: 'Damaged' },
        'Condemned':    { cls: 'status-condemned', key: 'ast_damaged', label: 'Condemned' }
      };
      const cfg = map[s] || map['Active'];
      const txt = (typeof t === 'function' && cfg.key) ? t(cfg.key, cfg.label) : cfg.label;
      return `<span class="badge ${cfg.cls}"><span class="status-dot"></span>${escapeHtml(txt)}</span>`;
    }

    function switchAssetSubTab(sub) {
      state.assetSubTab = sub;
      document.querySelectorAll('#asset-subtabs .sub-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.asub === sub);
      });
      const statusSel = document.getElementById('asset-filter-status');
      if (statusSel) statusSel.value = '';
      renderAssetsTab();
    }

    function quickFilterAssetStatus(status) {
      if (status === 'Damaged' || status === 'Condemned') {
        state.assetSubTab = 'archive';
      } else {
        state.assetSubTab = 'active';
      }
      document.querySelectorAll('#asset-subtabs .sub-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.asub === state.assetSubTab);
      });
      const statusSel = document.getElementById('asset-filter-status');
      if (statusSel) statusSel.value = status || '';
      renderAssetsTab();
    }

    function setAssetCatChip(cat) {
      const catSel = document.getElementById('asset-filter-cat');
      if (catSel) catSel.value = cat || '';
      document.querySelectorAll('#asset-cat-chips .filter-chip').forEach(ch => {
        ch.classList.toggle('active', (ch.dataset.chipCat || '') === (cat || ''));
      });
      renderAssetsTab();
    }

    function resetAssetFilters() {
      const searchEl = document.getElementById('asset-search-input');
      const catEl    = document.getElementById('asset-filter-cat');
      const statusEl = document.getElementById('asset-filter-status');
      const roomEl   = document.getElementById('asset-filter-room');
      if (searchEl) searchEl.value = '';
      if (catEl)    catEl.value = '';
      if (statusEl) statusEl.value = '';
      if (roomEl)   roomEl.value = '';
      document.querySelectorAll('#asset-cat-chips .filter-chip').forEach(ch => {
        ch.classList.toggle('active', (ch.dataset.chipCat || '') === '');
      });
      renderAssetsTab();
    }

    function isAssetMaintDueOrAction(asset) {
      const hist = Array.isArray(asset.maintenanceHistory) ? asset.maintenanceHistory : [];
      if (hist.length === 0) return false;
      const latest = hist[0];
      if (String(latest.result || '').toLowerCase() === 'action required') return true;
      if (latest.nextDueDate) {
        const due = new Date(latest.nextDueDate);
        if (!isNaN(due.getTime())) {
          const diffDays = (due.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
          if (diffDays <= 30) return true;
        }
      }
      return false;
    }

    function buildQrCodeUrl(data, pxSize) {
      const sz = pxSize || 150;
      return 'https:\x2f\x2fapi.qrserver.com/v1/create-qr-code?size=' + sz + 'x' + sz + '&data=' + encodeURIComponent(String(data || ''));
    }

    function buildImgHtml(srcUrl, className, styleText, altText, hideOnError) {
      let html = '<im' + 'g ' + 'sr' + 'c="' + String(srcUrl || '') + '"';
      if (className) html += ' class="' + className + '"';
      if (altText) html += ' alt="' + String(altText) + '"';
      if (styleText) html += ' style="' + styleText + '"';
      if (hideOnError) html += ' onerror="this.style.display=\'none\'"';
      html += '>';
      return html;
    }

    function renderAssetsTab() {
      const assets = Array.isArray(state.assets) ? state.assets : [];

      // 1. Update KPI counters
      let cntActive = 0, cntRepair = 0, cntStandby = 0, cntDamaged = 0, cntDue = 0;
      assets.forEach(a => {
        const st = String(a.status || 'Active').trim();
        if (st === 'Active') cntActive++;
        else if (st === 'Under Repair') cntRepair++;
        else if (st === 'Standby') cntStandby++;
        else if (st === 'Damaged' || st === 'Condemned') cntDamaged++;
        if (st !== 'Damaged' && st !== 'Condemned' && isAssetMaintDueOrAction(a)) cntDue++;
      });

      const elKpiAct = document.getElementById('asset-kpi-active');
      const elKpiRep = document.getElementById('asset-kpi-repair');
      const elKpiStb = document.getElementById('asset-kpi-standby');
      const elKpiDmg = document.getElementById('asset-kpi-damaged');
      const elKpiDue = document.getElementById('asset-kpi-due');
      if (elKpiAct) elKpiAct.innerText = cntActive;
      if (elKpiRep) elKpiRep.innerText = cntRepair;
      if (elKpiStb) elKpiStb.innerText = cntStandby;
      if (elKpiDmg) elKpiDmg.innerText = cntDamaged;
      if (elKpiDue) elKpiDue.innerText = cntDue;

      // 2. Populate Room filter dropdown dynamically
      const roomSel = document.getElementById('asset-filter-room');
      if (roomSel) {
        const curRoom = roomSel.value;
        const rooms = Array.from(new Set([
          'DSA Suite', 'Control Room', 'Patient Prep Room', 'BIR Room', 'Angio Suite', 'CT Room',
          ...assets.map(a => String(a.room || '').trim()).filter(Boolean)
        ])).sort();
        roomSel.innerHTML = `<option value="">All Rooms / Locations</option>` +
          rooms.map(r => `<option value="${escapeHtml(r)}" ${r === curRoom ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('');
      }

      // Sync category chips with select
      const catVal = document.getElementById('asset-filter-cat')?.value || '';
      document.querySelectorAll('#asset-cat-chips .filter-chip').forEach(ch => {
        ch.classList.toggle('active', (ch.dataset.chipCat || '') === catVal);
      });

      const searchQ   = (document.getElementById('asset-search-input')?.value || '').toLowerCase().trim();
      const statusVal = document.getElementById('asset-filter-status')?.value || '';
      const roomVal   = document.getElementById('asset-filter-room')?.value || '';
      const isArchive = state.assetSubTab === 'archive';

      const titleEl = document.getElementById('asset-table-title');
      if (titleEl) {
        titleEl.innerText = isArchive
          ? 'Condemned & Decommissioned Equipment Archive'
          : 'Active Equipment Registry';
      }

      const filtered = assets.filter(a => {
        const st = String(a.status || 'Active').trim();
        const inArchive = (st === 'Damaged' || st === 'Condemned');
        if (isArchive !== inArchive) return false;
        if (catVal && String(a.category || '') !== catVal) return false;
        if (statusVal && st !== statusVal) return false;
        if (roomVal && String(a.room || '') !== roomVal) return false;
        if (searchQ) {
          const hay = [a.assetId, a.hospitalCode, a.serialNumber, a.assetName, a.category, a.room, a.notes].join(' ').toLowerCase();
          if (!hay.includes(searchQ)) return false;
        }
        return true;
      });

      const countEl = document.getElementById('asset-count-label');
      if (countEl) countEl.innerText = `${filtered.length} asset${filtered.length === 1 ? '' : 's'}`;

      const tbody = document.getElementById('asset-table-body');
      if (!tbody) return;

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">${isArchive ? 'No condemned or damaged assets in archive.' : 'No equipment records match the current filters.'}</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(a => {
        const thumbHtml = a.photoUrl
          ? buildImgHtml(escapeHtml(a.photoUrl), 'asset-thumb', '', escapeHtml(a.assetName), true)
          : '<div class="asset-thumb"><svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/></svg></div>';

        const hist = Array.isArray(a.maintenanceHistory) ? a.maintenanceHistory : [];
        let maintSummaryHtml = '<span class="text-xs text-gray">No logs recorded</span>';
        if (isArchive && a.damageInfo) {
          const memoHtml = a.damageInfo.memoNo ? '<div class="font-mono text-gray">Memo: ' + escapeHtml(a.damageInfo.memoNo) + '</div>' : '';
          maintSummaryHtml =
            '<div class="text-xs" style="color:#991b1b;">' +
              '<strong>' + formatDate(a.damageInfo.damageDate) + ':</strong> ' + escapeHtml(a.damageInfo.cause || '') +
              memoHtml +
            '</div>';
        } else if (hist.length > 0) {
          const latest = hist[0];
          const isPass = String(latest.result || '') === 'Passed';
          const dueHtml = latest.nextDueDate ? '<div class="text-xs" style="color:#4f46e5;">Next Due: ' + formatDate(latest.nextDueDate) + '</div>' : '';
          maintSummaryHtml =
            '<div class="text-xs">' +
              '<div class="font-semibold">' + escapeHtml(latest.type) + '</div>' +
              '<div class="text-gray">' + formatDate(latest.date) + ' · <span style="color:' + (isPass ? '#059669' : '#dc2626') + '; font-weight:700;">' + escapeHtml(latest.result || 'Passed') + '</span></div>' +
              dueHtml +
            '</div>';
        }

        const condemnBtnHtml = !isArchive
          ? '<button class="btn-ghost" style="color:var(--red);" onclick="openAssetDamageModal(\'' + escapeHtml(a.assetId) + '\')" title="Mark as Damaged / Condemn"><span>Condemn</span></button>'
          : '';

        return `
          <tr style="cursor:pointer;" onclick="openAssetDetailModal('${escapeHtml(a.assetId)}')">
            <td>${thumbHtml}</td>
            <td>
              <div class="font-mono font-bold text-sm" style="color:var(--brand-dark);">${escapeHtml(a.assetId)}</div>
              <div class="font-mono text-xs text-gray">${escapeHtml(a.hospitalCode || '—')}</div>
            </td>
            <td>
              <div class="font-semibold">${escapeHtml(a.assetName)}</div>
              <div class="text-xs text-gray">S/N: <span class="font-mono">${escapeHtml(a.serialNumber || '—')}</span></div>
            </td>
            <td><span class="badge badge-gray">${escapeHtml(a.category || 'Medical Device')}</span></td>
            <td class="font-medium">${escapeHtml(a.room || '—')}</td>
            <td class="center">${getAssetStatusBadge(a.status)}</td>
            <td>${maintSummaryHtml}</td>
            <td class="center no-print" style="white-space:nowrap;" onclick="event.stopPropagation()">
              <button class="btn-ghost" onclick="openAssetQrModal('${escapeHtml(a.assetId)}')" title="View & Print QR Code"><svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2V5h1v1H5zM3 13a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm2 2v-1h1v1H5zM13 3a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4a1 1 0 00-1-1h-3zm1 2v1h1V5h-1z" clip-rule="evenodd"/></svg><span>QR</span></button>
              <button class="btn-ghost" onclick="openAssetDetailModal('${escapeHtml(a.assetId)}')" title="View Profile & Maintenance History">${ICONS.eye}<span>Profile</span></button>
              <button class="btn-ghost" onclick="openAssetFormModal('${escapeHtml(a.assetId)}')" title="Edit Asset">${ICONS.edit}<span>Edit</span></button>
              ${condemnBtnHtml}
            </td>
          </tr>
        `;
      }).join('');
    }

    // Client-side image compression before Base64 upload to Google Drive
    function handleAssetPhotoSelect(inputEl, previewId) {
      const file = inputEl && inputEl.files && inputEl.files[0];
      if (!file) return;
      const previewEl = document.getElementById(previewId);
      if (previewEl) previewEl.innerHTML = '<span class="text-xs">Processing...</span>';

      const reader = new FileReader();
      reader.onload = function(evt) {
        const img = new Image();
        img.onload = function() {
          const maxDim = 1000;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

          if (previewEl) {
            previewEl.innerHTML = buildImgHtml(dataUrl, '', 'width:100%; height:100%; object-fit:cover; border-radius:6px;', 'Preview', false);
          }
          const photoObj = {
            base64: dataUrl,
            fileName: (file.name ? file.name.replace(/\.[^.]+$/, '') : 'asset_photo') + '.jpg',
            mimeType: 'image/jpeg'
          };
          if (previewId === 'asset-dmg-photo-preview') {
            state.pendingDamagePhoto = photoObj;
          } else {
            state.pendingAssetPhoto = photoObj;
          }
        };
        img['sr' + 'c'] = evt.target.result;
      };
      reader.readAsDataURL(file);
    }

    function openAssetFormModal(assetId) {
      state.pendingAssetPhoto = null;
      const fileInput = document.getElementById('asset-form-photo-input');
      if (fileInput) fileInput.value = '';
      const previewEl = document.getElementById('asset-form-photo-preview');

      const existing = assetId ? (state.assets || []).find(a => String(a.assetId) === String(assetId)) : null;
      document.getElementById('asset-form-modal-title').innerText = existing ? ('Edit Asset (' + existing.assetId + ')') : 'Register New Asset';
      document.getElementById('asset-form-id').value              = existing ? existing.assetId : '';
      document.getElementById('asset-form-sysid-display').value   = existing ? existing.assetId : 'Auto-generated (AST-XXXX)';
      document.getElementById('asset-form-existing-photo').value  = existing ? (existing.photoUrl || '') : '';
      document.getElementById('asset-form-hospcode').value        = existing ? (existing.hospitalCode || '') : '';
      document.getElementById('asset-form-name').value            = existing ? (existing.assetName || '') : '';
      document.getElementById('asset-form-sn').value              = existing ? (existing.serialNumber || '') : '';
      document.getElementById('asset-form-cat').value             = existing ? (existing.category || 'Medical Device') : 'Medical Device';
      document.getElementById('asset-form-room').value            = existing ? (existing.room || '') : '';
      document.getElementById('asset-form-status').value          = existing ? (existing.status || 'Active') : 'Active';
      document.getElementById('asset-form-acqdate').value         = existing ? (existing.acquisitionDate || '') : '';
      document.getElementById('asset-form-wardate').value         = existing ? (existing.warrantyDate || '') : '';
      document.getElementById('asset-form-notes').value           = existing ? (existing.notes || '') : '';

      if (previewEl) {
        if (existing && existing.photoUrl) {
          previewEl.innerHTML = buildImgHtml(escapeHtml(existing.photoUrl), '', 'width:100%; height:100%; object-fit:cover; border-radius:6px;', 'Asset', false);
        } else {
          previewEl.innerHTML = 'No Photo';
        }
      }
      openModal('modal-asset-form');
    }

    function saveAssetModal() {
      const assetId         = document.getElementById('asset-form-id').value.trim();
      const hospitalCode    = document.getElementById('asset-form-hospcode').value.trim();
      const assetName       = document.getElementById('asset-form-name').value.trim();
      const serialNumber    = document.getElementById('asset-form-sn').value.trim();
      const category        = document.getElementById('asset-form-cat').value;
      const room            = document.getElementById('asset-form-room').value.trim();
      const status          = document.getElementById('asset-form-status').value;
      const acquisitionDate = document.getElementById('asset-form-acqdate').value;
      const warrantyDate    = document.getElementById('asset-form-wardate').value;
      const notes           = document.getElementById('asset-form-notes').value.trim();
      const existingPhoto   = document.getElementById('asset-form-existing-photo').value.trim();

      if (!hospitalCode) { showToast('Please enter the Hospital Asset Code'); return; }
      if (!assetName)    { showToast('Please enter the Asset Name'); return; }
      if (!room)         { showToast('Please specify the Sub-Location / Room'); return; }

      const payload = {
        assetId,
        hospitalCode,
        serialNumber,
        assetName,
        category,
        room,
        status,
        acquisitionDate,
        warrantyDate,
        notes,
        photoUrl: existingPhoto
      };

      if (state.pendingAssetPhoto) {
        payload.base64Photo   = state.pendingAssetPhoto.base64;
        payload.photoFileName = state.pendingAssetPhoto.fileName;
        payload.photoMimeType = state.pendingAssetPhoto.mimeType;
      }

      closeModal();
      setSyncIndicator(true);

      if (isApiConfigured()) {
        callApi('saveAssetItem', payload)
          .then(res => {
            setSyncIndicator(false);
            showToast(assetId ? ('Asset ' + res.assetId + ' updated!') : ('Asset ' + res.assetId + ' registered!'));
            fetchDataFromServer();
          })
          .catch(err => {
            setSyncIndicator(false);
            showToast('Failed: ' + (err.message || err));
          });
      } else {
        setSyncIndicator(false);
        if (!Array.isArray(state.assets)) state.assets = [];
        const finalPhoto = state.pendingAssetPhoto ? state.pendingAssetPhoto.base64 : existingPhoto;
        if (assetId) {
          const idx = state.assets.findIndex(a => String(a.assetId) === String(assetId));
          if (idx >= 0) {
            state.assets[idx] = Object.assign({}, state.assets[idx], {
              hospitalCode, serialNumber, assetName, category, room, status,
              acquisitionDate, warrantyDate, notes, photoUrl: finalPhoto, updatedAt: getToday()
            });
          }
          showToast('Asset ' + assetId + ' updated (mock)');
        } else {
          const nextNum = (state.assets.length + 1);
          const newId = 'AST-' + String(nextNum).padStart(4, '0');
          state.assets.unshift({
            assetId: newId,
            hospitalCode, serialNumber, assetName, category, room, status,
            photoUrl: finalPhoto, acquisitionDate, warrantyDate, notes,
            maintenanceHistory: [], damageInfo: null, updatedAt: getToday()
          });
          showToast('Asset ' + newId + ' registered (mock)');
        }
        renderAssetsTab();
      }
    }

    function openAssetDetailModal(assetId) {
      const a = (state.assets || []).find(x => String(x.assetId) === String(assetId));
      if (!a) {
        showToast('Asset not found: ' + assetId);
        return;
      }
      state.activeAssetDetailId = a.assetId;
      toggleAddMaintForm(false);

      document.getElementById('asset-detail-title').innerText = a.assetName + ' (' + a.assetId + ')';
      document.getElementById('asset-detail-status-badge').innerHTML = getAssetStatusBadge(a.status);

      const qrData = a.hospitalCode || a.assetId;
      const qrImgUrl = buildQrCodeUrl(qrData, 150);
      const photoBoxHtml = a.photoUrl
        ? buildImgHtml(escapeHtml(a.photoUrl), '', 'width:100%; height:190px; object-fit:cover; border-radius:8px; border:1px solid var(--gray-200);', escapeHtml(a.assetName), false)
        : '<div style="width:100%; height:190px; border-radius:8px; border:1px dashed var(--gray-300); background:var(--gray-50); display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--gray-400); font-size:12px;">No Asset Photo</div>';
      const qrBoxImgHtml = buildImgHtml(qrImgUrl, '', 'width:120px; height:120px; margin:0 auto; display:block;', 'QR ' + escapeHtml(qrData), false);

      document.getElementById('asset-detail-top-box').innerHTML = `
        <div>${photoBoxHtml}</div>
        <div style="background:var(--gray-50); border:1px solid var(--gray-200); border-radius:8px; padding:12px 14px;" class="space-y-sm text-sm">
          <div class="grid-2" style="gap:8px;">
            <div><span class="text-xs text-gray block">System Asset ID</span><strong class="font-mono">${escapeHtml(a.assetId)}</strong></div>
            <div><span class="text-xs text-gray block">Hospital Asset Code</span><strong class="font-mono">${escapeHtml(a.hospitalCode || '—')}</strong></div>
            <div><span class="text-xs text-gray block">Serial Number (S/N)</span><strong class="font-mono">${escapeHtml(a.serialNumber || '—')}</strong></div>
            <div><span class="text-xs text-gray block">Category</span><strong>${escapeHtml(a.category || '—')}</strong></div>
            <div><span class="text-xs text-gray block">Sub-Location / Room</span><strong>${escapeHtml(a.room || '—')}</strong></div>
            <div><span class="text-xs text-gray block">Acquisition / Warranty</span><strong>${formatDate(a.acquisitionDate) || '—'} / ${formatDate(a.warrantyDate) || '—'}</strong></div>
          </div>
          <div style="border-top:1px solid var(--gray-200); padding-top:8px;">
            <span class="text-xs text-gray block">Notes / Technical Specifications</span>
            <div class="text-xs mt-1">${escapeHtml(a.notes || 'No additional technical notes.')}</div>
          </div>
        </div>
        <div style="border:1px solid var(--gray-200); border-radius:8px; padding:10px; text-align:center; background:var(--white);">
          ${qrBoxImgHtml}
          <div class="font-mono font-bold text-xs mt-1">${escapeHtml(a.hospitalCode || a.assetId)}</div>
          <button type="button" class="btn btn-outline btn-sm mt-2" style="width:100%; justify-content:center;" onclick="printAssetQrLabel('${escapeHtml(a.assetId)}')">
            ${ICONS.print}<span>Print QR</span>
          </button>
        </div>
      `;

      // Damage / Condemnation box
      const dmgBox = document.getElementById('asset-detail-damage-box');
      if (dmgBox) {
        if (a.damageInfo && (a.status === 'Damaged' || a.status === 'Condemned' || a.damageInfo.cause)) {
          const di = a.damageInfo;
          const dmgPhotoHtml = di.photoUrl
            ? buildImgHtml(escapeHtml(di.photoUrl), '', 'width:72px; height:72px; object-fit:cover; border-radius:6px; border:1px solid #fca5a5;', 'Damage photo', false)
            : '';
          dmgBox.classList.remove('hidden');
          dmgBox.innerHTML = `
            <div class="flex justify-between items-start gap-4 flex-wrap">
              <div style="flex:1;">
                <div class="font-bold text-sm" style="color:#991b1b;">Condemnation / Damage Record (${escapeHtml(a.status)})</div>
                <div class="text-xs mt-1" style="color:#7f1d1d;">
                  <strong>Date:</strong> ${formatDate(di.damageDate)} &nbsp;|&nbsp;
                  <strong>Memo / Tracking No.:</strong> <span class="font-mono">${escapeHtml(di.memoNo || '—')}</span> &nbsp;|&nbsp;
                  <strong>Recorded By:</strong> ${escapeHtml(di.recordedBy || '—')}
                </div>
                <div class="text-xs mt-1" style="color:#7f1d1d;"><strong>Cause of Damage:</strong> ${escapeHtml(di.cause || '—')}</div>
              </div>
              ${dmgPhotoHtml}
            </div>
          `;
        } else {
          dmgBox.classList.add('hidden');
          dmgBox.innerHTML = '';
        }
      }

      // Maintenance History Table
      renderAssetMaintHistoryTable(a);

      // Left Footer Action Buttons
      const leftAct = document.getElementById('asset-detail-left-actions');
      if (leftAct) {
        const condemnActionHtml = (a.status !== 'Condemned')
          ? '<button type="button" class="btn btn-outline btn-sm" style="color:var(--red); border-color:#fecaca;" onclick="openAssetDamageModal(\'' + escapeHtml(a.assetId) + '\')"><span>Mark as Damaged / Condemn</span></button>'
          : '';
        leftAct.innerHTML = `
          <button type="button" class="btn btn-outline btn-sm" onclick="openAssetFormModal('${escapeHtml(a.assetId)}')">
            ${ICONS.edit}<span>Edit Profile</span>
          </button>
          ${condemnActionHtml}
          <button type="button" class="btn btn-outline btn-sm" style="color:var(--gray-500);" onclick="removeAssetItem('${escapeHtml(a.assetId)}')">
            ${ICONS.trash}<span>Delete Asset</span>
          </button>
        `;
      }

      openModal('modal-asset-detail');
    }

    function renderAssetMaintHistoryTable(asset) {
      const tbody = document.getElementById('asset-maint-history-body');
      if (!tbody) return;
      const hist = Array.isArray(asset.maintenanceHistory) ? asset.maintenanceHistory : [];
      if (hist.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No maintenance, calibration, or radiation survey events recorded yet.</td></tr>`;
        return;
      }
      tbody.innerHTML = hist.map(h => {
        const isPass = String(h.result || 'Passed') === 'Passed';
        const resBadge = isPass
          ? `<span class="badge badge-ok">Passed</span>`
          : `<span class="badge badge-low">Action Required</span>`;
        return `
          <tr>
            <td class="font-medium">${formatDate(h.date)}</td>
            <td class="font-semibold">${escapeHtml(h.type)}</td>
            <td>${escapeHtml(h.provider || '—')}</td>
            <td class="center">${resBadge}</td>
            <td class="font-mono text-xs">${h.nextDueDate ? formatDate(h.nextDueDate) : '—'}</td>
            <td class="text-xs">${escapeHtml(h.notes || '—')}</td>
            <td class="center">
              <button type="button" class="btn-ghost" style="color:var(--red);" onclick="removeAssetMaintenanceLog('${escapeHtml(asset.assetId)}', '${escapeHtml(h.logId || '')}')" title="Delete log">${ICONS.trash}</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    function toggleAddMaintForm(forceState) {
      const box = document.getElementById('asset-maint-form-box');
      if (!box) return;
      const show = typeof forceState === 'boolean' ? forceState : box.classList.contains('hidden');
      box.classList.toggle('hidden', !show);
      if (show) {
        document.getElementById('maint-form-date').value      = getToday();
        document.getElementById('maint-form-type').value      = 'Preventive Maintenance (PM)';
        document.getElementById('maint-form-provider').value  = '';
        document.getElementById('maint-form-result').value    = 'Passed';
        document.getElementById('maint-form-nextdue').value   = '';
        document.getElementById('maint-form-newstatus').value = '';
        document.getElementById('maint-form-notes').value     = '';
      }
    }

    function submitAssetMaintenanceLog() {
      const assetId     = state.activeAssetDetailId;
      if (!assetId) return;
      const date        = document.getElementById('maint-form-date').value || getToday();
      const type        = document.getElementById('maint-form-type').value;
      const provider    = document.getElementById('maint-form-provider').value.trim();
      const result      = document.getElementById('maint-form-result').value;
      const nextDueDate = document.getElementById('maint-form-nextdue').value;
      const newStatus   = document.getElementById('maint-form-newstatus').value;
      const notes       = document.getElementById('maint-form-notes').value.trim();

      if (!date || !type) {
        showToast('Event Date and Maintenance Type are required');
        return;
      }

      const payload = { assetId, date, type, provider, result, nextDueDate, newStatus, notes };
      setSyncIndicator(true);

      if (isApiConfigured()) {
        callApi('addAssetMaintenanceLog', payload)
          .then(res => {
            setSyncIndicator(false);
            const a = (state.assets || []).find(x => String(x.assetId) === String(assetId));
            if (a) {
              if (!Array.isArray(a.maintenanceHistory)) a.maintenanceHistory = [];
              a.maintenanceHistory.unshift(res.logEntry);
              if (newStatus) a.status = newStatus;
              openAssetDetailModal(assetId);
            }
            showToast('Maintenance / QC event logged!');
            renderAssetsTab();
          })
          .catch(err => {
            setSyncIndicator(false);
            showToast('Failed: ' + (err.message || err));
          });
      } else {
        setSyncIndicator(false);
        const a = (state.assets || []).find(x => String(x.assetId) === String(assetId));
        if (a) {
          if (!Array.isArray(a.maintenanceHistory)) a.maintenanceHistory = [];
          a.maintenanceHistory.unshift({
            logId: 'MNT-' + Date.now().toString().slice(-6),
            date, type, provider, result, nextDueDate, notes
          });
          if (newStatus) a.status = newStatus;
          openAssetDetailModal(assetId);
          renderAssetsTab();
          showToast('Maintenance / QC event logged (mock)');
        }
      }
    }

    function removeAssetMaintenanceLog(assetId, logId) {
      verifyPasscodeThen(state.currentLang === 'th' ? `ต้องการลบประวัติการบำรุงรักษา ${logId} หรือไม่?` : `Delete maintenance log entry ${logId}?`, () => {
        setSyncIndicator(true);
        if (isApiConfigured()) {
          callApi('deleteAssetMaintenanceLog', { assetId, logId })
            .then(() => {
              setSyncIndicator(false);
              const a = (state.assets || []).find(x => String(x.assetId) === String(assetId));
              if (a && Array.isArray(a.maintenanceHistory)) {
                a.maintenanceHistory = a.maintenanceHistory.filter(h => String(h.logId) !== String(logId));
                renderAssetMaintHistoryTable(a);
              }
              renderAssetsTab();
              showToast('Maintenance log deleted');
            })
            .catch(err => {
              setSyncIndicator(false);
              showToast('Failed: ' + (err.message || err));
            });
        } else {
          setSyncIndicator(false);
          const a = (state.assets || []).find(x => String(x.assetId) === String(assetId));
          if (a && Array.isArray(a.maintenanceHistory)) {
            a.maintenanceHistory = a.maintenanceHistory.filter(h => String(h.logId) !== String(logId));
            renderAssetMaintHistoryTable(a);
            renderAssetsTab();
            showToast('Maintenance log deleted (mock)');
          }
        }
      });
    }

    function openAssetDamageModal(assetId) {
      const a = (state.assets || []).find(x => String(x.assetId) === String(assetId));
      if (!a) return;
      state.pendingDamagePhoto = null;
      const fileInput = document.getElementById('asset-dmg-photo-input');
      if (fileInput) fileInput.value = '';
      const previewEl = document.getElementById('asset-dmg-photo-preview');
      if (previewEl) previewEl.innerHTML = 'No Photo';

      document.getElementById('asset-dmg-id').value     = a.assetId;
      document.getElementById('asset-dmg-status').value = 'Damaged';
      document.getElementById('asset-dmg-date').value   = getToday();
      document.getElementById('asset-dmg-cause').value  = (a.damageInfo && a.damageInfo.cause) ? a.damageInfo.cause : '';
      document.getElementById('asset-dmg-memo').value   = (a.damageInfo && a.damageInfo.memoNo) ? a.damageInfo.memoNo : '';
      document.getElementById('asset-dmg-by').value     = (a.damageInfo && a.damageInfo.recordedBy) ? a.damageInfo.recordedBy : '';

      document.getElementById('asset-dmg-summary').innerHTML = `
        <div class="flex justify-between items-center">
          <strong>${escapeHtml(a.assetName)} (${escapeHtml(a.assetId)})</strong>
          <span class="font-mono text-xs">${escapeHtml(a.hospitalCode || '')}</span>
        </div>
        <div class="text-xs mt-1">Room: <strong>${escapeHtml(a.room || '—')}</strong> &nbsp;|&nbsp; S/N: <span class="font-mono">${escapeHtml(a.serialNumber || '—')}</span></div>
      `;

      openModal('modal-asset-damage');
    }

    function confirmAssetDamage() {
      const assetId      = document.getElementById('asset-dmg-id').value.trim();
      const targetStatus = document.getElementById('asset-dmg-status').value;
      const damageDate   = document.getElementById('asset-dmg-date').value || getToday();
      const cause        = document.getElementById('asset-dmg-cause').value.trim();
      const memoNo       = document.getElementById('asset-dmg-memo').value.trim();
      const recordedBy   = document.getElementById('asset-dmg-by').value.trim();

      if (!cause)      { showToast('Please enter the Cause of Damage / Reason'); return; }
      if (!recordedBy) { showToast('Please enter Recorded By (Staff Name)'); return; }

      const payload = { assetId, targetStatus, damageDate, cause, memoNo, recordedBy };
      if (state.pendingDamagePhoto) {
        payload.base64Photo   = state.pendingDamagePhoto.base64;
        payload.photoFileName = state.pendingDamagePhoto.fileName;
        payload.photoMimeType = state.pendingDamagePhoto.mimeType;
      }

      closeModal();
      setSyncIndicator(true);

      if (isApiConfigured()) {
        callApi('markAssetDamaged', payload)
          .then(res => {
            setSyncIndicator(false);
            showToast(`Asset ${assetId} marked as ${res.status} and moved to archive.`);
            fetchDataFromServer();
          })
          .catch(err => {
            setSyncIndicator(false);
            showToast('Failed: ' + (err.message || err));
          });
      } else {
        setSyncIndicator(false);
        const a = (state.assets || []).find(x => String(x.assetId) === String(assetId));
        if (a) {
          a.status = targetStatus;
          a.damageInfo = {
            damageDate,
            cause,
            memoNo,
            photoUrl: state.pendingDamagePhoto ? state.pendingDamagePhoto.base64 : '',
            recordedBy,
            targetStatus
          };
        }
        showToast(`Asset ${assetId} marked as ${targetStatus} (mock)`);
        renderAssetsTab();
      }
    }

    function removeAssetItem(assetId) {
      verifyPasscodeThen(state.currentLang === 'th' ? `ต้องการลบครุภัณฑ์ ${assetId} ออกอย่างถาวรหรือไม่?` : `Delete asset ${assetId} permanently from registry?`, () => {
        closeModal();
        setSyncIndicator(true);
        if (isApiConfigured()) {
          callApi('deleteAssetItem', { assetId })
            .then(() => {
              setSyncIndicator(false);
              showToast('Asset deleted');
              fetchDataFromServer();
            })
            .catch(err => {
              setSyncIndicator(false);
              showToast('Failed: ' + (err.message || err));
            });
        } else {
          setSyncIndicator(false);
          state.assets = (state.assets || []).filter(a => String(a.assetId) !== String(assetId));
          showToast('Asset deleted (mock)');
          renderAssetsTab();
        }
      });
    }

    function openAssetQrModal(assetId) {
      const a = (state.assets || []).find(x => String(x.assetId) === String(assetId));
      if (!a) return;
      state.selectedQrAssetId = a.assetId;
      const qrData = a.hospitalCode || a.assetId;
      const qrImgUrl = buildQrCodeUrl(qrData, 220);
      const imgEl = document.getElementById('asset-qr-img');
      if (imgEl) imgEl.src = qrImgUrl;
      const nameEl = document.getElementById('asset-qr-name');
      if (nameEl) nameEl.innerText = a.assetName;
      const codeEl = document.getElementById('asset-qr-code');
      if (codeEl) codeEl.innerText = qrData;
      const metaEl = document.getElementById('asset-qr-meta');
      if (metaEl) metaEl.innerText = `Asset ID: ${a.assetId} | S/N: ${a.serialNumber || '—'} | Room: ${a.room || '—'}`;
      openModal('modal-asset-qr');
    }

    function printAssetQrLabel(assetId) {
      const targetId = assetId || state.selectedQrAssetId || state.activeAssetDetailId;
      const a = (state.assets || []).find(x => String(x.assetId) === String(targetId));
      if (!a) return;
      const qrData = a.hospitalCode || a.assetId;
      const qrImgUrl = buildQrCodeUrl(qrData, 180);
      const qrPrintImgHtml = buildImgHtml(qrImgUrl, '', 'width:110px; height:110px; flex-shrink:0;', 'QR', false);
      const html = `
        <div style="padding:20px; font-family:'Noto Sans', 'Noto Sans Thai', sans-serif;">
          <div style="border:2px solid #111827; border-radius:10px; padding:16px; max-width:380px; display:flex; gap:14px; align-items:center;">
            ${qrPrintImgHtml}
            <div style="font-size:12px; line-height:1.4;">
              <div style="font-weight:800; font-size:14px; color:#111827;">INR EQUIPMENT ASSET</div>
              <div style="font-family:monospace; font-weight:700; font-size:15px; color:#059669; margin-top:2px;">${escapeHtml(a.hospitalCode || a.assetId)}</div>
              <div style="font-weight:700; margin-top:4px;">${escapeHtml(a.assetName)}</div>
              <div style="color:#4b5563; font-size:11px; margin-top:2px;">Asset ID: ${escapeHtml(a.assetId)}</div>
              <div style="color:#4b5563; font-size:11px;">S/N: ${escapeHtml(a.serialNumber || '—')}</div>
              <div style="color:#4b5563; font-size:11px;">Room: ${escapeHtml(a.room || '—')}</div>
            </div>
          </div>
        </div>
      `;
      printStageHtml(html);
    }

    function exportAssetsCSV() {
      const assets = Array.isArray(state.assets) ? state.assets : [];
      if (assets.length === 0) {
        showToast('No assets data to export');
        return;
      }
      const headers = ['Asset ID', 'Hospital Asset Code', 'Asset Name', 'Category', 'Serial Number', 'Room / Location', 'Status', 'Acquisition Date', 'Warranty Date', 'Vendor', 'Cost', 'Notes'];
      const csvLines = [
        headers.map(h => '"' + h.replace(/"/g, '""') + '"').join(',')
      ];
      assets.forEach(a => {
        const row = [
          a.assetId || '',
          a.hospitalCode || '',
          a.assetName || '',
          a.category || '',
          a.serialNumber || '',
          a.room || '',
          a.status || '',
          a.acquisitionDate || '',
          a.warrantyDate || '',
          a.vendor || '',
          a.cost || '',
          a.notes || ''
        ];
        csvLines.push(row.map(val => '"' + String(val).replace(/"/g, '""').replace(/[\r\n]+/g, ' ') + '"').join(','));
      });
      const filename = `INR_Assets_${getToday()}.csv`;
      const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Exported CSV: ' + filename);
    }

    function printAssetsList() {
      const assets = Array.isArray(state.assets) ? state.assets : [];
      if (assets.length === 0) {
        showToast('No assets to print');
        return;
      }
      const html = `
        <div style="padding:20px; font-family:'Noto Sans', 'Noto Sans Thai', sans-serif;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #111827; padding-bottom:10px; margin-bottom:15px;">
            <div>
              <h2 style="margin:0; font-size:18px; font-weight:800; color:#111827;">Hospital Equipment & Fixed Assets Registry</h2>
              <div style="font-size:12px; color:#4b5563;">Interventional Neuroradiology (INR) · Total: ${assets.length} items</div>
            </div>
            <div style="font-size:11px; text-align:right; color:#6b7280;">Printed: ${formatDate(getToday())}</div>
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:11px;">
            <thead>
              <tr style="background:#f3f4f6; border-bottom:1.5px solid #d1d5db; text-align:left;">
                <th style="padding:6px 8px;">Asset ID</th>
                <th style="padding:6px 8px;">Hospital Code</th>
                <th style="padding:6px 8px;">Asset Name</th>
                <th style="padding:6px 8px;">Category</th>
                <th style="padding:6px 8px;">S/N</th>
                <th style="padding:6px 8px;">Room</th>
                <th style="padding:6px 8px;">Status</th>
                <th style="padding:6px 8px;">Acquisition</th>
              </tr>
            </thead>
            <tbody>
              ${assets.map(a => `
                <tr style="border-bottom:1px solid #e5e7eb; page-break-inside:avoid;">
                  <td style="padding:5px 8px; font-family:monospace; font-weight:bold;">${escapeHtml(a.assetId)}</td>
                  <td style="padding:5px 8px; font-family:monospace;">${escapeHtml(a.hospitalCode || '—')}</td>
                  <td style="padding:5px 8px; font-weight:600;">${escapeHtml(a.assetName)}</td>
                  <td style="padding:5px 8px;">${escapeHtml(a.category || '—')}</td>
                  <td style="padding:5px 8px; font-family:monospace;">${escapeHtml(a.serialNumber || '—')}</td>
                  <td style="padding:5px 8px;">${escapeHtml(a.room || '—')}</td>
                  <td style="padding:5px 8px;">${escapeHtml(a.status || 'Active')}</td>
                  <td style="padding:5px 8px;">${formatDate(a.acquisitionDate)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      printStageHtml(html);
    }

    // ── QR CODE & BARCODE CAMERA SCANNER (html5-qrcode) ──
    let _qrLibLoading = false;
    let _qrScannerInstance = null;
    let _currentCameraFacing = 'environment';
    let _lastScannedCode = '';
    let _lastScannedTime = 0;

    function ensureQrCodeLibrary(callback) {
      if (typeof Html5Qrcode !== 'undefined') {
        callback(true);
        return;
      }
      if (_qrLibLoading) {
        setTimeout(() => callback(typeof Html5Qrcode !== 'undefined'), 600);
        return;
      }
      _qrLibLoading = true;
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
      script.async = true;
      script.onload = () => { _qrLibLoading = false; callback(typeof Html5Qrcode !== 'undefined'); };
      script.onerror = () => { _qrLibLoading = false; callback(false); };
      document.body.appendChild(script);
    }

    function openQrScannerModal() {
      const manualInput = document.getElementById('qr-manual-code');
      if (manualInput) manualInput.value = '';
      _lastScannedCode = '';
      _lastScannedTime = 0;
      openModal('modal-qr-scanner');
      setTimeout(() => {
        startCameraScanning();
      }, 120);
    }

    function startCameraScanning() {
      const statusEl = document.getElementById('qr-scanner-status');
      if (statusEl) statusEl.innerText = state.currentLang === 'th' ? 'กำลังเชื่อมต่อกล้อง...' : 'Initializing camera scanner...';

      ensureQrCodeLibrary((loaded) => {
        if (!loaded || typeof Html5Qrcode === 'undefined') {
          if (statusEl) statusEl.innerText = state.currentLang === 'th'
            ? 'ไม่สามารถโหลดระบบสแกนผ่านกล้องได้ กรุณากรอกรหัส Asset ด้านล่าง'
            : 'QR & Barcode camera library unavailable. Please use manual code lookup below.';
          return;
        }

        try {
          if (_qrScannerInstance) {
            stopQrScannerInstance();
          }

          // Configure 2D QR Code and 1D Barcodes (Code 128, Code 39, EAN, UPC)
          const formatsToSupport = (typeof Html5QrcodeSupportedFormats !== 'undefined') ? [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E
          ] : undefined;

          _qrScannerInstance = new Html5Qrcode('qr-reader', {
            formatsToSupport: formatsToSupport,
            verbose: false
          });

          const config = {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const minDim = Math.min(viewfinderWidth, viewfinderHeight);
              const w = Math.min(Math.max(Math.floor(minDim * 0.85), 240), viewfinderWidth - 20);
              const h = Math.min(Math.max(Math.floor(w * 0.75), 160), viewfinderHeight - 20);
              return { width: w, height: h };
            },
            aspectRatio: 1.0
          };

          _qrScannerInstance.start(
            { facingMode: _currentCameraFacing },
            config,
            (decodedText) => {
              handleQrCodeScanned(decodedText);
            },
            () => {}
          ).then(() => {
            const camLabel = _currentCameraFacing === 'environment' ? 'Back' : 'Front';
            if (statusEl) statusEl.innerText = state.currentLang === 'th'
              ? `กล้องพร้อมใช้งาน (${camLabel}) — เล็งกล้องไปที่ QR Code หรือ Barcode ครุภัณฑ์`
              : `Camera active (${camLabel}) — align Asset QR code or Barcode within the frame.`;
          }).catch(err => {
            const msg = String(err && err.message ? err.message : err);
            if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
              if (statusEl) statusEl.innerText = state.currentLang === 'th'
                ? '⚠️ การเข้าถึงกล้องถูกปฏิเสธ กรุณากดยอมรับสิทธิ์กล้องในเบราว์เซอร์ หรือค้นหาด้วยรหัสครุภัณฑ์ด้านล่าง'
                : '⚠️ Camera access denied. Please grant camera permission in your browser or enter Asset ID below.';
            } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError')) {
              if (statusEl) statusEl.innerText = state.currentLang === 'th'
                ? '⚠️ ไม่พบอุปกรณ์กล้องบนเครื่องนี้ กรุณาพิมพ์รหัสค้นหาด้านล่าง'
                : '⚠️ No camera found on this device. Please use manual code lookup below.';
            } else if (msg.includes('NotReadableError')) {
              if (statusEl) statusEl.innerText = state.currentLang === 'th'
                ? '⚠️ กล้องกำลังถูกใช้งานโดยแอปพลิเคชันอื่น กรุณาปิดแท็บอื่นแล้วลองใหม่'
                : '⚠️ Camera is in use by another application. Please close other camera tabs and retry.';
            } else {
              if (statusEl) statusEl.innerText = `Camera access unavailable (${msg}). Use manual lookup below.`;
            }
          });
        } catch (e) {
          if (statusEl) statusEl.innerText = 'Unable to start camera scanner. Use manual lookup below.';
        }
      });
    }

    function toggleCameraFacing() {
      _currentCameraFacing = (_currentCameraFacing === 'environment') ? 'user' : 'environment';
      startCameraScanning();
    }

    function stopQrScannerInstance() {
      if (_qrScannerInstance) {
        const inst = _qrScannerInstance;
        _qrScannerInstance = null;
        try {
          if (inst.isScanning) {
            inst.stop().then(() => {
              try { inst.clear(); } catch (e) {}
            }).catch(() => {
              try { inst.clear(); } catch (e) {}
            });
          } else {
            try { inst.clear(); } catch (e) {}
          }
        } catch (e) {}
      }
    }

    function closeQrScannerModal() {
      stopQrScannerInstance();
      closeModal();
    }

    function handleQrCodeScanned(codeStr) {
      const q = String(codeStr || '').trim();
      if (!q) return;
      const now = Date.now();
      if (q === _lastScannedCode && (now - _lastScannedTime < 2500)) return;
      _lastScannedCode = q;
      _lastScannedTime = now;

      lookupAndOpenAssetByCode(q);
    }

    function handleManualQrLookup() {
      const q = (document.getElementById('qr-manual-code')?.value || '').trim();
      if (!q) {
        showToast(state.currentLang === 'th' ? 'กรุณากรอกรหัส Asset ID หรือ Hospital Asset Code' : 'Please enter an Asset ID or Hospital Asset Code');
        return;
      }
      stopQrScannerInstance();
      lookupAndOpenAssetByCode(q);
    }

    function lookupAndOpenAssetByCode(queryStr) {
      const rawQ = String(queryStr || '').trim();
      if (!rawQ) return;
      const qL = rawQ.toLowerCase();

      // Query asset records matching either Hospital Asset Code or Asset ID
      const matched = (state.assets || []).find(a => {
        const aId = String(a.assetId || '').trim().toLowerCase();
        const hCode = String(a.hospitalCode || '').trim().toLowerCase();
        const sNum = String(a.serialNumber || '').trim().toLowerCase();
        if (aId && (aId === qL || qL.includes(aId) || aId.includes(qL))) return true;
        if (hCode && (hCode === qL || qL.includes(hCode) || hCode.includes(qL))) return true;
        if (sNum && sNum === qL) return true;
        return false;
      });

      if (matched) {
        closeQrScannerModal();
        showToast(`Found Asset: ${matched.assetName || matched.assetId} (${matched.hospitalCode || matched.assetId})`);
        openAssetDetailModal(matched.assetId);
      } else {
        showToast(state.currentLang === 'th' ? `⚠️ ไม่พบข้อมูลครุภัณฑ์ที่ตรงกับรหัส "${rawQ}"` : `⚠️ No matching asset found for code: "${rawQ}"`);
        const statusEl = document.getElementById('qr-scanner-status');
        if (statusEl) statusEl.innerText = state.currentLang === 'th' ? `⚠️ ไม่พบครุภัณฑ์รหัส "${rawQ}" — กรุณาลองสแกนใหม่` : `⚠️ No asset matched "${rawQ}". Scan another code.`;
      }
    }

    // ===== DATA ACTIONS (SERVER OR OFFLINE MOCK) =====
    function normalizeSettings(raw) {
      const s = raw || {};
      const users = Array.isArray(s.users) ? s.users : (Array.isArray(s.techs) ? s.techs.map(t => ({
        name: t.name || '',
        surname: t.surname || '',
        nickname: t.nickname || '',
        position: t.position || 'Radiological Technologist',
        authorization: t.authorization || 'Operational Staff',
        phone: t.phone || t.tel || '',
        tel: t.phone || t.tel || '',
        dob: t.dob || ''
      })) : []);
      const defaultDepts = [
        'Internal | BIR Room',
        'Internal | Angio Suite',
        'Internal | CT Room',
        'External | Operating Room (OR)',
        'External | Siriraj Hospital',
        'External | Chulalongkorn Hospital',
        'External | Ramathibodi Hospital'
      ];
      return {
        diseases: Array.isArray(s.diseases) ? s.diseases : [],
        procedures: Array.isArray(s.procedures) ? s.procedures : [],
        shifts: Array.isArray(s.shifts) && s.shifts.length > 0 ? s.shifts : ['In-time', 'On-call', 'SMC'],
        categories: Array.isArray(s.categories) ? s.categories : [],
        departments: Array.isArray(s.departments) && s.departments.length > 0 ? s.departments : defaultDepts,
        users: users,
        techs: users
      };
    }

    const APP_CACHE_KEY = 'inr_app_cache_v1';

    function setSyncIndicator(active) {
      const ind = document.getElementById('sync-indicator');
      if (ind) ind.classList.toggle('hidden', !active);
    }

    function applyServerPayload(res) {
      state.inventory = res.inventory || [];
      state.transactions = res.transactions || [];
      state.settings = normalizeSettings(res.settings);
      state.exchangeQuotas = Array.isArray(res.exchangeQuotas) ? res.exchangeQuotas : [];
      state.consignments = Array.isArray(res.consignments) ? res.consignments : [];
      state.loans = Array.isArray(res.loans) ? res.loans : [];
      state.assets = Array.isArray(res.assets) ? res.assets : [];
      state.announcements = Array.isArray(res.announcements) ? res.announcements : [];
      state.ebiddings = Array.isArray(res.ebiddings) ? res.ebiddings : [];
      state.contracts = Array.isArray(res.contracts) ? res.contracts : [];
      state.contractPOs = Array.isArray(res.contractPOs) ? res.contractPOs : [];
      state.specificPurchases = Array.isArray(res.specificPurchases) ? res.specificPurchases : [];
      state.receivings = Array.isArray(res.receivings) ? res.receivings : [];
      state.companyList = Array.isArray(res.companyList) ? res.companyList : [];
      state.fiscalYearList = Array.isArray(res.fiscalYearList) ? res.fiscalYearList : [];
      state.settingsDirty = { diseases: false, procedures: false, shifts: false, categories: false, departments: false, users: false };
      recalculateInventoryHierarchy();
      if (typeof recalculateProcurementState === 'function') recalculateProcurementState();
    }

    function fetchDataFromServer() {
      const hasExistingData = state.inventory && state.inventory.length > 0;
      let loadedFromCache = false;
      if (!hasExistingData) {
        try {
          const rawCache = sessionStorage.getItem(APP_CACHE_KEY) || localStorage.getItem(APP_CACHE_KEY);
          if (rawCache) {
            const parsed = JSON.parse(rawCache);
            if (parsed && Array.isArray(parsed.inventory) && parsed.inventory.length > 0) {
              applyServerPayload(parsed);
              loadedFromCache = true;
              if (appLoading) appLoading.classList.add('hidden');
              if (appContent) appContent.classList.remove('hidden');
              renderCurrentTab();
            }
          }
        } catch (e) {}
      }

      if (hasExistingData || loadedFromCache) {
        setSyncIndicator(true);
        if (appLoading) appLoading.classList.add('hidden');
        if (appContent) appContent.classList.remove('hidden');
      } else {
        if (appLoading) appLoading.classList.remove('hidden');
        if (appContent) appContent.classList.add('hidden');
      }

      if (isApiConfigured()) {
        let timedOut = false;
        let completed = false;
        const fetchTimer = setTimeout(() => {
          if (!completed) {
            timedOut = true;
            setSyncIndicator(false);
            console.warn('Server fetch taking longer than 30s, showing cached/offline view while awaiting response.');
            if (!hasExistingData && !loadedFromCache) {
              showToast('Server is taking longer than usual. Showing temporary view while syncing...');
              loadOfflineMock();
            }
          }
        }, 30000);

        callApi('getAppData', {})
          .then(res => {
            completed = true;
            clearTimeout(fetchTimer);
            setSyncIndicator(false);
            applyServerPayload(res);
            try {
              const serialized = JSON.stringify(res);
              sessionStorage.setItem(APP_CACHE_KEY, serialized);
              localStorage.setItem(APP_CACHE_KEY, serialized);
            } catch (e) {}
            if (appLoading) appLoading.classList.add('hidden');
            if (appContent) appContent.classList.remove('hidden');
            renderCurrentTab();
            if (timedOut) {
              showToast('Connected — live data synced!');
            }
          })
          .catch(err => {
            completed = true;
            clearTimeout(fetchTimer);
            setSyncIndicator(false);
            console.error('Fetch failure:', err);
            const rawMsg = err && err.message ? String(err.message) : 'Unknown';
            if (rawMsg.includes('Failed to fetch')) {
              showToast('Server connection failed: Failed to fetch. Check Apps Script deployment: Execute as: "Me", Access: "Anyone" & redeploy New Version.');
            } else {
              showToast('Server connection failed: ' + rawMsg);
            }
            if (!hasExistingData && !loadedFromCache) loadOfflineMock();
          });
      } else {
        setSyncIndicator(false);
        loadOfflineMock();
      }
    }

    function loadOfflineMock() {
      setTimeout(() => {
        if (!state.inventory || state.inventory.length === 0) {
          state.inventory = [
            {itemId:'1', hoItemId:'42203403INT00001', deviceName:'Introducer sheath 4', category:'Sheath', buyPrice:450, sellPrice:650, mainStock:10, retailStock:4, bufferStock:0, totalStock:14, hoStock:118, stockDiff:-104, stockMonth:25, exceedPercent:-88, orderEstimate:104, buyPoint:20, safetyStock:2, company:'Terumo Thailand'},
            {itemId:'2', hoItemId:'42203403INT00004', deviceName:'Introducer sheath 5', category:'Sheath', buyPrice:480, sellPrice:700, mainStock:300, retailStock:7, bufferStock:2, totalStock:307, hoStock:255, stockDiff:52, stockMonth:40, exceedPercent:20, orderEstimate:0, buyPoint:50, safetyStock:22, company:'Terumo Thailand'},
            {itemId:'3', hoItemId:'42203404SMO00006', deviceName:'Guidewire 0.038" 150 cm', category:'Guidewire', buyPrice:1200, sellPrice:1800, mainStock:120, retailStock:54, bufferStock:0, totalStock:174, hoStock:609, stockDiff:-435, stockMonth:60, exceedPercent:-71, orderEstimate:435, buyPoint:100, safetyStock:45, company:'Terumo Thailand'},
            {itemId:'4', hoItemId:'42221604YSI00001', deviceName:'Y-side arm adapter', category:'Accessory', buyPrice:350, sellPrice:500, mainStock:475, retailStock:19, bufferStock:0, totalStock:494, hoStock:527, stockDiff:-33, stockMonth:80, exceedPercent:-6, orderEstimate:33, buyPoint:60, safetyStock:43, company:'Cordis Medical'},
            {itemId:'5', hoItemId:'42203402IMA00004', deviceName:'Sim2 5 F 100 cm', category:'Catheter', buyPrice:850, sellPrice:1300, mainStock:490, retailStock:12, bufferStock:0, totalStock:502, hoStock:475, stockDiff:27, stockMonth:55, exceedPercent:5, orderEstimate:0, buyPoint:70, safetyStock:48, company:'Cordis Medical'},
            {itemId:'6', hoItemId:'CM-IOP300', deviceName:'Iopamiro 300 (100 ml)', category:'Contrast Media', buyPrice:600, sellPrice:900, mainStock:20, retailStock:6, bufferStock:0, totalStock:26, hoStock:26, stockDiff:0, stockMonth:15, exceedPercent:0, orderEstimate:0, buyPoint:10, safetyStock:5, company:'Bracco Imaging'},
            {itemId:'7', hoItemId:'CM-VIS320', deviceName:'Visipaque 320 (100 ml)', category:'Contrast Media', buyPrice:950, sellPrice:1400, mainStock:3, retailStock:1, bufferStock:0, totalStock:4, hoStock:4, stockDiff:0, stockMonth:10, exceedPercent:0, orderEstimate:6, buyPoint:8, safetyStock:5, company:'GE Healthcare'},
            {itemId:'STENT-260601090000', hoItemId:'42203405SOL00001', deviceName:'Solitaire Platinum Stent Retriever (Group)', category:'Stent', buyPrice:85000, sellPrice:95000, mainStock:0, retailStock:0, bufferStock:0, totalStock:0, hoStock:6, ownHoStock:6, stockDiff:0, stockMonth:4, exceedPercent:0, orderEstimate:0, buyPoint:2, safetyStock:1, isFreeItem:false, isParent:true, parentId:'', company:'Medtronic Thailand'},
            {itemId:'STENT-260601090001', hoItemId:'42203405SOL00001', deviceName:'Solitaire Platinum 4x40 mm', category:'Stent', buyPrice:85000, sellPrice:95000, mainStock:2, retailStock:2, bufferStock:0, totalStock:4, hoStock:0, stockDiff:4, stockMonth:2, exceedPercent:0, orderEstimate:0, buyPoint:1, safetyStock:1, isFreeItem:false, isParent:false, parentId:'STENT-260601090000', company:'Medtronic Thailand'},
            {itemId:'STENT-260601090002', hoItemId:'42203405SOL00001', deviceName:'Solitaire Platinum 6x40 mm', category:'Stent', buyPrice:85000, sellPrice:95000, mainStock:1, retailStock:1, bufferStock:0, totalStock:2, hoStock:0, stockDiff:2, stockMonth:2, exceedPercent:0, orderEstimate:0, buyPoint:1, safetyStock:1, isFreeItem:false, isParent:false, parentId:'STENT-260601090000', company:'Medtronic Thailand'},
            {itemId:'MICRO-260601090010', hoItemId:'42203406REB00018', deviceName:'Rebar 18 Microcatheter (PO)', category:'Microcatheter', buyPrice:18500, sellPrice:22000, mainStock:3, retailStock:2, bufferStock:0, totalStock:5, hoStock:5, stockDiff:0, stockMonth:4, exceedPercent:0, orderEstimate:0, buyPoint:2, safetyStock:1, isFreeItem:false, isParent:false, parentId:'', company:'Medtronic Thailand'},
            {itemId:'MICRO-260601090011', hoItemId:'', deviceName:'Rebar 18 Microcatheter (Free)', category:'Microcatheter', buyPrice:0, sellPrice:0, mainStock:2, retailStock:2, bufferStock:0, totalStock:4, hoStock:0, stockDiff:0, stockMonth:0, exceedPercent:0, orderEstimate:0, buyPoint:0, safetyStock:0, isFreeItem:true, isParent:false, parentId:'', company:'Medtronic Thailand'}
          ];
          recalculateInventoryHierarchy();
        }
        if (!state.announcements || state.announcements.length === 0) {
          state.announcements = [
            {
              id: 'ANN-260601083000',
              title: 'ข้อตกลงการตัดสต็อกชุด Solitaire Platinum + Rebar 18 (Free)',
              content: 'เมื่อเปิดใช้ Solitaire Platinum 1 ชิ้น สามารถเลือกตัด Rebar 18 Microcatheter (Free) คู่กันได้ทันที โดยตัว (Free) จะตั้งราคาทุน = 0 และไม่นำไปกระทบยอด HO Stock',
              priority: 1,
              badge: 'Critical',
              updatedAt: '2026-06-01 08:30'
            },
            {
              id: 'ANN-260602091500',
              title: 'การจัดการโครงสร้าง Parent / Sub-Device ในหน้าคลังเวชภัณฑ์',
              content: 'รายการที่เป็น GROUP (Parent) ใช้สำหรับดูยอดรวมทุกขนาดและเทียบยอด HO Stock เท่านั้น การเบิกใช้งานจริง (Procedure Use / Stock In-Out / Adjustment) ให้เลือกที่รายการย่อย (Sub-Device) เสมอ',
              priority: 2,
              badge: 'Notice',
              updatedAt: '2026-06-02 09:15'
            }
          ];
        }
        if (!state.settings || !state.settings.procedures || state.settings.procedures.length === 0) {
          state.settings = normalizeSettings({
            procedures: ['Activate INR code', 'Mechanical Thrombectomy', 'Angioplasty', 'Transarterial Nimodipine', 'Diagnostic Cerebral Angiogram (Emergency)', 'Diagnostic Cerebral Angiogram (Elective)', 'Off case'],
            diseases: ['Aneurysm','Ischemic Stroke','DAVF','VLM'],
            shifts: ['In-time', 'On-call', 'SMC'],
            categories: ['Sheath', 'Guidewire', 'Catheter', 'Microcatheter', 'Coil', 'Stent', 'Balloon', 'Contrast Media', 'Accessory'],
            users: [
              {name:'Somsak', surname:'Siri', nickname:'Sak', position:'Radiological Technologist', authorization:'System Administrator', phone:'081-234-5678', dob:'1990-05-12'},
              {name:'Nattaporn', surname:'Rakthai', nickname:'Nat', position:'Registered Nurse', authorization:'Operational Staff', phone:'089-876-5432', dob:'1994-11-23'}
            ]
          });
        }
        if (!state.transactions || state.transactions.length === 0) {
          state.transactions = [
            {id:'TXN-20260615-103000', date:'2026-06-15', type:'Procedure Use', hn:'HN12345', itemId:'2', qty:10, fromLoc:'Retail', toLoc:'', disease:'Ischemic Stroke', procedure:'Activate INR code, Mechanical Thrombectomy', shift:'On-call', tech:'Somsak Siri', complication:'', contrast:''},
            {id:'TXN-20260615-103000', date:'2026-06-15', type:'Procedure Use', hn:'HN12345', itemId:'6', qty:2, fromLoc:'Retail', toLoc:'', disease:'Ischemic Stroke', procedure:'Activate INR code, Mechanical Thrombectomy', shift:'On-call', tech:'Somsak Siri', complication:'', contrast:''},
            {id:'TXN-20260616-110000', date:'2026-06-16', type:'Stock In', hn:'', itemId:'2', qty:50, fromLoc:'', toLoc:'Main', disease:'', procedure:'', shift:'', tech:'', complication:'', contrast:''},
            {id:'TXN-20260620-143000', date:'2026-06-20', type:'Procedure Use', hn:'HN67890', itemId:'3', qty:20, fromLoc:'Retail', toLoc:'', disease:'DAVF', procedure:'Diagnostic Cerebral Angiogram (Elective)', shift:'In-time', tech:'Somsak Siri', complication:'', contrast:''},
            {id:'TXN-20260622-021500', date:'2026-06-22', type:'Procedure Use', hn:'HN24680', itemId:'2', qty:2, fromLoc:'Retail', toLoc:'', disease:'Ischemic Stroke', procedure:'Activate INR code, Angioplasty', shift:'On-call', tech:'Somsak Siri', complication:'', contrast:''},
            {id:'TXN-20260625-041000', date:'2026-06-25', type:'Procedure Use', hn:'HN13579', itemId:'', qty:0, fromLoc:'Retail', toLoc:'', disease:'Ischemic Stroke', procedure:'Activate INR code, Off case', shift:'On-call', tech:'Somsak Siri', complication:'Spontaneous recanalization on CT/CTA', contrast:''}
          ];
        }
        if (!state.exchangeQuotas || state.exchangeQuotas.length === 0) {
          state.exchangeQuotas = [
            {
              quotaId: 'EXQ-260601',
              createdDate: '2026-06-01',
              physicalItemId: '2',
              substitutedItemId: '1',
              totalQuota: 20,
              currentUsed: 2,
              status: 'Active',
              notes: 'Using Introducer sheath 5 to substitute Introducer sheath 4 up to 20 units',
              history: [
                { txnId: 'TXN-20260615-103000', date: '2026-06-15', hn: 'HN12345', qty: 2, procedure: 'Mechanical Thrombectomy' }
              ]
            }
          ];
        }
        if (!state.consignments || state.consignments.length === 0) {
          state.consignments = [
            {
              holdId: 'CSG-260618',
              dateDeposited: '2026-06-18',
              vendorName: 'Medtronic Thailand',
              contactPerson: 'K. Anan',
              contactPhone: '081-555-0199',
              itemId: '2',
              itemName: 'Solitaire X Stent Retriever 4x40mm (Consignment Standby)',
              quantity: 2,
              status: 'Holding',
              notes: 'Stored in Buffer awaiting vendor pickup after aneurysm/stroke standby',
              pickupDate: '',
              pickupRep: ''
            }
          ];
        }
        if (!state.loans || state.loans.length === 0) {
          state.loans = [
            {
              loanId: 'LN-260610',
              date: '2026-06-10',
              scope: 'External',
              direction: 'We Borrowed (Inward)',
              department: 'Siriraj Hospital',
              docNo: 'DOC-SI-2026-089',
              itemId: '3',
              itemName: 'Guidewire 0.038" 150 cm',
              totalQty: 5,
              returnedQty: 2,
              status: 'Partial',
              notes: 'Emergency weekend case loan',
              returnHistory: [
                { date: '2026-06-14', qty: 2, returnedBy: 'Somsak Siri', notes: 'First partial return' }
              ],
              tech: 'Somsak Siri',
              location: 'Retail'
            },
            {
              loanId: 'LN-260619',
              date: '2026-06-19',
              scope: 'Internal',
              direction: 'They Borrowed (Outward)',
              department: 'Angio Suite',
              docNo: '',
              itemId: '5',
              itemName: 'Sim2 5 F 100 cm',
              totalQty: 3,
              returnedQty: 0,
              status: 'Pending',
              notes: 'Borrowed for afternoon case',
              returnHistory: [],
              tech: 'Somsak Siri',
              location: 'Retail'
            }
          ];
        }
        if (!state.assets || state.assets.length === 0) {
          state.assets = [
            {
              assetId: 'AST-0001',
              hospitalCode: '7440-001-0001/65',
              serialNumber: 'SN-ARTIS-88412',
              assetName: 'Biplane DSA System (Siemens Artis Q)',
              category: 'Medical Device',
              room: 'DSA Suite',
              status: 'Active',
              photoUrl: '',
              acquisitionDate: '2022-03-15',
              warrantyDate: '2027-03-15',
              notes: 'Primary Neurointerventional Biplane Angiography System with 3D DynaCT workstation.',
              maintenanceHistory: [
                { logId: 'MNT-260510', date: '2026-05-10', type: 'Radiation Survey / QC', provider: 'Department of Medical Sciences', result: 'Passed', nextDueDate: '2027-05-10', notes: 'Annual X-ray leakage & dose output verification Cert #DMS-2026-991' },
                { logId: 'MNT-260215', date: '2026-02-15', type: 'Preventive Maintenance (PM)', provider: 'Siemens Healthineers Thailand', result: 'Passed', nextDueDate: '2026-08-15', notes: 'Cooling unit filter replaced, C-arm mechanical calibration passed' }
              ],
              damageInfo: null,
              updatedAt: '2026-05-10'
            },
            {
              assetId: 'AST-0002',
              hospitalCode: '7440-002-0014/66',
              serialNumber: 'SN-DRG-44210',
              assetName: 'Anesthesia Workstation (Dräger Perseus A500)',
              category: 'Medical Device',
              room: 'DSA Suite',
              status: 'Active',
              photoUrl: '',
              acquisitionDate: '2023-06-01',
              warrantyDate: '2026-06-01',
              notes: 'Dedicated neuro-anesthesia ventilator and gas monitor.',
              maintenanceHistory: [
                { logId: 'MNT-260402', date: '2026-04-02', type: 'Calibration', provider: 'Hospital Biomedical Engineering', result: 'Passed', nextDueDate: '2026-10-02', notes: 'Vaporizer & flow sensor calibration verified' }
              ],
              damageInfo: null,
              updatedAt: '2026-04-02'
            },
            {
              assetId: 'AST-0003',
              hospitalCode: '7440-010-0089/64',
              serialNumber: 'SN-EIZO-39104',
              assetName: 'Eizo RadiForce 8MP Diagnostic Monitor',
              category: 'IT & Electronics',
              room: 'Control Room',
              status: 'Under Repair',
              photoUrl: '',
              acquisitionDate: '2021-09-20',
              warrantyDate: '2026-09-20',
              notes: 'Secondary review console monitor in DSA Control Room.',
              maintenanceHistory: [
                { logId: 'MNT-260612', date: '2026-06-12', type: 'Corrective Repair', provider: 'Eizo Service Center', result: 'Action Required', nextDueDate: '2026-07-01', notes: 'Backlight power board replacement in progress' }
              ],
              damageInfo: null,
              updatedAt: '2026-06-12'
            },
            {
              assetId: 'AST-0004',
              hospitalCode: '7440-005-0019/60',
              serialNumber: 'SN-INF-10293',
              assetName: 'High-Pressure Contrast Power Injector (Mark V ProVis)',
              category: 'Medical Device',
              room: 'Equipment Storage',
              status: 'Condemned',
              photoUrl: '',
              acquisitionDate: '2017-04-10',
              warrantyDate: '2022-04-10',
              notes: 'Decommissioned contrast injector replaced by new Medrad unit.',
              maintenanceHistory: [],
              damageInfo: {
                damageDate: '2026-01-20',
                cause: 'Main actuator motor & control PCB obsolete; spare parts discontinued by manufacturer.',
                memoNo: 'MEMO-INR-2569/014',
                photoUrl: '',
                recordedBy: 'Somsak Siri',
                targetStatus: 'Condemned'
              },
              updatedAt: '2026-01-20'
            }
          ];
        }
        const curFyStr = getCurrentFiscalYearClient();
        if (!state.ebiddings || state.ebiddings.length === 0) {
          state.ebiddings = [
            {
              ebiddingId: 'EB-20261005-090000',
              fiscalYear: curFyStr,
              manualStatus: 'In Progress',
              hoItemId: '42203405SOL00001',
              deviceName: 'Solitaire Platinum Stent Retriever (Group)',
              unitPrice: 85000,
              budgetPlanQty: 20,
              company: 'Medtronic Thailand',
              remarks: 'Annual neuro-thrombectomy stent retriever e-bidding plan'
            },
            {
              ebiddingId: 'EB-20261010-103000',
              fiscalYear: curFyStr,
              manualStatus: 'In Progress',
              hoItemId: '42203403INT00004',
              deviceName: 'Introducer sheath 5',
              unitPrice: 480,
              budgetPlanQty: 300,
              company: 'Terumo Thailand',
              remarks: 'Standard femoral access sheath annual plan'
            },
            {
              ebiddingId: 'EB-20261012-141500',
              fiscalYear: curFyStr,
              manualStatus: 'Planned',
              hoItemId: '42203404SMO00006',
              deviceName: 'Guidewire 0.038" 150 cm',
              unitPrice: 1200,
              budgetPlanQty: 150,
              company: 'Terumo Thailand',
              remarks: 'Awaiting TOR committee approval'
            }
          ];
        }
        if (!state.contracts || state.contracts.length === 0) {
          state.contracts = [
            {
              contractId: 'CT-20261020-110000',
              linkedEBiddingId: 'EB-20261005-090000',
              fiscalYear: curFyStr,
              contractNumber: 'สัญญาที่ 018/' + curFyStr,
              contractStartDate: '2026-10-20',
              contractEndDate: '2027-09-30',
              hoItemId: '42203405SOL00001',
              deviceName: 'Solitaire Platinum Stent Retriever (Group)',
              unitPrice: 84000,
              company: 'Medtronic Thailand',
              totalContractQty: 20,
              manualStatus: '',
              remarks: 'Covers both 4x40 mm and 6x40 mm sizes under group HO Item ID'
            },
            {
              contractId: 'CT-20261025-150000',
              linkedEBiddingId: 'EB-20261010-103000',
              fiscalYear: curFyStr,
              contractNumber: 'สัญญาที่ 024/' + curFyStr,
              contractStartDate: '2026-10-25',
              contractEndDate: '2027-09-30',
              hoItemId: '42203403INT00004',
              deviceName: 'Introducer sheath 5',
              unitPrice: 480,
              company: 'Terumo Thailand',
              totalContractQty: 300,
              manualStatus: '',
              remarks: 'Deliverable in multiple PO lots'
            }
          ];
        }
        if (!state.contractPOs || state.contractPOs.length === 0) {
          state.contractPOs = [
            {
              poId: 'PO-20261101-093000',
              linkedContractId: 'CT-20261020-110000',
              poIssueDate: '2026-11-01',
              unitPrice: 84000,
              orderedQty: 6,
              manualStatus: '',
              remarks: 'Lot 1 order (4x40mm x 4, 6x40mm x 2)'
            },
            {
              poId: 'PO-20261105-134500',
              linkedContractId: 'CT-20261025-150000',
              poIssueDate: '2026-11-05',
              unitPrice: 480,
              orderedQty: 100,
              manualStatus: '',
              remarks: 'Lot 1 order (100 pcs)'
            }
          ];
        }
        if (!state.specificPurchases || state.specificPurchases.length === 0) {
          state.specificPurchases = [
            {
              spId: 'SP-20261103-101500',
              poIssueDate: '2026-11-03',
              fiscalYear: curFyStr,
              hoItemId: '42203406REB00018',
              deviceName: 'Rebar 18 Microcatheter (PO)',
              unitPrice: 18500,
              company: 'Medtronic Thailand',
              budgetPlanQty: 15,
              orderedQty: 5,
              manualStatus: '',
              remarks: 'Specific method purchase Q1 lot'
            }
          ];
        }
        if (!state.receivings || state.receivings.length === 0) {
          state.receivings = [
            {
              receivingId: 'RC-20261108-140000',
              sourceType: 'Contract PO',
              sourceRecordId: 'PO-20261105-134500',
              receivingDate: '2026-11-08',
              hoItemId: '42203403INT00004',
              deviceName: 'Introducer sheath 5',
              unitPrice: 480,
              quantity: 100,
              company: 'Terumo Thailand',
              allocations: [{ itemId: '2', quantity: 100 }],
              stockInTxnId: 'RCV-20261108-140500',
              manualStatus: '',
              remarks: 'INV-TRM-2026-8812 inspected and posted to Main Stock'
            },
            {
              receivingId: 'RC-20261110-110000',
              sourceType: 'Contract PO',
              sourceRecordId: 'PO-20261101-093000',
              receivingDate: '2026-11-10',
              hoItemId: '42203405SOL00001',
              deviceName: 'Solitaire Platinum Stent Retriever (Group)',
              unitPrice: 84000,
              quantity: 6,
              company: 'Medtronic Thailand',
              allocations: [
                { itemId: 'STENT-260601090001', quantity: 4 },
                { itemId: 'STENT-260601090002', quantity: 2 }
              ],
              stockInTxnId: '',
              manualStatus: '',
              remarks: 'Awaiting committee sign-off to post stock-in'
            }
          ];
        }
        recalculateProcurementState();
        if (appLoading) appLoading.classList.add('hidden');
        if (appContent) appContent.classList.remove('hidden');
        renderCurrentTab();
      }, 150);
    }

    // ════════════════════════════════════════════════════════════════════════
    // MODULE 6: PROCUREMENT (E-Bidding, Contracts, Contract POs, Specific Purchase, Receiving)
    // ════════════════════════════════════════════════════════════════════════

    function escHtml(val) {
      if (val === null || val === undefined) return '';
      return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function deriveFiscalYearClient(dateVal) {
      let d = null;
      if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
        d = dateVal;
      } else if (dateVal) {
        const s = String(dateVal).trim();
        const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (m) {
          const yr = parseInt(m[1], 10);
          const mo = parseInt(m[2], 10);
          return String((mo >= 10 ? yr + 1 : yr) + 543);
        }
        const parsed = new Date(s);
        if (!isNaN(parsed.getTime())) d = parsed;
      }
      if (!d) d = new Date();
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      return String((month >= 10 ? year + 1 : year) + 543);
    }

    function getCurrentFiscalYearClient() {
      return deriveFiscalYearClient(getToday());
    }

    function generateClientProcurementId(prefix) {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const dPart = String(now.getFullYear()) + pad(now.getMonth() + 1) + pad(now.getDate());
      const tPart = pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
      return `${prefix}-${dPart}-${tPart}`;
    }

    function refreshCompanyDatalist() {
      const dl = document.getElementById('company-datalist');
      if (!dl) return;
      const set = new Set();
      (state.companyList || []).forEach(c => { if (c && String(c).trim()) set.add(String(c).trim()); });
      (state.inventory || []).forEach(i => { if (i && i.company && String(i.company).trim()) set.add(String(i.company).trim()); });
      (state.ebiddings || []).forEach(r => { if (r && r.company && String(r.company).trim()) set.add(String(r.company).trim()); });
      (state.contracts || []).forEach(r => { if (r && r.company && String(r.company).trim()) set.add(String(r.company).trim()); });
      (state.contractPOs || []).forEach(r => { if (r && r.company && String(r.company).trim()) set.add(String(r.company).trim()); });
      (state.specificPurchases || []).forEach(r => { if (r && r.company && String(r.company).trim()) set.add(String(r.company).trim()); });
      (state.receivings || []).forEach(r => { if (r && r.company && String(r.company).trim()) set.add(String(r.company).trim()); });
      const sorted = Array.from(set).sort((a, b) => a.localeCompare(b));
      state.companyList = sorted;
      dl.innerHTML = sorted.map(c => `<option value="${escHtml(c)}"></option>`).join('');
    }

    function recalculateProcurementState() {
      const curFy = Number(getCurrentFiscalYearClient());
      const fySet = new Set([String(curFy - 1), String(curFy), String(curFy + 1)]);
      if (!state.procurementFy) {
        state.procurementFy = String(curFy);
      }

      if (!Array.isArray(state.ebiddings)) state.ebiddings = [];
      if (!Array.isArray(state.contracts)) state.contracts = [];
      if (!Array.isArray(state.contractPOs)) state.contractPOs = [];
      if (!Array.isArray(state.specificPurchases)) state.specificPurchases = [];
      if (!Array.isArray(state.receivings)) state.receivings = [];

      // 1. Receivings pass 1
      const activeReceiptBySourceKey = {};
      state.receivings.forEach(rec => {
        rec.unitPrice = Number(rec.unitPrice) || 0;
        rec.quantity = Number(rec.quantity) || 0;
        rec.totalValue = rec.unitPrice * rec.quantity;
        rec.manualStatus = String(rec.manualStatus || '').trim() === 'Cancelled' ? 'Cancelled' : '';
        rec.stockInTxnId = String(rec.stockInTxnId || '').trim();
        if (!Array.isArray(rec.allocations)) rec.allocations = [];
        if (rec.manualStatus === 'Cancelled') {
          rec.effectiveStatus = 'Cancelled';
        } else if (rec.stockInTxnId) {
          rec.effectiveStatus = 'Completed';
        } else {
          rec.effectiveStatus = 'Awaiting Delivery';
        }
        rec.status = rec.effectiveStatus;
        if (rec.effectiveStatus !== 'Cancelled' && rec.sourceType && rec.sourceRecordId) {
          activeReceiptBySourceKey[`${rec.sourceType}::${rec.sourceRecordId}`] = rec;
        }
      });

      // 2. E-Biddings pass 1
      const ebById = {};
      state.ebiddings.forEach(eb => {
        eb.fiscalYear = String(eb.fiscalYear || curFy).trim();
        fySet.add(eb.fiscalYear);
        eb.unitPrice = Number(eb.unitPrice) || 0;
        eb.budgetPlanQty = Number(eb.budgetPlanQty) || 0;
        eb.totalValue = eb.unitPrice * eb.budgetPlanQty;
        const ms = String(eb.manualStatus || eb.status || 'Planned').trim();
        eb.manualStatus = (ms === 'Cancelled' || ms === 'In Progress' || ms === 'Planned') ? ms : 'Planned';
        eb.linkedContractIds = [];
        ebById[eb.ebiddingId] = eb;
      });

      // 3. Contracts pass 1
      const ctById = {};
      state.contracts.forEach(ct => {
        const eb = ebById[ct.linkedEBiddingId];
        ct.fiscalYear = String(ct.fiscalYear || (eb ? eb.fiscalYear : curFy)).trim();
        fySet.add(ct.fiscalYear);
        if (!ct.hoItemId && eb) ct.hoItemId = eb.hoItemId;
        if (!ct.deviceName && eb) ct.deviceName = eb.deviceName;
        if ((ct.unitPrice === undefined || ct.unitPrice === null || ct.unitPrice === '') && eb) ct.unitPrice = eb.unitPrice;
        if (!ct.company && eb) ct.company = eb.company;
        ct.unitPrice = Number(ct.unitPrice) || 0;
        ct.totalContractQty = Number(ct.totalContractQty) || 0;
        ct.totalValue = ct.unitPrice * ct.totalContractQty;
        ct.orderedQty = 0;
        ct.remainingQty = ct.totalContractQty;
        ct.manualStatus = String(ct.manualStatus || '').trim() === 'Cancelled' ? 'Cancelled' : '';
        ct.poLots = [];
        ctById[ct.contractId] = ct;
        if (ct.manualStatus !== 'Cancelled' && eb) {
          eb.linkedContractIds.push(ct.contractId);
        }
      });

      // Finalize E-Bidding effectiveStatus
      state.ebiddings.forEach(eb => {
        if (eb.manualStatus === 'Cancelled') {
          eb.effectiveStatus = 'Cancelled';
        } else if (eb.linkedContractIds.length > 0) {
          eb.effectiveStatus = 'Contract Awarded';
        } else {
          eb.effectiveStatus = eb.manualStatus || 'Planned';
        }
        eb.status = eb.effectiveStatus;
      });

      // 4. Contract POs
      const poById = {};
      state.contractPOs.forEach(po => {
        const ct = ctById[po.linkedContractId];
        po.fiscalYear = ct ? ct.fiscalYear : deriveFiscalYearClient(po.poIssueDate);
        if (po.fiscalYear) fySet.add(String(po.fiscalYear));
        po.contractNumber = ct ? ct.contractNumber : (po.contractNumber || '');
        po.contractStartDate = ct ? ct.contractStartDate : (po.contractStartDate || '');
        po.contractEndDate = ct ? ct.contractEndDate : (po.contractEndDate || '');
        po.hoItemId = ct ? ct.hoItemId : (po.hoItemId || '');
        po.deviceName = ct ? ct.deviceName : (po.deviceName || '');
        po.company = ct ? ct.company : (po.company || '');
        if ((po.unitPrice === undefined || po.unitPrice === null || po.unitPrice === '') && ct) po.unitPrice = ct.unitPrice;
        po.unitPrice = Number(po.unitPrice) || 0;
        po.orderedQty = Number(po.orderedQty) || 0;
        po.orderValue = po.unitPrice * po.orderedQty;
        po.totalContractQty = ct ? ct.totalContractQty : 0;
        po.manualStatus = String(po.manualStatus || '').trim() === 'Cancelled' ? 'Cancelled' : '';

        const linkedRec = activeReceiptBySourceKey[`Contract PO::${po.poId}`] || null;
        if (po.manualStatus === 'Cancelled') {
          po.effectiveStatus = 'Cancelled';
        } else if (linkedRec && linkedRec.effectiveStatus === 'Completed') {
          po.effectiveStatus = 'Completed';
        } else {
          po.effectiveStatus = 'Pending PO';
        }
        po.status = po.effectiveStatus;
        po.linkedReceivingId = linkedRec ? linkedRec.receivingId : '';
        po.receivingStatus = linkedRec ? linkedRec.effectiveStatus : '';
        poById[po.poId] = po;

        if (ct) {
          ct.poLots.push(po);
          if (po.effectiveStatus !== 'Cancelled') {
            ct.orderedQty += po.orderedQty;
          }
        }
      });

      // Finalize Contracts remainingQty & effectiveStatus
      state.contracts.forEach(ct => {
        ct.remainingQty = ct.totalContractQty - ct.orderedQty;
        if (ct.manualStatus === 'Cancelled') {
          ct.effectiveStatus = 'Cancelled';
        } else if (ct.remainingQty <= 0 && ct.totalContractQty > 0) {
          ct.effectiveStatus = 'Completed';
        } else {
          ct.effectiveStatus = 'In Progress';
        }
        ct.status = ct.effectiveStatus;

        let runningOrd = 0;
        ct.poLots.forEach(lot => {
          if (lot.effectiveStatus !== 'Cancelled') {
            runningOrd += lot.orderedQty;
          }
          lot.remainingAfterLot = ct.totalContractQty - runningOrd;
          lot.remainingContractQty = ct.remainingQty;
        });
      });

      // 5. Specific Purchases
      const spById = {};
      const spOrderedByFyItem = {};
      state.specificPurchases.forEach(sp => {
        sp.fiscalYear = String(sp.fiscalYear || deriveFiscalYearClient(sp.poIssueDate)).trim();
        if (sp.fiscalYear) fySet.add(sp.fiscalYear);
        sp.unitPrice = Number(sp.unitPrice) || 0;
        sp.budgetPlanQty = Number(sp.budgetPlanQty) || 0;
        sp.budgetPlanValue = sp.unitPrice * sp.budgetPlanQty;
        sp.orderedQty = Number(sp.orderedQty) || 0;
        sp.orderValue = sp.unitPrice * sp.orderedQty;
        sp.manualStatus = String(sp.manualStatus || '').trim() === 'Cancelled' ? 'Cancelled' : '';

        const linkedRec = activeReceiptBySourceKey[`Specific Purchase::${sp.spId}`] || null;
        if (sp.manualStatus === 'Cancelled') {
          sp.effectiveStatus = 'Cancelled';
        } else if (linkedRec && linkedRec.effectiveStatus === 'Completed') {
          sp.effectiveStatus = 'Completed';
        } else {
          sp.effectiveStatus = 'Pending PO';
        }
        sp.status = sp.effectiveStatus;
        sp.linkedReceivingId = linkedRec ? linkedRec.receivingId : '';
        sp.receivingStatus = linkedRec ? linkedRec.effectiveStatus : '';

        const key = `${sp.fiscalYear}::${String(sp.hoItemId || sp.deviceName || '').trim().toLowerCase()}`;
        sp._itemKey = key;
        if (sp.effectiveStatus !== 'Cancelled') {
          spOrderedByFyItem[key] = (spOrderedByFyItem[key] || 0) + sp.orderedQty;
        }
        spById[sp.spId] = sp;
      });

      state.specificPurchases.forEach(sp => {
        const tot = spOrderedByFyItem[sp._itemKey] || 0;
        sp.totalOrderedSameFyItem = tot;
        sp.remainingQty = sp.budgetPlanQty - tot;
        delete sp._itemKey;
      });

      // 6. Enrich Receivings from source order
      state.receivings.forEach(rec => {
        if (rec.sourceType === 'Contract PO') {
          const src = poById[rec.sourceRecordId];
          if (src) {
            rec.sourceOrderedQty = src.orderedQty;
            rec.fiscalYear = src.fiscalYear || rec.fiscalYear;
            if (!rec.hoItemId) rec.hoItemId = src.hoItemId;
            if (!rec.deviceName) rec.deviceName = src.deviceName;
            if (!rec.company) rec.company = src.company;
          }
        } else if (rec.sourceType === 'Specific Purchase') {
          const src = spById[rec.sourceRecordId];
          if (src) {
            rec.sourceOrderedQty = src.orderedQty;
            rec.fiscalYear = src.fiscalYear || rec.fiscalYear;
            if (!rec.hoItemId) rec.hoItemId = src.hoItemId;
            if (!rec.deviceName) rec.deviceName = src.deviceName;
            if (!rec.company) rec.company = src.company;
          }
        }
        if (!rec.fiscalYear) rec.fiscalYear = deriveFiscalYearClient(rec.receivingDate);
        if (rec.fiscalYear) fySet.add(String(rec.fiscalYear));
      });

      state.fiscalYearList = Array.from(fySet).filter(Boolean).sort((a, b) => Number(a) - Number(b));
      refreshCompanyDatalist();
    }

    function formatProcMoney(val) {
      const n = Number(val) || 0;
      return '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function getProcStatusBadgeHtml(status) {
      const s = String(status || '').trim();
      let cls = 'proc-badge-planned';
      if (s === 'In Progress') cls = 'proc-badge-inprogress';
      else if (s === 'Contract Awarded') cls = 'proc-badge-awarded';
      else if (s === 'Pending PO') cls = 'proc-badge-pending';
      else if (s === 'Awaiting Delivery') cls = 'proc-badge-awaiting';
      else if (s === 'Completed') cls = 'proc-badge-completed';
      else if (s === 'Cancelled') cls = 'proc-badge-cancelled';
      return `<span class="proc-badge ${cls}">${escHtml(s || '-')}</span>`;
    }

    function getContractExpiryTagHtml(ct) {
      if (!ct || ct.effectiveStatus !== 'In Progress' || !ct.contractEndDate) return '';
      const today = new Date(getToday() + 'T00:00:00');
      const end = new Date(ct.contractEndDate + 'T00:00:00');
      if (isNaN(end.getTime())) return '';
      const diffDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        return `<span class="proc-expiry-tag proc-expiry-expired">Expired (${Math.abs(diffDays)}d ago)</span>`;
      } else if (diffDays <= 60) {
        return `<span class="proc-expiry-tag proc-expiry-warn">Expiring in ${diffDays}d</span>`;
      }
      return `<span class="proc-expiry-tag proc-expiry-ok">${diffDays}d left</span>`;
    }

    function switchProcurementSubTab(subTab) {
      state.procurementSubTab = subTab || 'ebidding';
      const stFilter = document.getElementById('proc-status-filter');
      if (stFilter) stFilter.value = '';
      renderProcurementTab();
    }

    function onProcurementFyChange(fy) {
      state.procurementFy = fy || 'All';
      renderProcurementTab();
    }

    function resetProcurementFilters() {
      state.procurementFy = getCurrentFiscalYearClient();
      const fyEl = document.getElementById('proc-fy-select');
      if (fyEl) fyEl.value = state.procurementFy;
      const stEl = document.getElementById('proc-status-filter');
      if (stEl) stEl.value = '';
      const sEl = document.getElementById('proc-search-input');
      if (sEl) sEl.value = '';
      renderProcurementTab();
    }

    function openProcurementAddModal() {
      const sub = state.procurementSubTab || 'ebidding';
      if (sub === 'ebidding') openEBiddingModal('');
      else if (sub === 'contracts') openContractModal('', '');
      else if (sub === 'contract_po') openContractPOModal('', '');
      else if (sub === 'specific_purchase') openSpecificPurchaseModal('');
      else if (sub === 'receiving') openReceivingModal('', '', '');
    }

    function toggleContractExpand(contractId) {
      if (!state.expandedContractIds) state.expandedContractIds = {};
      state.expandedContractIds[contractId] = !state.expandedContractIds[contractId];
      renderProcurementTab();
    }

    function renderProcurementTab() {
      recalculateProcurementState();
      const sub = state.procurementSubTab || 'ebidding';
      if (!state.procurementFy) state.procurementFy = getCurrentFiscalYearClient();
      const fy = state.procurementFy;

      // Populate Fiscal Year selector
      const fySelect = document.getElementById('proc-fy-select');
      if (fySelect) {
        const fyOptions = [`<option value="All"${fy === 'All' ? ' selected' : ''}>All Fiscal Years</option>`]
          .concat((state.fiscalYearList || []).map(y => `<option value="${escHtml(y)}"${String(y) === String(fy) ? ' selected' : ''}>FY ${escHtml(y)}</option>`));
        fySelect.innerHTML = fyOptions.join('');
      }

      // Highlight active sub-tab
      document.querySelectorAll('#proc-subtabs .sub-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.proc === sub);
      });

      // Update primary add button label
      const addBtnLabel = document.getElementById('btn-proc-primary-add-label');
      if (addBtnLabel) {
        const labelMap = {
          ebidding: t('proc_add_ebidding') || 'Add E-Bidding Plan',
          contracts: t('proc_add_contract') || 'Create Contract',
          contract_po: t('proc_add_po') || 'Create Contract PO (Lot)',
          specific_purchase: t('proc_add_sp') || 'Add Specific Purchase',
          receiving: t('proc_add_receiving') || 'Record Goods Receiving'
        };
        addBtnLabel.textContent = labelMap[sub] || 'Add Record';
      }

      const matchFy = (itemFy) => (fy === 'All' || !fy || String(itemFy) === String(fy));
      const ebFyList = (state.ebiddings || []).filter(x => matchFy(x.fiscalYear));
      const ctFyList = (state.contracts || []).filter(x => matchFy(x.fiscalYear));
      const poFyList = (state.contractPOs || []).filter(x => matchFy(x.fiscalYear));
      const spFyList = (state.specificPurchases || []).filter(x => matchFy(x.fiscalYear));
      const rcFyList = (state.receivings || []).filter(x => matchFy(x.fiscalYear));

      // Update sub-tab count badges
      const setCnt = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
      setCnt('proc-count-ebidding', ebFyList.length);
      setCnt('proc-count-contracts', ctFyList.length);
      setCnt('proc-count-contract_po', poFyList.length);
      setCnt('proc-count-specific_purchase', spFyList.length);
      setCnt('proc-count-receiving', rcFyList.length);

      // Populate status filter options for current sub-tab
      const stSelect = document.getElementById('proc-status-filter');
      const prevSt = stSelect ? stSelect.value : '';
      const statusOptionsBySub = {
        ebidding: ['Planned', 'In Progress', 'Contract Awarded', 'Cancelled'],
        contracts: ['In Progress', 'Completed', 'Cancelled'],
        contract_po: ['Pending PO', 'Completed', 'Cancelled'],
        specific_purchase: ['Pending PO', 'Completed', 'Cancelled'],
        receiving: ['Awaiting Delivery', 'Completed', 'Cancelled']
      };
      const validStatuses = statusOptionsBySub[sub] || [];
      if (stSelect) {
        const keepSt = validStatuses.includes(prevSt) ? prevSt : '';
        stSelect.innerHTML = `<option value="">All Effective Statuses</option>` +
          validStatuses.map(s => `<option value="${escHtml(s)}"${s === keepSt ? ' selected' : ''}>${escHtml(s)}</option>`).join('');
      }
      const activeStatusFilter = stSelect ? stSelect.value : '';
      const searchQ = (document.getElementById('proc-search-input')?.value || '').trim().toLowerCase();

      const kpiStrip = document.getElementById('proc-kpi-strip');
      const thead = document.getElementById('proc-table-head');
      const tbody = document.getElementById('proc-table-body');
      if (!thead || !tbody) return;

      // ── SUB-TAB 1: E-BIDDING ──
      if (sub === 'ebidding') {
        const nonCancelled = ebFyList.filter(x => x.effectiveStatus !== 'Cancelled');
        const totalVal = nonCancelled.reduce((s, x) => s + (Number(x.totalValue) || 0), 0);
        const plannedCnt = ebFyList.filter(x => x.effectiveStatus === 'Planned').length;
        const inProgCnt = ebFyList.filter(x => x.effectiveStatus === 'In Progress').length;
        const awardedCnt = ebFyList.filter(x => x.effectiveStatus === 'Contract Awarded').length;

        if (kpiStrip) {
          kpiStrip.innerHTML = `
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Active E-Bidding Plans (${fy === 'All' ? 'All FY' : 'FY ' + escHtml(fy)})</div>
              <div class="proc-kpi-val">${nonCancelled.length}</div>
              <div class="proc-kpi-sub">Planned: ${plannedCnt} | In Progress: ${inProgCnt}</div>
            </div>
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Total Planned Budget Value</div>
              <div class="proc-kpi-val" style="color:var(--brand-dark);">${formatProcMoney(totalVal)}</div>
              <div class="proc-kpi-sub">Excludes Cancelled plans</div>
            </div>
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Contract Awarded</div>
              <div class="proc-kpi-val" style="color:#065f46;">${awardedCnt}</div>
              <div class="proc-kpi-sub">Automatically updated when Contract is linked</div>
            </div>
          `;
        }

        thead.innerHTML = `
          <tr>
            <th>E-Bidding ID</th>
            <th class="center">FY</th>
            <th>HO Item ID</th>
            <th>Device Name</th>
            <th>Company / Vendor</th>
            <th class="right">Unit Price</th>
            <th class="center">Budget Plan Qty</th>
            <th class="right">Total Value</th>
            <th class="center">Effective Status</th>
            <th>Remarks</th>
            <th class="center no-print">Actions</th>
          </tr>
        `;

        const filtered = ebFyList.filter(r => {
          if (activeStatusFilter && r.effectiveStatus !== activeStatusFilter) return false;
          if (searchQ) {
            const hay = `${r.ebiddingId} ${r.hoItemId} ${r.deviceName} ${r.company} ${r.remarks} ${r.effectiveStatus}`.toLowerCase();
            if (!hay.includes(searchQ)) return false;
          }
          return true;
        });

        if (filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="11" class="empty">No E-Bidding records found for this filter.</td></tr>`;
          return;
        }

        tbody.innerHTML = filtered.map(r => {
          const isCancelled = r.effectiveStatus === 'Cancelled';
          return `
            <tr style="${isCancelled ? 'opacity:0.6;' : ''}">
              <td class="mono text-xs font-semibold">${escHtml(r.ebiddingId)}</td>
              <td class="center font-semibold">${escHtml(r.fiscalYear)}</td>
              <td class="mono text-xs">${escHtml(r.hoItemId || '-')}</td>
              <td class="font-semibold">${escHtml(r.deviceName)}</td>
              <td>${escHtml(r.company || '-')}</td>
              <td class="right">${formatProcMoney(r.unitPrice)}</td>
              <td class="center font-semibold">${Number(r.budgetPlanQty || 0).toLocaleString()}</td>
              <td class="right font-semibold" style="color:var(--brand-dark);">${formatProcMoney(r.totalValue)}</td>
              <td class="center">${getProcStatusBadgeHtml(r.effectiveStatus)}</td>
              <td class="text-xs text-gray">${escHtml(r.remarks || '-')}</td>
              <td class="center no-print" style="white-space:nowrap;">
                ${!isCancelled ? `<button class="btn btn-outline btn-xs" style="color:#065f46; border-color:#6ee7b7;" title="Create Contract from this E-Bidding" onclick="openContractModal('', '${escHtml(r.ebiddingId)}')">+ Contract</button>` : ''}
                <button class="btn btn-outline btn-xs" onclick="openEBiddingModal('${escHtml(r.ebiddingId)}')">Edit</button>
                ${!isCancelled ? `<button class="btn btn-outline btn-xs" style="color:#b45309;" onclick="handleCancelProcurementRecord('ebidding', '${escHtml(r.ebiddingId)}', '${escHtml(r.deviceName)}')">Cancel</button>` : ''}
                <button class="btn btn-ghost-danger btn-xs" onclick="handleDeleteEBidding('${escHtml(r.ebiddingId)}')">Delete</button>
              </td>
            </tr>
          `;
        }).join('');
        return;
      }

      // ── SUB-TAB 2: CONTRACTS ──
      if (sub === 'contracts') {
        const activeCts = ctFyList.filter(x => x.effectiveStatus === 'In Progress');
        const nonCancelled = ctFyList.filter(x => x.effectiveStatus !== 'Cancelled');
        const totalContractVal = nonCancelled.reduce((s, x) => s + (Number(x.totalValue) || 0), 0);
        const totalRemVal = nonCancelled.reduce((s, x) => s + Math.max(0, Number(x.remainingQty) || 0) * (Number(x.unitPrice) || 0), 0);
        const today = new Date(getToday() + 'T00:00:00');
        const expiringSoonCnt = activeCts.filter(ct => {
          if (!ct.contractEndDate) return false;
          const end = new Date(ct.contractEndDate + 'T00:00:00');
          if (isNaN(end.getTime())) return false;
          const diffDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays <= 60;
        }).length;

        if (kpiStrip) {
          kpiStrip.innerHTML = `
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Active Contracts (In Progress)</div>
              <div class="proc-kpi-val">${activeCts.length}</div>
              <div class="proc-kpi-sub">Total non-cancelled: ${nonCancelled.length}</div>
            </div>
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Total Contract Value</div>
              <div class="proc-kpi-val" style="color:var(--brand-dark);">${formatProcMoney(totalContractVal)}</div>
              <div class="proc-kpi-sub">Remaining Value: ${formatProcMoney(totalRemVal)}</div>
            </div>
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Expiring Within 60 Days / Expired</div>
              <div class="proc-kpi-val" style="color:${expiringSoonCnt > 0 ? '#d97706' : 'var(--gray-700)'};">${expiringSoonCnt}</div>
              <div class="proc-kpi-sub">Active contracts requiring attention</div>
            </div>
          `;
        }

        thead.innerHTML = `
          <tr>
            <th>Contract ID &amp; No.</th>
            <th class="center">FY</th>
            <th>Contract Period</th>
            <th>HO Item ID &amp; Device</th>
            <th>Company</th>
            <th class="right">Unit Price</th>
            <th class="center">Total Qty</th>
            <th class="center">Ordered Qty</th>
            <th class="center">Remaining Qty</th>
            <th class="center">Effective Status</th>
            <th class="center no-print">Actions</th>
          </tr>
        `;

        const filtered = ctFyList.filter(r => {
          if (activeStatusFilter && r.effectiveStatus !== activeStatusFilter) return false;
          if (searchQ) {
            const hay = `${r.contractId} ${r.contractNumber} ${r.linkedEBiddingId} ${r.hoItemId} ${r.deviceName} ${r.company} ${r.remarks} ${r.effectiveStatus}`.toLowerCase();
            if (!hay.includes(searchQ)) return false;
          }
          return true;
        });

        if (filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="11" class="empty">No Contract records found for this filter.</td></tr>`;
          return;
        }

        const rowsHtml = [];
        filtered.forEach(ct => {
          const isCancelled = ct.effectiveStatus === 'Cancelled';
          const isExpanded = !!(state.expandedContractIds && state.expandedContractIds[ct.contractId]);
          const lotsCount = (ct.poLots || []).length;
          const remColor = ct.remainingQty < 0 ? 'color:var(--red); font-weight:700;' : (ct.remainingQty === 0 ? 'color:#065f46; font-weight:700;' : 'font-weight:700;');

          rowsHtml.push(`
            <tr style="${isCancelled ? 'opacity:0.6;' : ''}">
              <td>
                <div class="font-semibold">${escHtml(ct.contractNumber)}</div>
                <div class="mono text-xs text-gray">${escHtml(ct.contractId)} (EB: ${escHtml(ct.linkedEBiddingId || '-')})</div>
              </td>
              <td class="center font-semibold">${escHtml(ct.fiscalYear)}</td>
              <td class="text-xs">
                <div>${escHtml(ct.contractStartDate || '-')} → ${escHtml(ct.contractEndDate || '-')}</div>
                <div style="margin-top:2px;">${getContractExpiryTagHtml(ct)}</div>
              </td>
              <td>
                <div class="font-semibold">${escHtml(ct.deviceName)}</div>
                <div class="mono text-xs text-gray">${escHtml(ct.hoItemId || '-')}</div>
              </td>
              <td>${escHtml(ct.company || '-')}</td>
              <td class="right">${formatProcMoney(ct.unitPrice)}</td>
              <td class="center font-semibold">${Number(ct.totalContractQty || 0).toLocaleString()}</td>
              <td class="center">${Number(ct.orderedQty || 0).toLocaleString()}</td>
              <td class="center" style="${remColor}">${Number(ct.remainingQty || 0).toLocaleString()}</td>
              <td class="center">${getProcStatusBadgeHtml(ct.effectiveStatus)}</td>
              <td class="center no-print" style="white-space:nowrap;">
                <button class="btn btn-outline btn-xs" onclick="toggleContractExpand('${escHtml(ct.contractId)}')">${isExpanded ? '▲' : '▼'} Lots (${lotsCount})</button>
                ${ct.effectiveStatus === 'In Progress' ? `<button class="btn btn-outline btn-xs" style="color:var(--brand-dark); border-color:var(--brand);" onclick="openContractPOModal('', '${escHtml(ct.contractId)}')">+ PO Lot</button>` : ''}
                <button class="btn btn-outline btn-xs" onclick="openContractModal('${escHtml(ct.contractId)}', '')">Edit</button>
                ${!isCancelled ? `<button class="btn btn-outline btn-xs" style="color:#b45309;" onclick="handleCancelProcurementRecord('contract', '${escHtml(ct.contractId)}', '${escHtml(ct.contractNumber)}')">Cancel</button>` : ''}
                <button class="btn btn-ghost-danger btn-xs" onclick="handleDeleteContract('${escHtml(ct.contractId)}')">Delete</button>
              </td>
            </tr>
          `);

          if (isExpanded) {
            const lots = ct.poLots || [];
            const lotsTableHtml = lots.length === 0
              ? `<div class="text-xs text-gray">No Contract PO lots created under this contract yet.</div>`
              : `
                <table class="data-table" style="font-size:12px; background:#fff; border:1px solid var(--gray-200); border-radius:6px;">
                  <thead>
                    <tr>
                      <th>PO ID</th>
                      <th>PO Issue Date</th>
                      <th class="right">Unit Price</th>
                      <th class="center">Ordered Qty</th>
                      <th class="right">Order Value</th>
                      <th class="center">Rem. After Lot</th>
                      <th class="center">Status</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${lots.map(l => `
                      <tr>
                        <td class="mono font-semibold">${escHtml(l.poId)}</td>
                        <td>${escHtml(l.poIssueDate || '-')}</td>
                        <td class="right">${formatProcMoney(l.unitPrice)}</td>
                        <td class="center font-semibold">${Number(l.orderedQty || 0).toLocaleString()}</td>
                        <td class="right">${formatProcMoney(l.orderValue)}</td>
                        <td class="center">${Number(l.remainingAfterLot || 0).toLocaleString()}</td>
                        <td class="center">${getProcStatusBadgeHtml(l.effectiveStatus)}</td>
                        <td class="text-gray">${escHtml(l.remarks || '-')}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `;
            rowsHtml.push(`
              <tr class="proc-expand-row">
                <td colspan="11">
                  <div class="proc-expand-box">
                    <div class="flex justify-between items-center mb-2">
                      <strong class="text-xs">Purchase Order Lots under ${escHtml(ct.contractNumber)} (${escHtml(ct.deviceName)})</strong>
                      ${ct.effectiveStatus === 'In Progress' ? `<button class="btn btn-brand btn-xs" onclick="openContractPOModal('', '${escHtml(ct.contractId)}')">+ Add PO Lot</button>` : ''}
                    </div>
                    ${lotsTableHtml}
                  </div>
                </td>
              </tr>
            `);
          }
        });

        tbody.innerHTML = rowsHtml.join('');
        return;
      }

      // ── SUB-TAB 3: CONTRACT PURCHASE ORDERS (PO LOTS) ──
      if (sub === 'contract_po') {
        const nonCancelled = poFyList.filter(x => x.effectiveStatus !== 'Cancelled');
        const pendingCnt = poFyList.filter(x => x.effectiveStatus === 'Pending PO').length;
        const completedCnt = poFyList.filter(x => x.effectiveStatus === 'Completed').length;
        const totalPoVal = nonCancelled.reduce((s, x) => s + (Number(x.orderValue) || 0), 0);

        if (kpiStrip) {
          kpiStrip.innerHTML = `
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Pending PO Lots</div>
              <div class="proc-kpi-val" style="color:#92400e;">${pendingCnt}</div>
              <div class="proc-kpi-sub">Awaiting Goods Receiving completion</div>
            </div>
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Completed PO Lots</div>
              <div class="proc-kpi-val" style="color:#065f46;">${completedCnt}</div>
              <div class="proc-kpi-sub">Received &amp; Stock-In posted</div>
            </div>
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Total Contract PO Value</div>
              <div class="proc-kpi-val" style="color:var(--brand-dark);">${formatProcMoney(totalPoVal)}</div>
              <div class="proc-kpi-sub">Across ${nonCancelled.length} non-cancelled PO lot(s)</div>
            </div>
          `;
        }

        thead.innerHTML = `
          <tr>
            <th>PO ID</th>
            <th>PO Issue Date</th>
            <th>Contract No.</th>
            <th>HO Item ID &amp; Device</th>
            <th>Company</th>
            <th class="right">Unit Price</th>
            <th class="center">Ordered Qty</th>
            <th class="right">Order Value</th>
            <th class="center">Contract Rem. Qty</th>
            <th class="center">Effective Status</th>
            <th class="center no-print">Actions</th>
          </tr>
        `;

        const filtered = poFyList.filter(r => {
          if (activeStatusFilter && r.effectiveStatus !== activeStatusFilter) return false;
          if (searchQ) {
            const hay = `${r.poId} ${r.linkedContractId} ${r.contractNumber} ${r.hoItemId} ${r.deviceName} ${r.company} ${r.remarks} ${r.effectiveStatus}`.toLowerCase();
            if (!hay.includes(searchQ)) return false;
          }
          return true;
        });

        if (filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="11" class="empty">No Contract PO records found for this filter.</td></tr>`;
          return;
        }

        tbody.innerHTML = filtered.map(po => {
          const isCancelled = po.effectiveStatus === 'Cancelled';
          const canCancel = !isCancelled && po.receivingStatus !== 'Completed';
          let receiveBtnHtml = '';
          if (!isCancelled) {
            if (!po.linkedReceivingId) {
              receiveBtnHtml = `<button class="btn btn-outline btn-xs" style="color:#065f46; border-color:#6ee7b7;" onclick="openReceivingModal('', 'Contract PO', '${escHtml(po.poId)}')">+ Receive</button>`;
            } else if (po.receivingStatus !== 'Completed') {
              receiveBtnHtml = `<button class="btn btn-outline btn-xs" style="color:#4338ca; border-color:#a5b4fc;" onclick="openReceivingModal('${escHtml(po.linkedReceivingId)}', '', '')">Open Receipt</button>`;
            }
          }
          return `
            <tr style="${isCancelled ? 'opacity:0.6;' : ''}">
              <td class="mono text-xs font-semibold">${escHtml(po.poId)}</td>
              <td>${escHtml(po.poIssueDate || '-')}</td>
              <td>
                <div class="font-semibold">${escHtml(po.contractNumber || po.linkedContractId)}</div>
                <div class="mono text-xs text-gray">${escHtml(po.linkedContractId)}</div>
              </td>
              <td>
                <div class="font-semibold">${escHtml(po.deviceName)}</div>
                <div class="mono text-xs text-gray">${escHtml(po.hoItemId || '-')}</div>
              </td>
              <td>${escHtml(po.company || '-')}</td>
              <td class="right">${formatProcMoney(po.unitPrice)}</td>
              <td class="center font-semibold">${Number(po.orderedQty || 0).toLocaleString()}</td>
              <td class="right font-semibold" style="color:var(--brand-dark);">${formatProcMoney(po.orderValue)}</td>
              <td class="center" style="${po.remainingContractQty < 0 ? 'color:var(--red); font-weight:700;' : 'font-weight:600;'}">${Number(po.remainingContractQty || 0).toLocaleString()}</td>
              <td class="center">${getProcStatusBadgeHtml(po.effectiveStatus)}</td>
              <td class="center no-print" style="white-space:nowrap;">
                ${receiveBtnHtml}
                <button class="btn btn-outline btn-xs" onclick="openContractPOModal('${escHtml(po.poId)}', '')">Edit</button>
                ${canCancel ? `<button class="btn btn-outline btn-xs" style="color:#b45309;" onclick="handleCancelProcurementRecord('contract_po', '${escHtml(po.poId)}', '${escHtml(po.poId)}')">Cancel</button>` : ''}
                <button class="btn btn-ghost-danger btn-xs" onclick="handleDeleteContractPO('${escHtml(po.poId)}')">Delete</button>
              </td>
            </tr>
          `;
        }).join('');
        return;
      }

      // ── SUB-TAB 4: SPECIFIC-METHOD PURCHASES ──
      if (sub === 'specific_purchase') {
        const nonCancelled = spFyList.filter(x => x.effectiveStatus !== 'Cancelled');
        const pendingCnt = spFyList.filter(x => x.effectiveStatus === 'Pending PO').length;
        const completedCnt = spFyList.filter(x => x.effectiveStatus === 'Completed').length;
        const totalSpVal = nonCancelled.reduce((s, x) => s + (Number(x.orderValue) || 0), 0);

        if (kpiStrip) {
          kpiStrip.innerHTML = `
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Pending Specific Purchases</div>
              <div class="proc-kpi-val" style="color:#92400e;">${pendingCnt}</div>
              <div class="proc-kpi-sub">Awaiting Goods Receiving completion</div>
            </div>
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Completed Specific Purchases</div>
              <div class="proc-kpi-val" style="color:#065f46;">${completedCnt}</div>
              <div class="proc-kpi-sub">Received &amp; Stock-In posted</div>
            </div>
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Total Specific Purchase Value</div>
              <div class="proc-kpi-val" style="color:var(--brand-dark);">${formatProcMoney(totalSpVal)}</div>
              <div class="proc-kpi-sub">Across ${nonCancelled.length} non-cancelled order(s)</div>
            </div>
          `;
        }

        thead.innerHTML = `
          <tr>
            <th>Specific PO ID</th>
            <th>PO Issue Date</th>
            <th class="center">FY</th>
            <th>HO Item ID &amp; Device</th>
            <th>Company</th>
            <th class="right">Unit Price</th>
            <th class="center">Budget Plan Qty</th>
            <th class="center">Ordered Qty</th>
            <th class="right">Order Value</th>
            <th class="center" title="Budget Plan Qty - Total Ordered Qty for same FY + HO Item ID">Remaining Qty</th>
            <th class="center">Effective Status</th>
            <th class="center no-print">Actions</th>
          </tr>
        `;

        const filtered = spFyList.filter(r => {
          if (activeStatusFilter && r.effectiveStatus !== activeStatusFilter) return false;
          if (searchQ) {
            const hay = `${r.spId} ${r.hoItemId} ${r.deviceName} ${r.company} ${r.remarks} ${r.effectiveStatus}`.toLowerCase();
            if (!hay.includes(searchQ)) return false;
          }
          return true;
        });

        if (filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="12" class="empty">No Specific-Method Purchase records found for this filter.</td></tr>`;
          return;
        }

        tbody.innerHTML = filtered.map(sp => {
          const isCancelled = sp.effectiveStatus === 'Cancelled';
          const canCancel = !isCancelled && sp.receivingStatus !== 'Completed';
          let receiveBtnHtml = '';
          if (!isCancelled) {
            if (!sp.linkedReceivingId) {
              receiveBtnHtml = `<button class="btn btn-outline btn-xs" style="color:#065f46; border-color:#6ee7b7;" onclick="openReceivingModal('', 'Specific Purchase', '${escHtml(sp.spId)}')">+ Receive</button>`;
            } else if (sp.receivingStatus !== 'Completed') {
              receiveBtnHtml = `<button class="btn btn-outline btn-xs" style="color:#4338ca; border-color:#a5b4fc;" onclick="openReceivingModal('${escHtml(sp.linkedReceivingId)}', '', '')">Open Receipt</button>`;
            }
          }
          return `
            <tr style="${isCancelled ? 'opacity:0.6;' : ''}">
              <td class="mono text-xs font-semibold">${escHtml(sp.spId)}</td>
              <td>${escHtml(sp.poIssueDate || '-')}</td>
              <td class="center font-semibold">${escHtml(sp.fiscalYear)}</td>
              <td>
                <div class="font-semibold">${escHtml(sp.deviceName)}</div>
                <div class="mono text-xs text-gray">${escHtml(sp.hoItemId || '-')}</div>
              </td>
              <td>${escHtml(sp.company || '-')}</td>
              <td class="right">${formatProcMoney(sp.unitPrice)}</td>
              <td class="center">${Number(sp.budgetPlanQty || 0).toLocaleString()}</td>
              <td class="center font-semibold">${Number(sp.orderedQty || 0).toLocaleString()}</td>
              <td class="right font-semibold" style="color:var(--brand-dark);">${formatProcMoney(sp.orderValue)}</td>
              <td class="center" style="${sp.remainingQty < 0 ? 'color:var(--red); font-weight:700;' : 'font-weight:600;'}">${Number(sp.remainingQty || 0).toLocaleString()}</td>
              <td class="center">${getProcStatusBadgeHtml(sp.effectiveStatus)}</td>
              <td class="center no-print" style="white-space:nowrap;">
                ${receiveBtnHtml}
                <button class="btn btn-outline btn-xs" onclick="openSpecificPurchaseModal('${escHtml(sp.spId)}')">Edit</button>
                ${canCancel ? `<button class="btn btn-outline btn-xs" style="color:#b45309;" onclick="handleCancelProcurementRecord('specific_purchase', '${escHtml(sp.spId)}', '${escHtml(sp.spId)}')">Cancel</button>` : ''}
                <button class="btn btn-ghost-danger btn-xs" onclick="handleDeleteSpecificPurchase('${escHtml(sp.spId)}')">Delete</button>
              </td>
            </tr>
          `;
        }).join('');
        return;
      }

      // ── SUB-TAB 5: GOODS RECEIVING ──
      if (sub === 'receiving') {
        const awaitingCnt = rcFyList.filter(x => x.effectiveStatus === 'Awaiting Delivery').length;
        const completedCnt = rcFyList.filter(x => x.effectiveStatus === 'Completed').length;
        const completedVal = rcFyList.filter(x => x.effectiveStatus === 'Completed').reduce((s, x) => s + (Number(x.totalValue) || 0), 0);

        if (kpiStrip) {
          kpiStrip.innerHTML = `
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Awaiting Delivery / Inspection</div>
              <div class="proc-kpi-val" style="color:#4338ca;">${awaitingCnt}</div>
              <div class="proc-kpi-sub">Ready to Complete &amp; Post Stock-In</div>
            </div>
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Completed Receipts (Stocked In)</div>
              <div class="proc-kpi-val" style="color:#065f46;">${completedCnt}</div>
              <div class="proc-kpi-sub">Posted to Raw_data (Main Stock)</div>
            </div>
            <div class="proc-kpi-card">
              <div class="proc-kpi-label">Total Completed Receiving Value</div>
              <div class="proc-kpi-val" style="color:var(--brand-dark);">${formatProcMoney(completedVal)}</div>
              <div class="proc-kpi-sub">Verified &amp; locked receipts</div>
            </div>
          `;
        }

        thead.innerHTML = `
          <tr>
            <th>Receiving ID</th>
            <th>Receiving Date</th>
            <th>Source Order</th>
            <th>HO Item ID &amp; Device</th>
            <th>Company</th>
            <th class="center">Recv Qty</th>
            <th class="right">Total Value</th>
            <th>Allocated Item IDs</th>
            <th>Stock-In Txn ID</th>
            <th class="center">Effective Status</th>
            <th class="center no-print">Actions</th>
          </tr>
        `;

        const filtered = rcFyList.filter(r => {
          if (activeStatusFilter && r.effectiveStatus !== activeStatusFilter) return false;
          if (searchQ) {
            const hay = `${r.receivingId} ${r.sourceType} ${r.sourceRecordId} ${r.hoItemId} ${r.deviceName} ${r.company} ${r.stockInTxnId} ${r.remarks} ${r.effectiveStatus}`.toLowerCase();
            if (!hay.includes(searchQ)) return false;
          }
          return true;
        });

        if (filtered.length === 0) {
          tbody.innerHTML = `<tr><td colspan="11" class="empty">No Goods Receiving records found for this filter.</td></tr>`;
          return;
        }

        tbody.innerHTML = filtered.map(rec => {
          const isCancelled = rec.effectiveStatus === 'Cancelled';
          const isCompleted = rec.effectiveStatus === 'Completed';
          const allocSummary = (rec.allocations || [])
            .filter(a => a && Number(a.quantity) > 0)
            .map(a => {
              const inv = (state.inventory || []).find(i => String(i.itemId) === String(a.itemId));
              const label = inv ? `${inv.deviceName} (${a.itemId})` : a.itemId;
              return `<span class="badge" style="background:var(--gray-100); color:var(--gray-800); margin:1px 2px; display:inline-block;">${escHtml(label)}: <b>${a.quantity}</b></span>`;
            }).join('') || '<span class="text-xs text-gray">Unallocated</span>';

          return `
            <tr style="${isCancelled ? 'opacity:0.6;' : ''}">
              <td class="mono text-xs font-semibold">${escHtml(rec.receivingId)}</td>
              <td>${escHtml(rec.receivingDate || '-')}</td>
              <td>
                <div class="text-xs font-semibold">${escHtml(rec.sourceType)}</div>
                <div class="mono text-xs text-gray">${escHtml(rec.sourceRecordId)}</div>
              </td>
              <td>
                <div class="font-semibold">${escHtml(rec.deviceName)}</div>
                <div class="mono text-xs text-gray">${escHtml(rec.hoItemId || '-')}</div>
              </td>
              <td>${escHtml(rec.company || '-')}</td>
              <td class="center font-semibold">${Number(rec.quantity || 0).toLocaleString()}</td>
              <td class="right font-semibold" style="color:var(--brand-dark);">${formatProcMoney(rec.totalValue)}</td>
              <td>${allocSummary}</td>
              <td class="mono text-xs">${rec.stockInTxnId ? `<span style="color:#065f46; font-weight:700;">${escHtml(rec.stockInTxnId)}</span>` : '<span class="text-gray">-</span>'}</td>
              <td class="center">${getProcStatusBadgeHtml(rec.effectiveStatus)}</td>
              <td class="center no-print" style="white-space:nowrap;">
                <button class="btn ${isCompleted ? 'btn-outline' : 'btn-brand'} btn-xs" onclick="openReceivingModal('${escHtml(rec.receivingId)}', '', '')">
                  ${isCompleted ? 'View' : (isCancelled ? 'Edit' : 'Complete / Edit')}
                </button>
                ${(!isCompleted && !isCancelled) ? `<button class="btn btn-outline btn-xs" style="color:#b45309;" onclick="handleCancelProcurementRecord('receiving', '${escHtml(rec.receivingId)}', '${escHtml(rec.receivingId)}')">Cancel</button>` : ''}
                ${!isCompleted ? `<button class="btn btn-ghost-danger btn-xs" onclick="handleDeleteReceiving('${escHtml(rec.receivingId)}')">Delete</button>` : ''}
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // ── Quick Item Picker (Rule 0.5) for E-Bidding & Specific Purchase ──
    function filterProcItemPicker(prefix, query) {
      const resultsEl = document.getElementById(`${prefix}-item-picker-results`);
      if (!resultsEl) return;
      const q = String(query || '').trim().toLowerCase();
      if (!q) {
        resultsEl.classList.add('hidden');
        return;
      }
      const matches = (state.inventory || []).filter(item => {
        const hay = `${item.deviceName || ''} ${item.hoItemId || ''} ${item.itemId || ''} ${item.company || ''}`.toLowerCase();
        return hay.includes(q);
      }).slice(0, 12);

      if (matches.length === 0) {
        resultsEl.innerHTML = `<div class="search-item text-xs text-gray">No matching inventory item found</div>`;
        resultsEl.classList.remove('hidden');
        return;
      }

      resultsEl.innerHTML = matches.map(item => {
        const parentTag = item.isParent ? `<span class="badge" style="background:#e0e7ff; color:#3730a3; margin-left:4px;">GROUP</span>` : '';
        return `
          <div class="search-item" onclick="selectProcItemPicker('${escHtml(prefix)}', '${escHtml(item.itemId)}')">
            <div>
              <div class="font-semibold text-sm">${escHtml(item.deviceName)}${parentTag}</div>
              <div class="text-xs text-gray">HO ID: <span class="mono">${escHtml(item.hoItemId || '-')}</span> | Company: ${escHtml(item.company || '-')}</div>
            </div>
            <div class="right text-xs font-semibold" style="color:var(--brand-dark);">฿${Number(item.buyPrice || 0).toLocaleString()}</div>
          </div>
        `;
      }).join('');
      resultsEl.classList.remove('hidden');
    }

    function selectProcItemPicker(prefix, itemId) {
      const item = (state.inventory || []).find(i => String(i.itemId) === String(itemId));
      const resultsEl = document.getElementById(`${prefix}-item-picker-results`);
      if (resultsEl) resultsEl.classList.add('hidden');
      const pickerInput = document.getElementById(`${prefix}-item-picker-input`);
      if (pickerInput) pickerInput.value = '';
      if (!item) return;

      let hoId = item.hoItemId || '';
      let company = item.company || '';
      if ((!hoId || !company) && item.parentId) {
        const parent = (state.inventory || []).find(p => String(p.itemId) === String(item.parentId));
        if (parent) {
          if (!hoId) hoId = parent.hoItemId || '';
          if (!company) company = parent.company || '';
        }
      }

      const hoidEl = document.getElementById(`${prefix}-modal-hoid`);
      const devEl = document.getElementById(`${prefix}-modal-device`);
      const priceEl = document.getElementById(`${prefix}-modal-price`);
      const compEl = document.getElementById(`${prefix}-modal-company`);

      if (hoidEl) hoidEl.value = hoId;
      if (devEl) devEl.value = item.deviceName || '';
      if (priceEl) priceEl.value = Number(item.buyPrice) || 0;
      if (compEl) compEl.value = company;

      if (prefix === 'eb') updateEBiddingModalCalc();
      if (prefix === 'sp') updateSpecificPurchaseModalCalc();
    }

    // Hide item picker dropdowns when clicking outside
    document.addEventListener('click', function(e) {
      ['eb', 'sp'].forEach(prefix => {
        const res = document.getElementById(`${prefix}-item-picker-results`);
        const inp = document.getElementById(`${prefix}-item-picker-input`);
        if (res && !res.classList.contains('hidden')) {
          if (!res.contains(e.target) && e.target !== inp) {
            res.classList.add('hidden');
          }
        }
      });
      const rcRes = document.getElementById('rc-alloc-search-results');
      const rcInp = document.getElementById('rc-alloc-search-input');
      if (rcRes && !rcRes.classList.contains('hidden')) {
        if (!rcRes.contains(e.target) && e.target !== rcInp) {
          rcRes.classList.add('hidden');
        }
      }
    });

    // ── 1. E-Bidding Modal Functions ──
    function openEBiddingModal(ebiddingId) {
      recalculateProcurementState();
      const id = String(ebiddingId || '').trim();
      const existing = id ? (state.ebiddings || []).find(x => x.ebiddingId === id) : null;

      document.getElementById('eb-modal-id').value = existing ? existing.ebiddingId : '';
      document.getElementById('eb-modal-title').textContent = existing ? `Edit E-Bidding Plan (${existing.ebiddingId})` : 'Add E-Bidding Plan';
      document.getElementById('eb-item-picker-input').value = '';
      document.getElementById('eb-item-picker-results').classList.add('hidden');

      const defaultFy = (state.procurementFy && state.procurementFy !== 'All') ? state.procurementFy : getCurrentFiscalYearClient();
      document.getElementById('eb-modal-fy').value = existing ? existing.fiscalYear : defaultFy;
      document.getElementById('eb-modal-status').value = existing ? (existing.manualStatus || 'Planned') : 'Planned';
      document.getElementById('eb-modal-hoid').value = existing ? (existing.hoItemId || '') : '';
      document.getElementById('eb-modal-device').value = existing ? (existing.deviceName || '') : '';
      document.getElementById('eb-modal-price').value = existing ? existing.unitPrice : '';
      document.getElementById('eb-modal-qty').value = existing ? existing.budgetPlanQty : '';
      document.getElementById('eb-modal-company').value = existing ? (existing.company || '') : '';
      document.getElementById('eb-modal-remarks').value = existing ? (existing.remarks || '') : '';

      updateEBiddingModalCalc();
      openModal('modal-ebidding');
    }

    function updateEBiddingModalCalc() {
      const price = Number(document.getElementById('eb-modal-price')?.value) || 0;
      const qty = Number(document.getElementById('eb-modal-qty')?.value) || 0;
      const totEl = document.getElementById('eb-modal-total');
      if (totEl) totEl.value = formatProcMoney(price * qty);
    }

    function saveEBiddingModal() {
      const ebiddingId = document.getElementById('eb-modal-id').value.trim();
      const fiscalYear = document.getElementById('eb-modal-fy').value.trim() || getCurrentFiscalYearClient();
      const manualStatus = document.getElementById('eb-modal-status').value;
      const hoItemId = document.getElementById('eb-modal-hoid').value.trim();
      const deviceName = document.getElementById('eb-modal-device').value.trim();
      const unitPrice = Number(document.getElementById('eb-modal-price').value) || 0;
      const budgetPlanQty = Number(document.getElementById('eb-modal-qty').value) || 0;
      const company = document.getElementById('eb-modal-company').value.trim();
      const remarks = document.getElementById('eb-modal-remarks').value.trim();

      if (!deviceName) { showToast('Device Name is required'); return; }
      if (budgetPlanQty <= 0) { showToast('Budget Plan Quantity must be greater than 0'); return; }

      if (ebiddingId && manualStatus === 'Cancelled') {
        const existing = (state.ebiddings || []).find(x => x.ebiddingId === ebiddingId);
        if (existing && existing.linkedContractIds && existing.linkedContractIds.length > 0) {
          showToast('Cannot cancel E-Bidding while a non-cancelled Contract is linked to it.');
          return;
        }
      }

      const payload = {
        ebiddingId,
        fiscalYear,
        manualStatus,
        hoItemId,
        deviceName,
        unitPrice,
        budgetPlanQty,
        company,
        remarks
      };

      closeModal();
      setSyncIndicator(true);
      const action = ebiddingId ? 'editEBidding' : 'addEBidding';

      if (isApiConfigured()) {
        callApi(action, payload)
          .then(() => {
            setSyncIndicator(false);
            showToast(ebiddingId ? 'E-Bidding updated!' : 'E-Bidding added!');
            fetchDataFromServer();
          })
          .catch(err => {
            setSyncIndicator(false);
            showToast('Failed: ' + (err.message || err));
          });
      } else {
        setSyncIndicator(false);
        if (ebiddingId) {
          const idx = state.ebiddings.findIndex(x => x.ebiddingId === ebiddingId);
          if (idx !== -1) Object.assign(state.ebiddings[idx], payload);
        } else {
          payload.ebiddingId = generateClientProcurementId('EB');
          state.ebiddings.unshift(payload);
        }
        recalculateProcurementState();
        renderProcurementTab();
        showToast(ebiddingId ? 'E-Bidding updated (Mock)' : 'E-Bidding added (Mock)');
      }
    }

    function handleDeleteEBidding(ebiddingId) {
      const linkedCts = (state.contracts || []).filter(c => c.linkedEBiddingId === ebiddingId);
      if (linkedCts.length > 0) {
        showToast(`Cannot delete E-Bidding because Contract (${linkedCts[0].contractId}) is linked to it.`);
        return;
      }
      requireDeletePasscode(`Delete E-Bidding record "${ebiddingId}"?`, () => {
        setSyncIndicator(true);
        if (isApiConfigured()) {
          callApi('deleteEBidding', { ebiddingId })
            .then(() => {
              setSyncIndicator(false);
              showToast('E-Bidding deleted');
              fetchDataFromServer();
            })
            .catch(err => {
              setSyncIndicator(false);
              showToast('Failed: ' + (err.message || err));
            });
        } else {
          setSyncIndicator(false);
          state.ebiddings = (state.ebiddings || []).filter(x => x.ebiddingId !== ebiddingId);
          recalculateProcurementState();
          renderProcurementTab();
          showToast('E-Bidding deleted (Mock)');
        }
      });
    }

    // ── 2. Contract Modal Functions ──
    function openContractModal(contractId, prefillEBiddingId) {
      recalculateProcurementState();
      const id = String(contractId || '').trim();
      const existing = id ? (state.contracts || []).find(x => x.contractId === id) : null;
      const targetEbId = existing ? existing.linkedEBiddingId : String(prefillEBiddingId || '').trim();

      document.getElementById('ct-modal-id').value = existing ? existing.contractId : '';
      document.getElementById('ct-modal-title').textContent = existing ? `Edit Contract (${existing.contractId})` : 'Create Contract';

      const ebSelect = document.getElementById('ct-modal-ebidding-id');
      const eligibleEbs = (state.ebiddings || []).filter(eb => eb.effectiveStatus !== 'Cancelled' || eb.ebiddingId === targetEbId);
      ebSelect.innerHTML = `<option value="">-- Select E-Bidding Record --</option>` +
        eligibleEbs.map(eb => `<option value="${escHtml(eb.ebiddingId)}"${eb.ebiddingId === targetEbId ? ' selected' : ''}>${escHtml(eb.ebiddingId)} — [FY ${escHtml(eb.fiscalYear)}] ${escHtml(eb.deviceName)} (Qty: ${eb.budgetPlanQty})</option>`).join('');

      if (existing) {
        document.getElementById('ct-modal-fy').value = existing.fiscalYear || '';
        document.getElementById('ct-modal-hoid').value = existing.hoItemId || '';
        document.getElementById('ct-modal-device').value = existing.deviceName || '';
        document.getElementById('ct-modal-number').value = existing.contractNumber || '';
        document.getElementById('ct-modal-start').value = existing.contractStartDate || getToday();
        document.getElementById('ct-modal-end').value = existing.contractEndDate || '';
        document.getElementById('ct-modal-price').value = existing.unitPrice;
        document.getElementById('ct-modal-qty').value = existing.totalContractQty;
        document.getElementById('ct-modal-company').value = existing.company || '';
        document.getElementById('ct-modal-status').value = existing.manualStatus === 'Cancelled' ? 'Cancelled' : '';
        document.getElementById('ct-modal-remarks').value = existing.remarks || '';
      } else {
        const todayStr = getToday();
        const nextYr = new Date();
        nextYr.setFullYear(nextYr.getFullYear() + 1);
        const nextYrStr = nextYr.toISOString().slice(0, 10);
        document.getElementById('ct-modal-number').value = '';
        document.getElementById('ct-modal-start').value = todayStr;
        document.getElementById('ct-modal-end').value = nextYrStr;
        document.getElementById('ct-modal-status').value = '';
        document.getElementById('ct-modal-remarks').value = '';
        onContractEBiddingSelect(targetEbId);
      }

      updateContractModalCalc();
      openModal('modal-contract');
    }

    function onContractEBiddingSelect(ebiddingId) {
      const eb = (state.ebiddings || []).find(x => x.ebiddingId === String(ebiddingId || '').trim());
      document.getElementById('ct-modal-fy').value = eb ? eb.fiscalYear : '';
      document.getElementById('ct-modal-hoid').value = eb ? (eb.hoItemId || '') : '';
      document.getElementById('ct-modal-device').value = eb ? (eb.deviceName || '') : '';
      if (eb) {
        document.getElementById('ct-modal-price').value = eb.unitPrice;
        document.getElementById('ct-modal-qty').value = eb.budgetPlanQty;
        document.getElementById('ct-modal-company').value = eb.company || '';
      }
      updateContractModalCalc();
    }

    function updateContractModalCalc() {
      const contractId = document.getElementById('ct-modal-id').value.trim();
      const totalQty = Number(document.getElementById('ct-modal-qty')?.value) || 0;
      const existing = contractId ? (state.contracts || []).find(x => x.contractId === contractId) : null;
      const orderedQty = existing ? (Number(existing.orderedQty) || 0) : 0;
      const rem = totalQty - orderedQty;
      const remEl = document.getElementById('ct-modal-remaining');
      if (remEl) {
        remEl.value = `${rem.toLocaleString()} (Ordered: ${orderedQty.toLocaleString()})`;
        remEl.style.color = rem < 0 ? 'var(--red)' : 'var(--gray-900)';
      }
    }

    function saveContractModal() {
      const contractId = document.getElementById('ct-modal-id').value.trim();
      const linkedEBiddingId = document.getElementById('ct-modal-ebidding-id').value.trim();
      const contractNumber = document.getElementById('ct-modal-number').value.trim();
      const contractStartDate = document.getElementById('ct-modal-start').value;
      const contractEndDate = document.getElementById('ct-modal-end').value;
      const unitPrice = Number(document.getElementById('ct-modal-price').value) || 0;
      const totalContractQty = Number(document.getElementById('ct-modal-qty').value) || 0;
      const company = document.getElementById('ct-modal-company').value.trim();
      const manualStatus = document.getElementById('ct-modal-status').value;
      const remarks = document.getElementById('ct-modal-remarks').value.trim();

      if (!linkedEBiddingId) { showToast('Please select a Linked E-Bidding Record'); return; }
      if (!contractNumber) { showToast('Contract Number is required'); return; }
      if (!contractStartDate || !contractEndDate) { showToast('Contract Start Date and End Date are required'); return; }
      if (contractEndDate < contractStartDate) { showToast('Contract End Date must be on or after Start Date'); return; }
      if (totalContractQty <= 0) { showToast('Total Contract Quantity must be greater than 0'); return; }

      if (contractId && manualStatus === 'Cancelled') {
        const activeLots = (state.contractPOs || []).filter(po => po.linkedContractId === contractId && po.effectiveStatus !== 'Cancelled');
        if (activeLots.length > 0) {
          showToast(`Cannot cancel Contract while it has non-cancelled PO lots (${activeLots.length} active lot(s)).`);
          return;
        }
      }

      const payload = {
        contractId,
        linkedEBiddingId,
        contractNumber,
        contractStartDate,
        contractEndDate,
        unitPrice,
        totalContractQty,
        company,
        manualStatus,
        remarks
      };

      closeModal();
      setSyncIndicator(true);
      const action = contractId ? 'editContract' : 'addContract';

      if (isApiConfigured()) {
        callApi(action, payload)
          .then(() => {
            setSyncIndicator(false);
            showToast(contractId ? 'Contract updated!' : 'Contract created!');
            fetchDataFromServer();
          })
          .catch(err => {
            setSyncIndicator(false);
            showToast('Failed: ' + (err.message || err));
          });
      } else {
        setSyncIndicator(false);
        if (contractId) {
          const idx = state.contracts.findIndex(x => x.contractId === contractId);
          if (idx !== -1) Object.assign(state.contracts[idx], payload);
        } else {
          payload.contractId = generateClientProcurementId('CT');
          state.contracts.unshift(payload);
        }
        recalculateProcurementState();
        renderProcurementTab();
        showToast(contractId ? 'Contract updated (Mock)' : 'Contract created (Mock)');
      }
    }

    function handleDeleteContract(contractId) {
      const linkedLots = (state.contractPOs || []).filter(po => po.linkedContractId === contractId);
      if (linkedLots.length > 0) {
        showToast(`Cannot delete Contract because PO lot (${linkedLots[0].poId}) is linked to it.`);
        return;
      }
      requireDeletePasscode(`Delete Contract "${contractId}"?`, () => {
        setSyncIndicator(true);
        if (isApiConfigured()) {
          callApi('deleteContract', { contractId })
            .then(() => {
              setSyncIndicator(false);
              showToast('Contract deleted');
              fetchDataFromServer();
            })
            .catch(err => {
              setSyncIndicator(false);
              showToast('Failed: ' + (err.message || err));
            });
        } else {
          setSyncIndicator(false);
          state.contracts = (state.contracts || []).filter(x => x.contractId !== contractId);
          recalculateProcurementState();
          renderProcurementTab();
          showToast('Contract deleted (Mock)');
        }
      });
    }

    // ── 3. Contract Purchase Order (PO Lot) Modal Functions ──
    function openContractPOModal(poId, prefillContractId) {
      recalculateProcurementState();
      const id = String(poId || '').trim();
      const existing = id ? (state.contractPOs || []).find(x => x.poId === id) : null;
      const targetCtId = existing ? existing.linkedContractId : String(prefillContractId || '').trim();

      document.getElementById('po-modal-id').value = existing ? existing.poId : '';
      document.getElementById('po-modal-title').textContent = existing ? `Edit Contract PO Lot (${existing.poId})` : 'Create Contract Purchase Order (Lot)';

      const ctSelect = document.getElementById('po-modal-contract-id');
      const eligibleCts = (state.contracts || []).filter(ct => ct.effectiveStatus === 'In Progress' || ct.contractId === targetCtId);
      ctSelect.innerHTML = `<option value="">-- Select Active Contract --</option>` +
        eligibleCts.map(ct => `<option value="${escHtml(ct.contractId)}"${ct.contractId === targetCtId ? ' selected' : ''}>${escHtml(ct.contractNumber)} (${escHtml(ct.contractId)}) — ${escHtml(ct.deviceName)} [Rem: ${ct.remainingQty}/${ct.totalContractQty}]</option>`).join('');

      document.getElementById('po-modal-date').value = existing ? (existing.poIssueDate || getToday()) : getToday();
      document.getElementById('po-modal-status').value = existing && existing.manualStatus === 'Cancelled' ? 'Cancelled' : '';
      document.getElementById('po-modal-remarks').value = existing ? (existing.remarks || '') : '';

      if (existing) {
        document.getElementById('po-modal-price').value = existing.unitPrice;
        document.getElementById('po-modal-qty').value = existing.orderedQty;
        onContractPOContractSelect(targetCtId, true);
      } else {
        document.getElementById('po-modal-qty').value = '';
        onContractPOContractSelect(targetCtId, false);
      }

      openModal('modal-contract-po');
    }

    function onContractPOContractSelect(contractId, keepPrice) {
      const ct = (state.contracts || []).find(x => x.contractId === String(contractId || '').trim());
      document.getElementById('po-disp-contract-no').textContent = ct ? ct.contractNumber : '-';
      document.getElementById('po-disp-period').textContent = ct ? `${ct.contractStartDate || '-'} to ${ct.contractEndDate || '-'}` : '-';
      document.getElementById('po-disp-company').textContent = ct ? (ct.company || '-') : '-';
      document.getElementById('po-disp-hoid').textContent = ct ? (ct.hoItemId || '-') : '-';
      document.getElementById('po-disp-device').textContent = ct ? (ct.deviceName || '-') : '-';
      document.getElementById('po-disp-total-qty').textContent = ct ? `${ct.totalContractQty} (Rem: ${ct.remainingQty})` : '0';

      if (ct && !keepPrice) {
        document.getElementById('po-modal-price').value = ct.unitPrice;
      }
      updateContractPOModalCalc();
    }

    function updateContractPOModalCalc() {
      const editingPoId = document.getElementById('po-modal-id').value.trim();
      const contractId = document.getElementById('po-modal-contract-id').value.trim();
      const price = Number(document.getElementById('po-modal-price')?.value) || 0;
      const qty = Number(document.getElementById('po-modal-qty')?.value) || 0;
      const valEl = document.getElementById('po-modal-value');
      const remEl = document.getElementById('po-modal-remaining');
      const warnEl = document.getElementById('po-modal-neg-warning');

      if (valEl) valEl.value = formatProcMoney(price * qty);

      const ct = (state.contracts || []).find(x => x.contractId === contractId);
      if (!ct) {
        if (remEl) remEl.value = '0';
        if (warnEl) warnEl.classList.add('hidden');
        return;
      }

      const otherOrd = (state.contractPOs || [])
        .filter(po => po.linkedContractId === contractId && po.poId !== editingPoId && po.effectiveStatus !== 'Cancelled')
        .reduce((s, po) => s + (Number(po.orderedQty) || 0), 0);

      const remBefore = ct.totalContractQty - otherOrd;
      const remAfter = remBefore - qty;

      if (remEl) {
        remEl.value = `${remAfter.toLocaleString()} (Before: ${remBefore.toLocaleString()})`;
        remEl.style.color = remAfter < 0 ? 'var(--red)' : 'var(--gray-900)';
      }

      if (warnEl) {
        if (qty > 0 && remAfter < 0) {
          warnEl.textContent = `Warning: Ordered quantity (${qty}) exceeds the contract's remaining quantity (${remBefore}), resulting in a negative balance (${remAfter}). Confirmation will be required on save.`;
          warnEl.classList.remove('hidden');
        } else {
          warnEl.classList.add('hidden');
        }
      }
    }

    function saveContractPOModal() {
      const poId = document.getElementById('po-modal-id').value.trim();
      const linkedContractId = document.getElementById('po-modal-contract-id').value.trim();
      const poIssueDate = document.getElementById('po-modal-date').value || getToday();
      const unitPrice = Number(document.getElementById('po-modal-price').value) || 0;
      const orderedQty = Number(document.getElementById('po-modal-qty').value) || 0;
      const manualStatus = document.getElementById('po-modal-status').value;
      const remarks = document.getElementById('po-modal-remarks').value.trim();

      if (!linkedContractId) { showToast('Please select a Linked Contract'); return; }
      if (orderedQty <= 0) { showToast('Ordered Quantity must be greater than 0'); return; }

      const ct = (state.contracts || []).find(x => x.contractId === linkedContractId);
      if (!ct) { showToast('Selected Contract not found'); return; }

      if (poId && manualStatus === 'Cancelled') {
        const existingPo = (state.contractPOs || []).find(x => x.poId === poId);
        if (existingPo && existingPo.receivingStatus === 'Completed') {
          showToast(`Cannot cancel this Contract PO because its Receiving (${existingPo.linkedReceivingId}) is already Completed.`);
          return;
        }
      }

      const otherOrd = (state.contractPOs || [])
        .filter(po => po.linkedContractId === linkedContractId && po.poId !== poId && po.effectiveStatus !== 'Cancelled')
        .reduce((s, po) => s + (Number(po.orderedQty) || 0), 0);
      const remBefore = ct.totalContractQty - otherOrd;
      const remAfter = remBefore - orderedQty;

      const warnings = [];
      if (remAfter < 0 && manualStatus !== 'Cancelled') {
        warnings.push(`• Ordered quantity (${orderedQty}) exceeds remaining contract quantity (${remBefore}) by ${orderedQty - remBefore} (Remaining after lot: ${remAfter}).`);
      }
      if (ct.contractEndDate && poIssueDate > ct.contractEndDate && manualStatus !== 'Cancelled') {
        warnings.push(`• PO Issue Date (${poIssueDate}) is after Contract End Date (${ct.contractEndDate}).`);
      }

      if (warnings.length > 0) {
        if (!confirm(`Contract PO Warning:\n\n${warnings.join('\n')}\n\nDo you want to proceed?`)) {
          return;
        }
      }

      const payload = {
        poId,
        linkedContractId,
        poIssueDate,
        unitPrice,
        orderedQty,
        manualStatus,
        remarks
      };

      closeModal();
      setSyncIndicator(true);
      const action = poId ? 'editContractPO' : 'submitContractPO';

      if (isApiConfigured()) {
        callApi(action, payload)
          .then(() => {
            setSyncIndicator(false);
            showToast(poId ? 'Contract PO updated!' : 'Contract PO created!');
            fetchDataFromServer();
          })
          .catch(err => {
            setSyncIndicator(false);
            showToast('Failed: ' + (err.message || err));
          });
      } else {
        setSyncIndicator(false);
        if (poId) {
          const idx = state.contractPOs.findIndex(x => x.poId === poId);
          if (idx !== -1) Object.assign(state.contractPOs[idx], payload);
        } else {
          payload.poId = generateClientProcurementId('PO');
          state.contractPOs.unshift(payload);
        }
        recalculateProcurementState();
        renderProcurementTab();
        showToast(poId ? 'Contract PO updated (Mock)' : 'Contract PO created (Mock)');
      }
    }

    function handleDeleteContractPO(poId) {
      const linkedRecs = (state.receivings || []).filter(r => r.sourceType === 'Contract PO' && r.sourceRecordId === poId && r.effectiveStatus !== 'Cancelled');
      if (linkedRecs.length > 0) {
        showToast(`Cannot delete Contract PO because Receiving (${linkedRecs[0].receivingId}) is linked to it.`);
        return;
      }
      requireDeletePasscode(`Delete Contract PO "${poId}"?`, () => {
        setSyncIndicator(true);
        if (isApiConfigured()) {
          callApi('deleteContractPO', { poId })
            .then(() => {
              setSyncIndicator(false);
              showToast('Contract PO deleted');
              fetchDataFromServer();
            })
            .catch(err => {
              setSyncIndicator(false);
              showToast('Failed: ' + (err.message || err));
            });
        } else {
          setSyncIndicator(false);
          state.contractPOs = (state.contractPOs || []).filter(x => x.poId !== poId);
          recalculateProcurementState();
          renderProcurementTab();
          showToast('Contract PO deleted (Mock)');
        }
      });
    }

    // ── 4. Specific-Method Purchase Modal Functions ──
    function openSpecificPurchaseModal(spId) {
      recalculateProcurementState();
      const id = String(spId || '').trim();
      const existing = id ? (state.specificPurchases || []).find(x => x.spId === id) : null;
      const todayStr = getToday();

      document.getElementById('sp-modal-id').value = existing ? existing.spId : '';
      document.getElementById('sp-modal-title').textContent = existing ? `Edit Specific Purchase (${existing.spId})` : 'Add Specific-Method Purchase';
      document.getElementById('sp-item-picker-input').value = '';
      document.getElementById('sp-item-picker-results').classList.add('hidden');

      document.getElementById('sp-modal-date').value = existing ? (existing.poIssueDate || todayStr) : todayStr;
      document.getElementById('sp-modal-fy').value = existing ? existing.fiscalYear : deriveFiscalYearClient(todayStr);
      document.getElementById('sp-modal-status').value = existing && existing.manualStatus === 'Cancelled' ? 'Cancelled' : '';
      document.getElementById('sp-modal-hoid').value = existing ? (existing.hoItemId || '') : '';
      document.getElementById('sp-modal-device').value = existing ? (existing.deviceName || '') : '';
      document.getElementById('sp-modal-company').value = existing ? (existing.company || '') : '';
      document.getElementById('sp-modal-price').value = existing ? existing.unitPrice : '';
      document.getElementById('sp-modal-budget-qty').value = existing ? existing.budgetPlanQty : '';
      document.getElementById('sp-modal-ordered-qty').value = existing ? existing.orderedQty : '';
      document.getElementById('sp-modal-remarks').value = existing ? (existing.remarks || '') : '';

      updateSpecificPurchaseModalCalc();
      openModal('modal-specific-purchase');
    }

    function onSpecificPurchaseDateChange(dateStr) {
      const fyEl = document.getElementById('sp-modal-fy');
      if (fyEl && dateStr) {
        fyEl.value = deriveFiscalYearClient(dateStr);
      }
      updateSpecificPurchaseModalCalc();
    }

    function updateSpecificPurchaseModalCalc() {
      const editingSpId = document.getElementById('sp-modal-id').value.trim();
      const fy = String(document.getElementById('sp-modal-fy')?.value || '').trim();
      const hoId = String(document.getElementById('sp-modal-hoid')?.value || '').trim();
      const dev = String(document.getElementById('sp-modal-device')?.value || '').trim();
      const price = Number(document.getElementById('sp-modal-price')?.value) || 0;
      const budgetQty = Number(document.getElementById('sp-modal-budget-qty')?.value) || 0;
      const ordQty = Number(document.getElementById('sp-modal-ordered-qty')?.value) || 0;

      const budgetValEl = document.getElementById('sp-modal-budget-val');
      const ordValEl = document.getElementById('sp-modal-order-val');
      const remEl = document.getElementById('sp-modal-remaining');
      const warnEl = document.getElementById('sp-modal-neg-warning');

      if (budgetValEl) budgetValEl.value = formatProcMoney(price * budgetQty);
      if (ordValEl) ordValEl.value = formatProcMoney(price * ordQty);

      const targetKey = (hoId || dev).toLowerCase();
      const otherOrd = targetKey
        ? (state.specificPurchases || [])
            .filter(sp => sp.spId !== editingSpId && sp.effectiveStatus !== 'Cancelled' && String(sp.fiscalYear) === fy && String(sp.hoItemId || sp.deviceName || '').trim().toLowerCase() === targetKey)
            .reduce((s, sp) => s + (Number(sp.orderedQty) || 0), 0)
        : 0;

      const totalOrdAfter = otherOrd + ordQty;
      const remAfter = budgetQty - totalOrdAfter;

      if (remEl) {
        remEl.value = `${remAfter.toLocaleString()} (Prior FY Ord: ${otherOrd.toLocaleString()})`;
        remEl.style.color = remAfter < 0 ? 'var(--red)' : 'var(--gray-900)';
      }

      if (warnEl) {
        if (ordQty > 0 && remAfter < 0) {
          warnEl.textContent = `Warning: Total ordered quantity (${totalOrdAfter}) for this item in FY ${fy} exceeds Budget Plan Quantity (${budgetQty}), resulting in a negative balance (${remAfter}). Confirmation will be required on save.`;
          warnEl.classList.remove('hidden');
        } else {
          warnEl.classList.add('hidden');
        }
      }
    }

    function saveSpecificPurchaseModal() {
      const spId = document.getElementById('sp-modal-id').value.trim();
      const poIssueDate = document.getElementById('sp-modal-date').value || getToday();
      const fiscalYear = document.getElementById('sp-modal-fy').value.trim() || deriveFiscalYearClient(poIssueDate);
      const manualStatus = document.getElementById('sp-modal-status').value;
      const hoItemId = document.getElementById('sp-modal-hoid').value.trim();
      const deviceName = document.getElementById('sp-modal-device').value.trim();
      const company = document.getElementById('sp-modal-company').value.trim();
      const unitPrice = Number(document.getElementById('sp-modal-price').value) || 0;
      const budgetPlanQty = Number(document.getElementById('sp-modal-budget-qty').value) || 0;
      const orderedQty = Number(document.getElementById('sp-modal-ordered-qty').value) || 0;
      const remarks = document.getElementById('sp-modal-remarks').value.trim();

      if (!deviceName) { showToast('Device Name is required'); return; }
      if (orderedQty <= 0) { showToast('Ordered Quantity must be greater than 0'); return; }

      if (spId && manualStatus === 'Cancelled') {
        const existingSp = (state.specificPurchases || []).find(x => x.spId === spId);
        if (existingSp && existingSp.receivingStatus === 'Completed') {
          showToast(`Cannot cancel this Specific Purchase because its Receiving (${existingSp.linkedReceivingId}) is already Completed.`);
          return;
        }
      }

      const targetKey = (hoItemId || deviceName).toLowerCase();
      const otherOrd = (state.specificPurchases || [])
        .filter(sp => sp.spId !== spId && sp.effectiveStatus !== 'Cancelled' && String(sp.fiscalYear) === fiscalYear && String(sp.hoItemId || sp.deviceName || '').trim().toLowerCase() === targetKey)
        .reduce((s, sp) => s + (Number(sp.orderedQty) || 0), 0);

      const totalOrdAfter = otherOrd + orderedQty;
      const remAfter = budgetPlanQty - totalOrdAfter;

      if (remAfter < 0 && manualStatus !== 'Cancelled') {
        if (!confirm(`Warning: Total ordered quantity (${totalOrdAfter}) for "${deviceName}" in FY ${fiscalYear} exceeds the Budget Plan Quantity (${budgetPlanQty}), resulting in a negative remaining balance (${remAfter}).\n\nDo you want to proceed?`)) {
          return;
        }
      }

      const payload = {
        spId,
        poIssueDate,
        fiscalYear,
        hoItemId,
        deviceName,
        unitPrice,
        company,
        budgetPlanQty,
        orderedQty,
        manualStatus,
        remarks
      };

      closeModal();
      setSyncIndicator(true);
      const action = spId ? 'editSpecificPurchase' : 'submitSpecificPurchase';

      if (isApiConfigured()) {
        callApi(action, payload)
          .then(() => {
            setSyncIndicator(false);
            showToast(spId ? 'Specific Purchase updated!' : 'Specific Purchase created!');
            fetchDataFromServer();
          })
          .catch(err => {
            setSyncIndicator(false);
            showToast('Failed: ' + (err.message || err));
          });
      } else {
        setSyncIndicator(false);
        if (spId) {
          const idx = state.specificPurchases.findIndex(x => x.spId === spId);
          if (idx !== -1) Object.assign(state.specificPurchases[idx], payload);
        } else {
          payload.spId = generateClientProcurementId('SP');
          state.specificPurchases.unshift(payload);
        }
        recalculateProcurementState();
        renderProcurementTab();
        showToast(spId ? 'Specific Purchase updated (Mock)' : 'Specific Purchase created (Mock)');
      }
    }

    function handleDeleteSpecificPurchase(spId) {
      const linkedRecs = (state.receivings || []).filter(r => r.sourceType === 'Specific Purchase' && r.sourceRecordId === spId && r.effectiveStatus !== 'Cancelled');
      if (linkedRecs.length > 0) {
        showToast(`Cannot delete Specific Purchase because Receiving (${linkedRecs[0].receivingId}) is linked to it.`);
        return;
      }
      requireDeletePasscode(`Delete Specific Purchase "${spId}"?`, () => {
        setSyncIndicator(true);
        if (isApiConfigured()) {
          callApi('deleteSpecificPurchase', { spId })
            .then(() => {
              setSyncIndicator(false);
              showToast('Specific Purchase deleted');
              fetchDataFromServer();
            })
            .catch(err => {
              setSyncIndicator(false);
              showToast('Failed: ' + (err.message || err));
            });
        } else {
          setSyncIndicator(false);
          state.specificPurchases = (state.specificPurchases || []).filter(x => x.spId !== spId);
          recalculateProcurementState();
          renderProcurementTab();
          showToast('Specific Purchase deleted (Mock)');
        }
      });
    }

    // ── 5. Goods Receiving & Item ID Allocation Modal Functions ──
    function openReceivingModal(receivingId, prefillSourceType, prefillSourceId) {
      recalculateProcurementState();
      const id = String(receivingId || '').trim();
      const existing = id ? (state.receivings || []).find(x => x.receivingId === id) : null;
      const isLocked = !!(existing && (existing.effectiveStatus === 'Completed' || existing.stockInTxnId));

      document.getElementById('rc-modal-id').value = existing ? existing.receivingId : '';
      document.getElementById('rc-modal-title').textContent = existing
        ? (isLocked ? `Goods Receiving (${existing.receivingId}) — Completed` : `Edit / Complete Goods Receiving (${existing.receivingId})`)
        : 'Record Goods Receiving & Stock-In Allocation';

      const lockedBanner = document.getElementById('rc-locked-banner');
      if (lockedBanner) {
        if (isLocked) {
          lockedBanner.innerHTML = `<strong>✓ Completed &amp; Locked:</strong> Stock-In Transaction <span class="mono font-semibold">${escHtml(existing.stockInTxnId)}</span> has been posted to <b>Main Stock</b>. To adjust quantities, use the Inventory Adjustment form.`;
          lockedBanner.classList.remove('hidden');
        } else {
          lockedBanner.classList.add('hidden');
        }
      }

      const srcTypeEl = document.getElementById('rc-modal-source-type');
      const srcIdEl = document.getElementById('rc-modal-source-id');
      const dateEl = document.getElementById('rc-modal-date');
      const compEl = document.getElementById('rc-modal-company');
      const qtyEl = document.getElementById('rc-modal-qty');
      const priceEl = document.getElementById('rc-modal-price');
      const statusEl = document.getElementById('rc-modal-status');
      const remarksEl = document.getElementById('rc-modal-remarks');
      const addBarEl = document.getElementById('rc-alloc-add-bar');
      const btnDraft = document.getElementById('btn-rc-save-draft');
      const btnComplete = document.getElementById('btn-rc-complete');

      const srcType = existing ? existing.sourceType : (prefillSourceType || 'Contract PO');
      const srcId = existing ? existing.sourceRecordId : (prefillSourceId || '');
      srcTypeEl.value = srcType;
      srcTypeEl.disabled = !!existing;
      srcIdEl.disabled = !!existing;

      onReceivingSourceTypeChange(srcType, srcId, existing ? existing.receivingId : '');

      dateEl.value = existing ? (existing.receivingDate || getToday()) : getToday();
      dateEl.disabled = isLocked;
      compEl.disabled = isLocked;
      qtyEl.disabled = isLocked;
      priceEl.disabled = isLocked;
      statusEl.disabled = isLocked;
      remarksEl.disabled = isLocked;
      if (addBarEl) addBarEl.classList.toggle('hidden', isLocked);
      if (btnDraft) btnDraft.classList.toggle('hidden', isLocked);
      if (btnComplete) btnComplete.classList.toggle('hidden', isLocked);

      if (existing) {
        document.getElementById('rc-modal-hoid').value = existing.hoItemId || '';
        document.getElementById('rc-modal-device').value = existing.deviceName || '';
        compEl.value = existing.company || '';
        document.getElementById('rc-modal-source-qty').value = existing.sourceOrderedQty || existing.quantity || 0;
        qtyEl.value = existing.quantity || 0;
        priceEl.value = existing.unitPrice || 0;
        statusEl.value = existing.manualStatus === 'Cancelled' ? 'Cancelled' : '';
        remarksEl.value = existing.remarks || '';
        state.receivingDraftAllocations = buildInitialReceivingAllocations(
          existing.hoItemId,
          existing.deviceName,
          existing.quantity,
          existing.allocations
        );
        updateReceivingModalCalc();
        renderReceivingAllocationRows(isLocked);
      } else {
        statusEl.value = '';
        remarksEl.value = '';
        onReceivingSourceIdChange(srcId);
      }

      openModal('modal-receiving');
    }

    function onReceivingSourceTypeChange(sourceType, keepSourceId, editingReceivingId) {
      const srcIdEl = document.getElementById('rc-modal-source-id');
      if (!srcIdEl) return;
      const editRecId = editingReceivingId || document.getElementById('rc-modal-id')?.value || '';

      // Find source IDs that already have a non-cancelled Receiving record (excluding the one being edited)
      const takenSourceIds = new Set(
        (state.receivings || [])
          .filter(r => r.sourceType === sourceType && r.effectiveStatus !== 'Cancelled' && r.receivingId !== editRecId)
          .map(r => r.sourceRecordId)
      );

      let optionsHtml = `<option value="">-- Select Order --</option>`;
      if (sourceType === 'Contract PO') {
        const list = (state.contractPOs || []).filter(po => po.effectiveStatus !== 'Cancelled' && (!takenSourceIds.has(po.poId) || po.poId === keepSourceId));
        optionsHtml += list.map(po => `<option value="${escHtml(po.poId)}"${po.poId === keepSourceId ? ' selected' : ''}>${escHtml(po.poId)} (${escHtml(po.contractNumber)}) — ${escHtml(po.deviceName)} [Qty: ${po.orderedQty}]</option>`).join('');
      } else {
        const list = (state.specificPurchases || []).filter(sp => sp.effectiveStatus !== 'Cancelled' && (!takenSourceIds.has(sp.spId) || sp.spId === keepSourceId));
        optionsHtml += list.map(sp => `<option value="${escHtml(sp.spId)}"${sp.spId === keepSourceId ? ' selected' : ''}>${escHtml(sp.spId)} [FY ${escHtml(sp.fiscalYear)}] — ${escHtml(sp.deviceName)} [Qty: ${sp.orderedQty}]</option>`).join('');
      }
      srcIdEl.innerHTML = optionsHtml;

      if (!editRecId) {
        onReceivingSourceIdChange(keepSourceId || '');
      }
    }

    function onReceivingSourceIdChange(sourceId) {
      const sourceType = document.getElementById('rc-modal-source-type')?.value || 'Contract PO';
      const id = String(sourceId || '').trim();
      let src = null;
      if (sourceType === 'Contract PO') {
        src = (state.contractPOs || []).find(x => x.poId === id);
      } else {
        src = (state.specificPurchases || []).find(x => x.spId === id);
      }

      document.getElementById('rc-modal-hoid').value = src ? (src.hoItemId || '') : '';
      document.getElementById('rc-modal-device').value = src ? (src.deviceName || '') : '';
      document.getElementById('rc-modal-company').value = src ? (src.company || '') : '';
      document.getElementById('rc-modal-source-qty').value = src ? (src.orderedQty || 0) : 0;
      document.getElementById('rc-modal-qty').value = src ? (src.orderedQty || '') : '';
      document.getElementById('rc-modal-price').value = src ? (src.unitPrice || 0) : '';

      if (src) {
        state.receivingDraftAllocations = buildInitialReceivingAllocations(
          src.hoItemId,
          src.deviceName,
          src.orderedQty,
          []
        );
      } else {
        state.receivingDraftAllocations = [];
      }

      updateReceivingModalCalc();
      renderReceivingAllocationRows(false);
    }

    function buildInitialReceivingAllocations(hoItemId, deviceName, targetQty, existingAllocs) {
      const cleanHo = String(hoItemId || '').trim();
      const cleanDev = String(deviceName || '').trim().toLowerCase();
      const parentIdsMatchingHo = new Set(
        (state.inventory || [])
          .filter(i => i.isParent && cleanHo && String(i.hoItemId || '').trim() === cleanHo)
          .map(i => String(i.itemId))
      );

      // Candidate non-parent inventory items matching HO Item ID (directly or via Parent Group)
      let candidates = (state.inventory || []).filter(i => {
        if (i.isParent) return false;
        if (cleanHo) {
          if (String(i.hoItemId || '').trim() === cleanHo) return true;
          if (i.parentId && parentIdsMatchingHo.has(String(i.parentId))) return true;
          return false;
        }
        return cleanDev && String(i.deviceName || '').trim().toLowerCase() === cleanDev;
      });

      const allocMap = {};
      const rows = [];

      if (Array.isArray(existingAllocs) && existingAllocs.length > 0) {
        existingAllocs.forEach(a => {
          if (!a || !a.itemId) return;
          allocMap[String(a.itemId)] = Number(a.quantity) || 0;
        });
      }

      candidates.forEach(c => {
        const id = String(c.itemId);
        const q = allocMap[id] !== undefined ? allocMap[id] : 0;
        rows.push({
          itemId: id,
          deviceName: c.deviceName || id,
          hoItemId: c.hoItemId || cleanHo,
          quantity: q,
          isMatchedCandidate: true
        });
        delete allocMap[id];
      });

      // Also include any manually added items from existingAllocs
      Object.keys(allocMap).forEach(id => {
        const inv = (state.inventory || []).find(i => String(i.itemId) === id);
        rows.push({
          itemId: id,
          deviceName: inv ? inv.deviceName : id,
          hoItemId: inv ? (inv.hoItemId || '') : '',
          quantity: allocMap[id],
          isMatchedCandidate: false
        });
      });

      // If there is exactly 1 candidate and no existing allocations, auto-fill full targetQty
      if (rows.length === 1 && (!existingAllocs || existingAllocs.length === 0)) {
        rows[0].quantity = Number(targetQty) || 0;
      }

      return rows;
    }

    function renderReceivingAllocationRows(isLocked) {
      const container = document.getElementById('rc-alloc-rows-container');
      if (!container) return;
      const rows = state.receivingDraftAllocations || [];

      if (rows.length === 0) {
        container.innerHTML = `<div class="text-xs text-gray">No matching Inventory Item IDs found automatically. Use the search box below to select child/standalone Inventory items for Stock-In.</div>`;
        updateReceivingAllocBadge();
        return;
      }

      container.innerHTML = rows.map((r, idx) => {
        const inv = (state.inventory || []).find(i => String(i.itemId) === String(r.itemId));
        const curMain = inv ? (Number(inv.mainStock) || 0) : 0;
        return `
          <div class="rc-alloc-row">
            <div class="rc-alloc-item-info">
              <div class="rc-alloc-item-title">${escHtml(r.deviceName)}</div>
              <div class="rc-alloc-item-meta">Item ID: <span class="mono font-semibold">${escHtml(r.itemId)}</span> | HO ID: <span class="mono">${escHtml(r.hoItemId || '-')}</span> | Current Main Stock: <b>${curMain}</b></div>
            </div>
            <div class="flex items-center gap-2">
              <label class="text-xs font-semibold text-gray-dark">Alloc Qty:</label>
              <input type="number" class="form-input form-input-sm" style="width:95px; text-align:center; font-weight:700;" min="0" value="${Number(r.quantity) || 0}" ${isLocked ? 'disabled' : ''} oninput="onReceivingAllocQtyChange(${idx}, this.value)">
              ${!isLocked ? `<button type="button" class="btn btn-ghost-danger btn-xs" title="Remove item" onclick="removeReceivingAllocRow(${idx})">✕</button>` : ''}
            </div>
          </div>
        `;
      }).join('');

      updateReceivingAllocBadge();
    }

    function onReceivingAllocQtyChange(idx, val) {
      if (!state.receivingDraftAllocations || !state.receivingDraftAllocations[idx]) return;
      state.receivingDraftAllocations[idx].quantity = Math.max(0, Number(val) || 0);
      updateReceivingAllocBadge();
    }

    function removeReceivingAllocRow(idx) {
      if (!state.receivingDraftAllocations) return;
      state.receivingDraftAllocations.splice(idx, 1);
      renderReceivingAllocationRows(false);
    }

    function updateReceivingAllocBadge() {
      const badge = document.getElementById('rc-alloc-sum-badge');
      if (!badge) return;
      const targetQty = Number(document.getElementById('rc-modal-qty')?.value) || 0;
      const allocSum = (state.receivingDraftAllocations || []).reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      badge.textContent = `Allocated: ${allocSum} / ${targetQty}`;
      if (targetQty > 0 && allocSum === targetQty) {
        badge.style.background = '#d1fae5';
        badge.style.color = '#065f46';
      } else {
        badge.style.background = '#fef3c7';
        badge.style.color = '#92400e';
      }
    }

    function filterReceivingManualAllocSearch(query) {
      const resEl = document.getElementById('rc-alloc-search-results');
      if (!resEl) return;
      const q = String(query || '').trim().toLowerCase();
      if (!q) {
        resEl.classList.add('hidden');
        return;
      }
      const existingIds = new Set((state.receivingDraftAllocations || []).map(r => String(r.itemId)));
      const matches = (state.inventory || []).filter(i => {
        if (i.isParent) return false;
        if (existingIds.has(String(i.itemId))) return false;
        const hay = `${i.deviceName || ''} ${i.itemId || ''} ${i.hoItemId || ''}`.toLowerCase();
        return hay.includes(q);
      }).slice(0, 10);

      if (matches.length === 0) {
        resEl.innerHTML = `<div class="search-item text-xs text-gray">No other non-parent Inventory items match</div>`;
        resEl.classList.remove('hidden');
        return;
      }

      resEl.innerHTML = matches.map(i => `
        <div class="search-item" onclick="addReceivingManualAllocItem('${escHtml(i.itemId)}')">
          <div>
            <div class="font-semibold text-sm">${escHtml(i.deviceName)}</div>
            <div class="text-xs text-gray">Item ID: <span class="mono">${escHtml(i.itemId)}</span> | HO ID: <span class="mono">${escHtml(i.hoItemId || '-')}</span></div>
          </div>
          <span class="btn btn-outline btn-xs">+ Add</span>
        </div>
      `).join('');
      resEl.classList.remove('hidden');
    }

    function addReceivingManualAllocItem(itemId) {
      const resEl = document.getElementById('rc-alloc-search-results');
      if (resEl) resEl.classList.add('hidden');
      const inpEl = document.getElementById('rc-alloc-search-input');
      if (inpEl) inpEl.value = '';

      const inv = (state.inventory || []).find(i => String(i.itemId) === String(itemId));
      if (!inv || inv.isParent) return;
      if (!Array.isArray(state.receivingDraftAllocations)) state.receivingDraftAllocations = [];
      if (state.receivingDraftAllocations.some(r => String(r.itemId) === String(itemId))) return;

      const targetQty = Number(document.getElementById('rc-modal-qty')?.value) || 0;
      const curSum = state.receivingDraftAllocations.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      const rem = Math.max(0, targetQty - curSum);

      state.receivingDraftAllocations.push({
        itemId: String(inv.itemId),
        deviceName: inv.deviceName,
        hoItemId: inv.hoItemId || '',
        quantity: rem,
        isMatchedCandidate: false
      });
      renderReceivingAllocationRows(false);
    }

    function updateReceivingModalCalc() {
      const srcQty = Number(document.getElementById('rc-modal-source-qty')?.value) || 0;
      const qty = Number(document.getElementById('rc-modal-qty')?.value) || 0;
      const price = Number(document.getElementById('rc-modal-price')?.value) || 0;
      const valEl = document.getElementById('rc-modal-value');
      const warnEl = document.getElementById('rc-qty-mismatch-warn');

      if (valEl) valEl.value = formatProcMoney(qty * price);

      // If single allocation row and user changes receiving qty, keep it synced if it matched before
      if (state.receivingDraftAllocations && state.receivingDraftAllocations.length === 1) {
        state.receivingDraftAllocations[0].quantity = qty;
        renderReceivingAllocationRows(false);
      } else {
        updateReceivingAllocBadge();
      }

      if (warnEl) {
        if (srcQty > 0 && qty > 0 && qty !== srcQty) {
          warnEl.textContent = `Notice: Quantity on Receiving Document (${qty}) differs from Source Ordered Quantity (${srcQty}). Confirmation will be requested before saving.`;
          warnEl.classList.remove('hidden');
        } else {
          warnEl.classList.add('hidden');
        }
      }
    }

    function saveReceivingModal(doComplete) {
      const receivingId = document.getElementById('rc-modal-id').value.trim();
      const sourceType = document.getElementById('rc-modal-source-type').value;
      const sourceRecordId = document.getElementById('rc-modal-source-id').value.trim();
      const receivingDate = document.getElementById('rc-modal-date').value || getToday();
      const hoItemId = document.getElementById('rc-modal-hoid').value.trim();
      const deviceName = document.getElementById('rc-modal-device').value.trim();
      const company = document.getElementById('rc-modal-company').value.trim();
      const sourceOrderedQty = Number(document.getElementById('rc-modal-source-qty').value) || 0;
      const quantity = Number(document.getElementById('rc-modal-qty').value) || 0;
      const unitPrice = Number(document.getElementById('rc-modal-price').value) || 0;
      const manualStatus = document.getElementById('rc-modal-status').value;
      const remarks = document.getElementById('rc-modal-remarks').value.trim();

      if (!sourceRecordId) { showToast('Please select a Source Order'); return; }
      if (quantity <= 0) { showToast('Quantity on Receiving Document must be greater than 0'); return; }

      // Rule 5: One receipt per order check
      const duplicateReceipt = (state.receivings || []).find(
        r => r.sourceType === sourceType && r.sourceRecordId === sourceRecordId && r.effectiveStatus !== 'Cancelled' && r.receivingId !== receivingId
      );
      if (duplicateReceipt) {
        showToast(`Order ${sourceRecordId} already has an active Receiving record (${duplicateReceipt.receivingId}). Only one receipt per order is allowed.`);
        return;
      }

      const allocations = (state.receivingDraftAllocations || [])
        .filter(a => a && a.itemId && Number(a.quantity) > 0)
        .map(a => ({ itemId: String(a.itemId), quantity: Number(a.quantity) }));

      if (doComplete) {
        if (manualStatus === 'Cancelled') {
          showToast('Cannot Complete & Post Stock-In while Manual Status is set to Cancelled.');
          return;
        }
        const allocSum = allocations.reduce((s, a) => s + a.quantity, 0);
        if (allocations.length === 0 || Math.abs(allocSum - quantity) > 1e-6) {
          showToast(`Item ID Allocations (${allocSum}) must sum exactly to Receiving Quantity (${quantity}) before completing.`);
          return;
        }
      }

      if (sourceOrderedQty > 0 && quantity !== sourceOrderedQty) {
        if (!confirm(`Warning: Quantity on Receiving Document (${quantity}) differs from Source Ordered Quantity (${sourceOrderedQty}).\n\nDo you want to proceed?`)) {
          return;
        }
      }

      if (doComplete) {
        const summaryLines = allocations.map(a => {
          const inv = (state.inventory || []).find(i => String(i.itemId) === String(a.itemId));
          const name = inv ? inv.deviceName : a.itemId;
          return `• ${name} (Item ID: ${a.itemId})  →  +${a.quantity} to Main Stock`;
        }).join('\n');

        if (!confirm(`Confirm Complete Goods Receiving & Post Stock-In:\n\nSource: ${sourceType} (${sourceRecordId})\nReceiving Date: ${receivingDate}\n\nStock to be added to Main Store:\n${summaryLines}\n\nOnce completed, this receipt will be locked. Proceed?`)) {
          return;
        }
      }

      const payload = {
        receivingId,
        sourceType,
        sourceRecordId,
        receivingDate,
        hoItemId,
        deviceName,
        company,
        quantity,
        unitPrice,
        allocations,
        manualStatus: doComplete ? '' : manualStatus,
        remarks
      };

      closeModal();
      setSyncIndicator(true);

      if (isApiConfigured()) {
        if (doComplete) {
          if (receivingId) {
            callApi('completeReceiving', { receivingId, allocations, payload })
              .then(res => {
                setSyncIndicator(false);
                showToast(`Receiving Completed! Stock-In posted (${res.stockInTxnId || 'OK'})`);
                fetchDataFromServer();
              })
              .catch(err => {
                setSyncIndicator(false);
                showToast('Failed: ' + (err.message || err));
              });
          } else {
            callApi('addReceiving', payload)
              .then(addRes => {
                const newRecId = addRes.receivingId;
                return callApi('completeReceiving', { receivingId: newRecId, allocations, payload });
              })
              .then(compRes => {
                setSyncIndicator(false);
                showToast(`Receiving Created & Completed! Stock-In posted (${compRes.stockInTxnId || 'OK'})`);
                fetchDataFromServer();
              })
              .catch(err => {
                setSyncIndicator(false);
                showToast('Failed: ' + (err.message || err));
                fetchDataFromServer();
              });
          }
        } else {
          const action = receivingId ? 'editReceiving' : 'addReceiving';
          callApi(action, payload)
            .then(() => {
              setSyncIndicator(false);
              showToast(receivingId ? 'Receiving updated!' : 'Receiving saved (Awaiting Delivery)!');
              fetchDataFromServer();
            })
            .catch(err => {
              setSyncIndicator(false);
              showToast('Failed: ' + (err.message || err));
            });
        }
      } else {
        // Offline Mock Mode
        setSyncIndicator(false);
        let targetRec = null;
        if (receivingId) {
          const idx = state.receivings.findIndex(x => x.receivingId === receivingId);
          if (idx !== -1) {
            Object.assign(state.receivings[idx], payload);
            targetRec = state.receivings[idx];
          }
        } else {
          payload.receivingId = generateClientProcurementId('RC');
          payload.stockInTxnId = '';
          state.receivings.unshift(payload);
          targetRec = payload;
        }

        if (doComplete && targetRec) {
          const txnId = generateClientProcurementId('RCV');
          targetRec.stockInTxnId = txnId;
          targetRec.manualStatus = '';
          allocations.forEach(a => {
            state.transactions.unshift({
              id: txnId,
              date: receivingDate,
              type: 'Stock In',
              hn: '',
              itemId: a.itemId,
              qty: a.quantity,
              fromLoc: '',
              toLoc: 'Main',
              disease: '',
              procedure: '',
              shift: '',
              tech: '',
              complication: 'Receiving: ' + targetRec.receivingId,
              contrast: ''
            });
            const inv = (state.inventory || []).find(i => String(i.itemId) === String(a.itemId));
            if (inv) {
              inv.mainStock = (Number(inv.mainStock) || 0) + a.quantity;
              inv.totalStock = inv.mainStock + (Number(inv.retailStock) || 0);
              inv.stockDiff = inv.totalStock - (Number(inv.hoStock) || 0);
            }
          });
          recalculateInventoryHierarchy();
          showToast(`Receiving Completed & Stock-In Posted (${txnId}) (Mock)`);
        } else {
          showToast(receivingId ? 'Receiving updated (Mock)' : 'Receiving saved (Mock)');
        }

        recalculateProcurementState();
        renderProcurementTab();
      }
    }

    function handleDeleteReceiving(receivingId) {
      const existing = (state.receivings || []).find(x => x.receivingId === receivingId);
      if (existing && (existing.effectiveStatus === 'Completed' || existing.stockInTxnId)) {
        showToast('Completed Receiving records are locked and cannot be deleted. Use Inventory Adjustment instead.');
        return;
      }
      requireDeletePasscode(`Delete Goods Receiving "${receivingId}"?`, () => {
        setSyncIndicator(true);
        if (isApiConfigured()) {
          callApi('deleteReceiving', { receivingId })
            .then(() => {
              setSyncIndicator(false);
              showToast('Receiving deleted');
              fetchDataFromServer();
            })
            .catch(err => {
              setSyncIndicator(false);
              showToast('Failed: ' + (err.message || err));
            });
        } else {
          setSyncIndicator(false);
          state.receivings = (state.receivings || []).filter(x => x.receivingId !== receivingId);
          recalculateProcurementState();
          renderProcurementTab();
          showToast('Receiving deleted (Mock)');
        }
      });
    }

    // ── 6. Unified Cancel Action with Rule 0.6 Integrity Checks ──
    function handleCancelProcurementRecord(entity, id, label) {
      recalculateProcurementState();
      const ent = String(entity || '').toLowerCase();

      if (ent === 'ebidding') {
        const eb = (state.ebiddings || []).find(x => x.ebiddingId === id);
        if (eb && eb.linkedContractIds && eb.linkedContractIds.length > 0) {
          showToast(`Cannot cancel E-Bidding while a non-cancelled Contract (${eb.linkedContractIds.join(', ')}) is linked to it.`);
          return;
        }
      } else if (ent === 'contract') {
        const activeLots = (state.contractPOs || []).filter(po => po.linkedContractId === id && po.effectiveStatus !== 'Cancelled');
        if (activeLots.length > 0) {
          showToast(`A Contract cannot be cancelled while it has non-cancelled PO lots (${activeLots.map(l => l.poId).join(', ')}).`);
          return;
        }
      } else if (ent === 'contract_po') {
        const po = (state.contractPOs || []).find(x => x.poId === id);
        if (po && po.receivingStatus === 'Completed') {
          showToast(`A Contract PO cannot be cancelled once its Receiving (${po.linkedReceivingId}) is Completed.`);
          return;
        }
      } else if (ent === 'specific_purchase') {
        const sp = (state.specificPurchases || []).find(x => x.spId === id);
        if (sp && sp.receivingStatus === 'Completed') {
          showToast(`A Specific Purchase cannot be cancelled once its Receiving (${sp.linkedReceivingId}) is Completed.`);
          return;
        }
      } else if (ent === 'receiving') {
        const rec = (state.receivings || []).find(x => x.receivingId === id);
        if (rec && (rec.effectiveStatus === 'Completed' || rec.stockInTxnId)) {
          showToast('A Completed Receiving cannot be cancelled. Use the Inventory Adjustment form instead.');
          return;
        }
      }

      if (!confirm(`Mark ${entity.toUpperCase()} record "${label || id}" as Cancelled?\n\nCancelled records are excluded from all quantity and value calculations.`)) {
        return;
      }

      setSyncIndicator(true);
      if (isApiConfigured()) {
        callApi('cancelRecord', { entity: ent, id })
          .then(() => {
            setSyncIndicator(false);
            showToast('Record marked as Cancelled');
            fetchDataFromServer();
          })
          .catch(err => {
            setSyncIndicator(false);
            showToast('Failed: ' + (err.message || err));
          });
      } else {
        setSyncIndicator(false);
        if (ent === 'ebidding') {
          const r = (state.ebiddings || []).find(x => x.ebiddingId === id);
          if (r) r.manualStatus = 'Cancelled';
        } else if (ent === 'contract') {
          const r = (state.contracts || []).find(x => x.contractId === id);
          if (r) r.manualStatus = 'Cancelled';
        } else if (ent === 'contract_po') {
          const r = (state.contractPOs || []).find(x => x.poId === id);
          if (r) r.manualStatus = 'Cancelled';
        } else if (ent === 'specific_purchase') {
          const r = (state.specificPurchases || []).find(x => x.spId === id);
          if (r) r.manualStatus = 'Cancelled';
        } else if (ent === 'receiving') {
          const r = (state.receivings || []).find(x => x.receivingId === id);
          if (r) r.manualStatus = 'Cancelled';
        }
        recalculateProcurementState();
        renderProcurementTab();
        showToast('Record marked as Cancelled (Mock)');
      }
    }

    // ===== MAIN EVENT BINDINGS =====
    function safeAddListener(id, evt, fn) {
      const el = document.getElementById(id);
      if (el) el.addEventListener(evt, fn);
    }

    let _appBootstrapped = false;
    function bootstrapApp() {
      if (_appBootstrapped) return;
      _appBootstrapped = true;
      try {
        if (typeof initLanguage === 'function') initLanguage();
        initTabs();
        applyDefaultInvCols();
      } catch (err) {
        console.error('Error init tabs:', err);
      }
      fetchDataFromServer();

      try {
        // Inventory Listeners (debounced search for snappy typing)
        const invSearch = document.getElementById('inv-tab-search-input');
        if (invSearch) invSearch.addEventListener('input', debounce(renderInventoryTab, 120));
        const invCat = document.getElementById('inv-tab-cat-filter');
        if (invCat) invCat.addEventListener('change', renderInventoryTab);
        invCols.forEach(col => {
          const el = document.getElementById(col.id);
          if (el) el.addEventListener('change', renderInventoryTab);
        });

        // Transactions Filter
        safeAddListener('tx-filter-type', 'change', renderTransactions);
        safeAddListener('tx-filter-search', 'input', debounce(renderTransactions, 120));

        // Procedure Tab Events
        safeAddListener('proc-device-search', 'input', debounce(renderProcDeviceResults, 120));
        safeAddListener('proc-device-cat', 'change', renderProcDeviceResults);
        
        safeAddListener('btn-submit-procedure', 'click', () => {
          const hn = document.getElementById('proc-hn').value.trim();
          if (!hn) { showToast('Please enter patient HN'); return; }

          const selectedProcs = Array.from(document.querySelectorAll('#proc-procedures-list input[type="checkbox"]:checked')).map(cb => cb.value);
          if (selectedProcs.length === 0) {
            showToast('Please select at least one procedure type');
            return;
          }

          const isActivateOrOff = selectedProcs.some(p => {
            const lp = p.toLowerCase();
            return lp.includes('activate') || lp.includes('off case');
          });

          if (state.cart.length === 0) {
            if (!confirm(isActivateOrOff
              ? 'No devices in cart. Submit case record (Initial Activate INR Code / Off case)?'
              : 'Cart is empty. Submit procedure case record without supplies?')) {
              return;
            }
          }

          // Validate Contrast Media (both Volume (ml) and Quantity required)
          for (const ci of state.cart) {
            const inv = state.inventory.find(i => String(i.itemId) === String(ci.itemId));
            const isContrast = ci.isContrast || (inv && String(inv.category || '').toLowerCase().includes('contrast'));
            if (isContrast) {
              const vol = Number(ci.volumeMl);
              const btl = Number(ci.qty);
              if (!vol || vol <= 0) {
                showToast(`Please enter Volume (ml) for contrast media: "${ci.deviceName}"`);
                return;
              }
              if (!btl || btl <= 0) {
                showToast(`Please enter Quantity (ขวด) for contrast media: "${ci.deviceName}"`);
                return;
              }
            }
          }

          // Validate Substituted items (Piece No assignment)
          for (const ci of state.cart) {
            const exRule = getActiveExchangeRule(ci.itemId);
            if (exRule) {
              const avail = getQuotaAvailablePieces(exRule);
              if (avail.length > 0) {
                if (!ci.pieceNo || !avail.includes(Number(ci.pieceNo))) {
                  ci.pieceNo = avail[0];
                }
              } else if (!ci.pieceNo) {
                showToast(`No available quota pieces remaining for substituted item: "${ci.deviceName}"`);
                return;
              }
            }
          }

          // Format contrast media summary
          const contrastItems = state.cart.filter(c => {
            const inv = state.inventory.find(i => String(i.itemId) === String(c.itemId));
            return c.isContrast || (inv && String(inv.category || '').toLowerCase().includes('contrast'));
          });
          const contrastSummary = contrastItems.map(c => `${c.deviceName} (${c.volumeMl} ml, ${c.qty} btl)`).join(', ');

          const selectedTechs = Array.from(document.querySelectorAll('#proc-techs input[type="checkbox"]:checked')).map(cb => cb.value);

          const payload = {
            mode: 'new',
            date: document.getElementById('proc-date').value || getToday(),
            patientHN: hn,
            disease: document.getElementById('proc-disease').value,
            procedure: selectedProcs.join(', '),
            shift: document.getElementById('proc-shift').value,
            tech: selectedTechs.join(', '),
            complication: document.getElementById('proc-complications').value,
            contrast: contrastSummary,
            devices: state.cart.map(ci => ({
              itemId: ci.itemId,
              quantity: ci.qty,
              volumeMl: ci.volumeMl,
              pieceNo: ci.pieceNo
            }))
          };

          // Check negative retail stock warnings
          const warnings = [];
          state.cart.forEach(ci => {
            const inv = state.inventory.find(i => String(i.itemId) === String(ci.itemId));
            const currentRetail = inv ? inv.retailStock : 0;
            if (currentRetail - ci.qty < 0) {
              const devName = inv ? inv.deviceName : ci.itemId;
              warnings.push(`${devName}: Retail stock will drop below 0 (Current: ${currentRetail}, Need: ${ci.qty})`);
            }
          });

          function doSubmitProc() {
            setSyncIndicator(true);

            if (isApiConfigured()) {
              callApi('submitProcedureUse', payload)
                .then(() => {
                  setSyncIndicator(false);
                  showToast('Procedure logged successfully!');
                  state.cart = [];
                  document.getElementById('proc-hn').value = '';
                  document.getElementById('proc-complications').value = '';
                  document.querySelectorAll('#proc-procedures-list input[type="checkbox"]').forEach(cb => cb.checked = false);
                  updateProcCountBadge();
                  document.querySelectorAll('#proc-techs input[type="checkbox"]').forEach(cb => cb.checked = false);
                  fetchDataFromServer();
                })
                .catch(err => {
                  setSyncIndicator(false);
                  showToast('Failed: ' + (err.message || err));
                });
            } else {
              // Offline Mock Mode
              setSyncIndicator(false);
              const txGroupId = 'TXN-' + Date.now();
              if (payload.devices.length === 0) {
                state.transactions.unshift({
                  id: txGroupId,
                  date: payload.date,
                  type: 'Procedure Use',
                  hn: payload.patientHN,
                  itemId: '',
                  qty: 0,
                  fromLoc: 'Retail',
                  toLoc: '',
                  disease: payload.disease,
                  procedure: payload.procedure,
                  shift: payload.shift,
                  tech: payload.tech,
                  complication: payload.complication,
                  contrast: payload.contrast || ''
                });
              } else {
                payload.devices.forEach(d => {
                  state.transactions.unshift({
                    id: txGroupId,
                    date: payload.date,
                    type: 'Procedure Use',
                    hn: payload.patientHN,
                    itemId: d.itemId,
                    qty: d.quantity,
                    fromLoc: 'Retail',
                    toLoc: '',
                    disease: payload.disease,
                    procedure: payload.procedure,
                    shift: payload.shift,
                    tech: payload.tech,
                    complication: payload.complication,
                    contrast: payload.contrast || ''
                  });
                  const inv = state.inventory.find(i => String(i.itemId) === String(d.itemId));
                  if (inv) {
                    inv.retailStock = Math.max(0, (Number(inv.retailStock) || 0) - d.quantity);
                    inv.totalStock = (Number(inv.mainStock) || 0) + inv.retailStock;
                    inv.stockDiff = inv.totalStock - (Number(inv.hoStock) || 0);
                  }
                  // Module 2: Increment active Exchange Quota if physicalItemId matches
                  const exRule = getActiveExchangeRule(d.itemId);
                  if (exRule) {
                    if (!Array.isArray(exRule.usedPieces)) exRule.usedPieces = getQuotaUsedPieces(exRule);
                    let pNo = d.pieceNo ? Number(d.pieceNo) : null;
                    if (pNo && !isNaN(pNo)) {
                      if (!exRule.usedPieces.includes(pNo)) exRule.usedPieces.push(pNo);
                    } else {
                      for (let k = 1; k <= (Number(exRule.totalQuota) || 0); k++) {
                        if (!exRule.usedPieces.includes(k)) {
                          pNo = k;
                          exRule.usedPieces.push(k);
                          break;
                        }
                      }
                    }
                    exRule.currentUsed = exRule.usedPieces.length;
                    if (!Array.isArray(exRule.history)) exRule.history = [];
                    exRule.history.push({
                      txnId: txGroupId,
                      date: payload.date,
                      hn: payload.patientHN,
                      qty: Number(d.quantity) || 0,
                      procedure: payload.procedure,
                      pieceNo: pNo
                    });
                    if (exRule.currentUsed >= exRule.totalQuota) {
                      exRule.status = 'Completed';
                    }
                  }
                });
              }
              state.cart = [];
              document.getElementById('proc-hn').value = '';
              document.getElementById('proc-complications').value = '';
              document.querySelectorAll('#proc-procedures-list input[type="checkbox"]').forEach(cb => cb.checked = false);
              updateProcCountBadge();
              document.querySelectorAll('#proc-techs input[type="checkbox"]').forEach(cb => cb.checked = false);
              recalculateInventoryHierarchy();
              showToast('Procedure logged (Mock)');
              renderCurrentTab();
            }
          }

          if (warnings.length > 0) {
            if (confirm('Warning: The following items will result in negative stock:\n' + warnings.join('\n') + '\n\nContinue anyway?')) {
              doSubmitProc();
            }
          } else {
            doSubmitProc();
          }
        });

      // Stock Tab Events
      safeAddListener('btn-add-stock-row', 'click', () => {
        state.stockLines.push({ itemId: '', qty: 1, loc: 'Main', notes: '' });
        renderStockTab();
      });

      safeAddListener('btn-submit-stock', 'click', () => {
        const actionEl = document.querySelector('input[name="stock-action"]:checked');
        const action = actionEl ? actionEl.value : 'Stock In'; // 'Stock In' or 'Stock Out'
        const valid = state.stockLines.every(l => l.itemId && l.qty > 0);
        if (!valid) { showToast('Please select a device and enter quantity for all lines'); return; }

        const payloads = state.stockLines.map(l => ({
          date: getToday(),
          transactionType: action,
          itemId: l.itemId,
          quantity: l.qty,
          destination: action === 'Stock In' ? l.loc : '',
          source: action === 'Stock Out' ? l.loc : '',
          tech: '',
          complication: l.notes || ''
        }));

        // Check negative stock warnings
        const warnings = [];
        payloads.forEach(p => {
          const inv = state.inventory.find(i => String(i.itemId) === String(p.itemId));
          const devName = inv ? inv.deviceName : p.itemId;
          const currentMain = inv ? inv.mainStock : 0;
          const currentRetail = inv ? inv.retailStock : 0;
          const currentBuffer = inv ? (Number(inv.bufferStock) || 0) : 0;

          if (p.transactionType === 'Stock In' && p.destination === 'Retail') {
            if (currentMain - p.quantity < 0) {
              warnings.push(`${devName}: Main stock will drop below 0 to fund transfer (Current: ${currentMain}, Need: ${p.quantity})`);
            }
          } else if (p.transactionType === 'Stock Out') {
            const cur = p.source === 'Retail' ? currentRetail : (p.source === 'Buffer' ? currentBuffer : currentMain);
            if (cur - p.quantity < 0) {
              warnings.push(`${devName}: ${p.source} stock will drop below 0 (Current: ${cur}, Out: ${p.quantity})`);
            }
          }
        });

        function doSubmitStock() {
          closeModal();
          setSyncIndicator(true);

          if (isApiConfigured()) {
            callApi('submitStockMovementBatch', { items: payloads })
              .then(() => {
                setSyncIndicator(false);
                showToast('Stock movement saved successfully!');
                state.stockLines = [{ itemId: '', qty: 1, loc: 'Main', notes: '' }];
                fetchDataFromServer();
              })
              .catch(err => {
                setSyncIndicator(false);
                showToast('Error: ' + (err.message || err));
                fetchDataFromServer();
              });
          } else {
            // Mock
            setSyncIndicator(false);
            payloads.forEach(p => {
              const from = p.transactionType === 'Stock In' ? (p.destination === 'Retail' ? 'Main' : '') : p.source;
              const to = p.transactionType === 'Stock In' ? p.destination : '';
              state.transactions.push({
                id: 'TXN-' + Date.now() + Math.random().toString(36).substr(2, 4),
                date: p.date,
                type: p.transactionType,
                hn: '',
                itemId: p.itemId,
                qty: p.quantity,
                fromLoc: from,
                toLoc: to,
                disease: '',
                procedure: '',
                shift: '',
                tech: '',
                complication: p.complication,
                contrast: ''
              });
              const inv = state.inventory.find(i => String(i.itemId) === String(p.itemId));
              if (inv) {
                if (p.transactionType === 'Stock In') {
                  if (p.destination === 'Retail') { inv.mainStock -= p.quantity; inv.retailStock += p.quantity; }
                  else if (p.destination === 'Buffer') { inv.bufferStock = (Number(inv.bufferStock) || 0) + p.quantity; }
                  else { inv.mainStock += p.quantity; }
                } else {
                  if (p.source === 'Retail') inv.retailStock -= p.quantity;
                  else if (p.source === 'Buffer') inv.bufferStock = (Number(inv.bufferStock) || 0) - p.quantity;
                  else inv.mainStock -= p.quantity;
                }
                // Rule 1: Buffer is strictly excluded from totalStock
                inv.totalStock = inv.mainStock + inv.retailStock;
                inv.stockDiff = inv.totalStock - inv.hoStock;
              }
            });
            state.stockLines = [{ itemId: '', qty: 1, loc: 'Main', notes: '' }];
            recalculateInventoryHierarchy();
            showToast('Stock movement saved (Mock)');
            renderCurrentTab();
          }
        }

        if (warnings.length > 0) {
          if (confirm('Warning: The following movements will result in negative stock:\n' + warnings.join('\n') + '\n\nContinue anyway?')) {
            doSubmitStock();
          }
        } else {
          doSubmitStock();
        }
      });

      // Adjustment Tab Events
      safeAddListener('adj-search-input', 'input', debounce(renderAdjustmentTab, 120));
      safeAddListener('btn-submit-adjustments', 'click', () => {
        if (state.adjBatch.length === 0) return;

        const payloads = state.adjBatch.map(a => ({
          date: getToday(),
          itemId: a.itemId,
          location: a.loc,
          delta: a.diff,
          tech: '',
          complication: 'Actual: ' + a.count
        }));

        const warnings = [];
        state.adjBatch.forEach(a => {
          const inv = state.inventory.find(i => String(i.itemId) === String(a.itemId));
          const devName = inv ? inv.deviceName : a.itemId;
          if (a.count < 0) {
            warnings.push(`${devName}: ${a.loc} stock will drop below 0 (Result: ${a.count})`);
          }
        });

        function doSubmitAdj() {
          closeModal();
          setSyncIndicator(true);

          if (isApiConfigured()) {
            callApi('submitAdjustmentBatch', { items: payloads })
              .then(() => {
                setSyncIndicator(false);
                showToast('Adjustments saved successfully!');
                state.adjBatch = [];
                fetchDataFromServer();
              })
              .catch(err => {
                setSyncIndicator(false);
                showToast('Error: ' + (err.message || err));
                fetchDataFromServer();
              });
          } else {
            // Mock
            setSyncIndicator(false);
            payloads.forEach(p => {
              state.transactions.push({
                id: 'TXN-' + Date.now() + Math.random().toString(36).substr(2, 4),
                date: p.date,
                type: 'Adjustment',
                hn: '',
                itemId: p.itemId,
                qty: p.delta,
                fromLoc: p.location,
                toLoc: '',
                disease: '',
                procedure: '',
                shift: '',
                tech: '',
                complication: p.complication,
                contrast: ''
              });
              const inv = state.inventory.find(i => String(i.itemId) === String(p.itemId));
              if (inv) {
                if (p.location === 'Main') inv.mainStock += p.delta;
                else if (p.location === 'Buffer') inv.bufferStock = (Number(inv.bufferStock) || 0) + p.delta;
                else inv.retailStock += p.delta;
                inv.totalStock = inv.mainStock + inv.retailStock;
                inv.stockDiff = inv.totalStock - inv.hoStock;
              }
            });
            state.adjBatch = [];
            recalculateInventoryHierarchy();
            showToast('Adjustments saved (Mock)');
            renderCurrentTab();
          }
        }

        if (warnings.length > 0) {
          if (confirm('Warning: The following adjustments will result in negative stock:\n' + warnings.join('\n') + '\n\nContinue anyway?')) {
            doSubmitAdj();
          }
        } else {
          doSubmitAdj();
        }
      });

      // Shift Tab Events
        // Set default inputs
        const procDate = document.getElementById('proc-date');
        if (procDate) procDate.value = getToday();
      } catch (err) {
        console.error('Error binding main events:', err);
      }
    }

    // Mobile Touch Gesture: Swipe right from left edge (< 40px) to open sidebar; swipe left to close
    let _touchStartX = 0;
    let _touchStartY = 0;
    document.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length === 1) {
        _touchStartX = e.touches[0].clientX;
        _touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (window.innerWidth > 768) return;
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      const deltaX = e.changedTouches[0].clientX - _touchStartX;
      const deltaY = e.changedTouches[0].clientY - _touchStartY;

      if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
        if (deltaX > 0 && _touchStartX < 40) {
          // Swipe right from screen edge (< 40px) -> open sidebar
          setSidebarHidden(false);
        } else if (deltaX < 0) {
          // Swipe left -> close sidebar
          const root = document.getElementById('app-root');
          if (root && !root.classList.contains('sidebar-hidden')) {
            setSidebarHidden(true);
          }
        }
      }
    }, { passive: true });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrapApp);
      window.addEventListener('load', bootstrapApp);
    } else {
      bootstrapApp();
    }
