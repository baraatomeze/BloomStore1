/**
 * Bloom Store Configuration
 * ملف الإعدادات الشامل للمتجر
 */

const BLOOM_CONFIG = {
    // إعدادات API
    api: {
        // Base URL للـ API - يمكن تغييره حسب البيئة
        baseURL: process.env.API_BASE_URL || 
                 (window.location.hostname === 'localhost' 
                    ? 'http://localhost:4000' 
                    : 'https://bloomstore1-production.up.railway.app'),
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000
    },
    
    // إعدادات الأمان
    security: {
        requireTwoFA: [], // تم إلغاء المصادقة الثنائية
        preventRightClick: false,
        preventDevTools: false,
        tokenStorageKey: 'auth_token',
        userStorageKey: 'user'
    },
    
    // إعدادات WhatsApp
    whatsapp: {
        companyPhone: '0566411202',
        message: 'مرحباً، أريد الاستفسار عن المنتجات'
    },
    
    // إعدادات المتجر
    store: {
        name: 'Bloom',
        fullName: 'متجر Bloom للقهوة والهدايا الفاخرة',
        currency: '₪',
        currencySymbol: '₪',
        language: 'ar',
        direction: 'rtl'
    },
    
    // إعدادات الواجهة
    ui: {
        theme: 'light',
        primaryColor: '#4A0E1E',
        secondaryColor: '#8B4513',
        accentColor: '#DAA520',
        showNotifications: true,
        notificationDuration: 5000
    },
    
    // إعدادات المنتجات
    products: {
        itemsPerPage: 12,
        defaultImage: '/images/placeholder.svg',
        enableSearch: true,
        enableFilters: true
    },
    
    // إعدادات الطلبات
    orders: {
        statuses: {
            pending: { label: 'في الانتظار', color: '#FF9800' },
            confirmed: { label: 'مؤكد', color: '#2196F3' },
            preparing: { label: 'قيد التحضير', color: '#9C27B0' },
            ready: { label: 'جاهز للتوصيل', color: '#00BCD4' },
            delivered: { label: 'تم التوصيل', color: '#4CAF50' },
            cancelled: { label: 'ملغي', color: '#F44336' }
        },
        minOrderAmount: 0,
        freeShippingThreshold: 200
    },
    
    // إعدادات الأداء
    performance: {
        enableCache: true,
        cacheExpiry: 5 * 60 * 1000, // 5 دقائق
        lazyLoadImages: true,
        debounceDelay: 300
    }
};

/**
 * دالة للحصول على قيمة إعداد
 * @param {string} key - مفتاح الإعداد (مثل 'api.baseURL')
 * @returns {any} - قيمة الإعداد
 */
function getConfig(key) {
    const keys = key.split('.');
    let value = BLOOM_CONFIG;
    
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            return undefined;
        }
    }
    
    return value;
}

/**
 * دالة لتعيين قيمة إعداد
 * @param {string} key - مفتاح الإعداد
 * @param {any} value - القيمة الجديدة
 */
function setConfig(key, value) {
    const keys = key.split('.');
    let config = BLOOM_CONFIG;
    
    for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in config)) {
            config[keys[i]] = {};
        }
        config = config[keys[i]];
    }
    
    config[keys[keys.length - 1]] = value;
}

// تصدير الإعدادات للاستخدام العام
if (typeof window !== 'undefined') {
    window.BLOOM_CONFIG = BLOOM_CONFIG;
    window.getConfig = getConfig;
    window.setConfig = setConfig;
}

// تصدير للاستخدام في Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BLOOM_CONFIG, getConfig, setConfig };
}
