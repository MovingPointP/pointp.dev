# 全ての応答に付けるセキュリティヘッダー（仕様は docs/spec.md の「セキュリティとプライバシー」）
# add_header は location の中に 1 つでもあると server の分を引き継がないため、server と各 location で include する。
# 拡張子を .conf にしないのは、conf.d/*.conf が http の階層で自動で読み込まれるため。
# always を付けて、404 などのエラーにも付ける。
# CSP は付けない。本番では Cloudflare のルール Security headers が付ける（Cloudflare がページにスクリプトを差し込むため、スクリプトを制限しない値。docs/spec.md）
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header X-Frame-Options "DENY" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Resource-Policy "same-origin" always;
add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()" always;
