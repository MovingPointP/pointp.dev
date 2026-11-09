# 全ての応答に付けるセキュリティヘッダー（仕様は docs/spec.md の「セキュリティとプライバシー」）
# add_header は location の中に 1 つでもあると server の分を引き継がないため、server と各 location で include する。
# 拡張子を .conf にしないのは、conf.d/*.conf が http の階層で自動で読み込まれるため。
# always を付けて、404 などのエラーにも付ける。
# 今は Report-Only（何も止めず、止めるとしたら何が止まるかをコンソールに出す）。本番で結果を見て扱いを決める（docs/spec.md）
add_header Content-Security-Policy-Report-Only "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header X-Frame-Options "DENY" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Cross-Origin-Resource-Policy "same-origin" always;
add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()" always;
