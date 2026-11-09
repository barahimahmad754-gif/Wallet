# حجب الإعلانات والتطبيقات بـ Raspberry Pi (Pi-hole)

## 1) التثبيت (أمر واحد على الـ Pi)
```bash
curl -fsSL https://raw.githubusercontent.com/barahimahmad754-gif/Wallet/claude/loving-tesla-69nka1/raspberry-pi/setup.sh -o setup.sh && sudo bash setup.sh
```
يسأل عن كلمة سر للوحة التحكم، ويسوي الباقي لحاله:
- يثبّت عنوان الـ Pi
- يثبّت Pi-hole بدون أسئلة
- يضيف قوائم حجب قوية (StevenBlack و HaGeZi Pro)
- يثبّت أداة `appblock` لحجب التطبيقات

في النهاية يطبع لك **عنوان الـ Pi**. حطه في إعدادات الراوتر كـ **DNS**، ثم شغّل `sudo reboot`.

## 2) حجب تطبيق عن جوال معين
```bash
sudo appblock devices                                   # تعرف MAC الجوال
sudo appblock block AA:BB:CC:DD:EE:FF tiktok vpn doh    # حجب
sudo appblock schedule tiktok 23:00 06:00               # حجب بالليل بس
sudo appblock status                                    # الوضع الحالي
sudo appblock help                                      # كل الأوامر
```
التطبيقات المتاحة: tiktok, snapchat, instagram, youtube, twitter, discord, whatsapp, roblox, fortnite, pubg, freefire, vpn, doh

> في الجوال المحجوب: اطفِ **عنوان Wi-Fi الخاص** (Private Wi-Fi Address / MAC عشوائي) لشبكة البيت، عشان يبقى الـ MAC ثابت.
