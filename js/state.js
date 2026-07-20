// =============================================
// STATE MANAGER & EVENT BUS
// =============================================

// Simple Event Bus
const EventBus = {
  events: {},
  on: function (event, listener) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(listener);
  },
  emit: function (event, data) {
    if (this.events[event]) {
      this.events[event].forEach(listener => listener(data));
    }
  }
};

// Global App State
const AppState = {
  // Firebase & Auth
  fcmToken: null,
  fbMessaging: null,

  // Sheets & Backend
  sheetConnected: false,
  pendingAvisos: [],
  isAdmin: false,
  userPerms: { prog: true, sync: true, admin: true, voz: true },
  progCache: JSON.parse(localStorage.getItem('prog_cache') || '[]'),

  // User Profile / Settings
  wTurno: 'TARDE',
  wBtn: null,
  curD: '',
  activeDate: new Date(),

  // UI State
  curTpl: null,
  curCat: null,
  quickMsg: null,

  // Programación
  progHoyCache: null,
  covsBaseCache: {},
  progFiltro: 'todos',
  progSearch: '',

  // Admin
  adminUsersCache: null,

  // Getters & Setters para emitir eventos
  set: function(key, value) {
    this[key] = value;
    EventBus.emit('stateChange:' + key, value);
    EventBus.emit('stateChange', { key, value });
  },
  get: function(key) {
    return this[key];
  }
};

// Error Handler centralizado
function handleError(context, error) {
  console.error('[' + context + '] Error:', error);
  const msg = (error && error.message) ? error.message : String(error);
  if (typeof showToast === 'function') {
    showToast('⚠️ ' + msg);
  } else {
    alert('⚠️ ' + msg);
  }
}
