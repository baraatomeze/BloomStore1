const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://baraatomeze_db_user:<db_password>@cluster0.rwds1ij.mongodb.net/bloom?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('✅ Connected to MongoDB Atlas');
});

// User Schema with Password Encryption
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Will be encrypted with bcrypt
    role: { type: String, enum: ['admin', 'manager', 'user'], default: 'user' },
    phone: String,
    createdAt: { type: Date, default: Date.now },
    lastLogin: Date,
    isActive: { type: Boolean, default: true }
});

// Encrypt password before saving
userSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 12);
    }
    next();
});

// Method to verify password
userSchema.methods.verifyPassword = async function(password) {
    return await bcrypt.compare(password, this.password);
};

const User = mongoose.model('User', userSchema);

// Product Schema
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: String,
    image: String,
    category: String,
    stock: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

// Order Schema
const orderSchema = new mongoose.Schema({
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerAddress: { type: String, required: true },
    shippingLocation: { type: String, required: true },
    shippingCost: { type: Number, required: true },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        price: Number,
        quantity: Number
    }],
    totalAmount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'confirmed', 'shipped', 'delivered'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

// Store verification codes (in production, use Redis or database)
const verificationCodes = new Map();

// Generate secure verification code
function generateSecureCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send Email using Gmail (Free)
async function sendEmail(email, code) {
    try {
        const transporter = nodemailer.createTransporter({
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
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                error: 'البريد الإلكتروني مستخدم بالفعل' 
            });
        }
        
        // Create new user (password will be encrypted automatically)
        const user = new User({
            name,
            email,
            password, // Will be encrypted by pre-save hook
            phone,
            role: 'user'
        });
        
        await user.save();
        
        res.json({ 
            success: true, 
            message: 'تم إنشاء الحساب بنجاح',
            user: {
                id: user._id,
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
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'بيانات غير صحيحة' 
            });
        }
        
        // Verify password
        const isValidPassword = await user.verifyPassword(password);
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false, 
                error: 'بيانات غير صحيحة' 
            });
        }
        
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        
        // Create JWT token
        const token = jwt.sign(
            { userId: user._id, role: user.role }, 
            process.env.JWT_SECRET || 'bloom_jwt_secret_key_2024',
            { expiresIn: '24h' }
        );
        
        res.json({ 
            success: true, 
            message: 'تم تسجيل الدخول بنجاح',
            user: {
                id: user._id,
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
        
        // Store code with expiry (1 minute)
        verificationCodes.set(email, {
            code,
            expiry: Date.now() + (1 * 60 * 1000)
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
        const { identifier, code } = req.body; // identifier can be email or phone
        
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
        
        const product = new Product({
            name,
            price,
            description,
            image,
            category,
            stock
        });
        
        await product.save();
        
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
        const products = await Product.find({});
        res.json({ 
            success: true, 
            products 
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
        
        const order = new Order({
            customerName,
            customerEmail,
            customerPhone,
            customerAddress,
            shippingLocation,
            shippingCost,
            items,
            totalAmount
        });
        
        await order.save();
        
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
        const orders = await Order.find({}).populate('items.productId');
        res.json({ 
            success: true, 
            orders 
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
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Bloom Server with MongoDB & Password Encryption',
        database: db.readyState === 1 ? 'Connected' : 'Disconnected'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Bloom Server running on port ${PORT}`);
    console.log(`🗄️ Database: MongoDB Atlas`);
    console.log(`🔐 Password Encryption: Enabled (bcrypt)`);
    console.log(`📧 Email Service: ${process.env.EMAIL_PASSWORD ? 'Enabled (Free)' : 'Disabled'}`);
    console.log(`💰 Cost: FREE - No charges`);
});
