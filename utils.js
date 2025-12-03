/**
 * Bloom Store Utilities
 * دوال مساعدة عامة
 */

/**
 * دالة لتنسيق الأرقام (إضافة فواصل)
 * @param {number} number - الرقم
 * @returns {string} - الرقم المنسق
 */
function formatNumber(number) {
    return new Intl.NumberFormat('ar-PS').format(number);
}

/**
 * دالة لتنسيق السعر
 * @param {number} price - السعر
 * @param {string} currency - العملة (افتراضي: ₪)
 * @returns {string} - السعر المنسق
 */
function formatPrice(price, currency = '₪') {
    const formatted = formatNumber(price);
    return `${formatted} ${currency}`;
}

/**
 * دالة لتطبيق الخصم على السعر
 * @param {number} price - السعر الأصلي
 * @param {number} discountPercent - نسبة الخصم
 * @returns {number} - السعر بعد الخصم
 */
function applyDiscount(price, discountPercent) {
    if (!discountPercent || discountPercent <= 0) return price;
    const discount = (price * discountPercent) / 100;
    return Math.max(0, price - discount);
}

/**
 * دالة لإظهار رسالة نجاح
 * @param {string} message - الرسالة
 * @param {number} duration - المدة بالثواني
 */
function showSuccess(message, duration = 3) {
    showNotification(message, 'success', duration);
}

/**
 * دالة لإظهار رسالة خطأ
 * @param {string} message - الرسالة
 * @param {number} duration - المدة بالثواني
 */
function showError(message, duration = 5) {
    showNotification(message, 'error', duration);
}

/**
 * دالة لإظهار إشعار
 * @param {string} message - الرسالة
 * @param {string} type - نوع الإشعار (success, error, warning, info)
 * @param {number} duration - المدة بالثواني
 */
function showNotification(message, type = 'info', duration = 3) {
    // إنشاء عنصر الإشعار
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // إضافة الأنماط
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${getNotificationColor(type)};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        max-width: 400px;
    `;
    
    // إضافة للصفحة
    document.body.appendChild(notification);
    
    // إزالة بعد المدة المحددة
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, duration * 1000);
}

/**
 * الحصول على لون الإشعار حسب النوع
 * @param {string} type - نوع الإشعار
 * @returns {string} - اللون
 */
function getNotificationColor(type) {
    const colors = {
        success: '#4CAF50',
        error: '#F44336',
        warning: '#FF9800',
        info: '#2196F3'
    };
    return colors[type] || colors.info;
}

/**
 * دالة للتحقق من صحة البريد الإلكتروني
 * @param {string} email - البريد الإلكتروني
 * @returns {boolean} - true إذا كان صحيح
 */
function isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

/**
 * دالة للتحقق من صحة رقم الهاتف
 * @param {string} phone - رقم الهاتف
 * @returns {boolean} - true إذا كان صحيح
 */
function isValidPhone(phone) {
    const regex = /^[0-9]{10,15}$/;
    return regex.test(phone.replace(/[\s-]/g, ''));
}

/**
 * دالة لتنسيق رقم الهاتف
 * @param {string} phone - رقم الهاتف
 * @returns {string} - الرقم المنسق
 */
function formatPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
        return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    }
    return phone;
}

/**
 * دالة لإزالة HTML tags (للحماية من XSS)
 * @param {string} html - النص مع HTML
 * @returns {string} - النص بدون HTML
 */
function stripHTML(html) {
    const tmp = document.createElement('DIV');
    tmp.textContent = html;
    return tmp.innerHTML;
}

/**
 * دالة للانتظار (delay)
 * @param {number} ms - المدة بالميلي ثانية
 * @returns {Promise}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * دالة للبحث في المصفوفة
 * @param {array} array - المصفوفة
 * @param {string} query - نص البحث
 * @param {array} fields - الحقول للبحث فيها
 * @returns {array} - النتائج
 */
function searchArray(array, query, fields = []) {
    if (!query) return array;
    
    const lowerQuery = query.toLowerCase();
    return array.filter(item => {
        if (fields.length === 0) {
            // البحث في جميع الحقول
            return Object.values(item).some(value => 
                String(value).toLowerCase().includes(lowerQuery)
            );
        } else {
            // البحث في الحقول المحددة
            return fields.some(field => 
                String(item[field] || '').toLowerCase().includes(lowerQuery)
            );
        }
    });
}

/**
 * دالة لترتيب المصفوفة
 * @param {array} array - المصفوفة
 * @param {string} field - الحقل للترتيب
 * @param {string} order - الترتيب (asc, desc)
 * @returns {array} - المصفوفة المرتبة
 */
function sortArray(array, field, order = 'asc') {
    return [...array].sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        
        if (aVal < bVal) return order === 'asc' ? -1 : 1;
        if (aVal > bVal) return order === 'asc' ? 1 : -1;
        return 0;
    });
}

/**
 * دالة لتحويل التاريخ إلى نص عربي
 * @param {Date|string} date - التاريخ
 * @returns {string} - التاريخ بالعربية
 */
function formatDateArabic(date) {
    const d = new Date(date);
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        calendar: 'islamic'
    };
    return d.toLocaleDateString('ar-PS', options);
}

/**
 * دالة للتحقق من أن العنصر موجود في viewport
 * @param {HTMLElement} element - العنصر
 * @returns {boolean}
 */
function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

/**
 * دالة لـ debounce
 * @param {Function} func - الدالة
 * @param {number} wait - المدة بالميلي ثانية
 * @returns {Function}
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// تصدير للاستخدام
if (typeof window !== 'undefined') {
    window.utils = {
        formatNumber,
        formatPrice,
        applyDiscount,
        showSuccess,
        showError,
        showNotification,
        isValidEmail,
        isValidPhone,
        formatPhone,
        stripHTML,
        delay,
        searchArray,
        sortArray,
        formatDateArabic,
        isInViewport,
        debounce
    };
}

// إضافة أنيميشن للإشعارات
if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

