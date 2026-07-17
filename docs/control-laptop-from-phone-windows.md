# التحكم بمشروع اللابتوب (Windows) من التلفون — بدون رفع المشروع

الهدف: تشغيل **Claude Code** على ملفات مشروعك المحلية الموجودة على لابتوب
Windows، والتحكم فيه من **تلفونك** من أي مكان — بدون رفع المشروع على GitHub.

الفكرة: التلفون يدخل على اللابتوب عبر **SSH** (سطر أوامر عن بُعد)، وبعدها يشغّل
أمر `claude` داخل مجلد المشروع تماماً كأنك جالس أمام اللابتوب.

---

## الجزء (أ) — إعداد اللابتوب (مرة واحدة)

نفّذ هذه الخطوات على اللابتوب وأنت جالس أمامه.

### 1) تفعيل خادم SSH

افتح **PowerShell كمسؤول (Run as Administrator)** ونفّذ:

```powershell
# تثبيت خادم OpenSSH
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0

# تشغيله وجعله يعمل تلقائياً مع الإقلاع
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

# فتح الجدار الناري للمنفذ 22
New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server (sshd)' `
  -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
```

> تأكد أن حساب Windows لديك عليه **كلمة مرور** (بدون كلمة مرور لن يعمل الدخول).

### 2) تثبيت Tailscale (للوصول من أي مكان بدون إعدادات راوتر)

1. نزّل Tailscale من <https://tailscale.com/download/windows> وثبّته.
2. سجّل الدخول (استخدم حساب Google — نفس الحساب ستستخدمه على التلفون).
3. بعد الدخول، لابتوبك صار له اسم داخل شبكتك الخاصة، شوفه بالأمر:
   ```powershell
   tailscale ip -4
   tailscale status
   ```

### 3) تثبيت Claude Code على اللابتوب

Claude Code يحتاج **Node.js**. ثبّت Node LTS من <https://nodejs.org> ثم في
PowerShell:

```powershell
npm install -g @anthropic-ai/claude-code
```

تحقق أنه يعمل، وسجّل دخولك مرة واحدة أمام اللابتوب:

```powershell
claude
```

اتبع رابط تسجيل الدخول الذي يظهر (بحسابك najimhanna87@gmail.com). بعد نجاحه،
اخرج بكتابة `/exit`.

### 4) اعرف اسم المستخدم على Windows

```powershell
echo $env:USERNAME
```
احفظ هذا الاسم — ستحتاجه للاتصال من التلفون.

---

## الجزء (ب) — إعداد التلفون (مرة واحدة)

1. ثبّت تطبيق **Tailscale** (App Store / Google Play) وسجّل الدخول **بنفس
   الحساب** الذي استخدمته على اللابتوب. الآن التلفون واللابتوب على نفس الشبكة
   الخاصة.
2. ثبّت تطبيق **SSH**. المقترح: **Termius** (سهل، مجاني، لأندرويد و iOS).

---

## الجزء (ج) — الاتصال والتحكم (كل مرة)

1. تأكد أن Tailscale **مُشغّل** على التلفون واللابتوب.
2. افتح Termius وأنشئ اتصال جديد (New Host):
   - **Address (العنوان):** اسم اللابتوب في Tailscale أو رقم الـ IP من
     `tailscale ip -4`
   - **Username:** اسم مستخدم Windows من الخطوة (أ‑4)
   - **Password:** كلمة مرور حساب Windows
3. اضغط اتصال. الآن أنت داخل سطر أوامر اللابتوب من تلفونك.
4. انتقل إلى مجلد المشروع ثم شغّل Claude Code:
   ```powershell
   cd C:\Users\اسمك\مسار\المشروع
   claude
   ```

الآن أنت تتحكم بـ Claude Code وهو يعمل على **ملفات لابتوبك المحلية فعلياً**،
من تلفونك، من أي مكان — وبدون رفع أي شيء. ✅

---

## نصائح وأمان

- **لا توقف اللابتوب عن العمل ولا تجعله ينام**، وإلا ينقطع الاتصال. من
  Settings → System → Power → اضبط "Sleep" على *Never* عند توصيله بالشاحن.
- استخدم **مفاتيح SSH** بدل كلمة المرور لأمان أعلى (انظر `docs/harden-ssh.md`).
- Tailscale يبقي كل شيء **مشفّراً وخاصاً** — لا تفتح المنفذ 22 على راوتر
  الإنترنت مباشرة.
- إذا فشل الاتصال: تأكد أن Tailscale يظهر "Connected" على الجهازين، وأن
  خدمة `sshd` تعمل على اللابتوب (`Get-Service sshd`).
