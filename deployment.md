# دليل النشر الشامل - نظام مياه واحة عمان

## 📋 جدول المحتويات
1. [المتطلبات الأساسية](#المتطلبات-الأساسية)
2. [إعداد البيئة](#إعداد-البيئة)
3. [نسخ المشروع](#نسخ-المشروع)
4. [إعداد قاعدة البيانات](#إعداد-قاعدة-البيانات)
5. [إعداد المتغيرات البيئية](#إعداد-المتغيرات-البيئية)
6. [تثبيت التبعيات](#تثبيت-التبعيات)
7. [تشغيل السيرفر](#تشغيل-السيرفر)
8. [إعداد SSL/HTTPS](#إعداد-sslhttps)
9. [إعداد PM2 للإدارة](#إعداد-pm2-للإدارة)
10. [إعداد Nginx كـ Reverse Proxy](#إعداد-nginx-كـ-reverse-proxy)
11. [إعداد الجدار الناري](#إعداد-الجدار-الناري)
12. [المراقبة والصيانة](#المراقبة-والصيانة)
13. [النسخ الاحتياطي](#النسخ-الاحتياطي)
14. [استكشاف الأخطاء](#استكشاف-الأخطاء)

---

## 1. المتطلبات الأساسية

### النظام
- **نظام التشغيل**: Ubuntu 20.04 LTS / 22.04 LTS (موصى به)
- **المعالج**: 1 Core كحد أدنى (2 Cores موصى به)
- **الذاكرة**: 1 GB RAM كحد أدنى (2 GB موصى به)
- **المساحة**: 10 GB كحد أدنى

### البرامج المطلوبة
```bash
# تحديث النظام
sudo apt update && sudo apt upgrade -y

# تثبيت الأدوات الأساسية
sudo apt install -y curl wget git unzip software-properties-common
```

### Node.js
```bash
# تثبيت Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# التحقق
node --version  # v18.x.x
npm --version   # 9.x.x
```

### PostgreSQL (إذا كنت تستخدم سيرفر محلي)
```bash
# تثبيت PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# بدء الخدمة
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

---

## 2. إعداد البيئة

### إنشاء مستخدم للنظام
```bash
# إنشاء مستخدم جديد
sudo adduser wahatapp
sudo usermod -aG sudo wahatapp

# التبديل للمستخدم الجديد
sudo su - wahatapp
```

---

## 3. نسخ المشروع

```bash
# الانتقال لمجلد المنزل
cd ~

# استنساخ المشروع (استبدل برابط المستودع الخاص بك)
git clone https://github.com/yourusername/wahatqatar.git

# أو نسخ الملفات يدوياً
mkdir -p wahatqatar
cd wahatqatar

# نقل ملفات المشروع
# (انسخ جميع ملفات المشروع إلى هذا المجلد)
```

---

## 4. إعداد قاعدة البيانات

### الخيار أ: Neon Cloud (موصى به للإنتاج)
1. أنشئ حساب على [Neon](https://neon.tech)
2. أنشئ مشروع جديد
3. احصل على رابط الاتصال (Connection String)
4. الصيغة: `postgresql://username:password@host/database?sslmode=require`

### الخيار ب: قاعدة بيانات محلية
```bash
# تسجيل الدخول كـ postgres
sudo -u postgres psql

# إنشاء مستخدم وقاعدة بيانات
CREATE USER wahatadmin WITH PASSWORD 'your_secure_password';
CREATE DATABASE wahatqatar OWNER wahatadmin;
GRANT ALL PRIVILEGES ON DATABASE wahatqatar TO wahatadmin;

# الخروج
\q
```

### تشغيل ملف Schema
```bash
cd ~/wahatqatar/backend
psql -U wahatadmin -d wahatqatar -f ../../schema.sql
```

---

## 5. إعداد المتغيرات البيئية

### إنشاء ملف .env
```bash
cd ~/wahatqatar/backend
nano .env
```

### محتوى ملف .env
```env
# ===========================================
# قاعدة البيانات
# ===========================================
# ل Neon Cloud:
DATABASE_URL=postgresql://username:password@ep-xxx-xxx-xxx-xxxx.neon.tech/wahatqatar?sslmode=require

# لسيرفر محلي:
# DATABASE_URL=postgresql://wahatadmin:your_secure_password@localhost:5432/wahatqatar

# ===========================================
# إعدادات السيرفر
# ===========================================
PORT=3000
NODE_ENV=production

# ===========================================
# أمان الأدمن
# ===========================================
# كلمة المرور الافتراضية (تغييرها في الإنتاج!)
ADMIN_DEFAULT_PASSWORD=CHANGE_THIS_SECURE_PASSWORD
# كلمة مرور إضافية
ADMIN_PASSWORD=ANOTHER_SECURE_PASSWORD

# ===========================================
# CORS - النطاقات المسموحة
# ===========================================
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# ===========================================
# ملفات
# ===========================================
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=5242880
```

### تأمين ملف .env
```bash
chmod 600 ~/wahatqatar/backend/.env
```

---

## 6. تثبيت التبعيات

```bash
cd ~/wahatqatar/backend

# تثبيت التبعيات
npm install --production

# أو باستخدام pnpm (أسرع)
npm install -g pnpm
pnpm install --prod
```

### التحقق من التثبيت
```bash
node -e "console.log('Node.js is working!')"
npm list  # يجب أن يظهر جميع الحزم
```

---

## 7. تشغيل السيرفر

### تشغيل مباشر (للاختبار)
```bash
cd ~/wahatqatar/backend
node server.js
```

### التحقق
```bash
# في terminal آخر
curl http://localhost:3000/api/health
# يجب أن يعود: {"status":"ok","timestamp":"..."}
```

---

## 8. إعداد SSL/HTTPS

### استخدام Certbot (Let's Encrypt)
```bash
# تثبيت Certbot
sudo apt install -y certbot python3-certbot-nginx

# الحصول على الشهادة (استبدل yourdomain.com بنطاقك)
sudo certbot --nginx -d yourdomain.com -d admin.yourdomain.com
```

### تجديد تلقائي
```bash
# اختبار التجديد
sudo certbot renew --dry-run

# إعداد cron job للتجديد التلقائي
sudo crontab -e
# أضف السطر التالي:
0 0 * * * certbot renew --quiet
```

---

## 9. إعداد PM2 للإدارة

### التثبيت
```bash
# تثبيت PM2 عالمياً
sudo npm install -g pm2

# أو كـ user global
npm install -g pm2
```

### إنشاء ملف ecosystem
```bash
cd ~/wahatqatar/backend
nano ecosystem.config.js
```

### محتوى ecosystem.config.js
```javascript
module.exports = {
  apps: [{
    name: 'wahatqatar-backend',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // إعدادات الأمان
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

### إنشاء مجلد السجلات
```bash
mkdir -p ~/wahatqatar/backend/logs
```

### التشغيل
```bash
# بدء التطبيق
pm2 start ecosystem.config.js

# حفظ الحالة
pm2 save

# إعداد بدء تلقائي عند إعادة التشغيل
pm2 startup
# اتبع التعليمات التي تظهر
```

### أوامر مفيدة
```bash
pm2 list              # عرض حالة التطبيقات
pm2 logs wahatqatar-backend  # عرض السجلات
pm2 restart wahatqatar-backend  # إعادة التشغيل
pm2 stop wahatqatar-backend    # الإيقاف
pm2 delete wahatqatar-backend  # الحذف
pm2 monit             # مراقبة في الوقت الحقيقي
```

---

## 10. إعداد Nginx كـ Reverse Proxy

### التثبيت
```bash
sudo apt install -y nginx
```

### إنشاء ملف التكوين
```bash
sudo nano /etc/nginx/sites-available/wahatqatar
```

### محتوى التكوين
```nginx
# upstream للأدمن
upstream wahat_backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

# تحويل HTTP إلى HTTPS
server {
    listen 80;
    server_name yourdomain.com admin.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/yourdomain.com/chain.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # الأمان
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # الملفات الثابتة
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        root /home/wahatapp/wahatqatar/frontend;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # الواجهة الأمامية
    location / {
        root /home/wahatapp/wahatqatar/frontend;
        try_files $uri $uri/ /index.html;
        index index.html;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://wahat_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://wahat_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    #Logs
    access_log /var/log/nginx/wahat_access.log;
    error_log /var/log/nginx/wahat_error.log;
}

# لوحة التحكم (subdomain)
server {
    listen 443 ssl http2;
    server_name admin.yourdomain.com;

    # SSL (نفس الشهادة)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # إعادة توجيه للواجهة مع hash في المسار
    location / {
        root /home/wahatapp/wahatqatar/frontend/admin;
        try_files $uri $uri/ /index.html;
    }
}
```

### التفعيل
```bash
# تفعيل الموقع
sudo ln -s /etc/nginx/sites-available/wahatqatar /etc/nginx/sites-enabled/

# التحقق من التكوين
sudo nginx -t

# إعادة تشغيل Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 11. إعداد الجدار الناري

```bash
# تثبيت UFW
sudo apt install -y ufw

# القواعد الأساسية
sudo ufw default deny incoming
sudo ufw default allow outgoing

# السماح بالخدمات
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https

# تفعيل الجدار الناري
sudo ufw enable

# عرض الحالة
sudo ufw status verbose
```

---

## 12. المراقبة والصيانة

### إعداد Logrotate
```bash
sudo nano /etc/logrotate.d/wahatqatar
```

```bash
/home/wahatapp/wahatqatar/backend/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 wahatapp wahatapp
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### مراقبة الموارد
```bash
# إنشاء سكريبت المراقبة
nano ~/monitor.sh
```

```bash
#!/bin/bash
# مراقبة استخدام الموارد

echo "=== استخدام الذاكرة ==="
free -h

echo ""
echo "=== استخدام القرص ==="
df -h /

echo ""
echo "=== حالة PM2 ==="
pm2 list

echo ""
echo "=== استخدام CPU ==="
top -bn1 | head -5

echo ""
echo "=== آخر 10 أسطر من السجل ==="
tail -10 ~/wahatqatar/backend/logs/error.log
```

```bash
chmod +x ~/monitor.sh

# إضافة للـ cron (كل ساعة)
crontab -e
# أضف:
0 * * * * ~/monitor.sh >> ~/monitor.log 2>&1
```

### إعداد تنبيهات
```javascript
// أضف في server.js لمراقبة الذاكرة
setInterval(() => {
  const used = process.memoryUsage();
  const memUsage = Math.round(used.heapUsed / 1024 / 1024);
  
  if (memUsage > 500) { // أكثر من 500 MB
    console.warn(`⚠️ Memory usage high: ${memUsage}MB`);
    // يمكن إضافة إشعار هنا
  }
}, 60000);
```

---

## 13. النسخ الاحتياطي

### سكريبت النسخ الاحتياطي
```bash
nano ~/backup.sh
```

```bash
#!/bin/bash
# سكريبت النسخ الاحتياطي التلقائي

# التاريخ
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/home/wahatapp/backups
mkdir -p $BACKUP_DIR

# نسخ قاعدة البيانات
pg_dump -U wahatadmin -h localhost wahatqatar > $BACKUP_DIR/db_$DATE.sql

# ضغط
gzip $BACKUP_DIR/db_$DATE.sql

# نسخ الملفات
tar -czf $BACKUP_DIR/files_$DATE.tar.gz /home/wahatapp/wahatqatar/backend/uploads

# حذف النسخ القديمة (أكثر من 7 أيام)
find $BACKUP_DIR -type f -mtime +7 -delete

# إظهار النتيجة
echo "تم إنشاء نسخة احتياطية: $DATE"
ls -lh $BACKUP_DIR
```

```bash
chmod +x ~/backup.sh

# تشغيل يومي في الساعة 3 صباحاً
crontab -e
# أضف:
0 3 * * * ~/backup.sh >> ~/backup.log 2>&1
```

---

## 14. استكشاف الأخطاء

### مشاكل شائعة وحلولها

#### 1. خطأ في الاتصال بقاعدة البيانات
```bash
# تحقق من حالة PostgreSQL
sudo systemctl status postgresql

# تحقق من الاتصال
psql -U wahatadmin -d wahatqatar -h localhost
```

#### 2. خطأ في Socket.IO
```bash
# تحقق من أن المنفذ غير مستخدم
sudo lsof -i :3000

# تحقق من防火墙
sudo ufw status
```

#### 3. خطأ في HTTPS
```bash
# تحقق من Certbot
sudo certbot certificates

# تجديد يدوي
sudo certbot renew
```

#### 4. مشاكل PM2
```bash
# عرض السجلات
pm2 logs wahatqatar-backend --lines 100

# إعادة بناء
pm2 reset wahatqatar-backend

# فحص التفاصيل
pm2 show wahatqatar-backend
```

### سطر الأوامر للتحقق
```bash
# حالة السيرفر
curl -I https://yourdomain.com

# فحص SSL
curl -I https://yourdomain.com --resolve yourdomain.com:443:SERVER_IP

# فحص API
curl http://localhost:3000/api/health

# فحص Socket.IO
curl http://localhost:3000/socket.io/?EIO=4
```

---

## 📞 معلومات الاتصال

للدعم الفني أو الاستفسارات:
- **البريد**: support@yourdomain.com
- **الهاتف**: +968 XXXX XXXX

---

## 📝 ملاحظات مهمة

1. **الأمان**: تأكد من تغيير جميع كلمات المرور الافتراضية
2. **التحديثات**: تابع تحديثات Node.js والأدوات المستخدمة
3. **المراقبة**: راقب السجلات بانتظام
4. **النسخ الاحتياطي**: تأكد من عمل النسخ الاحتياطي بشكل منتظم

---

**آخر تحديث**: 2024
**الإصدار**: 1.0.0
