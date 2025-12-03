/**
 * Bloom Store Authentication Helper
 * ملف مساعد لإدارة المصادقة
 */

/**
 * فئة لإدارة المصادقة
 */
class AuthManager {
    constructor() {
        this.tokenKey = window.BLOOM_CONFIG?.security?.tokenStorageKey || 'auth_token';
        this.userKey = window.BLOOM_CONFIG?.security?.userStorageKey || 'user';
    }
    
    /**
     * تسجيل الدخول
     * @param {string} email - البريد الإلكتروني
     * @param {string} password - كلمة المرور
     * @returns {Promise<object>} - بيانات المستخدم والـ Token
     */
    async login(email, password) {
        try {
            if (!email || !password) {
                throw new Error('البريد الإلكتروني وكلمة المرور مطلوبان');
            }
            
            const result = await window.api.auth.login(email, password);
            
            if (result.success) {
                this.setUser(result.user);
                return { success: true, user: result.user };
            } else {
                throw new Error(result.error || 'فشل تسجيل الدخول');
            }
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }
    
    /**
     * تسجيل مستخدم جديد
     * @param {object} userData - بيانات المستخدم
     * @returns {Promise<object>} - نتيجة التسجيل
     */
    async register(userData) {
        try {
            const { email, password, name, phone } = userData;
            
            if (!email || !password || !name || !phone) {
                throw new Error('جميع الحقول مطلوبة');
            }
            
            // التحقق من صحة البريد الإلكتروني
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                throw new Error('البريد الإلكتروني غير صحيح');
            }
            
            // التحقق من قوة كلمة المرور
            if (password.length < 8) {
                throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
            }
            
            const result = await window.api.auth.register(userData);
            
            if (result.success) {
                return { success: true, message: result.message || 'تم إنشاء الحساب بنجاح' };
            } else {
                throw new Error(result.error || 'فشل إنشاء الحساب');
            }
        } catch (error) {
            console.error('Register error:', error);
            throw error;
        }
    }
    
    /**
     * تسجيل الخروج
     */
    logout() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);
        window.location.href = '/';
    }
    
    /**
     * التحقق من حالة تسجيل الدخول
     * @returns {boolean} - true إذا كان المستخدم مسجل دخول
     */
    isAuthenticated() {
        const token = localStorage.getItem(this.tokenKey);
        const user = localStorage.getItem(this.userKey);
        return !!(token && user);
    }
    
    /**
     * الحصول على المستخدم الحالي
     * @returns {object|null} - بيانات المستخدم أو null
     */
    getCurrentUser() {
        try {
            const userStr = localStorage.getItem(this.userKey);
            return userStr ? JSON.parse(userStr) : null;
        } catch (error) {
            console.error('Error getting current user:', error);
            return null;
        }
    }
    
    /**
     * الحصول على Token
     * @returns {string|null} - Token أو null
     */
    getToken() {
        return localStorage.getItem(this.tokenKey);
    }
    
    /**
     * تعيين بيانات المستخدم
     * @param {object} user - بيانات المستخدم
     */
    setUser(user) {
        localStorage.setItem(this.userKey, JSON.stringify(user));
    }
    
    /**
     * التحقق من صلاحيات المستخدم
     * @param {string|array} roles - الأدوار المطلوبة
     * @returns {boolean} - true إذا كان المستخدم لديه الصلاحية
     */
    hasRole(roles) {
        const user = this.getCurrentUser();
        if (!user || !user.role) return false;
        
        const requiredRoles = Array.isArray(roles) ? roles : [roles];
        return requiredRoles.includes(user.role);
    }
    
    /**
     * التحقق من أن المستخدم هو Admin
     * @returns {boolean}
     */
    isAdmin() {
        return this.hasRole('admin');
    }
    
    /**
     * التحقق من أن المستخدم هو Manager
     * @returns {boolean}
     */
    isManager() {
        return this.hasRole(['admin', 'manager']);
    }
    
    /**
     * التحقق من صحة Token
     * @returns {Promise<boolean>}
     */
    async verifyToken() {
        try {
            if (!this.isAuthenticated()) {
                return false;
            }
            
            const result = await window.api.auth.verifyToken();
            return result.success === true;
        } catch (error) {
            console.error('Token verification error:', error);
            this.logout();
            return false;
        }
    }
    
    /**
     * حماية صفحة (توجيه للـ login إذا لم يكن مسجل دخول)
     * @param {string|array} requiredRoles - الأدوار المطلوبة (اختياري)
     */
    protectPage(requiredRoles = null) {
        if (!this.isAuthenticated()) {
            window.location.href = '/login.html';
            return false;
        }
        
        if (requiredRoles && !this.hasRole(requiredRoles)) {
            window.location.href = '/';
            return false;
        }
        
        return true;
    }
}

// إنشاء instance عام
const authManager = new AuthManager();

// تصدير للاستخدام
if (typeof window !== 'undefined') {
    window.authManager = authManager;
    window.AuthManager = AuthManager;
}

// تصدير للاستخدام في Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AuthManager, authManager };
}

