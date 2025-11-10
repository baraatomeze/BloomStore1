const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_ANON_KEY in environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Store verification codes (in production, use Redis or database)
const verificationCodes = new Map();

// Generate secure verification code
function generateSecureCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send Email using Gmail (Free)
async function sendEmail(email, code) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER || 'bloom.company.ps@gmail.com',
                pass: process.env.EMAIL_PASSWORD // Gmail App Password (Free)
            }
        });
        
        const mailOptions = {
            from: process.env.EMAIL_FROM || 'Bloom <bloom.company.ps@gmail.com>',
            to: email,
            subject: '🔐 كود التحقق من Bloom',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #602C34, #8B4513); color: white; padding: 20px; text-align: center;">
                        <h1 style="margin: 0;">🌸 Bloom</h1>
                        <p style="margin: 10px 0 0 0;">كود التحقق الخاص بك</p>
                    </div>
                    
                    <div style="padding: 30px; background: #f9f9f9;">
                        <h2 style="color: #602C34; text-align: center;">رمز التحقق</h2>
                        
                        <div style="background: white; border: 2px solid #602C34; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
                            <h1 style="color: #602C34; font-size: 36px; letter-spacing: 8px; margin: 0;">${code}</h1>
                        </div>
                        
                        <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;">
                            <p style="margin: 0; color: #856404;">
                                <strong>⚠️ تنبيه:</strong> هذا الكود صالح لمدة 5 دقائق فقط. لا تشارك هذا الكود مع أي شخص.
                            </p>
                        </div>
                        
                        <p style="text-align: center; color: #666;">
                            إذا لم تطلب هذا الكود، يرجى تجاهل هذا البريد الإلكتروني.
                        </p>
                    </div>
                    
                    <div style="background: #602C34; color: white; padding: 20px; text-align: center;">
                        <p style="margin: 0;">مع تحيات فريق Bloom 🌸</p>
                    </div>
                </div>
            `
        };
        
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
}

// API Routes

// User Registration with Password Encryption
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        
        // Check if user already exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
        
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'البريد الإلكتروني مستخدم بالفعل' 
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Create new user
        const { data: user, error: insertError } = await supabase
            .from('users')
            .insert({
                name,
                email,
                password: hashedPassword,
                phone,
                role: 'user',
                is_active: true,
                created_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (insertError) {
            throw insertError;
        }
        
        res.json({ 
            success: true, 
            message: 'تم إنشاء الحساب بنجاح',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Error in registration:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في إنشاء الحساب' 
        });
    }
});

// User Login with Password Verification
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user by email
        const { data: user, error: findError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
        
        if (findError || !user) {
            return res.status(401).json({ 
                success: false, 
                error: 'بيانات غير صحيحة' 
            });
        }
        
        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false, 
                error: 'بيانات غير صحيحة' 
            });
        }
        
        // Update last login
        await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', user.id);
        
        // Create JWT token
        const token = jwt.sign(
            { userId: user.id, role: user.role }, 
            process.env.JWT_SECRET || 'bloom_jwt_secret_key_2024',
            { expiresIn: '24h' }
        );
        
        res.json({ 
            success: true, 
            message: 'تم تسجيل الدخول بنجاح',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone
            },
            token
        });
    } catch (error) {
        console.error('Error in login:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في تسجيل الدخول' 
        });
    }
});

// Send verification code via Email (Free)
app.post('/api/send-email-code', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                error: 'البريد الإلكتروني مطلوب' 
            });
        }
        
        // Generate verification code
        const code = generateSecureCode();
        
        // Store code with expiry (5 minutes)
        verificationCodes.set(email, {
            code,
            expiry: Date.now() + (5 * 60 * 1000)
        });
        
        // Send Email (Free)
        const result = await sendEmail(email, code);
        
        if (result.success) {
            res.json({ 
                success: true, 
                message: 'تم إرسال كود التحقق بنجاح',
                messageId: result.messageId
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: 'فشل في إرسال كود التحقق',
                details: result.error
            });
        }
    } catch (error) {
        console.error('Error in Email API:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في الخادم' 
        });
    }
});

// Verify code
app.post('/api/verify-code', (req, res) => {
    try {
        const { identifier, code } = req.body;
        
        if (!identifier || !code) {
            return res.status(400).json({ 
                success: false, 
                error: 'المعرف والكود مطلوبان' 
            });
        }
        
        const storedData = verificationCodes.get(identifier);
        
        if (!storedData) {
            return res.status(400).json({ 
                success: false, 
                error: 'لم يتم العثور على كود تحقق لهذا المعرف' 
            });
        }
        
        // Check if code expired
        if (Date.now() > storedData.expiry) {
            verificationCodes.delete(identifier);
            return res.status(400).json({ 
                success: false, 
                error: 'كود التحقق منتهي الصلاحية' 
            });
        }
        
        // Check if code matches
        if (storedData.code !== code) {
            return res.status(400).json({ 
                success: false, 
                error: 'كود التحقق غير صحيح' 
            });
        }
        
        // Code is valid - remove it from storage
        verificationCodes.delete(identifier);
        
        res.json({ 
            success: true, 
            message: 'تم التحقق من الكود بنجاح' 
        });
    } catch (error) {
        console.error('Error in verification API:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في الخادم' 
        });
    }
});

// Product Management APIs
app.post('/api/products', async (req, res) => {
    try {
        const { name, price, description, image, category, stock } = req.body;
        
        const { data: product, error } = await supabase
            .from('products')
            .insert({
                name,
                price,
                description,
                image,
                category,
                stock: stock || 0,
                created_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) {
            throw error;
        }
        
        res.json({ 
            success: true, 
            message: 'تم إضافة المنتج بنجاح',
            product
        });
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في إضافة المنتج' 
        });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        const { data: products, error } = await supabase
            .from('products')
            .select('*');
        
        if (error) {
            throw error;
        }
        
        res.json({ 
            success: true, 
            products: products || []
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في جلب المنتجات' 
        });
    }
});

// Order Management APIs
app.post('/api/orders', async (req, res) => {
    try {
        const { customerName, customerEmail, customerPhone, customerAddress, shippingLocation, shippingCost, items, totalAmount } = req.body;
        
        const { data: order, error } = await supabase
            .from('orders')
            .insert({
                customer_name: customerName,
                customer_email: customerEmail,
                customer_phone: customerPhone,
                customer_address: customerAddress,
                shipping_location: shippingLocation,
                shipping_cost: shippingCost,
                items: items,
                total_amount: totalAmount,
                status: 'pending',
                created_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) {
            throw error;
        }
        
        res.json({ 
            success: true, 
            message: 'تم إنشاء الطلب بنجاح',
            order
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في إنشاء الطلب' 
        });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            throw error;
        }
        
        res.json({ 
            success: true, 
            orders: orders || []
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ 
            success: false, 
            error: 'خطأ في جلب الطلبات' 
        });
    }
});

// Clean up expired codes (run every 1 minute)
setInterval(() => {
    const now = Date.now();
    for (const [identifier, data] of verificationCodes.entries()) {
        if (now > data.expiry) {
            verificationCodes.delete(identifier);
        }
    }
}, 1 * 60 * 1000);

// Health check
app.get('/api/health', async (req, res) => {
    try {
        // Test Supabase connection
        const { data, error } = await supabase.from('users').select('count').limit(1);
        
        res.json({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            service: 'Bloom Server with Supabase',
            database: error ? 'Disconnected' : 'Connected',
            platform: process.env.VERCEL ? 'Vercel' : 'Local'
        });
    } catch (error) {
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            service: 'Bloom Server with Supabase',
            database: 'Error',
            platform: process.env.VERCEL ? 'Vercel' : 'Local',
            error: error.message
        });
    }
});

// SPA Fallback - Serve index.html for non-API routes
app.get(/^(?!\/api).*/, (req, res) => {
    const path = require('path');
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            res.status(404).json({ error: 'Not Found' });
        }
    });
});

// Start server locally only (Vercel will handle the server)
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🚀 Bloom Server running on http://localhost:${PORT}`);
        console.log(`🗄️ Database: Supabase`);
        console.log(`🔐 Password Encryption: Enabled (bcrypt)`);
        console.log(`📧 Email Service: ${process.env.EMAIL_PASSWORD ? 'Enabled (Free)' : 'Disabled'}`);
        console.log(`💰 Cost: FREE - No charges`);
    });
}

// Export app for Vercel
module.exports = app;
