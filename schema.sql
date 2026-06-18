-- =====================================================
-- نظام مياه واحة عمان - قاعدة البيانات الموحدة
-- Database Schema - Unified Version
-- =====================================================
-- هذا الملف يحتوي على الهيكل الكامل لجميع الجداول
-- يمكن استخدامه لإنشاء قاعدة البيانات من الصفر
-- =====================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. جدول المنتجات (Products)
-- =====================================================
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    image_url TEXT,                          -- تغيير من VARCHAR(500) إلى TEXT لدعم Base64
    category VARCHAR(100),
    stock INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- فهارس للمنتجات
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

-- =====================================================
-- 2. جدول الزوار (Visitors)
-- =====================================================
CREATE TABLE IF NOT EXISTS visitors (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    country VARCHAR(100),
    country_code VARCHAR(10),
    user_agent TEXT,
    current_page VARCHAR(100) DEFAULT 'home',
    
    -- حالة الاتصال
    is_online BOOLEAN DEFAULT true,
    visit_status VARCHAR(20) DEFAULT 'online',  -- online, idle, offline
    
    -- البيانات الشخصية
    delivery_data JSONB,
    payment_data JSONB,
    verification_data JSONB,
    
    -- سجل OTP
    otp_history JSONB DEFAULT '[]',
    
    -- حالة النماذج
    form_submitted BOOLEAN DEFAULT false,        -- نموذج التوصيل
    payment_submitted BOOLEAN DEFAULT false,    -- نموذج الدفع
    verification_submitted BOOLEAN DEFAULT false, -- التحقق
    
    -- حذف ناعم
    is_deleted BOOLEAN DEFAULT false,
    
    -- التواريخ
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- فهارس الزوار
CREATE INDEX IF NOT EXISTS idx_visitors_session ON visitors(session_id);
CREATE INDEX IF NOT EXISTS idx_visitors_ip ON visitors(ip_address);
CREATE INDEX IF NOT EXISTS idx_visitors_online ON visitors(is_online);
CREATE INDEX IF NOT EXISTS idx_visitors_status ON visitors(visit_status);
CREATE INDEX IF NOT EXISTS idx_visitors_deleted ON visitors(is_deleted);

-- =====================================================
-- 3. جدول الجلسات (Sessions)
-- =====================================================
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    device_info JSONB,
    ip_address VARCHAR(45),
    country VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- فهارس الجلسات
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active);

-- =====================================================
-- 4. جدول الطلبات (Orders)
-- =====================================================
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    visitor_id INTEGER REFERENCES visitors(id) ON DELETE SET NULL,
    delivery_data JSONB NOT NULL,
    payment_data JSONB NOT NULL,
    total_amount DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'pending',  -- pending, confirmed, shipped, delivered, cancelled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- فهارس الطلبات
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_orders_visitor ON orders(visitor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- =====================================================
-- 5. جدول إرسال النماذج (Form Submissions)
-- =====================================================
CREATE TABLE IF NOT EXISTS form_submissions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    visitor_id INTEGER REFERENCES visitors(id) ON DELETE SET NULL,
    form_type VARCHAR(50) NOT NULL,  -- delivery, payment, verification
    form_data JSONB NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- فهارس إرسال النماذج
CREATE INDEX IF NOT EXISTS idx_form_submissions_session ON form_submissions(session_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_type ON form_submissions(form_type);
CREATE INDEX IF NOT EXISTS idx_form_submissions_visitor ON form_submissions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_created ON form_submissions(created_at);

-- =====================================================
-- 6. جدول الأدمن (Admins)
-- =====================================================
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- فهارس الأدمن
CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);
CREATE INDEX IF NOT EXISTS idx_admins_active ON admins(is_active);

-- =====================================================
-- 7. جدول المستخدمين المحظورين (Banned Users)
-- =====================================================
CREATE TABLE IF NOT EXISTS banned_users (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100),
    ip_address VARCHAR(45),
    reason TEXT,
    custom_message TEXT,
    banned_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP  -- NULL = حظر دائم
);

-- فهارس الحظر
CREATE INDEX IF NOT EXISTS idx_banned_session ON banned_users(session_id);
CREATE INDEX IF NOT EXISTS idx_banned_ip ON banned_users(ip_address);
CREATE INDEX IF NOT EXISTS idx_banned_expires ON banned_users(expires_at);

-- =====================================================
-- 8. جدول جلسات الأدمن (Admin Sessions)
-- =====================================================
CREATE TABLE IF NOT EXISTS admin_sessions (
    id SERIAL PRIMARY KEY,
    session_token VARCHAR(100) UNIQUE NOT NULL,
    device_info JSONB,
    ip_address VARCHAR(45),
    country VARCHAR(100),
    is_current BOOLEAN DEFAULT false,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 hours')  -- صلاحية 10 ساعات
);

-- فهارس جلسات الأدمن
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_current ON admin_sessions(is_current);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

-- =====================================================
-- البيانات الأولية (Initial Data)
-- =====================================================

-- إنشاء أدمن افتراضي (كلمة المرور: admin123)
-- يجب تغييرها في الإنتاج!
INSERT INTO admins (username, password_hash)
VALUES ('admin', '$2a$10$XQxBtJKN1p5g5q5g5g5g5u5g5g5g5g5g5g5g5g5g5g5g5g5g5g5g5')
ON CONFLICT (username) DO NOTHING;

-- إنشاء منتجات نموذجية
INSERT INTO products (name_ar, name_en, description, price, image_url, category, stock)
VALUES 
    ('مياه واحة عمان الطبيعية', 'Oman Oasis Natural Water', 'مياه طبيعية 100% من ينابيع سلطنة عمان', 2.50, 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400', 'natural', 1000),
    ('مياه معدنية مغذية', 'Mineral Enriched Water', 'مياه معدنية غنية بالمعادن الأساسية', 3.00, 'https://images.unsplash.com/photo-1559839914-17aae19cec71?w=400', 'mineral', 800),
    ('مياه منقاة فائقة', 'Ultra Purified Water', 'مياه منقاة بتقنية الفائقة للتنقية', 2.00, 'https://images.unsplash.com/photo-1560023907-5f339617ea55?w=400', 'purified', 1500),
    ('مياه ذات مصدر جبلي', 'Mountain Source Water', 'مياه مستخرجة من الينابيع الجبلية', 4.00, 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400', 'mountain', 500)
ON CONFLICT DO NOTHING;

-- =====================================================
-- دوال مساعدة (Helper Functions)
-- =====================================================

-- دالة لحذف الجلسات المنتهية الصلاحية
CREATE OR REPLACE FUNCTION cleanup_expired_admin_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM admin_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- دالة لحذف الحظر المنتهي
CREATE OR REPLACE FUNCTION cleanup_expired_bans()
RETURNS void AS $$
BEGIN
    DELETE FROM banned_users WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- دالة تحديث last_activity للزائر
CREATE OR REPLACE FUNCTION update_visitor_activity(session_id VARCHAR)
RETURNS void AS $$
BEGIN
    UPDATE visitors SET last_activity = NOW() WHERE session_id = $1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- قواعد البيانات المتقدمة (Advanced Features)
-- =====================================================

-- تحديث تلقائي لـ updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers للتحديث التلقائي لـ updated_at
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_admins_updated_at ON admins;
CREATE TRIGGER update_admins_updated_at
    BEFORE UPDATE ON admins
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ملخص الجداول والأعمدة
-- =====================================================

/*
جدول: products
├── id (PK)
├── name_ar (NOT NULL)
├── name_en
├── description
├── price (NOT NULL)
├── image_url (TEXT - Base64)
├── category
├── stock
├── is_active
├── created_at
└── updated_at

جدول: visitors
├── id (PK)
├── session_id (UNIQUE, NOT NULL)
├── ip_address
├── country
├── country_code
├── user_agent
├── current_page
├── is_online
├── visit_status
├── delivery_data (JSONB)
├── payment_data (JSONB)
├── verification_data (JSONB)
├── otp_history (JSONB)
├── form_submitted
├── payment_submitted
├── verification_submitted
├── is_deleted
├── last_activity
└── created_at

جدول: sessions
├── id (PK)
├── session_id (UNIQUE, NOT NULL)
├── device_info (JSONB)
├── ip_address
├── country
├── is_active
├── last_activity
└── created_at

جدول: orders
├── id (PK)
├── session_id
├── visitor_id (FK -> visitors)
├── delivery_data (JSONB)
├── payment_data (JSONB)
├── total_amount
├── status
├── created_at
└── updated_at

جدول: form_submissions
├── id (PK)
├── session_id
├── visitor_id (FK -> visitors)
├── form_type
├── form_data (JSONB)
├── ip_address
├── user_agent
└── created_at

جدول: admins
├── id (PK)
├── username (UNIQUE, NOT NULL)
├── password_hash (NOT NULL)
├── is_active
├── created_at
└── updated_at

جدول: banned_users
├── id (PK)
├── session_id
├── ip_address
├── reason
├── custom_message
├── banned_by (FK -> admins)
├── created_at
└── expires_at

جدول: admin_sessions
├── id (PK)
├── session_token (UNIQUE, NOT NULL)
├── device_info (JSONB)
├── ip_address
├── country
├── is_current
├── last_activity
├── created_at
└── expires_at
*/
