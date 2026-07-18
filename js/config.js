// =============================================
// CONFIGURACIÓN CENTRALIZADA (SSoT)
// =============================================

const CONFIG = {
  // Backend (Google Apps Script)
  SHEET_URL: 'https://script.google.com/macros/s/AKfycbwKGW5MOAfRFwMW3HVbaSa67wcJO4cmka22DAZFDi2C-myNPWWDq3RLYoOURbFK0UP9NQ/exec',

  // Firebase
  FIREBASE: {
    apiKey: 'AIzaSyA65EkSVN41YsH40MHNgYOtFYGVX1aOeFY',
    authDomain: 'appcov-7c5e4.firebaseapp.com',
    projectId: 'appcov-7c5e4',
    messagingSenderId: '277781643808',
    appId: '1:277781643808:web:e392198ab6ceece314f245'
  },
  
  // Push Notifications (FCM)
  VAPID_KEY: 'BJEqF3Gbb6WZFC1MDdJMk87-xZz-Ge5ja7XrzA_djMtP0IkjihcJxjBOCFLP2gMWY9xNpfjyXdejGlXkDYQMgIM',

  // Geminis (Modelos IA)
  GEMINI_MODELS: [
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite'
  ]
};
