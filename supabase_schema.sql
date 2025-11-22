-- ========================================
-- Supabase Schema for Bloom Store
-- ========================================
-- هذا الملف يحتوي على Schema كامل لقاعدة بيانات Supabase
-- يجب تشغيله في Supabase SQL Editor
-- ========================================

-- تفعيل UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- جدول المستخدمين
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_number VARCHAR(10) UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'manager', 'admin')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

-- إضافة الأعمدة المفقودة في جدول users إذا لم تكن موجودة
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'user_number'
    ) THEN
        ALTER TABLE users ADD COLUMN user_number VARCHAR(10);
        CREATE UNIQUE INDEX IF NOT EXISTS users_user_number_key ON users(user_number);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_login'
    ) THEN
        ALTER TABLE users ADD COLUMN last_login TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Sequence لإنشاء أرقام المستخدمين
CREATE SEQUENCE IF NOT EXISTS user_number_seq START 1;

-- Function لإنشاء رقم المستخدم تلقائياً
CREATE OR REPLACE FUNCTION generate_user_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
    formatted_num VARCHAR(10);
BEGIN
    IF NEW.user_number IS NOT NULL AND NEW.user_number != '' THEN
        RETURN NEW;
    END IF;
    
    next_num := nextval('user_number_seq');
    formatted_num := LPAD(next_num::TEXT, 5, '0');
    NEW.user_number := formatted_num;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger لإنشاء رقم المستخدم تلقائياً
DROP TRIGGER IF EXISTS trigger_generate_user_number ON users;
CREATE TRIGGER trigger_generate_user_number
    BEFORE INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION generate_user_number();

-- جدول الأصناف
CREATE TABLE IF NOT EXISTS categories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    image VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إضافة الأعمدة المفقودة في جدول categories إذا لم تكن موجودة
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE categories ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'image'
    ) THEN
        ALTER TABLE categories ADD COLUMN image VARCHAR(500);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'description'
    ) THEN
        ALTER TABLE categories ADD COLUMN description TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE categories ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'categories' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE categories ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- جدول المنتجات
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL CHECK (price > 0),
    category_id UUID REFERENCES categories(id),
    stock INTEGER DEFAULT 0 CHECK (stock >= 0),
    image VARCHAR(500),
    images TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إضافة الأعمدة المفقودة في جدول products إذا لم تكن موجودة
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'category_id'
    ) THEN
        ALTER TABLE products ADD COLUMN category_id UUID REFERENCES categories(id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'images'
    ) THEN
        ALTER TABLE products ADD COLUMN images TEXT[];
    END IF;
END $$;

-- جدول الطلبات
CREATE TABLE IF NOT EXISTS orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    total DECIMAL(10, 2) NOT NULL CHECK (total > 0),
    status VARCHAR(50) DEFAULT 'pending',
    shipping_address TEXT,
    phone VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إضافة عمود user_id إذا لم يكن موجوداً في جدول orders
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN user_id UUID REFERENCES users(id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'total'
    ) THEN
        ALTER TABLE orders ADD COLUMN total DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (total > 0);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'status'
    ) THEN
        ALTER TABLE orders ADD COLUMN status VARCHAR(50) DEFAULT 'pending';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'shipping_address'
    ) THEN
        ALTER TABLE orders ADD COLUMN shipping_address TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'phone'
    ) THEN
        ALTER TABLE orders ADD COLUMN phone VARCHAR(20);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'notes'
    ) THEN
        ALTER TABLE orders ADD COLUMN notes TEXT;
    END IF;
END $$;

-- جدول عناصر الطلب
CREATE TABLE IF NOT EXISTS order_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- جدول الإعلانات
CREATE TABLE IF NOT EXISTS announcements (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title VARCHAR(255),
    content TEXT,
    image VARCHAR(500),
    discount DECIMAL(5, 2) DEFAULT 0 CHECK (discount >= 0 AND discount <= 100),
    apply_discount BOOLEAN DEFAULT false,
    discount_percent DECIMAL(5, 2) DEFAULT 0,
    is_visible BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إضافة الأعمدة المفقودة في جدول announcements إذا لم تكن موجودة
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'announcements' AND column_name = 'apply_discount'
    ) THEN
        ALTER TABLE announcements ADD COLUMN apply_discount BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'announcements' AND column_name = 'discount_percent'
    ) THEN
        ALTER TABLE announcements ADD COLUMN discount_percent DECIMAL(5, 2) DEFAULT 0;
    END IF;
END $$;

-- Indexes للأداء
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

-- Row Level Security Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Policy: المستخدمون يمكنهم رؤية بياناتهم فقط
DROP POLICY IF EXISTS "Users can view own data" ON users;
CREATE POLICY "Users can view own data" ON users
    FOR SELECT USING (true);

-- Policy: السماح بإنشاء حسابات جديدة (التسجيل)
DROP POLICY IF EXISTS "Users can register" ON users;
CREATE POLICY "Users can register" ON users
    FOR INSERT WITH CHECK (true);

-- Policy: السماح بتحديث بيانات المستخدم نفسه
DROP POLICY IF EXISTS "Users can update own data" ON users;
CREATE POLICY "Users can update own data" ON users
    FOR UPDATE USING (true);

-- Policy: المنتجات مرئية للجميع
DROP POLICY IF EXISTS "Products are viewable by everyone" ON products;
CREATE POLICY "Products are viewable by everyone" ON products
    FOR SELECT USING (true);

-- Policy: الأصناف مرئية للجميع
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON categories;
CREATE POLICY "Categories are viewable by everyone" ON categories
    FOR SELECT USING (true);

-- Policy: الإعلانات مرئية للجميع
DROP POLICY IF EXISTS "Announcements are viewable by everyone" ON announcements;
CREATE POLICY "Announcements are viewable by everyone" ON announcements
    FOR SELECT USING (is_visible = true);

-- Policy: المستخدمون يمكنهم إنشاء طلباتهم
DROP POLICY IF EXISTS "Users can create own orders" ON orders;
CREATE POLICY "Users can create own orders" ON orders
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: المستخدمون يمكنهم رؤية طلباتهم فقط
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
CREATE POLICY "Users can view own orders" ON orders
    FOR SELECT USING (auth.uid() = user_id);

-- ========================================
-- إدراج البيانات الافتراضية
-- ========================================

-- المستخدمين الافتراضيين
INSERT INTO users (user_number, name, email, password, phone, address, role, is_active) VALUES
('00001', 'روزان طميزي', 'bloom.company.ps@gmail.com', '$2b$10$2PqlwCvHACPls673LUiu4OuRB3IpwwzyjtA6EW5Q4T3CWXyb90m7a', '0566411202', 'فلسطين - غزة', 'admin', true),
('00002', 'سارة أحمد', 'manager@bloom.com', '$2b$10$eSZRB1treUUzR/wdzuGD.OHpTYuWbjCSOokN550dgq8mSa9Y3C9Q6', '0566390702', 'فلسطين - رام الله', 'manager', true),
('00003', 'محمد علي', 'user@bloom.com', '$2b$10$CR7d3V3Y8wu3UEii/HsyD.K2qqhyGQZWVZhjwK5Q4vOpla3fzUg.m', '0566390703', 'فلسطين - نابلس', 'user', true)
ON CONFLICT (email) DO UPDATE SET
    password = EXCLUDED.password,
    user_number = EXCLUDED.user_number,
    updated_at = NOW();

-- الأصناف الافتراضية
INSERT INTO categories (name, description, is_active) VALUES
('سيروبات', 'سيروبات فاخرة بنكهات متنوعة', true),
('مشروبات', 'مشروبات ساخنة وباردة', true),
('أكواب', 'أكواب سيراميك وفخارية', true),
('حلويات', 'حلويات شرقية وغربية', true),
('إكسسوارات', 'إكسسوارات للمنزل والمكتب', true)
ON CONFLICT (name) DO NOTHING;

-- ========================================
-- ملاحظات
-- ========================================
-- 
-- بيانات تسجيل الدخول:
-- 👑 الأدمن:
--    Email: bloom.company.ps@gmail.com
--    Password: Bloom2024!@
--
-- 👨‍💼 المدير:
--    Email: manager@bloom.com
--    Password: Manager123!
--
-- 👤 المستخدم:
--    Email: user@bloom.com
--    Password: User123!
--
-- ========================================
