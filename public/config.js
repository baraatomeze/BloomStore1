// Bloom Store Configuration
const CONFIG = {
    // Store Information
    store: {
        name: 'Bloom',
        description: 'متجر فاخر للمشروبات والمنتجات المميزة',
        logo: '🌸 Bloom',
        version: '2.0.0',
        currency: '₪',
        language: 'ar'
    },
    
    // Admin Configuration
    admin: {
        email: 'bloom.company.ps@gmail.com',
        name: 'روزان طميزي',
        phone: '0566411202',
        role: 'admin'
    },
    
    // Security Configuration
    security: {
        verificationCodeExpiry: 1 * 60 * 1000, // 1 minute
        maxLoginAttempts: 5,
        lockoutDuration: 15 * 60 * 1000, // 15 minutes
        sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
        adminEmail: 'bloom.company.ps@gmail.com'
    },
    
    // API Configuration
    api: {
        baseUrl: window.location.origin,
        endpoints: {
            login: '/api/login',
            register: '/api/register',
            products: '/api/products',
            orders: '/api/orders',
            sendEmailCode: '/api/send-email-code',
            verifyCode: '/api/verify-code',
            health: '/api/health'
        }
    },
    
    // Email Configuration
    email: {
        service: 'gmail',
        from: 'Bloom <bloom.company.ps@gmail.com>',
        subject: '🔐 كود التحقق من Bloom',
        template: 'default'
    },
    
    // Database Configuration
    database: {
        type: 'mongodb',
        connectionString: 'mongodb+srv://baraatomeze_db_user:Bloom123!@#@cluster0.rwds1ij.mongodb.net/bloom?retryWrites=true&w=majority&appName=Cluster0',
        collections: {
            users: 'users',
            products: 'products',
            orders: 'orders',
            categories: 'categories'
        }
    },
    
    // UI Configuration
    ui: {
        theme: {
            primaryColor: '#602C34',
            secondaryColor: '#8B4513',
            accentColor: '#FFD700',
            backgroundColor: '#f5f7fa',
            textColor: '#333',
            borderColor: '#ddd'
        },
        layout: {
            maxWidth: '1200px',
            headerHeight: '70px',
            borderRadius: '15px',
            boxShadow: '0 5px 15px rgba(0,0,0,0.1)'
        },
        responsive: {
            mobile: '768px',
            tablet: '1024px',
            desktop: '1200px'
        }
    },
    
    // Features Configuration
    features: {
        twoFactorAuth: false, // Disabled for admin
        googleLogin: false, // Removed
        visitorCounter: true,
        adminPanel: true,
        productManagement: true,
        orderManagement: true,
        analytics: true
    },
    
    // Shipping Configuration
    shipping: {
        options: {
            ramallah: {
                name: 'الضفة الغربية',
                price: 20,
                description: 'توصيل لجميع مناطق الضفة الغربية'
            },
            jerusalem: {
                name: 'القدس',
                price: 35,
                description: 'توصيل لمنطقة القدس'
            },
            inside: {
                name: 'داخل الخط الأخضر',
                price: 75,
                description: 'توصيل لداخل الخط الأخضر'
            }
        },
        freeShippingThreshold: 100
    },
    
    // Categories Configuration
    categories: {
        beverages: {
            name: 'المشروبات',
            icon: '🥤',
            description: 'مشروبات منعشة ومميزة'
        },
        snacks: {
            name: 'المقبلات',
            icon: '🍿',
            description: 'مقبلات لذيذة ومتنوعة'
        },
        desserts: {
            name: 'الحلويات',
            icon: '🍰',
            description: 'حلويات شهية ومميزة'
        },
        main: {
            name: 'الأطباق الرئيسية',
            icon: '🍽️',
            description: 'أطباق رئيسية شهية'
        }
    },
    
    // Contact Information
    contact: {
        phone: '0566411202',
        email: 'bloom.company.ps@gmail.com',
        manager: 'روزان طميزي',
        address: 'فلسطين - الضفة الغربية',
        workingHours: 'الأحد - الخميس: 9:00 ص - 6:00 م'
    }
};

// Export configuration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
