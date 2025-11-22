// معالجة أخطاء غير متوقعة في بداية التطبيق
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // لا نوقف العملية، نستمر في العمل
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // لا نوقف العملية، نستمر في العمل
});

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 4000;

// HTTPS Support - Trust proxy for Heroku and Hostinger
app.set('trust proxy', 1);
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Security Headers Middleware
app.use((req, res, next) => {
  // Force HTTPS on Heroku
  if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  
  // Security Headers
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';");
  
  next();
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000 // limit each IP to 1000 requests per windowMs
});
app.use(limiter);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// فحص الأنشطة المشبوهة (XSS/SQL Injection) ومنعها بصفحة تحذير
function flattenValues(obj) {
  const values = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      values.push(String(v));
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v === 'object') {
      Object.keys(v).forEach(k => walk(v[k]));
    }
  };
  walk(obj);
  return values;
}

function isSuspiciousString(str) {
  if (!str) return false;
  const raw = String(str);
  const s = raw.toLowerCase();
  let decoded = s;
  try { decoded = decodeURIComponent(s); } catch (_) { /* ignore */ }
  // أنماط عامة للاشتباه: XSS و SQLi (خام ومرمّز)
  // تم تعديل الأنماط لتكون أقل صرامة مع كلمات المرور العادية
  const patterns = [
    /<\s*script/, /%3c\s*script/i,
    /onerror\s*=|onload\s*=|onclick\s*=/,
    /javascript:\s*/,
    /data:\s*text\/html/,
    /(union\s+all\s+select|union\s+select)/i,
    /(select\s+.*\s+from)/i,
    /insert\s+into|update\s+.*\s+set|delete\s+from|drop\s+table|alter\s+table/i,
    /;--|#|\/\*/,
    /or\s+1\s*=\s*1|and\s+1\s*=\s*1/i,
    /sleep\s*\(\s*\d+\s*\)/i
  ];
  // استثناء: إذا كان النص قصير (أقل من 50 حرف) ويحتوي فقط على أحرف وكلمات مرور عادية، لا نعتبره مشبوهاً
  if (raw.length < 50 && /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/? ]+$/.test(raw)) {
    // إذا كان يحتوي على كلمات SQL خطيرة فقط، نمنعه
    const dangerousSQL = /(union|select|insert|update|delete|drop|alter|exec|execute)/i;
    if (dangerousSQL.test(s)) {
      // لكن استثناء: إذا كانت كلمة مرور عادية (مثل Admin123!@#)، لا نمنعها
      if (/^(admin|user|manager|password)\d+[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+$/i.test(raw)) {
        return false; // كلمات مرور عادية آمنة
      }
      return patterns.some(rx => rx.test(s) || rx.test(decoded));
    }
    return false; // كلمات المرور العادية آمنة
  }
  return patterns.some(rx => rx.test(s) || rx.test(decoded));
}

function suspiciousMiddleware(req, res, next) {
  try {
    // استثناء مسارات API من الفحص المشدد (خاصة login/register)
    const apiPaths = ['/api/login', '/api/register', '/api/send-email-code', '/api/verify-code', '/api/email/send-code', '/api/sms/send-code'];
    if (apiPaths.some(p => req.originalUrl.startsWith(p))) {
      // السماح بجميع طلبات تسجيل الدخول والتسجيل بدون فحص
      return next();
    }
    
    // فحص عادي للمسارات الأخرى
    const bag = [];
    bag.push(req.originalUrl || '');
    bag.push(...flattenValues(req.query));
    bag.push(...flattenValues(req.body));
    // فحص بعض الترويسات المهمة فقط
    ['user-agent','referer'].forEach(h => req.headers[h] && bag.push(req.headers[h]));

    const hit = bag.find(isSuspiciousString);
    if (hit) {
      console.warn('🚫 نشاط مشبوه تم منعه:', { ip: req.ip, path: req.originalUrl, sample: hit });
      // للطلبات API، أرسل JSON. للصفحات، أرسل HTML
      if (req.originalUrl.startsWith('/api/')) {
        return res.status(403).json({ 
          success: false, 
          error: 'SUSPICIOUS_ACTIVITY',
          message: 'تم منع الطلب بسبب نشاط مشبوه'
        });
      }
      // للصفحات العادية، حاول إرسال ملف HTML
      try {
        return res.status(403).sendFile(path.join(__dirname, 'public', 'suspicious.html'));
      } catch (e) {
        // إذا فشل إرسال الملف، أرسل رد HTML بسيط
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
          <head><title>تم منع النشاط</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>🚫 تم منع النشاط</h1>
            <p>تم منع هذا الطلب بسبب نشاط مشبوه.</p>
          </body>
          </html>
        `);
      }
    }
  } catch (e) {
    console.error('Suspicious middleware error:', e);
  }
  next();
}

// ضع الوسيط بعد تحليل الجسم وقبل تقديم الملفات الثابتة حتى يشمل كل الطلبات
app.use(suspiciousMiddleware);

// لا نضع express.static هنا لأنه قد يعترض على API routes
// سيتم خدمة الملفات الثابتة في route منفصل بعد API routes
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
const productsDir = path.join(uploadsDir, 'products');
const bannersDir = path.join(uploadsDir, 'announcements');
[productsDir, bannersDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // تحديد مجلد الرفع بناءً على المسار
    if (req.path && req.path.includes('/announcement')) return cb(null, bannersDir);
    if (req.path && req.path.includes('/categories')) return cb(null, productsDir);
    return cb(null, productsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `p_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

function saveBase64Image(dataUrl, subFolder = 'products') {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const matches = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!matches) {
    return null;
  }

  const mimeType = matches[1];
  const extension = mimeType.split('/')[1] || 'png';
  const buffer = Buffer.from(matches[2], 'base64');
  const fileName = `${subFolder === 'announcements' ? 'b' : 'p'}_${Date.now()}_${Math.round(Math.random() * 1e6)}.${extension}`;
  const folderPath = subFolder === 'announcements' ? bannersDir : productsDir;

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const absolutePath = path.join(folderPath, fileName);
  fs.writeFileSync(absolutePath, buffer);

  return `/uploads/${subFolder}/${fileName}`;
}
// إضافة قسم (فئة) مع صورة
// جلب جميع الأصناف
app.get('/api/categories', async (req, res) => {
  try {
    if (!supabase) {
      return res.json({ success: true, categories: [] });
    }

    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('Get categories error:', error);
      return res.json({ success: true, categories: [] });
    }

    res.json({ success: true, categories: categories || [] });
  } catch (e) {
    console.error('Get categories exception:', e);
    res.json({ success: true, categories: [] });
  }
});

// إضافة صنف جديد
app.post('/api/categories', upload.single('image'), async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'TOKEN_REQUIRED' });
    }

    let userRole;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userRole = decoded.role;
    } catch (e) {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    if (userRole !== 'admin' && userRole !== 'manager') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    }

    const { name, description, image } = req.body || {};
    const imagePath = req.file
      ? `/uploads/products/${req.file.filename}`
      : saveBase64Image(image, 'products');

    if (!name) {
      return res.status(400).json({ success: false, error: 'NAME_REQUIRED' });
    }

    const { data, error } = await supabase
      .from('categories')
      .insert([{ name, description, image: imagePath || null }])
      .select()
      .single();

    if (error) {
      console.error('Add category error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }

    res.json({ success: true, category: data });
  } catch (e) {
    console.error('Add category exception:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// تحديث صنف
app.put('/api/categories/:id', upload.single('image'), async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'TOKEN_REQUIRED' });
    }

    let userRole;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userRole = decoded.role;
    } catch (e) {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    if (userRole !== 'admin' && userRole !== 'manager') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    }

    const { name, description, image } = req.body || {};
    const updateData = {};
    
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (req.file) {
      updateData.image = `/uploads/products/${req.file.filename}`;
    } else if (image) {
      const imagePath = saveBase64Image(image, 'products');
      if (imagePath) updateData.image = imagePath;
    }

    const { error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('id', req.params.id);

    if (error) {
      console.error('Update category error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }

    res.json({ success: true, message: 'تم تحديث القسم بنجاح' });
  } catch (e) {
    console.error('Update category exception:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// حذف صنف
app.delete('/api/categories/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'TOKEN_REQUIRED' });
    }

    let userRole;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userRole = decoded.role;
    } catch (e) {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    if (userRole !== 'admin' && userRole !== 'manager') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    }

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      console.error('Delete category error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }

    res.json({ success: true, message: 'تم حذف القسم بنجاح' });
  } catch (e) {
    console.error('Delete category exception:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});


// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

// Validate Supabase configuration
if (!supabaseUrl || supabaseUrl === 'https://your-project.supabase.co' || !supabaseKey || supabaseKey === 'your-anon-key') {
  console.error('❌ خطأ: SUPABASE_URL و SUPABASE_ANON_KEY مطلوبان في Environment Variables');
  console.error('   يرجى إنشاء ملف .env في المجلد الرئيسي وإضافة:');
  console.error('   SUPABASE_URL=https://your-project.supabase.co');
  console.error('   SUPABASE_ANON_KEY=your-anon-key');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  console.error('   للحصول على المفاتيح: Supabase Dashboard → Settings → API');
  console.error('   راجع ملف FIX_API_KEY_ERROR.md للتعليمات التفصيلية');
}

const supabaseOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
};

// Use SERVICE_ROLE_KEY if available (bypasses RLS), otherwise use ANON_KEY
// This ensures we can create users and login even if RLS is enabled
let supabase;
let supabaseAdmin = null;

try {
  // التحقق من صحة Environment Variables
  const hasValidUrl = supabaseUrl && supabaseUrl !== 'https://your-project.supabase.co';
  const hasValidAnonKey = supabaseKey && supabaseKey !== 'your-anon-key';
  const hasValidServiceKey = supabaseServiceKey && supabaseServiceKey !== 'your-service-key';
  
  if (hasValidUrl && hasValidServiceKey) {
    // استخدام SERVICE_ROLE_KEY إذا كان متوفراً
    supabase = createClient(supabaseUrl, supabaseServiceKey, supabaseOptions);
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, supabaseOptions);
    console.log('✅ Supabase client initialized with SERVICE_ROLE_KEY');
  } else if (hasValidUrl && hasValidAnonKey) {
    // استخدام ANON_KEY
    supabase = createClient(supabaseUrl, supabaseKey, supabaseOptions);
    console.log('✅ Supabase client initialized with ANON_KEY');
  } else {
    // Fallback: إنشاء client مع قيم افتراضية لتجنب crash
    console.error('❌ Supabase credentials not configured properly!');
    console.error('   URL:', supabaseUrl);
    console.error('   Has Valid URL:', !!hasValidUrl);
    console.error('   Has Valid Anon Key:', !!hasValidAnonKey);
    console.error('   Has Valid Service Key:', !!hasValidServiceKey);
    console.error('');
    console.error('📋 خطوات الإصلاح:');
    console.error('   1. أنشئ ملف .env في المجلد الرئيسي');
    console.error('   2. أضف مفاتيح Supabase من: Supabase Dashboard → Settings → API');
    console.error('   3. أعد تشغيل السيرفر');
    console.error('   4. راجع ملف FIX_API_KEY_ERROR.md للتعليمات التفصيلية');
    console.error('');
    // استخدام قيم صحيحة من Environment Variables حتى لو كانت افتراضية
    if (hasValidUrl) {
      supabase = createClient(supabaseUrl, supabaseKey || 'placeholder-key', supabaseOptions);
    } else {
      supabase = createClient('https://placeholder.supabase.co', 'placeholder-key', supabaseOptions);
    }
  }
} catch (error) {
  console.error('❌ خطأ في إنشاء Supabase client:', error);
  // Fallback: إنشاء client فارغ لتجنب crash
  try {
    supabase = createClient('https://placeholder.supabase.co', 'placeholder-key', supabaseOptions);
  } catch (fallbackError) {
    console.error('❌ فشل في إنشاء fallback client:', fallbackError);
    // إذا فشل كل شيء، نستخدم null وسنتعامل معه في الكود
    supabase = null;
  }
}

// التأكد من أن supabase معرف دائماً
if (!supabase) {
  console.error('❌ خطأ خطير: فشل في تهيئة Supabase client');
  // في Vercel، لا ننشئ client افتراضي لأنه قد يسبب مشاكل
  // سنستخدم null وسنتعامل معه في الكود
  if (!process.env.VERCEL) {
    supabase = createClient('https://placeholder.supabase.co', 'placeholder-key', supabaseOptions);
  }
}

const DEFAULT_USER_EMAILS = [
  'bloom.company.ps@gmail.com',
  'manager@bloom.com',
  'user@bloom.com'
];

const DEFAULT_PRODUCT_NAMES = [
  'سيروب الفانيليا',
  'سيروب الكراميل',
  'مشروب الماتشا',
  'كوب سيراميك'
];

const DEFAULT_CATEGORY_NAMES = [
  'سيروبات',
  'مشروبات',
  'أكواب',
  'حلويات',
  'إكسسوارات'
];

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'bloom-jwt-secret-key-2024-supabase';

// Rate Limiting Map
const requestCounts = new Map();

// Cloudflare WAF Integration
// تكامل Cloudflare WAF مع الخادم

// دالة التحقق من WAF Headers
function checkWAFHeaders(req, res, next) {
  // التحقق من Cloudflare Headers
  const cfRay = req.headers['cf-ray'];
  const cfCountry = req.headers['cf-ipcountry'];
  const cfConnectingIP = req.headers['cf-connecting-ip'];
  
  // إضافة معلومات WAF للطلب
  req.wafInfo = {
    cfRay: cfRay,
    country: cfCountry,
    realIP: cfConnectingIP,
    isCloudflare: !!cfRay
  };
  
  // تسجيل معلومات WAF
  if (cfRay) {
    console.log(`🛡️ WAF Request - CF-Ray: ${cfRay}, Country: ${cfCountry}, Real IP: ${cfConnectingIP}`);
  }
  
  next();
}

// دالة حماية إضافية للـ API
function apiSecurityMiddleware(req, res, next) {
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.ip || req.connection.remoteAddress;
  
  // منع البوتات المعروفة
  const suspiciousBots = ['bot', 'crawler', 'spider', 'scraper', 'curl', 'wget'];
  const isSuspiciousBot = suspiciousBots.some(bot => userAgent.toLowerCase().includes(bot));
  
  if (isSuspiciousBot) {
    console.log(`🚫 Blocked suspicious bot: ${userAgent} from ${ip}`);
    return res.status(403).json({ 
      success: false, 
      error: 'BOT_DETECTED',
      message: 'Bot access not allowed'
    });
  }
  
  // منع الطلبات بدون User-Agent
  if (!userAgent) {
    console.log(`🚫 Blocked request without User-Agent from ${ip}`);
    return res.status(403).json({ 
      success: false, 
      error: 'NO_USER_AGENT',
      message: 'User-Agent header required'
    });
  }
  
  next();
}

// دالة حماية من SQL Injection
function sqlInjectionProtection(req, res, next) {
  // استثناء مسارات API الحساسة (login/register) من الفحص
  const apiPaths = ['/api/login', '/api/register', '/api/send-email-code', '/api/verify-code'];
  if (apiPaths.some(p => req.originalUrl.startsWith(p))) {
    return next(); // السماح بمسارات API بدون فحص
  }
  
  const query = JSON.stringify(req.query);
  const body = JSON.stringify(req.body);
  const url = req.url;
  
  // أنماط SQL Injection شائعة
  const sqlPatterns = [
    /union\s+select/i,
    /select\s+.*\s+from/i,
    /insert\s+into/i,
    /update\s+.*\s+set/i,
    /delete\s+from/i,
    /drop\s+table/i,
    /create\s+table/i,
    /alter\s+table/i,
    /exec\s*\(/i,
    /execute\s*\(/i,
    /--/,
    /\/\*/,
    /\*\//
  ];
  
  const allContent = `${query} ${body} ${url}`;
  
  for (const pattern of sqlPatterns) {
    if (pattern.test(allContent)) {
      console.log(`🚫 Blocked SQL Injection attempt: ${pattern} from ${req.ip}`);
      return res.status(403).json({ 
        success: false, 
        error: 'SQL_INJECTION_DETECTED',
        message: 'Malicious request blocked'
      });
    }
  }
  
  next();
}

// دالة حماية من XSS
function xssProtection(req, res, next) {
  // استثناء مسارات API الحساسة (login/register) من الفحص
  const apiPaths = ['/api/login', '/api/register', '/api/send-email-code', '/api/verify-code'];
  if (apiPaths.some(p => req.originalUrl.startsWith(p))) {
    return next(); // السماح بمسارات API بدون فحص
  }
  
  const query = JSON.stringify(req.query);
  const body = JSON.stringify(req.body);
  const url = req.url;
  
  // أنماط XSS شائعة
  const xssPatterns = [
    /<script/i,
    /<\/script>/i,
    /javascript:/i,
    /onload\s*=/i,
    /onerror\s*=/i,
    /onclick\s*=/i,
    /onmouseover\s*=/i,
    /onfocus\s*=/i,
    /onblur\s*=/i,
    /onchange\s*=/i,
    /data:text\/html/i,
    /data:application\/javascript/i
  ];
  
  const allContent = `${query} ${body} ${url}`;
  
  for (const pattern of xssPatterns) {
    if (pattern.test(allContent)) {
      console.log(`🚫 Blocked XSS attempt: ${pattern} from ${req.ip}`);
      return res.status(403).json({ 
        success: false, 
        error: 'XSS_DETECTED',
        message: 'Malicious request blocked'
      });
    }
  }
  
  next();
}

// دالة Rate Limiting محسنة
function enhancedRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 دقيقة
  const maxRequests = 100; // 100 طلب لكل 15 دقيقة
  
  // تنظيف الطلبات القديمة
  if (requestCounts.has(ip)) {
    const requests = requestCounts.get(ip).filter(time => now - time < windowMs);
    requestCounts.set(ip, requests);
  } else {
    requestCounts.set(ip, []);
  }
  
  const requests = requestCounts.get(ip);
  
  if (requests.length >= maxRequests) {
    console.log(`🚫 Rate limit exceeded for IP: ${ip}`);
    return res.status(429).json({ 
      success: false, 
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
      retryAfter: Math.ceil(windowMs / 1000)
    });
  }
  
  // إضافة الطلب الحالي
  requests.push(now);
  requestCounts.set(ip, requests);
  
  next();
}

// دالة التحقق من كلمة المرور
function validatePassword(password) {
  const errors = [];
  
  // التحقق من الطول
  if (password.length < 8) {
    errors.push('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
  }
  
  // التحقق من وجود حرف صغير
  if (!/[a-z]/.test(password)) {
    errors.push('كلمة المرور يجب أن تحتوي على حرف صغير واحد على الأقل');
  }
  
  // التحقق من وجود حرف كبير
  if (!/[A-Z]/.test(password)) {
    errors.push('كلمة المرور يجب أن تحتوي على حرف كبير واحد على الأقل');
  }
  
  // التحقق من وجود رقم
  if (!/\d/.test(password)) {
    errors.push('كلمة المرور يجب أن تحتوي على رقم واحد على الأقل');
  }
  
  // التحقق من وجود رمز خاص
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('كلمة المرور يجب أن تحتوي على رمز خاص واحد على الأقل (!@#$%^&*)');
  }
  
  // التحقق من عدم وجود معلومات شخصية شائعة
  const commonPatterns = [
    /123456/, /password/, /qwerty/, /abc123/, /admin/, /user/,
    /[0-9]{4,}/, // أرقام متتالية
    /(.)\1{2,}/  // تكرار نفس الحرف 3 مرات أو أكثر
  ];
  
  for (const pattern of commonPatterns) {
    if (pattern.test(password.toLowerCase())) {
      errors.push('كلمة المرور لا يجب أن تحتوي على معلومات شخصية أو أنماط شائعة');
      break;
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

// إضافة WAF Middleware بعد تعريف جميع الدوال
app.use(checkWAFHeaders);
app.use(apiSecurityMiddleware);
app.use(sqlInjectionProtection);
app.use(xssProtection);
app.use(enhancedRateLimit);

// Email sending function (simplified for demo)
async function sendEmail(to, subject, text) {
  console.log(`[EMAIL] Sending to: ${to}`);
  console.log(`[EMAIL] Subject: ${subject}`);
  console.log(`[EMAIL] Content: ${text}`);
  
  // في الإنتاج الحقيقي، استخدم خدمة إرسال البريد الإلكتروني
  return { ok: true, messageId: `demo_${Date.now()}` };
}

// Initialize Supabase with sample data
async function initSupabase() {
  try {
    console.log('🚀 تهيئة Supabase...');

    if (!supabaseAdmin) {
      console.warn('⚠️ لم يتم توفير SUPABASE_SERVICE_ROLE_KEY. سيتم تخطي تهيئة البيانات الافتراضية والتأكد من وجود المستخدمين والمنتجات.');
      return;
    }
    
    const client = supabaseAdmin;
    
    // إنشاء المستخدمين الافتراضيين
    const defaultUsers = [
      {
        user_number: '00001', // رقم المستخدم الأول
        name: 'روزان طميزي',
        email: 'bloom.company.ps@gmail.com',
        password: await bcrypt.hash('Bloom2024!@', 10),
        phone: '0566411202',
        address: 'فلسطين - غزة',
        role: 'admin',
        is_active: true
      },
      {
        user_number: '00002', // رقم المستخدم الثاني
        name: 'سارة أحمد',
        email: 'manager@bloom.com',
        password: await bcrypt.hash('Manager123!', 10),
        phone: '0566390702',
        address: 'فلسطين - رام الله',
        role: 'manager',
        is_active: true
      },
      {
        user_number: '00003', // رقم المستخدم الثالث
        name: 'محمد علي',
        email: 'user@bloom.com',
        password: await bcrypt.hash('User123!', 10),
        phone: '0566390703',
        address: 'فلسطين - نابلس',
        role: 'user',
        is_active: true
      }
    ];

    // إضافة المستخدمين إذا لم يكونوا موجودين
    for (const user of defaultUsers) {
      const { data: existingUser, error: existingUserError } = await client
        .from('users')
        .select('email')
        .eq('email', user.email)
        .maybeSingle();

      if (existingUserError && existingUserError.code !== 'PGRST116') {
        console.error(`❌ خطأ أثناء فحص المستخدم ${user.email}:`, existingUserError);
        continue;
      }
      
      if (!existingUser) {
        const { error } = await client
          .from('users')
          .insert([user]);
        
        if (error) {
          console.error(`❌ خطأ في إضافة المستخدم ${user.name}:`, error);
        } else {
          console.log(`✅ تم إضافة المستخدم: ${user.name}`);
        }
      }
    }

    // إنشاء المنتجات الافتراضية
    const defaultProducts = [
      {
        name: 'سيروب الفانيليا',
        description: 'سيروب فانيليا طبيعي 100%',
        price: 25.00,
        original_price: 20.00,
        category: 'سيروبات',
        image: '/images/vanilla-syrup.jpg',
        stock: 50,
        is_active: true
      },
      {
        name: 'سيروب الكراميل',
        description: 'سيروب كراميل فاخر',
        price: 30.00,
        original_price: 25.00,
        category: 'سيروبات',
        image: '/images/caramel-syrup.jpg',
        stock: 40,
        is_active: true
      },
      {
        name: 'مشروب الماتشا',
        description: 'مشروب ماتشا ياباني أصلي',
        price: 35.00,
        original_price: 30.00,
        category: 'مشروبات',
        image: '/images/matcha-drink.jpg',
        stock: 30,
        is_active: true
      },
      {
        name: 'كوب سيراميك',
        description: 'كوب سيراميك فاخر',
        price: 45.00,
        original_price: 40.00,
        category: 'أكواب',
        image: '/images/ceramic-cup.jpg',
        stock: 25,
        is_active: true
      }
    ];

    // إضافة المنتجات إذا لم تكن موجودة
    for (const product of defaultProducts) {
      const { data: existingProduct, error: existingProductError } = await client
        .from('products')
        .select('name')
        .eq('name', product.name)
        .maybeSingle();

      if (existingProductError && existingProductError.code !== 'PGRST116') {
        console.error(`❌ خطأ أثناء فحص المنتج ${product.name}:`, existingProductError);
        continue;
      }
      
      if (!existingProduct) {
        const { error } = await client
          .from('products')
          .insert([product]);
        
        if (error) {
          console.error(`❌ خطأ في إضافة المنتج ${product.name}:`, error);
        } else {
          console.log(`✅ تم إضافة المنتج: ${product.name}`);
        }
      }
    }

    // إنشاء الإعلانات الافتراضية
    const { data: existingAnnouncement, error: existingAnnouncementError } = await client
      .from('announcements')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existingAnnouncementError && existingAnnouncementError.code !== 'PGRST116') {
      console.error('❌ خطأ أثناء فحص الإعلانات:', existingAnnouncementError);
    }
    
    if (!existingAnnouncement) {
      const { error } = await client
        .from('announcements')
        .insert([{
          title: 'عرض خاص',
          content: 'خصم 20% على جميع المنتجات',
          image: '/images/special-offer.jpg',
          discount: 20,
          is_visible: true
        }]);
      
      if (error) {
        console.error('❌ خطأ في إضافة الإعلان:', error);
      } else {
        console.log('✅ تم إضافة الإعلان الافتراضي');
      }
    }

    console.log('🚀 تم تهيئة Supabase بنجاح!');
    
  } catch (error) {
    console.error('❌ خطأ في تهيئة Supabase:', error);
  }
}

async function verifySupabaseSeed() {
  if (!supabaseAdmin) {
    console.warn('ℹ️ لا يمكن التحقق من البيانات الأساسية بدون SUPABASE_SERVICE_ROLE_KEY.');
    return;
  }

  try {
    const [usersCheck, productsCheck, categoriesCheck] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('email, role')
        .in('email', DEFAULT_USER_EMAILS),
      supabaseAdmin
        .from('products')
        .select('name')
        .in('name', DEFAULT_PRODUCT_NAMES),
      supabaseAdmin
        .from('categories')
        .select('name')
        .in('name', DEFAULT_CATEGORY_NAMES)
    ]);

    const foundUsers = new Set(usersCheck.data?.map((u) => u.email) || []);
    const missingUsers = DEFAULT_USER_EMAILS.filter((email) => !foundUsers.has(email));

    const foundProducts = new Set(productsCheck.data?.map((p) => p.name) || []);
    const missingProducts = DEFAULT_PRODUCT_NAMES.filter((name) => !foundProducts.has(name));

    const foundCategories = new Set(categoriesCheck.data?.map((c) => c.name) || []);
    const missingCategories = DEFAULT_CATEGORY_NAMES.filter((name) => !foundCategories.has(name));

    console.log('🔍 تحقق من البيانات الأساسية في Supabase:');
    console.log(`   👥 المستخدمون الافتراضيون: ${missingUsers.length === 0 ? 'موجودون جميعاً' : `ناقص (${missingUsers.join(', ')})`}`);
    console.log(`   🛍️ المنتجات الأساسية: ${missingProducts.length === 0 ? 'موجودة جميعاً' : `ناقصة (${missingProducts.join(', ')})`}`);
    console.log(`   🗂️ الأصناف الأساسية: ${missingCategories.length === 0 ? 'موجودة جميعاً' : `ناقصة (${missingCategories.join(', ')})`}`);
  } catch (error) {
    console.error('❌ فشل التحقق من البيانات الأساسية في Supabase:', error);
  }
}

// التحقق من وجود المستخدمين الافتراضيين (باستخدام ANON_KEY أيضاً)
async function verifyUsersExist() {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('email, role, is_active')
      .in('email', DEFAULT_USER_EMAILS)
      .eq('is_active', true);
    
    if (error) {
      console.warn('⚠️ لا يمكن التحقق من المستخدمين:', error.message);
      return;
    }
    
    const foundEmails = new Set(users?.map(u => u.email) || []);
    const missingEmails = DEFAULT_USER_EMAILS.filter(email => !foundEmails.has(email));
    
    if (missingEmails.length > 0) {
      console.warn('⚠️ تحذير: المستخدمون التالية غير موجودين في قاعدة البيانات:');
      missingEmails.forEach(email => {
        console.warn(`   - ${email}`);
      });
      console.warn('   يرجى تشغيل ملف supabase_schema.sql على Supabase لإضافة المستخدمين.');
    } else {
      console.log('✅ جميع المستخدمين الافتراضيين موجودون في قاعدة البيانات');
    }
  } catch (error) {
    console.warn('⚠️ لا يمكن التحقق من المستخدمين:', error.message);
  }
}

// Routes
app.get('/api/health', (req, res) => {
  try {
    res.json({ 
      status: 'OK', 
      database: supabaseUrl && supabaseUrl !== 'https://your-project.supabase.co' ? 'Supabase Connected' : 'Supabase Not Configured',
      timestamp: new Date().toISOString(),
      supabase: {
        url: supabaseUrl && supabaseUrl !== 'https://your-project.supabase.co' ? 'Configured' : 'Not Configured',
        key: supabaseKey && supabaseKey !== 'your-anon-key' ? 'Configured' : 'Not Configured',
        serviceKey: supabaseServiceKey ? 'Configured' : 'Not Configured'
      },
      vercel: !!process.env.VERCEL,
      nodeEnv: process.env.NODE_ENV || 'development'
    });
  } catch (e) {
    res.status(500).json({ 
      status: 'ERROR', 
      error: e.message 
    });
  }
});

// تسجيل الدخول (بدون مصادقة ثنائية)
// ذاكرة محاولات الدخول لكل بريد (في الذاكرة فقط)
const loginAttemptsMap = new Map();

app.post('/api/login', async (req, res) => {
  try {
    console.log('🔐 بدء عملية تسجيل الدخول...');
    const { email, password } = req.body || {};
    if (!email || !password) {
      console.log('❌ بيانات ناقصة:', { email: !!email, password: !!password });
      return res.status(400).json({ success: false, error: 'EMAIL_AND_PASSWORD_REQUIRED' });
    }

    // التحقق من صحة البريد الإلكتروني
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('❌ البريد الإلكتروني غير صحيح:', email);
      return res.status(400).json({ success: false, error: 'INVALID_EMAIL_FORMAT' });
    }

    console.log('✅ البيانات الأساسية موجودة:', { email });

    // نظام الحظر المتدرج: 3 محاولات خطأ → حظر 15 د، ثم 20 د، ثم 30 د، ثم ساعة
    const now = Date.now();
    let entry = loginAttemptsMap.get(email);
    if (!entry) {
      entry = { 
        count: 0, 
        lockUntil: 0, 
        lockSequence: 0, // تتبع تسلسل الحظر: 0=15د، 1=20د، 2=30د، 3=60د
        lastResetTime: 0 // وقت آخر إعادة تعيين بعد ساعة
      };
      loginAttemptsMap.set(email, entry);
    }
    
    // التحقق من الحظر الحالي
    if (entry.lockUntil && now < entry.lockUntil) {
      const remaining = Math.ceil((entry.lockUntil - now) / 60000);
      console.log('🚫 الحساب محظور:', { email, remaining });
      return res.status(429).json({ success: false, error: 'ACCOUNT_LOCKED', minutes: remaining });
    }
    
    // إعادة التعيين بعد ساعة كاملة من آخر حظر (دورة جديدة)
    if (entry.lastResetTime && (now - entry.lastResetTime) >= 60 * 60000) {
      entry.count = 0;
      entry.lockSequence = 0;
      entry.lastResetTime = 0;
      loginAttemptsMap.set(email, entry);
      console.log('🔄 تم إعادة تعيين حالة الحظر');
    }
    
    // التحقق من وجود Supabase client
    if (!supabase && !supabaseAdmin) {
      console.error('❌ خطأ: Supabase client غير مهيأ');
      console.error('   يرجى التحقق من متغيرات البيئة:');
      console.error('   - SUPABASE_URL');
      console.error('   - SUPABASE_ANON_KEY');
      console.error('   - SUPABASE_SERVICE_ROLE_KEY (موصى به)');
      return res.status(500).json({ 
        success: false, 
        error: 'DATABASE_CONNECTION_ERROR',
        message: 'فشل الاتصال بقاعدة البيانات. يرجى التحقق من إعدادات Supabase على Railway.'
      });
    }
    
    // استخدام SERVICE_ROLE_KEY لتجاوز RLS
    const client = supabaseAdmin || supabase;
    const isUsingAdmin = !!supabaseAdmin;
    console.log(`🔑 استخدام العميل: ${isUsingAdmin ? 'SERVICE_ROLE_KEY (Admin)' : 'ANON_KEY'}`);
    
    console.log('🔍 البحث عن المستخدم في قاعدة البيانات...');
    const { data: users, error: fetchError } = await client
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .maybeSingle();

    if (fetchError) {
      console.error('❌ خطأ في جلب المستخدم:', fetchError);
      console.error('   تفاصيل الخطأ:', JSON.stringify(fetchError, null, 2));
      
      // رسالة خطأ أوضح
      let errorMessage = 'SERVER_ERROR';
      if (fetchError.code === 'PGRST116') {
        errorMessage = 'USER_NOT_FOUND';
      } else if (fetchError.code === '42501') {
        errorMessage = 'RLS_POLICY_ERROR';
      } else if (fetchError.message && fetchError.message.includes('Invalid API key')) {
        errorMessage = 'INVALID_API_KEY';
      }
      
      return res.status(500).json({ 
        success: false, 
        error: errorMessage,
        details: fetchError.message || 'خطأ في الاتصال بقاعدة البيانات',
        code: fetchError.code
      });
    }

    if (!users) {
      console.log('❌ المستخدم غير موجود أو غير نشط:', email);
      return res.status(401).json({ success: false, error: 'INVALID_CREDENTIALS' });
    }

    console.log('✅ تم العثور على المستخدم:', { id: users.id, email: users.email, role: users.role });
    console.log('🔐 التحقق من كلمة المرور...');
    console.log('   طول كلمة المرور المدخلة:', password.length);
    console.log('   طول كلمة المرور المحفوظة:', users.password ? users.password.length : 'غير موجود');
    console.log('   نوع كلمة المرور المحفوظة:', typeof users.password);
    console.log('   بداية كلمة المرور المحفوظة:', users.password ? users.password.substring(0, 10) + '...' : 'غير موجود');
    
    // التحقق من أن كلمة المرور المحفوظة هي hash صحيح
    if (!users.password || !users.password.startsWith('$2')) {
      console.error('❌ خطأ: كلمة المرور المحفوظة ليست hash صحيح!', { 
        password: users.password ? users.password.substring(0, 20) : 'null' 
      });
      return res.status(500).json({ 
        success: false, 
        error: 'INVALID_PASSWORD_FORMAT',
        message: 'كلمة المرور في قاعدة البيانات غير صحيحة'
      });
    }
    
    const passwordMatch = await bcrypt.compare(password, users.password);
    console.log('   نتيجة المقارنة:', passwordMatch ? '✅ نجحت' : '❌ فشلت');
    
    if (!passwordMatch) {
      entry.count += 1;
      
      // نظام الحظر المتدرج: 3 محاولات خطأ تسبب الحظر
      if (entry.count >= 3) {
        const lockDurations = [15, 20, 30, 60]; // دقائق: 15، 20، 30، 60 (ساعة)
        const lockIndex = Math.min(entry.lockSequence, lockDurations.length - 1);
        const lockMinutes = lockDurations[lockIndex];
        
        entry.lockUntil = now + lockMinutes * 60000;
        entry.lockSequence += 1;
        entry.count = 0; // إعادة تعيين العداد بعد الحظر
        
        // إذا وصلنا للساعة (60 دقيقة)، نحدد وقت إعادة التعيين
        if (lockMinutes === 60) {
          entry.lastResetTime = now;
          entry.lockSequence = 0; // إعادة التعيين للدورة الجديدة
        }
        
        loginAttemptsMap.set(email, entry);
        return res.status(429).json({ 
          success: false, 
          error: 'ACCOUNT_LOCKED', 
          minutes: lockMinutes,
          message: `تم حظر الحساب لمدة ${lockMinutes} دقيقة بسبب المحاولات الفاشلة`
        });
      }
      
      const remainingAttempts = 3 - entry.count;
      loginAttemptsMap.set(email, entry);
      console.log('❌ كلمة المرور غير صحيحة:', { remainingAttempts });
      return res.status(401).json({ 
        success: false, 
        error: 'INVALID_CREDENTIALS', 
        remainingAttempts,
        message: `كلمة المرور غير صحيحة. لديك ${remainingAttempts} محاولة${remainingAttempts > 1 ? 'ات' : 'ة'} متبقية`
      });
    }

    console.log('✅ كلمة المرور صحيحة!');

    // تحديث آخر تسجيل دخول
    console.log('📝 تحديث آخر تسجيل دخول...');
    const updateClient = supabaseAdmin || supabase;
    const { error: updateError } = await updateClient
      .from('users')
      .update({
        last_login: new Date().toISOString()
      })
      .eq('id', users.id);

    if (updateError) {
      console.error('⚠️ تحذير: فشل تحديث آخر تسجيل دخول:', updateError);
    } else {
      console.log('✅ تم تحديث آخر تسجيل دخول');
    }
    
    // نجاح: إعادة ضبط حالة المحاولات
    loginAttemptsMap.delete(email);
    
    console.log('🎫 إنشاء توكن JWT...');
    const token = jwt.sign(
      { userId: users.id, email: users.email, role: users.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    console.log('✅ تم تسجيل الدخول بنجاح:', { email, role: users.role });
    
    res.json({
      success: true,
      token,
      user: {
        id: users.id,
        user_number: users.user_number || 'N/A', // رقم المستخدم الفريد
        name: users.name,
        email: users.email,
        role: users.role,
        phone: users.phone,
        address: users.address
      }
    });
  } catch (e) {
    console.error('❌ خطأ عام في تسجيل الدخول:', e);
    console.error('   المكدس:', e.stack);
    res.status(500).json({ 
      success: false, 
      error: 'SERVER_ERROR',
      details: e.message 
    });
  }
});

// إنشاء حساب جديد مع تحقق من كلمة المرور
app.post('/api/register', async (req, res) => {
  try {
    console.log('📝 بدء عملية التسجيل...');
    const { name, email, password, phone, address } = req.body || {};

    // التحقق من البيانات المطلوبة
    if (!name || !email || !password) {
      console.log('❌ بيانات ناقصة:', { name: !!name, email: !!email, password: !!password });
      return res.status(400).json({ success: false, error: 'NAME_EMAIL_PASSWORD_REQUIRED' });
    }

    // التحقق من صحة البريد الإلكتروني
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('❌ البريد الإلكتروني غير صحيح:', email);
      return res.status(400).json({ success: false, error: 'INVALID_EMAIL_FORMAT' });
    }

    console.log('✅ البيانات الأساسية موجودة:', { name, email, phone: phone || 'غير محدد' });

    // التحقق من وجود Supabase client
    if (!supabase && !supabaseAdmin) {
      console.error('❌ خطأ: Supabase client غير مهيأ');
      return res.status(500).json({ 
        success: false, 
        error: 'DATABASE_CONNECTION_ERROR',
        message: 'فشل الاتصال بقاعدة البيانات. يرجى التحقق من إعدادات Supabase على Railway.'
      });
    }

    // التحقق من قوة كلمة المرور
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      console.log('❌ كلمة المرور ضعيفة:', passwordValidation.errors);
      return res.status(400).json({ 
        success: false, 
        error: 'WEAK_PASSWORD',
        message: 'كلمة المرور لا تستوفي الشروط المطلوبة',
        details: passwordValidation.errors
      });
    }

    console.log('✅ كلمة المرور قوية');

    // استخدام SERVICE_ROLE_KEY لتجاوز RLS (إن وُجد)، وإلا استخدام ANON_KEY
    // ملاحظة: يجب أن تكون هناك سياسة RLS تسمح بإنشاء حسابات جديدة
    const client = supabaseAdmin || supabase;
    const isUsingAdmin = !!supabaseAdmin;
    console.log(`🔑 استخدام العميل: ${isUsingAdmin ? 'SERVICE_ROLE_KEY (Admin - يتجاوز RLS)' : 'ANON_KEY (يتطلب سياسات RLS)'}`);
    
    if (!isUsingAdmin) {
      console.warn('⚠️ تحذير: استخدام ANON_KEY قد يفشل إذا لم تكن هناك سياسات RLS صحيحة');
    }
    
    // التحقق من وجود المستخدم
    console.log('🔍 التحقق من وجود المستخدم...');
    const { data: existingUser, error: existingUserError } = await client
      .from('users')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (existingUserError) {
      console.error('❌ خطأ في التحقق من المستخدم:', existingUserError);
      // إذا كان الخطأ ليس "لا يوجد نتائج" (PGRST116)، نعيد الخطأ
      if (existingUserError.code !== 'PGRST116') {
        // إذا كان الخطأ متعلق بـ RLS، نعطي رسالة واضحة
        if (existingUserError.code === '42501' || existingUserError.message?.includes('row-level security')) {
          return res.status(500).json({ 
            success: false, 
            error: 'RLS_POLICY_ERROR',
            message: 'خطأ في سياسات الأمان. يرجى التأكد من تشغيل ملف supabase_schema.sql على Supabase',
            details: existingUserError.message 
          });
        }
        return res.status(500).json({ 
          success: false, 
          error: 'SERVER_ERROR',
          details: existingUserError.message,
          code: existingUserError.code
        });
      }
    }

    if (existingUser) {
      console.log('❌ المستخدم موجود بالفعل:', email);
      return res.status(400).json({ success: false, error: 'USER_ALREADY_EXISTS' });
    }

    console.log('✅ المستخدم غير موجود، يمكن المتابعة');

    // تشفير كلمة المرور
    console.log('🔐 تشفير كلمة المرور...');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('✅ تم تشفير كلمة المرور (طول الهاش:', hashedPassword.length, ')');

    // التحقق من أن الهاش صحيح (اختبار)
    const testCompare = await bcrypt.compare(password, hashedPassword);
    if (!testCompare) {
      console.error('❌ خطأ: فشل التحقق من التشفير!');
      return res.status(500).json({ success: false, error: 'PASSWORD_HASH_ERROR' });
    }
    console.log('✅ التحقق من التشفير نجح');

    // إنشاء المستخدم الجديد
    const newUser = {
      name,
      email,
      password: hashedPassword,
      phone: phone || null,
      address: address || null,
      role: 'user',
      is_active: true
    };

    console.log('💾 محاولة إدراج المستخدم في قاعدة البيانات...');
    const { data: userData, error } = await client
      .from('users')
      .insert([newUser])
      .select()
      .single();
    
    if (error) {
      console.error('❌ خطأ في إدراج المستخدم:', error);
      console.error('   الكود:', error.code);
      console.error('   الرسالة:', error.message);
      console.error('   التفاصيل:', error.details);
      console.error('   الهينت:', error.hint);
      
      // معالجة خاصة لأخطاء RLS
      if (error.code === '42501' || error.message?.includes('row-level security') || error.message?.includes('policy')) {
        return res.status(500).json({ 
          success: false, 
          error: 'RLS_POLICY_ERROR',
          message: 'خطأ في سياسات الأمان (RLS). يرجى التأكد من:',
          details: [
            '1. تشغيل ملف supabase_schema.sql على Supabase SQL Editor',
            '2. التأكد من أن RLS معطل على جدول users أو أن هناك سياسة تسمح بإنشاء حسابات',
            '3. إضافة SUPABASE_SERVICE_ROLE_KEY في Vercel Environment Variables (اختياري لكن موصى به)'
          ],
          code: error.code,
          hint: error.hint
        });
      }
      
      return res.status(500).json({ 
        success: false, 
        error: 'SERVER_ERROR',
        details: error.message,
        code: error.code,
        hint: error.hint
      });
    }

    console.log('✅ تم إنشاء المستخدم بنجاح:', userData.email);
    
    // التحقق من أن كلمة المرور محفوظة بشكل صحيح
    const { data: verifyUser, error: verifyError } = await client
      .from('users')
      .select('password')
      .eq('id', userData.id)
      .single();
    
    if (verifyError) {
      console.warn('⚠️ تحذير: فشل التحقق من كلمة المرور المحفوظة:', verifyError);
    } else {
      const isPasswordCorrect = await bcrypt.compare(password, verifyUser.password);
      if (!isPasswordCorrect) {
        console.error('❌ خطأ خطير: كلمة المرور المحفوظة غير صحيحة!');
        return res.status(500).json({ success: false, error: 'PASSWORD_STORAGE_ERROR' });
      }
      console.log('✅ تم التحقق: كلمة المرور محفوظة بشكل صحيح');
    }
    
    res.json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح',
      user: {
        id: userData.id,
        user_number: userData.user_number || 'N/A', // رقم المستخدم الفريد
        name: userData.name,
        email: userData.email,
        role: userData.role,
        phone: userData.phone,
        address: userData.address
      }
    });
  } catch (e) {
    console.error('❌ خطأ عام في التسجيل:', e);
    console.error('   المكدس:', e.stack);
    res.status(500).json({ 
      success: false, 
      error: 'SERVER_ERROR',
      details: e.message 
    });
  }
});

// الحصول على المنتجات
app.get('/api/products', async (req, res) => {
  try {
    // التحقق من وجود supabase client
    if (!supabase) {
      console.warn('⚠️ Supabase client not initialized, returning empty products');
      return res.json({ success: true, products: [] });
    }

    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.warn('Products error:', error);
      return res.json({ success: true, products: [] });
    }
    
    // إرجاع الصيغة الصحيحة مع success و products
    res.json({ success: true, products: products || [] });
  } catch (e) {
    console.error('Products error:', e);
    res.json({ success: true, products: [] });
  }
});

// الحصول على منتج واحد
app.get('/api/products/:id', async (req, res) => {
  try {
    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error || !product) {
      return res.status(404).json({ success: false, error: 'PRODUCT_NOT_FOUND' });
    }
    
    res.json(product);
  } catch (e) {
    console.error('Product error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// إضافة منتج جديد (للأدمن فقط)
app.post('/api/products', async (req, res) => {
  try {
    const { name, description, price, originalPrice, category, image, stock } = req.body || {};

    if (!name || !description || !category || price == null || originalPrice == null) {
      return res.status(400).json({ success: false, error: 'MISSING_REQUIRED_FIELDS' });
    }

    let storedImagePath = null;
    if (image) {
      if (typeof image === 'string' && image.startsWith('data:image')) {
        storedImagePath = saveBase64Image(image, 'products');
      } else if (typeof image === 'string') {
        storedImagePath = image;
      }
    }

    if (!storedImagePath) {
      return res.status(400).json({ success: false, error: 'IMAGE_REQUIRED' });
    }

    const newProduct = {
      name,
      description,
      price: parseFloat(price),
      original_price: parseFloat(originalPrice),
      category,
      image: storedImagePath,
      stock: parseInt(stock),
      is_active: true
    };
    
    const { data: productData, error } = await supabase
      .from('products')
      .insert([newProduct])
      .select()
      .single();
    
    if (error) {
      console.error('Add product error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
    
    res.json({
      success: true,
      message: 'تم إضافة المنتج بنجاح',
      product: productData
    });
  } catch (e) {
    console.error('Add product error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// تحديث منتج
app.put('/api/products/:id', async (req, res) => {
  try {
    const { name, description, price, originalPrice, category, image, stock } = req.body || {};

    const updateData = {
      name,
      description,
      price: price != null ? parseFloat(price) : undefined,
      original_price: originalPrice != null ? parseFloat(originalPrice) : undefined,
      category,
      stock: stock != null ? parseInt(stock) : undefined,
      updated_at: new Date().toISOString()
    };

    if (image) {
      if (typeof image === 'string' && image.startsWith('data:image')) {
        updateData.image = saveBase64Image(image, 'products');
      } else if (typeof image === 'string') {
        updateData.image = image;
      }
    }

    // إزالة القيم غير المعروفة لتجنب الكتابة بـ undefined
    Object.keys(updateData).forEach((key) => {
      if (typeof updateData[key] === 'undefined') {
        delete updateData[key];
      }
    });
    
    const { error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', req.params.id);
    
    if (error) {
      console.error('Update product error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
    
    res.json({
      success: true,
      message: 'تم تحديث المنتج بنجاح'
    });
  } catch (e) {
    console.error('Update product error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// حذف منتج
app.delete('/api/products/:id', async (req, res) => {
  try {
    // التحقق من التوكن
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'TOKEN_REQUIRED' });
    }

    let userId, userRole;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
      userRole = decoded.role;
    } catch (e) {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    // فقط الأدمن والمدير يمكنهم حذف المنتجات
    if (userRole !== 'admin' && userRole !== 'manager') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', req.params.id);
    
    if (error) {
      console.error('Delete product error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
    
    res.json({
      success: true,
      message: 'تم حذف المنتج بنجاح'
    });
  } catch (e) {
    console.error('Delete product error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// إضافة طلب جديد
app.post('/api/orders', async (req, res) => {
  try {
    const { products, total, customerInfo } = req.body;
    
    const newOrder = {
      products,
      total: parseFloat(total),
      customer_info: customerInfo,
      status: 'pending'
    };
    
    const { data: orderData, error } = await supabase
      .from('orders')
      .insert([newOrder])
      .select()
      .single();
    
    if (error) {
      console.error('Add order error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }

    // Create notifications for admin and manager
    const title = 'طلب جديد';
    const msg = `تم إنشاء طلب جديد بمبلغ ${newOrder.total} شيكل`;
    await supabase.from('notifications').insert([
      { role: 'admin', type: 'order_created', title, message: msg, order_id: orderData.id },
      { role: 'manager', type: 'order_created', title, message: msg, order_id: orderData.id }
    ]);
    
    res.json({
      success: true,
      message: 'تم إضافة الطلب بنجاح وتم إرسال إشعار للإدارة',
      order: orderData
    });
  } catch (e) {
    console.error('Add order error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// الحصول على الطلبات (صلاحيات محددة)
app.get('/api/orders', async (req, res) => {
  try {
    // التحقق من التوكن
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'TOKEN_REQUIRED' });
    }

    let userRole = 'user';
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userRole = decoded.role;
    } catch (e) {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    // المدير يرى الطلبات فقط (لا يمكنه تعديلها)
    if (userRole === 'manager') {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Orders error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
    
      return res.json({
        success: true,
        orders: orders,
        permissions: {
          canEdit: false,
          canDelete: false,
          canView: true,
          role: 'manager'
        }
      });
    }

    // الأدمن يرى جميع الطلبات ويمكنه تعديلها
    if (userRole === 'admin') {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Orders error:', error);
        return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
      }
      
      return res.json({
        success: true,
        orders: orders,
        permissions: {
          canEdit: true,
          canDelete: true,
          canView: true,
          role: 'admin'
        }
      });
    }

    // المستخدم العادي يرى طلباته فقط
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Orders error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
    
    res.json({
      success: true,
      orders: orders,
      permissions: {
        canEdit: false,
        canDelete: false,
        canView: true,
        role: 'user'
      }
    });
  } catch (e) {
    console.error('Orders error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// Notifications APIs
app.get('/api/notifications', async (req, res) => {
  try {
    // verify token to get role
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'TOKEN_REQUIRED' });
    }
    let role = 'user';
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      role = decoded.role;
    } catch (e) {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }
    if (role !== 'admin' && role !== 'manager') {
      return res.status(403).json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' });
    }
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('role', role)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Notifications error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
    res.json({ success: true, notifications: data });
  } catch (e) {
    console.error('Notifications error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'TOKEN_REQUIRED' });
    }
    let role = 'user';
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      role = decoded.role;
    } catch (e) {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }
    if (role !== 'admin' && role !== 'manager') {
      return res.status(403).json({ success: false, error: 'INSUFFICIENT_PERMISSIONS' });
    }
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', req.params.id)
      .eq('role', role);
    if (error) {
      console.error('Read notification error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
    res.json({ success: true });
  } catch (e) {
    console.error('Read notification error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// تحديث حالة الطلب (الأدمن فقط)
app.put('/api/orders/:id', async (req, res) => {
  try {
    // التحقق من التوكن والصلاحيات
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'TOKEN_REQUIRED' });
    }

    let userRole = 'user';
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userRole = decoded.role;
    } catch (e) {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    // فقط الأدمن يمكنه تعديل الطلبات
    if (userRole !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'فقط الأدمن يمكنه تعديل الطلبات'
      });
    }

    const { status } = req.body;
    
    const { error } = await supabase
      .from('orders')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);
    
    if (error) {
      console.error('Update order error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
    
    res.json({
      success: true,
      message: 'تم تحديث حالة الطلب بنجاح'
    });
  } catch (e) {
    console.error('Update order error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// إحصائيات الموقع
app.get('/api/stats', async (req, res) => {
  try {
    const [productsResult, ordersResult, usersResult] = await Promise.all([
      supabase.from('products').select('id').eq('is_active', true),
      supabase.from('orders').select('total'),
      supabase.from('users').select('id').eq('is_active', true)
    ]);

    const totalRevenue = ordersResult.data?.reduce((sum, order) => {
      return sum + (order.total || 0);
    }, 0) || 0;

    const stats = {
      totalProducts: productsResult.data?.length || 0,
      totalOrders: ordersResult.data?.length || 0,
      totalRevenue,
      activeUsers: usersResult.data?.length || 0
    };
    
    res.json(stats);
  } catch (e) {
    console.error('Stats error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// تحديث معلومات المستخدم الشخصية
app.put('/api/profile', async (req, res) => {
  try {
    // التحقق من التوكن
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'TOKEN_REQUIRED' });
    }

    let userId;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
    } catch (e) {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    const { name, email, phone, address } = req.body || {};
    
    if (!name || !email || !phone || !address) {
      return res.status(400).json({ success: false, error: 'ALL_FIELDS_REQUIRED' });
    }

    // التحقق من وجود المستخدم
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (!existingUser) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
    }

    // التحقق من عدم استخدام البريد الإلكتروني من قبل مستخدم آخر
    if (email !== existingUser.email) {
      const { data: emailExists } = await supabase
        .from('users')
        .select('id')
      .eq('email', email)
        .neq('id', userId)
      .single();
    
      if (emailExists) {
        return res.status(400).json({ success: false, error: 'EMAIL_ALREADY_EXISTS' });
      }
    }

    // تحديث معلومات المستخدم
    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({
        name,
        email,
        phone,
        address,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Profile update error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }

    res.json({
      success: true,
      message: 'تم تحديث معلوماتك الشخصية بنجاح',
      user: {
        id: updatedUser.id,
        user_number: updatedUser.user_number || 'N/A', // رقم المستخدم الفريد
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        phone: updatedUser.phone,
        address: updatedUser.address
      }
    });
    } catch (e) {
    console.error('Profile update error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// تغيير كلمة المرور
app.put('/api/change-password', async (req, res) => {
  try {
    // التحقق من التوكن
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'TOKEN_REQUIRED' });
    }

    let userId, userRole;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
      userRole = decoded.role;
  } catch (e) {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    const { currentPassword, newPassword } = req.body || {};
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'PASSWORDS_REQUIRED' });
    }

    // التحقق من قوة كلمة المرور الجديدة
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        success: false, 
        error: 'WEAK_PASSWORD',
        message: 'كلمة المرور الجديدة لا تستوفي الشروط المطلوبة',
        details: passwordValidation.errors
      });
    }

    // التحقق من وجود المستخدم وكلمة المرور الحالية
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (!user) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
    }

    // التحقق من كلمة المرور الحالية
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return res.status(400).json({ success: false, error: 'INVALID_CURRENT_PASSWORD' });
    }

    // تشفير كلمة المرور الجديدة
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // تحديث كلمة المرور
    const { error } = await supabase
      .from('users')
      .update({
        password: hashedNewPassword,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      console.error('Password change error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }

    res.json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح'
    });
  } catch (e) {
    console.error('Password change error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// API: جلب الإعلان العام
app.get('/api/announcement', async (req, res) => {
  try {
    // التحقق من وجود supabase client
    if (!supabase) {
      return res.json({
        success: true,
        announcement: {
          title: '',
          content: '',
          image: null,
          is_visible: false,
          apply_discount: false,
          discount_percent: 0
        }
      });
    }

    const { data: announcement, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('is_visible', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.warn('Announcement fetch error:', error);
      return res.json({
        success: true,
        announcement: {
          title: '',
          content: '',
          image: null,
          is_visible: false,
          apply_discount: false,
          discount_percent: 0
        }
      });
    }

    res.json({
      success: true,
      announcement: announcement || {
        title: '',
        content: '',
        image: null,
        is_visible: false,
        apply_discount: false,
        discount_percent: 0
      }
    });
  } catch (e) {
    console.error('Announcement error:', e);
    res.json({
      success: true,
      announcement: {
        title: '',
        content: '',
        image: null,
        is_visible: false,
        apply_discount: false,
        discount_percent: 0
      }
    });
  }
});

// تم إلغاء المصادقة الثنائية - تم حذف API endpoints

// API: إرسال رمز OTP عبر SMS
app.post('/api/sms/send-code', async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) {
      return res.status(400).json({ success: false, error: 'PHONE_REQUIRED' });
    }

    // توليد رمز OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 دقائق

    // حفظ الرمز في الذاكرة
    if (!global.smsOTPMap) {
      global.smsOTPMap = new Map();
    }
    global.smsOTPMap.set(phone, { code: otp, expiresAt });

    // إرسال SMS (يجب إضافة خدمة SMS)
    console.log(`[SMS] OTP Code for ${phone}: ${otp}`);

    res.json({
      success: true,
      message: 'SMS_SENT'
    });
  } catch (e) {
    console.error('SMS send error:', e);
    res.status(500).json({ success: false, error: 'SEND_ERROR' });
  }
});

// API: إرسال رمز OTP عبر البريد الإلكتروني
app.post('/api/email/send-code', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, error: 'EMAIL_REQUIRED' });
    }

    // توليد رمز OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 دقائق

    // حفظ الرمز في الذاكرة
    if (!global.emailOTPMap) {
      global.emailOTPMap = new Map();
    }
    global.emailOTPMap.set(email, { code: otp, expiresAt });

    // إرسال البريد الإلكتروني (يجب إضافة nodemailer configuration)
    console.log(`[Email] OTP Code for ${email}: ${otp}`);

    res.json({
      success: true,
      message: 'EMAIL_SENT'
    });
  } catch (e) {
    console.error('Email send error:', e);
    res.status(500).json({ success: false, error: 'SEND_ERROR' });
  }
});

// API: تحديث معلومات المستخدم (للإدارة)
app.put('/api/users/update', async (req, res) => {
  try {
    // التحقق من التوكن
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'TOKEN_REQUIRED' });
    }

    let userId, userRole;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
      userRole = decoded.role;
    } catch (e) {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    // فقط الأدمن يمكنه تحديث المستخدمين الآخرين
    const { id, name, email, phone, role, is_active } = req.body || {};
    
    if (!id) {
      return res.status(400).json({ success: false, error: 'USER_ID_REQUIRED' });
    }

    // الأدمن فقط يمكنه تحديث المستخدمين الآخرين
    if (id !== userId && userRole !== 'admin') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    }

    // التحقق من وجود المستخدم
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (!existingUser) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
    }

    // تحديث معلومات المستخدم
    const updateData = {
      updated_at: new Date().toISOString()
    };

    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (role && userRole === 'admin') updateData.role = role;
    if (typeof is_active === 'boolean' && userRole === 'admin') updateData.is_active = is_active;

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('User update error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }

    res.json({
      success: true,
      message: 'تم تحديث معلومات المستخدم بنجاح',
      user: {
        id: updatedUser.id,
        user_number: updatedUser.user_number || 'N/A',
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        phone: updatedUser.phone,
        is_active: updatedUser.is_active
      }
    });
  } catch (e) {
    console.error('User update error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// API: إدارة الإعلانات (Admin only)
app.post('/api/admin/announcement', upload.single('image'), async (req, res) => {
  try {
    // التحقق من التوكن
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'TOKEN_REQUIRED' });
    }

    let userId, userRole;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
      userRole = decoded.role;
    } catch (e) {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    // فقط الأدمن يمكنه إدارة الإعلانات
    if (userRole !== 'admin') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    }

    const { isVisible, title, content, discountPercent, applyDiscount } = req.body;
    
    // حذف الإعلانات القديمة
    await supabase.from('announcements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // إضافة الإعلان الجديد
    const announcementData = {
      is_visible: isVisible === '1' || isVisible === true,
      title: title || '',
      content: content || '',
      discount_percent: parseFloat(discountPercent) || 0,
      apply_discount: applyDiscount === '1' || applyDiscount === true
    };

    if (req.file) {
      announcementData.image = `/uploads/announcements/${req.file.filename}`;
    }

    const { data: announcement, error } = await supabase
      .from('announcements')
      .insert([announcementData])
      .select()
      .single();

    if (error) {
      console.error('Announcement save error:', error);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }

    res.json({ success: true, announcement });
  } catch (e) {
    console.error('Announcement save error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// API: إحصائيات الأرباح (Admin only)
app.get('/api/admin/profits', async (req, res) => {
  try {
    // التحقق من التوكن
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'TOKEN_REQUIRED' });
    }

    let userId, userRole;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
      userRole = decoded.role;
    } catch (e) {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    // فقط الأدمن يمكنه رؤية الأرباح
    if (userRole !== 'admin') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    }

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'delivered');

    if (ordersError) {
      console.error('Orders fetch error:', ordersError);
      return res.json({
        success: true,
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        profitMargin: 0,
        productProfits: []
      });
    }

    let totalRevenue = 0;
    let totalCost = 0;
    const productProfits = {};

    orders?.forEach(order => {
      totalRevenue += parseFloat(order.total) || 0;
      const products = order.products || [];
      products.forEach(item => {
        const productId = item.id || item.productId;
        const quantity = item.quantity || 1;
        const price = parseFloat(item.price) || 0;
        const cost = parseFloat(item.cost) || (price * 0.6); // افتراضي 60% تكلفة
        
        if (!productProfits[productId]) {
          productProfits[productId] = {
            productId,
            name: item.name || 'منتج غير معروف',
            revenue: 0,
            cost: 0,
            profit: 0,
            quantity: 0
          };
        }
        
        productProfits[productId].revenue += price * quantity;
        productProfits[productId].cost += cost * quantity;
        productProfits[productId].profit += (price - cost) * quantity;
        productProfits[productId].quantity += quantity;
      });
    });

    Object.keys(productProfits).forEach(key => {
      totalCost += productProfits[key].cost;
    });

    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;

    res.json({
      success: true,
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin: parseFloat(profitMargin.toFixed(2)),
      productProfits: Object.values(productProfits)
    });
  } catch (e) {
    console.error('Profits error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// API: إحصائيات الأرباح الشهرية (Admin only)
app.get('/api/admin/profits/monthly', async (req, res) => {
  try {
    // التحقق من التوكن
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, error: 'TOKEN_REQUIRED' });
    }

    let userId, userRole;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
      userRole = decoded.role;
    } catch (e) {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    // فقط الأدمن يمكنه رؤية الأرباح
    if (userRole !== 'admin') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN' });
    }

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'delivered');

    if (ordersError) {
      return res.json({ success: true, monthly: [] });
    }

    const monthlyData = {};
    
    orders?.forEach(order => {
      const date = new Date(order.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          revenue: 0,
          cost: 0,
          profit: 0
        };
      }
      
      const revenue = parseFloat(order.total) || 0;
      const cost = revenue * 0.6; // افتراضي 60% تكلفة
      const profit = revenue - cost;
      
      monthlyData[monthKey].revenue += revenue;
      monthlyData[monthKey].cost += cost;
      monthlyData[monthKey].profit += profit;
    });

    res.json({
      success: true,
      monthly: Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month))
    });
  } catch (e) {
    console.error('Monthly profits error:', e);
    res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});

// Serve static files (CSS, JS, images) - يجب أن يكون بعد API routes
// Route محدد للملفات الثابتة قبل express.static
app.get(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/, (req, res, next) => {
  try {
    // محاولة مسارات متعددة لـ Vercel
    const paths = [
      path.join(__dirname, 'public', req.path),
      path.join(process.cwd(), 'public', req.path),
      path.join(__dirname, req.path.replace(/^\//, ''))
    ];
    
    for (const filePath of paths) {
      try {
        if (fs.existsSync(filePath)) {
          return res.sendFile(filePath);
        }
      } catch (e) {
        // تجاهل الخطأ والمحاولة التالية
      }
    }
    
    next(); // الانتقال إلى express.static
  } catch (e) {
    console.error('Static file error:', e);
    next(); // الانتقال إلى express.static
  }
});

// استخدام express.static كـ fallback لخدمة الملفات الثابتة
// في Vercel، نستخدم process.cwd() بدلاً من __dirname
const publicPath = process.env.VERCEL 
  ? path.join(process.cwd(), 'public')
  : path.join(__dirname, 'public');

app.use(express.static(publicPath, {
  index: false, // لا نخدم index.html تلقائياً
  dotfiles: 'ignore'
}));

// Serve index.html for all non-API routes (SPA fallback)
app.get(/^(?!\/api).*/, (req, res) => {
  try {
    // Skip if it's a static file request
    if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/.test(req.path)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // في Vercel، الملفات الثابتة تكون في نفس المجلد
    const indexPath = path.join(__dirname, 'public', 'index.html');
    // التحقق من وجود الملف
    try {
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        // محاولة مسار بديل لـ Vercel
        const altPath = path.join(process.cwd(), 'public', 'index.html');
        if (fs.existsSync(altPath)) {
          res.sendFile(altPath);
        } else {
          console.error('❌ ملف index.html غير موجود في:', indexPath);
          res.status(404).json({ 
            error: 'Page not found',
            message: 'index.html file not found'
          });
        }
      }
    } catch (fileError) {
      console.error('❌ خطأ في قراءة index.html:', fileError);
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'Failed to load index.html'
      });
    }
  } catch (e) {
    console.error('❌ خطأ في تحميل index.html:', e);
    res.status(500).json({ 
      error: 'Internal server error',
      message: e.message,
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
});

// بدء الخادم بعد تهيئة Supabase (مع معالجة أخطاء أفضل)
// تأخير initSupabase حتى لا يسبب crash عند بدء التشغيل على Vercel
if (!process.env.VERCEL) {
  // فقط في البيئة المحلية، نستدعي initSupabase
  initSupabase()
    .then(() => verifySupabaseSeed())
    .then(() => {
      // التحقق النهائي من وجود المستخدمين
      return verifyUsersExist();
    })
    .catch(error => {
      console.error('❌ فشل في تهيئة Supabase:', error);
      // لا نوقف التطبيق، نستمر في العمل حتى لو فشلت التهيئة
      console.warn('⚠️ التطبيق سيعمل بدون البيانات الافتراضية');
    });
}

// Vercel doesn't need app.listen - it handles the server
if (!process.env.VERCEL) {
      app.listen(PORT, () => {
        console.log('✅ Connected to Supabase database');
        console.log('');
        console.log('🚀 Server running on port', PORT);
        console.log('');
        console.log('📱 http://localhost:' + PORT);
        console.log('');
        console.log('🗄️  Database: Supabase');
        console.log('');
        console.log('🔐 Password encryption: Enabled (bcrypt)');
        console.log('');
        console.log('✅ Application ready for local use');
        console.log('');
        console.log('🔐 Login credentials for users:');
        console.log('');
        console.log('   👑 Main Admin:');
      console.log('      Email: bloom.company.ps@gmail.com');
      console.log('      Password: Bloom2024!@');
        console.log('');
        console.log('   👨‍💼 Sub Manager:');
        console.log('      Email: manager@bloom.com');
        console.log('      Password: Manager123!');
        console.log('');
        console.log('   👤 Regular User:');
        console.log('      Email: user@bloom.com');
        console.log('      Password: User123!');
        console.log('');
        console.log('✅ Site ready for local use with Supabase!');
      });
}

module.exports = app;
