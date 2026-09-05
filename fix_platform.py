#!/usr/bin/env python3
"""Fix dior-platform.html: START page, footer, home redesign, diacritics"""

import re

with open('dior-platform.html', 'r', encoding='utf-8') as f:
    content = f.read()

# ============================================================
# FIX 1: Footer overlapping content - add padding to main-area
# ============================================================
content = content.replace(
    '.main-area{margin-top:var(--header);margin-bottom:var(--bottomnav);min-height:calc(100vh - var(--header) - var(--bottomnav));padding:0}',
    '.main-area{margin-top:var(--header);margin-bottom:var(--bottomnav);min-height:calc(100vh - var(--header) - var(--bottomnav));padding:0 0 24px}'
)

# ============================================================
# FIX 2: renderSpin - only show UNLOCKED packages
# ============================================================
# Replace the entire renderSpin function
old_render_spin = '''async function renderSpin() {
  // Always fetch packages first to show selection
  const pkgsData = await apiGet('/user/packages');
  spinPkgs = pkgsData?.data || [];

  // Check if user has active package
  const hasActive = USER && USER.active_package_id;

  // Show package selection grid
  let html = `
    <div class="spin-section">
      <div style="font-family:var(--font-serif);font-size:20px;margin-bottom:4px">Chọn gian hàng</div>
      <div style="font-size:13px;color:var(--gray);margin-bottom:24px">Chọn gian hàng để bắt đầu nhập hàng phân phối</div>

      <div class="spin-pkg-grid">
        ${spinPkgs.map(p => {
          const isActive = hasActive && USER.active_package_id === p.id;
          const isLocked = !p.is_unlocked;
          return `<div class="spin-pkg-card ${isActive?'active':''} ${isLocked?'locked':''}" ${!isLocked?`onclick="spinSelectPkg(${p.id})`:''}>
            <div class="sp-name">${p.name}</div>
            <div class="sp-info">Nạp tối thiểu: $${parseFloat(p.min_deposit).toLocaleString()} · ${p.max_orders} đơn · ${p.daily_order_limit}/ngày</div>
            <div class="sp-commission">Commission ${p.commission_rate}%</div>
            ${isLocked ? '<div style="font-size:11px;color:var(--red)">Chưa đủ nạp tối thiểu</div>' : ''}
          </div>`;
        }).join('')}
        ${spinPkgs.length === 0 ? '<div style="grid-column:1/-1;text-align:center;color:var(--gray);padding:48px;font-size:13px">Chưa có gian hàng nào</div>' : ''}
      </div>

      ${hasActive ? `
        <div style="margin-top:24px">
          <button class="btn btn-gold" onclick="renderSpinInterface()" style="padding:14px 32px;font-size:13px;letter-spacing:0.08em">
            Tiếp tục quay
          </button>
        </div>
      ` : ''}

      <!-- Upgrade section -->
      <div class="unlock-section" style="margin-top:28px">
        <div class="unlock-card">
          <div class="unlock-title">Nâng cấp gian hàng</div>
          <div class="unlock-desc">Nạp thêm tiền để mở khóa gian hàng cao hơn với tỷ lệ hoa hồng lớn hơn.</div>
          <button class="btn btn-gold btn-sm" onclick="showPage('home',document.querySelector('.bnav-item'))">Xem gian hàng</button>
        </div>
      </div>
    </div>`;

  document.getElementById('pageContent').innerHTML = html;
}'''

new_render_spin = '''async function renderSpin() {
  const pkgsData = await apiGet('/user/packages');
  spinPkgs = pkgsData?.data || [];
  const hasActive = USER && USER.active_package_id;
  const unlockedPkgs = spinPkgs.filter(p => p.is_unlocked);

  let html = `
    <div class="spin-section">
      <div style="font-family:var(--font-serif);font-size:20px;margin-bottom:4px">Chọn gian hàng</div>
      <div style="font-size:13px;color:var(--gray);margin-bottom:24px">Chọn gian hàng để bắt đầu nhập hàng phân phối</div>

      <div class="spin-pkg-grid">
        ${unlockedPkgs.length > 0 ? unlockedPkgs.map(p => {
          const isActive = hasActive && USER.active_package_id === p.id;
          return `<div class="spin-pkg-card ${isActive?'active':''}" onclick="spinSelectPkg(${p.id})">
            <div class="sp-name">${p.name}</div>
            <div class="sp-info">Nạp tối thiểu: $${parseFloat(p.min_deposit).toLocaleString()} · ${p.max_orders} đơn · ${p.daily_order_limit}/ngày</div>
            <div class="sp-commission">Commission ${p.commission_rate}%</div>
            ${isActive ? '<div style="font-size:11px;color:var(--gold);font-weight:600;margin-top:8px">Đang thực hiện</div>' : ''}
          </div>`;
        }).join('') : '<div style="grid-column:1/-1;text-align:center;padding:48px 20px"><div style="font-size:48px;margin-bottom:12px">&#128274;</div><div style="font-family:var(--font-serif);font-size:16px;margin-bottom:8px">Chưa mở khóa gian hàng</div><div style="font-size:13px;color:var(--gray);margin-bottom:20px">Nạp tiền để mở khóa gian hàng với tỷ lệ hoa hồng cao hơn</div><button class="btn btn-gold" onclick="openDepositModal()">Nạp tiền ngay</button></div>'}
      </div>

      ${hasActive ? `
        <div style="margin-top:24px">
          <button class="btn btn-gold" onclick="renderSpinInterface()" style="padding:14px 32px;font-size:13px;letter-spacing:0.08em">
            Tiếp tục quay →
          </button>
        </div>
      ` : ''}

      <div class="unlock-section" style="margin-top:28px">
        <div class="unlock-card">
          <div class="unlock-title">Nâng cấp gian hàng</div>
          <div class="unlock-desc">Nạp thêm tiền để mở khóa gian hàng cao hơn với tỷ lệ hoa hồng lớn hơn.</div>
          <button class="btn btn-gold btn-sm" onclick="showPage('home',document.querySelector('.bnav-item'))">Xem gian hàng</button>
        </div>
      </div>
    </div>`;

  document.getElementById('pageContent').innerHTML = html;
}'''

content = content.replace(old_render_spin, new_render_spin)

# ============================================================
# FIX 3: Home page - Dior fashion style hero banner
# ============================================================
old_home_html = '''  let html = `
    <!-- User Header -->
    <div class="home-user-header">
      <div class="home-user-row">
        <div class="home-avatar">${initials}</div>
        <div class="home-user-info">
          <div class="home-username">${USER?.full_name || USER?.username || ''}</div>
          <div class="home-email">${USER?.email || ''}</div>
          ${vipBadgeHTML}
        </div>
      </div>
    </div>

    <!-- Balance -->
    <div class="home-balance">
      <div class="balance-display">
        <div class="bal-label">Số dư</div>
        <div class="bal-amount"><span>$</span>${parseFloat(USER?.balance||0).toFixed(2)}</div>
      </div>
      <button class="btn btn-gold btn-sm" onclick="openDepositModal()">Nạp tiền</button>
      <button class="btn btn-s btn-sm" onclick="openWithdrawModal()">Rút tiền</button>
    </div>

    <!-- Stats -->
    <div class="stats">
      <div class="stat-card gold"><div class="label">Hoa hồng hôm nay</div><div class="value">$${parseFloat(s.today_commission).toFixed(2)}</div></div>
      <div class="stat-card"><div class="label">Đơn hôm nay</div><div class="value">${s.today_orders}</div></div>
      <div class="stat-card"><div class="label">Lượt quay còn</div><div class="value">${s.daily_remaining}</div></div>
      <div class="stat-card gold"><div class="label">Tổng hoa hồng</div><div class="value">$${parseFloat(s.total_commission).toFixed(2)}</div></div>
    </div>

    ${progressHTML}

    <!-- VIP Tier Cards -->
    <div class="section-title">Hạng thành viên</div>
    <div class="vip-tier-grid">
      ${[1,2,3,4].map(tier => {
        const minDeposits = [0,500,1300,3000,5000];
        const commissions = [0,0.6,1.2,2.0,2.5];
        const reached = vipLevel >= tier;
        return `<div class="vip-tier-card ${reached?'reached':''}">
          <div class="tier-icon">${vipIcons[tier]}</div>
          <div class="tier-name">VIP ${vipNames[tier]}</div>
          <div class="tier-deposit">Nạp $${minDeposits[tier].toLocaleString()}</div>
          <div class="tier-commission">Commission ${commissions[tier]}%</div>
        </div>`;
      }).join('')}
    </div>

    <!-- Active Package / Gian hàng (text-only, no images) -->
    ${pkgs.length ? `<div class="section-title">Gian hàng hiện có</div>
    <div class="pkg-grid">
      ${pkgs.map(p => `
        <div class="pkg-card ${p.is_unlocked?'':'locked'} ${p.is_current?'current':''}" ${p.is_unlocked?`onclick="selectPkg(${p.id})`:''}>
          <div class="pkg-body">
            <div class="pkg-name">${p.name}</div>
            <div class="pkg-meta">Nạp tối thiểu: $${parseFloat(p.min_deposit).toLocaleString()} · ${p.max_orders} đơn · ${p.daily_order_limit}/ngày</div>
            <div class="pkg-stats">Commission: <span>${p.commission_rate}%</span></div>
            ${p.progress ? `<div class="pkg-progress"><div class="prog-bar"><div class="prog-fill" style="width:${p.progress.completed_orders>=p.max_orders?100:Math.round(p.progress.completed_orders/p.max_orders*100)}%"></div></div><div class="prog-sub">${p.progress.completed_orders}/${p.max_orders} đơn · ${p.progress.status==='completed'?'Hoàn thành':'Đang thực hiện'}</div></div>` : ''}
            ${!p.is_unlocked ? '<div style="font-size:11px;color:var(--red);margin-top:4px">Chưa đủ nạp tối thiểu</div>' : ''}
            ${p.is_current ? '<div style="font-size:11px;color:var(--gold);margin-top:4px;font-weight:600">Đang thực hiện</div>' : ''}
          </div>
        </div>
      `).join('')}
    </div>` : ''}
  `;'''

new_home_html = '''  let html = `
    <!-- Dior Hero Banner -->
    <div class="home-hero">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <div class="hero-dior">DIOR</div>
        <div class="hero-tagline">TRUNG TÂM PHÂN PHỐI</div>
        <div class="hero-user-info">
          <span>Xin chào, ${USER?.full_name || USER?.username || ''}</span>
          ${vipBadgeHTML}
        </div>
      </div>
    </div>

    <!-- Balance -->
    <div class="home-balance">
      <div class="balance-display">
        <div class="bal-label">Số dư</div>
        <div class="bal-amount"><span>$</span>${parseFloat(USER?.balance||0).toFixed(2)}</div>
      </div>
      <button class="btn btn-gold btn-sm" onclick="openDepositModal()">Nạp tiền</button>
      <button class="btn btn-s btn-sm" onclick="openWithdrawModal()">Rút tiền</button>
    </div>

    <!-- Stats -->
    <div class="stats">
      <div class="stat-card gold"><div class="label">Hoa hồng hôm nay</div><div class="value">$${parseFloat(s.today_commission).toFixed(2)}</div></div>
      <div class="stat-card"><div class="label">Đơn hôm nay</div><div class="value">${s.today_orders}</div></div>
      <div class="stat-card"><div class="label">Lượt quay còn</div><div class="value">${s.daily_remaining}</div></div>
      <div class="stat-card gold"><div class="label">Tổng hoa hồng</div><div class="value">$${parseFloat(s.total_commission).toFixed(2)}</div></div>
    </div>

    ${progressHTML}

    <!-- VIP Tier Cards -->
    <div class="section-title">Hạng thành viên</div>
    <div class="vip-tier-grid">
      ${[1,2,3,4].map(tier => {
        const minDeposits = [0,500,1300,3000,5000];
        const commissions = [0,0.6,1.2,2.0,2.5];
        const reached = vipLevel >= tier;
        return `<div class="vip-tier-card ${reached?'reached':''}">
          <div class="tier-icon">${vipIcons[tier]}</div>
          <div class="tier-name">VIP ${vipNames[tier]}</div>
          <div class="tier-deposit">Nạp $${minDeposits[tier].toLocaleString()}</div>
          <div class="tier-commission">Commission ${commissions[tier]}%</div>
        </div>`;
      }).join('')}
    </div>

    <!-- Gian hàng có thể chơi (chỉ hiện gói unlocked) -->
    ${pkgs.filter(p => p.is_unlocked).length ? `<div class="section-title">Gian hàng có thể chơi</div>
    <div class="pkg-grid">
      ${pkgs.filter(p => p.is_unlocked).map(p => `
        <div class="pkg-card ${p.is_current?'current':''}" onclick="selectPkg(${p.id})">
          <div class="pkg-body">
            <div class="pkg-name">${p.name}</div>
            <div class="pkg-meta">Nạp tối thiểu: $${parseFloat(p.min_deposit).toLocaleString()} · ${p.max_orders} đơn · ${p.daily_order_limit}/ngày</div>
            <div class="pkg-stats">Commission: <span>${p.commission_rate}%</span></div>
            ${p.progress ? `<div class="pkg-progress"><div class="prog-bar"><div class="prog-fill" style="width:${p.progress.completed_orders>=p.max_orders?100:Math.round(p.progress.completed_orders/p.max_orders*100)}%"></div></div><div class="prog-sub">${p.progress.completed_orders}/${p.max_orders} đơn · ${p.progress.status==='completed'?'Hoàn thành':'Đang thực hiện'}</div></div>` : ''}
            ${p.is_current ? '<div style="font-size:11px;color:var(--gold);margin-top:4px;font-weight:600">Đang thực hiện</div>' : ''}
          </div>
        </div>
      `).join('')}
    </div>` : ''}

    <!-- Quick Start Banner -->
    <div class="home-promo" onclick="showPage('spin',document.querySelector('.bnav-center'))">
      <div class="promo-icon">&#9889;</div>
      <div class="promo-text">
        <div class="promo-title">Bắt đầu phân phối</div>
        <div class="promo-desc">Chọn gian hàng và quay đơn ngay</div>
      </div>
      <div class="promo-arrow">&rsaquo;</div>
    </div>
  `;'''

content = content.replace(old_home_html, new_home_html)

# ============================================================
# FIX 4: Add new CSS for home-hero and home-promo
# ============================================================
new_css = '''
/* ===================== HOME HERO (Dior style) ===================== */
.home-hero{position:relative;height:200px;overflow:hidden;background:linear-gradient(135deg,#0a0a0a,#1a1a1a,#0d0d0d)}
.hero-overlay{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(201,169,110,.12) 0%,transparent 70%)}
.hero-overlay::before{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background:url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9a96e' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")}
.hero-content{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;padding:20px}
.hero-dior{font-family:var(--font-serif);font-size:48px;font-weight:400;letter-spacing:0.35em;color:#fff;text-transform:uppercase;margin-bottom:6px}
.hero-tagline{font-size:10px;color:rgba(201,169,110,.8);letter-spacing:0.25em;text-transform:uppercase;margin-bottom:16px}
.hero-user-info{display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,.5)}
.hero-user-info .home-vip-badge{margin:0}

/* ===================== HOME PROMO ===================== */
.home-promo{display:flex;align-items:center;gap:14px;margin:0 20px 20px;padding:16px 20px;background:linear-gradient(135deg,var(--gold),var(--gld));color:#fff;cursor:pointer;transition:all .3s}
.home-promo:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(201,169,110,.4)}
.promo-icon{font-size:24px}
.promo-text{flex:1}
.promo-title{font-family:var(--font-serif);font-size:14px;font-weight:500;margin-bottom:2px}
.promo-desc{font-size:11px;opacity:.8}
.promo-arrow{font-size:24px;opacity:.7}

@media(max-width:768px){
  .hero-dior{font-size:36px}
  .home-hero{height:170px}
}'''

# Insert before the RESPONSIVE section
content = content.replace(
    '/* ===================== RESPONSIVE =====================',
    new_css + '\n\n/* ===================== RESPONSIVE ====================='
)

# Remove duplicate responsive block at the very end
content = content.replace('''@media(max-width:768px){
  .hero-dior{font-size:36px}
  .home-hero{height:170px}
}

@media(max-width:768px){''', '@media(max-width:768px){')

# ============================================================
# FIX 5: Remove old home-user-header CSS (no longer needed)
# ============================================================
content = content.replace(
    '.home-user-header{background:linear-gradient(135deg,#1a1a1a,#2a2a2a);padding:24px 20px;color:#fff;position:relative;overflow:hidden}',
    '/* .home-user-header removed - replaced by home-hero */'
)
content = content.replace(
    '.home-user-header::before{content:\'\';position:absolute;right:-60px;top:-60px;width:200px;height:200px;border-radius:50%;background:rgba(201,169,110,.08)}',
    ''
)
content = content.replace(
    '.home-user-row{display:flex;align-items:center;gap:14px;position:relative;z-index:1}',
    ''
)
content = content.replace(
    '.home-avatar{width:52px;height:52px;border-radius:50%;border:2px solid var(--gold);display:flex;align-items:center;justify-content:center;font-family:var(--font-serif);font-size:18px;color:var(--gold);background:rgba(201,169,110,.1);flex-shrink:0}',
    ''
)

# ============================================================
# FIX 6: Remove initial variables that reference old home elements
# ============================================================
content = content.replace(
    "  const initials = (USER?.full_name || USER?.username || 'U').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();\n\n  // Active package progress",
    "  // Active package progress"
)

with open('dior-platform.html', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Done! File updated: {len(content)} chars, {content.count(chr(10))} lines')
