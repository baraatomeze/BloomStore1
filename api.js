/**
 * Bloom Store API Helper
 * ملف شامل لجميع APIs المتاحة
 */

// Base URL للـ API
// يتم تحميله من config.js أو استخدام القيمة الافتراضية
let API_BASE_URL = window.location.origin;

// انتظار تحميل config.js
if (typeof window !== 'undefined') {
    // محاولة الحصول من BLOOM_CONFIG
    if (window.BLOOM_CONFIG && window.BLOOM_CONFIG.api && window.BLOOM_CONFIG.api.baseURL) {
        API_BASE_URL = window.BLOOM_CONFIG.api.baseURL;
    } else {
        // استخدام القيمة الافتراضية حسب البيئة
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            API_BASE_URL = 'http://localhost:4000';
        } else {
            API_BASE_URL = 'https://bloomstore1-production.up.railway.app';
        }
    }
}

/**
 * دالة مساعدة لإرسال الطلبات للـ API
 * @param {string} endpoint - مسار الـ API
 * @param {object} options - خيارات الطلب
 * @returns {Promise} - Promise مع البيانات
 */
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('auth_token');
  
  const config = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(options.headers || {})
    }
  };
  
  if (options.body) {
    config.body = JSON.stringify(options.body);
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();
    
    if (!response.ok) {
      // معالجة الأخطاء الشائعة
      if (response.status === 401) {
        // Token منتهي أو غير صحيح
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login.html') {
          window.location.href = '/login.html';
        }
      }
      throw new Error(data.error || data.message || 'حدث خطأ في الطلب');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * APIs للمصادقة
 */
export const authAPI = {
  /**
   * تسجيل الدخول
   * @param {string} email - البريد الإلكتروني
   * @param {string} password - كلمة المرور
   * @returns {Promise} - { success, token, user }
   */
  login: async (email, password) => {
    const result = await apiRequest('/api/login', {
      method: 'POST',
      body: { email, password }
    });
    
    if (result.success && result.token) {
      localStorage.setItem('auth_token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
    }
    
    return result;
  },
  
  /**
   * تسجيل مستخدم جديد
   * @param {object} userData - بيانات المستخدم
   * @returns {Promise} - { success, message }
   */
  register: async (userData) => {
    return await apiRequest('/api/register', {
      method: 'POST',
      body: userData
    });
  },
  
  /**
   * تسجيل الخروج
   */
  logout: () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    window.location.href = '/';
  },
  
  /**
   * التحقق من Token
   * @returns {Promise} - { success, user }
   */
  verifyToken: async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      return { success: false, error: 'No token' };
    }
    
    try {
      return await apiRequest('/api/auth/verify');
    } catch (error) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      return { success: false, error: error.message };
    }
  }
};

/**
 * APIs للمنتجات
 */
export const productsAPI = {
  /**
   * جلب جميع المنتجات
   * @returns {Promise} - { success, products: [...] }
   */
  getAll: async () => {
    return await apiRequest('/api/products');
  },
  
  /**
   * جلب منتج محدد
   * @param {number} id - معرف المنتج
   * @returns {Promise} - { success, product: {...} }
   */
  getById: async (id) => {
    return await apiRequest(`/api/products/${id}`);
  },
  
  /**
   * إضافة منتج جديد (يحتاج صلاحيات admin/manager)
   * @param {object} productData - بيانات المنتج
   * @returns {Promise} - { success, product: {...} }
   */
  create: async (productData) => {
    return await apiRequest('/api/products', {
      method: 'POST',
      body: productData
    });
  },
  
  /**
   * تحديث منتج (يحتاج صلاحيات admin/manager)
   * @param {number} id - معرف المنتج
   * @param {object} productData - بيانات المنتج المحدثة
   * @returns {Promise} - { success, message }
   */
  update: async (id, productData) => {
    return await apiRequest(`/api/products/${id}`, {
      method: 'PUT',
      body: productData
    });
  },
  
  /**
   * حذف منتج (يحتاج صلاحيات admin/manager)
   * @param {number} id - معرف المنتج
   * @returns {Promise} - { success, message }
   */
  delete: async (id) => {
    return await apiRequest(`/api/products/${id}`, {
      method: 'DELETE'
    });
  }
};

/**
 * APIs للأصناف
 */
export const categoriesAPI = {
  /**
   * جلب جميع الأصناف
   * @returns {Promise} - { success, categories: [...] }
   */
  getAll: async () => {
    return await apiRequest('/api/categories');
  },
  
  /**
   * إضافة صنف جديد (يحتاج صلاحيات admin/manager)
   * @param {object} categoryData - بيانات الصنف
   * @returns {Promise} - { success, category: {...} }
   */
  create: async (categoryData) => {
    return await apiRequest('/api/categories', {
      method: 'POST',
      body: categoryData
    });
  },
  
  /**
   * تحديث صنف (يحتاج صلاحيات admin/manager)
   * @param {number} id - معرف الصنف
   * @param {object} categoryData - بيانات الصنف المحدثة
   * @returns {Promise} - { success, message }
   */
  update: async (id, categoryData) => {
    return await apiRequest(`/api/categories/${id}`, {
      method: 'PUT',
      body: categoryData
    });
  },
  
  /**
   * حذف صنف (يحتاج صلاحيات admin/manager)
   * @param {number} id - معرف الصنف
   * @returns {Promise} - { success, message }
   */
  delete: async (id) => {
    return await apiRequest(`/api/categories/${id}`, {
      method: 'DELETE'
    });
  }
};

/**
 * APIs للطلبات
 */
export const ordersAPI = {
  /**
   * إنشاء طلب جديد
   * @param {object} orderData - بيانات الطلب
   * @returns {Promise} - { success, order: {...} }
   */
  create: async (orderData) => {
    return await apiRequest('/api/orders', {
      method: 'POST',
      body: orderData
    });
  },
  
  /**
   * جلب طلبات المستخدم
   * @returns {Promise} - { success, orders: [...] }
   */
  getAll: async () => {
    return await apiRequest('/api/orders');
  },
  
  /**
   * تحديث حالة الطلب
   * @param {number} id - معرف الطلب
   * @param {object} updateData - بيانات التحديث
   * @returns {Promise} - { success, message }
   */
  update: async (id, updateData) => {
    return await apiRequest(`/api/orders/${id}`, {
      method: 'PUT',
      body: updateData
    });
  },
  
  /**
   * إلغاء طلب
   * @param {number} id - معرف الطلب
   * @returns {Promise} - { success, message }
   */
  cancel: async (id) => {
    return await apiRequest(`/api/orders/${id}/cancel`, {
      method: 'PUT'
    });
  }
};

/**
 * APIs للملف الشخصي
 */
export const profileAPI = {
  /**
   * تحديث الملف الشخصي
   * @param {object} profileData - بيانات الملف الشخصي
   * @returns {Promise} - { success, user: {...} }
   */
  update: async (profileData) => {
    return await apiRequest('/api/profile', {
      method: 'PUT',
      body: profileData
    });
  },
  
  /**
   * تغيير كلمة المرور
   * @param {string} currentPassword - كلمة المرور الحالية
   * @param {string} newPassword - كلمة المرور الجديدة
   * @returns {Promise} - { success, message }
   */
  changePassword: async (currentPassword, newPassword) => {
    return await apiRequest('/api/change-password', {
      method: 'PUT',
      body: { currentPassword, newPassword }
    });
  }
};

/**
 * APIs للإشعارات
 */
export const notificationsAPI = {
  /**
   * جلب إشعارات المستخدم
   * @returns {Promise} - { success, notifications: [...] }
   */
  getAll: async () => {
    return await apiRequest('/api/notifications');
  },
  
  /**
   * تحديد إشعار كمقروء
   * @param {number} id - معرف الإشعار
   * @returns {Promise} - { success, message }
   */
  markAsRead: async (id) => {
    return await apiRequest(`/api/notifications/${id}/read`, {
      method: 'PUT'
    });
  }
};

/**
 * APIs للإعلانات
 */
export const announcementsAPI = {
  /**
   * جلب الإعلان النشط
   * @returns {Promise} - { success, announcement: {...} }
   */
  getActive: async () => {
    return await apiRequest('/api/announcement');
  }
};

/**
 * APIs للإحصائيات (Admin)
 */
export const statsAPI = {
  /**
   * جلب الإحصائيات العامة
   * @returns {Promise} - { success, stats: {...} }
   */
  getOverview: async () => {
    return await apiRequest('/api/stats');
  },
  
  /**
   * جلب تقرير الأرباح
   * @returns {Promise} - { success, profits: [...] }
   */
  getProfits: async () => {
    return await apiRequest('/api/admin/profits');
  },
  
  /**
   * جلب تقرير الأرباح الشهرية
   * @returns {Promise} - { success, monthlyProfits: [...] }
   */
  getMonthlyProfits: async () => {
    return await apiRequest('/api/admin/profits/monthly');
  }
};

/**
 * Health Check API
 */
export const healthAPI = {
  /**
   * فحص حالة السيرفر
   * @returns {Promise} - { status, database, ... }
   */
  check: async () => {
    return await apiRequest('/api/health');
  }
};

/**
 * تصدير جميع APIs ككائن واحد
 */
export const api = {
  auth: authAPI,
  products: productsAPI,
  categories: categoriesAPI,
  orders: ordersAPI,
  profile: profileAPI,
  notifications: notificationsAPI,
  announcements: announcementsAPI,
  stats: statsAPI,
  health: healthAPI
};

// تصدير للاستخدام في المتصفح
if (typeof window !== 'undefined') {
  window.api = api;
  window.authAPI = authAPI;
  window.productsAPI = productsAPI;
  window.categoriesAPI = categoriesAPI;
  window.ordersAPI = ordersAPI;
  window.profileAPI = profileAPI;
  window.notificationsAPI = notificationsAPI;
  window.announcementsAPI = announcementsAPI;
  window.statsAPI = statsAPI;
  window.healthAPI = healthAPI;
}

