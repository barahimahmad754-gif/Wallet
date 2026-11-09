#!/usr/bin/env bash
# تثبيت Pi-hole تلقائياً على Raspberry Pi (يدعم Zero W و Zero 2 W)
# الاستخدام (على الـ Pi):
#   curl -fsSL https://raw.githubusercontent.com/barahimahmad754-gif/Wallet/claude/loving-tesla-69nka1/raspberry-pi/setup.sh -o setup.sh && sudo bash setup.sh
set -euo pipefail

BASE_URL="${BASE_URL:-https://raw.githubusercontent.com/barahimahmad754-gif/Wallet/claude/loving-tesla-69nka1/raspberry-pi}"
UPSTREAM_1="1.1.1.1"
UPSTREAM_2="1.0.0.1"

green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$*"; }
red() { printf '\033[1;31m%s\033[0m\n' "$*"; }
step() { echo; green "==> $*"; }

if [[ $EUID -ne 0 ]]; then
  red "شغّل السكربت بـ sudo:  sudo bash setup.sh"
  exit 1
fi

# ---------- 1) معلومات الشبكة ----------
step "1/6 فحص الشبكة"
IFACE="$(ip route show default | awk '{print $5; exit}')"
GATEWAY="$(ip route show default | awk '{print $3; exit}')"
CIDR="$(ip -4 -o addr show dev "$IFACE" | awk '{print $4; exit}')"
PI_IP="${CIDR%/*}"
if [[ -z "$IFACE" || -z "$CIDR" ]]; then
  red "الـ Pi مو متصل بالشبكة. تأكد من الواي فاي وأعد المحاولة."
  exit 1
fi
echo "الواجهة: $IFACE   عنوان الـ Pi: $PI_IP   الراوتر: $GATEWAY"

# ---------- 2) كلمة سر لوحة التحكم ----------
step "2/6 كلمة سر لوحة التحكم"
PASS=""
while [[ -z "$PASS" ]]; do
  read -r -s -p "اكتب كلمة سر للوحة Pi-hole: " PASS </dev/tty; echo
  read -r -s -p "أعد كتابتها: " PASS2 </dev/tty; echo
  if [[ "$PASS" != "$PASS2" ]]; then red "غير متطابقة، حاول مرة ثانية."; PASS=""; fi
done

# ---------- 3) تثبيت العنوان ----------
step "3/6 تثبيت عنوان الـ Pi على $PI_IP"
if command -v nmcli >/dev/null 2>&1 && systemctl is-active --quiet NetworkManager; then
  CON="$(nmcli -g GENERAL.CONNECTION device show "$IFACE" | head -n1)"
  if [[ -n "$CON" ]]; then
    nmcli connection modify "$CON" ipv4.method manual ipv4.addresses "$CIDR" \
      ipv4.gateway "$GATEWAY" ipv4.dns "$UPSTREAM_1 $UPSTREAM_2"
    echo "تم. العنوان صار ثابت ($PI_IP) ويتفعّل بعد إعادة التشغيل."
  else
    yellow "ما لقيت اتصال NetworkManager. ثبّت العنوان من الراوتر (DHCP Reservation)."
  fi
else
  yellow "NetworkManager غير موجود. ثبّت العنوان من الراوتر (DHCP Reservation)."
fi

# ---------- 4) إعداد مسبق + تثبيت Pi-hole بدون أسئلة ----------
step "4/6 تثبيت Pi-hole (على الـ Zero W ممكن ياخذ 15-30 دقيقة، لا تطفي الجهاز)"
apt-get update -y
apt-get install -y curl ca-certificates

install -d -m 755 /etc/pihole
if [[ ! -f /etc/pihole/pihole.toml ]]; then
  # وجود هذا الملف يخلي المثبّت يشتغل بدون أي نوافذ أسئلة
  cat > /etc/pihole/pihole.toml <<EOF
[dns]
  upstreams = ["$UPSTREAM_1", "$UPSTREAM_2"]
  interface = "$IFACE"
  listeningMode = "LOCAL"
EOF
fi

# قوائم الحجب: الافتراضية + HaGeZi Pro (قوية ومناسبة للمواقع العربية)
if [[ ! -f /etc/pihole/adlists.list ]]; then
  cat > /etc/pihole/adlists.list <<'EOF'
https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts
https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/domains/pro.txt
EOF
fi

if ! command -v pihole >/dev/null 2>&1; then
  curl -fsSL https://install.pi-hole.net -o /tmp/pihole-install.sh
  PIHOLE_SKIP_OS_CHECK=false bash /tmp/pihole-install.sh --unattended
else
  echo "Pi-hole مثبّت من قبل، نكمل الإعداد."
fi

# ---------- 5) الإعدادات ----------
step "5/6 ضبط الإعدادات"
pihole setpassword "$PASS" >/dev/null
pihole-FTL --config dns.upstreams "[\"$UPSTREAM_1\", \"$UPSTREAM_2\"]" >/dev/null
pihole-FTL --config dns.listeningMode LOCAL >/dev/null
# يمنع الجوالات والمتصفحات من تجاوز الحجب عن طريق DNS المشفّر (DoH)
pihole-FTL --config dns.specialDomains.mozillaCanary true >/dev/null 2>&1 || true
pihole-FTL --config dns.specialDomains.iCloudPrivateRelay true >/dev/null 2>&1 || true

# التأكد من وجود HaGeZi في قاعدة البيانات حتى لو كان Pi-hole مثبّت قبل
HAGEZI="https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/domains/pro.txt"
pihole-FTL sqlite3 /etc/pihole/gravity.db \
  "INSERT INTO adlist (address, comment) SELECT '$HAGEZI', 'HaGeZi Pro' WHERE NOT EXISTS (SELECT 1 FROM adlist WHERE address='$HAGEZI');"
pihole -g

# ---------- 6) أداة حجب التطبيقات ----------
step "6/6 تثبيت أداة حجب التطبيقات (appblock)"
curl -fsSL "$BASE_URL/appblock" -o /usr/local/bin/appblock
chmod +x /usr/local/bin/appblock

echo
green "✅ خلصنا!"
echo "--------------------------------------------------"
echo "لوحة التحكم:   http://$PI_IP/admin"
echo "عنوان الـ DNS:  $PI_IP   ← حطه في إعدادات الراوتر"
echo "--------------------------------------------------"
echo "حجب تطبيق عن جوال:   sudo appblock help"
echo
yellow "باقي عليك: غيّر DNS في الراوتر إلى $PI_IP ثم أعد تشغيل الـ Pi:  sudo reboot"
