(() => {
  const STORAGE_KEY = 'ac-lang';

  const dict = {
    en: {
      title: 'Auto Clipboard — Select to copy. Copy restrictions, gone.',
      'nav.features': 'Features', 'nav.how': 'How it works', 'nav.privacy': 'Privacy',
      'hero.eyebrow': 'Free · Open source · Chrome & Edge',
      'hero.title1': 'Select it.', 'hero.title2': "It's copied.",
      'hero.lead': 'Highlight any text and it lands in your clipboard. Copy locks on stubborn websites are removed, and everything you copy is kept in a searchable history.',
      'hero.stat': 'users since 2022', 'hero.toast': '✓ Copied',
      'cta.chrome': 'Add to Chrome', 'cta.edge': 'Add to Edge',
      'features.title': 'Everything copy & paste should have been.',
      'f1.t': 'Copy restrictions, gone',
      'f1.d': 'Unlocks text selection and copying on sites that disable it. An optional power-paste mode handles inputs that block pasting.',
      'f2.t': 'Select to copy',
      'f2.d': 'Copy on select, with copyright tails stripped. Configure per site, via the right-click menu, or the master switch.',
      'f3.t': 'Searchable history',
      'f3.d': 'Search, pin and filter by type. Links and JSON are detected, and each entry can jump back to its source page.',
      'f4.t': 'Quick panel', 'f4.d': 'Press Alt+Shift+V anywhere and fill an input with one click.',
      'f5.t': 'Reveal passwords', 'f5.d': "See and copy what's inside a password field.",
      'f6.t': 'History control',
      'f6.d': 'Set retention count and expiry, import or export, and bulk-clear in one click.',
      'how.title': 'Make it yours.',
      'how.s1t': 'Install', 'how.s1d': 'Add it from the Chrome Web Store or Edge Add-ons.',
      'how.s2t': 'Select', 'how.s2d': "Highlight text on any page. That's it — it's copied.",
      'how.s3t': 'Customize', 'how.s3d': 'Tweak the toast position, colors, theme and per-site rules.',
      'privacy.title': 'Your clipboard stays yours.',
      'privacy.d': 'All data is stored locally in your browser. Nothing is uploaded, ever. The code is fully open source under the MIT license — read it, fork it, improve it.',
      'privacy.cta': 'View source on GitHub',
      'support.title': 'Buy me a coffee ☕',
      'support.d': 'Auto Clipboard is free and maintained in spare time. If it saves you a few clicks a day, consider supporting it.',
      'footer.note': 'For research and learning only. Please use responsibly.'
    },
    zh: {
      title: '自动剪切板 — 选中即复制，破解复制限制',
      'nav.features': '功能', 'nav.how': '使用方式', 'nav.privacy': '隐私',
      'hero.eyebrow': '免费 · 开源 · 支持 Chrome 与 Edge',
      'hero.title1': '选中文字，', 'hero.title2': '即刻复制。',
      'hero.lead': '划选任意文字，立刻进入剪切板。自动破解网页的复制限制，并把复制过的内容保存为可搜索的历史记录。',
      'hero.stat': '用户，自 2022 年起', 'hero.toast': '✓ 已复制',
      'cta.chrome': '添加到 Chrome', 'cta.edge': '添加到 Edge',
      'features.title': '复制粘贴，本该如此顺手。',
      'f1.t': '破解复制限制',
      'f1.d': '解除网页禁止选中、禁止复制的限制；可选开启强力粘贴，应对禁止粘贴的输入框。',
      'f2.t': '选中即复制',
      'f2.d': '选中自动复制，并去掉版权尾巴。可按站点单独配置，支持右键菜单与总开关。',
      'f3.t': '可搜索的历史',
      'f3.d': '搜索、置顶、按类型筛选；自动识别链接与 JSON，并可跳回来源页面。',
      'f4.t': '快捷面板', 'f4.d': '在任意页面按下 Alt+Shift+V，一键填充到输入框。',
      'f5.t': '查看密码', 'f5.d': '查看并复制密码框里的内容。',
      'f6.t': '历史管理', 'f6.d': '设置保留条数与过期时间，支持导入导出，一键清空。',
      'how.title': '按你的习惯来。',
      'how.s1t': '安装', 'how.s1d': '从 Chrome 应用商店或 Edge 外接程序安装。',
      'how.s2t': '选中', 'how.s2d': '在任意页面划选文字，就这么简单——已经复制好了。',
      'how.s3t': '个性化', 'how.s3d': '自定义提示语位置、配色、主题与站点规则。',
      'privacy.title': '你的剪切板，只属于你。',
      'privacy.d': '所有数据仅保存在你的浏览器本地，不会上传任何内容。代码基于 MIT 协议完全开源——欢迎阅读、Fork 与改进。',
      'privacy.cta': '在 GitHub 查看源码',
      'support.title': '请我喝杯咖啡 ☕',
      'support.d': '自动剪切板免费开源，业余时间维护。如果它每天帮你省下几次点击，欢迎支持一下。',
      'footer.note': '仅用于研究学习，请勿用于非法用途。'
    }
  };

  const supported = Object.keys(dict);

  const detect = () => {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (_) { /* storage unavailable */ }
    if (supported.includes(saved)) return saved;
    return (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  };

  const apply = (lang) => {
    const t = dict[lang];
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t.title;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const value = t[el.dataset.i18n];
      if (value !== undefined) el.textContent = value;
    });
    document.querySelectorAll('.lang button').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
    });
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) { /* ignore */ }
  };

  document.querySelectorAll('.lang button').forEach((btn) => {
    btn.addEventListener('click', () => apply(btn.dataset.lang));
  });

  document.getElementById('year').textContent = new Date().getFullYear();
  apply(detect());
})();
