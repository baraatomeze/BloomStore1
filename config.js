// Bloom Store Configuration
// هذا الملف يحتوي على إعدادات المتجر

const BLOOM_CONFIG = {
    // إعدادات الأمان
    security: {
        requireTwoFA: [], // تم إلغاء المصادقة الثنائية
        preventRightClick: false,
        preventDevTools: false
    },
    
    // إعدادات WhatsApp
    whatsapp: {
        companyPhone: '0566411202'
    },
    
    // إعدادات API
    api: {
        baseURL: window.location.origin,
        timeout: 30000
    },
    
    // إعدادات المتجر
    store: {
        name: 'Bloom',
        currency: '₪',
        language: 'ar'
    }
};

// تصدير الإعدادات للاستخدام العام
if (typeof window !== 'undefined') {
    window.BLOOM_CONFIG = BLOOM_CONFIG;
}
