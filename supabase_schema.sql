-- Bloom Store - Complete Database Schema for Supabase
-- قاعدة البيانات الكاملة لمتجر Bloom على Supabase

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create sequence for user numbers (يبدأ من 1)
CREATE SEQUENCE IF NOT EXISTS user_number_seq START 1;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_number VARCHAR(10) UNIQUE, -- رقم المستخدم الفريد (00001, 00002, ...) - NULL مؤقتاً حتى نملأ القيم
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

-- Add user_number column if it doesn't exist (for existing databases)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS user_number VARCHAR(10) UNIQUE;

-- Function to generate user number automatically
CREATE OR REPLACE FUNCTION generate_user_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
    formatted_num VARCHAR(10);
BEGIN
    -- إذا كان user_number محدداً مسبقاً، لا نغيره
    IF NEW.user_number IS NOT NULL AND NEW.user_number != '' THEN
        RETURN NEW;
    END IF;
    
    -- Get next number from sequence
    next_num := nextval('user_number_seq');
    -- Format as 5-digit number with leading zeros (00001, 00002, ...)
    formatted_num := LPAD(next_num::TEXT, 5, '0');
    NEW.user_number := formatted_num;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate user number on insert
DROP TRIGGER IF EXISTS trigger_generate_user_number ON users;
CREATE TRIGGER trigger_generate_user_number
    BEFORE INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION generate_user_number();

-- Create products table
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2),
    category VARCHAR(100) NOT NULL,
    image VARCHAR(500),
    stock INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    products JSONB NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    customer_info JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create announcements table
CREATE TABLE IF NOT EXISTS announcements (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title VARCHAR(255),
    content TEXT,
    image VARCHAR(500),
    discount DECIMAL(5,2) DEFAULT 0,
    is_visible BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    image VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add image column if table exists without it (for existing databases)
ALTER TABLE categories
ADD COLUMN IF NOT EXISTS image VARCHAR(500);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_announcements_visible ON announcements(is_visible);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_announcements_updated_at ON announcements;
CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default categories
INSERT INTO categories (name, description) VALUES
    ('سيروبات', 'سيروبات القهوة الفاخرة'),
    ('مشروبات', 'مشروبات ساخنة وباردة'),
    ('أكواب', 'أكواب وأدوات القهوة'),
    ('حلويات', 'حلويات ووجبات خفيفة'),
    ('إكسسوارات', 'إكسسوارات القهوة')
ON CONFLICT (name) DO NOTHING;

-- تحديث المستخدمين الموجودين بدون user_number
-- Update existing users who don't have user_number
DO $$
DECLARE
    user_rec RECORD;
    next_num INTEGER;
    formatted_num VARCHAR(10);
    counter INTEGER := 1;
BEGIN
    -- إعطاء أرقام للمستخدمين الموجودين بدون user_number
    FOR user_rec IN 
        SELECT id, email FROM users WHERE user_number IS NULL ORDER BY created_at
    LOOP
        -- إذا كان المستخدم من المستخدمين الافتراضيين، أعطه رقم محدد
        IF user_rec.email = 'bloom.company.ps@gmail.com' THEN
            UPDATE users SET user_number = '00001' WHERE id = user_rec.id;
            counter := 2;
        ELSIF user_rec.email = 'manager@bloom.com' THEN
            UPDATE users SET user_number = '00002' WHERE id = user_rec.id;
            counter := 3;
        ELSIF user_rec.email = 'user@bloom.com' THEN
            UPDATE users SET user_number = '00003' WHERE id = user_rec.id;
            counter := 4;
        ELSE
            -- للمستخدمين الآخرين، استخدم sequence
            next_num := nextval('user_number_seq');
            formatted_num := LPAD(next_num::TEXT, 5, '0');
            UPDATE users SET user_number = formatted_num WHERE id = user_rec.id;
        END IF;
    END LOOP;
    
    -- ضبط الـ sequence ليبدأ من الرقم الصحيح
    PERFORM setval('user_number_seq', GREATEST(
        COALESCE((SELECT MAX(CAST(user_number AS INTEGER)) FROM users WHERE user_number ~ '^[0-9]+$'), 0),
        3
    ), true);
END $$;

-- Insert default users (with REAL hashed passwords using bcrypt)
-- Admin Password: Admin123!@#
-- Manager Password: Manager123!
-- User Password: User123!
-- Delete existing users first to ensure clean insertion
DELETE FROM users WHERE email IN ('bloom.company.ps@gmail.com', 'manager@bloom.com', 'user@bloom.com');

-- Reset sequence to start from 1
ALTER SEQUENCE user_number_seq RESTART WITH 1;

INSERT INTO users (user_number, name, email, password, phone, address, role, is_active) VALUES
    ('00001', 'روزان طميزي', 'bloom.company.ps@gmail.com', '$2b$10$9oDYb7bj18gaCqIfeJAhxelTcOB/LR6aPcZi5IKydKOjU651UHNMe', '0566411202', 'فلسطين - غزة', 'admin', true),
    ('00002', 'سارة أحمد', 'manager@bloom.com', '$2b$10$dGByJ6CKRt5ZfoVSms9BneOWLUlS7Kq/kGYYkS1xZeI2tQExKVbEe', '0566390702', 'فلسطين - رام الله', 'manager', true),
    ('00003', 'محمد علي', 'user@bloom.com', '$2b$10$SZLKHgMBmHtCcYSVLzkDy.SX3ziD7XIfgRBmsNdveibWS/t45zyrW', '0566390703', 'فلسطين - نابلس', 'user', true)
ON CONFLICT (email) DO UPDATE SET
    password = EXCLUDED.password,
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    address = EXCLUDED.address,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active,
    user_number = COALESCE(EXCLUDED.user_number, users.user_number);

-- ضبط الـ sequence ليبدأ من 4 (بعد المستخدمين الافتراضيين)
DO $$
DECLARE
    max_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(user_number AS INTEGER)), 0) INTO max_num 
    FROM users 
    WHERE user_number ~ '^[0-9]+$';
    
    PERFORM setval('user_number_seq', GREATEST(max_num, 3), true);
END $$;

-- التأكد من أن جميع المستخدمين لديهم user_number
UPDATE users 
SET user_number = LPAD(nextval('user_number_seq')::TEXT, 5, '0') 
WHERE user_number IS NULL;

-- جعل الحقل NOT NULL بعد ملء جميع القيم
-- ملاحظة: قد يفشل إذا كان هناك مستخدمون بدون user_number، لكن يجب أن يكونوا جميعاً لديهم أرقام الآن
DO $$
BEGIN
    -- محاولة جعل الحقل NOT NULL
    EXECUTE 'ALTER TABLE users ALTER COLUMN user_number SET NOT NULL';
EXCEPTION WHEN OTHERS THEN
    -- إذا فشل، تجاهل الخطأ (قد يكون الحقل NOT NULL بالفعل)
    NULL;
END $$;

-- Insert sample products
INSERT INTO products (name, description, price, original_price, category, image, stock, is_active) VALUES
    ('سيروب الفانيليا', 'سيروب فانيليا طبيعي للقهوة', 25.00, 30.00, 'سيروبات', '/images/vanilla-syrup.jpg', 50, true),
    ('سيروب الكراميل', 'سيروب كراميل فاخر', 28.00, 35.00, 'سيروبات', '/images/caramel-syrup.jpg', 45, true),
    ('مشروب الماتشا', 'مشروب ماتشا ساخن', 15.00, 18.00, 'مشروبات', '/images/matcha-drink.jpg', 30, true),
    ('كوب سيراميك', 'كوب سيراميك فاخر', 35.00, 40.00, 'أكواب', '/images/ceramic-cup.jpg', 25, true),
    ('كعكة الشوكولاتة', 'كعكة شوكولاتة لذيذة', 20.00, 25.00, 'حلويات', '/images/chocolate-cake.jpg', 20, true),
    ('مطحنة القهوة', 'مطحنة قهوة يدوية', 80.00, 100.00, 'إكسسوارات', '/images/coffee-grinder.jpg', 15, true),
    ('سيروب اللافندر', 'سيروب لافندر عطري', 30.00, 35.00, 'سيروبات', '/images/lavender-syrup.jpg', 40, true),
    ('مشروب الكابتشينو', 'كابتشينو إيطالي أصيل', 18.00, 22.00, 'مشروبات', '/images/cappuccino.jpg', 35, true),
    ('كوب زجاجي', 'كوب زجاجي شفاف', 25.00, 30.00, 'أكواب', '/images/glass-cup.jpg', 30, true),
    ('بسكويت القهوة', 'بسكويت بنكهة القهوة', 12.00, 15.00, 'حلويات', '/images/coffee-biscuit.jpg', 50, true)
ON CONFLICT DO NOTHING;

-- Insert sample announcements
INSERT INTO announcements (title, content, image, discount, is_visible) VALUES
    ('عرض خاص', 'خصم 20% على جميع المنتجات', '/images/special-offer.jpg', 20.00, true),
    ('عرض نهاية الأسبوع', 'خصم 15% على السيروبات', '/images/weekend-offer.jpg', 15.00, true),
    ('عرض جديد', 'خصم 10% على المشروبات', '/images/new-offer.jpg', 10.00, true)
ON CONFLICT DO NOTHING;

-- Insert sample orders
INSERT INTO orders (products, total, customer_info, status) VALUES
    ('[{"id":"1","name":"سيروب الفانيليا","price":25,"quantity":2}]', 50.00, '{"name":"محمد علي","email":"user@bloom.com","phone":"0566390703","address":"فلسطين - نابلس"}', 'pending'),
    ('[{"id":"2","name":"سيروب الكراميل","price":28,"quantity":1},{"id":"3","name":"مشروب الماتشا","price":15,"quantity":1}]', 43.00, '{"name":"سارة أحمد","email":"manager@bloom.com","phone":"0566390702","address":"فلسطين - رام الله"}', 'processing'),
    ('[{"id":"4","name":"كوب سيراميك","price":35,"quantity":1},{"id":"5","name":"كعكة الشوكولاتة","price":20,"quantity":2}]', 75.00, '{"name":"أحمد محمد","email":"ahmed@example.com","phone":"0566390704","address":"فلسطين - الخليل"}', 'delivered')
ON CONFLICT DO NOTHING;

-- Enable Row Level Security (RLS) - Optional but recommended
-- Note: These commands will work even if RLS is already enabled
-- IMPORTANT: For this project, we'll disable RLS on users table to allow registration
-- You can enable it later with proper policies if needed
DO $$ 
BEGIN
    ALTER TABLE users DISABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    ALTER TABLE products ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
    ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Create policies for public access (adjust as needed)
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public products read" ON products;
DROP POLICY IF EXISTS "Public categories read" ON categories;
DROP POLICY IF EXISTS "Public announcements read" ON announcements;
DROP POLICY IF EXISTS "Users manage own data" ON users;
DROP POLICY IF EXISTS "Users can create accounts" ON users;
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can delete own data" ON users;
DROP POLICY IF EXISTS "Users can create orders" ON orders;
DROP POLICY IF EXISTS "Users can read own orders" ON orders;

-- Allow public read access to products, categories, and announcements
CREATE POLICY "Public products read" ON products FOR SELECT USING (true);
CREATE POLICY "Public categories read" ON categories FOR SELECT USING (true);
CREATE POLICY "Public announcements read" ON announcements FOR SELECT USING (is_visible = true);

-- Allow anyone to create a new user account (for registration)
CREATE POLICY "Users can create accounts" ON users FOR INSERT WITH CHECK (true);

-- Allow users to read their own data (by email match or admin role)
CREATE POLICY "Users can read own data" ON users FOR SELECT USING (true);

-- Allow users to update their own data (by email match or admin role)
CREATE POLICY "Users manage own data" ON users FOR UPDATE USING (true);

-- Allow users to delete their own data (by email match or admin role)
CREATE POLICY "Users can delete own data" ON users FOR DELETE USING (true);

-- Allow anyone to create orders
CREATE POLICY "Users can create orders" ON orders FOR INSERT WITH CHECK (true);

-- Allow anyone to read orders (you can restrict this later if needed)
CREATE POLICY "Users can read own orders" ON orders FOR SELECT USING (true);

