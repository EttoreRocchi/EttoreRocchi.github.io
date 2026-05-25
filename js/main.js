/* ============================================
   Ettore Rocchi - Site JavaScript
   No frameworks. Vanilla JS only.
   ============================================ */

(function () {
  'use strict';

  var html = document.documentElement;
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Shared HTML-escaping helpers used by both the publication and news renderers.
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }

  // ============================================================
  // Dark Mode Toggle
  // ============================================================
  var themeToggle = document.querySelector('.theme-toggle');

  function setTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var current = html.getAttribute('data-theme');
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  if (!html.getAttribute('data-theme')) {
    setTheme('light');
  }

  // ============================================================
  // Mobile Navigation
  // ============================================================
  var hamburger = document.querySelector('.nav-hamburger');
  var navMenu = document.querySelector('.nav-menu');
  var navLinks = document.querySelectorAll('.nav-links a');

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', function () {
      var isOpen = navMenu.classList.toggle('open');
      hamburger.classList.toggle('active');
      hamburger.setAttribute('aria-expanded', isOpen);
    });

    navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        navMenu.classList.remove('open');
        hamburger.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ============================================================
  // Scroll-triggered reveal (fade-in + fade-in-stagger)
  // ============================================================
  var fadeElements = document.querySelectorAll('.fade-in, .fade-in-stagger');

  if ('IntersectionObserver' in window && fadeElements.length) {
    var fadeObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          fadeObserver.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    fadeElements.forEach(function (el) {
      fadeObserver.observe(el);
    });
  } else {
    fadeElements.forEach(function (el) {
      el.classList.add('visible');
    });
  }

  // ============================================================
  // Active Nav Highlighting (home page only, scroll-spy)
  // ============================================================
  var page = document.body.getAttribute('data-page');
  if (page === 'home') {
    var sections = document.querySelectorAll('section[id]');
    var sectionIds = ['about', 'education', 'news', 'collaborations', 'research', 'projects', 'publications', 'contact'];

    if ('IntersectionObserver' in window && sections.length) {
      var navObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var id = entry.target.getAttribute('id');
            if (sectionIds.indexOf(id) === -1) return;
            navLinks.forEach(function (link) {
              link.classList.remove('active');
              var navTarget = link.getAttribute('data-nav');
              if (navTarget === id) {
                link.classList.add('active');
              }
            });
          }
        });
      }, {
        threshold: 0.2,
        rootMargin: '-64px 0px -50% 0px'
      });

      sections.forEach(function (section) {
        navObserver.observe(section);
      });
    }
  }

  // ============================================================
  // Animated <details> - smooth height transitions
  // Hijacks click on <summary> to animate open/close. Falls back
  // to native behaviour if reduced motion is preferred.
  // ============================================================
  function initAnimatedDetails(detailsEl) {
    var summary = detailsEl.querySelector(':scope > summary');
    var content = detailsEl.querySelector(':scope > :not(summary)');
    if (!summary || !content) return;

    summary.addEventListener('click', function (e) {
      if (prefersReducedMotion) return; // native behaviour
      e.preventDefault();

      if (detailsEl.classList.contains('is-animating')) return; // ignore during transition

      var isOpen = detailsEl.open;
      detailsEl.classList.add('is-animating');

      if (isOpen) {
        // CLOSING: measure current height, then animate to 0
        var currentHeight = content.offsetHeight;
        content.style.height = currentHeight + 'px';
        content.style.opacity = '1';
        // Force reflow before transition
        // eslint-disable-next-line no-unused-expressions
        content.offsetHeight;
        requestAnimationFrame(function () {
          content.style.height = '0px';
          content.style.opacity = '0';
        });
        content.addEventListener('transitionend', function onEnd() {
          content.removeEventListener('transitionend', onEnd);
          detailsEl.open = false;
          detailsEl.classList.remove('is-animating');
          content.style.height = '';
          content.style.opacity = '';
        }, { once: true });
      } else {
        // OPENING: set open, measure target height, animate from 0
        detailsEl.open = true;
        var targetHeight = content.offsetHeight;
        content.style.height = '0px';
        content.style.opacity = '0';
        // Force reflow
        // eslint-disable-next-line no-unused-expressions
        content.offsetHeight;
        requestAnimationFrame(function () {
          content.style.height = targetHeight + 'px';
          content.style.opacity = '1';
        });
        content.addEventListener('transitionend', function onEnd() {
          content.removeEventListener('transitionend', onEnd);
          detailsEl.classList.remove('is-animating');
          content.style.height = '';
          content.style.opacity = '';
        }, { once: true });
      }
    });
  }

  document.querySelectorAll('details.bibtex-toggle').forEach(initAnimatedDetails);

  // ============================================================
  // Publications: fetch data/publications.json then render +
  // wire up filter, bibtex download, and animated <details>.
  // ============================================================
  var pubListContainer = document.getElementById('pub-list');
  var pubSearch = document.getElementById('pubSearch');
  var pubSearchClear = document.getElementById('pubSearchClear');
  var pubSearchMeta = document.getElementById('pubSearchMeta');
  var pubEmpty = document.getElementById('pubEmpty');
  var pubEmptyQuery = document.getElementById('pubEmptyQuery');
  var pubEmptyClear = document.getElementById('pubEmptyClear');
  var pubBibDownload = document.getElementById('pubBibDownload');
  var pubBibCount = document.getElementById('pubBibCount');
  var pubError = document.getElementById('pubError');
  var pubErrorRetry = document.getElementById('pubErrorRetry');
  var pubTypeFilter = document.getElementById('pubTypeFilter');
  var pubYearFilter = document.getElementById('pubYearFilter');
  var pubTypeFacet = document.getElementById('pubTypeFacet');
  var pubYearFacet = document.getElementById('pubYearFacet');
  var currentTypeFilter = 'all';  // active type pill selection; "all" = no type filter
  var currentYearFilter = 'all';  // active year pill selection; "all" = no year filter

  if (pubListContainer) {
    loadPublications();
    if (pubErrorRetry) {
      pubErrorRetry.addEventListener('click', loadPublications);
    }
  }

  function loadPublications() {
    if (pubError) pubError.hidden = true;
    fetch('data/publications.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (items) { renderPublications(items); })
      .catch(function () {
        if (pubError) pubError.hidden = false;
        if (pubListContainer) pubListContainer.innerHTML = '';
      });
  }

  function renderPublications(items) {
    if (!items || !items.length) {
      pubListContainer.innerHTML = '<li class="pub-item-empty">No publications found.</li>';
      return;
    }

    var html = items.map(function (pub) {
      var hasOA = !!pub.openaccess;
      var hasDOI = !!pub.doi;
      var hasBib = !!pub.bibtex;

      var bibtexBlock = hasBib
        ? '<details class="bibtex-toggle">'
            + '<summary>BibTeX</summary>'
            + '<div class="bibtex-code">' + escapeHtml(pub.bibtex)
              + '<button class="bibtex-copy" onclick="copyBibtex(this)" aria-label="Copy BibTeX">copy</button>'
            + '</div>'
          + '</details>'
        : '';

      var doiLink = hasDOI
        ? '<a href="https://doi.org/' + escapeAttr(pub.doi) + '" target="_blank" rel="noopener">DOI &#8599;</a>'
        : '';

      return [
        '<li class="pub-item" data-year="' + escapeAttr(pub.year || '') + '" data-type="' + escapeAttr(pub.type || '') + '">',
          '<div class="pub-meta">',
            pub.year    ? '<span class="pub-year">' + escapeHtml(pub.year) + '</span>' : '',
            pub.journal ? '<span class="pub-journal">' + escapeHtml(pub.journal) + '</span>' : '',
            hasOA       ? '<span class="pub-oa">Open Access</span>' : '',
          '</div>',
          '<p class="pub-title">' + escapeHtml(pub.title || '') + '</p>',
          '<p class="pub-authors">' + (pub.authors_html || '') + '</p>',
          (hasDOI || hasBib)
            ? '<div class="pub-links">' + doiLink + bibtexBlock + '</div>'
            : '',
        '</li>'
      ].join('');
    }).join('');

    // Build facet pills (type + year) before wiring up the filter logic
    buildFacet(pubTypeFilter, pubTypeFacet, items, function (p) { return p.type; }, null);
    buildFacet(pubYearFilter, pubYearFacet, items, function (p) { return p.year; }, function (a, b) { return Number(b) - Number(a); });
    currentTypeFilter = 'all';
    currentYearFilter = 'all';

    pubListContainer.classList.remove('pub-list-placeholder');
    pubListContainer.innerHTML = html;

    // Wire up everything that previously assumed a static DOM
    var renderedDetails = pubListContainer.querySelectorAll('details.bibtex-toggle');
    renderedDetails.forEach(initAnimatedDetails);

    initPublicationsFilter();
  }

  // Build a generic facet (pill row) from a list of items.
  // - containerEl: the inner <div> that gets the pill buttons
  // - facetEl:     the outer .pub-facet wrapper (label + container); hidden if <2 keys
  // - getKey:      function(item) -> string key (e.g. p.type, p.year)
  // - sortFn:      optional Array.sort comparator (defaults to alphabetical)
  function buildFacet(containerEl, facetEl, items, getKey, sortFn) {
    if (!containerEl || !facetEl) return;

    var counts = {};
    items.forEach(function (p) {
      var k = getKey(p);
      if (k) counts[k] = (counts[k] || 0) + 1;
    });
    var keys = Object.keys(counts).sort(sortFn || undefined);

    if (keys.length < 2) {
      facetEl.hidden = true;
      containerEl.innerHTML = '';
      return;
    }

    var pillHtml = '<button class="pub-type-pill active" data-value="all" aria-pressed="true">'
                 + 'All <span class="pub-type-pill-count">' + items.length + '</span></button>';
    keys.forEach(function (k) {
      pillHtml += '<button class="pub-type-pill" data-value="' + escapeAttr(k) + '" aria-pressed="false">'
               +  escapeHtml(k)
               +  ' <span class="pub-type-pill-count">' + counts[k] + '</span></button>';
    });

    containerEl.innerHTML = pillHtml;
    facetEl.hidden = false;
  }

  function initPublicationsFilter() {
    if (!pubSearch) return;
    var pubItems = pubListContainer.querySelectorAll('.pub-item');
    if (!pubItems.length) return;

    // Cache lowercase text content + bibtex source + type for each pub-item
    var pubIndex = Array.prototype.map.call(pubItems, function (item) {
      var bibEl = item.querySelector('.bibtex-code');
      // Strip the trailing "copy" button text from the bibtex source.
      var bibSrc = '';
      if (bibEl) {
        var clone = bibEl.cloneNode(true);
        var btn = clone.querySelector('.bibtex-copy');
        if (btn) btn.remove();
        bibSrc = clone.textContent.trim();
      }
      return {
        el: item,
        text: item.textContent.toLowerCase(),
        bib: bibSrc,
        type: item.getAttribute('data-type') || '',
        year: item.getAttribute('data-year') || ''
      };
    });

    function applyFilter(rawQuery) {
      var query = rawQuery.toLowerCase().trim();
      var visible = 0;

      pubIndex.forEach(function (entry) {
        var textMatch = !query || entry.text.indexOf(query) !== -1;
        var typeMatch = currentTypeFilter === 'all' || entry.type === currentTypeFilter;
        var yearMatch = currentYearFilter === 'all' || entry.year === currentYearFilter;
        var match = textMatch && typeMatch && yearMatch;
        entry.el.hidden = !match;
        if (match) visible++;
      });

      var anyFilterActive = !!query || currentTypeFilter !== 'all' || currentYearFilter !== 'all';

      // Toggle empty state (shown whenever a filter is active and nothing matched)
      if (pubEmpty) {
        if (visible === 0 && anyFilterActive) {
          if (pubEmptyQuery) {
            pubEmptyQuery.textContent = query
              ? rawQuery
              : 'type: ' + currentTypeFilter;
          }
          pubEmpty.hidden = false;
        } else {
          pubEmpty.hidden = true;
        }
      }

      // Toggle clear button on the search input (only relevant to text query)
      if (pubSearchClear) {
        pubSearchClear.hidden = !query;
      }

      // Live status message
      if (pubSearchMeta) {
        if (!anyFilterActive) {
          pubSearchMeta.textContent = '';
        } else {
          pubSearchMeta.textContent = visible + (visible === 1 ? ' match' : ' matches');
        }
      }

      // Sync the bib download button with the current filter state
      if (pubBibDownload && pubBibCount) {
        pubBibCount.textContent = String(visible);
        var modeEl = pubBibDownload.querySelector('.pub-bib-mode');
        if (modeEl) modeEl.textContent = anyFilterActive ? 'filtered' : 'all';
        pubBibDownload.disabled = visible === 0;
        pubBibDownload.setAttribute(
          'title',
          anyFilterActive
            ? 'Download the ' + visible + ' filtered publication' + (visible === 1 ? '' : 's') + ' as a .bib file'
            : 'Download all publications as a single .bib file'
        );
      }
    }

    // Pill click handler shared by type + year facets.
    function attachFacet(containerEl, setter) {
      if (!containerEl) return;
      containerEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.pub-type-pill');
        if (!btn) return;
        containerEl.querySelectorAll('.pub-type-pill').forEach(function (b) {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        setter(btn.getAttribute('data-value') || 'all');
        applyFilter(pubSearch.value || '');
      });
    }
    attachFacet(pubTypeFilter, function (v) { currentTypeFilter = v; });
    attachFacet(pubYearFilter, function (v) { currentYearFilter = v; });

    // Bib download: build content from currently visible entries and trigger save
    if (pubBibDownload) {
      pubBibDownload.addEventListener('click', function () {
        var visibleEntries = pubIndex.filter(function (e) { return !e.el.hidden && e.bib; });
        if (!visibleEntries.length) return;

        var query = (pubSearch.value || '').trim();
        var header = [
          '% BibTeX export - Ettore Rocchi',
          '% Generated client-side from the current filter on publications.html',
          query
            ? '% Filter: "' + query + '" - ' + visibleEntries.length + ' entries'
            : '% Full list - ' + visibleEntries.length + ' entries',
          '% Most recent first.',
          ''
        ].join('\n');

        var content = header + '\n' + visibleEntries.map(function (e) { return e.bib; }).join('\n\n') + '\n';
        var blob = new Blob([content], { type: 'application/x-bibtex' });
        var url = URL.createObjectURL(blob);
        var anyFilter = !!query || currentTypeFilter !== 'all';
        var fname = anyFilter
          ? 'ettore-rocchi-publications-filtered.bib'
          : 'ettore-rocchi-publications.bib';

        var a = document.createElement('a');
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    }

    function resetAllFilters() {
      pubSearch.value = '';
      currentTypeFilter = 'all';
      if (pubTypeFilter) {
        pubTypeFilter.querySelectorAll('.pub-type-pill').forEach(function (b) {
          var isAll = b.getAttribute('data-type') === 'all';
          b.classList.toggle('active', isAll);
          b.setAttribute('aria-pressed', String(isAll));
        });
      }
      applyFilter('');
      pubSearch.focus();
    }

    pubSearch.addEventListener('input', function () {
      applyFilter(this.value);
    });

    if (pubSearchClear) {
      pubSearchClear.addEventListener('click', resetAllFilters);
    }

    if (pubEmptyClear) {
      pubEmptyClear.addEventListener('click', resetAllFilters);
    }

    // Sync UI state with the freshly rendered data (bib count, mode, etc.)
    applyFilter('');

    // Keyboard shortcut: '/' focuses the search input
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== pubSearch && !e.ctrlKey && !e.metaKey) {
        var tag = (document.activeElement.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        e.preventDefault();
        pubSearch.focus();
      }
    });
  }

  // ============================================================
  // News feed - render from data/news.json on the home page
  // ============================================================
  var newsContainer = document.getElementById('news-feed');
  if (newsContainer) {
    // data-limit="0" or absent → show all; positive integer → cap.
    var limitAttr = newsContainer.getAttribute('data-limit');
    var newsLimit = limitAttr === null ? Infinity : parseInt(limitAttr, 10);
    if (!newsLimit || newsLimit < 0) newsLimit = Infinity;

    fetch('data/news.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (items) {
        renderNews(items.slice(0, newsLimit));
      })
      .catch(function () {
        newsContainer.innerHTML = '<p class="news-error">News feed unavailable.</p>';
      });

    function renderNews(items) {
      if (!items.length) {
        newsContainer.innerHTML = '<p class="news-empty">No news yet - check back soon.</p>';
        return;
      }

      var typeMeta = {
        paper:      { icon: '📄', label: 'Paper' },
        software:   { icon: '⚙️',  label: 'Software' },
        conference: { icon: '🎓', label: 'Conference' },
        visit:      { icon: '🏛️', label: 'Visit' },
        award:      { icon: '🏆', label: 'Award' },
        default:    { icon: '✨', label: 'Update' }
      };

      var fmtFull  = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      var fmtMonth = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });

      function formatDate(raw) {
        if (!raw) return '';
        // Full date YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          var d = new Date(raw);
          return isNaN(d) ? raw : fmtFull.format(d);
        }
        // Month-precision YYYY-MM
        if (/^\d{4}-\d{2}$/.test(raw)) {
          var parts = raw.split('-');
          var dm = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
          return isNaN(dm) ? raw : fmtMonth.format(dm);
        }
        // Year-only YYYY
        if (/^\d{4}$/.test(raw)) return raw;
        // Fallback: try native parse
        var df = new Date(raw);
        return isNaN(df) ? raw : fmtFull.format(df);
      }

      var html = items.map(function (item, i) {
        var meta = typeMeta[item.type] || typeMeta.default;
        var dateText = formatDate(item.date);
        var titleHtml = item.link
          ? '<a href="' + escapeAttr(item.link) + '" target="_blank" rel="noopener">' + escapeHtml(item.text) + '</a>'
          : escapeHtml(item.text);

        return [
          '<li class="news-item" style="--news-delay:' + (i * 60) + 'ms">',
            '<div class="news-marker" aria-hidden="true">',
              '<span class="news-icon">' + meta.icon + '</span>',
            '</div>',
            '<div class="news-body">',
              '<div class="news-meta">',
                '<span class="news-date">' + escapeHtml(dateText) + '</span>',
                '<span class="news-type news-type-' + escapeAttr(item.type || 'default') + '">' + meta.label + '</span>',
              '</div>',
              '<p class="news-text">' + titleHtml + '</p>',
            '</div>',
          '</li>'
        ].join('');
      }).join('');

      newsContainer.innerHTML = '<ol class="news-list">' + html + '</ol>';

      // Reveal animation
      requestAnimationFrame(function () {
        newsContainer.querySelectorAll('.news-item').forEach(function (el) {
          el.classList.add('news-item-visible');
        });
      });
    }

    // escapeHtml / escapeAttr are defined at the top of the IIFE so both
    // the publication and news renderers can share them.
  }

})();

// ============================================================
// Copy BibTeX (global, used by inline onclick)
// ============================================================
function copyBibtex(button) {
  var codeBlock = button.parentElement;
  var text = codeBlock.textContent.replace(/copy(ied)?$/i, '').trim();
  navigator.clipboard.writeText(text).then(function () {
    button.textContent = 'copied';
    button.classList.add('is-copied');
    setTimeout(function () {
      button.textContent = 'copy';
      button.classList.remove('is-copied');
    }, 2000);
  });
}
