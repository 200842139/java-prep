(function () {
  'use strict';

  const TAB_READ = 'read';
  const TAB_QUIZ = 'quiz';
  const THEME_KEY = 'theme';
  const READING_LAST_ID_KEY = 'reading_last_article_id';
  const READING_LAST_TITLE_KEY = 'reading_last_article_title';
  const READING_SCROLL_PREFIX = 'reading_scroll_';

  let catalog = [];
  let questions = [];
  let quizState = { index: 0, answers: [] };
  let localArticleIds = new Set();
  let currentReaderArticleId = null;
  let readingProgressSaveTimer = null;

  // ---------- 暗黑模式切换 ----------
  function isDark() {
    return document.documentElement.classList.contains('dark');
  }
  function applyTheme(dark) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (dark) {
      document.documentElement.classList.add('dark');
      if (meta) meta.setAttribute('content', '#0f172a');
      var icon = document.getElementById('theme-icon');
      if (icon) icon.textContent = '\u2600\uFE0F'; // ☀️
    } else {
      document.documentElement.classList.remove('dark');
      if (meta) meta.setAttribute('content', '#3b82f6');
      var iconEl = document.getElementById('theme-icon');
      if (iconEl) iconEl.textContent = '\uD83C\uDF19'; // 🌙
    }
  }
  function initTheme() {
    var saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') applyTheme(true);
    else if (saved === 'light') applyTheme(false);
    else applyTheme(false);
  }
  function toggleTheme() {
    var dark = !isDark();
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    applyTheme(dark);
  }
  initTheme();
  var themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  // ---------- Tab 切换 ----------
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const tab = this.getAttribute('data-tab');
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });
      this.classList.add('active');
      var pane = tab === TAB_READ ? document.getElementById('tab-read') : document.getElementById('tab-quiz');
      if (pane) pane.classList.add('active');
    });
  });

  // ---------- 本地文章 id（与 Python 脚本生成的 id 一致） ----------
  function urlToId(url) {
    try {
      var path = new URL(url).pathname || '';
      return path.replace(/^\//, '').replace(/\.html$/, '').replace(/\//g, '-');
    } catch (e) {
      return '';
    }
  }

  function renderCatalog(data) {
    const root = document.getElementById('catalog-root');
    if (!root) return;
    root.innerHTML = data.map(function (group) {
      const items = group.items.map(function (item) {
        var id = urlToId(item.url);
        var isLocal = id && localArticleIds.has(id);
        var cls = 'block w-full text-left px-4 py-3 text-gray-800 dark:text-slate-200 text-sm border-b border-gray-100 dark:border-slate-600 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors';
        if (isLocal) {
          return '<button type="button" class="catalog-item-local ' + cls + '" data-article-id="' + escapeHtml(id) + '" data-article-title="' + escapeHtml(item.title) + '">' +
            '<span class="text-gray-400 dark:text-slate-500 mr-2">›</span>' + escapeHtml(item.title) + '</button>';
        }
        return '<a href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener" class="' + cls + '">' +
          '<span class="text-gray-400 dark:text-slate-500 mr-2">›</span>' + escapeHtml(item.title) + '</a>';
      }).join('');
      return (
        '<div class="rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">' +
          '<div class="flex items-center gap-2 px-4 py-3 font-semibold text-gray-900 dark:text-slate-100">' +
            '<span class="rounded-md bg-blue-500 px-2 py-0.5 text-xs text-white">' + (group.items.length) + '</span>' + escapeHtml(group.title) +
          '</div>' +
          '<div class="border-t border-gray-100 dark:border-slate-600">' + items + '</div>' +
        '</div>'
      );
    }).join('');
    root.querySelectorAll('.catalog-item-local').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openReader(this.getAttribute('data-article-id'), this.getAttribute('data-article-title'));
      });
    });
  }

  function saveReadingScroll() {
    if (!currentReaderArticleId) return;
    var contentEl = document.getElementById('reader-content');
    if (contentEl) localStorage.setItem(READING_SCROLL_PREFIX + currentReaderArticleId, String(contentEl.scrollTop));
  }

  function openReader(id, fallbackTitle) {
    var overlay = document.getElementById('reader-overlay');
    var titleEl = document.getElementById('reader-title');
    var contentEl = document.getElementById('reader-content');
    if (!overlay || !titleEl || !contentEl) return;
    currentReaderArticleId = id;
    localStorage.setItem(READING_LAST_ID_KEY, id);
    if (fallbackTitle) localStorage.setItem(READING_LAST_TITLE_KEY, fallbackTitle);
    titleEl.textContent = fallbackTitle || '加载中…';
    contentEl.innerHTML = '<p class="text-gray-500 dark:text-slate-400">加载中…</p>';
    overlay.classList.remove('hidden');
    fetch('./data/articles/' + encodeURIComponent(id) + '.json')
      .then(function (r) {
        if (!r.ok) throw new Error('加载失败');
        return r.json();
      })
      .then(function (data) {
        titleEl.textContent = data.title || fallbackTitle || '文章';
        contentEl.innerHTML = data.content || '<p>暂无正文</p>';
        var baseUrl = data.url || '';
        var appBase = (function () {
          var p = window.location.pathname || '/';
          var base = p.replace(/\/[^/]*$/, '') || '/';
          return window.location.origin + base + (base.slice(-1) === '/' ? '' : '/');
        })();
        contentEl.querySelectorAll('img').forEach(function (img) {
          var src = (img.getAttribute('src') || img.getAttribute('data-src') || '').trim();
          if (!src) return;
          img.setAttribute('referrerpolicy', 'no-referrer');
          if (src.indexOf('http') === 0 || src.indexOf('data:') === 0) return;
          if (src.indexOf('data/articles/') === 0 || src.indexOf('./data/articles/') === 0) {
            img.setAttribute('src', appBase + src.replace(/^\.\//, ''));
            return;
          }
          if (baseUrl) {
            try {
              img.setAttribute('src', new URL(src, baseUrl).href);
            } catch (e) {}
          }
        });
        contentEl.querySelectorAll('a[href^="http"]').forEach(function (a) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener');
        });
        contentEl.querySelectorAll('table').forEach(function (table) {
          if (table.closest('.article-table-wrap')) return;
          var wrap = document.createElement('div');
          wrap.className = 'article-table-wrap';
          table.parentNode.insertBefore(wrap, table);
          wrap.appendChild(table);
        });
        var savedScroll = localStorage.getItem(READING_SCROLL_PREFIX + id);
        if (savedScroll !== null) {
          var top = parseInt(savedScroll, 10);
          if (!isNaN(top)) {
            requestAnimationFrame(function () {
              contentEl.scrollTop = top;
              if (typeof updateBackToTopVisible === 'function') updateBackToTopVisible();
            });
          }
        }
      })
      .catch(function () {
        contentEl.innerHTML = '<p class="text-red-500 dark:text-red-400">加载失败，请检查是否已运行资料抓取脚本。</p>';
      });
  }

  function closeReader() {
    saveReadingScroll();
    currentReaderArticleId = null;
    var overlay = document.getElementById('reader-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  var imageViewerState = { scale: 1, tx: 0, ty: 0, lastDist: 0, lastScale: 1, lastCenterX: 0, lastCenterY: 0, lastPanX: 0, lastPanY: 0 };

  function getTouchDistance(touches) {
    if (touches.length < 2) return 0;
    var a = touches[0], b = touches[1];
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }
  function getTouchCenter(touches) {
    if (touches.length < 2) return { x: 0, y: 0 };
    return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
  }
  function applyImageViewerTransform(img) {
    if (!img) return;
    var s = imageViewerState;
    img.style.transform = 'translate(' + s.tx + 'px,' + s.ty + 'px) scale(' + s.scale + ')';
  }

  function openImageViewer(src) {
    var viewer = document.getElementById('image-viewer');
    var img = document.getElementById('image-viewer-img');
    if (viewer && img && src) {
      imageViewerState = { scale: 1, tx: 0, ty: 0, lastDist: 0, lastScale: 1, lastCenterX: 0, lastCenterY: 0, lastPanX: 0, lastPanY: 0 };
      img.style.transform = 'scale(1)';
      img.src = src;
      viewer.classList.remove('hidden');
      viewer.setAttribute('aria-hidden', 'false');
    }
  }
  function closeImageViewer() {
    var viewer = document.getElementById('image-viewer');
    if (viewer) {
      viewer.classList.add('hidden');
      viewer.setAttribute('aria-hidden', 'true');
    }
  }

  (function setupImageViewerTouch() {
    var viewer = document.getElementById('image-viewer');
    var img = document.getElementById('image-viewer-img');
    if (!viewer || !img) return;
    viewer.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        imageViewerState.lastDist = getTouchDistance(e.touches);
        imageViewerState.lastScale = imageViewerState.scale;
      } else if (e.touches.length === 1) {
        imageViewerState.lastPanX = e.touches[0].clientX - imageViewerState.tx;
        imageViewerState.lastPanY = e.touches[0].clientY - imageViewerState.ty;
      }
    }, { passive: true });
    viewer.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        var dist = getTouchDistance(e.touches);
        if (imageViewerState.lastDist > 0) {
          var s = imageViewerState.lastScale * (dist / imageViewerState.lastDist);
          imageViewerState.scale = Math.max(1, Math.min(5, s));
          applyImageViewerTransform(img);
        }
        imageViewerState.lastDist = dist;
      } else if (e.touches.length === 1 && imageViewerState.scale > 1) {
        e.preventDefault();
        imageViewerState.tx = e.touches[0].clientX - imageViewerState.lastPanX;
        imageViewerState.ty = e.touches[0].clientY - imageViewerState.lastPanY;
        applyImageViewerTransform(img);
      }
    }, { passive: false });
    viewer.addEventListener('touchend', function (e) {
      if (e.touches.length === 2) {
        imageViewerState.lastDist = getTouchDistance(e.touches);
        imageViewerState.lastScale = imageViewerState.scale;
      } else if (e.touches.length === 1) {
        imageViewerState.lastPanX = e.touches[0].clientX - imageViewerState.tx;
        imageViewerState.lastPanY = e.touches[0].clientY - imageViewerState.ty;
      }
    }, { passive: true });
  })();

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  Promise.all([
    fetch('./data/catalog.json').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }),
    fetch('./data/articles/index.json').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
  ]).then(function (results) {
    var catalogData = results[0];
    var indexData = results[1];
    catalog = catalogData;
    indexData.forEach(function (entry) {
      if (entry && entry.id) localArticleIds.add(entry.id);
    });
    if (catalogData.length) {
      renderCatalog(catalogData);
    } else {
      document.getElementById('catalog-root').innerHTML = '<p class="text-gray-500 dark:text-slate-400 text-sm">目录加载失败，请刷新重试。</p>';
    }
    var lastId = localStorage.getItem(READING_LAST_ID_KEY);
    var lastTitle = localStorage.getItem(READING_LAST_TITLE_KEY) || '';
    if (lastId && localArticleIds.has(lastId)) {
      openReader(lastId, lastTitle || '文章');
    }
  });

  document.getElementById('reader-back').addEventListener('click', closeReader);

  var readerContent = document.getElementById('reader-content');
  if (readerContent) {
    readerContent.addEventListener('scroll', function () {
      if (readingProgressSaveTimer) clearTimeout(readingProgressSaveTimer);
      readingProgressSaveTimer = setTimeout(saveReadingScroll, 300);
    }, { passive: true });
    readerContent.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'IMG') {
        e.preventDefault();
        openImageViewer(e.target.currentSrc || e.target.src);
      }
    });
  }
  document.getElementById('image-viewer-close').addEventListener('click', closeImageViewer);
  document.getElementById('image-viewer').addEventListener('click', function (e) {
    if (e.target === this) closeImageViewer();
  });

  // ---------- 回到顶部 ----------
  var BACK_TO_TOP_THRESHOLD = 200;
  var backToTopBtn = document.getElementById('back-to-top');
  function updateBackToTopVisible() {
    if (!backToTopBtn) return;
    var readerOverlay = document.getElementById('reader-overlay');
    var readerContent = document.getElementById('reader-content');
    var show = false;
    if (readerOverlay && !readerOverlay.classList.contains('hidden') && readerContent) {
      show = readerContent.scrollTop > BACK_TO_TOP_THRESHOLD;
    } else {
      show = window.scrollY > BACK_TO_TOP_THRESHOLD;
    }
    if (show) {
      backToTopBtn.classList.remove('opacity-0', 'pointer-events-none');
    } else {
      backToTopBtn.classList.add('opacity-0', 'pointer-events-none');
    }
  }
  if (backToTopBtn) {
    window.addEventListener('scroll', updateBackToTopVisible, { passive: true });
    var readerContentEl = document.getElementById('reader-content');
    if (readerContentEl) readerContentEl.addEventListener('scroll', updateBackToTopVisible, { passive: true });
    backToTopBtn.addEventListener('click', function () {
      var readerOverlay = document.getElementById('reader-overlay');
      var readerContent = document.getElementById('reader-content');
      if (readerOverlay && !readerOverlay.classList.contains('hidden') && readerContent) {
        readerContent.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      updateBackToTopVisible();
    });
  }

  // ---------- 模拟测试 ----------
  function loadQuestions() {
    return fetch('./data/questions.json').then(function (r) { return r.json(); });
  }

  function initQuiz() {
    quizState = { index: 0, answers: [] };
    document.getElementById('quiz-start').classList.remove('hidden');
    document.getElementById('quiz-area').classList.add('hidden');
    document.getElementById('quiz-result').classList.add('hidden');
  }

  function showQuestion() {
    var q = questions[quizState.index];
    var total = questions.length;
    var isLast = quizState.index === total - 1;

    document.getElementById('current-q').textContent = quizState.index + 1;
    document.getElementById('total-q').textContent = total;
    document.getElementById('quiz-category').textContent = q.category || '';
    document.getElementById('quiz-question').textContent = q.question;

    var progress = ((quizState.index + 1) / total) * 100;
    document.getElementById('quiz-progress-bar').style.width = progress + '%';

    var optsRoot = document.getElementById('quiz-options');
    optsRoot.innerHTML = q.options.map(function (opt, i) {
      var letter = String.fromCharCode(65 + i);
      var checked = quizState.answers[quizState.index] === i ? ' selected' : '';
      return (
        '<button type="button" class="quiz-option flex items-start gap-3 w-full text-left p-4 rounded-xl border-2 border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-500/10 transition-colors' + checked + '" data-index="' + i + '">' +
          '<span class="option-letter flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-400 flex items-center justify-center text-xs font-semibold">' + letter + '</span>' +
          '<span class="text-gray-800 dark:text-slate-200 text-sm leading-relaxed">' + escapeHtml(opt) + '</span>' +
        '</button>'
      );
    }).join('');

    optsRoot.querySelectorAll('.quiz-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        optsRoot.querySelectorAll('.quiz-option').forEach(function (b) { b.classList.remove('selected'); });
        this.classList.add('selected');
        quizState.answers[quizState.index] = parseInt(this.getAttribute('data-index'), 10);
      });
    });

    document.getElementById('btn-prev').disabled = quizState.index === 0;
    document.getElementById('btn-next').classList.toggle('hidden', isLast);
    document.getElementById('btn-submit').classList.toggle('hidden', !isLast);
  }

  function showResult() {
    var correct = 0;
    questions.forEach(function (q, i) {
      if (quizState.answers[i] === q.answer) correct++;
    });
    var total = questions.length;
    var pct = total ? Math.round((correct / total) * 100) : 0;

    document.getElementById('result-score').textContent = correct + ' / ' + total;
    document.getElementById('result-desc').textContent =
      pct >= 80 ? '掌握得不错，继续保持！' : pct >= 60 ? '还有提升空间，多复习一下哦。' : '建议多看看对应章节再测一次。';

    var detailHtml = questions.map(function (q, i) {
      var userAnswer = quizState.answers[i];
      var isCorrect = userAnswer === q.answer;
      var userText = userAnswer !== undefined ? q.options[userAnswer] : '未选';
      var correctText = q.options[q.answer];
      return (
        '<div class="rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-4 shadow-sm">' +
          '<p class="font-medium text-gray-900 dark:text-slate-100 mb-2">' + (i + 1) + '. ' + escapeHtml(q.question) + '</p>' +
          '<p class="text-sm"><strong class="text-gray-500 dark:text-slate-400">你的答案：</strong>' + (isCorrect ? '<span class="text-green-600 dark:text-green-400">' + escapeHtml(userText) + '</span>' : '<span class="text-red-600 dark:text-red-400">' + escapeHtml(userText) + '</span>') + '</p>' +
          (isCorrect ? '' : '<p class="text-sm mt-1"><strong class="text-gray-500 dark:text-slate-400">正确答案：</strong><span class="text-green-600 dark:text-green-400">' + escapeHtml(correctText) + '</span></p>') +
          (q.explain ? '<p class="text-gray-500 dark:text-slate-400 text-sm mt-2 pt-2 border-t border-gray-100 dark:border-slate-600">' + escapeHtml(q.explain) + '</p>' : '') +
        '</div>'
      );
    }).join('');

    document.getElementById('result-detail').innerHTML = detailHtml;
    document.getElementById('quiz-area').classList.add('hidden');
    document.getElementById('quiz-result').classList.remove('hidden');
  }

  document.getElementById('btn-start-quiz').addEventListener('click', function () {
    loadQuestions().then(function (data) {
      questions = data;
      document.getElementById('total-questions').textContent = data.length;
      document.getElementById('quiz-start').classList.add('hidden');
      document.getElementById('quiz-area').classList.remove('hidden');
      quizState = { index: 0, answers: [] };
      showQuestion();
    }).catch(function () {
      alert('题目加载失败，请刷新重试。');
    });
  });

  document.getElementById('btn-prev').addEventListener('click', function () {
    if (quizState.index > 0) {
      quizState.index--;
      showQuestion();
    }
  });

  document.getElementById('btn-next').addEventListener('click', function () {
    if (quizState.index < questions.length - 1) {
      quizState.index++;
      showQuestion();
    }
  });

  document.getElementById('btn-submit').addEventListener('click', function () {
    showResult();
  });

  document.getElementById('btn-restart').addEventListener('click', function () {
    initQuiz();
    document.getElementById('total-questions').textContent = questions.length;
    document.getElementById('quiz-start').classList.add('hidden');
    document.getElementById('quiz-area').classList.remove('hidden');
    showQuestion();
  });

  // ---------- PWA Service Worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }
})();
